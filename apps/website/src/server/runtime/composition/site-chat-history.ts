/** Local registry adapter for owner-scoped history; never boots, migrates or writes another site. */
import fs from 'node:fs';
import { sql } from 'kysely';
import { ToolInputError } from '@jini-ai/core';
import type { ChatHistoryStore } from '@jini-ai/chat/core';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import type { ContentDatabase } from '#src/platform/db/content-database.generated';
import { openNativeSqlite, openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { createSitesWorkspace, type SitesWorkspace } from '#src/platform/site-dir/sites-home';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { resolveSiteStorage } from '#src/platform/site-dir/site-storage';
import { resolveWorkspace } from '#src/platform/site-dir/resolve-workspace';
import { registeredSources, isLocalTovuHost } from './registered-sites.js';

/** Structural host port while Tovu consumes the released Jini history-tool contract. */
export interface SiteChatHistory {
  listSiteNames(required: { principalId: string }, optional?: Record<string, never>): Promise<string[]>;
  openStore(required: { principalId: string; siteName: string }, optional?: Record<string, never>): Promise<{ store: ChatHistoryStore; close(): void | Promise<void> } | undefined>;
  isCurrentSite(required: { siteName: string }, optional?: Record<string, never>): boolean;
}

/** Bind safe registered names to read-only stores; the caller adapter owns authorization.
 * @example createSiteChatHistory({ currentSiteDir }, { workspace, localHost: true })
 * @throws ToolInputError for remote hosts, unsupported storage, missing databases or ambiguous owners.
 * @complexity O(n) registry probes for n sites; one workspace read and one bounded owner SELECT per open.
 */
export function createSiteChatHistory({ currentSiteDir }: { currentSiteDir: string }, {
  workspace, localHost = isLocalTovuHost({}, {}), openContent = openSqliteFileKernel, openChat = openNativeSqlite,
}: { workspace?: SitesWorkspace; localHost?: boolean; openContent?: typeof openSqliteFileKernel;
  openChat?: typeof openNativeSqlite } = {}): SiteChatHistory {
  // Lazy workspace resolution keeps registry/filesystem access behind the adapter's owner gate.
  /** Resolve the injected/default catalog lazily. @throws Workspace configuration errors. @complexity O(n) catalog setup. */
  const sitesWorkspace = () => (workspace ??= createSitesWorkspace({}));
  /** Reject deployment hosts before discovery. @throws ToolInputError on refusal. @complexity O(1). */
  const assertLocal = () => {
    if (!localHost) throw new ToolInputError({ message: "Reading another site's chats needs a local Tovu host." });
  };
  /** Reuse credential-copy's safe discovery. @throws ToolInputError or registry I/O errors. @complexity O(n) metadata probes. */
  const sources = () => {
    assertLocal();
    const workspace = sitesWorkspace();
    const target = resolveSiteDatabasePaths({ dir: currentSiteDir }, { workspace, reserveIdentity: false });
    return registeredSources({ workspace, targetSiteId: target.siteId, targetSiteDir: currentSiteDir, targetFile: target.contentDbPath });
  };
  return {
    /** Discover safe other-site names after authorization. @throws ToolInputError on remote hosts. @complexity O(n) registry probes. */
    async listSiteNames(_required, _options = {}) { return sources().map(source => source.name); },
    /** Match exact registered names only; paths supplied by a model never become filesystem paths.
     * @throws ToolInputError for refused/unreadable sources. @complexity O(n) registry probes plus bounded SQL reads.
     */
    async openStore({ siteName }, _options = {}) {
      const source = sources().find(source => source.name === siteName);
      if (!source) return undefined;
      if (resolveSiteStorage(source.dir).kind !== 'sqlite') throw new ToolInputError({ message: 'Only local SQLite sites can be read.' });
      const paths = resolveSiteDatabasePaths({ dir: source.dir }, { workspace: sitesWorkspace(), reserveIdentity: false });
      if (!fs.existsSync(paths.chatDbPath)) throw new ToolInputError({ message: "This site's chat database is missing. Open the site in Tovu first." });
      try {
        const kernel = openContent<ContentDatabase>(paths.contentDbPath, { readOnly: true });
        let workspaceId: string, ownerId: string;
        try {
          workspaceId = (await resolveWorkspace({ kernel })).id;
          // Users are site-local: never reuse the caller's principal or infer ownership from username/email.
          const owners = await kernel.query<{ principal_id: string }>(sql`SELECT DISTINCT u.principal_id
            FROM identity_users u JOIN principal_roles pr ON pr.principal_id=u.principal_id AND pr.workspace_id=u.workspace_id
            JOIN roles r ON r.id=pr.role_id AND r.workspace_id=pr.workspace_id
            WHERE u.workspace_id=${workspaceId} AND r.name='owner' LIMIT 2`);
          if (owners.length !== 1) throw new ToolInputError({ message: 'The target site must have exactly one owner to read its chats.' });
          ownerId = owners[0]!.principal_id;
        } finally { await kernel.close(); }
        // The existing factories borrow their connection; construction/get/history reads never write.
        const db = openChat(paths.chatDbPath, { readonly: true, fileMustExist: true });
        try {
          db.pragma('busy_timeout = 5000');
          const store = createChatStoreFactory(db)({ kind: 'user', workspaceId, userId: ownerId });
          return { store, close: () => { db.close(); } };
        } catch (error) { db.close(); throw error; }
      } catch (error) {
        if (error instanceof ToolInputError) throw error;
        // SQLite/config errors may carry private paths; expose only a fixed refusal to the model.
        throw new ToolInputError({ message: "This site's chat history cannot be read. Open it in Tovu and try again." });
      }
    },
    /** Recognize the current registry name without opening it. @throws ToolInputError on remote hosts or registry I/O errors. @complexity O(n) registry scan. */
    isCurrentSite({ siteName }, _options = {}) {
      assertLocal();
      return sitesWorkspace().registry({}).list({}).some(entry => {
        if (entry.name !== siteName) return false;
        try { return fs.realpathSync(entry.path) === fs.realpathSync(currentSiteDir); }
        catch { return false; }
      });
    },
  };
}
