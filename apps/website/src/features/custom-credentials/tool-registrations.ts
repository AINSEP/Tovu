import { abortGuardedCredentialRepo } from "../vendor-credentials/abort-guarded-repo.js";
import type { PluginCredentialCard, CredentialSetSummary as CustomCredentialSummary, CredentialSetConnectionInput as CustomProviderConnectionInput } from "@jini-ai/core/contracts/credentials";
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
import { buildAuthorizationHeader, type CredentialedRequestOutcome } from "@jini-ai/integrations/credentialed-http";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { createApprovalHandler, redactSecrets, buildDomainRegistrations, indexCatalogById, requireInputRecord, requireNoInput, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
// The same permission helpers `@jini-ai/cms/core` re-exports, taken from their defining core package.
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/core";
import type { SurfaceCardApp } from "@jini-ai/core/contracts/cards";
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import type { SecretCardForm } from "@jini-ai/core/contracts/cards";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  describeErrorForLog,
  forbiddenRule,
} from "../../contracts/core/model-facing-tool-errors.js";
import { callerSafeErrorMessage, withModelFacingErrors, type CallerSafeErrorRule, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`@jini-ai/daemon/surface-exchanges` re-exports the
// functions that use it, but not the type) — imported directly here so `handleSetTokenAnswer` below
// can name its `askThenReport`-shaped return type explicitly, mirroring `features/deployments/
// publish-agent-tools.ts`'s identical import for the same reason.
import type { SurfaceEmission } from "@jini-ai/core";
// `ToolInputError` is the marker `@jini-ai/daemon`'s `ToolExecutor` reads to tag a rejection
// `errorKind: 'validation'` instead of the `'internal'` bucket the delegated transport redacts.
import { ToolInputError } from "@jini-ai/core";
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
import type { CredentialedRequestPort, CredentialedRequestRequired, CredentialedRequestOptional, CredentialedRequestResult, SourceControlFileWritePlan, SourceControlFileWriter, SourceControlWritePort } from "@jini-ai/core/contracts/credentials";
import { bindCredentialedRequestPort, bindSourceControlWritePort } from "./credential-ports.js";
import { cleanCardToken } from "./card-token.js";
import { applyPluginCredentialCard, buildPluginCredentialForm } from "../../contracts/core/plugin-credential-card.js";
import { loadPluginCredentialCardsSafely, findPluginCredentialCard, readPluginCredentialValues, type LoadPluginCredentialCards } from "./plugin-credential-card.js";
import { buildCreateForm, buildCreateOutcome } from "./custom-credential-create-ui.js";
import { setTokenForm, setTokenOutcome } from "./custom-credential-set-token-ui.js";
import { describeDeleteRequestApproval, MAKE_CREDENTIALED_REQUEST_TOOL_ID } from "./delete-request-confirmation-ui.js";
import type { LoadSourceControlProviders } from "../source-control/provider-registry.js";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
} from "./store.js";
import type { CustomCredentialSetRepoPort } from "./types.js";
import { validateWriteFilesInput } from "./write-files-validation.js";
import type { CredentialCardIdentity, CustomCredentialSecretCards, CustomCredentialToolHost, CustomCredentialToolPorts } from "./credential-tool-host.js";
import type { CredentialCreatePrefill as CreateCredentialPrefill, CredentialToolActorDeps, CredentialToolOperations, CredentialToolSurfaces, CredentialToolSetupFailure, CredentialWriteFilesRequest } from "./credential-tool-operations.js";
import { tovuCredentialCardIdentity } from "./tovu-credential-card-identity.js";

/** @agent-note Provider target validation joins the exact already-validated file payload; no
 * decrypt, rebuild or re-plan may change it before the single provider commit. */
type ValidatedWriteFilesInput = CredentialWriteFilesRequest & { readonly owner: string; readonly repo: string };

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

/** Stamps the host's app identity on a card a host builder made; Tovu's own values keep the same bytes. */
function withCardApp<Spec extends { readonly app?: SurfaceCardApp }>({ spec, app }: { spec: Spec; app: SurfaceCardApp }): Spec {
  return { ...spec, app };
}

/**
 * Decides which of `custom_credential_make_request`'s rejections are the CALLER's to fix — the same
 * `withSchemaOnRejection` classification `features/media-import/tool-registrations.ts`'s own
 * `isImportShapeRejection` established (2026-09-07, SEC-05) for the identical failure mode: an
 * unclassified rejection reaches `@jini-ai/daemon`'s `ToolExecutor` as `errorKind: 'internal'`, which
 * `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into a bare `INTERNAL_ERROR` —
 * stripping the one piece of information (WHICH rule refused the call) a caller could actually act on.
 *
 * Two classes:
 * - `CredentialedRequestValidationError` — a bad `method`/`url`/`headers`/`body` shape, OR a `url`
 *   whose origin is not one of the credential's own saved hosts (`resolveAllowedRequestUrl`'s
 *   allowlist refusal — the "off-allowlist host" case).
 * - `EgressRefusedError` — the shared `HttpClientPort` (ADR-038) refused the target before ever
 *   connecting: a non-public resolved address on the first hop or any re-verified redirect hop, a
 *   disallowed scheme, or credentials embedded in the URL.
 *
 * makeCredentialedRequest must preserve EgressRefusedError rather than wrapping it as a
 * transport failure. Otherwise this instanceof classification loses the actionable egress reason
 * and a URL refusal becomes indistinguishable from a DNS/timeout crash.
 *
 * An `EgressRefusedError` reaches the model in its `callerSafeMessage` form only — without the
 * address the hostname resolved to — via {@link makeModelFacingCredentialedRequest}, which every
 * call site uses instead of wrapping this predicate directly.
 *
 * Deliberately NOT `CredentialedRequestTransportError` (a DNS failure, timeout, or connection error
 * is not a decision this process made, and a different URL does not reliably fix it — same reasoning
 * `isImportShapeRejection`'s own doc gives for the identical class of failure) and NOT
 * `CustomCredentialNotFoundError` (a different call shape — a wrong label — unrelated to this tool's
 * egress/allowlist boundary and out of scope for this fix).
 *
 * The port's `classifyError` names those two classes `validation` and `egress-refused`.
 *
 * @complexity O(1) — one `classifyError` call.
 */
function isCredentialedRequestShapeRejection(error: unknown, port: CredentialedRequestPort): boolean {
  const { category } = port.classifyError({ error });
  return category === "validation" || category === "egress-refused";
}

/**
 * `makeCredentialedRequest` as the model may see it fail: shape rejections schema-decorated per
 * {@link isCredentialedRequestShapeRejection}, and an `EgressRefusedError` narrowed to its
 * `callerSafeMessage` BEFORE that decoration reads `.message`.
 *
 * The refusal and requested hostname reach the model; the resolved address stays server-side.
 * A model that can name any host and read back its resolved address can map internal
 * DNS one call at a time (`internal-db.corp` -> `10.0.4.7`). The full message, address included, is
 * kept server-side in the audit entry `makeCredentialedRequest` records (`egressRefusal`).
 *
 * @complexity O(1) beyond `makeCredentialedRequest` itself.
 */
