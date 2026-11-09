import type { AgentToolDefinition, DerivedRiskByToolId, HumanConfirmer, LegacyToolAuthorizeFn, ToolExecutionContext, ToolExecutionOptions, ToolHandler, ToolMetadataById, AccessApprovalResource } from '@jini-ai/core';
import type { Clock } from '@jini-ai/core/primitives';
import type { ModelFacingErrorRule } from '@jini-ai/core/model-facing-tool-errors';
import type { PluginActivationRecord, PluginActivationRepoPort, PluginConflict, RemovePluginFn, PluginUninstallPreview } from '@jini-ai/plugins/host';
import type { PluginDiscoveryRecord, PluginInstallInput, PluginInstallerPort, PluginInstallPreview, PluginSourcePort } from '@jini-ai/plugins/host/node';

/** @agent-note Stable wire family tags, never inferred from an id; independently scoped hosts may share ids. */
export type PluginFamily = 'site-runtime' | 'agent-plugin';
/** @agent-note Detach input/principal/run before approval. Disabled proposals bind no enable identity. */
export interface SetEnabledRequest {
  /** @agent-note Preserve the caller's explicit family. */
  readonly family: PluginFamily;
  /** @agent-note Workspace-scoped public id, never an internal path. */
  readonly pluginId: string;
  /** @agent-note Every enable requires fresh human consent, even for previously approved bytes. */
  readonly enabled: boolean;
}
/** @agent-note Supply the existing catalog/metadata directly; ids, permissions and descriptors must agree. */
export interface PluginToolRegistrationInput {
  /** @agent-note Host domain is attribution, not authorization. */
  readonly domain: string;
  /** @agent-note Host diagnostic path, never guessed by this package. */
  readonly catalogModule: string;
  /** @agent-note Supply exact schema and prose bytes, including example URLs. */
  readonly catalog: readonly AgentToolDefinition[];
  /** @agent-note Keep the host's action policy and catalog bytes unchanged. */
  readonly metadata: ToolMetadataById;
}
/** @agent-note Only consumed public installed metadata; paths, files, handles and transports must not be supplied or serialized. */
export interface InstalledPluginRevision {
  /** @agent-note Public id is scoped by the injected lifecycle owner. */
  readonly pluginId: string;
  /** @agent-note Every installed version/digest participates in the approval revision. */
  readonly version?: string | undefined;
  /** @agent-note Preserve saved digest bytes exactly; no rehash or migration. */
  readonly archiveDigest: string;
  /** @agent-note Names only, never skill paths or bytes. */
  readonly skills: readonly { readonly name: string }[];
  /** @agent-note Public display projection only; inactive descriptions must be redacted by the same owner. */
  readonly displayName?: string | undefined;
  /** @agent-note Public metadata; no secrets or internal paths. */
  readonly description?: string | undefined;
  /** @agent-note Compatibility checks use the same host contract, without guessing from a product version. */
  readonly hostRange?: string | undefined;
  /** @agent-note Advisory capabilities remain the lifecycle owner's vocabulary. */
  readonly requires?: readonly string[] | undefined;
}
/** @agent-note Canonical instanceof classification in the host; unknown errors return undefined and rethrow unchanged. Private messages are log-only for unreadable/busy. */
export type ClassifiedPluginError = { kind: 'not-installed'; message: string } | { kind: 'host-incompatible' | 'update'; code: string } | { kind: 'unreadable' | 'busy'; message: string };
/** @agent-note Authorize before disclosure, reauthorize after the same authenticated explicit human answers. Abort/deny/timeout never mutates; missing transport fails closed. */
export interface PluginApprovalPort<Description> {
  /** @agent-note Forward the SAME actor/tool/exchange transport. Freeze prepared identity and detach request ownership; descriptions grant no authority. */
  handler<Prepared>(steps: {
    prepare(required: { ctx: ToolExecutionContext }, options: ToolExecutionOptions): Promise<Prepared>;
    describe(required: { ctx: ToolExecutionContext; prepared: Prepared }): Description | Promise<Description>;
    run(required: { ctx: ToolExecutionContext; prepared: Prepared; confirmer: HumanConfirmer; choice?: string }, options: ToolExecutionOptions): Promise<unknown>;
  }, options?: { flag?: string; ask?: (required: { prepared: Prepared }) => boolean; declined?: (required: { reason: 'declined' | 'expired' | 'abandoned'; prepared?: Prepared }) => unknown }): ToolHandler;
  /** @agent-note Preserve the host's exact no-answer result bytes; never automatically reopen approval. */
  notConfirmed(outcome: { confirmed: false; reason: 'declined' | 'expired' | 'abandoned' }): { cancelled: boolean; reason?: 'expired' | 'abandoned'; note: string };
}
/** @agent-note Bind operations lazily per call to the same workspace layout, activation owner and admission queue. Missing lifecycle refuses at call time, never during construction. */
export interface PluginLifecycleToolsPort {
  /** @agent-note List reads degrade softly without a capability; approval reads require it. Preserve absent optional-method behavior in both cases. */
  inactivePluginIds?(required: { strict: boolean }, optional?: Record<string, never>): Promise<ReadonlySet<string> | undefined>;
  /** @agent-note Preview only safe public resources; preserve source/access identity bytes and no extra reads. */
  previewEnableAccess?(required: { pluginId: string }, optional?: Record<string, never>): Promise<{ readonly key: string; readonly resources?: readonly Omit<AccessApprovalResource, 'scope'>[] } | undefined>;
  /** @agent-note Persist a genuine decline through the same connection owner only after its authenticated answer. */
  recordDeclinedAccess?(required: { accessKey: string }): Promise<void>;
  /** @agent-note Same scoped owner and snapshot; disabled metadata stays private, no paths/handles escape. */
  listInstalled(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly InstalledPluginRevision[]>;
  /** @agent-note First enable preflight, before linked-face and compatibility checks or a dialog. */
  assertWritable(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
  /** @agent-note Sole lifecycle writer, with authenticated principal and unchanged saved decision bytes. */
  setEnabled(required: { workspaceId: string; pluginId: string; enabled: boolean; actor: string }): Promise<{ pluginId: string; enabled: boolean; warnings?: readonly string[] }>;
  /** @agent-note Only after successful enable; forward approvedEnable and approvedEnableKey exactly and preserve existing failure semantics. */
  provisionMcp(required: { pluginId: string; principalId: string }, optional: { approvedEnable: boolean; approvedEnableKey?: string | undefined }): Promise<void>;
  /** @agent-note Delegate the ENTIRE permission/preview/consent/permanent workspace-removal order to the lifecycle owner; host closes over the same transport. */
  uninstall(required: { ctx: ToolExecutionContext; pluginId: string; executionOptions: ToolExecutionOptions }, optional?: Record<string, never>): Promise<unknown>;
  /** @agent-note Apply the same projection for both plugin families; inactive entries expose only off status and public identity. */
  searchCandidate(required: { candidate: { pluginId: string; displayName?: string | undefined; description?: string | undefined; enabled: boolean; keywords: readonly string[]; skills: readonly never[]; mcpServerIds: readonly string[] } }): { pluginId: string; enabled: boolean; description?: string | undefined };
  /** @agent-note Check EVERY revision in this supplied snapshot with the same contract and activeProvides policy; never relist by id. Return only canonical safe code. */
  compatibility(required: { pluginId: string; revisions: readonly InstalledPluginRevision[] }): { code: string } | undefined;
  /** @agent-note Canonical classes only, no duck typing; unknown failures retain identity. */
  classifyError(required: { error: unknown }): ClassifiedPluginError | undefined;
}
/** @agent-note Caller-safe public export rows only; props are host-opaque validated schema data, never executable handles or custody-bearing fields. */
export interface PluginExportRow {
  readonly plugin: string; readonly displayName?: string | undefined; readonly component: string; readonly version: number;
  readonly minVersion: number; readonly props: unknown; readonly consent: string; readonly availability: string; readonly snippet: string | null;
}
/** @agent-note Same canonical provider relationship owner; private lookup faults degrade only where the existing flow permits. */
export interface PluginProviderFaceToolsPort {
  /** @agent-note Linked face is refused before compatibility or consent; a failed lookup remains for the write owner to recheck. */
  linkedProvider(required: { pluginId: string }): Promise<string | undefined>;
  /** @agent-note Safe public refusal, from the same relationship owner. */
  describeLinkedFace(required: { pluginId: string; providerPluginId: string }): { code: string; message: string; providerPluginId: string };
  /** @agent-note Use canonical owner identity, never error name/code matching. */
  describeLinkedError(required: { error: unknown }): { code: string; message: string; providerPluginId: string } | undefined;
}
/** @agent-note Host copy names its own tools, permissions, product and paths; preserve existing result bytes, never fabricate operational guidance. */
export interface PluginManagementMessages {
  readonly familyRequired: string;
  restartNote(required: SetEnabledRequest): string;
  changedSinceConfirmation(required: { pluginId: string; name: string; version: string }): string;
  updatePendingNextStep(required: { code: string }): string;
  hostIncompatibleNote(required: { pluginId: string }): string;
  activationsUnreadableNote(required: { pluginId: string; enabled: boolean }): string;
  activationsBusyNote(required: { pluginId: string; enabled: boolean }): string;
}
/** @agent-note The same command gateway as the host route owns authorization/audit/outbox; no direct writer may replace it. Inverse and rollback restore the exact prior row or delete a new row, then restore hooks. */
export interface PluginToolCommand {
  readonly command: { workspaceId: string; actor: { id: string; kind: 'agent' }; summary: string; permission: string };
  readonly mutation: { entityType: string; entityId: string; operation: 'update'; captureInverse(): Promise<{ enabled: boolean }>; execute(): Promise<{ activation: PluginActivationRecord }>; rollback(): Promise<void> };
}
/** @agent-note Local plugin-management seam. Same workspace-scoped repository/queue/all-family admission. Authorize before reads/dialog and after approval; fresh human consent for EVERY enable. Preflight writable→linked face→compatibility; reread complete version/digest/source/access identity after answer. Record site approval BEFORE enable (failed record leaves OFF); provision only after successful enable. OFF is durable before lowering linked faces; cleanup failure cannot claim success. Site uninstall previews before dialog, rediscovers name/version and uses shared Trash; agent uninstall stays with its lifecycle owner. No saved-byte changes, extra I/O, decrypts, telemetry, or optimizations. */
export interface PluginManagementToolsRequired<Description> {
  readonly registration: PluginToolRegistrationInput;
  readonly workspaceId: string;
  readonly authorize: LegacyToolAuthorizeFn;
  readonly permissions: { read: string; enable: string };
  readonly toolIds: { list: string; setEnabled: string; uninstall: string };
  readonly entityTypes: { plugin: string; agentPlugin: string; activation: string };
  readonly actorPluginId: string;
  readonly clock: Clock;
  readonly pluginActivationRepo: PluginActivationRepoPort;
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly listPluginConflicts?: (() => Promise<ReadonlyMap<string, readonly PluginConflict[]>>) | undefined;
  readonly removePlugin: RemovePluginFn;
  readonly pluginSource?: Pick<PluginSourcePort, 'readApproval' | 'recordApproval'> | undefined;
  readonly onPluginEnabled: (pluginId: string) => Promise<void>;
  readonly onPluginDisabled: (pluginId: string) => void;
  readonly agentPlugins: PluginLifecycleToolsPort;
  readonly pluginExports?: { catalog(required: { workspaceId: string }): Promise<ReadonlyMap<string, readonly PluginExportRow[]>> } | undefined;
  readonly providerFaces: PluginProviderFaceToolsPort;
  readonly lowerToolAccess: (required: { pluginId: string }) => Promise<void>;
  readonly extraModelFacingErrors: readonly ModelFacingErrorRule[];
  readonly executeCommand: (required: PluginToolCommand) => Promise<{ result: { activation: PluginActivationRecord } }>;
  readonly approvalFingerprint: (required: { family: PluginFamily; pluginId: string; revision: string; schema: Readonly<Record<string, unknown>> }) => string;
  readonly approvals: PluginApprovalPort<Description>;
  readonly descriptions: { enable(required: { subject: { family: PluginFamily; pluginId: string; version?: string | undefined; label?: string | undefined; adds?: readonly string[] | undefined; previousEnabled?: boolean | null | undefined; revision?: string | undefined; resources?: readonly Omit<AccessApprovalResource, 'scope'>[] | undefined }; scope?: AccessApprovalResource['scope'] }): Description; uninstall(required: { preview: PluginUninstallPreview }): Description };
  readonly messages: PluginManagementMessages;
  readonly telemetry?: { toggled(required: { principalId: string; pluginId: string; enabled: boolean }): void } | undefined;
}
/** @agent-note Authorize→parse→per-call policy→preview→install(expectedDigest). Host owns attachment owner/run/byte checks and opaque refs, never expose paths. Install stays OFF with exact trust warning, no new card, one telemetry event per existing outcome. */
export interface PluginInstallToolsRequired<Request> {
  readonly registration: PluginToolRegistrationInput;
  readonly workspaceId: string; readonly authorize: LegacyToolAuthorizeFn;
  readonly toolId: string; readonly permission: string; readonly entityType: string;
  readonly parseRequest: (required: { input: unknown }) => Request;
  readonly localInstallEnabled: () => boolean;
  readonly installInput: (required: { request: Request; ownerId: string; runId: string }) => Promise<PluginInstallInput>;
  readonly installer?: PluginInstallerPort | undefined;
  readonly riskSentence: (required: { preview: PluginInstallPreview }) => string;
  readonly messages: { readonly localInstallDisabledNote: string; installedNote(required: { name: string; version: string }): string; readonly retryInstallHint: string };
  readonly telemetry?: { installed(required: { principalId: string; pluginId: string }): void; installFailed(required: { principalId: string; reasonClass: 'refused' | 'internal' }): void } | undefined;
}
/** @agent-note Source owner alone writes/seals/rolls back packages; no saved-byte or history changes. Delete freezes target/prior digest, reauthorizes after SAME authenticated human answer, then deletes only with expectedDigest. No disclosure before authorization. */
export interface PluginSourceToolsRequired<Description> {
  readonly registration: PluginToolRegistrationInput;
  readonly workspaceId: string; readonly authorize: LegacyToolAuthorizeFn;
  readonly toolIds: { create: string; open: string; list: string; read: string; write: string; edit: string; delete: string; seal: string; rollback: string };
  readonly enablePermission: string; readonly entityType: string;
  readonly pluginSource?: PluginSourcePort | undefined;
  readonly approvals: PluginApprovalPort<Description>;
  readonly describeDelete: (required: { target: { id: string; path: string } }) => Description;
}
