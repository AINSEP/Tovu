import { CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS, FORM_SAVE_CALLER_SAFE_ERRORS, credentialOperationMessages } from './tool-registrations.copy.js';
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { createCredentialSaveHandlers, createCredentialToolRegistrations, loadCreateCredentialProviders } from "@jini-ai/integrations/credentialed-http/tools";
import { abortGuardedCredentialRepo } from "@jini-ai/integrations/vendor-credentials/abort-guarded-repo";

import type { PublishCompatibilityPort } from "@jini-ai/core/contracts/site/custom-credential-publish-compatibility";
import { normalizeCredentialWorksFor, suggestCredentialWorksFor } from "@jini-ai/platform/secrets/credential-sets";
import type { DeployTargetRegistry } from "@jini-ai/devops/deploy/site/deploy-targets/types";
import { toolMetadata } from '@jini-ai/core/tool-metadata/custom-credentials';
import { CREDENTIAL_SAVE_TOOL_ID, SECRET_FORM_CARD_DEFINITIONS } from "../../contracts/headless/index.js";
import { withCustomCredentialSetup } from "@jini-ai/integrations/custom-credentials/credential-recovery";
import { issueCredentialSetup } from "../../contracts/core/tool-failure-diagnostics.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint, translateCredentialMessage } from '@tovu/contracts/credential-copy';
import { resolveOperatorLocale } from '@jini-ai/core/operator-locale';
import type { OperatorLocaleDeps } from '@jini-ai/core/contracts/headless/plugin-host';
import type { Clock } from "@jini-ai/core/primitives";

