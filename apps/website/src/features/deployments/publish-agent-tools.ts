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
// the circular-load crash a VALUE import of `#src/features/site-export/index` caused inside `export-run.ts` and
// (via `static-publish/adapter.ts`'s own former `exportSiteLazily`) inside this feature's own preview
// tool wiring — see `adapter.ts`'s header for that trace. `ExportReport` is needed here only to type
// {@link ExportSiteBoundFn}'s return value — see that type's own doc for why this file declares its
// own copy rather than naming `RouteDeps` (2026-08-20 RouteDeps-narrowing fix).
import type { ExportReport } from "#src/features/site-export/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { PublishExecutionMode } from "./publish-credentials/index.js";
import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js";

import type { ToolContributor } from "#src/assistant/index";

import { askOnce, askThenReport, classifyConfirmationAnswer, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type SurfaceExchange, type SurfaceMessage } from "../../contracts/core/tool-surface-exchanges.js";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`tool-surface-exchanges.ts` re-exports the
// functions that use it, but not the type) — imported directly here so the extracted
// `mapPublishOutcomeToToolResult`/`buildAlreadyRunningResult`/`handlePublishConfirmationAnswer`
// helpers below can name their own `askThenReport`-shaped return type explicitly.
// `ToolInputError` alongside it — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError, type SurfaceEmission } from "@jini-ai/core";
import { listPublishCredentials, type PublishCredentialReadDeps } from "./publish-credentials/index.js";
import { loadDeployTargetRegistry } from "./deploy-targets/registry.js";
import type { DeployTargetCredentialSpec, DeployTargetDescriptor, DeployTargetFieldSpec, DeployTargetRegistry, LoadedDeployTarget } from "./deploy-targets/types.js";
// Credential saves go through `publish-credentials/store.ts`, the same store the admin's Static Site
// tab writes, so a row saved from chat is the row a publish resolves.
import { createPublishCredential, updatePublishCredential, type PublishCredentialWriteDeps } from "./publish-credentials/index.js";
import {
  composePublishCredentialSource,
  getPublishRunSnapshot,
  planStaticPublish,
  readStaticPublishConfig,
  runPublishAndAwait,
  unknownTargetMessage,
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

/** `deployment_preview_static_publish`'s input — the same target-discriminated shape
 *  `publish-site.ts`'s trigger route body uses, minus `projectName` (a preview never runs a real
 *  publish, so there is no commit-message/project-name label to validate). Reused (spread) by
 *  {@link EXECUTE_STATIC_PUBLISH_SCHEMA} below, which adds the one field a real publish needs. */
const PREVIEW_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  // Each host's own config fields (its `configFields` in deployment_get_static_publish_capabilities),
  // as top-level strings. The handler refuses any key the chosen host does not declare.
  additionalProperties: { type: "string" },
  required: ["target"],
  properties: {
    target: {
      type: "string",
      description:
        "Which host to publish to: one of the providerId values deployment_get_static_publish_capabilities lists. Pass that host's configFields as top-level string fields next to target (for example { target, <fieldName>: '<value>' }); a field the host does not declare is refused. The base path is computed from the host and the config, never passed in.",
    },
  },
} as const;

/** `deployment_execute_static_publish`'s input — {@link PREVIEW_STATIC_PUBLISH_SCHEMA}'s fields plus
 *  `projectName`, the one field a real publish needs that a preview does not. Deliberately carries NO
 *  token/credential field of any kind — see this file's header for why that is structural, not just
 *  undocumented. */
const EXECUTE_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: PREVIEW_STATIC_PUBLISH_SCHEMA.additionalProperties,
  required: ["target", "projectName"],
  properties: {
    ...PREVIEW_STATIC_PUBLISH_SCHEMA.properties,
    projectName: {
      type: "string",
      description: "Human-facing label for this publish run: the host uses it as the commit message or the project-name seed. 1-200 characters.",
    },
  },
} as const;

/** `deployment_propose_custom_provider_credential`'s input: the host, plus optional pre-fill hints
 *  named after that host's non-secret credential fields. There is no secret property to fill in; the
 *  handler refuses a secret or undeclared field before any form is raised. */
const PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_SCHEMA = {
  type: "object",
  additionalProperties: { type: "string" },
  required: ["target"],
  properties: {
    target: {
      type: "string",
      description:
        "Which host to save a connection for: one of the providerId values deployment_get_static_publish_capabilities lists. Optionally pass that host's NON-secret credential fields as top-level string pre-fill hints (the human can change them before submitting); a secret or undeclared field is refused.",
    },
  },
} as const;

/** `deployment_generate_bucket_hosting_setup`'s input: the host, plus the non-secret credential
 *  fields its plugin module needs to compose the steps (a bucket and region, for example). */