async function makeModelFacingCredentialedRequest({ port, input, catalog, toolId }: { port: CredentialedRequestPort; input: CredentialedRequestRequired & CredentialedRequestOptional; catalog: CustomCredentialToolHost["vocabulary"]["catalog"]; toolId: string }): Promise<CredentialedRequestResult> {
  return withSchemaOnRejection({ toolId, catalog,
    isShapeRejection: ({ error }) => isCredentialedRequestShapeRejection(error, port), fn: async () => {
    const { headers, body, ...required } = input;
    try {
      return await port.request(required, { headers, body });
    } catch (err) {
      const classified = port.classifyError({ error: err });
      if (classified.category === "egress-refused") throw classified.callerSafeError;
      throw err;
    }
  } });
}

/**
 * The same classification for `custom_credential_write_files`, which validates its whole input
 * (`validateWriteFilesInput`) BEFORE the credential is even resolved. Every rejection from there is
 * `CustomCredentialValidationError`, and every one of them names a rule a different call would
 * satisfy: a bad owner/repo/branch/commitMessage, a path that is absolute, escapes the repository
 * root, nests under `.git`, or duplicates another entry, a file over the per-file cap, or a batch
 * over the file-count or aggregate-byte cap.
 *
 * That class extends plain `Error`, so an undecorated throw reaches `@jini-ai/daemon`'s
 * `ToolExecutor` as `errorKind: 'internal'` and `@jini-ai/http-kit`'s `delegatedToolExecuteRoute`
 * SEC-005-redacts it into a bare `INTERNAL_ERROR` — a model told only "something broke" about a
 * refusal it could have fixed by moving one file out of `.git/`. Deliberately narrow: this predicate
 * runs only around the validation call, so it never reclassifies the resolve/plan/commit failures
 * that follow it.
 *
 * @complexity O(1) — one `instanceof` check.
 */
function isWriteFilesShapeRejection(error: unknown): boolean {
  return error instanceof CustomCredentialValidationError;
}

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

/** `custom_credential_write_files`'s ENTIRE agent-facing result shape — boolean-plus-reason on every
 *  non-success branch, the same discriminated shape {@link SetTokenResult}/{@link CreateCredentialResult}
 *  use below for the identical reason: nothing here could ever be widened to carry the token, and a
 *  caller can always branch on `executed` alone regardless of which branch produced the result.
 *  `reason: "error"` is this tool's own addition — unlike a form submission, the write itself can fail
 *  at the GitHub API level AFTER confirmation (a diverged branch, a provider error), which needs a
 *  human-readable `message` the other reasons never carry. That `message` is always caller-safe: a
 *  network failure's detail goes to the server log only, via {@link reportRepositoryWriteFailure}.
 * @agent-note Successful results are value-free commit facts; failure messages must already be
 * caller-safe. No token, authorization header or file content may enter this result. */
type WriteFilesResult =
  | { executed: true; commitSha: string; commitUrl: string; filesWritten: number }
  | { executed: false; cancelled: true }
  | { executed: false; cancelled: false; reason: "expired" | "abandoned" }
  | { executed: false; cancelled: false; reason: "error"; message: string };

/**
 * Commits using the SAME validated provider plan the handler obtained, rather than re-planning.
 * This keeps the tree and branch-freshness checks tied to the read-only reconnaissance result.
 * Keeping the write separate also bounds the handler's branching complexity.
 *
 * @complexity O(1) beyond the provider's `commitFiles`'s own O(files) cost.
 */
async function performRepositoryFilesWrite({ operations, port, provider, resolved, validated, plan }: {
  operations: CredentialToolOperations;
  port: SourceControlWritePort;
  provider: SourceControlFileWriter;
  resolved: { baseUrl: string; connection: CustomProviderConnectionInput };
  validated: ValidatedWriteFilesInput;
  plan: SourceControlFileWritePlan;
}, _optional = {}): Promise<WriteFilesResult> {
  const commitResult = await port.commitFiles({ provider,
    input: { ...writeTarget(resolved, validated), branch: validated.branch, commitMessage: validated.commitMessage, files: validated.files },
    plan });
  if (!commitResult.ok) {
    operations.diagnostics.writeFailure({ phase: "commit", failure: commitResult });
    return { executed: false, cancelled: false, reason: "error", message: commitResult.message };
  }
  return { executed: true, commitSha: commitResult.commitSha, commitUrl: commitResult.commitUrl, filesWritten: validated.files.length };
}

/** Where a write goes: the credential's API plus the `Authorization` header built from its connection. */
function writeTarget(resolved: { baseUrl: string; connection: CustomProviderConnectionInput }, validated: ValidatedWriteFilesInput) {
  return { baseUrl: resolved.baseUrl, authorization: buildAuthorizationHeader({ connection: resolved.connection, schemes: [] }), owner: validated.owner, repo: validated.repo };
}

/** The exact keys `custom_credential_set_username` accepts — nothing else, ever. This is the
 *  structural half of "this tool can never accept a token" promised in `agent-tools.ts`'s own catalog
 *  description: `additionalProperties: false` on that catalog entry's `inputSchema` is descriptive
 *  only (the kernel "neither parses nor validates" a tool's schema — see `@jini-ai/core`'s own
 *  `ToolDescriptor.inputSchema` doc), so THIS handler-level check is the one that is actually
 *  enforced. */
const SET_USERNAME_ALLOWED_FIELDS: ReadonlySet<string> = new Set(["label", "username"]);

/**
 * Refuses a `custom_credential_set_username` call carrying any field other than `label`/`username` —
 * in particular, a `token`/`connection`/`secret`-shaped field a model might try to smuggle a
 * credential rotation through. This is the property that makes it defensible to leave this tool
 * un-confirmed (see this file's header): there is no field on this call shape capable of carrying a
 * secret, so there is nothing a confirmation dialog would even be protecting against.
 *
 * @throws {CustomCredentialValidationError} `input` carries a key other than `label`/`username`.
 * @complexity O(n) in the number of supplied input keys.
 */
function rejectUnexpectedSetUsernameFields({ input, messages }: { input: Record<string, unknown>; messages: CredentialToolOperations['messages'] }, _optional = {}): void {
  const unexpected = Object.keys(input).filter((key) => !SET_USERNAME_ALLOWED_FIELDS.has(key));
  if (unexpected.length > 0) {
    throw new CustomCredentialValidationError(
      messages.unexpectedUsername({ keys: unexpected })
    );
  }
}

/**
 * Reads and validates this tool's required `username` field: a non-empty string to set it, or `null`
 * to explicitly clear it. Unlike `store.ts`'s own `validateUsernamePatch` (which validates
 * `updateCustomCredential`'s OPTIONAL `username` patch, where omitting the field entirely means "leave
 * unchanged"), omitting the key here is itself a caller error — this tool exists for exactly one job,
 * set-or-clear, so "say nothing" is never a valid call into it. Mirrors that function's own two
 * non-omitted values and their exact wording for the one case they share (a blank string), so the two
 * surfaces never describe the same rule two different ways.
 *
 * @throws {CustomCredentialValidationError} `username` is omitted, or present but neither `null` nor a
 *   non-empty string.
 * @complexity O(1).
 */
function requireUsernameOrClearSentinel({ input, messages }: { input: Record<string, unknown>; messages: CredentialToolOperations['messages'] }, _optional = {}): string | null {
  if (input.username === undefined) {
    throw new CustomCredentialValidationError(messages.missingUsername);
  }
  if (input.username === null) return null;
  if (typeof input.username !== "string" || input.username.trim() === "") {
    throw new CustomCredentialValidationError(messages.invalidUsername);
  }
  return input.username;
}

