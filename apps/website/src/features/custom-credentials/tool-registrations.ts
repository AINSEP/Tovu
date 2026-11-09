import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { createCredentialSaveHandlers, createCredentialToolRegistrations } from "@jini-ai/integrations/credentialed-http/tools";
export { createCredentialSaveHandlers, createCredentialToolRegistrations };
import { abortGuardedCredentialRepo } from "../vendor-credentials/abort-guarded-repo.js";

import { invalidatePublishCredentialCompatibility } from "../deployments/publish-credentials/index.js";
import { normalizeCredentialWorksFor } from "@jini-ai/platform/secrets/credential-sets";
import type { DeployTargetRegistry } from "../deployments/contracts.js";
import { toolMetadata } from '../../contracts/core/tool-metadata/custom-credentials.js';
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { withCustomCredentialSetup } from "./credential-recovery.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint, translateCredentialMessage } from '../../contracts/core/credential-copy.js';
import { resolveOperatorLocale } from '../settings/index.js';
import { type OperatorLocaleDeps } from '../../contracts/headless/index.js';
import type { Clock } from "@jini-ai/core/primitives";

import { createApprovalHandler, indexCatalogById, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
// The same permission helpers `@jini-ai/cms/core` re-exports, taken from their defining core package.

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  describeErrorForLog,
  forbiddenRule,
} from "../../contracts/core/model-facing-tool-errors.js";
import { type CallerSafeErrorRule, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`@jini-ai/daemon/surface-exchanges` re-exports the
// functions that use it, but not the type) — imported directly here so `handleSetTokenAnswer` below
// can name its `askThenReport`-shaped return type explicitly, mirroring `features/deployments/
// publish-agent-tools.ts`'s identical import for the same reason.

// `ToolInputError` is the marker `@jini-ai/daemon`'s `ToolExecutor` reads to tag a rejection
// `errorKind: 'validation'` instead of the `'internal'` bucket the delegated transport redacts.

import { requireHumanConfirm } from "../../contracts/core/human-confirm.js";
// Types only: the egress refusal is recognised through the request port's `classifyError`
// (Tovu's binding, `credential-ports.ts`, holds the `EgressRefusedError` runtime import).
import type { HttpClientPort } from "../../platform/http/index.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { ToolContributor } from "@jini-ai/core";
import { customCredentialsAgentToolCatalog, WRITE_FILES_TOOL_ID } from "./agent-tools.js";
import {
  CredentialedRequestValidationError,
  type CredentialedRequestAuditPort,
  type CredentialedRequestDeps,
} from "./credentialed-request.js";

import { bindCredentialedRequestPort, bindSourceControlWritePort } from "./credential-ports.js";
import { cleanCardToken } from "./card-token.js";
import { applyPluginCredentialCard, buildPluginCredentialForm } from "../../contracts/core/plugin-credential-card.js";
import { loadPluginCredentialCardsSafely, findPluginCredentialCard, readPluginCredentialValues, type LoadPluginCredentialCards } from "./plugin-credential-card.js";
import { buildCreateForm, buildCreateOutcome } from "./custom-credential-create-ui.js";
import { setTokenForm, setTokenOutcome } from "./custom-credential-set-token-ui.js";
import { describeDeleteRequestApproval, MAKE_CREDENTIALED_REQUEST_TOOL_ID } from "./delete-request-confirmation-ui.js";
import type { LoadSourceControlProviders } from "../source-control/provider-registry.js";
import { createCustomCredential, CustomCredentialNotFoundError, CustomCredentialSecretStoreUnconfiguredError, CustomCredentialValidationError, describeCredential, describeCredentialByLabel, listCustomCredentials, resolveCustomCredentialByLabel, updateCustomCredential } from "./store.js";
import type { CustomCredentialSetRepoPort } from "./types.js";
import { validateWriteFilesInput } from "./write-files-validation.js";
import type { CustomCredentialSecretCards, CustomCredentialToolHost, CustomCredentialToolPorts } from "./credential-tool-host.js";
import type { CredentialToolOperations } from "./credential-tool-operations.js";
import { tovuCredentialCardIdentity } from "./tovu-credential-card-identity.js";

/**
 * @file Host wiring for custom-credential tools and credential_save's API adapters.
 *
 * Reads and verification use custom-credentials.read; requests and durable edits use
 * custom-credentials.write because they can mutate Tovu or an external provider. DELETE alone
 * requires a human approval card; GET/POST/PUT/PATCH run directly under the owner's policy.
 * resolveRequestTarget checks labels and saved hosts before any dialog or decrypt. DELETE opens
 * one held call, and decrypts only after approval; ADR-055's card flow replaces a heavier
 * plan/confirm/execute ceremony without a second model-issued confirmation call.
 *
 * set_username updates one plaintext account identifier through the existing store owner.
 * It needs no extra confirmation: strict label/username keys prevent token smuggling, and the
 * label-to-id lookup does not decrypt. A missing username can cause HTTP Basic authentication
 * to fail; authDiagnostic supplies the diagnosis this edit can repair.
 *
 * credential_save's API adapters accept non-secret metadata only. Secret keystrokes travel
 * browser -> tool-calls route -> SurfaceExchangeStore -> parked handler -> sealed store, never
 * through the agent CLI, model, chat transcript or audit values (the audit records input keys).
 * Missing emitSurface fails closed: asking for a second model-issued call would expose the secret.
 * Jini's secret-card lifecycle owns submit/cancel/expiry/dismissal. The outcome replaces the same
 * form URI after the save completes; transport delivery alone is not proof that sealing succeeded.
 *
 * Rotation resolves an existing label before opening the form. Creation has no existing row to
 * resolve; the store owns submitted label/URL/category/token validation and workspace-label
 * uniqueness. A duplicate label is refused, never silently overwritten, and directs the caller
 * to rotation. Both return value-free statuses or the non-decrypting CustomCredentialSummary.
 *
 * custom_credential_write_files creates/edits named files directly under the owner's policy.
 * Shape/path/size checks and provider owner/repo rules precede decryption; read-only planFileWrite
 * reconnaissance then provides the exact branch/tree plan passed to commitFiles. The provider
 * retains freshness checks and commits atomically. Aborted calls stop before committing.
 * This path uses the custom credential resolver; whole-site export commits belong to source-control
 * and its separate credential contract. Credential repository consolidation is not implied here.
 */

export interface CustomCredentialsToolDeps extends OperatorLocaleDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  readonly ownerPrincipalId?: Promise<string>;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  /** `updateCustomCredential`'s OTHER write dependency (`CustomCredentialWriteDeps.keyring`), needed
   *  ONLY so `custom_credential_set_username`'s handler can build the full write-deps shape that
   *  function requires — mirrors `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own
   *  `writeDeps.keyring: deps.siteAssistantSecretKeyring` line exactly, reusing the same field name a
   *  caller building `RouteDeps` already has. A username-only update never actually calls
   *  `keyring.activeKey()` at runtime — `store.ts`'s own `updateCustomCredential` doc: the seal step
   *  (the only place `keyring` is read) runs only when `connection` is supplied, which this tool never
   *  does — this field exists purely to satisfy `CustomCredentialWriteDeps`'s required shape, not
   *  because this tool ever re-seals anything. */
  readonly siteAssistantSecretKeyring: KeyringPort;
  /** Same reasoning as `siteAssistantSecretKeyring` above: `CustomCredentialWriteDeps.idGen` mints a
   *  fresh id only for `createCustomCredential`; an update (this tool only ever updates) never calls
   *  it. Present only to satisfy the write-deps shape. */
  readonly idGen: { newId(): string };
  /** The guarded outbound-HTTP seam (ADR-038) two of this domain's three tools call through
   *  (`custom_credential_list` is a pure repo read and never touches this) — built ONLY by
   *  a composition root (`server/runtime/composition/{deps,app}.ts`); see `credentialed-request.ts`'s
   *  own `CredentialedRequestDeps.httpClient` doc for why this file never constructs one itself. */
  readonly customCredentialsHttpClient: HttpClientPort;
  /** The git-host providers `custom_credential_write_files` writes through (the installed, enabled
   *  Agent Plugins supplied by composition — the bundled `github` one today). */
  readonly loadSourceControlProviders: LoadSourceControlProviders;
  readonly loadDeployTargets?: (workspaceId: string) => Promise<DeployTargetRegistry>;
  /** Plugin-declared key cards (`plugin-credential-card.ts`); absent means none can be opened. */
  readonly loadPluginCredentialCards?: LoadPluginCredentialCards;
  readonly publishCredentialVerificationCache?: { delete(input: { workspaceId: string; target: string }): void };
  /** `RouteDeps.observability`: a write's raw git-host calls are outbound spans. */
  readonly observability?: ObservabilityPort;
  /** The self-describing token scheme rules `custom_credential_make_request`/`_verify` apply
   *  (`CredentialedRequestDeps.loadAuthSchemes`): composition supplies the installed plugins; the hermetic
   *  root and tests pass the bundled plugins' source rules. */
  readonly loadAuthSchemes: CredentialedRequestDeps["loadAuthSchemes"];
  /** Test-only override; defaults to `credentialed-request.ts`'s `ConsoleCredentialedRequestAuditLog`. */
  readonly customCredentialsAudit?: CredentialedRequestAuditPort;
  /** Test-only override for the server-side failure log; defaults to `console.warn`. Receives only
   *  fixed engine failure metadata and lines built by {@link reportRepositoryWriteFailure}, never a raw
   *  error message that could quote a secret. */
  readonly customCredentialsFailureLog?: (line: string) => void;
}