const GENERATE_BUCKET_HOSTING_SETUP_SCHEMA = {
  type: "object",
  additionalProperties: { type: "string" },
  required: ["target"],
  properties: {
    target: {
      type: "string",
      description:
        "Which host to generate hosting-setup steps for: one of the providerId values deployment_get_static_publish_capabilities lists. Pass that host's non-secret credential fields as top-level strings (for object storage: bucket, region and, when not plain AWS, endpoint).",
    },
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
      "Previews publishing the current site WITHOUT publishing anything: validates the target's config fields, reports the base path a real publish would use (computed from the host and its config, never passed in, so it can never mismatch the export), and reports whether a publish credential is configured for that target (true/false only, never the credential itself). Use this before telling a human what a publish would do, or to check readiness. This tool NEVER publishes, writes, or sends anything anywhere; it is a pure read. Account fields: when a host's config field names the account to publish under (an owner, user or organization), do NOT guess it from the human's name, email address or any other context. Call deployment_get_static_publish_capabilities first: a verified credential reports its real account login as that provider's accountLabel. Default the field to accountLabel when present, and still confirm it with the human before publishing, because a saved token's account is not always the person asking and a wrong account publishes somewhere they may not control. If accountLabel is null the account is UNKNOWN: say so plainly and ask the human directly. Never soften that question with an illustrative example, placeholder, or 'e.g. <name>' value of any kind: this tool cannot know whether a made-up example matches a real account, and offering one is how an invented account name once got published to.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: PREVIEW_STATIC_PUBLISH_SCHEMA,
  },
  {
    name: "deployment_get_static_publish_capabilities",
    description:
      "Reports live publish readiness for every static-publish host the turned-on deploy plugin provides, WITHOUT decrypting or exposing any credential. For each provider: providerId and label; configFields (the fields to pass to deployment_preview_static_publish/deployment_execute_static_publish as top-level strings: name, label, required, help); whether it is ready to publish to right now (ready is true ONLY when a credential is saved AND it was last verified to actually work against the real provider; a saved-but-unverified or saved-but-failing credential is reported as NOT ready, distinctly from no credential at all); credentialConfigured (true iff a credential row/env var exists at all for this provider. This is the field that answers 'is anything saved', kept deliberately separate from verified/accountLabel below: credentialConfigured:true with accountLabel:null means a credential EXISTS but its account identity is not yet known (never verified, or a verify that has not run since), which is a completely different situation from credentialConfigured:false, where nothing is saved for this provider at all and the human needs to add one before anything else is possible); every named credential set saved for it (id, label, isDefault, createdAt, updatedAt, tokenTail: the LAST 4 CHARACTERS ONLY of that credential's token or secret key, held in the clear so it can be shown to a human as a short identifier like '••••ab12' when they have more than one saved connection for a provider; it is NEVER the full token, a longer fragment, or any ciphertext); the cached verification state (verified: 'valid' | 'invalid' | 'unreachable' | null, and verifiedAt. null means configured but never verified; 'unreachable' means the last check could not reach the provider due to a network issue and does NOT mean the credential is bad, distinctly from 'invalid', which means the provider itself rejected it; this is a CACHED result from the last time a human verified it, possibly stale, never a live check made by this call); accountLabel (the verified credential's own public account login/username, or null when not yet verified or for a provider with no such field to report; NEVER an email, plan, or org. Use it as the default for a config field that names the account to publish under, instead of guessing one from the human's name or email address, and still confirm it with the human before publishing; when accountLabel is null, say plainly that the account is not known yet and ask the human directly. NEVER offer an example, placeholder, or 'e.g. <name>' value to illustrate the answer, even a made-up-looking one, since this tool has no way to know whether it happens to match a real account); lastPublish (the last successful publish to this provider from this server: target, url, reachable, status, projectName, publishedAt and the config it used, or null if this provider has never been published to from here. When the human asks to 'publish again' or 'publish the same way as last time', use this to fill the config fields and projectName without asking, and report the previous url when relevant); and, for a provider that is NOT ready, a human-readable reason naming what is missing or wrong (no credential saved for this workspace, a required credential field is not configured, the credential has never been verified yet, it was rejected by the provider, or the last check could not reach the provider). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason: a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). If a provider is not ready, tell the human to add or fix that provider's credential themselves in the admin's Static Site tab (Deployment panel → Static Site → Publish), which saves it encrypted server-side and never shows it to you. You can also offer to help right here in chat: deployment_propose_custom_provider_credential shows the human an editable form for any host that takes a saved credential (you never see or handle the secret fields).",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "deployment_execute_static_publish",
    description:
      "Publishes the current site as a FRESH static export to one of the hosts deployment_get_static_publish_capabilities lists, using the workspace's own SAVED credential for that provider (configured by a human in the admin's Static Site tab; this tool takes no token/credential field of any kind, and refuses any field the host does not declare). HUMAN-GATED: call it with just { target, projectName, ...that host's configFields as top-level strings }. This ONE call shows an interactive confirmation dialog naming exactly what will be published and to where, and WAITS: it does not return until the human answers or the dialog times out. There is no second call to make, and no confirmation token to invent or pass. If the human clicks Publish, THIS SAME CALL runs the publish and returns { published: true, reachable: true, target, url, status, basePath? } for a full, confirmed-live success. Some hosts (object storage behind a CDN or public-hosting step, see deployment_generate_bucket_hosting_setup) can upload successfully while the public URL is not YET reachable: that honest partial outcome returns { published: true, reachable: false, target, url, status, message, basePath? }; the files DID upload, but do not tell the user the site is live until reachable is true. If they click Cancel, it returns { published: false, cancelled: true }. If nobody answers before the dialog expires (or the run ends first), it returns { published: false, cancelled: false, reason: 'expired' | 'abandoned' }. If no credential is configured yet for the requested provider, this returns { published: false, reason: 'no-credential', message }, naming the provider and pointing to the right tab, WITHOUT ever raising a dialog (call deployment_get_static_publish_capabilities first to check readiness and avoid this). Every other failure (a saved credential missing a required field, a rejected provider API call, an export failure) is returned as { published: false, code, message } with an actionable message describing what went wrong; it never echoes a credential or a raw provider response body. The result is immediately LIVE on the public internet the moment it returns published:true AND reachable:true, and may be crawled, cached, or indexed within seconds; irreversible in the sense that matters, since a later republish overwrites what is HOSTED but can never retract what was already public. Simply wait for the result and report the true outcome to the user; do not tell them a dialog is open and stop, and do not re-call this tool while a call is already pending (a fresh call raises a second, separate dialog rather than answering the first).",
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
      "Saves a publish connection (the credential) for one host, through a form the human fills in. Some hosts need setup before the credential is useful (object storage needs a bucket, public hosting in front of it, and an access key scoped to that bucket): the form's own description says so, and deployment_generate_bucket_hosting_setup composes the hosting steps. HUMAN-GATED, same shape as deployment_execute_static_publish: call it with just { target, ...any NON-secret credential fields you already know from the conversation, as optional pre-fill hints }. This ONE call shows an editable form for the human to fill in, including the host's secret fields (a token, a secret key), which you cannot supply, see, or guess: a secret passed here is refused, and you must never ask the human to paste one into chat instead of the form. It WAITS: it does not return until the human submits or cancels, or the form times out. It returns { saved: true, providerId, connected: true } on a successful save, { saved: false, cancelled: true } if the human cancels, { saved: false, cancelled: false, reason: 'expired' | 'abandoned' } if nobody answered, or { saved: false, cancelled: false, reason: 'invalid', message } if the human submitted something incomplete (message names which field, never its value). It never echoes any field value, secret or otherwise, back to you. Do not re-call this tool while a call is already pending.",
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
      "Generates the exact steps (and, where applicable, the exact policy JSON with the real names substituted in) a host needs in the human's own console before a published site is reachable, such as making a storage bucket publicly readable. Only some hosts have such steps; for the others this refuses with the reason. Tovu composes this but NEVER applies it: the human applies it themselves in their own provider console. This is a PURE READ: it writes nothing, calls no API, and does not need a saved credential (call it before or after deployment_propose_custom_provider_credential). Relay the returned 'steps' as prose plus copyable code blocks for any 'consoleJson' present, and relay 'warning' verbatim if present: it can say the step needs a DIFFERENT login than the saved credential, so say so plainly.",
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
  // -> on submit, calls `createPublishCredential`/`updatePublishCredential` — a real encrypted write to
  // `vendor_credential_sets`.
  // No secret ever transits the model (see this file's header/the catalog entry's own comment); the
  // write itself is still a genuine external-account-scoped mutation, same category (not merely "some
  // risk classification") as the publish tool above.
  ["deployment_propose_custom_provider_credential", "mutates-durable-state"],
  // -> the host plugin module's pure `hostingSetup` over the caller's non-secret fields (never a saved
  // credential). No write, no network call, no decrypt.
  ["deployment_generate_bucket_hosting_setup", "none"],
]);

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
 * Every other field below is a direct port type (never an indexed-access off `RouteDeps`).
 */
