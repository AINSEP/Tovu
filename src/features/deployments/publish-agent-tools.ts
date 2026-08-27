/**
 * @file The static-publish sub-feature's agent-tool catalog + wiring (ADR-049 Decision 4's
 * per-domain split, `static-publish/`'s half — see that directory's `types.ts` header for why it is
 * a separate module tree from this directory's sibling `agent-tools.ts`/`tool-registrations.ts`,
 * which cover the continuous-deployment/export/Dockerfile tools instead).
 *
 * Purpose:
 * Deliberately its OWN file, not folded into the sibling `agent-tools.ts`/`tool-registrations.ts` —
 * that split let a concurrent agent own those two files plus `assistant/tool-registrations.ts`'s
 * wiring pass without colliding with this one. `assistant/tool-registrations.ts` imports this file's
 * catalog (its own `deployments/publish-agent-tools` import) and invokes it alongside every other
 * domain's registrations — see that file's own `static-publish` slice comment for the wired half of
 * this story.
 *
 * Three tools, all wired (2026-08-15, this dispatch — previously only the preview was):
 * - `deployment_preview_static_publish` — read-only, risk `"none"`. Unchanged by this dispatch.
 * - `deployment_get_static_publish_capabilities` — NEW. Read-only, risk `"none"`: reports which
 *   providers have a saved credential (by provider id and label only — never a token, ciphertext, or
 *   masked tail), this install's `executionMode`, and — for a provider that is not ready — a
 *   human-readable reason. Reads through `publish-credentials/store.ts`'s `listPublishCredentials`
 *   (never decrypts — see that function's own "read model only" doc) plus
 *   `PublishCredentialSource.isConfigured()` (the same never-decrypting method the preview handler
 *   below already relies on). NEVER calls `resolveForPublish`/`resolveDefaultForPublish`/
 *   `PublishCredentialSource.resolve()` — enforced structurally here (this handler's own deps give it
 *   no `sealer`-carrying path into `resolveForPublish`, whose signature requires one) and proven by
 *   this file's own test (a fake `credentialSource.resolve` that throws if ever called).
 * - `deployment_execute_static_publish` — NEW as a REACHABLE tool. Publishing is the one operation in
 *   this whole domain that breaks the "plain `mutates-durable-state`, nothing external" pattern this
 *   directory's sibling `agent-tools.ts` documents for its own five tools: it sends the current site's
 *   content to the PUBLIC INTERNET using a credential with WRITE access to the owner's external
 *   account, and the result is immediately live — potentially crawled, cached, or indexed within
 *   seconds. That is irreversible in the sense that matters (a later republish overwrites what is
 *   HOSTED, never what was already public).
 *
 *   This used to be declared with `actorClassRule: "confirmer-must-equal-own-delegatedBy"` and
 *   deliberately left unwired, on the same reasoning `recovery/agent-tools.ts` still gives for
 *   `backup_execute_restore` and `database/agent-tools.ts` for
 *   `database_execute_migrate_forward`: `@jini-ai/cms/core`'s
 *   `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` refuses to build any tool carrying that rule
 *   until a real `ExecutionDelegate`-backed confirmation transport exists, and `agent-daemon-server.ts`
 *   builds `createToolExecutor({registry})` with none. That is still true today — nothing about this
 *   dispatch changes it, and the rule/gate stays exactly as strict for those other two tools.
 *
 *   What changed is that this domain does NOT need that transport at all: `content_post_delete`
 *   (`features/post/tool-registrations.ts`) already proved a working confirmation gate exists that
 *   needs no `ExecutionDelegate` — the MCP-UI held-open surface exchange (ADR-055 Decisions 1/2,
 *   `assistant/surface-exchanges.ts`). The model's ONE call to `deployment_execute_static_publish`
 *   opens an exchange, renders a confirmation dialog naming exactly what will be published and where,
 *   and PARKS on `ctx.emitSurface` until a human answers through
 *   `mcp-ui-tool-calls-route.ts` (added to that route's `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist in
 *   `assistant/mcp-ui-tool-calls.ts` as part of this change) — no `ExecutionDelegate`,
 *   `descriptor.requiresConfirmation`, or `resumeConfirmation` involved anywhere. So this tool
 *   deliberately carries NO `actorClassRule` (mirrors `content_post_delete`'s own catalog entry: "the
 *   absence... is on purpose" — declaring the rule here would, correctly, fail the build for a
 *   transport this tool does not use).
 *
 *   The credential itself is still never agent-visible: the model's call carries only
 *   `{target, projectName, ...target-specific fields}` — no token field exists in the schema — and the
 *   real credential is resolved server-side, only after a human confirms, by
 *   `static-publish/adapter.ts`'s `publishStaticSite` (the SAME function `server/routes/admin/system/
 *   publish-site.ts`'s human-session route already calls), from the SAME `PublishCredentialSource`
 *   the preview/capabilities tools only ever ask `isConfigured()` of.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes the catalog below to decide which tool names an
 * agent session may see at all; `requireToolPermission` enforces the actual permission check at call
 * time. `deployment_execute_static_publish` additionally never even raises its confirmation dialog for
 * a provider with no configured credential (checked via the same non-decrypting `isConfigured()` the
 * other two tools use) — a dialog a human could only ever see to be told "this can't work" wastes
 * their attention.
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic (agent-tool layer). `publishStaticSite` needs a
 * real `exportSite` pass immediately before publishing, but (2026-08-20 RouteDeps-narrowing fix) this
 * file no longer crosses into `#src/server/routes/types`'s `RouteDeps` to get one — see
 * `StaticPublishToolDeps`'s own doc below for why a pre-bound `exportSiteBound` field replaces that
 * crossing, the same fix this directory's sibling `tool-registrations.ts` and
 * `features/source-control/commit-site.ts` apply for the identical shape of problem. No dependency on
 * this directory's sibling `agent-tools.ts`/`tool-registrations.ts`/`ports.ts`/`types.ts`.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { buildConfirmationSurface, buildFormSurface, buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

// TYPE-ONLY — fully erased at compile time, so this creates no runtime require() and cannot recreate
// the circular-load crash a VALUE import of `#src/export/index` caused inside `export-run.ts` and
// (via `static-publish/adapter.ts`'s own former `exportSiteLazily`) inside this feature's own preview
// tool wiring — see `adapter.ts`'s header for that trace. `ExportReport` is needed here only to type
// {@link ExportSiteBoundFn}'s return value — see that type's own doc for why this file declares its
// own copy rather than naming `RouteDeps` (2026-08-20 RouteDeps-narrowing fix).
import type { ExportReport } from "#src/export/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { PublishCredentialSetRepoPort, PublishExecutionMode } from "./publish-credentials/index.js";
import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js";

import { registerToolContributor } from "#src/assistant/index";

import { askOnce, askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceExchange, type SurfaceMessage } from "../../contracts/core/tool-surface-exchanges.js";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`tool-surface-exchanges.ts` re-exports the
// functions that use it, but not the type) — imported directly here so the extracted
// `mapPublishOutcomeToToolResult`/`buildAlreadyRunningResult`/`handlePublishConfirmationAnswer`
// helpers below can name their own `askThenReport`-shaped return type explicitly.
import type { SurfaceEmission } from "@jini-ai/core";
import { listPublishCredentials, type PublishCredentialReadDeps } from "./publish-credentials/index.js";
import { S3_COMPATIBLE_FIELD_GUIDANCE, S3_COMPATIBLE_FORM_DESCRIPTION } from "./publish-credentials/s3-compatible-field-guidance.js";
// Phase 3 cutover (this dispatch) — `vendor_credential_sets` is the eventual replacement for THIS
// file's own `publish_credential_sets` reads/writes (see `vendor-credentials/index.ts`'s own header).
// Deliberately NO VALUE import of any kind from `../vendor-credentials/**` here — an earlier revision
// imported `createVendorCredential`/`listVendorCredentials`/`updateVendorCredential`/
// `PUBLISH_PROVIDER_TO_VENDOR` directly, which closed a real `features/deployments <->
// features/vendor-credentials` module cycle (`vendor-credentials/dual-read.ts` already imports back
// into `publish-credentials/store.ts` for its own temporary legacy-fallback — see that file's header).
// `VendorCredentialPort` below is this domain's own narrow, LOCALLY-declared structural stand-in for
// that store's read/write contract — same discipline this file's sibling `tool-registrations.ts`
// documents for `RouteDeps` narrowing, extended to a cross-FEATURE edge instead of a cross-LAYER one.
// The real implementations are wired in by `assistant/tool-registrations.ts`'s
// `buildAssistantToolRegistrations` (the one file already documented as "the one place that
// genuinely needs to see every domain at once") via `StaticPublishToolDeps.vendorCredentials` below —
// never imported here.
//
// The `VendorCredentialSetRepoPort` TYPE-only import above (line ~105) is new (2026-08-20
// RouteDeps-narrowing fix) and does NOT reopen that cycle — verified, not assumed: a type-only edge
// is erased at compile time, so `development/scripts/check-architecture.ts`'s module-cycle/SCC metric
// (which is explicitly computed on the runtime-only graph, dropping every `import type` edge — see
// that script's own `Baseline.moduleCycles` doc) cannot see it at all. Confirmed empirically:
// `check:architecture --list` reports 0 module cycles / largest SCC 0 with this import in place, same
// as before it. This was tried in preference to hand-mirroring `VendorCredentialSetRepoPort`'s shape
// locally (the way `VendorCredentialSummaryLike` below still does, since THAT type has no real
// counterpart safe to import) — a hand-copied port with no compile-time link to the real one drifts
// silently, and the real type was available at zero verified cost once the value-import cycle above
// was already closed by a different fix.
import {
  composePublishCredentialSource,
  computeBasePath,
  getPublishRunSnapshot,
  runPublishAndAwait,
  validateStaticPublishConfig,
  type PublishCredentialSource,
  type PublishCredentialVerificationCache,
  type PublishHistoryStore,
  type StaticPublishConfig,
  type StaticPublishDeps,
  type StaticPublishOutcome,
  type StaticPublishTargetId,
} from "./static-publish/index.js";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — parameterless read tool. Matches `agent-tools.ts`'s own `NO_INPUT_SCHEMA` exactly;
 *  declared separately here rather than imported from that sibling file, per this file's own
 *  "no dependency on agent-tools.ts" architectural rule (this file's header). */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/**
 * Builds `deployment_get_static_publish_capabilities`'s per-provider `guidance` string — extracted
 * from that handler's own `providers.map()` purely for readability (the four cases read as one flat
 * decision this way rather than a nested ternary inline). `undefined` means "nothing to tell the
 * human" (the provider is fully ready).
 *
 * The `"invalid"` and `"unreachable"` branches are deliberately worded differently, per code review:
 * an `"invalid"` credential (the provider affirmatively rejected it) tells the human to fix it;
 * an `"unreachable"` one (a network failure/timeout/5xx during the last check — says NOTHING about
 * whether the credential itself is good) must never suggest replacing a possibly-fine credential
 * over what may have been a transient blip. Collapsing the two into one "update it" message would
 * risk sending someone to regenerate a working token — the same false-negative shape Defect A (this
 * same finding session) was filed for, one layer up.
 *
 * @complexity O(1) — fixed string interpolation, no iteration.
 * @overallScore 100
 */
function buildCapabilityGuidance(
  providerId: string,
  readiness: { configured: true } | { configured: false; reason: string },
  verification: { status: "valid" | "invalid" | "unreachable"; checkedAt: string; message: string } | undefined
): string | undefined {
  if (!readiness.configured) return readiness.reason;
  if (verification === undefined) {
    return `This ${providerId} credential is saved but has not been verified against ${providerId} yet — verify it in the Static Site tab before relying on it.`;
  }
  if (verification.status === "invalid") {
    return `The saved ${providerId} credential was rejected by ${providerId} (checked ${verification.checkedAt}): ${verification.message} Update it in the Static Site tab.`;
  }
  if (verification.status === "unreachable") {
    return `The last check of this ${providerId} credential could not reach ${providerId} (checked ${verification.checkedAt}): ${verification.message} This does not mean the credential is bad — try verifying again in the Static Site tab.`;
  }
  return undefined;
}

