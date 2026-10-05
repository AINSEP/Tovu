/** Generic deployment observation and deploy contract; vendor code belongs to trusted plugins. */
export type DeployOpsState = "healthy" | "deploying" | "failing" | "stopped" | "unknown";
export interface DeployOpsStatus {
  platform: string;
  target: string;
  state: DeployOpsState;
  summary: string;
  items: Array<{ id: string; name?: string; state: string; detail?: string }>;
  url?: string;
  checkedAt: string;
}
export interface DeployOpsLogs {
  platform: string;
  target: string;
  lines: Array<{ at?: string; source?: string; level?: string; message: string }>;
  truncated: boolean;
}
export interface DeployOpsTargets { platform: string; targets: Array<{ id: string; name: string; state?: string }> }
export interface DeployOpsInput { platform: string; target: string; credentialLabel?: string; runId?: string; branch?: string; limit?: number; org?: string; ref?: string }
export interface DeployOpsResponse { status: number; json?: unknown; text: string; truncated?: boolean }
/** A JSON write. The host serializes `body`; a module never sets headers or chooses the credential. */
export interface DeployOpsSendRequest { method: "POST" | "PATCH" | "PUT"; url: string; body?: unknown }
export interface DeployOpsDeployInput { target: string; ref?: string }
/** `started` means the platform accepted the request; landing is observed with status/wait afterwards. */
export interface DeployOpsDeployResult {
  platform: string;
  target: string;
  started: true;
  summary: string;
  runId?: string;
  sha?: string;
  machineIds?: string[];
  image?: string;
  url?: string;
}
export interface DeployOpsContext {
  /** Bound to one saved credential and this platform's allowed hosts. Never follows redirects. */
  get(url: string): Promise<DeployOpsResponse>;
  /** Same binding as `get`: one credential, the platform's hosts, HTTPS only, no redirects, capped and redacted. */
  send(request: DeployOpsSendRequest): Promise<DeployOpsResponse>;
  nowIso(): string;
  /** Abortable pause between follow-up reads (e.g. waiting for a dispatched run to appear); capped by the host. */
  sleep(ms: number): Promise<void>;
  /** A model-visible refusal, without importing host code into a plugin module. */
  fail(message: string): never;
}
export interface DeployOpsModule {
  status(ctx: DeployOpsContext, input: Pick<DeployOpsInput, "target" | "runId" | "branch">): Promise<DeployOpsStatus>;
  logs(ctx: DeployOpsContext, input: Pick<DeployOpsInput, "target" | "runId" | "branch"> & { limit: number }): Promise<DeployOpsLogs>;
  listTargets?(ctx: DeployOpsContext, input: { org?: string }): Promise<DeployOpsTargets>;
  /** Optional: a platform without it is observe-only and `runDeploy` refuses it. */
  deploy?(ctx: DeployOpsContext, input: DeployOpsDeployInput): Promise<DeployOpsDeployResult>;
}
export interface DeployOpsDescriptor { id: string; label: string; module: string; hosts: readonly string[] }
export interface LoadedDeployOps { descriptor: DeployOpsDescriptor; pluginId: string; module: DeployOpsModule }
export interface DeployOpsRegistry {
  get(id: string): LoadedDeployOps | undefined;
  list(): readonly LoadedDeployOps[];
  readonly refusals: readonly string[];
}
export interface DeployOpsWaitResult { reached: boolean; waitedSeconds: number; polls: number; last: DeployOpsStatus }