import { createApprovalHandler, indexCatalogById, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";

import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { requireHumanConfirm } from "../../contracts/core/human-confirm.js";
// The egress refusal is recognised through the request port's `classifyError`; the host's
// `EgressRefusedError` class is injected into `bindCredentialedRequestPort` below.
import { EgressRefusedError, type HttpClientPort } from "../../platform/http/index.js";
import type { SourceControlWritePort } from "@jini-ai/core/contracts/credentials";
import type { ObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { KeyringPort } from "@jini-ai/core/contracts/vault";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";
import type { ToolContributor } from "@jini-ai/core";
import { customCredentialsAgentToolCatalog, WRITE_FILES_TOOL_ID } from "./agent-tools.js";
import {
  makeCredentialedRequest,
  probeCredentialConnection,
  resolveRequestTarget,
  verifyCustomCredential,
  type CredentialedRequestAuditPort,
  type CredentialedRequestDeps,
} from "./credentialed-request.js";

import { bindCredentialedRequestPort } from "@jini-ai/integrations/custom-credentials/credential-ports";
import { cleanCardToken } from "@jini-ai/integrations/custom-credentials/card-token";
import { applyPluginCredentialCard, buildPluginCredentialForm } from "../../contracts/core/plugin-credential-card.js";
import { readPluginCredentialValues } from "./plugin-credential-card.js";
import { loadPluginCredentialCardsSafely, findPluginCredentialCard, type LoadPluginCredentialCards } from "@jini-ai/agent-plugins/connect";
import { buildCreateForm, buildCreateOutcome } from "@jini-ai/integrations/custom-credentials/custom-credential-create-ui";
import { setTokenForm, setTokenOutcome } from "@jini-ai/integrations/custom-credentials/custom-credential-set-token-ui";
import { CUSTOM_CREDENTIAL_CATEGORIES } from "@jini-ai/core/contracts/site/core-custom-credential-categories";
import { describeDeleteRequestApproval } from "@jini-ai/integrations/custom-credentials/delete-request-confirmation-ui";
import type { LoadSourceControlProviders } from "../source-control/provider-registry.js";
import { createCustomCredential, describeCredential, describeCredentialByLabel, listCustomCredentials, resolveCustomCredentialByLabel, updateCustomCredential } from "./store.js";
import type { CustomCredentialSetRepoPort } from "./types.js";
import { validateWriteFilesInput } from "@jini-ai/integrations/custom-credentials/write-files-validation";
import type { CustomCredentialSecretCards, CustomCredentialToolHost, CustomCredentialToolPorts, CredentialToolOperations } from "@jini-ai/integrations/credentialed-http/tools";
import { tovuCredentialCardIdentity } from "./tovu-credential-card-identity.js";

const MAKE_CREDENTIALED_REQUEST_TOOL_ID = "custom_credential_make_request";

/**
 * @file Tovu bindings for the credential tools: permissions, reviewed catalog, error allowlists,
 * credential-store adapters and card identity; generic ordering and secret handling live in
 * @jini-ai/integrations/credentialed-http/tools.
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
  /** The write port `custom_credential_write_files` commits through, bound by the host over the same provider
   *  registry, guarded client and observability (`source-control/write-port.ts`). */
  readonly sourceControlWrite: SourceControlWritePort;
  readonly loadDeployTargets?: ({ workspaceId }: { workspaceId: string }, optional?: Record<string, never>) => Promise<DeployTargetRegistry>;
  /** Plugin-declared key cards (`plugin-credential-card.ts`); absent means none can be opened. */
  readonly loadPluginCredentialCards?: LoadPluginCredentialCards;
  /** Drops cached publish-target verification when a saved credential changes eligibility; bound by the host
   *  over `deployments` (`bindPublishCompatibility`), which reads the verification cache and the deploy-target loader. */
  readonly publishCompatibility: PublishCompatibilityPort;
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

/** Tovu's existing request adapter (`credentialed-request.ts`), which the request port forwards to. */
const TOVU_CREDENTIALED_REQUEST_OPERATIONS = { makeCredentialedRequest, resolveRequestTarget, verifyCustomCredential, probeCredentialConnection };

const CATALOG_BY_ID = indexCatalogById({ catalog: customCredentialsAgentToolCatalog });

/** This domain's name, doing double duty as both `buildDomainRegistrations`'s own `domain` field and
 *  `requireToolPermission`'s `entityType` — the same string
 *  `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own admin route uses for its
 *  own checks. Coincidence, not a shared concept forced together: this feature has exactly one
 *  domain and one entity type, so both names happen to be identical. */
const DOMAIN = "custom-credentials";
/** Gates `custom_credential_verify` — a read against the third party, never a Tovu-side write. */
const READ_PERMISSION = `${DOMAIN}.read`;
/** External writes use the write permission; the shared handler adds human approval for DELETE. */
const WRITE_PERMISSION = `${DOMAIN}.write`;

/** Tovu's host inputs for the old entries below: the vocabulary above and Tovu's card identity. */
const TOVU_CUSTOM_CREDENTIAL_HOST: CustomCredentialToolHost = {
  vocabulary: { domain: DOMAIN, entityType: DOMAIN, permissions: { read: READ_PERMISSION, write: WRITE_PERMISSION },
    catalogModule: "features/custom-credentials/agent-tools.ts", metadata: toolMetadata, catalog: CATALOG_BY_ID },
  cardIdentity: tovuCredentialCardIdentity,
};

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

/** Bind API creation and rotation to their existing authorization, errors and sealed store.
 * @param required - Workspace dependencies and shared surface exchanges.
 * @returns Two internal adapters; neither is registered under a retired tool id.
 * @example createApiCredentialSaveHandlers({ routeDeps, surfaces, host });
 * @complexity O(1) binding; each adapter performs the existing bounded store operations.
 * @agent-note `host.vocabulary.permissions.write` is checked before any card opens or row resolves;
 *   `host.cardIdentity` names every card URI and app. The outcome replaces the same URI after the save.
 */
export function createApiCredentialSaveHandlers({ routeDeps, surfaces, host }: { routeDeps: CustomCredentialsToolDeps; surfaces: AssistantSurfaceDeps; host: CustomCredentialToolHost }, _optional = {}): { create: ToolHandler; rotate: ToolHandler; pluginProvider: ToolHandler } {
  return createApiCredentialSaveToolHandlers({ routeDeps, surfaces, host, ports: { credentialedRequest: bindCredentialedRequestPort({ deps: credentialedRequestDeps(routeDeps), operations: TOVU_CREDENTIALED_REQUEST_OPERATIONS, EgressRefusedError }) }, cards: { defineSecretCardTool, askThenReport } });
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
 *  the ports existed (see `@jini-ai/integrations/custom-credentials/credential-ports`). */
function tovuCredentialToolPorts(routeDeps: CustomCredentialsToolDeps): CustomCredentialToolPorts {
  return {
    credentialedRequest: bindCredentialedRequestPort({ deps: credentialedRequestDeps(routeDeps), operations: TOVU_CREDENTIALED_REQUEST_OPERATIONS, EgressRefusedError }),
    sourceControlWrite: routeDeps.sourceControlWrite,
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
function bindCredentialSets(routeDeps: CustomCredentialsToolDeps, writeDeps: (input: { repo?: CustomCredentialSetRepoPort }) => { repo: CustomCredentialSetRepoPort; sealer: CustomCredentialsToolDeps["siteAssistantSecretSealer"]; keyring: CustomCredentialsToolDeps["siteAssistantSecretKeyring"]; clock: CustomCredentialsToolDeps["clock"]; idGen: CustomCredentialsToolDeps["idGen"] }): CredentialToolOperations['sets'] {
  return {
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
    };
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
    sets: bindCredentialSets(routeDeps, writeDeps),
    approval: {
      handler: steps => createApprovalHandler(steps),
      askHuman: ({ ctx, description }, options) => requireHumanConfirm({ ctx, surfaces, spec: description }, options),
      describeDelete: input => describeDeleteRequestApproval({ ...input, toolId: MAKE_CREDENTIALED_REQUEST_TOOL_ID,
        irreversibleDescription: "This calls the third-party API's own DELETE endpoint using this saved credential — Tovu has no way to undo whatever the provider does with it.",
      }),
    },
    pluginCards: {
      load: required => loadPluginCredentialCardsSafely({ ...required, loadCards: routeDeps.loadPluginCredentialCards }),
      find: required => findPluginCredentialCard({ ...required, loadCards: routeDeps.loadPluginCredentialCards }),
      readValues: readPluginCredentialValues,
    },
    credentialCardForms: {
      buildPlugin: buildPluginCredentialForm, applyPlugin: applyPluginCredentialCard,
      create: required => buildCreateForm({ ...required, app: tovuCredentialCardIdentity.appNames.create, categories: CUSTOM_CREDENTIAL_CATEGORIES, suggestWorksFor: suggestCredentialWorksFor, baseUrlHint: "The provider's API base URL, e.g. 'https://api.example.test'." }),
      createOutcome: required => buildCreateOutcome({ ...required, app: tovuCredentialCardIdentity.appNames.createOutcome }),
      rotate: required => setTokenForm({ ...required, app: tovuCredentialCardIdentity.appNames.setToken, secretField: SECRET_FORM_CARD_DEFINITIONS.credential_save?.secretField }),
      rotateOutcome: required => setTokenOutcome({ ...required, app: tovuCredentialCardIdentity.appNames.setTokenOutcome }),
    },
    recovery: { withSetup: (required, optional) => withCustomCredentialSetup({ ...required, issueCredentialSetup }, optional) },
    publish: {
      loadProviders: () => loadCreateCredentialProviders({ routeDeps }),
      prepareInvalidation: () => routeDeps.publishCompatibility.prepareInvalidation({ workspaceId: routeDeps.workspaceId }),
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
    messages: credentialOperationMessages(),
    diagnostics: {
      describeError: ({ error }) => describeErrorForLog({ err: error }),
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
