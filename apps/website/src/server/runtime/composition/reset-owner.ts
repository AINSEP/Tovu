import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { sql } from 'kysely';
import { openSiteDbClient } from '#src/platform/db/client/open-site-db-client';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { resolveSiteStorage } from '#src/platform/site-dir/site-storage';
import { resolveWorkspace } from '#src/platform/site-dir/resolve-workspace';
import { resolveInstallDirTarget } from '#src/platform/site-dir/resolve-install-dir-target';
import { createSqliteIdentityRouteDeps, DEFAULT_OWNER_CREDENTIALS } from '#src/features/identity/wiring';
import { applyOwnerPasswordReset } from '#src/features/identity/owner-reset-env';
import { identityServiceDepsFrom } from '#src/server/inbound/admin-http/routes/users/deps';
import { createAppPermissionGrants } from './app-permission-grants.js';
import { resolvePostgresConnectionString } from './storage-secret.js';

/** Host-owned command composition: select one persisted owner without seeding or username guesses.
 * Opens already-migrated databases only. PGlite uses the existing private socket (TOVU_PG_SOCKET).
 * @throws On missing/ambiguous owner or storage access. Caller redacts driver errors.
 * @complexity O(1) scoped reads (owner query LIMIT 2), then O(s) existing session reset; no roster scan.
 */
export async function resetSelfHostedOwner(
  { dir, password, username }: { dir: string; password: string; username?: string },
  _options: Record<string, never> = {},
): Promise<string> {
  const targetDir = resolveInstallDirTarget(dir);
  if (!existsSync(targetDir)) throw new Error('The site directory does not exist');
  const storage = resolveSiteStorage(targetDir);
  const paths = resolveSiteDatabasePaths({ dir: targetDir }, { reserveIdentity: false });
  const client = await openSiteDbClient({ storage, dbPath: paths.contentDbPath, chatDbPath: paths.chatDbPath, resolvePostgresConnectionString });
  try {
    const kernel = client.content;
    const workspaceId = (await resolveWorkspace({ kernel })).id;
    const owners = await kernel.query<{ principal_id: string }>(sql`SELECT DISTINCT u.principal_id
      FROM identity_users u JOIN principal_roles pr ON pr.principal_id=u.principal_id AND pr.workspace_id=u.workspace_id
      JOIN roles r ON r.id=pr.role_id AND r.workspace_id=pr.workspace_id
      WHERE u.workspace_id=${workspaceId} AND r.name='owner' AND r.is_builtin=1 LIMIT 2`);
    if (owners.length !== 1) throw new Error('The site must have exactly one stored owner');
    const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() }, idGen = { newId: () => randomUUID() };
    const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen,
      permissionGrants: createAppPermissionGrants({}), ownerCredentials: DEFAULT_OWNER_CREDENTIALS,
      reconcileGrantsOnBoot: false, readOnlyOwnerPrincipalId: owners[0]!.principal_id });
    await identity.identityReady;
    if (!identity.recoveryCodes) throw new Error('Owner recovery storage is unavailable');
    return await applyOwnerPasswordReset({ workspaceId, password, ...(username === undefined ? {} : { username }),
      deps: { auth: identityServiceDepsFrom({ ...identity, clock, idGen }), codes: identity.recoveryCodes, seededOwnerPrincipalId: owners[0]!.principal_id } }, {});
  } finally { await client.close(); }
}
