import type { createNodeDirectoryWorkspace } from '@jini-ai/platform/fs';

type Workspace = ReturnType<typeof createNodeDirectoryWorkspace>;
interface SelectedDevSite {
  dir: string;
  dbPath: string;
  warning: ReturnType<Workspace['config']>['warning'];
  running: ReturnType<ReturnType<Workspace['running']>['peek']>;
}
interface DevSiteOptions { env?: NodeJS.ProcessEnv; homeDir?: string }

/** Resolve an initialized development site through the shared workspace owner. */
export function devSitesHome(required: { repoRoot: string }, optional?: DevSiteOptions): SelectedDevSite;

/** Prepare the disposable default, or resolve the explicitly selected site. */
export function prepareDevSitesHome(required: { repoRoot: string }, optional?: DevSiteOptions & {
  scratchRoot?: string;
  log?: (message: string) => void;
  initialize?: (required: { repoRoot: string; dir: string; env: NodeJS.ProcessEnv }) => Promise<void>;
}): Promise<SelectedDevSite & { env: NodeJS.ProcessEnv }>;