export interface StaticPublishToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly idGen: { newId(): string };
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
   *  (DB-backed + env-fallback composition, `vendorCredentialSetRepo`/`siteAssistantSecretSealer`/
   *  `publishExecutionMode` are all ignored). Production never sets this. */
  credentialSource?: PublishCredentialSource;
  /** Test-only override for `publishStaticSite`'s own `StaticPublishDeps.buildTarget` — lets a test
   *  substitute a fake `DeployTarget` so `deployment_execute_static_publish`'s CONFIRMED path can be
   *  exercised end-to-end without ever constructing a real GitHub/Vercel/Netlify/Cloudflare Pages
   *  client or touching `fetch` (mirrors `static-publish/adapter.ts`'s own test-injection seam,
   *  "adapter tests with a faked deploy target — do not hit real providers in tests"). Production
   *  never sets this — `publishStaticSite`'s own default (the real Jini adapters) applies. */
  buildTarget?: StaticPublishDeps["buildTarget"];
  /** `RouteDeps.loadDeployTargets` — this workspace's deploy registry, which decides which config
   *  fields a target takes and judges them. Defaults to the installed deploy Agent Plugin
   *  (`loadDeployTargetRegistry`); a test injects a registry read from the plugin's source. */
  loadDeployTargets?: (workspaceId: string) => Promise<DeployTargetRegistry>;
  /** Test-only override for `RouteDeps.publishHistoryStore` (2026-08-16 rework — that field is now
   *  the real, DB-backed `SqlitePublishHistoryStore` in production; see `routes/types.ts`'s own doc)
   *  — lets a test inject an `InMemoryPublishHistoryStore` so it can assert on a recorded publish (or
   *  a capabilities read) without touching a real database. Passed straight through to
   *  `runPublishAndAwait` on a confirmed publish AND used by the capabilities handler's own read, so a
   *  test sees one consistent store on both sides. Production never sets this; both paths fall back to
   *  `deps.publishHistoryStore`, so a real publish's history is visible to this tool with no wiring
   *  change outside this domain (see `publish-run.ts`'s header, "Publish history"). */
  historyStore?: PublishHistoryStore;
}

