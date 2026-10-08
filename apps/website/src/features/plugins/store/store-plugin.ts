/**
 * @file SPIKE — the sample Tier-3 store plugin (C) + checkout.
 *
 * The simplest real plugin that owns tables: it DECLARES `p_store__products` and `p_store__orders`
 * (which core creates through the never-brick dataModule seam, B), seeds products, and exposes a
 * read API + a checkout the site route (D) renders. Tier-3 = trusted/first-party/local (ADR-024):
 * full access, honestly labeled, never in the public marketplace. Exploratory spike beyond
 * ADR-023 §12's v1 disposition.
 *
 * §7/§8 note: reads here are `SELECT`s scoped to the plugin namespace (ADR-023 §8); writes go
 * direct for the spike (a real build routes writes through the typed core repository, §7). Every
 * statement runs on the storage kernel (`kernel.run`), so the same code serves SQLite and Postgres.
 */
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import { declareDataModule } from "../data-module.js";
import { type PluginStore, pluginKernel } from "../plugin-store.js";
import { activateStore as activateRuntime, type StoreApi } from "@jini-ai/commerce/store";
export { STORE_PLUGIN_ID, SEED_PRODUCTS } from "@jini-ai/commerce/store";
export type { Product, CheckoutResult, StoreApi } from "@jini-ai/commerce/store";

import { STORE_MANIFEST } from "./manifest.js";
export { STORE_MANIFEST } from "./manifest.js";

/** CMS adapter, unmounted: preserve the existing declaration's provenance and recovery protocol. */
export async function activateStore(required: { db: PluginStore; dbPath: string }, optional: Record<string, never> = {}): Promise<StoreApi> {
  const kernel = pluginKernel(required.db);
  return activateRuntime({ kernel: kernel as unknown as Parameters<typeof activateRuntime>[0]["kernel"], prepareStorage: async () => {
    const result = await declareDataModule({ db: kernel, dbPath: required.dbPath, decl: STORE_MANIFEST });
    if (!result.ok) throw new Error(`store dataModule declaration failed: ${result.error?.code} — ${result.error?.message}`);
  } }, optional);
}
/**
 * Boot helper: activate the store on the site's own content kernel.
 *
 * The composition root's kernel, not a second connection to the same file: every writer at boot
 * (Newsletter's and Comments' dataModule declares, settings/SEO seeding, this store) takes turns on
 * that one connection, so none of them can hit `SQLITE_BUSY` from another handle's transient lock.
 * `dbPath` names the file behind the kernel, for the declaration's snapshot.
 */
export async function bootstrapStore(required: { kernel: ContentKernel; dbPath: string }): Promise<StoreApi> {
  return activateStore({ db: required.kernel, dbPath: required.dbPath });
}
