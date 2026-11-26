import { randomUUID } from "node:crypto";
import fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { withOwnedTempRoot, type OwnedTempRootFilesystem, type OwnedTempRootLock } from "@jini-ai/platform/fs";

/**
 * The site's private temporary roots: every writer that used to `mkdtemp` under the OS temp folder
 * now allocates an owned root (`@jini-ai/platform/fs` `withOwnedTempRoot`) under one of these exact
 * prefixes, and the temp-root retention policy sweeps only these `{ parent, prefix }` pairs.
 */
export const SITE_TEMP_PREFIXES = {
  importDatabase: "tovu-import-db-",
  shareProjection: "tovu-share-projection-",
  archiveMedia: "tovu-archive-media-",
  mediaVideo: "tovu-media-video-",
  staticCopy: "tovu-static-copy-",
  snapshot: "tovu-snapshot-",
  transferChat: "tovu-transfer-chat-",
} as const;
export type SiteTempPrefix = (typeof SITE_TEMP_PREFIXES)[keyof typeof SITE_TEMP_PREFIXES];

/** Runs `work` inside one fresh owned root; the root (and its lock) live exactly as long as `work`. */
export type OwnedTempRootScope = <T>(required: { work: (owned: { root: string }) => Promise<T> }) => Promise<T>;

/** `withFileLock` with its default (real) process liveness port, shaped as the owned-root lock adapter. */
export const siteTempRootLock: OwnedTempRootLock = (required, options) => withFileLock(required, { ...options });

/**
 * Binds one writer's scope: a parent, an exact prefix and the owned-root protocol's ports.
 * @param required.parent folder that holds the roots; @param required.prefix one of `SITE_TEMP_PREFIXES`.
 * @param required.withOwnedTempRoot protocol implementation; @param required.fs / lock / id its ports.
 * @param optional.onRemovalError observer for a root whose cleanup failed (its marker stays for the sweeper).
 * @returns a scope usable wherever a writer needs a private folder. @complexity O(1) to bind.
 */
export function bindOwnedTempRootScope(
  required: { parent: string; prefix: SiteTempPrefix; withOwnedTempRoot: typeof withOwnedTempRoot; fs: OwnedTempRootFilesystem; lock: OwnedTempRootLock; id: () => string },
  optional: { onRemovalError?: (failure: { root: string; error: unknown }) => void } = {},
): OwnedTempRootScope {
  const { parent, prefix, fs, lock, id } = required;
  return ({ work }) => required.withOwnedTempRoot({ parent, prefix, id, fs, lock, work }, optional);
}

/**
 * The OS temp folder, resolved once for this process so every writer and the temp-root sweeper
 * agree on the same parent even if `TMPDIR` changes later.
 */
export const SITE_TEMP_PARENT = tmpdir();

/** Every `{ parent, prefix }` pair the site writes under `SITE_TEMP_PARENT`; the sweeper's whole scope. */
export const SITE_TEMP_ROOTS: ReadonlyArray<{ parent: string; prefix: SiteTempPrefix }> = Object.values(SITE_TEMP_PREFIXES).map(prefix => ({ parent: SITE_TEMP_PARENT, prefix }));

/**
 * The process binding of one writer's scope (real fs, real lock, random UUIDs). `parent` defaults to
 * `SITE_TEMP_PARENT`; a caller that names another parent must also be swept by that same parent.
 * @complexity O(1) to bind.
 */
export function siteTempRoot(required: { prefix: SiteTempPrefix; parent?: string }, _optional: Record<string, never> = {}): OwnedTempRootScope {
  return bindOwnedTempRootScope({ parent: required.parent ?? SITE_TEMP_PARENT, prefix: required.prefix, withOwnedTempRoot, fs: fsPromises, lock: siteTempRootLock, id: randomUUID }, {
    onRemovalError: ({ root }) => console.warn(`[temp-roots] A temporary folder could not be removed yet; the daily tidy will retry: ${root}`),
  });
}