const CATALOG_BY_ID = indexCatalogById({ catalog: customCredentialsAgentToolCatalog });

/** This domain's name, doing double duty as both `buildDomainRegistrations`'s own `domain` field and
 *  `requireToolPermission`'s `entityType` — the same string
 *  `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own admin route uses for its
 *  own checks. Coincidence, not a shared concept forced together: this feature has exactly one
 *  domain and one entity type, so both names happen to be identical. */
const DOMAIN = "custom-credentials";
/** Gates `custom_credential_verify` — a read against the third party, never a Tovu-side write. */
const READ_PERMISSION = `${DOMAIN}.read`;
/** Gates `custom_credential_make_request` — see this file's header for why a tool that can now issue
 *  a real external POST/PUT/PATCH/DELETE sits on the write permission, not read. */
const WRITE_PERMISSION = `${DOMAIN}.write`;

/** Tovu's host inputs for the old entries below: the vocabulary above and Tovu's card identity. */
const TOVU_CUSTOM_CREDENTIAL_HOST: CustomCredentialToolHost = {
  vocabulary: { domain: DOMAIN, entityType: DOMAIN, permissions: { read: READ_PERMISSION, write: WRITE_PERMISSION },
    catalogModule: "features/custom-credentials/agent-tools.ts", metadata: toolMetadata, catalog: CATALOG_BY_ID },
  cardIdentity: tovuCredentialCardIdentity,
};