/** The exact keys `custom_credential_set_token` accepts on the MODEL-ISSUED call — `label`, nothing
 *  else, ever. The API rotation schema (`credential-save-tool.ts`) already has no `token` property to fill in, but
 *  `additionalProperties: false` is descriptive only (same caveat `SET_USERNAME_ALLOWED_FIELDS`'s own
 *  doc gives) — this is the layer that is actually enforced. */
const SET_TOKEN_ALLOWED_FIELDS: ReadonlySet<string> = new Set(["label"]);

/**
 * Refuses a `custom_credential_set_token` call carrying any field other than `label` — the ONLY
 * gate standing between "the model can never supply a token to this tool" and a future edit that adds
 * a second property to its schema without also widening this check. There is no legitimate reason for
 * this call to ever carry anything else: the token itself can only ever arrive later, through the
 * rendered form's own submission, which this function never sees (it validates the ORIGINAL call that
 * opens the exchange, before any form exists).
 *
 * @throws {CustomCredentialValidationError} `input` carries a key other than `label`.
 * @complexity O(n) in the number of supplied input keys.
 */
function rejectUnexpectedSetTokenFields({ input, messages }: { input: Record<string, unknown>; messages: CredentialToolOperations['messages'] }, _optional = {}): void {
  const unexpected = Object.keys(input).filter((key) => !SET_TOKEN_ALLOWED_FIELDS.has(key));
  if (unexpected.length > 0) {
    throw new CustomCredentialValidationError(
      messages.unexpectedToken({ keys: unexpected })
    );
  }
}

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

/** `custom_credential_set_token`'s ENTIRE agent-facing result shape — deliberately boolean-plus-reason
 *  and nothing richer, so there is no field this type could ever be widened to carry the submitted
 *  token in (contrast `CustomCredentialSummary`, which `custom_credential_set_username` safely returns
 *  in full because none of its fields are secret).
 * @agent-note Return lifecycle status and caller-safe text only; hints stay on human outcomes. */
type SetTokenResult = { saved: true } | { saved: false; reason: "cancelled" | "expired" | "abandoned" | "invalid" | "error"; message?: string };

/** Probe only plugin-owned API cards before sealing, keeping every failure value-free.
 * @throws CustomCredentialValidationError for refusal/unavailability or an origin mismatch.
 * @complexity One bounded GET plus the installed auth-scheme load; no persistence.
 */
async function probeCardBeforeSave({ card, baseUrl, connection, routeDeps, operations, probe, signal }: {
  card?: PluginCredentialCard; baseUrl: string; connection: { token: string; username?: string };
  routeDeps: CredentialToolActorDeps; operations: CredentialToolOperations; probe: CredentialedRequestPort["probe"]; signal: AbortSignal;
}, { replacing = false }: { replacing?: boolean } = {}): Promise<void> {
  if (!card?.probeUrl) return;
  // Rotation must not send a key to a card's old origin after the saved row was re-pointed.
  if (new URL(card.probeUrl).origin !== new URL(baseUrl).origin) throw new CustomCredentialValidationError(operations.messages.probeOriginMismatch);
  const schemes = await routeDeps.loadAuthSchemes({ workspaceId: routeDeps.workspaceId });
  signal.throwIfAborted();
  const status = await probe({ connection, url: card.probeUrl, schemes });
  signal.throwIfAborted();
  if (status === 'refused' || status === 'unavailable') throw new CustomCredentialValidationError(operations.messages.probeFailure({ status, keyHint: card.keyHint, replacing }));
}

/** Every dependency {@link saveSetToken} needs to seal the submitted token and report the
 *  outcome — bundled so `custom_credential_set_token`'s own `askThenReport` call passes one object
 *  rather than the handler's whole closure, same shape `features/deployments/publish-agent-tools.ts`'s
 *  `PublishConfirmationContext` uses for the identical reason.
 * @agent-note The captured summary identifies a row only. Re-read current username/metadata at
 * replacement and retain current authorization, owner/grant and CAS checks. */
interface SetTokenAnswerContext {
  readonly routeDeps: CredentialToolActorDeps;
  readonly operations: CredentialToolOperations;
  readonly probe: CredentialedRequestPort["probe"];
  readonly existing: CustomCredentialSummary;
  readonly pluginCard?: PluginCredentialCard;
}

/**
 * `custom_credential_set_token`'s `askThenReport` answer handling — extracted to a top-level function
 * so its own complexity is measured independently of the handler that opens the exchange and builds
 * the form, same reasoning `handlePublishConfirmationAnswer`
 * (`features/deployments/publish-agent-tools.ts`) gives for its own extraction.
 *
 * `askThenReport`, not `askOnce`: a submitted form's `tools/call` resolves the instant
 * `mcp-ui-tool-calls-route.ts` DELIVERS it to this parked call, before `updateCustomCredential` below
 * has even run — see `custom-credential-set-token-ui.ts`'s header for the full defect this avoids. Each
 * non-success branch that sends an `outcome` does so because the confirmation-turned-form's own script
 * would otherwise leave a bare "Done." on screen for work that has not actually happened yet; the
 * cancel/no-answer branches send none, because the form's own script already reports "Dismissed."/an
 * expiry locally the moment this call resolves, and that IS the truth for those two cases (nothing
 * asynchronous happens afterward that could still fail) — identical reasoning
 * `handlePublishConfirmationAnswer`'s own cancel branch documents.
 *
 * The token itself lives in a single local parameter for the width of this function and is never
 * assigned to any field this function returns, logged, or otherwise retained — the property
 * `agent-tools.ts`'s own catalog description promises the model.
 *
 * @complexity O(1) locally, an optional bounded GET, and one `updateCustomCredential` call (validate, seal, write).
 */
// Lifecycle classification and outcome delivery now belong to Jini; this function is only the save port.
async function saveSetToken(
  { token, signal, routeDeps, operations, probe, existing, pluginCard, principalId }: SetTokenAnswerContext & { token: string; signal: AbortSignal; principalId: string }, _optional = {},
): Promise<CustomCredentialSummary> {
  // Paste artifacts are dropped before anything is read or written; see card-token.ts.
  const cleanedToken = operations.policy.cleanToken({ token });
  // Re-reads the username HERE, at write time — never trusts `existing` (captured back when
  // `custom_credential_set_token`'s handler first resolved the label, before the form was even shown
  // to a human who may sit on it for an arbitrarily long time). `custom_credential_set_username` can
  // run against this same row while the form is open; if this handler carried `existing.username`
  // forward as a captured literal, that concurrent change would be silently overwritten with the
  // value the username held before the form opened. `existing.id` is still safe to reuse — it names
  // WHICH row to update and cannot go stale the way a plaintext column value can.
  const current = await operations.sets.describe({ id: existing.id });
  if (!current) throw new CustomCredentialNotFoundError(operations.messages.notFoundId({ id: existing.id }));
  // Half-migrated credentials keep the username only in their sealed connection. Resolve that
  // fallback from the current row, retaining the fresh-read protection against form-open races.
  const resolved = current.username === undefined
    ? await operations.sets.resolve({ label: current.label })
    : null;
  const username = current.username ?? resolved?.connection.username;
  if (signal.aborted) throw new ToolInputError({ message: operations.messages.runEnded });
  const connection = { token: cleanedToken, ...(username !== undefined ? { username } : {}) };
  await probeCardBeforeSave({ card: pluginCard, baseUrl: current.baseUrl, connection, routeDeps, operations, probe, signal }, { replacing: true });
  return await operations.sets.replace(
    {
      id: existing.id,
      signal, principalId, guardRepo: operations.policy.guardRepo,
      // Carries the CURRENT (just re-read) username forward into the fresh connection. Replacing
      // `connection` WITHOUT one would silently CLEAR a saved username — `store.ts`'s own
      // `updateCustomCredential` doc: "replacing the connection replaces the username ... including
      // clearing it, when the new connection omits one". A token-only fix must never have that side
      // effect, and must never resurrect a value the username has since moved on from either — hence
      // the fresh read above rather than the `existing` snapshot. A row deleted while the form
      // was open is refused before probing; the store also catches deletion after this read.
      connection,
    }
  );
}

