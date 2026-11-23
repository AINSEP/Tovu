import { useGitBackup, type GitBackupController } from "@jini-ai/admin/screens/import-export/hooks/use-git-backup.hooks";
import type { GitBackupPort } from "@jini-ai/admin/screens/import-export/hooks/git-backup-port.hooks";

import { sourceControlApi } from "@/features/source-control/api/source-control-api";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest, describeApiError } from "@/lib/admin-http/request";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file Host wiring for the Import & Export panel's Git backup card (the card, its state hook and
 * the port contract live in `@jini-ai/admin/screens/import-export`): the live port onto
 * `admin-http/routes/system/site-backups.ts` (plan, push) and the Source Control connections list it
 * reuses, bound with this app's admin-HTTP error describer. Same `useX(dependencies)` split as
 * `sites/hooks/site-transfer-dependencies.hooks.ts`, so the hook is tested against a fake.
 */

const BACKUPS = `/workspaces/${WORKSPACE_ID}/site-backups`;

export const defaultGitBackupPort: GitBackupPort = {
  listConnections: () => sourceControlApi.listSourceControlCredentials().then((snapshot) => snapshot.credentials),
  plan: (input, _options = {}) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/plan`, body: input }),
  push: (input, _options = {}) => authenticatedAdminRequest({ method: "POST", path: `${BACKUPS}/push`, body: input }),
};

/** The Git backup controller the panel's mount injects: the live port and `describeApiError`. */
export function useWiredGitBackup({ t }: { t: Translate }): GitBackupController {
  return useGitBackup({ port: defaultGitBackupPort, t, describeApiError });
}
