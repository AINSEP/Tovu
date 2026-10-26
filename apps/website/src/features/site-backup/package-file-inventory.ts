import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "../agent-plugins/lifecycle.js";
import { defaultBundledSourceRoot } from "../agent-plugins/supersession.js";
import { isPackageFilePath, type PackageFileInventory } from "./share-file-policy.js";

/**
 * @file Which installed-package files a share may treat as public plugin content: exactly the files
 * THIS build ships. Each bundled source folder is packed with the seeder's own deterministic packer
 * (`packAgentPluginDirectory`), so its digest is the `package/sha256/<digest>/` folder the seeder
 * installs it under, and the packed entries are the package's file inventory. Nothing here reads the
 * site folder: a package-shaped path, `bundled-digests.json` and `activations.json` can all be written
 * by anyone who can write there, the product's bundled sources cannot.
 */

/** One memoized inventory build per key (resolved source root plus its stamp). Injectable so tests own their memo. */
export interface PackageInventoryCache {
  get(required: { key: string }): Promise<PackageFileInventory> | undefined;
  set(required: { key: string; inventory: Promise<PackageFileInventory> }): void;
  delete(required: { key: string }): void;
}

/** A single slot: one process serves one build, so a new key simply replaces the old one. */
export function createPackageInventoryCache(): PackageInventoryCache {
  let slot: { key: string; inventory: Promise<PackageFileInventory> } | undefined;
  return {
    get: ({ key }) => (slot?.key === key ? slot.inventory : undefined),
    set: (entry) => { slot = entry; },
    delete: ({ key }) => { if (slot?.key === key) slot = undefined; },
  };
}

const BUNDLED_INVENTORY = createPackageInventoryCache();

type InventoryOptions = { sourceRoot?: string; signal?: AbortSignal; cache?: PackageInventoryCache };

/**
 * The inventory only when some path is package-shaped: {@link isPackageFilePath} is the only shape the
 * policy ever verifies, so for any other share the empty inventory decides exactly the same, and a
 * share with no installed packages never packs a bundled source. A caller's own inventory wins.
 * @complexity O(paths), plus {@link readBundledPackageFiles} at most once.
 */
export async function packageFilesForPaths(required: { paths: Iterable<string> }, optional: InventoryOptions & { packageFiles?: PackageFileInventory } = {}): Promise<PackageFileInventory> {
  if (optional.packageFiles) return optional.packageFiles;
  for (const candidate of required.paths) if (isPackageFilePath({ path: candidate })) return readBundledPackageFiles({}, optional);
  return new Map();
}

/**
 * Digest -> (package-relative path -> SHA-256) for every bundled source folder. A missing source root,
 * or a folder that does not pack, verifies nothing: its installed files then get the ordinary rules.
 * Memoized per resolved root and its mtime: the bundled sources are part of the immutable build. In a
 * dev checkout an edit deep inside a plugin folder keeps the old inventory until the root changes or the
 * process restarts; the edited file's new digest is then unknown, so it only gets the ordinary rules.
 * A cancelled caller stops waiting; the build itself finishes into the memo for the next one.
 * @complexity O(bundled source bytes) on a miss: one pack and one hash per file. O(1) fs calls on a hit.
 */
export async function readBundledPackageFiles(_required: Record<string, never> = {}, optional: InventoryOptions = {}): Promise<PackageFileInventory> {
  optional.signal?.throwIfAborted();
  const sourceRoot = optional.sourceRoot ?? defaultBundledSourceRoot({ env: process.env });
  const key = await sourceRootStamp({ sourceRoot });
  if (key === null) return new Map();
  const cache = optional.cache ?? BUNDLED_INVENTORY;
  let inventory = cache.get({ key });
  if (!inventory) {
    inventory = packBundledSources({ sourceRoot });
    cache.set({ key, inventory });
    // A failed build is not remembered: the next export retries instead of inheriting the failure.
    inventory.catch(() => cache.delete({ key }));
  }
  return untilAborted({ promise: inventory }, { signal: optional.signal });
}

/** The memo key: the root's real path, inode and mtime, or null when it is not a readable folder. O(1). */
async function sourceRootStamp(required: { sourceRoot: string }): Promise<string | null> {
  try {
    const info = await stat(required.sourceRoot);
    return info.isDirectory() ? JSON.stringify([await realpath(required.sourceRoot), info.ino, info.mtimeMs]) : null;
  } catch {
    return null;
  }
}

/** Packs every bundled source folder with the seeder's own packer. O(bundled source bytes). */
async function packBundledSources(required: { sourceRoot: string }): Promise<PackageFileInventory> {
  const inventory = new Map<string, ReadonlyMap<string, string>>();
  const folders = await readdir(required.sourceRoot, { withFileTypes: true }).catch((): Dirent[] => []);
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const packed = await packAgentPluginDirectory(path.join(required.sourceRoot, folder.name)).catch(() => null);
    if (packed) inventory.set(packed.sha256, await packedFileHashes({ bytes: packed.bytes }));
  }
  return inventory;
}

/** `promise`, unless `signal` aborts first; then its reason. The promise itself keeps running. O(1). */
function untilAborted<T>(required: { promise: Promise<T> }, optional: { signal?: AbortSignal | undefined } = {}): Promise<T> {
  const { signal } = optional;
  if (!signal) return required.promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    required.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** The packed archive read back with the installer's own reader. O(archive bytes). */
async function packedFileHashes(required: { bytes: Uint8Array }): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  for await (const entry of createBundledSourceArchiveReader().entries(required.bytes)) {
    if (entry.kind !== "file") continue;
    const hash = createHash("sha256");
    for await (const chunk of entry.openReadStream()) hash.update(chunk);
    files.set(entry.entryPath, hash.digest("hex"));
  }
  return files;
}
