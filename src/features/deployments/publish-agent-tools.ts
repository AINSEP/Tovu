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
 * `features/deployments/static-publish` domain logic (agent-tool layer), plus this dispatch's
 * necessary crossing into `#src/server/routes/types`'s `RouteDeps` (type-only) — `publishStaticSite`
 * needs the full composition-root deps bag to run a real `exportSite` pass immediately before
 * publishing, the exact same reason this directory's sibling `tool-registrations.ts` documents for
 * `DeploymentsToolDeps = RouteDeps` and `deployment_trigger_export`. No dependency on this directory's
 * sibling `agent-tools.ts`/`tool-registrations.ts`/`ports.ts`/`types.ts`.
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
import { buildConfirmationSurface, buildFormSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

// TYPE-ONLY — fully erased at compile time, so this creates no runtime require() and cannot recreate
// the circular-load crash a VALUE import of `#src/export/index` caused inside `export-run.ts` and
// (via `static-publish/adapter.ts`'s own `exportSiteLazily`) inside this feature's own preview tool
// wiring — see `adapter.ts`'s header for that trace, and `deployments/tool-registrations.ts`'s
// `DeploymentsToolDeps` doc for why a `type`-only import of the same symbol is safe where a value one
// is not.
import type { RouteDeps } from "#src/server/routes/types";

import { askOnce, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceExchange } from "../../assistant/surface-exchanges";
import { createPublishCredential, listPublishCredentials, updatePublishCredential, type PublishCredentialReadDeps, type PublishCredentialWriteDeps } from "./publish-credentials/index";
import { S3_COMPATIBLE_FIELD_GUIDANCE, S3_COMPATIBLE_FORM_DESCRIPTION } from "./publish-credentials/s3-compatible-field-guidance";
import {
  composePublishCredentialSource,
  computeBasePath,
  publishStaticSite,
  validateStaticPublishConfig,
  type PublishCredentialSource,
  type StaticPublishConfig,
  type StaticPublishDeps,
  type StaticPublishTargetId,
} from "./static-publish/index";

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
      description: "GitHub owner or organization login. Required (and only used) when target is 'github-pages'.",
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
      "Reports live publish readiness for all five static-publish targets (github-pages, vercel, netlify, cloudflare-pages, s3-compatible) WITHOUT decrypting or exposing any credential: for each provider, whether it is ready to publish to right now, every named credential set saved for it (id, label, isDefault, createdAt, updatedAt — NEVER a token, ciphertext, or masked tail), and — for a provider that is NOT ready — a human-readable reason naming what is missing (e.g. no credential saved for this workspace, or a required field such as Cloudflare Pages' account id is not configured). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). If a provider is not ready: for github-pages/vercel/netlify/cloudflare-pages, tell the human to add or fix that provider's credential themselves in the admin's Static Site tab (Deployment panel → Static Site → Publish), which saves it encrypted server-side and never shows it to you. For s3-compatible specifically, you can instead offer to help right here in chat — call deployment_propose_custom_provider_credential, which shows the human an editable form to fill in (you never see or handle the secret fields).",
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
  // -> on submit, calls `createPublishCredential`/`updatePublishCredential` — a real encrypted write
  // to `publish_credential_sets`. No secret ever transits the model (see this file's header/the
  // catalog entry's own comment); the write itself is still a genuine external-account-scoped
  // mutation, same category (not merely "some risk classification") as the publish tool above.
  ["deployment_propose_custom_provider_credential", "mutates-durable-state"],
  // -> composes prose/JSON from fixed templates plus the caller-supplied bucket/region/endpoint
  // (never a saved secret — this handler never reads a credential at all, saved or otherwise). No
  // repo write, no command gateway, no outbox, no network call, no decrypt.
  ["deployment_generate_bucket_hosting_setup", "none"],
]);