/**
 * The custom-credentials errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism, for why a
 * whole-map wrap is used rather than a per-call-site reshape, and for why this list is an
 * ALLOWLIST: anything unlisted is returned unchanged and stays redacted.
 *
 * The two predicates above already rescue `make_request`'s and `write_files`' shape rejections, but
 * only around the calls they wrap. Every other throw — the kit's `ForbiddenError` on all seven tools,
 * a wrong label on the five that resolve one, `set_username`/`set_token`'s own field checks, and the
 * DELETE pre-check — reached the model as the same opaque 500 a crash produces. No class below
 * extends another, so order is not load-bearing here. A rejection a predicate already turned into a
 * `ToolInputError` passes through untouched, so nothing gains a second prefix.
 *
 * On disclosure, checked at each construction site because this domain holds live tokens:
 * - `CustomCredentialNotFoundError` names only the label the caller sent or a row id
 *   (`credentialed-request.ts` 708/730, `store.ts` 494, and this file's three throws). Every one runs
 *   AFTER `requireToolPermission`, so a denied principal cannot use it to enumerate labels.
 * - `CustomCredentialValidationError` names field NAMES and fixed rules, never a field value:
 *   `rejectUnexpectedSet{Username,Token}Fields` echo the offending KEYS (a smuggled token's value is
 *   never read), `requireUsernameOrClearSentinel` and `store.ts` 140-263 are fixed strings.
 * - `CredentialedRequestValidationError` echoes the caller's own `url` (credentials-in-URL is refused
 *   first, with fixed text), header KEYS, a byte count, and the credential's saved origins, which
 *   `custom_credential_list` already returns. GET/POST already surface this class; listing it closes
 *   the DELETE pre-check arm only.
 *
 * Deliberately NOT listed, and so still redacted:
 * - `CustomCredentialSecretStoreUnconfiguredError`: its decrypt arm embeds the sealer's or
 *   `JSON.parse`'s own message, and `JSON.parse` quotes the start of its input — decrypted plaintext.
 * - `CredentialedRequestTransportError`: embeds raw transport text (`connect ECONNREFUSED <ip>:443`).
 * - `EgressRefusedError` at map level: its `message` names a resolved address. It surfaces only
 *   through {@link makeModelFacingCredentialedRequest}, in its address-free form.
 * - `CustomCredentialDuplicateLabelError`: never escapes as a throw (`mapCreateCredentialError`).
 * - `write_files`' plan-failure `Error`, which carries GitHub's own rejection text (a network failure
 *   is already reduced to fixed text by the plugin provider (`provider-module.ts`)'s `describeSendFailure`), and
 *   internal-invariant `Error`.
 *
 * The structured `{ saved: false }` / `{ created: false }` / `{ executed: false }` results are return
 * values, not throws, and this wrap never sees them. The two form-save failures go through their own
 * allowlist, {@link FORM_SAVE_CALLER_SAFE_ERRORS}.
 */
const CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("CUSTOM_CREDENTIALS"),
  { error: CustomCredentialNotFoundError, code: "CUSTOM_CREDENTIALS_NOT_FOUND", guidance: "Call credential_save with kind api to open the secure credential card, then retry once." },
  { error: CustomCredentialValidationError, code: "CUSTOM_CREDENTIALS_VALIDATION_FAILED" },
  { error: CredentialedRequestValidationError, code: "CUSTOM_CREDENTIALS_REQUEST_REJECTED" },
  // A FIXED message, never `err.message`: this class wraps the sealer's, the keyring's, or
  // `JSON.parse`'s own text, which can carry the decrypted token, the env var name, and an absolute
  // key-file path — the identical disclosure {@link FORM_SAVE_CALLER_SAFE_ERRORS} already refuses for
  // this same class on the SAVE path. Its KIND, though, is the one failure in this domain an operator
  // can actually act on, and until 2026-09-18 it was the only one that reached the model redacted:
  // a site booted with no site key answered `500 INTERNAL_ERROR` on every credentialed call, which is
  // indistinguishable from the site having crashed. Listed LAST because it is the broadest of the
  // four — no ordering hazard today (no class here subclasses another), but the safe habit.
  {
    error: CustomCredentialSecretStoreUnconfiguredError,
    code: "CUSTOM_CREDENTIALS_SECRET_STORE_UNAVAILABLE",
    message:
      "this site's secret store could not open the saved credential: its Site key is missing or unusable, " +
      "or the stored credential is unreadable. No request was sent",
    guidance: "An operator can check this site's token on the admin Secrets page.",
  },
];

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const customCredentialsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listCustomCredentials: a non-decrypting repo read (store.ts's own "never touch sealer/keyring"
  // read model). No durable Tovu-side write, no external call, no decrypt of any kind.
  ["custom_credential_list", "none"],
  // -> resolveCustomCredentialByLabel (a decrypting read) plus one bounded outbound GET against the
  // credential's own saved base URL. No durable Tovu-side write of any kind.
  ["custom_credential_verify", "none"],
  // -> makeCredentialedRequest: a real outbound GET/POST/PUT/PATCH/DELETE against the third party's
  // own API using a write-scoped saved credential — genuinely can mutate external state (2026-08-31
  // owner override widened this from GET-only). No Tovu-side DB write, but the SAME external-mutation
  // classification `deployment_execute_static_publish`/`source_control_execute_commit` carry.
  ["custom_credential_make_request", "mutates-durable-state"],
  // -> updateCustomCredential's username-only path: a genuine Tovu-side DURABLE WRITE (the plaintext
  // `username` column), so this can never be "none" — but it is also the narrowest write this table
  // supports: no token field reachable, no re-seal, no external call at all (see this file's header,
  // "custom_credential_set_username", for the full reasoning this classification is drawn from).
  ["custom_credential_set_username", "mutates-durable-state"],
  // -> updateCustomCredential's connection-replacing path, via the human's own form submission: a
  // genuine Tovu-side DURABLE WRITE (a fresh sealed ciphertext) — the model-issued call itself performs
  // no write at all (it only opens the exchange and waits), but the classification here describes what
  // THIS TOOL ID can cause to happen, same convention every other entry in this map uses. No external
  // call, ever — see this file's header, "custom_credential_set_token", for the full reasoning.

  // -> createCustomCredential's insert path, via the human's own form submission: a genuine Tovu-side
  // DURABLE WRITE (a brand-new row, sealed ciphertext) — the model-issued call itself performs no write
  // at all (it only opens the exchange and waits, same as custom_credential_set_token above), but this
  // classification describes what THIS TOOL ID can cause to happen, same convention every other entry
  // in this map uses. No external call, ever — see this file's header, "custom_credential_create", for
  // the full reasoning.

  // planFileWrite reconnaissance followed by commitFiles mutates a third-party repository.
  // File creation/editing runs directly; provider plan validation and freshness checks still apply.
  ["custom_credential_write_files", "mutates-durable-state"],
]);