/** Reads `custom_credential_create`'s optional non-secret prefill hints off the model-issued call —
 *  see `credential-save-tool.ts`'s API creation schema for the exact three fields this accepts. Blank
 *  strings are treated as absent, matching `buildS3CompatiblePrefill`'s
 *  (`features/deployments/publish-agent-tools.ts`) identical convention for the same kind of field. A
 *  prefilled `category` that turns out not to be one of the fixed options is passed through unchecked —
 *  harmless, since `renderSelect` simply starts unselected on an unrecognised value (`custom-credential-
 *  create-ui.ts`'s own doc) and the real enforcement is `store.ts`'s `validateCategory` at write time.
 *
 * @complexity O(1) — three fixed field reads.
 */
function readCreateCredentialPrefill({ input, operations }: { input: Record<string, unknown>; operations: CredentialToolOperations }, _optional = {}): CreateCredentialPrefill {
  const prefill: { label?: string; baseUrl?: string; category?: string; worksFor?: string[] } = {};
  if (input.worksFor !== undefined) {
    try {
      prefill.worksFor = operations.policy.normalizeWorksFor({ value: input.worksFor });
      for (const value of prefill.worksFor) operations.policy.assertFreeField({ value, field: "worksFor" });
    } catch { throw new ToolInputError({ message: operations.messages.invalidWorksFor }); }
  }
  for (const field of ["label", "baseUrl", "category"] as const) {
    if (typeof input[field] === "string" && (input[field] as string).trim() !== "") {
      operations.policy.assertFreeField({ value: input[field] as string, field });
      prefill[field] = input[field] as string;
    }
  }
  return prefill;
}

/** `custom_credential_create`'s ENTIRE agent-facing result shape. On success, the SAME summary shape
 *  `custom_credential_list`/`custom_credential_set_username` already return — safe in full, since
 *  `CustomCredentialSummary` has no field capable of carrying a secret (`types.ts`'s own doc). Every
 *  failure branch is boolean-plus-reason, the same shape {@link SetTokenResult} uses and for the
 *  identical reason: nothing here could ever be widened to carry the submitted token.
 *  `'duplicate-label'` is this tool's own addition — `custom_credential_set_token` has no equivalent
 *  case, since it always targets a row that is already known to exist.
 * @agent-note Strip human-only hints from success; failures carry safe status/reason/text,
 * never submitted values, sealed/private context or raw exceptions. */
type CreateCredentialResult =
  | { created: true; credential: Omit<CustomCredentialSummary, "tokenHint"> }
  | { created: false; reason: "cancelled" | "expired" | "abandoned" | "invalid" | "duplicate-label" | "error"; message?: string };

/** Create has no existing row to resolve before the form opens: its target row does not exist
 * until the human submits. The save port receives only its own explicit domain dependencies. */
/** `custom_credential_create`'s five submitted form fields, in their raw `typeof`-guarded form — no
 *  defaulting yet (see {@link deriveCreateCredentialSubmission} for that stage). Split from it so each
 *  function's own complexity is measured independently: this one is pure shape-narrowing, that one is
 *  pure decision-making, and neither has to read the other's reasoning to verify its own.
 *  @agent-note These are the existing saved-card field names. Values arrive only from the human
 *  secure-card answer, never a model-issued secret input; retain them only through probe/seal.
 *  @complexity O(1) — five fixed field reads. */
interface RawCreateCredentialFields {
  readonly worksFor: unknown;
  readonly label: string;
  readonly baseUrl: string;
  readonly category: string;
  readonly username: string;
  readonly token: string;
}

/**
 * Narrows `custom_credential_create`'s five submitted params to strings, with no defaulting — a
 * missing or non-string field reads as `""`, exactly like every other `answer.params[...]` read in
 * this file; parsing never changes the submitted token bytes.
 *
 * @complexity O(1) — five fixed field reads.
 */
function readRawCreateCredentialFields(params: Record<string, unknown>): RawCreateCredentialFields {
  return {
    worksFor: params.worksFor ?? [],
    label: typeof params["label"] === "string" ? params["label"] : "",
    baseUrl: typeof params["baseUrl"] === "string" ? params["baseUrl"] : "",
    category: typeof params["category"] === "string" ? params["category"] : "",
    username: typeof params["username"] === "string" ? params["username"] : "",
    token: typeof params["token"] === "string" ? params["token"] : "",
  };
}

/** {@link deriveCreateCredentialSubmission}'s output — the fully-defaulted shape the rest of
 *  {@link saveCreateCard} actually acts on.
 * @agent-note Category/display defaults are host inputs. Fixed plugin destinations cannot be
 * widened by submitted fields; the token remains local to probe and sealing. */
interface CreateCredentialSubmission {
  readonly additionalHosts?: readonly string[];
  readonly pluginCard?: PluginCredentialCard;
  readonly worksFor: unknown;
  readonly label: string;
  readonly baseUrl: string;
  readonly category: string;
  readonly username: string | undefined;
  readonly token: string;
  /** `"site"` = saved "only for this site"; omitted = the project store when one is attached. */
  readonly scope?: "site";
  /** A blank `label` still needs a human-readable name for the outcome surface's own "Label" detail
   *  row — `store.ts`'s own validation error (surfaced via {@link mapCreateCredentialError}) is what
   *  actually refuses the submission; this is display-only. */
  readonly displayLabel: string;
}

/**
 * Applies `custom_credential_create`'s three field defaults on top of {@link readRawCreateCredentialFields}'s
 * raw extraction. Every REAL field validation (non-empty label/baseUrl, a closed category, the
 * `(workspaceId, label)` uniqueness constraint) is still left entirely to `store.ts`'s own
 * `createCustomCredential` — this function only decides what a blank/missing field DEFAULTS to before
 * that validation ever runs:
 *
 * - `category`: defaults to `"general"` (the closed set's catch-all, same as the admin Access Tokens
 *   page's own "Add custom provider" form) rather than passing a blank string through to `store.ts`'s
 *   `validateCategory`, which would reject it outright and block the save on a required field the human
 *   had no obvious answer for. Belt-and-suspenders alongside `custom-credential-create-ui.ts`'s own form
 *   default: that default lives in the rendered `<select>`'s pre-selected option, this one covers a
 *   submission that somehow arrives without it. `"general"` is itself a member of the closed set
 *   `validateCategory` enforces, so a caller-supplied INVALID category (anything outside the fixed set)
 *   is still rejected exactly as before — this default never widens what counts as valid.
 * - `username`: a blank string is treated as "omitted", matching `readCreateCredentialPrefill`'s own
 *   identical convention for the same optional field.
 * - `displayLabel`: a blank `label` still needs a human-readable name for the outcome surface (see its
 *   own field doc above); `token` is passed through unchanged — the engine checks blankness before
 *   calling the domain save port.
 *
 * @complexity O(1) — three fixed defaulting decisions.
 */
