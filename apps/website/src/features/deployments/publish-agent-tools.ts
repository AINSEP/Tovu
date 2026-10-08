import { toolMetadata } from '../../contracts/core/tool-metadata/deployments.js';
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/secret-form-cards.js";
import { defineSecretCardTool, type SecretCardField, type SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";
import { issueCredentialSetup } from "#src/contracts/core/tool-failure-diagnostics";
import { assertCredentialFreeField, type CredentialTokenHint } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint, translateCredentialMessage } from '../../contracts/core/credential-copy.js';
import { resolveOperatorLocale, type OperatorLocaleDeps } from '../agent-plugins/operator-locale.js';
import { PublishCredentialValidationError } from './publish-credentials/store.js';
import { verifyPublishCredentialById } from './static-publish/verify.js';
import { nowIso as clockNowIso, type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
/**
 * @file Static-publish tool catalog/wiring (ADR-049 Decision 4), separate from continuous deploy,
 * export and Dockerfile tools. The composition root installs this domain independently.
 *
 * Preview and capability reads use isConfigured and cached verification without probing providers
 * or resolving usable credentials. Capability summaries may unseal server-side only for safe
 * length/tail hints under the owner's policy; tokens/ciphertext never reach the model.
 * Configured means a saved row exists; ready additionally requires successful verification.
 * Permission enforcement happens at call time, beyond ADR-014's catalog visibility filter.
 *
 * Execution follows the shared human approval policy, validates targets/readiness and the active
 * run guard, then awaits truthful provider/reachability outcomes. Credential forms collect secrets
 * directly from the human. ExportSiteBoundFn supplies the real export without a RouteDeps back-edge.
 */
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireNoInput, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

// Type-only ExportReport avoids a runtime export/server cycle. ExportSiteBoundFn names the narrow
// operation contract locally instead of importing the composition root's RouteDeps type.
import type { ExportReport } from "#src/features/site-export/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { PublishExecutionMode } from "./publish-credentials/index.js";
import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js";

import type { ToolContributor } from "#src/assistant/index";

import { askThenReport, SURFACE_DISMISSED_PARAM, type AssistantSurfaceDeps, type SurfaceExchange } from "@jini-ai/daemon/surface-exchanges";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`@jini-ai/daemon/surface-exchanges` re-exports the
// functions that use it, but not the type) — imported directly here so the extracted
// `mapPublishOutcomeToToolResult`/`buildAlreadyRunningResult`/`handlePublishConfirmationAnswer`
// helpers below can name their own `askThenReport`-shaped return type explicitly.
// `ToolInputError` alongside it — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError, type SurfaceEmission } from "@jini-ai/core";
import { listPublishCredentials, type PublishCredentialReadDeps } from "./publish-credentials/index.js";
import { loadDeployTargetRegistry } from "./deploy-targets/registry.js";
import type { DeployTargetCredentialSpec, DeployTargetDescriptor, DeployTargetRegistry, LoadedDeployTarget } from "./deploy-targets/types.js";
import type { ObservabilityPort } from "#src/platform/observability/index";
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
      "Previews publishing the current site WITHOUT publishing anything: validates the target's config fields, reports the base path a real publish would use (computed from the host and its config, never passed in, so it can never mismatch the export), and reports whether a publish credential is configured for that target (true/false only, never the credential itself). Use this before telling a human what a publish would do, or to check readiness. This tool NEVER publishes, writes, or sends anything anywhere; it is a pure read. Account fields: when a host's config field names the account to publish under (an owner, user or organization), do NOT guess it from the human's name, email address or any other context. Call deployment_get_static_publish_capabilities first: a verified credential reports its real account login as that provider's accountLabel. Use the requested account, or default to accountLabel when present. Ask only when the target account is missing or ambiguous. If accountLabel is null and no account was supplied the account is UNKNOWN: say so plainly and ask the human directly. Never soften that question with an illustrative example, placeholder, or 'e.g. <name>' value of any kind: this tool cannot know whether a made-up example matches a real account, and offering one is how an invented account name once got published to.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: PREVIEW_STATIC_PUBLISH_SCHEMA,
  },
  {
    name: "deployment_get_static_publish_capabilities",
    description:
      "Reports live publish readiness for every static-publish host the turned-on deploy plugin provides, WITHOUT exposing any credential. Server-side unsealing derives only safe length and last-4 hints; short tokens expose length alone. For each provider: providerId and label; configFields (the fields to pass to deployment_preview_static_publish/deployment_execute_static_publish as top-level strings: name, label, required, help); whether it is ready to publish to right now (ready is true ONLY when a credential is saved AND it was last verified to actually work against the real provider; a saved-but-unverified or saved-but-failing credential is reported as NOT ready, distinctly from no credential at all); credentialConfigured (true iff a credential row/env var exists at all for this provider. This is the field that answers 'is anything saved', kept deliberately separate from verified/accountLabel below: credentialConfigured:true with accountLabel:null means a credential EXISTS but its account identity is not yet known (never verified, or a verify that has not run since), which is a completely different situation from credentialConfigured:false, where nothing is saved for this provider at all and the human needs to add one before anything else is possible); every named credential set saved for it (id, label, isDefault, createdAt, updatedAt, tokenHint: the server-derived length and last4, with no characters exposed for tokens shorter than 12; tokenTail: the same safe last4 or an empty string, so it can be shown to a human as a short identifier like '••••ab12' when they have more than one saved connection for a provider; it is NEVER the full token, a longer fragment, or any ciphertext); the cached verification state (verified: 'valid' | 'invalid' | 'unreachable' | null, and verifiedAt. null means configured but never verified; 'unreachable' means the last check could not reach the provider due to a network issue and does NOT mean the credential is bad, distinctly from 'invalid', which means the provider itself rejected it; this is a CACHED result from the last time a human verified it, possibly stale, never a live check made by this call); accountLabel (the verified credential's own public account login/username, or null when not yet verified or for a provider with no such field to report; NEVER an email, plan, or org. Use it as the default for a config field that names the account to publish under, instead of guessing one from the human's name or email address, using the requested account when supplied. Ask only when the account is missing or ambiguous; when accountLabel is null and no account was supplied, say plainly that the account is not known yet and ask the human directly. NEVER offer an example, placeholder, or 'e.g. <name>' value to illustrate the answer, even a made-up-looking one, since this tool has no way to know whether it happens to match a real account); lastPublish (the last successful publish to this provider from this server: target, url, reachable, status, projectName, publishedAt and the config it used, or null if this provider has never been published to from here. When the human asks to 'publish again' or 'publish the same way as last time', use this to fill the config fields and projectName without asking, and report the previous url when relevant); and, for a provider that is NOT ready, a human-readable reason naming what is missing or wrong (no credential saved for this workspace, a required credential field is not configured, the credential has never been verified yet, it was rejected by the provider, or the last check could not reach the provider). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason: a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). If a provider needs a missing or rejected credential, call credential_save with kind publish-host in this turn to open its secure card, then retry once after a successful save. The admin's Static Site tab (Deployment panel → Static Site → Publish) is an alternative for manual setup.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "deployment_execute_static_publish",
    description:
      "Publishes a fresh static export immediately to a host listed by deployment_get_static_publish_capabilities using its saved credential. Input is {target, projectName, ...host configFields as top-level strings}; unknown fields and secrets are refused. Requires deployments.publish. Wait for the result: {published:true, reachable:true, target, url, status, deploymentId?, basePath?} confirms the site is live. An upload awaiting public reachability returns {published:true, reachable:false, target, url, status, message, deploymentId?, basePath?}; report that partial outcome honestly. Missing credentials return {published:false, reason:'no-credential', message}; failures return {published:false, code, message}. Never exposes a token or raw provider response. A concurrent publish returns ALREADY_RUNNING; wait for it to settle.",
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
    name: "deployment_generate_bucket_hosting_setup",
    description:
      "Generates the exact steps (and, where applicable, the exact policy JSON with the real names substituted in) a host needs in the human's own console before a published site is reachable, such as making a storage bucket publicly readable. Only some hosts have such steps; for the others this refuses with the reason. Tovu composes this but NEVER applies it: the human applies it themselves in their own provider console. This is a PURE READ: it writes nothing, calls no API, and does not need a saved credential (call it before or after credential_save with kind publish-host). Relay the returned 'steps' as prose plus copyable code blocks for any 'consoleJson' present, and relay 'warning' verbatim if present: it can say the step needs a DIFFERENT login than the saved credential, so say so plainly.",
    sideEffects: "none",
    authorization: { permission: "deployments.read" },
    inputSchema: GENERATE_BUCKET_HOSTING_SETUP_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById({ catalog: staticPublishAgentToolCatalog });

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

  // -> the host plugin module's pure `hostingSetup` over the caller's non-secret fields (never a saved
  // credential). No write, no network call, no decrypt.
  ["deployment_generate_bucket_hosting_setup", "none"],
]);