/**
 * The errors whose kind a failed form SAVE (`custom_credential_set_token`, `custom_credential_create`)
 * may name — to the model in the structured result, and to the human in the outcome resource.
 * Anything unlisted gets {@link FORM_SAVE_FAILURE_MESSAGE}. See `callerSafeErrorMessage` in
 * `contracts/core/model-facing-tool-errors.ts` for the mechanism.
 *
 * Both handlers used to publish `err.message` for ANY error, under a comment claiming none of these
 * messages ever embeds a field value. That was false: `store.ts`'s `sealConnection` wraps the sealer's
 * own failure text, the sealer is handed the submitted token as plaintext, and `decryptRecord`'s
 * `JSON.parse` arm shows the shape (it quotes its input). With the shipped `EnvOrFileKeyring`, a
 * missing site key put the env var name and the absolute key-file path on screen. A raw repo error
 * went out verbatim.
 *
 * - `CustomCredentialValidationError`, `CustomCredentialNotFoundError`: verbatim. Fixed text, field
 *   names, and a row id — the same disclosure proof `CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS` records.
 * - `CustomCredentialSecretStoreUnconfiguredError`: a FIXED message. Its kind is the actionable reason
 *   an operator needs; its text wraps the sealer's, keyring's, or `JSON.parse`'s, so it never goes out.
 *
 * `CustomCredentialDuplicateLabelError` never reaches this list: `mapCreateCredentialError` answers it
 * first with its own message.
 */
const FORM_SAVE_CALLER_SAFE_ERRORS: readonly CallerSafeErrorRule[] = [
  { error: CustomCredentialValidationError },
  { error: CustomCredentialNotFoundError },
  {
    error: CustomCredentialSecretStoreUnconfiguredError,
    message:
      "The site's secret store could not seal or open this credential: its Site key is missing or unusable, or the stored credential is unreadable. Nothing was saved.",
  },
];

/** What a form SAVE failure outside {@link FORM_SAVE_CALLER_SAFE_ERRORS} publishes. True for every
 *  throw inside either handler's `try`: the repo write is the last step that can fail. */
const FORM_SAVE_FAILURE_MESSAGE = "Saving failed because of an internal server error. Nothing was saved. The server log has the details.";

/** Engine failure log callbacks never publish err.message or the human-typed label: either can
 * hold the submitted token. Create logs fixed exchange metadata; rotation retains its class/code. */

/** The server-side failure log: the test override when one is supplied, otherwise `console.warn`. */
function failureLog(routeDeps: CustomCredentialsToolDeps): (line: string) => void {
  return routeDeps.customCredentialsFailureLog ?? ((line: string) => console.warn(line));
}

/**
 * Logs a `custom_credential_write_files` repository failure server-side when it carries a log-only
 * `logDetail` — a network failure's class and code, or an egress refusal's full message. Everything
 * else says nothing here: its `message` is already the whole story, and it is already published.
 *
 * The line names the phase, the failure code, and the detail. Never the label, the file contents, or
 * the token.
 *
 * @complexity O(1).
 */
function reportRepositoryWriteFailure({ routeDeps, ...input }: { routeDeps: CustomCredentialsToolDeps; phase: "plan" | "commit"; failure: { readonly code: string; readonly logDetail?: string } }, _optional = {}): void {
  if (input.failure.logDetail === undefined) return;
  failureLog(routeDeps)(`[custom-credentials] ${WRITE_FILES_TOOL_ID}: ${input.phase} failed code=${input.failure.code} detail=${input.failure.logDetail}`);
}

/** Optional plugin catalogs enrich this feature's create form without owning its save path. */
async function loadCreateCredentialProviders({ routeDeps }: { routeDeps: CustomCredentialsToolDeps }, _options = {}): Promise<{ id: string; vendorId: string }[]> {
  const providers: { id: string; vendorId: string }[] = [];
  // Catalogs enrich a create-time prefill only. An unavailable plugin must not prevent saving
  // an API key or erase explicitly supplied compatibility IDs.
  try { for (const { descriptor } of (await routeDeps.loadDeployTargets?.(routeDeps.workspaceId))?.list() ?? []) {
    if (descriptor.credential) providers.push({ id: descriptor.id, vendorId: descriptor.credential.vendorId });
  } } catch { /* The API key form still works without hosting plugins. */ }
  try { for (const { descriptor } of (await routeDeps.loadSourceControlProviders(routeDeps.workspaceId)).list()) {
    providers.push({ id: descriptor.id, vendorId: descriptor.id });
  } } catch { /* Source-control catalog enrichment is optional too. */ }
  return providers;
}

