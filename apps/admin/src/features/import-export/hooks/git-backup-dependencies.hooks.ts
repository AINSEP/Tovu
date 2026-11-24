import { sourceControlApi } from "@/features/source-control/api/source-control-api";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest, describeApiError } from "@/lib/admin-http/request";
import type { GitBackupPort } from "@jini-ai/admin/screens/import-export/hooks/git-backup-port.hooks";
import { useGitBackup, type GitBackupController, type GitBackupHost } from "@jini-ai/admin/screens/import-export/hooks/use-git-backup.hooks";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file The only place the package's Git backup hook reaches `admin-http/routes/system/site-backups.ts`
 * (plan, push) and the Source Control connections list — see the package's `git-backup-port.hooks.ts`
 * for why the split exists.
 */

const BACKUPS = `/workspaces/${WORKSPACE_ID}/site-backups`;

/** The live implementation, as a module-level singleton. */
export const defaultGitBackupPort: GitBackupPort = {
  listConnections: () => sourceControlApi.listSourceControlCredentials().then((snapshot) => snapshot.credentials),
  plan: (input, _options = {}) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/plan`, body: input }),
  push: (input, _options = {}) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/push`, body: input }),
};

/** This admin's collaborator for the package's Git backup hook: its API-error wording. Module-level,
 *  so the field keeps its identity. */
export const GIT_BACKUP_HOST: GitBackupHost = {
  describeError: (required) => describeApiError(required),
};

/** The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair: the live port and this
 *  admin's host. */
export function useWiredGitBackup({ t }: { t: Translate }): GitBackupController {
  return useGitBackup({ port: defaultGitBackupPort, t, host: GIT_BACKUP_HOST });
}