/** Every provider this feature can publish to or save a credential for — the fixed iteration order
 *  `deployment_get_static_publish_capabilities` reports in. Sourced from `StaticPublishTargetId`'s own
 *  4-member union (`static-publish/types.ts`) rather than re-declared, so a fifth target added there
 *  cannot silently go unreported here without a compile error at this array's own type annotation. */
const PROVIDER_IDS: readonly StaticPublishTargetId[] = ["github-pages", "vercel", "netlify", "cloudflare-pages", "s3-compatible"];

/** `deployment_preview_static_publish`'s input — the same target-discriminated shape
 *  `publish-site.ts`'s trigger route body uses, minus `projectName` (a preview never runs a real
 *  publish, so there is no commit-message/project-name label to validate). Reused (spread) by
 *  {@link EXECUTE_STATIC_PUBLISH_SCHEMA} below, which adds the one field a real publish needs. */
const PREVIEW_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target"],
  properties: {
    target: {
      type: "string",
      enum: ["github-pages", "vercel", "netlify", "cloudflare-pages", "s3-compatible"],
      description:
        "Which host to preview publishing to. 'github-pages' publishes to the gh-pages branch of a GitHub repo and serves from a /<repo> subpath (a GitHub Pages PROJECT site) — the exported site's base path is always rewritten to match, automatically. 'vercel'/'netlify'/'cloudflare-pages'/'s3-compatible' all serve from the domain root and must NOT carry a base path. 's3-compatible' is the 'Custom' tab's S3-compatible protocol (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO, ...) — it takes no target-specific field here (endpoint/region/bucket/public URL all live on the saved credential, configured via deployment_propose_custom_provider_credential), and it is meaningfully more setup work than the other four: a bucket, a public-hosting/CDN step in front of it, and a scoped access key, not just one token.",
    },
    owner: {
      type: "string",
      description:
        "GitHub owner or organization login. Required (and only used) when target is 'github-pages'. Do NOT guess this from the human's name, email address, or any other unrelated context — call deployment_get_static_publish_capabilities first: a github-pages credential that has been verified reports the real account's login as that provider's accountLabel. Default to accountLabel when it is present, and still confirm the owner with the human before publishing rather than assuming it silently — a saved token's account is not always the same as who is asking, and a wrong owner publishes to a repo the human may not even control. If accountLabel is null, the account is genuinely UNKNOWN — say so plainly and ask the human directly ('what GitHub username or org should this publish to?'). Never soften that question with an illustrative example, placeholder, or 'e.g. <name>' value of any kind: this tool has no way to know whether a made-up-looking example happens to match a real account, and offering one is exactly how the original version of this bug reproduced (an invented username was read back as a real suggestion and published to a repo nobody owns).",
    },
    repo: {
      type: "string",
      description:
        "GitHub repository name. Required (and only used) when target is 'github-pages' — this also determines the base path (/<repo>) every published link will be rewritten to use, so it must exactly match the real repo name.",
    },
    branch: {
      type: "string",
      description: "GitHub Pages publish branch. Optional; defaults to 'gh-pages' if omitted. Only used when target is 'github-pages'.",
    },
    teamId: {
      type: "string",
      description: "Vercel team id. Optional; only used when target is 'vercel'.",
    },
  },
} as const;

/** `deployment_execute_static_publish`'s input — {@link PREVIEW_STATIC_PUBLISH_SCHEMA}'s fields plus
 *  `projectName`, the one field a real publish needs that a preview does not. Deliberately carries NO
 *  token/credential field of any kind — see this file's header for why that is structural, not just
 *  undocumented. */
const EXECUTE_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target", "projectName"],
  properties: {
    ...PREVIEW_STATIC_PUBLISH_SCHEMA.properties,
    projectName: {
      type: "string",
      description:
        "Human-facing label for this publish run — becomes the GitHub commit message subject, or the Vercel/Netlify/Cloudflare Pages project-name seed. 1-200 characters.",
    },
  },
} as const;

/** Non-secret pre-fill fields `deployment_propose_custom_provider_credential` accepts — mirrors
 *  `deployment_execute_static_publish`'s own "no token/credential field of any kind" structural
 *  guarantee (this file's header, and spec §6c): there is no `accessKeyId`/`secretAccessKey` key in
 *  this schema for the model to fill in, correctly or otherwise. `protocol` is the only required
 *  field, and only one value exists today. */
const PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["protocol"],
  properties: {
    protocol: {
      type: "string",
      enum: ["s3-compatible"],
      description: "The 'Custom' tab protocol to save a connection for. Only 's3-compatible' exists today.",
    },
    endpoint: { type: "string", description: "Optional pre-fill hint for the form's Endpoint field, e.g. from earlier in the conversation. Non-secret. The human can change or clear it before submitting — this is a starting point, never a commitment." },
    region: { type: "string", description: "Optional pre-fill hint for Region. Non-secret." },
    bucket: { type: "string", description: "Optional pre-fill hint for Bucket. Non-secret." },
    publicUrl: { type: "string", description: "Optional pre-fill hint for Public URL. Non-secret." },
  },
} as const;

/** `deployment_generate_bucket_hosting_setup`'s input — a plain read, same non-secret shape as the
 *  propose-credential tool's own pre-fill fields (spec §3a: "may be called before a credential is even
 *  saved... or after"). */
const GENERATE_BUCKET_HOSTING_SETUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["protocol", "bucket", "region"],
  properties: {
    protocol: { type: "string", enum: ["s3-compatible"], description: "The 'Custom' tab protocol to generate hosting-setup steps for. Only 's3-compatible' exists today." },
    bucket: { type: "string", description: "The exact bucket name — substituted verbatim into the returned policy JSON, so it must match the real bucket." },
    region: { type: "string", description: "The bucket's region, as entered on the credential form." },
    endpoint: { type: "string", description: "Optional — the storage endpoint. Used ONLY to infer which provider's steps to return (Cloudflare R2 / Backblaze B2 / DigitalOcean Spaces / Wasabi / plain AWS S3); blank is read as plain AWS S3, matching the credential form's own convention." },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog. All five entries are wired — see this file's header for
 * why `deployment_execute_static_publish` (destructive/irreversible) needs no `actorClassRule` despite
 * that, and why `deployment_propose_custom_provider_credential` needs the identical reasoning for its
 * own write.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const staticPublishAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "deployment_preview_static_publish",
    description:
      "Previews publishing the current site to GitHub Pages, Vercel, Netlify, or Cloudflare Pages WITHOUT publishing anything: validates the target config, reports the base path a real publish would use (always /<repo> for github-pages, never set for the other three — this is computed automatically and cannot be overridden, so it can never mismatch the export), and reports whether a publish credential is configured for that target (true/false only — never the credential itself). Use this before telling a human what a publish would do, or to check readiness. This tool NEVER publishes, writes, or sends anything anywhere — it is a pure read.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: PREVIEW_STATIC_PUBLISH_SCHEMA,
  },
  {
    name: "deployment_get_static_publish_capabilities",
    description:
      "Reports live publish readiness for all five static-publish targets (github-pages, vercel, netlify, cloudflare-pages, s3-compatible) WITHOUT decrypting or exposing any credential: for each provider, whether it is ready to publish to right now (ready is true ONLY when a credential is saved AND it was last verified to actually work against the real provider — a saved-but-unverified or saved-but-failing credential is reported as NOT ready, distinctly from no credential at all), credentialConfigured (true iff a credential row/env var exists at all for this provider — this is the field that answers 'is anything saved', kept deliberately separate from verified/accountLabel below: credentialConfigured:true with accountLabel:null means a credential EXISTS but its account identity is not yet known — never verified, or a verify that has not run since — which is a completely different situation from credentialConfigured:false, where nothing is saved for this provider at all and the human needs to add one before anything else is possible), every named credential set saved for it (id, label, isDefault, createdAt, updatedAt, tokenTail — tokenTail is the LAST 4 CHARACTERS ONLY of that credential's token or secret access key, held in the clear specifically so it can be shown to a human as a short identifier like '••••ab12' when they have more than one saved connection for a provider and need to tell them apart; it is NEVER the full token, a longer fragment, or any ciphertext, and it is null for a credential this workspace has not yet migrated onto this feature's newer unified credential table, since deriving a tail for one of those would require decrypting it and this tool never decrypts anything), the cached verification state (verified: 'valid' | 'invalid' | 'unreachable' | null, and verifiedAt — null means configured but never verified; 'unreachable' means the last check could not reach the provider due to a network issue and does NOT mean the credential is bad, distinctly from 'invalid', which means the provider itself rejected it; this is a CACHED result from the last time a human verified it, possibly stale, never a live check made by this call), accountLabel (the verified credential's own public account login/username — GitHub's real login, Vercel's real username — or null when not yet verified, or for a provider with no such field to report; NEVER an email, plan, or org — use this as the default 'owner' for a github-pages publish instead of guessing one from the human's name or email address, and still confirm it with the human before publishing; when accountLabel is null, say plainly that the account is not known yet and ask the human directly — NEVER offer an example, placeholder, or 'e.g. <name>' value to illustrate the answer, even a made-up-looking one, since this tool has no way to know whether it happens to match a real account and offering one is exactly how the original version of this bug reproduced), lastPublish (the last successful publish to this provider from this server — target, url, reachable, status, projectName, publishedAt, and for github-pages also owner/repo/basePath — or null if this provider has never been published to from here; when the human asks to 'publish again' or 'publish the same way as last time', use this to resolve owner/repo/projectName without asking, and report the previous url when relevant), and — for a provider that is NOT ready — a human-readable reason naming what is missing or wrong (e.g. no credential saved for this workspace, a required field such as Cloudflare Pages' account id is not configured, the credential has never been verified yet, it was rejected by the provider, or the last check could not reach the provider). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). If a provider is not ready: for github-pages/vercel/netlify/cloudflare-pages, tell the human to add or fix that provider's credential themselves in the admin's Static Site tab (Deployment panel → Static Site → Publish), which saves it encrypted server-side and never shows it to you. For s3-compatible specifically, you can instead offer to help right here in chat — call deployment_propose_custom_provider_credential, which shows the human an editable form to fill in (you never see or handle the secret fields).",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "deployment_execute_static_publish",
    description:
      "Publishes the current site as a FRESH static export to GitHub Pages, Vercel, Netlify, Cloudflare Pages, or a Custom S3-compatible host, using the workspace's own SAVED credential for that provider (configured by a human in the admin's Static Site/Custom tab — this tool takes no token/credential field of any kind; do not attempt to supply one). HUMAN-GATED: call it with just { target, projectName, ...any target-specific fields — see deployment_preview_static_publish's schema for those }. This ONE call shows an interactive confirmation dialog naming exactly what will be published and to where, and WAITS: it does not return until the human answers or the dialog times out. There is no second call to make, and no confirmation token to invent or pass. If the human clicks Publish, THIS SAME CALL runs the publish and returns { published: true, reachable: true, target, url, status, basePath? } for a full, confirmed-live success. For an S3-compatible bucket specifically, uploading can succeed while the public URL is not YET confirmed reachable (a bucket needs public hosting/CDN configured in front of it as a separate step — see deployment_generate_bucket_hosting_setup) — that honest partial outcome returns { published: true, reachable: false, target, url, status, message, basePath? }: the files DID upload, but do not tell the user the site is live until reachable is true. If they click Cancel, it returns { published: false, cancelled: true }. If nobody answers before the dialog expires (or the run ends first), it returns { published: false, cancelled: false, reason: 'expired' | 'abandoned' }. If no credential is configured yet for the requested provider, this returns { published: false, reason: 'no-credential', message } — naming the provider and pointing to the right tab — WITHOUT ever raising a dialog (call deployment_get_static_publish_capabilities first to check readiness and avoid this). Every other failure — a saved Cloudflare Pages credential missing its account id, a rejected provider API call, an export failure — is returned as { published: false, code, message } with an actionable message describing what went wrong; it never echoes a credential or a raw provider response body. The result is immediately LIVE on the public internet the moment it returns published:true AND reachable:true, and may be crawled, cached, or indexed within seconds — irreversible in the sense that matters, since a later republish overwrites what is HOSTED but can never retract what was already public. Simply wait for the result and report the true outcome to the user — do not tell them a dialog is open and stop, and do not re-call this tool while a call is already pending (a fresh call raises a second, separate dialog rather than answering the first).",
    // Genuinely destructive in the sense that matters for this domain (sends content to the public
    // internet with a write-scoped external credential) — classified accordingly, and cross-checked
    // against `staticPublishDerivedRisk` below at build time (`assertToolIsWirable`) so this
    // declaration cannot quietly soften itself. Deliberately carries NO `actorClassRule` — see this
    // file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "deployments.publish" },
    inputSchema: EXECUTE_STATIC_PUBLISH_SCHEMA,
  },
  {
    name: "deployment_propose_custom_provider_credential",
    description:
      "Saves a connection for the 'Custom' tab's S3-compatible protocol (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO, ...). Before calling this, or while explaining it, tell the human up front that S3-compatible is meaningfully more setup than Vercel/Netlify/GitHub Pages/Cloudflare Pages — it is three real pieces of work, not one form: (1) create a bucket in their provider's console first, Tovu does not create it for them, (2) set up public access or hosting in front of it — call deployment_generate_bucket_hosting_setup to generate the exact steps and policy for their bucket, which they apply themselves in their own provider console, and (3) create an access key scoped to just that one bucket, not an account-wide key. HUMAN-GATED, same shape as deployment_execute_static_publish: call it with just { protocol: 's3-compatible', ...any non-secret pre-fill hints you already know from the conversation — endpoint/region/bucket/publicUrl, all optional }. This ONE call shows an editable form for the human to fill in (including the two secret fields, Access Key ID and Secret Access Key, which THIS SCHEMA HAS NO FIELD FOR — you cannot supply, see, or guess them, and must never ask the human to paste them into chat instead of the form) and WAITS: it does not return until the human submits or cancels, or the form times out. It returns { saved: true, providerId: 's3-compatible', connected: true } on a successful save, { saved: false, cancelled: true } if the human cancels, { saved: false, cancelled: false, reason: 'expired' | 'abandoned' } if nobody answered, or { saved: false, cancelled: false, reason: 'invalid', message } if the human submitted something incomplete (message names which field, never its value). It never echoes any field value, secret or otherwise, back to you. Do not re-call this tool while a call is already pending.",
    // Same category as `deployment_execute_static_publish`'s own write (real, external-account-scoped
    // consequence) but narrower in blast radius (one credential row, not a live publish) — see this
    // file's header for the full reasoning on why this is neither the excluded generic-settings-write
    // category nor `settings_set_ui_preference`'s narrow-safe-key category, but a third one this MCP-UI
    // held-open exchange mechanism already covers.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "deployments.credentials.write" },
    inputSchema: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_SCHEMA,
  },
  {
    name: "deployment_generate_bucket_hosting_setup",
    description:
      "Generates the exact steps (and, where applicable, the exact bucket policy JSON with the real bucket name substituted in) to make an S3-compatible bucket servable as a public website — Tovu composes this, but NEVER applies it: the human reviews and applies it themselves in their own already-privileged provider console. This is a PURE READ — it writes nothing, calls no write API, and does not require a saved credential to exist yet (call it before or after deployment_propose_custom_provider_credential). Relay the returned 'steps' as prose plus copyable code blocks for any 'consoleJson' present, and relay 'warning' verbatim if present — for Cloudflare R2 and DigitalOcean Spaces specifically, that warning states the human needs a DIFFERENT credential (their Cloudflare/DigitalOcean account login) for this particular step, not the S3-compatible access key they saved — say so plainly rather than letting them hunt for a field on the Custom tab that does not exist.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: GENERATE_BUCKET_HOSTING_SETUP_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById(staticPublishAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, independent of the catalog's `sideEffects`
 * declaration (`@jini-ai/cms/core`'s `assertToolIsWirable` cross-checks the two and refuses to wire
 * on disagreement).
 */
export const staticPublishDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> resolves credential presence (`PublishCredentialSource.isConfigured`, read-only) and validates
  // config shape (`validateStaticPublishConfig`, pure). No filesystem write, no network call, no
  // export run — a preview never calls `publishStaticSite` at all.
  ["deployment_preview_static_publish", "none"],
  // -> `listPublishCredentials` (a pure DB read, never decrypts — `publish-credentials/store.ts`'s own
  // doc) plus `PublishCredentialSource.isConfigured` per provider (same non-decrypting contract the
  // preview tool relies on). No write, no decrypt, no network call.
  ["deployment_get_static_publish_capabilities", "none"],
  // -> on confirm, calls `publishStaticSite`: a real `exportSite` pass plus a real provider API call
  // (GitHub/Vercel/Netlify/Cloudflare Pages) using a write-scoped credential — genuinely mutates
  // external durable state. See this file's header for the full risk story.
  ["deployment_execute_static_publish", "mutates-durable-state"],
  // -> on submit, calls `createVendorCredential`/`updateVendorCredential` — a real encrypted write to
  // `vendor_credential_sets` (Phase 3 cutover, this dispatch — previously `publish_credential_sets`).
  // No secret ever transits the model (see this file's header/the catalog entry's own comment); the
  // write itself is still a genuine external-account-scoped mutation, same category (not merely "some
  // risk classification") as the publish tool above.
  ["deployment_propose_custom_provider_credential", "mutates-durable-state"],
  // -> composes prose/JSON from fixed templates plus the caller-supplied bucket/region/endpoint
  // (never a saved secret — this handler never reads a credential at all, saved or otherwise). No
  // repo write, no command gateway, no outbox, no network call, no decrypt.
  ["deployment_generate_bucket_hosting_setup", "none"],
]);

