/**
 * @file Retirement cleanup for a removed site's Electron session partition.
 *
 * Why cache-only: the partition also carries sign-in and site state (cookies, local storage,
 * IndexedDB, service-worker registrations, database files), so only regenerable cache data is in
 * scope. Hence `clearCache()` (the HTTP disk cache) plus `clearCodeCaches({})` (V8's generated code
 * cache, which `clearCache()` alone is not documented to cover) — never `clearStorageData`/`clearData`,
 * and never a recursive removal of the live Chromium cache directory.
 *
 * No size bound: Electron 43's `Session` exposes `getCacheSize()` but no per-partition setter, and
 * `--disk-cache-size` is a process-wide Chromium switch, so this module retires caches rather than
 * capping them.
 */
import { sitePartition } from "./desktop-auth.ts";

/** The two cache-only members of Electron's `Session` this module may call. */
export interface CacheOnlySession {
  clearCache(): Promise<void>;
  clearCodeCaches(options: { urls?: string[] }): Promise<void>;
}

/**
 * Clear one site's HTTP and code caches in that site's own `persist:` partition — never the default
 * session, which the shell itself (and every other site's sign-in bootstrap) shares.
 *
 * @param required.siteDir the removed site's directory; the partition is `sitePartition`'s.
 * @param required.fromPartition Electron's `session.fromPartition`, injected for tests.
 * @complexity O(1) here; the clears are Chromium's own cost over the cache contents.
 */
export async function trimRetiredSiteCacheIn(
  { siteDir, fromPartition }: { siteDir: string; fromPartition: (partition: string) => CacheOnlySession }, _optional = {},
): Promise<void> {
  const target = fromPartition(sitePartition({ siteDir }));
  await target.clearCache();
  await target.clearCodeCaches({});
}