function safeCredentialLabel({ label, operations }: { label: string; operations: CredentialToolOperations }, _optional = {}): string {
  try { operations.policy.assertFreeField({ value: label, field: 'label' }); return label.trim() === '' ? operations.messages.unlabeled : label; }
  catch { return operations.messages.unlabeled; }
}

function deriveCreateCredentialSubmission({ raw, operations }: { raw: RawCreateCredentialFields; operations: CredentialToolOperations }, _optional = {}): CreateCredentialSubmission {
  return {
    worksFor: raw.worksFor,
    label: raw.label,
    baseUrl: raw.baseUrl,
    category: raw.category.trim() === "" ? operations.policy.defaultCategory : raw.category,
    username: raw.username.trim() === "" ? undefined : raw.username,
    token: raw.token,
    displayLabel: safeCredentialLabel({ label: raw.label, operations }),
  };
}

/** Shared safe failure metadata drives both the model result and the human outcome. Cancel,
 * expiry and abandonment emit no outcome because their state is already rendered locally.
 * @agent-note Both projections receive only a message passed through host caller-safe rules;
 * never retain submitted tokens or raw exceptions in this state. */
interface CreateCardFailure {
  readonly reason: 'invalid' | 'duplicate-label' | 'error';
  readonly message: string;
}

/**
 * Maps a `createCustomCredential` rejection onto `custom_credential_create`'s own failure shape — the
 * error-type dispatch mirrors the established one-function-per-error-type-table shape this codebase
 * already uses for exactly this job (`sendPageCreateError`/`sendPostCreateError`,
 * `server/inbound/admin-http/routes/pages|posts/create.ts`, and `sendPluginUninstallError`,
 * `.../plugins/uninstall.ts`), adapted here to return a value instead of writing an HTTP response.
 *
 * A collision is refused, never silently overwritten — and the refusal names the correct tool for a
 * rotation, so the model does not retry this CREATE-only tool against an existing row. Every other
 * failure's message goes through the same caller-safe allowlist as rotation — never an unlisted
 * `err.message`, which can quote the submitted token.
 *
 * @complexity O(r) in {@link FORM_SAVE_CALLER_SAFE_ERRORS}' rule count.
 */
function mapCreateCredentialError(
  required: { err: unknown; locale: string; label: string; operations: CredentialToolOperations }, _optional = {}
): CreateCardFailure {
  const { err, locale, label, operations } = required;
  if (err instanceof CustomCredentialDuplicateLabelError) {
    if (operations.policy.isProjectConflict({ error: err })) return { reason: 'duplicate-label', message: err.message };
    const message = operations.messages.duplicateLabel({ label });
    return { reason: 'duplicate-label', message };
  }
  const message = operations.locale.translate({ message: callerSafeErrorMessage({ err, rules: operations.formErrors, fallback: operations.messages.formSaveFailure }), locale });
  return { reason: err instanceof CustomCredentialValidationError ? 'invalid' : 'error', message };
}

/**
 * The create card's domain save port stays separate from the engine's exchange lifecycle so its
 * persistence cost is visible. askThenReport, rather than askOnce, keeps the human's submission
 * waiting until the real store operation has finished instead of reporting premature Done.
 *
 * Every real field validation (non-empty label/baseUrl, closed category, workspace/label uniqueness)
 * remains in createCustomCredential. The engine refuses blank tokens before sealConnection; the
 * domain keeps field parsing/defaulting and the error-type mapper for actionable failures.
 *
 * The token lives only in the local submission and the sealed store. It is never returned, logged,
 * or retained in a projection — the property promised by agent-tools.ts's catalog description.
 * Only the save runs within the engine's error boundary, so Nothing was saved remains truthful.
 * @complexity O(1) locally, an optional bounded GET, and one createCustomCredential call (validate, seal, insert).
 */
async function saveCreateCard(
  required: { submission: CreateCredentialSubmission; routeDeps: CredentialToolActorDeps; operations: CredentialToolOperations; probe: CredentialedRequestPort["probe"]; signal: AbortSignal }, _optional = {}
): Promise<CustomCredentialSummary> {
  const { routeDeps, operations, probe, submission, signal } = required;
  await probeCardBeforeSave({ card: submission.pluginCard, baseUrl: submission.baseUrl,
    connection: { token: operations.policy.cleanToken({ token: submission.token }), ...(submission.username !== undefined ? { username: submission.username } : {}) }, routeDeps, operations, probe, signal });
  // Reuse the existing guard, including vault writes after asynchronous sealing.
  // Only persistence sits in the engine's save boundary, so failure copy stays truthful.
  const invalidate = await operations.publish.prepareInvalidation({});
  const saved = await operations.sets.create(
    {
      signal, guardRepo: operations.policy.guardRepo,
      label: submission.label,
      worksFor: submission.worksFor,
      category: submission.category,
      baseUrl: submission.baseUrl,
      ...(submission.additionalHosts === undefined ? {} : { additionalHosts: submission.additionalHosts }),
      ...(submission.scope ? { scope: submission.scope } : {}),
      connection: { token: operations.policy.cleanToken({ token: submission.token }), ...(submission.username !== undefined ? { username: submission.username } : {}) },
    }
  );
  invalidate({ after: saved });
  return saved;
}

/**
 * Opens a create card and saves its submission as a NEW credential row — shared by the generic API
 * card and a plugin's own key card, which differ only in their form and how a submission maps onto
 * the row. Same engine, save port, safe errors and outcome for both.
 * @complexity O(1) locally plus one createCustomCredential call per submission.
 */