/**
 * This domain's own read model for one `vendor_credential_sets` row — a hand-written structural
 * mirror of `vendor-credentials/store.ts`'s `VendorCredentialSetSummary`, loosened from that type's
 * own 7-member `VendorId` union to plain `string` (this file only ever compares it against its OWN
 * `StaticPublishTargetId`-derived vendor ids, never constructs one — narrowing costs nothing here and
 * buys the zero-import property below). See the module-level comment above this file's now-absent
 * `vendor-credentials` import for why this exists as a duplicate rather than an imported type.
 */
interface VendorCredentialSummaryLike {
  readonly id: string;
  readonly vendorId: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly tokenTail: string;
  readonly accountLabel: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Structural stand-ins for `vendor-credentials/store.ts`'s own `VendorCredentialReadDeps`/
 * `VendorCredentialWriteDeps`. 2026-08-20 RouteDeps-narrowing fix: these used to be an indexed-access
 * off `RouteDeps` itself (`RouteDeps["vendorCredentialSetRepo"]` etc.) — that still worked structurally
 * (an indexed-access type is not, by itself, a runtime edge), but it kept this file's `StaticPublishToolDeps`
 * from ever dropping its `extends RouteDeps`, since every field here was DERIVED from that name. Typed
 * directly against the underlying port types instead (`VendorCredentialSetRepoPort`/`SecretSealerPort`/
 * `KeyringPort`, all already imported by this file for other reasons — see the import block above), the
 * same "narrow domain ports, never the god type" discipline `comments/tool-registrations.ts`'s
 * `CommentsToolDeps` already establishes.
 */
type VendorCredentialReadDepsLike = { repo: VendorCredentialSetRepoPort };
type VendorCredentialWriteDepsLike = {
  repo: VendorCredentialSetRepoPort;
  sealer: SecretSealerPort;
  keyring?: KeyringPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
};

/**
 * This domain's narrow, LOCALLY-typed port onto `vendor-credentials/store.ts`'s CRUD contract —
 * carries no import from `features/vendor-credentials` (see the module-level comment above this
 * file's import block). `label`/`connection`/`isDefault` stay `unknown` deliberately, mirroring the
 * real functions' own deliberately-loose validate-at-the-boundary contract
 * (`CreateVendorCredentialInput`/`UpdateVendorCredentialInput`'s own doc) — this port does not
 * pre-validate, the real `createVendorCredential`/`updateVendorCredential` implementation wired in at
 * the composition root does.
 *
 * Injected via `StaticPublishToolDeps.vendorCredentials`, wired to the real implementation ONLY by
 * `assistant/tool-registrations.ts`'s `buildAssistantToolRegistrations` — never by this file. Unset
 * (`undefined`) is a wiring bug, not a "fall back to legacy-only" case: {@link requireVendorCredentialPort}
 * throws rather than silently degrading, matching `commit-site.ts`'s own "no adapter configured — this
 * is a wiring bug" precedent for the identical shape of problem.
 */
export interface VendorCredentialPort {
  list(deps: VendorCredentialReadDepsLike, input: { workspaceId: string }): Promise<VendorCredentialSummaryLike[]>;
  create(deps: VendorCredentialWriteDepsLike, input: { workspaceId: string; label: unknown; connection: unknown; isDefault?: unknown }): Promise<VendorCredentialSummaryLike>;
  update(deps: VendorCredentialWriteDepsLike, input: { workspaceId: string; id: string; label?: unknown; connection?: unknown; isDefault?: unknown }): Promise<VendorCredentialSummaryLike>;
  /** `publish_credential_sets.provider_id` -> `VendorId` (loosened to `string`, same reasoning
   *  {@link VendorCredentialSummaryLike} gives for its own `vendorId` field). Exhaustive over every
   *  `StaticPublishTargetId` in production (`vendor-credentials/types.ts`'s own `PUBLISH_PROVIDER_TO_
   *  VENDOR`, wired in at the composition root) — not enforced at this narrowed type's own level,
   *  since doing so would require importing `StaticPublishTargetId`'s full union here, which this
   *  file already does for other reasons (see below), so `Record<StaticPublishTargetId, string>` IS
   *  exhaustive after all with no extra import cost.
   */
  providerToVendor: Readonly<Record<StaticPublishTargetId, string>>;
}

/**
 * The composition-root-bound export call this domain takes instead of `RouteDeps` itself (2026-08-20
 * RouteDeps-narrowing fix — see `static-publish/adapter.ts`'s identical copy, `commit-site.ts`'s
 * original fix, and `server/routes/types.ts`'s `RouteDeps.exportSiteBound` doc for the full design
 * rationale). Declared locally, never imported from either of those two files — same "duplicate the
 * tiny type, never share across features/files" convention `commit-site.ts`'s own doc establishes.
 */
type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;

/**
 * The exact slice of the route-deps bag this domain's tool handlers read, declared structurally
 * instead of naming `RouteDeps` (2026-08-20 RouteDeps-narrowing fix, superseding `b6144774`'s
 * config-only attempt — see `ADS-memory/reports/2026-08-19-architecture-step2-boundary-closure.md`
 * and its 2026-08-20 follow-up report for the full history). This file's previous revision `extends
 * RouteDeps` outright on the grounds that `deployment_execute_static_publish`'s confirmed path calls
 * `publishStaticSite`, which needs the FULL composition-root bag to run a real `exportSite` pass —
 * that reasoning about `publishStaticSite`'s own requirement was correct, but it does not follow that
 * THIS interface has to name `RouteDeps` to satisfy it. `exportSiteBound` below is the fix: a
 * pre-bound export call, closed over the full `RouteDeps` at the composition root (`server/app.ts`/
 * `server/deps.ts`), threaded down as one narrow field instead of the whole bag — see
 * {@link ExportSiteBoundFn}'s own doc immediately above. `server/routes/*`/`agent-daemon-server.ts`
 * satisfy this structurally by passing their existing `RouteDeps` object (which now also carries
 * `exportSiteBound`); nothing there changes.
 *
 * Every other field below is a direct port type (never an indexed-access off `RouteDeps`) — see
 * `VendorCredentialReadDepsLike`/`VendorCredentialWriteDepsLike`'s own doc above for why that
 * distinction matters even though an indexed-access type alone was not itself a dependency-cruiser
 * edge.
 */
export interface StaticPublishToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly idGen: { newId(): string };
  readonly publishCredentialSetRepo: PublishCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly siteAssistantSecretKeyring: KeyringPort;
  readonly publishExecutionMode: PublishExecutionMode;
  readonly publishHistoryStore: PublishHistoryStore;
  readonly publishCredentialVerificationCache: PublishCredentialVerificationCache;
  readonly vendorCredentialSetRepo: VendorCredentialSetRepoPort;
  /** `RouteDeps.publishOutputRootDir`, threaded down for the same reason `exportSiteBound` above is —
   *  `publishStaticSite`'s `StaticPublishInput.publishOutputRootDir` needs it directly. */
  readonly publishOutputRootDir: string;
  /** The pre-bound export call — see {@link ExportSiteBoundFn}'s own doc above for what it is and why
   *  it replaces the `routeDeps: RouteDeps` field this interface used to carry (via `extends RouteDeps`). */
  readonly exportSiteBound: ExportSiteBoundFn;
  /** Test-only override — when supplied, replaces the composed `PublishCredentialSource` entirely
   *  (DB-backed + env-fallback composition, `publishCredentialSetRepo`/`siteAssistantSecretSealer`/
   *  `publishExecutionMode` are all ignored). Production never sets this. */
  credentialSource?: PublishCredentialSource;
  /** Test-only override for `publishStaticSite`'s own `StaticPublishDeps.buildTarget` — lets a test
   *  substitute a fake `DeployTarget` so `deployment_execute_static_publish`'s CONFIRMED path can be
   *  exercised end-to-end without ever constructing a real GitHub/Vercel/Netlify/Cloudflare Pages
   *  client or touching `fetch` (mirrors `static-publish/adapter.ts`'s own test-injection seam,
   *  "adapter tests with a faked deploy target — do not hit real providers in tests"). Production
   *  never sets this — `publishStaticSite`'s own default (the real Jini adapters) applies. */
  buildTarget?: StaticPublishDeps["buildTarget"];
  /** Test-only override for `RouteDeps.publishHistoryStore` (2026-08-16 rework — that field is now
   *  the real, DB-backed `SqlitePublishHistoryStore` in production; see `routes/types.ts`'s own doc)
   *  — lets a test inject an `InMemoryPublishHistoryStore` so it can assert on a recorded publish (or
   *  a capabilities read) without touching a real database. Passed straight through to
   *  `runPublishAndAwait` on a confirmed publish AND used by the capabilities handler's own read, so a
   *  test sees one consistent store on both sides. Production never sets this; both paths fall back to
   *  `deps.publishHistoryStore`, so a real publish's history is visible to this tool with no wiring
   *  change outside this domain (see `publish-run.ts`'s header, "Publish history"). */
  historyStore?: PublishHistoryStore;
  /** Injected implementation of `vendor-credentials/store.ts`'s CRUD contract — see
   *  {@link VendorCredentialPort}'s own doc for why this is injected rather than imported, and why
   *  `undefined` in production is a wiring bug caught by {@link requireVendorCredentialPort}, not a
   *  silent legacy-only degrade. A test that does not exercise `deployment_get_static_publish_
   *  capabilities`/`deployment_propose_custom_provider_credential` may safely omit this — every other
   *  handler in this file never reads it. */
  vendorCredentials?: VendorCredentialPort;
}

