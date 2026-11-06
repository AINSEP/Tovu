import { sql } from "kysely";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Host-owned project transaction; callers share the vault and reference commit boundary. */
export type ProjectKeyTransaction = <T>(required: { run: () => Promise<T> }, optional?: Record<string, never>) => Promise<T>;

/** Project-local references. Only the meta UUID identifies a site; workspace ids are never safe. */
export interface KeyAttachments {
  keyForLabel?(required: { siteId: string; label: string }, optional?: Record<string, never>): Promise<string | null>;
  keysFor(required: { siteId: string }, optional?: Record<string, never>): Promise<readonly string[]>;
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
    async keyForLabel({ siteId, label }) {
      if (!siteId) return null;
      const rows = await kernel.query<{ key_id: string }>(sql`SELECT a.key_id FROM secrets_vault v JOIN site_key_attachments a ON a.key_id=v.id AND a.site_id=${siteId} WHERE v.workspace_id='project' AND (v.label=${label} OR EXISTS (SELECT 1 FROM json_each(v.meta, '$.worksFor') WHERE value=${label})) AND (v.kind='custom' OR (v.kind='vendor' AND json_extract(v.meta, '$.credentialType')='custom')) LIMIT 2`);
      if (rows.length > 1) throw new Error("More than one granted key has this label. Revoke the extra site grant in Shared Keys and choose one key.");
      return rows[0]?.key_id ?? null;
    },
    async keysFor({ siteId }) {
      if (!siteId) return [];
      const rows = await kernel.query<{ key_id: string }>(sql`SELECT key_id FROM site_key_attachments WHERE site_id=${siteId} ORDER BY key_id LIMIT 101`);
      if (rows.length > 100) throw new Error("This site uses more than 100 saved keys. Remove unused site grants in Shared Keys before continuing.");
      return rows.map(row => row.key_id);
    },
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