/**
 * The exact slice of the route-deps bag this domain's tool handlers read. Unlike this file's previous
 * revision (preview-only), this is now `RouteDeps` itself rather than a narrow structural stand-in —
 * `deployment_execute_static_publish`'s confirmed path calls `publishStaticSite`, which needs the
 * FULL composition-root bag to run a real `exportSite` pass (identical reasoning to this directory's
 * sibling `tool-registrations.ts`'s `DeploymentsToolDeps = RouteDeps`; see that file's own doc for why
 * no honest narrower type exists). This also fixes a real, latent gap the preview-only revision left
 * behind: that revision's `dbCredentialDeps?` field was never populated by the one real production
 * caller (`agent-daemon-server.ts` spreads the flat `RouteDeps`-shaped bag with no nested
 * `dbCredentialDeps` key), so the DB-backed credential store was silently never consulted by any
 * static-publish agent tool — only the env-var fallback ever ran. Reading `publishCredentialSetRepo`/
 * `siteAssistantSecretSealer`/`publishExecutionMode` directly off this (now-required) `RouteDeps`
 * shape, exactly as `publish-site.ts`'s own route already does, closes that gap.
 */
export interface StaticPublishToolDeps extends RouteDeps {
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
}

function buildPreviewConfig(raw: Record<string, unknown>): StaticPublishConfig {
  const target = raw.target as StaticPublishTargetId;
  if (target === "github-pages") {
    const owner = typeof raw.owner === "string" ? raw.owner : "";
    const repo = typeof raw.repo === "string" ? raw.repo : "";
    return { target, owner, repo, ...(typeof raw.branch === "string" ? { branch: raw.branch } : {}) };
  }
  if (target === "vercel") {
    return { target, ...(typeof raw.teamId === "string" ? { teamId: raw.teamId } : {}) };
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

/**
 * Builds this domain's `ToolRegistration[]` — the same shape every other domain's
 * `build<Domain>Registrations` produces (see e.g. `recovery/tool-registrations.ts`'s
 * `buildRecoveryRegistrations`). Called by `assistant/tool-registrations.ts`, which imports
 * `buildStaticPublishRegistrations`/`staticPublishDerivedRisk` from this file and lists them as
 * their own `"static-publish"` entry in `DOMAIN_SLICES` — see that file's own comment on that entry
 * for why static-publish stays a separate slice rather than folding into this directory's sibling
 * `deployments`/`agent-tools.ts` slice.
 *
 * @param deps - `RouteDeps` plus this file's own test-only overrides (`credentialSource`,
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

  const handlers: Record<string, ToolHandler> = {
    deployment_preview_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const target = requireString(raw, "target");
      if (target !== "github-pages" && target !== "vercel" && target !== "netlify" && target !== "cloudflare-pages" && target !== "s3-compatible") {
        throw new Error("'target' must be one of: github-pages, vercel, netlify, cloudflare-pages, s3-compatible");
      }

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const config = buildPreviewConfig(raw);
      const validationError = validateStaticPublishConfig(config);
      const basePath = validationError ? undefined : computeBasePath(config);
      // `isConfigured()`, NOT `resolve()` — this is an agent-facing read; per this file's own header
      // (and `static-publish/types.ts`'s `PublishCredentialSource` doc) an agent-facing path must
      // never be able to resolve a real credential, even indirectly by reading `.ok` off it.
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });

      return {
        target,
        valid: validationError === null,
        ...(validationError !== null ? { validationError } : {}),
        basePath: basePath ?? null,
        credentialsConfigured: credential.configured,
        ...(!credential.configured ? { credentialGuidance: credential.reason } : {}),
        willInjectNojekyll: target === "github-pages",
      };
    },

    /**
     * Never decrypts — reads through `listPublishCredentials` (a pure DB read; see that function's
     * own "read model only" doc in `publish-credentials/store.ts`) and `credentialSource.isConfigured`
     * (this file's own preview handler already relies on the identical never-decrypting contract).
     * Structurally cannot reach `resolveForPublish`/`resolveDefaultForPublish`: this handler is never
     * given a `SecretSealerPort`, and both of those functions require one.
     */
    deployment_get_static_publish_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const saved = await listPublishCredentials({ repo: deps.publishCredentialSetRepo } satisfies PublishCredentialReadDeps, {
        workspaceId: deps.workspaceId,
      });

      const providers = await Promise.all(
        PROVIDER_IDS.map(async (providerId) => {
          const savedCredentials = saved
            .filter((credential) => credential.providerId === providerId)
            .map((credential) => ({
              id: credential.id,
              label: credential.label,
              isDefault: credential.isDefault,
              createdAt: credential.createdAt,
              updatedAt: credential.updatedAt,
            }));
          const readiness = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target: providerId });

          return {
            providerId,
            ready: readiness.configured,
            savedCredentials,
            ...(readiness.configured ? {} : { guidance: readiness.reason }),
          };
        })
      );

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
      const target = requireString(raw, "target");
      if (target !== "github-pages" && target !== "vercel" && target !== "netlify" && target !== "cloudflare-pages" && target !== "s3-compatible") {
        throw new Error("'target' must be one of: github-pages, vercel, netlify, cloudflare-pages, s3-compatible");
      }
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
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

        // ADR-055 Decision 6: the no-answer path is a result, not an exception. Nothing was published
        // either way, and the model is still alive to read this and say something sensible.
        if (answer.status !== "received") {
          return {
            published: false,
            cancelled: false,
            reason: answer.status,
            note:
              answer.status === "expired"
                ? "The user did not respond to the publish confirmation dialog before it expired. Nothing was published."
                : "The confirmation dialog was closed because the run ended. Nothing was published.",
          };
        }

        const decision = typeof answer.params.decision === "string" ? answer.params.decision : "confirm";
        if (decision !== "confirm") {
          return { published: false, cancelled: true, target, projectName };
        }

        const outcome = await publishStaticSite(
          { credentialSource, ...(deps.buildTarget !== undefined ? { buildTarget: deps.buildTarget } : {}) },
          { workspaceId: deps.workspaceId, routeDeps: deps, config, projectName }
        );

        if (outcome.ok === "partial") {
          // "Uploaded, but not yet reachable" (spec `custom-publish-provider-contract.md` §3a) — the
          // files DID upload (so `published: true`, never a hard failure), but the site is not
          // confirmed live yet (so `reachable: false`, never a plain success either). Structurally a
          // distinct branch from both — see `static-publish/types.ts`'s `StaticPublishOutcome` header
          // for why `outcome.ok` itself is `true | false | "partial"`, not merely a boolean.
          return {
            published: true,
            reachable: false,
            target: outcome.targetId,
            url: outcome.url,
            status: outcome.status,
            message: outcome.message,
            ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
            ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
          };
        }

        if (!outcome.ok) {
          // Every branch of `publishStaticSite`'s own failure contract (`static-publish/types.ts`'s
          // `StaticPublishOutcome` doc, `adapter.ts`'s own `catch`) is already an actionable,
          // credential-free message: `NO_CREDENTIALS_CONFIGURED` names the provider via the resolved
          // credential source's own reason text, a Cloudflare-Pages-credential-missing-its-account-id
          // failure names the exact missing field (`buildJiniTarget`'s own `DeployError`), and
          // `PROVIDER_ERROR` is `err.message` only — never a raw response body, never a credential.
          // Passed straight through rather than re-wrapped.
          return { published: false, cancelled: false, code: outcome.code, message: outcome.message };
        }

        return {
          published: true,
          reachable: true,
          target: outcome.targetId,
          url: outcome.url,
          status: outcome.status,
          ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
          ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
        };
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
     * `createPublishCredential`/`updatePublishCredential` — it never enters a prompt or a completion,
     * and this handler's own return value never echoes any field, secret or not.
     */
    deployment_propose_custom_provider_credential: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const protocol = requireString(raw, "protocol");
      if (protocol !== "s3-compatible") {
        throw new Error("deployment_propose_custom_provider_credential: 'protocol' must be 's3-compatible' — no other Custom-tab protocol exists yet.");
      }

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.credentials.write", entityType: "site-publish" });

      // Fail closed rather than degrade — identical posture to `deployment_execute_static_publish`'s
      // own guard above.
      if (!ctx.emitSurface) {
        throw new Error(
          "deployment_propose_custom_provider_credential: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a credential form cannot be shown here. Nothing was saved."
        );
      }

      const prefill: Partial<Record<"endpoint" | "region" | "bucket" | "publicUrl", string>> = {};
      for (const field of ["endpoint", "region", "bucket", "publicUrl"] as const) {
        if (typeof raw[field] === "string" && (raw[field] as string).trim() !== "") {
          prefill[field] = raw[field] as string;
        }
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );

      const ui = buildFormSurface({
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
        // Posts back rather than a silent close — same reasoning `demo-choices-tool.ts`'s own form
        // cancel action documents: with the call parked, a silent close would strand this handler for
        // the full TTL staring at a form the human already walked away from.
        cancel: {
          label: "Cancel",
          toolName: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID,
          params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true },
        },
        app: { appName: "tovu-deployment-propose-custom-provider-credential", appVersion: "1" },
        preferredFrameSize: ["100%", "560px"],
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

        if (answer.status !== "received") {
          return {
            saved: false,
            cancelled: false,
            reason: answer.status,
            note:
              answer.status === "expired"
                ? "The user did not respond to the credential form before it expired. Nothing was saved."
                : "The credential form was closed because the run ended. Nothing was saved.",
          };
        }
        if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
          return { saved: false, cancelled: true };
        }

        // Re-validate server-side, never trust the client-side `required` attribute — `form.ts` ships
        // `novalidate` on purpose (its own doc: the browser's bubble UI is unusable in the surface's
        // small iframe), so `createPublishCredential`/`updatePublishCredential`'s own `validateConnection`
        // (`store.ts`) is the ACTUAL enforcement point, not a redundant belt-and-braces check. Passing
        // the raw params straight through (rather than hand-building a typed object with fallback
        // empty strings) means there is exactly ONE place that decides what "valid" means.
        const params = answer.params;
        const connectionInput: Record<string, unknown> = { providerId: "s3-compatible" };
        for (const field of ["region", "bucket", "accessKeyId", "secretAccessKey", "publicUrl", "endpoint"] as const) {
          if (typeof params[field] === "string") connectionInput[field] = params[field];
        }

        const writeDeps: PublishCredentialWriteDeps = {
          repo: deps.publishCredentialSetRepo,
          sealer: deps.siteAssistantSecretSealer,
          keyring: deps.siteAssistantSecretKeyring,
          clock: deps.clock,
          idGen: deps.idGen,
        };

        try {
          // "One flat row per provider" (spec §9's label-UX resolution, restated at §4c): find this
          // workspace's existing s3-compatible row (a non-decrypting repo read) and UPDATE it if one
          // exists, otherwise CREATE — mirrors the admin's own `use-publish-credentials.hooks.ts`
          // save-path decision exactly (`defaultCredentialForProvider` + existing-then-update-else-create),
          // so a second save through chat behaves identically to a second save through the Custom tab.
          const existing = await deps.publishCredentialSetRepo.findDefaultByProvider({ workspaceId: deps.workspaceId, providerId: "s3-compatible" });
          if (existing) {
            await updatePublishCredential(writeDeps, { workspaceId: deps.workspaceId, id: existing.id, connection: connectionInput });
          } else {
            await createPublishCredential(writeDeps, { workspaceId: deps.workspaceId, label: CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL, connection: connectionInput });
          }
        } catch (err) {
          // `PublishCredentialValidationError`'s own messages never carry a field VALUE, only field
          // NAMES and the provider id (`store.ts`'s `requireNonEmptyString`/`optionalString`) — safe
          // to relay. Any other store error (e.g. the secret store being unconfigured) still gets
          // `err.message` only, matching `deployment_execute_static_publish`'s own "message, never the
          // raw error" boundary discipline.
          return { saved: false, cancelled: false, reason: "invalid", message: err instanceof Error ? err.message : String(err) };
        }

        // NEVER echoes a field value, secret or not — the structural guarantee this handler's own doc
        // comment states up front.
        return { saved: true, providerId: "s3-compatible", connected: true };
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
      const protocol = requireString(raw, "protocol");
      if (protocol !== "s3-compatible") {
        throw new Error("deployment_generate_bucket_hosting_setup: 'protocol' must be 's3-compatible' — no other Custom-tab protocol exists yet.");
      }
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