/** Resolves `deps.vendorCredentials`, or throws a named, actionable wiring-bug error — see
 *  {@link VendorCredentialPort}'s own doc for why "unset" must never silently degrade to a
 *  legacy-only read/write. Called once per handler that needs it, not eagerly at
 *  `buildStaticPublishRegistrations`'s own top level, so every OTHER test/handler in this file that
 *  never touches vendor credentials is unaffected by this dependency existing at all.
 *
 * @complexity O(1).
 */
function requireVendorCredentialPort(deps: StaticPublishToolDeps): VendorCredentialPort {
  if (!deps.vendorCredentials) {
    throw new Error(
      "StaticPublishToolDeps.vendorCredentials was not injected — this is a wiring bug, not a credential or network problem. " +
        "Production wiring lives in assistant/tool-registrations.ts's buildAssistantToolRegistrations; see VendorCredentialPort's own doc."
    );
  }
  return deps.vendorCredentials;
}

/** {@link buildPreviewConfig}'s github-pages branch — see that function's own doc. */
function buildGitHubPagesPreviewConfig(raw: Record<string, unknown>): StaticPublishConfig {
  const owner = typeof raw.owner === "string" ? raw.owner : "";
  const repo = typeof raw.repo === "string" ? raw.repo : "";
  return { target: "github-pages", owner, repo, ...(typeof raw.branch === "string" ? { branch: raw.branch } : {}) };
}

/** {@link buildPreviewConfig}'s vercel branch — see that function's own doc. */
function buildVercelPreviewConfig(raw: Record<string, unknown>): StaticPublishConfig {
  return { target: "vercel", ...(typeof raw.teamId === "string" ? { teamId: raw.teamId } : {}) };
}

function buildPreviewConfig(raw: Record<string, unknown>): StaticPublishConfig {
  const target = raw.target as StaticPublishTargetId;
  if (target === "github-pages") {
    return buildGitHubPagesPreviewConfig(raw);
  }
  if (target === "vercel") {
    return buildVercelPreviewConfig(raw);
  }
  if (target === "netlify") {
    return { target };
  }
  if (target === "cloudflare-pages") {
    // no target-specific field: `accountId` lives on the credential, not this config (see
    // `static-publish/types.ts`'s `CloudflarePagesPublishConfig` doc).
    return { target: "cloudflare-pages" };
  }
  // target === "s3-compatible" — same empty-config shape as netlify/cloudflare-pages: every
  // identifying field (endpoint/region/bucket/accessKeyId/secretAccessKey/publicUrl) lives on the
  // CREDENTIAL, never this config (`static-publish/types.ts`'s `S3CompatiblePublishConfig` doc).
  return { target: "s3-compatible" };
}

const EXECUTE_STATIC_PUBLISH_TOOL_ID = "deployment_execute_static_publish";

/** The `ui://` URI for one publish-confirmation instance. Keyed by the exchange id (unique per raised
 *  dialog) rather than by an entity+version the way `deleteConfirmationUri`
 *  (`features/post/delete-confirmation-ui.ts`) keys its own — a publish has no existing row/version to
 *  key against, so the exchange id is what keeps two dialogs raised for the same target from
 *  colliding on one URI. */
function publishConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/deployment-execute-static-publish/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the publish confirmation dialog — the human-facing half of `deployment_execute_static_publish`'s
 * gate (this file's header). Mirrors `buildDeleteConfirmationResource`
 * (`features/post/delete-confirmation-ui.ts`) closely: Jini's `buildConfirmationSurface` owns HOW a
 * confirmation dialog behaves (the real MCP-UI handshake, safe interpolation, status text); this
 * function only decides WHAT a publish confirmation should say. Colocated in this file rather than
 * split into its own `publish-confirmation-ui.ts`, unlike the Posts/Pages precedent — this dispatch's
 * scope is this one file plus `assistant/**`, and the content here is small enough not to need its own
 * module.
 *
 * @complexity O(1) — a handful of fixed-size field reads.
 */
function buildPublishConfirmationResource(spec: {
  config: StaticPublishConfig;
  projectName: string;
  basePath: string | undefined;
  exchangeId: string;
}): UIResource {
  const { config, projectName, basePath, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: publishConfirmationUri(exchangeId),
    title: `Publish the site to ${config.target}?`,
    description: "The current site content will be exported fresh and published live, using this workspace's saved credential for this provider.",
    details: [
      { label: "Target", value: config.target },
      { label: "Project name", value: projectName },
      ...(config.target === "github-pages" ? [{ label: "Repository", value: `${config.owner}/${config.repo}` }] : []),
      ...(basePath !== undefined ? [{ label: "Base path", value: basePath }] : []),
    ],
    warning:
      "This goes live on the public internet immediately and may be crawled, cached, or indexed within seconds. A later republish overwrites what is hosted but can never retract what was already public.",
    danger: true,
    confirm: {
      label: "Publish",
      toolName: EXECUTE_STATIC_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action, not a bare dismiss — matches `buildDeleteConfirmationResource`'s own reasoning:
    // cancelling posts back and resolves the parked call immediately rather than stranding the agent's
    // call open until the idle deadline.
    cancel: {
      label: "Cancel",
      toolName: EXECUTE_STATIC_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-deployment-execute-static-publish", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}

/**
 * Renders the RESULT of a confirmed publish — what a human sees replacing the confirmation dialog
 * they just answered, once `askThenReport`'s `handle` callback has actually run `publishStaticSite`
 * (or refused to, e.g. `already-running`). See `assistant/surface-exchanges.ts`'s `askThenReport` doc
 * for the mechanism this depends on: sent under the SAME `uri` the confirmation used
 * (`publishConfirmationUri(exchangeId)`, deliberately reused rather than a fresh one), which is what
 * makes `McpUiSurfaceCard` (`@jini-ai/chat`) replace the dialog in place instead of opening a second
 * card, and what makes `McpUiHost` remount the frame cleanly (its `sessionKey` is
 * `` `${uri}:${documentText}` ``, and this document's text always differs from the confirmation's).
 *
 * `state`/`message`/`url` map straight onto Jini's `SurfaceOutcomeSpec` (`@jini-ai/ui/mcp-ui/surfaces`'s
 * `outcome.ts`) — this function's own job is only deciding the publish-specific title/details/labels,
 * the same division of labor `buildPublishConfirmationResource` above already has with
 * `buildConfirmationSurface`.
 *
 * @param spec.url - Present for `'success'` and `'partial'` only — renders one "Open site"/"Open when
 *   ready" button wired to the bridge's existing `openLink`, no new bridge plumbing. Omitted for
 *   `'failure'`: there is nothing live to open.
 * @complexity O(1) — fixed-size field reads, no iteration.
 */
function buildPublishOutcomeResource(spec: {
  exchangeId: string;
  config: StaticPublishConfig;
  projectName: string;
  state: "success" | "partial" | "failure";
  message: string;
  url?: string;
}): UIResource {
  const { exchangeId, config, projectName, state, message, url } = spec;
  const title = state === "success" ? "Published" : state === "partial" ? "Uploaded, not live yet" : "Publish failed";
  return buildOutcomeSurface({
    uri: publishConfirmationUri(exchangeId),
    title,
    details: [
      { label: "Target", value: config.target },
      { label: "Project name", value: projectName },
      ...(config.target === "github-pages" ? [{ label: "Repository", value: `${config.owner}/${config.repo}` }] : []),
    ],
    state,
    message,
    ...(url !== undefined ? { openLinkUrl: url, openLinkLabel: state === "partial" ? "Open when ready" : "Open site" } : {}),
    app: { appName: "tovu-deployment-execute-static-publish-outcome", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}

const PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID = "deployment_propose_custom_provider_credential";

/** The one fixed label every s3-compatible credential row is saved under — mirrors
 *  `apps/admin/src/features/deployment/rules.ts`'s `PUBLISH_CREDENTIAL_ROW_LABEL` ("default"). Cannot
 *  be imported directly: `apps/admin` is a genuinely separate npm workspace with no import path into
 *  this server's `src/` (spec §5's own verified finding), so this is a deliberate, documented mirror
 *  rather than a shared constant — an operator never sees or types a label for this provider on
 *  either side (spec §4c/§9), so the two constants only need to agree on VALUE, never be the same
 *  module. */
const CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL = "default";

/** The `ui://` URI for one propose-credential form instance — same "keyed by exchange id, not an
 *  entity+version" reasoning `publishConfirmationUri` above documents (there is no existing row to key
 *  a fresh save against). */
function customProviderCredentialFormUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/deployment-propose-custom-provider-credential/${exchangeId}` as UIResourceUri;
}

/** Which provider's hosting-setup guidance to return, inferred from the credential's own `endpoint` —
 *  never guessed from anything else, since `endpoint` is the one field whose VALUE differs
 *  meaningfully per provider (spec §4c's own per-provider endpoint hint text). Blank/omitted reads as
 *  plain AWS S3, matching the credential form's own "leave this blank" convention for that case. */
type HostingSetupProvider = "aws" | "backblaze-b2" | "cloudflare-r2" | "digitalocean-spaces" | "wasabi" | "minio" | "generic";

/**
 * @complexity O(1) — a fixed sequence of substring checks against one already-short string.
 * @overallScore 100
 */
function inferHostingSetupProvider(endpoint: string | undefined): HostingSetupProvider {
  const host = (endpoint ?? "").trim().toLowerCase();
  if (host === "") return "aws";
  if (host.includes("r2.cloudflarestorage.com")) return "cloudflare-r2";
  if (host.includes("backblazeb2.com")) return "backblaze-b2";
  if (host.includes("digitaloceanspaces.com")) return "digitalocean-spaces";
  if (host.includes("wasabisys.com")) return "wasabi";
  if (host.includes("amazonaws.com")) return "aws";
  if (host.includes("minio")) return "minio";
  return "generic";
}

interface HostingSetupStep {
  readonly title: string;
  readonly description: string;
  readonly consoleJson?: string;
}

/**
 * Composes the hosting-setup steps for one provider, with `bucket` substituted into any policy JSON.
 * Explicitly OUT OF SCOPE for this dispatch to author as final, reviewed, provider-verified prose
 * (spec §3a/§10.11 — "real implementation work informed by the citations in the table, not something
 * to invent here") — this is a real, working first pass grounded in that same citation table (AWS's
 * own Service Authorization Reference + Block Public Access docs, R2's API-token + public-buckets
 * docs, B2's key-creation API docs, DigitalOcean's CDN docs — all cited in the spec's §3a table), not a
 * stub. `wasabi`/`minio` are the two the spec's own table flags as "not independently verified this
 * pass" (S3-API-compatible by the vendors' own claims, not confirmed against their docs directly the
 * way the other four were) — their `warning` says so.
 *
 * @complexity O(1) — a fixed per-provider template, one string substitution.
 */
function buildHostingSetupContent(provider: HostingSetupProvider, bucket: string, region: string): { steps: HostingSetupStep[]; warning: string } {
  if (provider === "aws") {
    const policy = JSON.stringify(
      {
        Version: "2012-10-17",
        Statement: [{ Sid: "PublicReadGetObject", Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${bucket}/*` }],
      },
      null,
      2
    );
    return {
      steps: [
        {
          title: "Turn off Block Public Access for this bucket",
          description:
            `AWS turns this on for every new bucket by default, and it overrides any bucket policy while it's on — a public-read policy alone will not work until this is off. ` +
            `S3 console → bucket '${bucket}' → Permissions → Block public access (bucket settings) → Edit → uncheck all four boxes → confirm.`,
        },
        {
          title: "Enable static website hosting",
          description: `S3 console → bucket '${bucket}' → Properties → Static website hosting → Enable → set the index document to 'index.html'.`,
        },
        {
          title: "Allow public reads (bucket policy)",
          description: `S3 console → bucket '${bucket}' → Permissions → Bucket policy → paste the JSON below exactly (it already has your bucket name in it) → Save.`,
          consoleJson: policy,
        },
      ],
      warning: "",
    };
  }
  if (provider === "cloudflare-r2") {
    return {
      steps: [
        {
          title: "Enable a public URL for this bucket",
          description: `Cloudflare dashboard → R2 → bucket '${bucket}' → Settings → either turn on the free 'r2.dev' subdomain, or connect a custom domain you own.`,
        },
      ],
      warning:
        "This step needs a DIFFERENT credential than the S3-compatible key you saved on the Custom tab — your Cloudflare account login (or a separate Cloudflare API token), not the R2 access key/secret pair. " +
        "R2's S3-compatible keys work only with S3-compatible SDKs/APIs; enabling public access is a Cloudflare-dashboard/API operation with no overlap in permissions.",
    };
  }
  if (provider === "backblaze-b2") {
    return {
      steps: [
        {
          title: "Make the bucket public",
          description: `Backblaze B2 dashboard → Buckets → '${bucket}' → change the bucket's Files setting from 'Private' to 'Public'.`,
        },
      ],
      warning:
        "Changing bucket visibility needs the 'writeBuckets' capability, a DIFFERENT capability than the object-write key saved on the Custom tab (which typically only has 'writeFiles'). " +
        "If your saved key doesn't have it, do this step in the B2 web dashboard with your regular B2 login instead of trying to script it with the saved key.",
    };
  }
  if (provider === "digitalocean-spaces") {
    return {
      steps: [
        {
          title: "Enable the CDN endpoint for this Space",
          description: `DigitalOcean control panel → Spaces → '${bucket}' → Settings → enable the CDN (or 'doctl' / the DigitalOcean API v2 with a personal access token).`,
        },
      ],
      warning:
        "This step needs a DIFFERENT credential than the S3-compatible key you saved on the Custom tab — a DigitalOcean personal access token (from your account login), not the Spaces access key/secret pair. " +
        "Basic object-level public-read via the S3-compatible API's own ACL mechanism may be reachable with the saved key without the CDN, but this has not been independently verified — treat it as worth trying, not guaranteed.",
    };
  }
  if (provider === "wasabi") {
    return {
      steps: [
        {
          title: "Set a public-read bucket policy",
          description: `Wasabi markets itself as closely AWS-S3-API-compatible, including bucket-policy support through the same signed-request surface your saved key already uses — try the AWS-shaped policy below in your Wasabi console (bucket '${bucket}', region '${region}').`,
          consoleJson: JSON.stringify(
            { Version: "2012-10-17", Statement: [{ Sid: "PublicReadGetObject", Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${bucket}/*` }] },
            null,
            2
          ),
        },
      ],
      warning: "Wasabi's compatibility with this exact flow has not been independently verified against Wasabi's own documentation — this is inferred from Wasabi's own compatibility claims, not confirmed. Double-check against Wasabi's current docs before relying on it.",
    };
  }
  if (provider === "minio") {
    return {
      steps: [
        {
          title: "Set an anonymous download policy",
          description: `Self-hosted MinIO — use the MinIO Console's bucket Access Policy setting, or the 'mc' CLI: 'mc anonymous set download <alias>/${bucket}'.`,
        },
      ],
      warning:
        "A self-hosted MinIO instance often has no public DNS name at all — 'Public URL' on the credential form only makes sense once you've set one up yourself (a reverse proxy, a load balancer, a domain pointed at this server). If you haven't, the site will not be reachable from the public internet no matter what is configured here.",
    };
  }
  // provider === "generic" — endpoint didn't match any known provider's host pattern.
  return {
    steps: [
      {
        title: "Check your provider's own documentation for making a bucket publicly readable",
        description:
          `Your storage endpoint wasn't recognized as one of the providers Tovu has specific guidance for (bucket '${bucket}', region '${region}'). ` +
          "Most S3-compatible providers support a public-read bucket policy similar to AWS's own — search your provider's docs for 'bucket policy' or 'public access'.",
      },
    ],
    warning: "This provider is not one Tovu has specific hosting-setup guidance for yet — the steps above are generic, not verified against your provider's own documentation.",
  };
}

/** The closed `StaticPublishTargetId` set both `deployment_preview_static_publish` and
 *  `deployment_execute_static_publish` validate their `target` input against — kept as one list so
 *  the two handlers' error messages can never drift apart. */
const VALID_STATIC_PUBLISH_TARGETS: readonly StaticPublishTargetId[] = ["github-pages", "vercel", "netlify", "cloudflare-pages", "s3-compatible"];

/** Shared `target` field validation for `deployment_preview_static_publish` and
 *  `deployment_execute_static_publish` — extracted so neither handler's own complexity carries this
 *  fixed 5-way check inline.
 *  @throws {Error} `raw.target` is not one of {@link VALID_STATIC_PUBLISH_TARGETS}. */
function requireStaticPublishTarget(raw: Record<string, unknown>): StaticPublishTargetId {
  const target = requireString(raw, "target");
  if (!VALID_STATIC_PUBLISH_TARGETS.includes(target as StaticPublishTargetId)) {
    throw new Error("'target' must be one of: github-pages, vercel, netlify, cloudflare-pages, s3-compatible");
  }
  return target as StaticPublishTargetId;
}

/** `deployment_preview_static_publish`'s result shape — extracted purely to keep that handler's
 *  own body a flat sequence of steps. */
function buildStaticPublishPreviewResult(
  target: StaticPublishTargetId,
  validationError: string | null,
  basePath: string | undefined,
  credential: { readonly configured: boolean; readonly reason?: string }
) {
  return {
    target,
    valid: validationError === null,
    ...(validationError !== null ? { validationError } : {}),
    basePath: basePath ?? null,
    credentialsConfigured: credential.configured,
    ...(!credential.configured ? { credentialGuidance: credential.reason } : {}),
    willInjectNojekyll: target === "github-pages",
  };
}

/** Per-provider dependencies {@link buildProviderCapability} needs — bundles the two already-fetched
 *  credential-summary lists plus every port it reads, so `deployment_get_static_publish_capabilities`'s
 *  `PROVIDER_IDS.map()` callback stays a single call per provider rather than a long inline closure. */
interface ProviderCapabilityContext {
  readonly deps: StaticPublishToolDeps;
  readonly credentialSource: PublishCredentialSource;
  readonly historyStore: PublishHistoryStore;
  readonly vendorCredentials: VendorCredentialPort;
  readonly saved: Awaited<ReturnType<typeof listPublishCredentials>>;
  readonly savedVendor: VendorCredentialSummaryLike[];
}

/** {@link buildProviderCapability}'s `savedCredentials` mapping — new-table rows when the vendor
 *  table has any row for this provider, legacy-table rows otherwise (see that function's own doc for
 *  the "new table wins" precedence). Legacy `publish_credential_sets` rows have no `token_tail`
 *  column (Phase 1 added it only to the new table) — `null` there is an honest "not known", never
 *  derived by decrypting (this handler's own "never decrypts" contract, unchanged by this cutover). */
function mapSavedCredentials(
  usingVendorTable: boolean,
  savedForVendor: VendorCredentialSummaryLike[],
  savedForProvider: Awaited<ReturnType<typeof listPublishCredentials>>
) {
  if (usingVendorTable) {
    return savedForVendor.map((credential) => ({
      id: credential.id,
      label: credential.label,
      isDefault: credential.isDefault,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      tokenTail: credential.tokenTail,
    }));
  }
  return savedForProvider.map((credential) => ({
    id: credential.id,
    label: credential.label,
    isDefault: credential.isDefault,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    tokenTail: null as string | null,
  }));
}

/**
 * {@link buildProviderCapability}'s result-object assembly, split out from the value computation so
 * neither half alone carries every branch in the original 100-line closure. `verifiedAt`/`accountLabel`
 * are the two fields this handler still needs beyond what {@link buildCapabilityGuidance} itself reads.
 *
 * Migration `0044` (2026-08-16, Defect B fix): `accountLabel` prefers the DEFAULT credential's own DB
 * column (`publishCredentialSets.accountLabel`, healed by the admin route's post-save verify — see
 * `store.ts`'s `healAccountLabel`) over the in-memory verification cache, falling back to the cache
 * only when the column is null (an older row this migration has not yet healed, or an env-var-sourced
 * credential with no DB row at all). This is what makes the identity survive a process restart: the
 * cache alone (`verification?.accountLabel`) is wiped by every restart, but a saved row's column is
 * not. 2026-08-16, Defect 1: the assistant used to have no way to learn which GitHub account its own
 * verified token belongs to, so it guessed one from the human's email address and published to the
 * wrong owner — `accountLabel` is the fix, see this tool's own catalog description for how the model
 * is told to use it.
 */
function buildProviderCapabilityResult(spec: {
  readonly providerId: StaticPublishTargetId;
  readonly ready: boolean;
  readonly readiness: { configured: true } | { configured: false; reason: string };
  readonly verified: "valid" | "invalid" | "unreachable" | null;
  readonly verification: ReturnType<PublishCredentialVerificationCache["get"]>;
  readonly defaultCredential: { readonly accountLabel: string | null } | undefined;
  readonly lastPublish: Awaited<ReturnType<PublishHistoryStore["getLast"]>>;
  readonly savedCredentials: ReturnType<typeof mapSavedCredentials>;
  readonly guidance: string | undefined;
}) {
  const { providerId, ready, readiness, verified, verification, defaultCredential, lastPublish, savedCredentials, guidance } = spec;
  return {
    providerId,
    ready,
    credentialConfigured: readiness.configured,
    verified,
    verifiedAt: verification?.checkedAt ?? null,
    // The verified credential's own public account login/username (GitHub `login`, Vercel
    // `username`) — `null` when not yet verified, or for a provider `verify.ts` has no reviewed
    // field to read (Netlify, Cloudflare Pages, s3-compatible; see that file's header).
    accountLabel: defaultCredential?.accountLabel ?? verification?.accountLabel ?? null,
    lastPublish,
    savedCredentials,
    ...(guidance !== undefined ? { guidance } : {}),
  };
}

/**
 * Computes one provider's `deployment_get_static_publish_capabilities` entry — extracted from that
 * handler's own `PROVIDER_IDS.map()` callback purely to keep this domain's complexity gates: this was
 * previously a single ~100-line inline async arrow.
 *
 * `providerToVendor` is exhaustive over every `StaticPublishTargetId` by `VendorCredentialPort`'s own
 * type doc, so `vendorId` is never undefined for any member of `PROVIDER_IDS` — asserted rather than
 * defensively guarded, matching how this handler already treats its own fixed, closed inputs.
 *
 * New table wins the moment it has ANY row for this vendor — same per-vendor precedence
 * `dual-read.ts` documents ("new table FIRST, legacy only when the new group is genuinely empty"). A
 * provider whose vendor group has migrated (or was only ever saved through the new
 * `deployment_propose_custom_provider_credential` write path) is reported from the new table
 * exclusively; any stale legacy row for the same provider is simply not looked at, matching the write
 * side's own "new table wins" behavior.
 *
 * `readiness`/`credentialConfigured` merges the new table's "is anything saved" signal (checked
 * first) with the existing old-table-or-env-var mechanism (`credentialSource`, untouched by this
 * cutover) for when the new table's group for this vendor is empty. Without this merge, a credential
 * saved ONLY through the new write path would show up in `savedCredentials` while `credentialConfigured`
 * still reported `false` — a self-contradictory result this merge exists to prevent.
 *
 * `ready` means "will actually work," not merely "a credential is saved" (2026-08-16 fix: a saved
 * GitHub token GitHub rejected outright with 401 used to still report `ready: true`) — a credential
 * that is configured but never verified, that failed its last verification, or whose last check could
 * not reach the provider is NOT ready.
 *
 * `verification` is a cached, non-decrypting read only — NEVER `verifyPublishCredential` from here
 * (that decrypts and makes a real provider call; see `static-publish/verify.ts`'s own header for why
 * this handler must never be its caller).
 */
async function buildProviderCapability(providerId: StaticPublishTargetId, ctx: ProviderCapabilityContext) {
  const vendorId = ctx.vendorCredentials.providerToVendor[providerId];
  const savedForVendor = ctx.savedVendor.filter((credential) => credential.vendorId === vendorId);
  const savedForProvider = ctx.saved.filter((credential) => credential.providerId === providerId);
  const usingVendorTable = savedForVendor.length > 0;
  const savedCredentials = mapSavedCredentials(usingVendorTable, savedForVendor, savedForProvider);
  const defaultCredential = usingVendorTable ? savedForVendor.find((credential) => credential.isDefault) : savedForProvider.find((credential) => credential.isDefault);
  const readiness = usingVendorTable ? ({ configured: true } as const) : await ctx.credentialSource.isConfigured({ workspaceId: ctx.deps.workspaceId, target: providerId });
  // 2026-08-16, Defect 2: the last successful publish to this provider, if any — see
  // `publish-history.ts`'s own header for the storage design. `null` means never published (from
  // this server, in this history store) rather than an absent key, so an agent-facing JSON result
  // always carries the field.
  const lastPublish = await ctx.historyStore.getLast({ workspaceId: ctx.deps.workspaceId, target: providerId });
  const verification = readiness.configured ? ctx.deps.publishCredentialVerificationCache.get({ workspaceId: ctx.deps.workspaceId, target: providerId }) : undefined;
  const verified = verification ? verification.status : null;
  const ready = readiness.configured && verified === "valid";
  const guidance = buildCapabilityGuidance(providerId, readiness, verification);

  return buildProviderCapabilityResult({ providerId, ready, readiness, verified, verification, defaultCredential, lastPublish, savedCredentials, guidance });
}

/** Every dependency {@link handlePublishConfirmationAnswer} needs to run the confirmed publish and
 *  report its result — bundled so `deployment_execute_static_publish`'s own `askThenReport` call
 *  passes a single object instead of the handler's whole closure. */
interface PublishConfirmationContext {
  readonly deps: StaticPublishToolDeps;
  readonly credentialSource: PublishCredentialSource;
  readonly historyStore: PublishHistoryStore;
  readonly exchange: SurfaceExchange;
  readonly config: StaticPublishConfig;
  readonly target: StaticPublishTargetId;
  readonly projectName: string;
}

/** ADR-055 Decision 6: the no-answer path (`expired`/`abandoned`) is a result, not an exception.
 *  Nothing was published either way, and the model is still alive to read this and say something
 *  sensible. {@link handlePublishConfirmationAnswer} sends no `outcome` for this branch either: the
 *  exchange itself already ended, so `askThenReport`'s own send would just be swallowed regardless. */
function buildNoAnswerToolResult(status: "expired" | "abandoned"): { published: false; cancelled: false; reason: string; note: string } {
  return {
    published: false,
    cancelled: false,
    reason: status,
    note:
      status === "expired"
        ? "The user did not respond to the publish confirmation dialog before it expired. Nothing was published."
        : "The confirmation dialog was closed because the run ended. Nothing was published.",
  };
}

/**
 * No `await` between the single-flight check this builds a result for and `runPublishAndAwait` in
 * {@link handlePublishConfirmationAnswer} — same single-synchronous-stretch contract `publish-site.ts`'s
 * HTTP trigger route documents for the identical check, against the SAME shared slot
 * (`static-publish/publish-run.ts`): checked immediately before the actual publish call, rather than
 * earlier (e.g. before opening the confirmation dialog), because the dialog can sit open for an
 * arbitrary time awaiting a human answer, during which another publish could start AND finish, so a
 * check made before that point would not actually close the race.
 *
 * This IS a "Done." would-be-lie moment too (see {@link handlePublishConfirmationAnswer}'s own header
 * for the defect `askThenReport` fixes): the human clicked Publish, the confirming call is about to
 * resolve, and nothing published. Corrected the same way a real publish failure is, not left to the
 * confirmation script's generic "Done.".
 */
function buildAlreadyRunningResult(exchange: SurfaceExchange, config: StaticPublishConfig, projectName: string): { result: unknown; outcome: SurfaceEmission } {
  const message =
    "A publish is already running in this server (started via the admin UI or another agent call). Wait for it to finish, or check deployment_get_static_publish_capabilities/the Static Site tab for its status, then retry. This will not resolve on retry while it is still running.";
  return {
    result: { published: false, cancelled: false, reason: "already-running", message },
    outcome: {
      channel: "mcp-ui",
      payload: { resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, projectName, state: "failure", message }) },
    },
  };
}

/**
 * Maps `publishStaticSite`'s own `StaticPublishOutcome` (via {@link handlePublishConfirmationAnswer}'s
 * `runPublishAndAwait` call) to `deployment_execute_static_publish`'s agent-facing result plus the
 * `outcome` emission that corrects the confirmation dialog with the truth (see
 * {@link handlePublishConfirmationAnswer}'s own header for why that emission exists at all).
 *
 * "Uploaded, but not yet reachable" (spec `custom-publish-provider-contract.md` §3a) — a `"partial"`
 * outcome's files DID upload (so `published: true`, never a hard failure), but the site is not
 * confirmed live yet (so `reachable: false`, never a plain success either). Structurally a distinct
 * branch from both — see `static-publish/types.ts`'s `StaticPublishOutcome` header for why
 * `outcome.ok` itself is `true | false | "partial"`, not merely a boolean.
 *
 * Every branch of `publishStaticSite`'s own failure contract (`static-publish/types.ts`'s
 * `StaticPublishOutcome` doc, `adapter.ts`'s own `catch`) is already an actionable, credential-free
 * message: `NO_CREDENTIALS_CONFIGURED` names the provider via the resolved credential source's own
 * reason text, a Cloudflare-Pages-credential-missing-its-account-id failure names the exact missing
 * field (`buildJiniTarget`'s own `DeployError`), and `PROVIDER_ERROR` is `err.message` only — never a
 * raw response body, never a credential. Passed straight through rather than re-wrapped, and straight
 * into the outcome surface too — the same actionable text a human would need either way.
 */
function mapPublishOutcomeToToolResult(
  outcome: StaticPublishOutcome,
  exchange: SurfaceExchange,
  config: StaticPublishConfig,
  projectName: string
): { result: unknown; outcome: SurfaceEmission } {
  if (outcome.ok === "partial") {
    return {
      result: {
        published: true,
        reachable: false,
        target: outcome.targetId,
        url: outcome.url,
        status: outcome.status,
        message: outcome.message,
        ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
        ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
      },
      outcome: {
        channel: "mcp-ui",
        payload: {
          resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, projectName, state: "partial", message: outcome.message, url: outcome.url }),
        },
      },
    };
  }
  if (!outcome.ok) {
    return {
      result: { published: false, cancelled: false, code: outcome.code, message: outcome.message },
      outcome: {
        channel: "mcp-ui",
        payload: { resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, projectName, state: "failure", message: outcome.message }) },
      },
    };
  }
  return {
    result: {
      published: true,
      reachable: true,
      target: outcome.targetId,
      url: outcome.url,
      status: outcome.status,
      ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
      ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
    },
    outcome: {
      channel: "mcp-ui",
      payload: {
        resource: buildPublishOutcomeResource({
          exchangeId: exchange.id,
          config,
          projectName,
          state: "success",
          message: `Published live at ${outcome.url}.`,
          url: outcome.url,
        }),
      },
    },
  };
}

/**
 * `deployment_execute_static_publish`'s `askThenReport` handler — extracted to a top-level function
 * (previously a ~135-line closure) so its own complexity is measured independently of the handler
 * that constructs {@link PublishConfirmationContext} and passes it in.
 *
 * `askThenReport`, not `askOnce` (`assistant/surface-exchanges.ts`) — a click resolving this tool's
 * `tools/call` proves the click was DELIVERED, never that the publish it triggered actually succeeded
 * (see that function's own doc for the full defect this closes: for a held-open exchange, the click's
 * round trip resolves the instant `mcp-ui-tool-calls-route.ts` delivers it to this parked call — `202
 * {delivered:true}` — long before this function has even started running). `askOnce` cannot be
 * patched to fix this in place: it closes the exchange the moment `receive()` resolves, so a second
 * `exchange.send()` after doing the real work here would already be talking to a dead exchange. This
 * function is exactly the body `askOnce` would have wrapped; the only new thing each `return` does is
 * also hand back an `outcome` emission when there is a genuine publish result to correct the record
 * with — `askThenReport` sends it AFTER the confirm dialog, on the SAME `ui://` URI
 * (`publishConfirmationUri(exchange.id)`, reused by `buildPublishOutcomeResource`), which is what
 * makes the transcript replace the dialog with the truth in place rather than opening a second card.
 */
async function handlePublishConfirmationAnswer(answer: SurfaceMessage, ctx: PublishConfirmationContext): Promise<{ result: unknown; outcome?: SurfaceEmission }> {
  if (answer.status !== "received") {
    return { result: buildNoAnswerToolResult(answer.status) };
  }

  const decision = typeof answer.params.decision === "string" ? answer.params.decision : "confirm";
  if (decision !== "confirm") {
    // No outcome surface for a cancel: the confirmation's own script already reports
    // "Dismissed."/"Done." locally the moment this tool call resolves, and that IS the truth for a
    // cancel (unlike a publish, nothing async happens afterward that could still fail).
    return { result: { published: false, cancelled: true, target: ctx.target, projectName: ctx.projectName } };
  }

  if (getPublishRunSnapshot().status === "running") {
    return buildAlreadyRunningResult(ctx.exchange, ctx.config, ctx.projectName);
  }

  const outcome = await runPublishAndAwait(
    { credentialSource: ctx.credentialSource, ...(ctx.deps.buildTarget !== undefined ? { buildTarget: ctx.deps.buildTarget } : {}) },
    {
      workspaceId: ctx.deps.workspaceId,
      publishOutputRootDir: ctx.deps.publishOutputRootDir,
      idGen: ctx.deps.idGen,
      exportSiteBound: ctx.deps.exportSiteBound,
      config: ctx.config,
      projectName: ctx.projectName,
    },
    ctx.deps.clock,
    ctx.historyStore
  );

  return mapPublishOutcomeToToolResult(outcome, ctx.exchange, ctx.config, ctx.projectName);
}

/** Shared `protocol` field validation for `deployment_propose_custom_provider_credential` and
 *  `deployment_generate_bucket_hosting_setup` — both currently support only `'s3-compatible'`.
 *  @param toolId - Named explicitly (not inferred) so each tool's error message still names itself.
 *  @throws {Error} `raw.protocol` is not `'s3-compatible'`. */
function requireS3CompatibleProtocol(raw: Record<string, unknown>, toolId: string): void {
  const protocol = requireString(raw, "protocol");
  if (protocol !== "s3-compatible") {
    throw new Error(`${toolId}: 'protocol' must be 's3-compatible' — no other Custom-tab protocol exists yet.`);
  }
}

/** `deployment_propose_custom_provider_credential`'s prefill — the caller's own non-secret hints
 *  (`endpoint`/`region`/`bucket`/`publicUrl`), forwarded into the form as pre-filled `value`s. Blank
 *  strings are treated as absent, same as every other optional-string field this file reads from raw
 *  tool input. */
function buildS3CompatiblePrefill(raw: Record<string, unknown>): Partial<Record<"endpoint" | "region" | "bucket" | "publicUrl", string>> {
  const prefill: Partial<Record<"endpoint" | "region" | "bucket" | "publicUrl", string>> = {};
  for (const field of ["endpoint", "region", "bucket", "publicUrl"] as const) {
    if (typeof raw[field] === "string" && (raw[field] as string).trim() !== "") {
      prefill[field] = raw[field] as string;
    }
  }
  return prefill;
}

/** Builds `deployment_propose_custom_provider_credential`'s form surface — extracted purely to keep
 *  that handler's own body a flat sequence of steps. Posts back on cancel rather than a silent close
 *  — same reasoning `demo-choices-tool.ts`'s own form cancel action documents: with the call parked, a
 *  silent close would strand the handler for the full TTL staring at a form the human already walked
 *  away from. */
function buildProposeCredentialForm(exchange: SurfaceExchange, prefill: Partial<Record<"endpoint" | "region" | "bucket" | "publicUrl", string>>): UIResource {
  return buildFormSurface({
    uri: customProviderCredentialFormUri(exchange.id),
    title: "Connect S3-compatible storage",
    description: S3_COMPATIBLE_FORM_DESCRIPTION,
    submitLabel: "Save connection",
    toolName: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
    fields: S3_COMPATIBLE_FIELD_GUIDANCE.map((field) => ({
      kind: "string",
      name: field.name,
      label: field.label,
      hint: field.hint,
      required: field.required,
      ...(field.secret ? { secret: true } : {}),
      ...(prefill[field.name as keyof typeof prefill] !== undefined ? { value: prefill[field.name as keyof typeof prefill] } : {}),
    })),
    cancel: {
      label: "Cancel",
      toolName: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true },
    },
    app: { appName: "tovu-deployment-propose-custom-provider-credential", appVersion: "1" },
    preferredFrameSize: ["100%", "560px"],
  });
}

/** Maps the submitted form's raw params to `createVendorCredential`/`updateVendorCredential`'s own
 *  `connection` input shape. Passes the raw params straight through (rather than hand-building a
 *  typed object with fallback empty strings) so there is exactly ONE place (`vendor-credentials/
 *  store.ts`'s `validateConnection`) that decides what "valid" means — this function only decides
 *  which fields are even candidates to forward. Never trusts the client-side `required` attribute:
 *  `form.ts` ships `novalidate` on purpose (its own doc: the browser's bubble UI is unusable in the
 *  surface's small iframe), so server-side validation is the ACTUAL enforcement point. */
function buildS3CompatibleConnectionInput(params: Record<string, unknown>): Record<string, unknown> {
  const connectionInput: Record<string, unknown> = { vendorId: "s3-compatible" };
  for (const field of ["region", "bucket", "accessKeyId", "secretAccessKey", "publicUrl", "endpoint"] as const) {
    if (typeof params[field] === "string") connectionInput[field] = params[field];
  }
  return connectionInput;
}

/**
 * "One flat row per vendor" (spec §9's label-UX resolution, restated at §4c, now applied to the
 * unified table's own `(workspaceId, vendorId)` grouping): finds this workspace's existing
 * `s3-compatible` VENDOR row (a non-decrypting repo read) and UPDATEs it if one exists, otherwise
 * CREATEs. A workspace whose only existing s3-compatible credential still sits in the OLD
 * `publish_credential_sets` table (not yet migrated, or saved before Phase 3's cutover) is NOT found
 * here — `findDefaultByVendor` only ever looks at the new table — so this creates a fresh vendor-table
 * row rather than updating the stale legacy one. That legacy row is simply left behind, unread from
 * now on: `deployment_get_static_publish_capabilities`'s own Phase 3 cutover reports the new table's
 * row exclusively the moment it has ANY row for a vendor, so this never produces two
 * simultaneously-authoritative credentials from the model's point of view — only one harmless
 * orphaned row, the same temporary cost `vendor-credentials/dual-read.ts`'s own header already
 * accepts for the read side.
 *
 * `PublishCredentialValidationError`'s own messages never carry a field VALUE, only field NAMES and
 * the provider id (`store.ts`'s `requireNonEmptyString`/`optionalString`) — safe to relay. Any other
 * store error (e.g. the secret store being unconfigured) still gets `err.message` only, matching
 * `deployment_execute_static_publish`'s own "message, never the raw error" boundary discipline.
 */
async function saveS3CompatibleCredential(deps: StaticPublishToolDeps, connectionInput: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
  const vendorCredentials = requireVendorCredentialPort(deps);
  const writeDeps: VendorCredentialWriteDepsLike = {
    repo: deps.vendorCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };
  try {
    const existing = await deps.vendorCredentialSetRepo.findDefaultByVendor({ workspaceId: deps.workspaceId, vendorId: "s3-compatible" });
    if (existing) {
      await vendorCredentials.update(writeDeps, { workspaceId: deps.workspaceId, id: existing.id, connection: connectionInput });
    } else {
      await vendorCredentials.create(writeDeps, { workspaceId: deps.workspaceId, label: CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL, connection: connectionInput });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * `deployment_propose_custom_provider_credential`'s `askOnce` answer handling — extracted to a
 * top-level function so its own complexity is measured independently of the handler that opens the
 * exchange and builds the form.
 */
async function handleProposeCredentialAnswer(answer: SurfaceMessage, deps: StaticPublishToolDeps) {
  if (answer.status !== "received") {
    return {
      saved: false,
      cancelled: false,
      reason: answer.status,
      note: answer.status === "expired" ? "The user did not respond to the credential form before it expired. Nothing was saved." : "The credential form was closed because the run ended. Nothing was saved.",
    };
  }
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
    return { saved: false, cancelled: true };
  }

  const connectionInput = buildS3CompatibleConnectionInput(answer.params);
  const saveResult = await saveS3CompatibleCredential(deps, connectionInput);
  if (!saveResult.ok) {
    return { saved: false, cancelled: false, reason: "invalid", message: saveResult.message };
  }

  // NEVER echoes a field value, secret or not — the structural guarantee this handler's own doc
  // comment states up front.
  return { saved: true, providerId: "s3-compatible", connected: true };
}

/**
 * Builds this domain's `ToolRegistration[]` — the same shape every other domain's
 * `build<Domain>Registrations` produces (see e.g. `recovery/tool-registrations.ts`'s
 * `buildRecoveryRegistrations`). Called by `assistant/tool-registrations.ts`, which imports
 * `buildStaticPublishRegistrations`/`staticPublishDerivedRisk` from this file and lists them as
 * their own `"static-publish"` entry in `DOMAIN_SLICES` — see that file's own comment on that entry
 * for why static-publish stays a separate slice rather than folding into this directory's sibling
 * `deployments`/`agent-tools.ts` slice.
 *
 * @param deps - `StaticPublishToolDeps` plus this file's own test-only overrides (`credentialSource`,
 *   `buildTarget`). `credentialSource` defaults to the same DB-first, env-fallback-only-in-
 *   `"self-hosted-cli"`-mode composition `publish-site.ts`'s route constructs.
 * @param surfaces - The held-open confirmation exchange store `deployment_execute_static_publish`
 *   parks on — see this file's header. Required, matching `buildPostRegistrations`' own shape (the
 *   other domain whose gate needs this), since a domain with no store at all could never wire this
 *   tool's gate at all.
 * @complexity O(1) registration-time cost; each wired handler's own cost is documented at its call
 *   site above (preview/capabilities: O(1) plus the provider count; execute: one `exportSite` pass
 *   plus one provider API call, only after a human confirms).
 */
export function buildStaticPublishRegistrations(deps: StaticPublishToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const credentialSource =
    deps.credentialSource ??
    composePublishCredentialSource({
      workspaceId: deps.workspaceId,
      executionMode: deps.publishExecutionMode,
      dbDeps: { repo: deps.publishCredentialSetRepo, sealer: deps.siteAssistantSecretSealer },
    });
  const historyStore = deps.historyStore ?? deps.publishHistoryStore;

  const handlers: Record<string, ToolHandler> = {
    deployment_preview_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const target = requireStaticPublishTarget(raw);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const config = buildPreviewConfig(raw);
      const validationError = validateStaticPublishConfig(config);
      const basePath = validationError ? undefined : computeBasePath(config);
      // `isConfigured()`, NOT `resolve()` — this is an agent-facing read; per this file's own header
      // (and `static-publish/types.ts`'s `PublishCredentialSource` doc) an agent-facing path must
      // never be able to resolve a real credential, even indirectly by reading `.ok` off it.
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });

      return buildStaticPublishPreviewResult(target, validationError, basePath, credential);
    },

    /**
     * Never decrypts — reads through `listVendorCredentials`/`listPublishCredentials` (both pure DB
     * reads; see either function's own "read model only" doc) and `credentialSource.isConfigured`
     * (this file's own preview handler already relies on the identical never-decrypting contract).
     * Structurally cannot reach `resolveForPublish`/`resolveDefaultForPublish`/`resolveForVendor`/
     * `resolveDefaultForVendor`: this handler is never given a `SecretSealerPort`, and every one of
     * those functions requires one.
     *
     * Phase 3 cutover (this dispatch): reads `vendor_credential_sets` FIRST for each provider's
     * mapped `VendorId`, falling back to the legacy `publish_credential_sets` rows only when that
     * vendor's group is empty — same "new table wins, legacy is a fallback, both are non-decrypting
     * reads" precedence `vendor-credentials/dual-read.ts` documents for its own (decrypting) resolve
     * path, reimplemented inline here rather than calling that module: this handler's own contract
     * (this doc, above) is that it never decrypts, and `dual-read.ts`'s function exists specifically
     * to hand back a real, decrypted connection for an actual publish attempt — using it here would
     * decrypt on every capabilities call, silently breaking the guarantee this doc and this file's
     * own test already enforce. `tokenTail` is populated only for a vendor-table-sourced entry (the
     * legacy table has no such column, and deriving one would mean decrypting); `null` there is
     * honest, not a placeholder — see this tool's own catalog description for the model-facing
     * contract.
     *
     * `listVendorCredentials`/`providerToVendor` are read off `deps.vendorCredentials`
     * ({@link VendorCredentialPort}, resolved by {@link requireVendorCredentialPort}), never imported
     * directly — see this file's header for why.
     */
    deployment_get_static_publish_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const vendorCredentials = requireVendorCredentialPort(deps);
      const saved = await listPublishCredentials({ repo: deps.publishCredentialSetRepo } satisfies PublishCredentialReadDeps, {
        workspaceId: deps.workspaceId,
      });
      // Phase 3 cutover — see this handler's own doc above for why this is a second, independent list
      // read (never a decrypting resolve) rather than a call into `vendor-credentials/dual-read.ts`.
      const savedVendor = await vendorCredentials.list({ repo: deps.vendorCredentialSetRepo }, { workspaceId: deps.workspaceId });

      const providerCapabilityContext: ProviderCapabilityContext = { deps, credentialSource, historyStore, vendorCredentials, saved, savedVendor };
      const providers = await Promise.all(PROVIDER_IDS.map((providerId) => buildProviderCapability(providerId, providerCapabilityContext)));

      return { executionMode: deps.publishExecutionMode, providers };
    },

    /**
     * The MCP-UI-gated publish. See `buildPublishConfirmationResource` above for the surface itself
     * and this file's header for why this holds its call open (`assistant/surface-exchanges.ts`)
     * rather than needing `descriptor.requiresConfirmation`/an `ExecutionDelegate`.
     *
     * One call, blocking:
     *  1. Validate the config shape (same validation `publishStaticSite` performs internally — an
     *     explicit early check here means a caller with an invalid config never causes a dialog to be
     *     raised at all, mirroring `publish-site.ts`'s route's own early-validation discipline).
     *  2. Check credential readiness (`isConfigured()`, never decrypts) — a dialog a human could only
     *     ever see to be told "this can't work" wastes their attention, so a not-ready provider is
     *     refused before opening anything.
     *  3. Open an exchange, emit the confirmation surface through it, and park on the answer.
     *  4. The answer is the human's decision — confirm, cancel — or a `SurfaceMessage` saying nobody
     *     answered (`expired`/`abandoned`). Every branch returns a truthful result to the SAME call;
     *     none of them throw for "no answer", because the model is still alive to read the result
     *     (ADR-055 Decision 6, same posture `content_post_delete` takes).
     *  5. On confirm, calls `publishStaticSite` — the SAME function `publish-site.ts`'s human-session
     *     route calls — which resolves the real credential (only now, only here) and runs a fresh
     *     export immediately before publishing.
     *
     * No fallback to a two-call shape when `ctx.emitSurface` is unavailable: an execution context that
     * cannot hold this call open cannot run this tool at all — identical posture to
     * `content_post_delete`'s own handler.
     */
    deployment_execute_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const target = requireStaticPublishTarget(raw);
      const projectName = requireString(raw, "projectName");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.publish", entityType: "site-publish" });

      const config = buildPreviewConfig(raw);
      const validationError = validateStaticPublishConfig(config);
      if (validationError !== null) {
        throw new Error(`deployment_execute_static_publish: ${validationError}`);
      }

      // Fail closed rather than degrade — see this handler's own doc comment above.
      if (!ctx.emitSurface) {
        throw new Error(
          "deployment_execute_static_publish: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a live publish cannot be gated here. Nothing was published."
        );
      }

      // Never decrypts (same `isConfigured()` contract the preview/capabilities handlers use above).
      // Checked before raising any dialog so a guaranteed-fail call never wastes a human's attention.
      const readiness = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });
      if (!readiness.configured) {
        return {
          published: false,
          cancelled: false,
          reason: "no-credential",
          message: `No publish credential is configured for '${target}'. Add one in the admin's Static Site tab (Deployment panel → Static Site → Publish) before publishing. (${readiness.reason})`,
        };
      }

      const basePath = computeBasePath(config);
      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: EXECUTE_STATIC_PUBLISH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildPublishConfirmationResource({ config, projectName, basePath, exchangeId: exchange.id });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the idle deadline — mirrors `content_post_delete`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        // `askThenReport`, not `askOnce` (`assistant/surface-exchanges.ts`) — see
        // `handlePublishConfirmationAnswer`'s own header for the full defect this closes and why the
        // handler is a separate top-level function rather than inlined here.
        const confirmationContext: PublishConfirmationContext = { deps, credentialSource, historyStore, exchange, config, target, projectName };
        // `<unknown>`, not left to infer: `handlePublishConfirmationAnswer`'s return type is a real
        // union across its several `return` statements (a no-answer result looks nothing like a
        // success result), and TypeScript's generic inference does not distribute a callback's union
        // return type across `askThenReport`'s single type parameter — it narrows to one branch and
        // then rejects the others. `unknown` is safe here specifically because `ToolHandler`
        // (`@jini-ai/core`) already declares every handler's own return as `Promise<unknown>`, so
        // nothing downstream of this call needed `result`'s precise shape anyway.
        return await askThenReport<unknown>(exchange, { channel: "mcp-ui", payload: { resource: ui } }, (answer) =>
          handlePublishConfirmationAnswer(answer, confirmationContext)
        );
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },

    /**
     * The MCP-UI form-gated credential save for the 'Custom' tab's S3-compatible protocol. Same
     * shape as `deployment_execute_static_publish` above (open an exchange, emit a surface, park on
     * `askOnce`), but a FORM (`buildFormSurface`) rather than a confirmation dialog — spec §6b/§6c:
     * the model is proposing STRUCTURE for a human to fill in, not a fact for them to agree to.
     *
     * The structural guarantee this whole handler exists to uphold (spec §6c, restated here because
     * it is the single most important property of this function): `PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_SCHEMA`
     * has NO `accessKeyId`/`secretAccessKey` property. The model cannot supply, request, or leak the
     * secret through this tool's call surface even in principle. The human's typed secret lands in
     * `answer.params` inside this Node.js handler, server-side, and is sealed via
     * `createVendorCredential`/`updateVendorCredential` (Phase 3 cutover, this dispatch — see this
     * handler's own body for the storage-target change) — it never enters a prompt or a completion,
     * and this handler's own return value never echoes any field, secret or not.
     */
    deployment_propose_custom_provider_credential: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      requireS3CompatibleProtocol(raw, PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.credentials.write", entityType: "site-publish" });

      // Fail closed rather than degrade — identical posture to `deployment_execute_static_publish`'s
      // own guard above.
      if (!ctx.emitSurface) {
        throw new Error(
          "deployment_propose_custom_provider_credential: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a credential form cannot be shown here. Nothing was saved."
        );
      }

      const prefill = buildS3CompatiblePrefill(raw);
      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildProposeCredentialForm(exchange, prefill);

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        return await handleProposeCredentialAnswer(answer, deps);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },

    /**
     * Pure read — composes hosting-setup guidance from a fixed per-provider template, the caller's own
     * `bucket`/`region`, and a provider inferred from `endpoint` (never a saved credential; this
     * handler never reads one). See {@link buildHostingSetupContent} for the actual per-provider
     * content and spec §3a for the full reasoning on why this is a read tool with no MCP-UI gate.
     */
    deployment_generate_bucket_hosting_setup: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      requireS3CompatibleProtocol(raw, "deployment_generate_bucket_hosting_setup");
      const bucket = requireString(raw, "bucket");
      const region = requireString(raw, "region");
      const endpoint = typeof raw.endpoint === "string" ? raw.endpoint : undefined;

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const provider = inferHostingSetupProvider(endpoint);
      const { steps, warning } = buildHostingSetupContent(provider, bucket, region);
      return { provider, steps, warning };
    },
  };

  // No `unwiredToolIds`: this domain now wires its ENTIRE catalog, same tripwire discipline as
  // Posts/Pages/Forms/Entries/Widgets — a 4th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "static-publish",
    catalogModule: "features/deployments/publish-agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: staticPublishDerivedRisk,
  });
}