/** Composition-root-bound export operation, typed locally to avoid cross-feature type coupling.
 * The composition root closes over full application dependencies; this feature passes only options.
 */
type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;

/** Only ports the tool handlers read, declared structurally without importing RouteDeps.
 * A real publish needs the full application graph for export; exportSiteBound captures it at the
 * composition root, so that requirement does not widen this feature's dependency contract.
 * Every other field is a direct port type, never indexed from the composition root's wide bag.
 */
export interface StaticPublishToolDeps extends OperatorLocaleDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: Clock;
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
  /** Post-save connection checks share the verifier's HTTP seam; fixtures never need real egress. */
  readonly fetchFn?: typeof fetch;
  /** Test-only override for `RouteDeps.publishHistoryStore` (2026-08-16 rework — that field is now
   *  the real, DB-backed `SqlitePublishHistoryStore` in production; see `routes/types.ts`'s own doc)
   *  — lets a test inject an `InMemoryPublishHistoryStore` so it can assert on a recorded publish (or
   *  a capabilities read) without touching a real database. Passed straight through to
   *  `runPublishAndAwait` on a confirmed publish AND used by the capabilities handler's own read, so a
   *  test sees one consistent store on both sides. Production never sets this; both paths fall back to
   *  `deps.publishHistoryStore`, so a real publish's history is visible to this tool with no wiring
   *  change outside this domain (see `publish-run.ts`'s header, "Publish history"). */
  historyStore?: PublishHistoryStore;
  /** `RouteDeps.observability`, forwarded so a confirmed publish's deploy egress is traced. */
  readonly observability?: ObservabilityPort;
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
  if (!read.ok) throw new ToolInputError({ message: read.message });
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
  throw new ToolInputError({ message: `'${unknown}' is not a field of ${descriptor.id}. ${takes}` });
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
// The engine supplies this exchange-keyed URI to both the form and its outcome.