/** Bind API creation and rotation to their existing authorization, errors and sealed store.
 * @param required - Workspace dependencies and shared surface exchanges.
 * @returns Two internal adapters; neither is registered under a retired tool id.
 * @example createApiCredentialSaveHandlers({ routeDeps, surfaces, host });
 * @complexity O(1) binding; each adapter performs the existing bounded store operations.
 * @agent-note `host.vocabulary.permissions.write` is checked before any card opens or row resolves;
 *   `host.cardIdentity` names every card URI and app. The outcome replaces the same URI after the save.
 */
export function createApiCredentialSaveHandlers({ routeDeps, surfaces, host }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps; host: CustomCredentialToolHost }, _optional = {}): { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } {
  return createApiCredentialSaveToolHandlers({ routeDeps, surfaces, host, ports: { credentialedRequest: bindCredentialedRequestPort({ deps: credentialedRequestDeps(routeDeps) }) }, cards: { defineSecretCardTool, askThenReport } });
}

/**
 * The API credential save handlers over a host-supplied request port.
 * @agent-note A plugin card's key is probed ONLY through `ports.credentialedRequest.probe`, after the
 *   saved-origin check and before sealing; a refused or unreachable probe saves nothing. The key
 *   reaches the probe only from the human's card (browser → answer route → exchange → seal), never
 *   from model input.
 * @agent-note Key cards open only through `cards` (see `CustomCredentialSecretCards`), over
 *   `surfaces.surfaceExchanges` — the same store the answer route delivers to.
 * @complexity O(1) binding; each adapter performs the existing bounded store operations.
 */
export function createApiCredentialSaveToolHandlers({ routeDeps, surfaces, host, ports, cards }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps; host: CustomCredentialToolHost; ports: Pick<CustomCredentialToolPorts, "credentialedRequest">; cards: CustomCredentialSecretCards }, _optional = {}): { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } {
  return createCredentialSaveHandlers({ routeDeps, surfaces, host, ports, cards, operations: bindTovuCredentialToolOperations({ routeDeps, surfaces }) });
}

/** Tovu's old entry: the same adapters, bound to Tovu's permissions and card identity.
 * @example buildApiCredentialSaveHandlers({ routeDeps, surfaces });
 */
export function buildApiCredentialSaveHandlers({ routeDeps, surfaces }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } {
  return createApiCredentialSaveHandlers({ routeDeps, surfaces, host: TOVU_CUSTOM_CREDENTIAL_HOST });
}

/**
 * Builds the custom-credential tools for any host.
 * @agent-note Every permission, domain, entity type, catalog path, metadata and card identity comes
 *   from `host`; there is no default. Permissions are checked before any resolve or decrypt; a
 *   request target resolves before any dialog; DELETE is held for the human and decrypts only after
 *   approval; a validated file write commits once, with the read-only plan, and an abort commits nothing.
 */
/** The request dependencies Tovu's request-port binding closes over: the store's repo and sealer,
 *  the guarded client, the clock, the audit sink and the installed auth-scheme loader. */
function credentialedRequestDeps(routeDeps: CustomCredentialsToolDeps): CredentialedRequestDeps {
  return {
    repo: routeDeps.customCredentialSetRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
    httpClient: routeDeps.customCredentialsHttpClient,
    clock: routeDeps.clock,
    ...(routeDeps.customCredentialsAudit !== undefined ? { audit: routeDeps.customCredentialsAudit } : {}),
    loadAuthSchemes: routeDeps.loadAuthSchemes,
  };
}

/** Tovu's credential ports, bound over the same functions and dependencies the handlers used before
 *  the ports existed (see `credential-ports.ts`). */
function tovuCredentialToolPorts(routeDeps: CustomCredentialsToolDeps): CustomCredentialToolPorts {
  return {
    credentialedRequest: bindCredentialedRequestPort({ deps: credentialedRequestDeps(routeDeps) }),
    sourceControlWrite: bindSourceControlWritePort({ load: routeDeps.loadSourceControlProviders, httpClient: routeDeps.customCredentialsHttpClient, observability: routeDeps.observability }),
  };
}

/** The registrations over a host's vocabulary and card identity, with Tovu's credential ports. */
export function createCustomCredentialsRegistrations({ routeDeps, surfaces, host }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps; host: CustomCredentialToolHost }, _optional = {}): ToolRegistration[] {
  return createCustomCredentialsToolRegistrations({ routeDeps, surfaces, host, ports: tovuCredentialToolPorts(routeDeps) });
}

