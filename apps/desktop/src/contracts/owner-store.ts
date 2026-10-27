/** Browser-safe S3 contract. Values/passphrases travel only toward main; replies are metadata.
 * Shared keys are project references; the old owner store survives only as a read-only import source.
 */
export const OWNER_STORE_CHANNELS = {
  status: 'runner:owner-store:status', list: 'runner:owner-store:list',
  put: 'runner:owner-store:put', import: 'runner:owner-store:import',
} as const;
export type OwnerStoreAction = keyof typeof OWNER_STORE_CHANNELS;
export type OwnerStoreKind = 'vendor' | 'site-assistant' | 'media-provider' | 'publish-peer' | 'source-control' | 'database-destination';

/** The CLI's safe inventory view; no payload, arbitrary meta, envelope or key hints. */
export interface OwnerStoreEntry {
  id: string; kind: OwnerStoreKind; label: string; provider: string | null;
  revision: number; configured: boolean; isDefault: boolean; worksFor: string[];
}
export interface OwnerStorePutEntry {
  id?: string; kind?: OwnerStoreKind; label: string; provider: string;
  meta: Record<string, unknown>; payload: Record<string, unknown>;
  /** null creates; replacing requires id and the last inventory revision. */
  expectedRevision: number | null;
}

/** backup: a passphrase file main picks; owner-store: this profile's legacy owner.db. */
export type LegacyImportSource = 'backup' | 'owner-store';
/** new → imported on apply. already-imported: same id and same secret. conflict: same id with a
 * different secret, or the label is taken. unsupported: a kind or owner project keys cannot hold.
 */
export interface LegacyImportItem {
  id: string; label: string; kind: OwnerStoreKind; provider: string | null;
  status: 'new' | 'imported' | 'already-imported' | 'conflict' | 'unsupported';
  reason?: 'different-secret' | 'label-taken' | 'kind' | 'owner';
}
/** A site the legacy store copied a key to. Import never touches sites: each keeps its own copy. */
export interface LegacyImportPending { entryId: string; site: string; reason: 'keeps-copy' | 'revoked-copy' }
/** sourceDigest: set for a non-empty source; an apply must name the dry run's digest (else `source-changed`). */
export interface LegacyImportReport { applied: boolean; items: LegacyImportItem[]; pending: LegacyImportPending[]; sourceDigest?: string }
/** none: no owner.db. empty: no entries or grants, safe to delete. available: entries the project
 * lacks. settled: entries exist but nothing new would import.
 */
export type LegacyOwnerState = 'none' | 'empty' | 'available' | 'settled';

/** CLI fields exclude userDataDir: main supplies Electron's resolved profile on every call. */
export interface OwnerStoreCliFields {
  status: {}; list: { store?: 'project' }; put: { entry: OwnerStorePutEntry; store?: 'project' };
  import: { source: LegacyImportSource; apply: boolean; filePath?: string; passphrase?: string; expectedDigest?: string };
}
export interface OwnerStoreData {
  status: { legacy: LegacyOwnerState; entries: number; grants: number };
  list: { entries: OwnerStoreEntry[] };
  put: { entry: OwnerStoreEntry };
  import: LegacyImportReport;
}
export interface OwnerStoreError { code: string; message: string }
export type OwnerStoreReply<A extends OwnerStoreAction = OwnerStoreAction> =
  | { version: 1; ok: true; action: A; data: OwnerStoreData[A] }
  | { version: 1; ok: false; action: A; error: OwnerStoreError };

/** Renderer supplies secrets and picks a source; main alone chooses filesystem paths. */
export interface OwnerStoreInput {
  status: {}; list: OwnerStoreCliFields['list']; put: OwnerStoreCliFields['put'];
  import: { source: LegacyImportSource; passphrase?: string };
}
/** Exposed as window.tovuOwnerStore. Example: await bridge.list({}, {}). */
export type OwnerStoreBridge = {
  [A in OwnerStoreAction]: (input: OwnerStoreInput[A], options?: {}) => Promise<OwnerStoreReply<A>>;
};