/** Shared `target` lookup for `deployment_preview_static_publish` and
 *  `deployment_execute_static_publish`: the input's `target` must be a host this workspace's deploy
 *  registry has loaded.
 *  @throws {ToolInputError} `raw.target` is missing, or no loaded plugin provides it.
 *  @complexity O(1) — one registry lookup. */
function requireStaticPublishTarget(raw: Record<string, unknown>, registry: DeployTargetRegistry): LoadedDeployTarget {
  const targetId = requireString({ input: raw, key: "target" });
  const target = registry.get(targetId);
  if (target === undefined) throw new ToolInputError({ message: unknownTargetMessage(registry, targetId) });
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
  return saved.map(({ id, label, isDefault, createdAt, updatedAt, tokenTail, tokenHint }) => ({ id, label, isDefault, createdAt, updatedAt, tokenTail, tokenHint }));
}

/**
 * {@link buildProviderCapability}'s result-object assembly, split out from the value computation so
 * neither half alone carries every branch in the original 100-line closure. `verifiedAt`/`accountLabel`
 * are the two fields this handler still needs beyond what {@link buildCapabilityGuidance} itself reads.
 *
 * accountLabel prefers the default credential's stored column, healed by post-save verification,
 * and falls back to cached verification only when that column is null (an unhealed or env-only row).
 * Stored identity survives restart while the cache does not, and prevents guessing a GitHub account
 * from the human's email instead of using the verified token's actual account.
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
  exchange: Pick<SurfaceExchange, "id">,
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
      result: { published: false, cancelled: false, code: outcome.code, message: outcome.message, ...(outcome.credentialSetup ? { credentialSetup: outcome.credentialSetup } : {}) },
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

/** The host whose credential the propose-credential tool saves: it must be loaded and declare one.
 *  @throws {ToolInputError} unknown host, or a host that takes no saved credential.
 *  @complexity O(1) — one registry lookup. */