async function openCreateCard(required: {
  ctx: ToolExecutionContext; emitSurface: ToolExecutionOptions["emitSurface"];
  routeDeps: CredentialToolActorDeps; operations: CredentialToolOperations; probe: CredentialedRequestPort["probe"]; cards: CustomCredentialSecretCards; surfaces: CredentialToolSurfaces; locale: string; initialLabel: string; cardIdentity: CredentialCardIdentity;
  form: () => SecretCardForm; submissionOf: (values: Readonly<Record<string, unknown>>) => CreateCredentialSubmission;
}, _optional = {}): Promise<CreateCredentialResult> {
  const { ctx, emitSurface, routeDeps, operations, probe, cards, surfaces, locale, initialLabel, cardIdentity, form, submissionOf } = required;
  // Fail closed rather than degrade — the only place a token can enter is the rendered form.
  // A ToolInputError preserves this exact wording; a bare Error would become a redacted 500.
  // The engine checks pre-dialog aborts and uses askThenReport so the save completes before Done.
  // These safe projections are scoped to this invocation, never shared between concurrent cards.
  // The error kind selects this tool's existing reason; the engine still owns error redaction.
  let failure: CreateCardFailure | undefined;
  let displayLabel = safeCredentialLabel({ label: initialLabel, operations });
  const card = cards.defineSecretCardTool<Record<string, never>, CustomCredentialSummary, CreateCredentialResult>({
    toolId: operations.ids.save,
    prepare: async () => ({}),
    form: () => form(),
    save: ({ values, signal }) => {
      // The shared save-result path attaches a submitted project key to this site.
      const submission = submissionOf(values);
      displayLabel = redactSecrets({ input: submission.displayLabel }, { exactSecrets: [submission.token] });
      return saveCreateCard({ submission, routeDeps, operations, probe, signal });
    },
    result: ({ run }) => {
      if (run.status === 'saved') {
        // The summary's token hint is for the human outcome only; strip it before returning to the model.
        const { tokenHint: _humanHint, ...credential } = run.saved;
        return { created: true, credential };
      }
      if (run.status === 'blank') return { created: false, reason: 'invalid', message: operations.locale.text({ id: 'blank', locale }) };
      if (run.status === 'failed') return { created: false, reason: failure?.reason ?? 'error', message: run.safeMessage };
      return { created: false, reason: run.status };
    },
    outcome: ({ run }) => {
      if (run.status === 'saved') {
        const hint = operations.locale.hint({ hint: run.saved.tokenHint, locale });
        return withCardApp({ spec: operations.credentialCardForms.createOutcome({ label: run.saved.label, state: 'success', message: `${hint ? hint + '. ' : ''}${operations.locale.text({ id: 'saved', locale })}` }), app: cardIdentity.appNames.createOutcome });
      }
      if (run.status === 'blank' || run.status === 'failed') return withCardApp({ spec: operations.credentialCardForms.createOutcome({ label: displayLabel, state: 'failure',
        message: run.status === 'blank' ? operations.locale.text({ id: 'blank', locale }) : run.safeMessage }), app: cardIdentity.appNames.createOutcome });
      // Cancel/expiry/abandonment already render locally: no second outcome is emitted.
      return undefined;
    },
  }, {
    uriHost: cardIdentity.uriNamespace,
    text: { noEmitter: operations.messages.noCreateChannel, saveFailure: operations.messages.formSaveFailure },
    safeError: err => {
      failure = mapCreateCredentialError({ err, locale, label: displayLabel, operations });
      return failure.message;
    },
    // Fixed exchange metadata only: exception text, the label, and submitted values are unsafe.
    logFailure: metadata => operations.diagnostics.createFailure({ metadata }),
  });
  return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport: cards.askThenReport })(ctx, { emitSurface });
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

/**
 * API-key cards with every consumed operation supplied by the composing host.
 * @agent-note All policy/copy/builders/catalogs/diagnostics come from operations. Actor scope is
 * trusted, permissions precede reads/dialogs, the answer route uses the SAME surface store, and
 * only the human card supplies secrets. Probe before seal; preserve current username and grant
 * on replacement. Outcome replaces the same URI only after successful persistence/invalidation.
 * @complexity O(1) wiring; each adapter performs the bounded operations documented on its ports.
 */
export function createCredentialSaveHandlers({ routeDeps, surfaces, host, ports, cards, operations }: { routeDeps: CredentialToolActorDeps; surfaces: CredentialToolSurfaces; host: CustomCredentialToolHost; ports: Pick<CustomCredentialToolPorts, 'credentialedRequest'>; cards: CustomCredentialSecretCards; operations: CredentialToolOperations }, _optional = {}): { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } {
  const probe: CredentialedRequestPort["probe"] = (input) => ports.credentialedRequest.probe(input);
  const handlers: { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } = {
    // An MCP-UI surface for the SECRET itself — see this file's header, "custom_credential_set_token",
    // for the full mechanism and why it holds up "a token must never pass through the model's
    // context" rather than merely "an agent must never write one". Shape validation
    // (`rejectUnexpectedSetTokenFields`) and the label->id resolution both run BEFORE any exchange is
    // opened, same ordering `custom_credential_make_request`'s DELETE gate below uses: a malformed or
    // unresolvable call must never raise a dialog for a human to see. WRITE-gated, same permission
    // `custom_credential_set_username`/`custom_credential_make_request` use.
    rotate: async (ctx, options = {}): Promise<SetTokenResult> => {
      const input = requireInputRecord({ input: ctx.input });
      rejectUnexpectedSetTokenFields({ input, messages: operations.messages });
      const label = requireString({ input, key: "label" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });

      // Non-decrypting label->id resolution — same lookup `custom_credential_set_username` above uses,
      // and for the identical reason: a bad label should never cost a decrypt. Only `existing.id` is
      // load-bearing past this point: `saveSetToken` deliberately re-reads the username itself,
      // fresh, right before writing — see its own header for why trusting THIS snapshot's username
      // would be wrong once the human's answer can arrive an arbitrarily long time later.
      const existing = await operations.sets.byLabel({ label });
      if (!existing) {
        throw new CustomCredentialNotFoundError(operations.messages.notFoundLabel({ label }));
      }

      // Fail closed rather than degrade — and, unlike every OTHER gated tool in this codebase, there is
      // deliberately no fallback second-call shape for this one even in principle: that shape is a
      // fresh MODEL-ISSUED tool call carrying the human's answer as its own input, which is exactly the
      // path this tool exists to make impossible for a secret. See this file's header.
      // A `ToolInputError` with the wording unchanged: a bare `Error` is redacted to a 500 that
      // no allowlist rule can rescue. No code prefix — the per-tool suites pin this exact string.
      // The run ended during the pre-dialog reads: the engine opens no dialog for an aborted run.
      // `askThenReport`, not `askOnce` — the engine waits for save and replaces the same card URI.
      const locale = await operations.locale.resolve({ principalId: ctx.principal.id });
      const pluginCard = await operations.pluginCards.find({ workspaceId: routeDeps.workspaceId, saveKind: 'api', target: label });
      let errorSummary = "";
      const card = cards.defineSecretCardTool<{ label: string }, CustomCredentialSummary, SetTokenResult>({
        toolId: operations.ids.save,
        prepare: async () => ({ label }),
        form: ({ prep }) => operations.credentialCardForms.applyPlugin({ card: pluginCard, form: withCardApp({ spec: operations.credentialCardForms.rotate(prep), app: host.cardIdentity.appNames.setToken }) }),
        save: ({ values, signal }) => saveSetToken({ token: values.token as string, signal, routeDeps, operations, probe, existing, pluginCard, principalId: ctx.principal.id }),
        result: ({ run }) => {
          // Token hints belong on the human's card, never in the model-facing result or audit output.
          if (run.status === "saved") return { saved: true };
          if (run.status === "blank") return { saved: false, reason: "invalid", message: operations.locale.text({ id: "blank", locale }) };
          if (run.status === "failed") return { saved: false, reason: "error", message: run.safeMessage };
          return { saved: false, reason: run.status };
        },
        outcome: ({ run }) => {
          if (run.status === "saved") {
            const hint = operations.locale.hint({ hint: run.saved.tokenHint, locale });
            return withCardApp({ spec: operations.credentialCardForms.rotateOutcome({ label, state: "success", message: `${hint ? hint + ". " : ""}${operations.locale.text({ id: "saved", locale })}` }), app: host.cardIdentity.appNames.setTokenOutcome });
          }
          if (run.status === "blank" || run.status === "failed") return withCardApp({ spec: operations.credentialCardForms.rotateOutcome({ label, state: "failure",
            message: run.status === "blank" ? operations.locale.text({ id: "blank", locale }) : run.safeMessage }), app: host.cardIdentity.appNames.setTokenOutcome });
          return undefined;
        },
      }, {
        uriHost: host.cardIdentity.uriNamespace,
        text: { noEmitter: operations.messages.noRotateChannel },
        safeError: err => {
          // Never `err.message`: it can quote the token just submitted. See FORM_SAVE_CALLER_SAFE_ERRORS.
          errorSummary = operations.diagnostics.describeError({ error: err });
          return operations.locale.translate({ message: callerSafeErrorMessage({ err, rules: operations.formErrors, fallback: operations.messages.formSaveFailure }), locale });
        },
        logFailure: ({ toolId, exchangeId }) => operations.diagnostics.rotateFailure({ toolId, exchangeId, credentialId: existing.id, errorSummary }),
      });
      return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport: cards.askThenReport })(ctx, options);
    },

    // Creates a brand-new credential row — see this file's header, "custom_credential_create", for the
    // full mechanism and the incident it closes. Unlike every other write handler in this domain, there
    // is no existing row to resolve or fail closed on before opening the form: a CREATE's row does not
    // exist yet, so the only pre-form checks are the permission gate and the `emitSurface` fail-closed
    // guard below. All three prefill fields are optional and non-secret by schema
    // (`credential-save-tool.ts`'s API creation schema) — a call with none of them is a normal, valid call.
    create: async (ctx, { emitSurface } = {}): Promise<CreateCredentialResult> => {
      // `requireInputRecord` refuses `undefined` outright, but this tool's schema has no required
      // field at all (same `required: []` shape `custom_credential_list`'s own `NO_INPUT_SCHEMA`
      // documents) — a model-issued call with no arguments at all is a normal, valid call here, not a
      // malformed one, so it is treated the same as an explicit `{}` rather than rejected.
      const input = ctx.input === undefined ? {} : requireInputRecord({ input: ctx.input });
      const prefill = readCreateCredentialPrefill({ input, operations });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });

      const providers = await operations.publish.loadProviders({});
      const locale = await operations.locale.resolve({ principalId: ctx.principal.id });
      return openCreateCard({ ctx, emitSurface, routeDeps, operations, probe, cards, surfaces, locale, initialLabel: prefill.label ?? '', cardIdentity: host.cardIdentity,
        form: () => withCardApp({ spec: operations.credentialCardForms.create({ prefill, providers }), app: host.cardIdentity.appNames.create }),
        submissionOf: values => deriveCreateCredentialSubmission({ raw: readRawCreateCredentialFields(values), operations }) });
    },

    // A plugin's own key card (credential_save kind plugin-provider): plugin copy, a masked token
    // and declared public fields, with fixed row metadata resolved on the server. Same
    // permission, save port and outcome as the generic create card. See plugin-credential-card.ts.
    pluginProvider: async (ctx, { emitSurface } = {}): Promise<CreateCredentialResult> => {
      const input = requireInputRecord({ input: ctx.input });
      const providerId = requireString({ input, key: "provider" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });
      const card = (await operations.pluginCards.load({ workspaceId: routeDeps.workspaceId })).find(entry => entry.providerId === providerId);
      if (!card) throw new ToolInputError({ message: operations.messages.missingPluginCard({ providerId }) });
      const locale = await operations.locale.resolve({ principalId: ctx.principal.id });
      return openCreateCard({ ctx, emitSurface, routeDeps, operations, probe, cards, surfaces, locale, initialLabel: card.label, cardIdentity: host.cardIdentity,
        form: () => operations.credentialCardForms.buildPlugin({ card }),
        submissionOf: values => {
          const fields = operations.pluginCards.readValues({ card, values });
          return { ...deriveCreateCredentialSubmission({ raw: readRawCreateCredentialFields({ ...fields, worksFor: [] }), operations }), pluginCard: card,
            ...(fields.additionalHosts === undefined ? {} : { additionalHosts: fields.additionalHosts }) };
        } });
    },
  };
  return withModelFacingErrors({ handlers, rules: operations.modelFacingErrors }) as { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler };
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
 * Credential tool handlers over required host operations and core-only consumer contracts.
 * @agent-note Supply ids/risk/rules matching the supplied catalog/metadata and bind every operation
 * over the existing host objects. Metadata reads never decrypt. Target validation precedes any
 * dialog/decrypt; DELETE waits for an authenticated human and rechecks permission before sending.
 * File writes build/validate/resolve/plan once, then commit on the SAME provider with the EXACT
 * plan unless aborted. Unknown errors remain private; egress is caller-safe before decoration.
 * @complexity O(t) wiring, plus the bounded costs of each named host operation.
 */
