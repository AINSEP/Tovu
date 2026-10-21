import { WORKSPACE_ID, api, authenticatedAdminRequest, type AdminSourceControlCredentialSummary } from "@/lib/api";

/**
 * @file The Git backup card's port onto `admin-http/routes/system/site-backups.ts` (plan, push) and
 * the Source Control connections list it reuses. Same `useX(dependencies)` split as
 * `sites/hooks/site-transfer-dependencies.hooks.ts`, so the hook is tested against a fake.
 */

/** What the plan route takes. Optional fields left out let the server pick (default branch, the
 *  site's folder name). */
export interface GitBackupPlanInput {
  credential: string;
  owner: string;
  repo: string;
  branch?: string;
}

/** A refusal from either route: the service's own code and message (`backup-service.ts`). */
export interface GitBackupRefusal {
  planned?: false;
  pushed?: false;
  code?: string;
  message?: string;
  reason?: "expired" | "abandoned";
  cancelled?: boolean;
}

/** The plan route's success: the facts shown before pushing. */
export interface GitBackupPlan {
  planned: true;
  planId: string;
  repository: string;
  branch: string;
  folder: string;
  folderExists: boolean;
  fileCount: number;
  totalSize: string;
  skipped: readonly unknown[];
}

export interface GitBackupProgress {
  filesDone: number;
  filesTotal: number;
}

export type GitBackupPushResult =
  | { pushed: true; commitUrl: string; repository: string }
  | { pushed: false; inProgress: true; planId: string; progress: GitBackupProgress }
  | GitBackupRefusal;

export interface GitBackupPort {
  /** Every saved Source Control connection (`GET …/system/source-control/credentials`). */
  listConnections(): Promise<AdminSourceControlCredentialSummary[]>;
  plan(input: GitBackupPlanInput): Promise<GitBackupPlan | GitBackupRefusal>;
  /** Waits ~1.5 s server-side, then answers the outcome or the job's progress. */
  push(input: { planId: string }): Promise<GitBackupPushResult>;
}

const BACKUPS = `/workspaces/${WORKSPACE_ID}/site-backups`;

export const defaultGitBackupPort: GitBackupPort = {
  listConnections: () => api.listSourceControlCredentials().then((snapshot) => snapshot.credentials),
  plan: (input) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/plan`, body: input }),
  push: (input) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/push`, body: input }),
};

/** An in-memory {@link GitBackupPort} for tests. Unlisted calls reject, so a test that reaches one
 *  it did not describe fails loudly. */
export function createFakeGitBackupPort(overrides: Partial<GitBackupPort> = {}): GitBackupPort {
  const unexpected = (name: string) => () => Promise.reject(new Error(`${name} was not expected`));
  return {
    listConnections: () => Promise.resolve([]),
    plan: unexpected("plan"),
    push: unexpected("push"),
    ...overrides,
  };
}