function requireCredentialTarget(raw: Record<string, unknown>, registry: DeployTargetRegistry): { readonly descriptor: DeployTargetDescriptor; readonly credential: DeployTargetCredentialSpec } {
  const { descriptor } = requireStaticPublishTarget(raw, registry);
  if (descriptor.credential === undefined) throw new ToolInputError({ message: `${descriptor.id} takes no saved credential.` });
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
      throw new ToolInputError({ message: `'${key}' is not a credential field of ${descriptor.id}. ${takes}` });
    }
    if (field.secret === true || key === descriptor.credential?.tokenField) throw new ToolInputError({ message: `'${key}' is secret: the person types it into the form, never into the chat.` });
    if (typeof value !== "string") throw new ToolInputError({ message: `'${key}' must be a string.` });
    assertCredentialFreeField({ value, field: key });
    if (value.trim() !== "") hints[key] = value;
  }
  return hints;
}

/** The propose-credential form, built from the host's credential spec. Posts back on cancel rather
 *  than closing silently: with the call parked, a silent close would strand the handler for the full
 *  TTL. */
function buildProposeCredentialForm(required: {
  descriptor: DeployTargetDescriptor; credential: DeployTargetCredentialSpec; prefill: Record<string, string>; updating: boolean;
}, _optional = {}): SecretCardForm & { preferredFrameSize: readonly [string, string] } {
  const { descriptor, credential, prefill, updating } = required;
  return {
    title: `Connect ${descriptor.label}`,
    ...(credential.help !== undefined ? { description: credential.help } : {}),
    submitLabel: "Save connection",
    fields: credential.fields.map((field): SecretCardField => {
      const base = { kind: "string" as const, name: field.name, label: field.label,
        ...(field.help !== undefined ? { hint: field.help } : {}), required: field.required };
      if (field.secret === true || field.name === credential.tokenField) {
        // The store keeps exact blank secrets on update; the form must permit that submission too.
        return { ...base, secret: true, required: updating ? false : field.required, allowBlank: updating || !field.required };
      }
      return { ...base, ...(prefill[field.name] !== undefined ? { value: prefill[field.name] } : {}) };
    }),
    app: { appName: "tovu-deployment-propose-custom-provider-credential", appVersion: "1" },
    preferredFrameSize: ["100%", "560px"],
  };
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
async function saveProposedCredential(required: {
  deps: StaticPublishToolDeps; targetId: string; credential: DeployTargetCredentialSpec;
  values: Readonly<Record<string, unknown>>; signal: AbortSignal;
}, _optional = {}): Promise<{ credentialId: string; tokenHint: CredentialTokenHint | null }> {
  const { deps, targetId, credential, values, signal } = required;
  const connection: Record<string, unknown> = { providerId: targetId };
  for (const field of credential.fields) {
    if (typeof values[field.name] === "string") connection[field.name] = values[field.name];
  }
  const store = deps.vendorCredentialSetRepo;
  // Registry reads, blank-secret preservation and sealing await; guard both existing write ports.
  const repo: VendorCredentialSetRepoPort = {
    insert: record => { signal.throwIfAborted(); return store.insert(record); },
    update: record => { signal.throwIfAborted(); return store.update(record); },
    findById: input => store.findById(input),
    findDefaultByVendor: input => store.findDefaultByVendor(input),
    listByVendor: input => store.listByVendor(input),
    listByWorkspace: input => store.listByWorkspace(input),
    delete: input => store.delete(input),
    updateAccountLabel: input => store.updateAccountLabel(input),
  };
  const writeDeps: PublishCredentialWriteDeps = {
    repo,
    loadDeployTargets: deployTargetsLoader(deps),
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };
  const saved = await listPublishCredentials(writeDeps, { workspaceId: deps.workspaceId });
  const existing = saved.find((row) => row.providerId === targetId && row.isDefault);
  // Cancellation may arrive during the metadata read; refuse before invoking persistence.
  signal.throwIfAborted();
  const stored = existing
    ? await updatePublishCredential(writeDeps, { workspaceId: deps.workspaceId, id: existing.id, connection })
    : await createPublishCredential(writeDeps, { workspaceId: deps.workspaceId, label: CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL, connection });
  return { credentialId: stored.id, tokenHint: stored.tokenHint ?? null };
}

/**
 * `deployment_propose_custom_provider_credential`'s domain save and post-save probe — kept separate
 * so their cost is measured independently of the engine's exchange lifecycle.
 * @complexity One existing credential write plus an optional provider verification.
 */
async function saveProposeCredential(required: {
  deps: StaticPublishToolDeps; targetId: string; credential: DeployTargetCredentialSpec;
  values: Readonly<Record<string, unknown>>; signal: AbortSignal; locale: string;
}, _optional = {}) {
  const { deps, targetId, locale } = required;
  const saveResult = await saveProposedCredential(required);

  // NEVER echoes a field value, secret or not. Owner 2026-10-07: the submitted human card
  // now authorizes the same post-save read-only check as the admin form. Model-only reads stay probe-free.
  let connection: 'saved' | 'connected' | 'auth' | 'timeout' | 'unreachable' = 'saved';
  try {
    const registry = await deployTargetsLoader(deps)(deps.workspaceId);
    if (registry.get(targetId)?.module.verifyCredential) {
      const verification = await verifyPublishCredentialById({
        repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer,
        cache: deps.publishCredentialVerificationCache, clock: { nowIso: () => clockNowIso({ clock: deps.clock }) },
        loadDeployTargets: deployTargetsLoader(deps), observability: deps.observability, fetchFn: deps.fetchFn,
      }, { workspaceId: deps.workspaceId, id: saveResult.credentialId });
      connection = verification?.status === 'valid' ? 'connected' : verification?.status === 'invalid' ? 'auth' : verification?.message === credentialText({ id: 'timeout' }) ? 'timeout' : 'unreachable';
    }
  } catch { connection = 'unreachable'; }
  const hint = formatCredentialHint({ hint: saveResult.tokenHint, locale });
  return { saved: true as const, providerId: targetId, connected: connection === 'connected', connection,
    tokenHint: saveResult.tokenHint, message: `${hint ? `${hint}. ` : ''}${credentialText({ id: connection, locale })}` };

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
/** Bind publish credential saving to its existing descriptor, permission and sealed-store owner.
 * @param required - Existing publish dependencies and shared surface exchanges.
 * @returns An internal save adapter, never a retired tool registration.
 * @example buildPublishHostCredentialHandler({ deps, surfaces });
 * @complexity O(1) binding; invocation reads the provider registry and saved credential summaries.
 */
export function buildPublishHostCredentialHandler({ deps, surfaces }: { deps: StaticPublishToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): ToolHandler {
  return async (ctx, optional = {}) => {
      const raw = requireInputRecord({ input: ctx.input });
      const { descriptor, credential } = requireCredentialTarget(raw, await deployTargetsLoader(deps)(deps.workspaceId));
      const prefill = readCredentialHints(raw, descriptor);

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "deployments.credentials.write" }, { entityType: "site-publish" });

      // Fail closed rather than degrade — identical posture to the execute-publish guard above.
      // The engine supplies a ToolInputError so the refusal remains caller-safe through transport.
      const stored = await listPublishCredentials({ repo: deps.vendorCredentialSetRepo, loadDeployTargets: deployTargetsLoader(deps) }, { workspaceId: deps.workspaceId });
      const updating = stored.some(row => row.providerId === descriptor.id && row.isDefault);
      const locale = await resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: ctx.principal.id });
      const card = defineSecretCardTool<{
        descriptor: DeployTargetDescriptor; credential: DeployTargetCredentialSpec; prefill: Record<string, string>; updating: boolean; locale: string;
      }, Awaited<ReturnType<typeof saveProposeCredential>>, Awaited<ReturnType<typeof saveProposeCredential>> | {
        saved: false; cancelled: boolean; reason?: string; message?: string; note?: string;
      }>({
        toolId: CREDENTIAL_SAVE_TOOL_ID,
        prepare: async () => ({ descriptor, credential, prefill, updating, locale }),
        form: ({ prep }) => buildProposeCredentialForm(prep),
        save: ({ values, prep, signal }) => saveProposeCredential({ deps, targetId: prep.descriptor.id, credential: prep.credential, values, signal, locale: prep.locale }),
        result: ({ prep, run }) => {
          if (run.status === 'saved') return run.saved;
          if (run.status === 'cancelled') return { saved: false, cancelled: true };
          if (run.status === 'blank' || run.status === 'failed') return { saved: false, cancelled: false, reason: 'invalid',
            message: run.status === 'blank' ? credentialText({ id: 'blank', locale: prep.locale }) : run.safeMessage };
          return { saved: false, cancelled: false, reason: run.status,
            note: run.status === 'expired' ? "The user did not respond to the credential form before it expired. Nothing was saved." : "The credential form was closed because the run ended. Nothing was saved." };
        },
        outcome: ({ prep, run }) => {
          if (run.status === 'cancelled' || run.status === 'expired' || run.status === 'abandoned') return undefined;
          const saved = run.status === 'saved';
          const message = saved ? run.saved.message : run.status === 'blank' ? credentialText({ id: 'blank', locale: prep.locale }) : run.status === 'failed' ? run.safeMessage : credentialText({ id: 'unreachable', locale: prep.locale });
          return { title: credentialText({ id: saved ? 'savedTitle' : 'unreachable', locale: prep.locale }), state: saved ? 'success' : 'failure', message };
        },
      }, {
        uriHost: 'tovu',
        text: { noEmitter: "deployment_propose_custom_provider_credential: this execution context has no interactive confirmation channel " +
          "(no emitSurface), so a credential form cannot be shown here. Nothing was saved.", saveFailure: credentialText({ id: 'unreachable', locale }) },
        safeError: err => err instanceof PublishCredentialValidationError ? translateCredentialMessage({ message: err.message, locale }) : undefined,
        logFailure: metadata => console.warn(JSON.stringify(metadata)),
      });
      return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, optional);
  };
}

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
      const raw = requireInputRecord({ input: ctx.input });
      const registry = await deployTargetsLoader(deps)(deps.workspaceId);
      const loaded = requireStaticPublishTarget(raw, registry);
      const target = loaded.descriptor.id;

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "deployments.read" }, { entityType: "site-publish" });

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
      requireNoInput({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "deployments.read" }, { entityType: "site-publish" });

      const loadDeployTargets = deployTargetsLoader(deps);
      // Owner policy: unseal only server-side to derive the safe hint.
      // Readiness still uses isConfigured(); no usable credential or provider probe reaches this result.
      const saved = await listPublishCredentials({ repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, loadDeployTargets } satisfies PublishCredentialReadDeps, {
        workspaceId: deps.workspaceId,
      });

      const registry = await loadDeployTargets(deps.workspaceId);
      const providerCapabilityContext: ProviderCapabilityContext = { deps, credentialSource, historyStore, saved };
      const providers = await Promise.all(registry.list().map((loaded) => buildProviderCapability(loaded, providerCapabilityContext)));

      return { executionMode: deps.publishExecutionMode, providers };
    },

    /** Validates and publishes with server-side credentials after the shared registration policy
     * asks for human approval. The result still waits for the provider and
     * public reachability check; headless assistant calls without consent fail closed. */
    deployment_execute_static_publish: async (ctx, optional = {}) => {
      const raw = requireInputRecord({ input: ctx.input });
      const registry = await deployTargetsLoader(deps)(deps.workspaceId);
      const loaded = requireStaticPublishTarget(raw, registry);
      const target = loaded.descriptor.id;
      const projectName = requireString({ input: raw, key: "projectName" });

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "deployments.publish" }, { entityType: "site-publish" });

      const { config, plan, detailRows } = planToolPublish(registry, raw, loaded);
      if (!plan.ok) {
        throw new ToolInputError({ message: `deployment_execute_static_publish: ${plan.message}` });
      }

      // Never decrypts (same `isConfigured()` contract the preview/capabilities handlers use above).
      // Refuse unavailable credentials before starting an export.
      const readiness = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target });
      if (!readiness.configured) {
        return {
          published: false,
          cancelled: false,
          reason: "no-credential",
          credentialSetup: issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "publish-host", target } }, {}),
          message: `No publish credential is configured for '${target}'. Call credential_save with kind publish-host to open its secure card, then retry once. The admin's Static Site tab is an alternative. (${readiness.reason})`,
        };
      }

      if (ctx.signal.aborted) return { published: false, cancelled: false, reason: "abandoned" };
      if (getPublishRunSnapshot().status === "running") {
        return { published: false, cancelled: false, code: "ALREADY_RUNNING", message: "A publish is already running. Wait for it to finish before publishing again." };
      }
      const outcome = await runPublishAndAwait(
        { credentialSource, loadDeployTargets: deployTargetsLoader(deps), ...(deps.buildTarget !== undefined ? { buildTarget: deps.buildTarget } : {}), observability: deps.observability },
        { workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, config, projectName },
        { nowIso: () => clockNowIso({ clock: deps.clock }) },
        historyStore,
      );
      const mapped = mapPublishOutcomeToToolResult(outcome, { id: ctx.executionId }, config, detailRows, projectName);
      if (optional.emitSurface) await optional.emitSurface(mapped.outcome);
      return mapped.result;
    },

    /**
     * The MCP-UI form-gated credential save for any host whose plugin declares a credential. Same
     * Opens an exchange, emits a form, then uses `askThenReport` to replace it with the real save
     * outcome: the model proposes structure for a human to fill in.
     *
     * The schema has no secret property, and a secret or undeclared field is refused before any form
     * is raised. The human's typed secret lands in `answer.params` server-side and is sealed by
     * `publish-credentials/store.ts`; it never enters a prompt or a completion, and the result never
     * echoes any field.
     */
    /**
     * Pure read — the host plugin module's own `hostingSetup` over the caller's non-secret credential
     * fields (never a saved credential). A host with no such steps is refused with the reason.
     */
    deployment_generate_bucket_hosting_setup: async (ctx) => {
      const raw = requireInputRecord({ input: ctx.input });
      const loaded = requireStaticPublishTarget(raw, await deployTargetsLoader(deps)(deps.workspaceId));
      const { descriptor, module } = loaded;
      if (module.hostingSetup === undefined) throw new ToolInputError({ message: `${descriptor.id} has no hosting-setup steps: publishing to it serves the site.` });
      const fields = readCredentialHints(raw, descriptor);

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "deployments.read" }, { entityType: "site-publish" });

      try {
        return module.hostingSetup({ fields });
      } catch (err) {
        throw new ToolInputError({ message: err instanceof Error ? err.message : String(err) });
      }
    },
  };

  // No `unwiredToolIds`: this domain now wires its ENTIRE catalog, same tripwire discipline as
  // Posts/Pages/Forms/Entries/Widgets — a 4th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "static-publish",
    catalogModule: "features/deployments/publish-agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: staticPublishDerivedRisk,
  });
}

/**
 * Contributes Static Publish's AI tools; called once by the composition root's
 * `installFirstPartyToolContributors()`, never as an import side effect.
 * See ./tool-registrations.ts for the shared deployments/credential dependency boundary.
 */
export function contributeStaticPublishTools(): ToolContributor {
  return { domain: "static-publish", build: buildStaticPublishRegistrations, risk: staticPublishDerivedRisk };
}