export function createCredentialToolRegistrations({ routeDeps, host, ports, operations }: { routeDeps: CredentialToolActorDeps; host: CustomCredentialToolHost; ports: CustomCredentialToolPorts; operations: CredentialToolOperations }, _optional = {}): ToolRegistration[] {
  const { credentialedRequest, sourceControlWrite } = ports;
  const handlers: Record<string, ToolHandler> = {
    // Non-decrypting read-back through the existing store, scoped by the read permission and
    // empty-input contract. Saved origins and usernames reach the model; token hints remain
    // on human surfaces. One workspace read plus O(n + c) projection for saved rows and active cards.
    [operations.ids.list]: async (ctx): Promise<{ credentials: (Omit<CustomCredentialSummary, "tokenHint"> & { pluginId?: string; usedFor?: readonly string[] })[] }> => {
      requireNoInput({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.read }, { entityType: host.vocabulary.entityType });
      const credentials = await operations.sets.list({});
      const cards = await operations.pluginCards.load({ workspaceId: routeDeps.workspaceId });
      const apiCards = new Map(cards.filter(card => card.saveKind === undefined || card.saveKind === 'api').map(card => [card.ownedApiLabel ?? card.label, card]));
      // Exact owned labels attach display copy only; usedFor never participates in key selection.
      return { credentials: credentials.map(({ tokenHint: _humanHint, ...credential }) => {
        const card = apiCards.get(credential.label);
        return card ? { ...credential, pluginId: card.pluginId, usedFor: card.usedFor ?? [] } : credential;
      }) };
    },

    [operations.ids.verify]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const label = requireString({ input, key: "label" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.read }, { entityType: host.vocabulary.entityType });
      return operations.recovery.withSetup({ label, verification: true, invoke: () => credentialedRequest.verify({ workspaceId: routeDeps.workspaceId, label }) }, {});
    },

    // The self-healing FIX half of the 401/403 diagnostic `custom_credential_verify`/
    // `custom_credential_make_request` now carry (`credentialed-request.ts`'s `AuthFailureDiagnostic`)
    // — see this file's header, "custom_credential_set_username", for the full incident and design.
    // Shape/security validation (`rejectUnexpectedSetUsernameFields`, `requireUsernameOrClearSentinel`)
    // runs BEFORE the permission check, same ordering `custom_credential_make_request` below uses — a
    // malformed call is refused on its own terms regardless of who is asking. WRITE-gated (this durably
    // changes a Tovu-side column), and — by the owner's own standing "no confirm ceremonies" instruction
    // — deliberately NOT wrapped in the DELETE-style confirmation dialog: this field is not a secret,
    // and there is structurally no way for this call to carry one.
    [operations.ids.setUsername]: async (ctx): Promise<CustomCredentialSummary> => {
      const input = requireInputRecord({ input: ctx.input });
      rejectUnexpectedSetUsernameFields({ input, messages: operations.messages });
      const label = requireString({ input, key: "label" });
      const username = requireUsernameOrClearSentinel({ input, messages: operations.messages });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });

      // Non-decrypting label->id resolution — same lookup `resolveRequestTarget` above uses for the
      // identical reason: a bad label should never cost a decrypt, and this update never needs one
      // either (see `CustomCredentialsToolDeps.siteAssistantSecretKeyring`'s own doc).
      const existing = await operations.sets.byLabel({ label });
      if (!existing) {
        throw new CustomCredentialNotFoundError(operations.messages.notFoundLabel({ label }));
      }

      return operations.sets.setUsername({ id: existing.id, username });
    },

    // GET/POST/PUT/PATCH run immediately (no ceremony — parity with the site). DELETE opens an
    // in-chat confirmation and parks until answered; see this file's own header for the full
    // mechanism and why. All shape/security-boundary validation (`method`/`url`/`headers`/`body`,
    // label existence, host allowlist) happens inside `resolveRequestTarget`/`makeCredentialedRequest`
    // themselves — this handler's only job is deciding WHETHER to gate, never re-validating.
    [operations.ids.makeRequest]: async (ctx, { emitSurface } = {}): Promise<CredentialedRequestOutcome | CredentialToolSetupFailure> => {
      ctx = { ...ctx, input: structuredClone(ctx.input), principal: { ...ctx.principal }, run: { ...ctx.run } };
      const input = requireInputRecord({ input: ctx.input });
      const label = requireString({ input, key: "label" });
      const method = requireString({ input, key: "method" });
      const url = requireString({ input, key: "url" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });

      if (method !== "DELETE") {
        return operations.recovery.withSetup({ label, url, invoke: () => makeModelFacingCredentialedRequest({ port: credentialedRequest, input: { workspaceId: routeDeps.workspaceId, label, method, url, headers: input.headers, body: input.body }, catalog: host.vocabulary.catalog, toolId: operations.ids.makeRequest }) }, {});
      }

      // Non-decrypting: a declined/expired/off-allowlist DELETE must never have cost a decrypt.
      // Not wrapped in `withSchemaOnRejection`: its `CredentialedRequestValidationError` and
      // `CustomCredentialNotFoundError` reach the model through the map-level
      // `CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS` wrap instead — the daemon-boundary
      // redaction this comment once deferred was confirmed to reach here too.
      const target = await operations.recovery.withSetup({ label, url, invoke: () => credentialedRequest.resolveTarget({ workspaceId: routeDeps.workspaceId, label, url }) }, {});
      if ("credentialSetup" in target) return target;

      // Fail closed rather than degrade — same posture `content_post_delete`'s own handler documents:
      // an execution context that cannot hold this call open cannot run a gated DELETE at all.
      if (!emitSurface) {
        // A `ToolInputError` with the wording unchanged: a bare `Error` is redacted to a 500 that
        // no allowlist rule can rescue. No code prefix — the per-tool suites pin this exact string.
        throw new ToolInputError({ message: operations.messages.noDeleteChannel });
      }

      // A run aborted during reconnaissance must not proceed to the external commit.
      if (ctx.signal.aborted) return { executed: false, cancelled: false, reason: "abandoned" };
      return operations.approval.handler({
        prepare: async () => ({ label: target.label, host: target.url.host, path: `${target.url.pathname}${target.url.search}` }),
        describe: ({ prepared }) => ({ ask: true, description: operations.approval.describeDelete(prepared) }),
        askHuman: (required, optional) => operations.approval.askHuman(required, optional),
        run: async ({ ctx: approvedCtx }) => {
          await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: approvedCtx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });
          if (approvedCtx.signal.aborted) return { executed: false, cancelled: false, reason: "abandoned" };
          const frozen = requireInputRecord({ input: approvedCtx.input });
          return operations.recovery.withSetup({ label, url, invoke: () => makeModelFacingCredentialedRequest({ port: credentialedRequest, input: { workspaceId: routeDeps.workspaceId, label, method: "DELETE", url, headers: frozen.headers, body: frozen.body }, catalog: host.vocabulary.catalog, toolId: operations.ids.makeRequest }) }, {});
        },
        notConfirmed: ({ reason }) => reason === "declined" ? { executed: false, cancelled: true } : { executed: false, cancelled: false, reason },
      })(ctx, { emitSurface }) as Promise<CredentialedRequestOutcome | CredentialToolSetupFailure>;
    },

    // See this file's header for file-write validation, provider-plan and freshness boundaries.
    [operations.ids.writeFiles]: async (ctx): Promise<WriteFilesResult> => {
      const input = requireInputRecord({ input: ctx.input });
      const label = requireString({ input, key: "label" });
      const shapeRejection = { toolId: operations.ids.writeFiles, catalog: host.vocabulary.catalog, isShapeRejection: ({ error }: { error: unknown }) => isWriteFilesShapeRejection(error) };
      const request = await withSchemaOnRejection({ ...shapeRejection, fn: async () =>
        operations.policy.validateWriteFiles({ branch: input.branch, commitMessage: input.commitMessage, files: input.files })
      });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: host.vocabulary.permissions.write }, { entityType: host.vocabulary.entityType });

      // The host first, from the credential's plaintext base URL (no decrypt): its owner/repo rules
      // decide whether this call is well formed at all.
      const summary = await operations.sets.byLabel({ label });
      if (!summary) {
        throw new CustomCredentialNotFoundError(operations.messages.notFoundLabel({ label }));
      }
      const built = await sourceControlWrite.build({ workspaceId: routeDeps.workspaceId, baseUrl: summary.baseUrl });
      if (!built.ok) throw new Error(operations.messages.writeFailure({ message: built.message }));
      const provider = built.provider;
      const target = await withSchemaOnRejection({ ...shapeRejection, fn: async () => sourceControlWrite.validateTarget({ provider, target: { owner: input.owner, repo: input.repo } }) });
      const validated: ValidatedWriteFilesInput = { ...request, ...target };

      // A DECRYPTING resolve: the plan phase's read-only host calls need the token regardless of
      // whether the human goes on to confirm. The row was just seen above; one deleted in between
      // is the same not-found refusal.
      const resolved = await operations.sets.resolve({ label });
      if (!resolved) {
        throw new CustomCredentialNotFoundError(operations.messages.notFoundLabel({ label }));
      }

      const planResult = await sourceControlWrite.planFileWrite({ provider, input: { ...writeTarget(resolved, validated), branch: validated.branch, files: validated.files } });
      if (!planResult.ok) {
        operations.diagnostics.writeFailure({ phase: "plan", failure: planResult });
        throw new Error(operations.messages.writeFailure({ message: planResult.message }));
      }

      // A run aborted during reconnaissance must not proceed to the external commit.
      if (ctx.signal.aborted) return { executed: false, cancelled: false, reason: "abandoned" };
      return performRepositoryFilesWrite({ operations, port: sourceControlWrite, provider, resolved, validated, plan: planResult.plan });
    },
  };

  return buildDomainRegistrations({ metadata: host.vocabulary.metadata,
    domain: host.vocabulary.domain,
    catalogModule: host.vocabulary.catalogModule,
    catalog: host.vocabulary.catalog,
    handlers: withModelFacingErrors({ handlers, rules: operations.modelFacingErrors }),
    derivedRisk: operations.derivedRisk,
  });
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