/** {@link StaticPublishToolDeps.loadDeployTargets}, or the installed deploy Agent Plugin. */
function deployTargetsLoader(deps: StaticPublishToolDeps): (workspaceId: string) => Promise<DeployTargetRegistry> {
  return deps.loadDeployTargets ?? ((workspaceId) => loadDeployTargetRegistry({ workspaceId }));
}

/**
 * Reads a tool input into a publish config for `target` (already looked up in `registry`) and plans
 * it (`planStaticPublish`, the same call `publishStaticSite` makes). A blank optional field means "not
 * set", matching the old per-target builders.
 *
 * @throws {ToolInputError} A declared field is not a string.
 * @complexity O(f) declared fields.
 */
function planToolPublish(
  registry: DeployTargetRegistry,
  raw: Record<string, unknown>,
  target: LoadedDeployTarget
): { readonly config: StaticPublishConfig; readonly plan: ReturnType<typeof planStaticPublish>; readonly detailRows: DetailRow[] } {
  requireOnlyDeclaredFields(raw, target.descriptor);
  const read = readStaticPublishConfig(target, raw, { blankAsAbsent: true });
  if (!read.ok) throw new ToolInputError(read.message);
  return { config: read.config, plan: planStaticPublish(registry, read.config), detailRows: configDetailRows(read.config, target) };
}

/** The publish request's own keys; every other input key must be one of the host's config fields. */
const PUBLISH_REQUEST_KEYS: ReadonlySet<string> = new Set(["target", "projectName"]);

/** Refuses an input key the chosen host does not declare, so nothing (a token included) reaches a
 *  publish except the host's own config fields. The schemas allow any string key because the fields
 *  come from the host's descriptor.
 *  @throws {ToolInputError} naming the first undeclared key and the fields the host takes.
 *  @complexity O(k·f) input keys by declared fields. */
function requireOnlyDeclaredFields(raw: Record<string, unknown>, descriptor: DeployTargetDescriptor): void {
  const declared = descriptor.configFields.map((field) => field.name);
  const unknown = Object.keys(raw).find((key) => !PUBLISH_REQUEST_KEYS.has(key) && !declared.includes(key));
  if (unknown === undefined) return;
  const takes = declared.length > 0 ? `It takes: ${declared.join(", ")}.` : "It takes no config fields.";
  throw new ToolInputError(`'${unknown}' is not a field of ${descriptor.id}. ${takes}`);
}

/** One labelled row on a publish confirmation/outcome card. */
type DetailRow = { label: string; value: string };

/** The card rows for a publish: the target module's own `summarize` when it has one, otherwise one
 *  row per declared config field the publish carries, in declaration order and under its declared
 *  label. Which fields exist is the plugin's business, so nothing here names a host.
 *  @complexity O(f) declared fields. */
