/** Browser-safe S3 contract. Values/passphrases travel only toward main; replies are metadata. */
export const OWNER_STORE_CHANNELS = {
  status: 'runner:owner-store:status', list: 'runner:owner-store:list',
  put: 'runner:owner-store:put', delete: 'runner:owner-store:delete',
  grant: 'runner:owner-store:grant', revoke: 'runner:owner-store:revoke',
  sync: 'runner:owner-store:sync', export: 'runner:owner-store:export',
  restore: 'runner:owner-store:restore',
} as const;
export type OwnerStoreAction = keyof typeof OWNER_STORE_CHANNELS;
export type OwnerStoreKind = 'vendor' | 'site-assistant' | 'media-provider' | 'publish-peer' | 'source-control';

/** The CLI's safe inventory view; no payload, arbitrary meta, envelope or key hints. */
export interface OwnerStoreEntry {
  id: string; kind: OwnerStoreKind; label: string; provider: string | null;
  revision: number; configured: boolean; isDefault: boolean; worksFor: string[];
}
export interface OwnerStoreGrant { entry_id: string; consumer_id: string; created_at: string }
export interface OwnerStoreCopyResult {
  id: string; kind: OwnerStoreKind; status: 'copied' | 'skipped' | 'failed'; reasonCode?: string;
}
export interface OwnerStorePutEntry {
  id?: string; kind?: OwnerStoreKind; label: string; provider: string;
  meta: Record<string, unknown>; payload: Record<string, unknown>;
  /** null creates; replacing requires id and the last inventory revision. */
  expectedRevision: number | null;
}

/** CLI fields exclude userDataDir: main supplies Electron's resolved profile on every call. */
export interface OwnerStoreCliFields {
  status: {}; list: { store?: 'project' }; put: { entry: OwnerStorePutEntry; store?: 'project' };
  delete: { entryId: string; expectedRevision: number };
  grant: { entryId: string; consumerId: string }; revoke: { entryId: string }; sync: {};
  export: { filePath: string; passphrase: string }; restore: { filePath: string; passphrase: string };
}
export interface OwnerStoreData {
  status: { ready: boolean; entries: number; grants: number };
  list: { entries: OwnerStoreEntry[]; grants: OwnerStoreGrant[] };
  put: { entry: OwnerStoreEntry }; delete: { deleted: boolean };
  grant: { granted: boolean; consumerId: string }; revoke: { revoked: boolean; consumerId: string };
  sync: { consumerId: string; results: OwnerStoreCopyResult[] };
  export: { exported: boolean }; restore: { restored: number };
}
export interface OwnerStoreError { code: string; message: string }
/** A committed put/grant can succeed while individual site copies need retrying. */
export interface OwnerStoreSyncAttempt { siteId: string; reply: OwnerStoreReply<'sync'> }
export type OwnerStoreReply<A extends OwnerStoreAction = OwnerStoreAction> =
  | { version: 1; ok: true; action: A; data: OwnerStoreData[A]; sync?: OwnerStoreSyncAttempt[]; syncError?: OwnerStoreError }
  | { version: 1; ok: false; action: A; error: OwnerStoreError };

/** Renderer selects tracked IDs and supplies secrets; main alone chooses filesystem paths. */
export interface OwnerStoreInput {
  status: {}; list: OwnerStoreCliFields['list']; put: OwnerStoreCliFields['put']; delete: OwnerStoreCliFields['delete'];
  grant: { entryId: string; siteId: string }; revoke: { entryId: string; siteId: string };
  sync: { siteId: string }; export: { passphrase: string }; restore: { passphrase: string };
}
/** Exposed as window.tovuOwnerStore. Example: await bridge.list({}, {}). */
export type OwnerStoreBridge = {
  [A in OwnerStoreAction]: (input: OwnerStoreInput[A], options?: {}) => Promise<OwnerStoreReply<A>>;
};
