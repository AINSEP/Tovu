import type { StoreCloseRegistration } from "./open-store.js";

/**
 * @file The owning content store's close hooks, keyed by the route deps they were composed for.
 *
 * Why a side table rather than new `RouteDeps` fields: only the serving routine host needs them
 * (P3-T1a.T, after `createApp`), and widening the deps bag adds back-edges every importer pays for.
 * Same precedent as `siteAppBootWorkByDeps`. A composition that owns no content store (in-memory,
 * static export) never registers, so its serving boot can never open the routine sidecar.
 */

export interface SiteStoreHooks {
  dbPath: string;
  beforeStoreClose: (required: { drain: () => Promise<void> }, optional?: Record<string, never>) => void;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
}

const hooksByDeps = new WeakMap<object, SiteStoreHooks>();

/** Called once by the SQLite/Postgres composition root, after the deps object exists. */
export function registerSiteStoreHooks({ routeDeps, hooks }: { routeDeps: object; hooks: SiteStoreHooks }, _optional: Record<string, never> = {}): void {
  hooksByDeps.set(routeDeps, hooks);
}

/** `undefined` for a composition that owns no content store. */
export function siteStoreHooksFor({ routeDeps }: { routeDeps: object }, _optional: Record<string, never> = {}): SiteStoreHooks | undefined {
  return hooksByDeps.get(routeDeps);
}
