import { sql } from "kysely";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Host-owned project transaction; callers share the vault and reference commit boundary. */
export type ProjectKeyTransaction = <T>(required: { run: () => Promise<T> }, optional?: Record<string, never>) => Promise<T>;

/** Project-local references. Only the meta UUID identifies a site; workspace ids are never safe. */
export interface KeyAttachments {
  attach(required: { siteId: string; keyId: string; siteName: string }, optional?: Record<string, never>): Promise<void>;
  detach(required: { siteId: string; keyId: string }, optional?: Record<string, never>): Promise<void>;
  isAttached(required: { siteId: string; keyId: string }, optional?: Record<string, never>): Promise<boolean>;
  usersOf(required: { keyId: string }, optional?: Record<string, never>): Promise<readonly { siteId: string; siteName: string }[]>;
  removeKey(required: { keyId: string }, optional?: Record<string, never>): Promise<void>;
  renameSite(required: { siteId: string; siteName: string }, optional?: Record<string, never>): Promise<void>;
}

/** One indexed lookup per check; no cache so attach/detach changes the next credential read. */
export function createKeyAttachments({ kernel }: { kernel: StorageKernel<unknown> }, _optional = {}): KeyAttachments {
  return {
    async attach({ siteId, keyId, siteName }) {
      if (!siteId) throw new Error("This site has no id yet; restart it.");
      await kernel.execute(sql`INSERT INTO site_key_attachments (site_id, key_id, site_name, attached_at) VALUES (${siteId}, ${keyId}, ${siteName}, ${new Date().toISOString()}) ON CONFLICT (site_id, key_id) DO NOTHING`);
    },
    detach: ({ siteId, keyId }) => kernel.execute(sql`DELETE FROM site_key_attachments WHERE site_id=${siteId} AND key_id=${keyId}`),
    async isAttached({ siteId, keyId }) {
      if (!siteId) return false;
      return (await kernel.query(sql`SELECT 1 FROM site_key_attachments WHERE site_id=${siteId} AND key_id=${keyId}`)).length > 0;
    },
    async usersOf({ keyId }) {
      const rows = await kernel.query<{ site_id: string; site_name: string }>(sql`SELECT site_id, site_name FROM site_key_attachments WHERE key_id=${keyId} ORDER BY site_name, site_id`);
      return rows.map(row => ({ siteId: row.site_id, siteName: row.site_name }));
    },
    removeKey: ({ keyId }) => kernel.execute(sql`DELETE FROM site_key_attachments WHERE key_id=${keyId}`),
    renameSite: ({ siteId, siteName }) => kernel.execute(sql`UPDATE site_key_attachments SET site_name=${siteName} WHERE site_id=${siteId}`),
  };
}
