/**
 * @file Host inputs the credential tools need: vocabulary, card identity and card helpers.
 *
 * Types only. These are the contracts a second host fulfils when it wires the custom-credential
 * and saved-key tools; Tovu binds its values beside each old entry. Nothing here has a
 * default: every permission, id, path, namespace, app and sentence is supplied by the host.
 * @agent-note Types only; this file must keep importing nothing but `@jini-ai/core` types.
 */
import type { AgentToolDefinition, DerivedRiskByToolId, SurfaceAskThenReport, ToolMetadataById } from '@jini-ai/core';
import type { SurfaceCardApp, SurfaceCardFormSpec } from '@jini-ai/core/contracts/cards';

/**
 * Who the cards belong to.
 * @agent-note `uriNamespace`: Your app's id; it appears in every card URI and is compared on answers.
 *   Keep it stable: answers to a card opened under one namespace are refused under another.
 * @agent-note `appNames`: the identity each card reports to the chat host. The values are stamped on
 *   the card unchanged, so a host that must keep saved card bytes readable supplies its old names.
 */
export interface CredentialCardIdentity {
  readonly uriNamespace: string;
  readonly appNames: {
    readonly create: SurfaceCardApp;
    readonly createOutcome: SurfaceCardApp;
    readonly setToken: SurfaceCardApp;
    readonly setTokenOutcome: SurfaceCardApp;
  };
}

/**
 * The registration vocabulary of the custom-credential tools.
 * @agent-note `permissions.read` gates verify/list; `permissions.write` gates requests, saves and
 *   edits. Both are checked before any credential is resolved or decrypted. `entityType` is passed to
 *   the permission check; `domain` names the registrations. They may be equal; neither is assumed.
 * @agent-note `catalog` is indexed by tool name and must hold every handler's tool, with the host's
 *   own descriptions and example URLs; `metadata` is the host's reviewed approval/search policy.
 */
export interface CustomCredentialToolVocabulary {
  readonly domain: string;
  readonly entityType: string;
  readonly permissions: { readonly read: string; readonly write: string };
  readonly catalogModule: string;
  readonly metadata: ToolMetadataById;
  readonly catalog: ReadonlyMap<string, AgentToolDefinition>;
}

/** Everything a host supplies to `createCustomCredentialsRegistrations`/`createApiCredentialSaveHandlers`. */
export interface CustomCredentialToolHost {
  readonly vocabulary: CustomCredentialToolVocabulary;
  readonly cardIdentity: CredentialCardIdentity;
}

/**
 * The project-key operations the saved-key card uses. Captured by the host for one site.
 * @agent-note `list` is read only inside the owner's human card; offer only what it returns.
 * @agent-note `permissionFor` names the permission that owns saving the chosen key; it is checked
 *   again after the human answers. `use` must re-resolve the key, refusing one revoked or deleted
 *   while the card was open. The site comes from host composition, never from submitted input.
 */
export interface CredentialCopyProjectKeysPort {
  readonly site?: { readonly name: string };
  list(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly { readonly keyId: string; readonly name: string }[]>;
  permissionFor(required: { keyId: string }, optional?: Record<string, never>): Promise<string>;
  use(required: { keyId: string; use: boolean }, optional?: Record<string, never>): Promise<unknown>;
  savedResult(required: { result: unknown }, optional?: Record<string, never>): Promise<unknown>;
}

/** The saved-key card's words. Host text: no generic fallback exists. */
export interface CredentialCopyMessages {
  readonly ownerOnly: string;
  readonly instanceRefused: string;
  readonly unexpectedField: string;
  readonly notOffered: string;
  readonly inputNotEmpty: string;
  readonly keysUnavailable: string;
  readonly needsInteractive: string;
  readonly cardTitle: string;
  readonly siteLabel: string;
  readonly siteFallback: string;
  readonly cardDescription: string;
  readonly fieldLabel: string;
  readonly fieldPlaceholder: string;
  readonly newKeyLabel: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
}

/**
 * Everything a host supplies to `createCredentialCopyRegistrations`.
 * @agent-note `ownerPermission` is checked for the owner before the inventory opens and again after
 *   the human answers; `newKeyValue` is the answer value meaning "enter a new key" and must not be a
 *   possible key id. `cardPath` is the URI segment after the namespace; the exchange id follows it.
 * @agent-note `protocol.askThenReport` and `protocol.buildFormSurface` usually come from
 *   `@jini-ai/daemon/surface-exchanges` and `@jini-ai/ui/mcp-ui/surfaces`; the exchange store passed
 *   with them must be the SAME store the answer route delivers to.
 */
export interface CredentialCopyToolHost<Resource = unknown> {
  readonly vocabulary: {
    readonly toolId: string;
    readonly domain: string;
    readonly catalogModule: string;
    readonly ownerPermission: string;
    readonly newKeyValue: string;
    readonly cardPath: string;
  };
  readonly cardIdentity: Pick<CredentialCardIdentity, 'uriNamespace'>;
  readonly catalog: readonly AgentToolDefinition[];
  readonly metadata: ToolMetadataById;
  readonly derivedRisk: DerivedRiskByToolId;
  readonly messages: CredentialCopyMessages;
  readonly protocol: {
    readonly askThenReport: SurfaceAskThenReport;
    readonly buildFormSurface: (spec: SurfaceCardFormSpec) => Resource;
  };
}