function configDetailRows(config: StaticPublishConfig, target: LoadedDeployTarget): DetailRow[] {
  if (target.module.summarize !== undefined) return target.module.summarize(config).map(({ label, value }) => ({ label, value }));
  return target.descriptor.configFields.flatMap((field) => {
    const value = config[field.name];
    return typeof value === "string" ? [{ label: field.label, value }] : [];
  });
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
  detailRows: readonly DetailRow[];
  projectName: string;
  basePath: string | undefined;
  exchangeId: string;
}): UIResource {
  const { config, detailRows, projectName, basePath, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: publishConfirmationUri(exchangeId),
    title: `Publish the site to ${config.target}?`,
    description: "The current site content will be exported fresh and published live, using this workspace's saved credential for this provider.",
    details: [
      { label: "Target", value: config.target },
      { label: "Project name", value: projectName },
      ...detailRows,
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
  detailRows: readonly DetailRow[];
  projectName: string;
  state: "success" | "partial" | "failure";
  message: string;
  url?: string;
}): UIResource {
  const { exchangeId, config, detailRows, projectName, state, message, url } = spec;
  const title = state === "success" ? "Published" : state === "partial" ? "Uploaded, not live yet" : "Publish failed";
  return buildOutcomeSurface({
    uri: publishConfirmationUri(exchangeId),
    title,
    details: [
      { label: "Target", value: config.target },
      { label: "Project name", value: projectName },
      ...detailRows,
    ],
    state,
    message,
    ...(url !== undefined ? { openLinkUrl: url, openLinkLabel: state === "partial" ? "Open when ready" : "Open site" } : {}),
    app: { appName: "tovu-deployment-execute-static-publish-outcome", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}

const PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID = "deployment_propose_custom_provider_credential";

/** The label a credential saved from chat is created under — mirrors
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

/** Shared `target` lookup for `deployment_preview_static_publish` and
 *  `deployment_execute_static_publish`: the input's `target` must be a host this workspace's deploy
 *  registry has loaded.
 *  @throws {ToolInputError} `raw.target` is missing, or no loaded plugin provides it.
 *  @complexity O(1) — one registry lookup. */
function requireStaticPublishTarget(raw: Record<string, unknown>, registry: DeployTargetRegistry): LoadedDeployTarget {
  const targetId = requireString(raw, "target");
  const target = registry.get(targetId);
  if (target === undefined) throw new ToolInputError(unknownTargetMessage(registry, targetId));
  return target;
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
  };
}

/** Per-provider dependencies {@link buildProviderCapability} needs — the already-fetched credential
 *  summaries plus every port it reads, so the capabilities handler's `registry.list().map()` callback
 *  stays a single call per provider rather than a long inline closure. */
interface ProviderCapabilityContext {
  readonly deps: StaticPublishToolDeps;
  readonly credentialSource: PublishCredentialSource;
  readonly historyStore: PublishHistoryStore;
  readonly saved: Awaited<ReturnType<typeof listPublishCredentials>>;
}

/** {@link buildProviderCapability}'s `savedCredentials` entries: no secret, only the token's last 4. */
function mapSavedCredentials(saved: Awaited<ReturnType<typeof listPublishCredentials>>) {
  return saved.map(({ id, label, isDefault, createdAt, updatedAt, tokenTail }) => ({ id, label, isDefault, createdAt, updatedAt, tokenTail }));
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
  readonly descriptor: DeployTargetDescriptor;
  readonly ready: boolean;
  readonly readiness: { configured: true } | { configured: false; reason: string };
  readonly verified: "valid" | "invalid" | "unreachable" | null;
  readonly verification: ReturnType<PublishCredentialVerificationCache["get"]>;
  readonly defaultCredential: { readonly accountLabel: string | null } | undefined;
  readonly lastPublish: Awaited<ReturnType<PublishHistoryStore["getLast"]>>;
  readonly savedCredentials: ReturnType<typeof mapSavedCredentials>;
  readonly guidance: string | undefined;
}) {
  const { descriptor, ready, readiness, verified, verification, defaultCredential, lastPublish, savedCredentials, guidance } = spec;
  return {
    providerId: descriptor.id,
    label: descriptor.label,
    // What a publish to this host takes, besides `target` and `projectName`: pass each as a
    // top-level string property of the same name.
    configFields: descriptor.configFields.map(({ name, label, required, help }) => ({ name, label, required, ...(help !== undefined ? { help } : {}) })),
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
 * `savedCredentials` are the rows of this host's vendor (`descriptor.credential.vendorId`), so every
 * host sharing a vendor lists the same saved connections. `credentialConfigured` comes from
 * `credentialSource.isConfigured` (a saved default, or in self-hosted mode an env var).
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
async function buildProviderCapability(loaded: LoadedDeployTarget, ctx: ProviderCapabilityContext) {
  const providerId = loaded.descriptor.id;
  const vendorId = loaded.descriptor.credential?.vendorId;
  const savedForVendor = vendorId === undefined ? [] : ctx.saved.filter((credential) => credential.vendorId === vendorId);
  const savedCredentials = mapSavedCredentials(savedForVendor);
  const defaultCredential = savedForVendor.find((credential) => credential.isDefault);
  const readiness = await ctx.credentialSource.isConfigured({ workspaceId: ctx.deps.workspaceId, target: providerId });
  // 2026-08-16, Defect 2: the last successful publish to this provider, if any — see
  // `publish-history.ts`'s own header for the storage design. `null` means never published (from
  // this server, in this history store) rather than an absent key, so an agent-facing JSON result
  // always carries the field.
  const lastPublish = await ctx.historyStore.getLast({ workspaceId: ctx.deps.workspaceId, target: providerId });
  const verification = readiness.configured ? ctx.deps.publishCredentialVerificationCache.get({ workspaceId: ctx.deps.workspaceId, target: providerId }) : undefined;
  const verified = verification ? verification.status : null;
  const ready = readiness.configured && verified === "valid";
  const guidance = buildCapabilityGuidance(providerId, readiness, verification);

  return buildProviderCapabilityResult({ descriptor: loaded.descriptor, ready, readiness, verified, verification, defaultCredential, lastPublish, savedCredentials, guidance });
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
  /** The card's config rows, labelled from the target descriptor (see `configDetailRows`). */
  readonly detailRows: readonly DetailRow[];
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
function buildAlreadyRunningResult(
  exchange: SurfaceExchange,
  config: StaticPublishConfig,
  detailRows: readonly DetailRow[],
  projectName: string
): { result: unknown; outcome: SurfaceEmission } {
  const message =
    "A publish is already running in this server (started via the admin UI or another agent call). Wait for it to finish, or check deployment_get_static_publish_capabilities/the Static Site tab for its status, then retry. This will not resolve on retry while it is still running.";
  return {
    result: { published: false, cancelled: false, reason: "already-running", message },
    outcome: {
      channel: "mcp-ui",
      payload: { resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, detailRows, projectName, state: "failure", message }) },
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
  detailRows: readonly DetailRow[],
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
          resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, detailRows, projectName, state: "partial", message: outcome.message, url: outcome.url }),
        },
      },
    };
  }
  if (!outcome.ok) {
    return {
      result: { published: false, cancelled: false, code: outcome.code, message: outcome.message },
      outcome: {
        channel: "mcp-ui",
        payload: { resource: buildPublishOutcomeResource({ exchangeId: exchange.id, config, detailRows, projectName, state: "failure", message: outcome.message }) },
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
          detailRows,
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
  // Fail-closed classification shared with `features/post/tool-registrations.ts`'s own
  // `resolveDeleteDecision` and its other forks (`contracts/core/tool-surface-exchanges.ts`'s
  // `classifyConfirmationAnswer`) — used directly here, not via `resolveConfirmationDecision`,
  // because `askThenReport` already delivered `answer` to this function; there is no second
  // `askOnce` round trip to share.
  const confirmation = classifyConfirmationAnswer(answer);
  if (!confirmation.confirmed) {
    if (confirmation.reason === "declined") {
      // No outcome surface for a cancel: the confirmation's own script already reports
      // "Dismissed."/"Done." locally the moment this tool call resolves, and that IS the truth for a
      // cancel (unlike a publish, nothing async happens afterward that could still fail).
      return { result: { published: false, cancelled: true, target: ctx.target, projectName: ctx.projectName } };
    }
    return { result: buildNoAnswerToolResult(confirmation.reason) };
  }

  if (getPublishRunSnapshot().status === "running") {
    return buildAlreadyRunningResult(ctx.exchange, ctx.config, ctx.detailRows, ctx.projectName);
  }

  const outcome = await runPublishAndAwait(
    {
      credentialSource: ctx.credentialSource,
      loadDeployTargets: deployTargetsLoader(ctx.deps),
      ...(ctx.deps.buildTarget !== undefined ? { buildTarget: ctx.deps.buildTarget } : {}),
    },
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

  return mapPublishOutcomeToToolResult(outcome, ctx.exchange, ctx.config, ctx.detailRows, ctx.projectName);
}

/** The host whose credential the propose-credential tool saves: it must be loaded and declare one.
 *  @throws {ToolInputError} unknown host, or a host that takes no saved credential.
 *  @complexity O(1) — one registry lookup. */
function requireCredentialTarget(raw: Record<string, unknown>, registry: DeployTargetRegistry): { readonly descriptor: DeployTargetDescriptor; readonly credential: DeployTargetCredentialSpec } {
  const { descriptor } = requireStaticPublishTarget(raw, registry);
  if (descriptor.credential === undefined) throw new ToolInputError(`${descriptor.id} takes no saved credential.`);
  return { descriptor, credential: descriptor.credential };
}

/**
 * The agent's non-secret credential-field values (form pre-fill, or hosting-setup input). Refuses a
 * secret field, so a secret can never come from the chat, and a field the host does not declare. A
 * blank value is left out.
 *
 * @throws {ToolInputError} naming the first refused key.
 * @complexity O(k·f) input keys by credential fields.
 */
function readCredentialHints(raw: Record<string, unknown>, descriptor: DeployTargetDescriptor): Record<string, string> {
  const fields = descriptor.credential?.fields ?? [];
  const hints: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "target") continue;
    const field = fields.find((candidate) => candidate.name === key);
    if (field === undefined) {
      const takes = fields.length > 0 ? `It takes: ${fields.map((candidate) => candidate.name).join(", ")}.` : "It takes none.";
      throw new ToolInputError(`'${key}' is not a credential field of ${descriptor.id}. ${takes}`);
    }
    if (field.secret === true) throw new ToolInputError(`'${key}' is secret: the person types it into the form, never into the chat.`);
    if (typeof value !== "string") throw new ToolInputError(`'${key}' must be a string.`);
    if (value.trim() !== "") hints[key] = value;
  }
  return hints;
}

/** The propose-credential form, built from the host's credential spec. Posts back on cancel rather
 *  than closing silently: with the call parked, a silent close would strand the handler for the full
 *  TTL. */
function buildProposeCredentialForm(exchange: SurfaceExchange, descriptor: DeployTargetDescriptor, credential: DeployTargetCredentialSpec, prefill: Record<string, string>): UIResource {
  return buildFormSurface({
    uri: customProviderCredentialFormUri(exchange.id),
    title: `Connect ${descriptor.label}`,
    ...(credential.help !== undefined ? { description: credential.help } : {}),
    submitLabel: "Save connection",
    toolName: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
    fields: credential.fields.map((field) => ({
      kind: "string",
      name: field.name,
      label: field.label,
      ...(field.help !== undefined ? { hint: field.help } : {}),
      required: field.required,
      ...(field.secret === true ? { secret: true } : {}),
      ...(prefill[field.name] !== undefined ? { value: prefill[field.name] } : {}),
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

/**
 * Saves the submitted form as the host's connection: updates the host's default row when it has one
 * (one row per host, as the admin tab shows it), otherwise creates one. Only the host's declared
 * fields are forwarded; `publish-credentials/store.ts` is the one place that decides what is valid
 * (the form ships `novalidate`, so this is the real enforcement point). Its messages name fields,
 * never values.
 *
 * @complexity O(n) in the workspace's saved credential count.
 */
async function saveProposedCredential(
  deps: StaticPublishToolDeps,
  targetId: string,
  credential: DeployTargetCredentialSpec,
  params: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const connection: Record<string, unknown> = { providerId: targetId };
  for (const field of credential.fields) {
    if (typeof params[field.name] === "string") connection[field.name] = params[field.name];
  }
  const writeDeps: PublishCredentialWriteDeps = {
    repo: deps.vendorCredentialSetRepo,
    loadDeployTargets: deployTargetsLoader(deps),
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };
  try {
    const saved = await listPublishCredentials(writeDeps, { workspaceId: deps.workspaceId });
    const existing = saved.find((row) => row.providerId === targetId && row.isDefault);
    if (existing) {
      await updatePublishCredential(writeDeps, { workspaceId: deps.workspaceId, id: existing.id, connection });
    } else {
      await createPublishCredential(writeDeps, { workspaceId: deps.workspaceId, label: CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL, connection });
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
async function handleProposeCredentialAnswer(answer: SurfaceMessage, deps: StaticPublishToolDeps, targetId: string, credential: DeployTargetCredentialSpec) {
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

  const saveResult = await saveProposedCredential(deps, targetId, credential, answer.params);
  if (!saveResult.ok) {
    return { saved: false, cancelled: false, reason: "invalid", message: saveResult.message };
  }

  // NEVER echoes a field value, secret or not.
  return { saved: true, providerId: targetId, connected: true };
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
      dbDeps: { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, loadDeployTargets: deployTargetsLoader(deps) },
    });
  const historyStore = deps.historyStore ?? deps.publishHistoryStore;

  const handlers: Record<string, ToolHandler> = {
    deployment_preview_static_publish: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const registry = await deployTargetsLoader(deps)(deps.workspaceId);
      const loaded = requireStaticPublishTarget(raw, registry);
      const target = loaded.descriptor.id;

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const { plan } = planToolPublish(registry, raw, loaded);
      const validationError = plan.ok ? null : plan.message;
      const basePath = plan.ok ? plan.basePath : undefined;
      // `isConfigured()`, NOT `resolve()` — this is an agent-facing read; per this file's own header
      // (and `static-publish/types.ts`'s `PublishCredentialSource` doc) an agent-facing path must
      // never be able to resolve a real credential, even indirectly by reading `.ok` off it.
      const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });

      return buildStaticPublishPreviewResult(target, validationError, basePath, credential);
    },

    /**
     * Never decrypts — reads through `listPublishCredentials` (a pure DB read of
     * `vendor_credential_sets`; see its own "read model only" doc) and `credentialSource.isConfigured`
     * (this file's own preview handler already relies on the identical never-decrypting contract).
     * Structurally cannot reach `resolveForPublish`/`resolveDefaultForPublish`: this handler never
     * hands them a `SecretSealerPort`. `tokenTail` is the stored last 4 characters, never derived by
     * decrypting.
     */
    deployment_get_static_publish_capabilities: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      const loadDeployTargets = deployTargetsLoader(deps);
      const saved = await listPublishCredentials({ repo: deps.vendorCredentialSetRepo, loadDeployTargets } satisfies PublishCredentialReadDeps, {
        workspaceId: deps.workspaceId,
      });

      const registry = await loadDeployTargets(deps.workspaceId);
      const providerCapabilityContext: ProviderCapabilityContext = { deps, credentialSource, historyStore, saved };
      const providers = await Promise.all(registry.list().map((loaded) => buildProviderCapability(loaded, providerCapabilityContext)));

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
      const registry = await deployTargetsLoader(deps)(deps.workspaceId);
      const loaded = requireStaticPublishTarget(raw, registry);
      const target = loaded.descriptor.id;
      const projectName = requireString(raw, "projectName");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.publish", entityType: "site-publish" });

      const { config, plan, detailRows } = planToolPublish(registry, raw, loaded);
      if (!plan.ok) {
        throw new ToolInputError(`deployment_execute_static_publish: ${plan.message}`);
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

      const basePath = plan.basePath;
      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: EXECUTE_STATIC_PUBLISH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildPublishConfirmationResource({ config, detailRows, projectName, basePath, exchangeId: exchange.id });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the idle deadline — mirrors `content_post_delete`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        // `askThenReport`, not `askOnce` (`assistant/surface-exchanges.ts`) — see
        // `handlePublishConfirmationAnswer`'s own header for the full defect this closes and why the
        // handler is a separate top-level function rather than inlined here.
        const confirmationContext: PublishConfirmationContext = { deps, credentialSource, historyStore, exchange, config, detailRows, target, projectName };
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
     * The MCP-UI form-gated credential save for any host whose plugin declares a credential. Same
     * shape as `deployment_execute_static_publish` above (open an exchange, emit a surface, park on
     * `askOnce`), but a FORM: the model proposes structure for a human to fill in.
     *
     * The schema has no secret property, and a secret or undeclared field is refused before any form
     * is raised. The human's typed secret lands in `answer.params` server-side and is sealed by
     * `publish-credentials/store.ts`; it never enters a prompt or a completion, and the result never
     * echoes any field.
     */
    deployment_propose_custom_provider_credential: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const { descriptor, credential } = requireCredentialTarget(raw, await deployTargetsLoader(deps)(deps.workspaceId));
      const prefill = readCredentialHints(raw, descriptor);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.credentials.write", entityType: "site-publish" });

      // Fail closed rather than degrade — identical posture to `deployment_execute_static_publish`'s
      // own guard above.
      if (!ctx.emitSurface) {
        throw new Error(
          "deployment_propose_custom_provider_credential: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a credential form cannot be shown here. Nothing was saved."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: PROPOSE_CUSTOM_PROVIDER_CREDENTIAL_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildProposeCredentialForm(exchange, descriptor, credential, prefill);

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        return await handleProposeCredentialAnswer(answer, deps, descriptor.id, credential);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },

    /**
     * Pure read — the host plugin module's own `hostingSetup` over the caller's non-secret credential
     * fields (never a saved credential). A host with no such steps is refused with the reason.
     */
    deployment_generate_bucket_hosting_setup: async (ctx) => {
      const raw = requireInputRecord(ctx.input);
      const loaded = requireStaticPublishTarget(raw, await deployTargetsLoader(deps)(deps.workspaceId));
      const { descriptor, module } = loaded;
      if (module.hostingSetup === undefined) throw new ToolInputError(`${descriptor.id} has no hosting-setup steps: publishing to it serves the site.`);
      const fields = readCredentialHints(raw, descriptor);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "deployments.read", entityType: "site-publish" });

      try {
        return module.hostingSetup({ fields });
      } catch (err) {
        throw new ToolInputError(err instanceof Error ? err.message : String(err));
      }
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
export function contributeStaticPublishTools(): ToolContributor {
  return { domain: "static-publish", build: buildStaticPublishRegistrations, risk: staticPublishDerivedRisk };
}