/**
 * Contributes Static Publish's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module.
 *
 * 2026-08-17: Static Publish was tried for the tool-contribution registry in Stage 2 batch 2 and
 * reverted the same session, for the IDENTICAL reason as this directory's sibling
 * `tool-registrations.ts` (`deployments`, also reverted that batch): `check:architecture`'s module
 * graph is per-directory, and `src/features/deployments` (this file's own module) already sat
 * downstream of a chain `assistant` reached unconditionally — `assistant -> features/vendor-
 * credentials -> features/source-control -> features/deployments` (the last hop via
 * `source-control/store.ts`'s value import of THIS file's own `static-publish/index.ts`'s
 * `extractGitHubLogin`) — so adding a `static-publish -> assistant` registry edge closed the same
 * real 4-module cycle: `assistant, features/deployments, features/source-control, features/vendor-
 * credentials`. Confirmed via `check:architecture --list` (largest strongly-connected component,
 * runtime-only: 0 -> 4) — verified directly rather than assumed from the sibling file's result,
 * since they are different files even though the same module.
 *
 * RETRIED 2026-08-17 (same day, later pass) after `vendor-credentials/dual-read.ts`'s Option B fix
 * landed and `source-control` converted cleanly on top of it — see
 * `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`. Reverted
 * again: `features/deployments/tool-registrations.ts`'s own sibling attempt (this SAME module, tried
 * immediately before this one) found a DIFFERENT, previously-undocumented edge the design report
 * never analyzed — `features/vendor-credentials/store.ts:5` (not `dual-read.ts`) value-imported
 * `extractGitHubLogin` from THIS FILE's own `./static-publish/index` directly, for
 * `createVendorCredential`'s GitHub-login-probe logic. Confirmed here too, empirically, by actually
 * wiring `registerToolContributor({domain: "static-publish", ...})` and running `check:architecture
 * --list`: the identical NEW 3-module cycle — `[assistant, features/deployments, features/vendor-
 * credentials]` — via `assistant -> features/vendor-credentials` (unconditional,
 * `REAL_VENDOR_CREDENTIAL_PORT`) -> `features/vendor-credentials/store.ts` (`extractGitHubLogin`) ->
 * `features/deployments` (this module, either file) -> back to `assistant`.
 *
 * RETRIED AND LANDED HERE (2026-08-17, same session) once `vendor-credentials/store.ts`'s own
 * `extractGitHubLogin` value import was ALSO cut using the same Option-B-style injection technique —
 * see that file's header ("Why `probeAccountLabel`'s GitHub-login extractor is INJECTED, not
 * imported") for the full trace. Landed in lockstep with this directory's sibling
 * `tool-registrations.ts` (`deployments`) — the two share this one `features/deployments` module at
 * `check:architecture`'s per-directory granularity, so a `check:architecture` run mid-way through
 * converting only one of the two would (and empirically did, when tried in isolation) still report a
 * live 2-module `[assistant, features/deployments]` cycle from whichever one is still wired via a
 * value import. Both converted together, `check:architecture` confirms 0 module cycles / largest SCC
 * 0.
 */
export function contributeStaticPublishTools(): void {
  registerToolContributor({ domain: "static-publish", build: buildStaticPublishRegistrations, risk: staticPublishDerivedRisk });
}