/**
 * The custom-credential tools over host-supplied credential ports.
 * @agent-note Requests, target resolution, verification and file writes go ONLY through
 *   `ports`; see `CustomCredentialToolPorts` for the ordering a binding must keep (target before
 *   decrypt, DELETE held for the human, one plan-bound commit on the same provider, abort → no commit).
 * @complexity O(t) registrations; each handler's cost is its port calls.
 */
export function createCustomCredentialsToolRegistrations({ routeDeps, surfaces, host, ports }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps; host: CustomCredentialToolHost; ports: CustomCredentialToolPorts }, _optional = {}): ToolRegistration[] {
  return createCredentialToolRegistrations({ routeDeps, host, ports, operations: bindTovuCredentialToolOperations({ routeDeps, surfaces }) });
}

/**
 * Tovu's compatibility binding for the consumer-only operations. No implementation moves in C2.
 * @agent-note Bind over the existing scoped repo/vault/keyring/sealer and SAME answer-route store.
 * These values preserve Tovu's permissions, issued diagnostics, catalogs, policy, copy and errors;
 * a second host instead fulfils CredentialToolOperations with its own implementations and words.
 * @complexity O(1) binding; operations retain their original bounded costs and ordering.
 */
export function bindTovuCredentialToolOperations({ routeDeps, surfaces }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): CredentialToolOperations {
  const writeDeps = ({ repo = routeDeps.customCredentialSetRepo }: { repo?: CustomCredentialSetRepoPort }, _options = {}) => ({
    repo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring,
    clock: routeDeps.clock, idGen: routeDeps.idGen,
  });
  return {
    sets: {
      list: () => listCustomCredentials({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId }),
      describe: ({ id }) => describeCredential({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId, id }),
      byLabel: ({ label }) => describeCredentialByLabel({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId, label }),
      resolve: ({ label }) => resolveCustomCredentialByLabel({ repo: routeDeps.customCredentialSetRepo, sealer: routeDeps.siteAssistantSecretSealer }, { workspaceId: routeDeps.workspaceId, label }),
      setUsername: ({ id, username }) => updateCustomCredential(writeDeps({}), { workspaceId: routeDeps.workspaceId, id, username }),
      replace: async ({ id, connection, signal, principalId, guardRepo }) => updateCustomCredential({
        ...writeDeps({ repo: guardRepo({ store: routeDeps.customCredentialSetRepo, signal }) }),
        allowSharedKeyReplacement: principalId === await routeDeps.ownerPrincipalId,
      }, { workspaceId: routeDeps.workspaceId, id, connection }),
      create: ({ signal, guardRepo, ...input }) => createCustomCredential(writeDeps({ repo: guardRepo({ store: routeDeps.customCredentialSetRepo, signal }) }),
        { workspaceId: routeDeps.workspaceId, ...input }),
    },
    approval: {
      handler: steps => createApprovalHandler(steps),
      askHuman: ({ ctx, description }, options) => requireHumanConfirm({ ctx, surfaces, spec: description }, options),
      describeDelete: describeDeleteRequestApproval,
    },
    pluginCards: {
      load: required => loadPluginCredentialCardsSafely({ ...required, loadCards: routeDeps.loadPluginCredentialCards }),
      find: required => findPluginCredentialCard({ ...required, loadCards: routeDeps.loadPluginCredentialCards }),
      readValues: readPluginCredentialValues,
    },
    credentialCardForms: {
      buildPlugin: buildPluginCredentialForm, applyPlugin: applyPluginCredentialCard,
      create: buildCreateForm, createOutcome: buildCreateOutcome, rotate: setTokenForm, rotateOutcome: setTokenOutcome,
    },
    recovery: { withSetup: withCustomCredentialSetup },
    publish: {
      loadProviders: () => loadCreateCredentialProviders({ routeDeps }),
      prepareInvalidation: async () => {
        const registry = routeDeps.loadDeployTargets && routeDeps.publishCredentialVerificationCache ? await routeDeps.loadDeployTargets(routeDeps.workspaceId) : undefined;
        return ({ after }) => {
          if (registry && routeDeps.publishCredentialVerificationCache) invalidatePublishCredentialCompatibility({ workspaceId: routeDeps.workspaceId, registry, cache: routeDeps.publishCredentialVerificationCache, after });
        };
      },
    },
    locale: {
      resolve: ({ principalId }) => resolveOperatorLocale({ deps: routeDeps, workspaceId: routeDeps.workspaceId, principalId }),
      text: credentialText, hint: formatCredentialHint, translate: translateCredentialMessage,
    },
    policy: {
      guardRepo: abortGuardedCredentialRepo, cleanToken: cleanCardToken, assertFreeField: assertCredentialFreeField,
      normalizeWorksFor: normalizeCredentialWorksFor, defaultCategory: 'general', validateWriteFiles: validateWriteFilesInput,
      isProjectConflict: ({ error }) => error.message.startsWith("Your project already has a key named '"),
    },
    messages: {
      formSaveFailure: FORM_SAVE_FAILURE_MESSAGE,
      noCreateChannel: "custom_credential_create: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a credential cannot be created here. Nothing was changed.",
      noRotateChannel: "custom_credential_set_token: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a token cannot be collected here. Nothing was changed.",
      noDeleteChannel: "custom_credential_make_request: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a DELETE cannot be gated here. Nothing was sent.",
      runEnded: "The run ended. Nothing was changed.",
      invalidWorksFor: "worksFor must be an array of non-secret host or vendor IDs.",
      unlabeled: '(unlabeled)',
      missingUsername: "'username' is required — pass a non-empty string to set it, or null to clear it",
      invalidUsername: "'username' must be a non-empty string, or null to clear it",
      probeOriginMismatch: 'The saved origin no longer matches this key card. Nothing was saved.',
      unexpectedUsername: ({ keys }) => `custom_credential_set_username accepts only 'label' and 'username' — refusing unexpected field(s): ${keys.join(", ")}. ` +
        "This tool writes ONLY the plaintext username column; it can never accept, read, or change a token.",
      unexpectedToken: ({ keys }) => `custom_credential_set_token accepts only 'label' — refusing unexpected field(s): ${keys.join(", ")}. ` +
        "The token itself can only be supplied by a human, through the form this tool renders — never by this call.",
      notFoundLabel: ({ label }) => `no custom credential labeled '${label}' in this workspace`,
      notFoundId: ({ id }) => `no custom credential '${id}' in this workspace`,
      duplicateLabel: ({ label }) => `A custom credential labeled '${label}' already exists in this workspace. To rotate its token, use credential_save with kind api and target set to this label — ` +
        "this tool only creates NEW credentials and never overwrites an existing one.",
      missingPluginCard: ({ providerId }) => `No installed plugin declares a key card for '${providerId}'. Use credential_save with kind api instead.`,
      writeFailure: ({ message }) => `custom_credential_write_files: ${message}`,
      probeFailure: ({ status, keyHint, replacing }) => {
        const hint = keyHint ? ' This card needs: ' + keyHint : '';
        const kept = replacing ? ' The previous key was kept.' : '';
        return status === 'refused' ? `This key was refused for this purpose.${hint} Nothing was saved.${kept}`
          : `The service couldn't be reached. Nothing was saved.${kept}`;
      },
    },
    diagnostics: {
      describeError: ({ error }) => describeErrorForLog(error),
      createFailure: ({ metadata }) => failureLog(routeDeps)(JSON.stringify(metadata)),
      rotateFailure: ({ toolId, exchangeId, credentialId, errorSummary }) => failureLog(routeDeps)(`[custom-credentials] ${toolId}: save failed exchange=${exchangeId} credentialId=${credentialId} error=${errorSummary}`),
      writeFailure: required => reportRepositoryWriteFailure({ routeDeps, ...required }),
    },
    ids: { list: 'custom_credential_list', verify: 'custom_credential_verify', setUsername: 'custom_credential_set_username', makeRequest: MAKE_CREDENTIALED_REQUEST_TOOL_ID, writeFiles: WRITE_FILES_TOOL_ID, save: CREDENTIAL_SAVE_TOOL_ID },
    derivedRisk: customCredentialsDerivedRisk,
    modelFacingErrors: CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS,
    formErrors: FORM_SAVE_CALLER_SAFE_ERRORS,
  };
}

/** Tovu's old entry: the same registrations, bound to Tovu's vocabulary and card identity. */
export function buildCustomCredentialsRegistrations(routeDeps: CustomCredentialsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return createCustomCredentialsRegistrations({ routeDeps, surfaces, host: TOVU_CUSTOM_CREDENTIAL_HOST });
}

/**
 * Contributes `custom-credentials`' AI tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`,
 * not by importing this module.
 */
export function contributeCustomCredentialsTools(): ToolContributor<CustomCredentialsToolDeps, AssistantSurfaceDeps> {
  return { domain: DOMAIN, build: buildCustomCredentialsRegistrations, risk: customCredentialsDerivedRisk };
}
