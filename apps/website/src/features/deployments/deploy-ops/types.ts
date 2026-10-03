/** Generic read-only deployment observation contract; vendor code belongs to trusted plugins. */
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
export interface DeployOpsInput { platform: string; target: string; credentialLabel?: string; runId?: string; branch?: string; limit?: number; org?: string }
export interface DeployOpsContext {
  /** Bound to one saved credential and this platform's allowed hosts. Never follows redirects. */
  get(url: string): Promise<{ status: number; json?: unknown; text: string; truncated?: boolean }>;
  nowIso(): string;
  /** A model-visible refusal, without importing host code into a plugin module. */
  fail(message: string): never;
}
export interface DeployOpsModule {
  status(ctx: DeployOpsContext, input: Pick<DeployOpsInput, "target" | "runId" | "branch">): Promise<DeployOpsStatus>;
  logs(ctx: DeployOpsContext, input: Pick<DeployOpsInput, "target" | "runId" | "branch"> & { limit: number }): Promise<DeployOpsLogs>;
  listTargets?(ctx: DeployOpsContext, input: { org?: string }): Promise<DeployOpsTargets>;
}
export interface DeployOpsDescriptor { id: string; label: string; module: string; hosts: readonly string[] }
export interface LoadedDeployOps { descriptor: DeployOpsDescriptor; pluginId: string; module: DeployOpsModule }
export interface DeployOpsRegistry {
  get(id: string): LoadedDeployOps | undefined;
  list(): readonly LoadedDeployOps[];
  readonly refusals: readonly string[];
}
export interface DeployOpsWaitResult { reached: boolean; waitedSeconds: number; polls: number; last: DeployOpsStatus }
