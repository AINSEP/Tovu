// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import { createApp } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, type SiteStore } from "#src/server/runtime/composition/open-site-store";
import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { bootAuthenticated } from "./http-test-server.js";

/**
 * @file The `tovu init` → `tovu serve <dir>` boot, for the `*.unrun.integration.test.ts` files: a real
 * site folder (`initSite`), opened and migrated by `bootSiteDir`, composed by `createSiteRouteDeps`
 * with the same overrides `cli/commands/serve.ts` passes, served by the real `createApp()` on a
 * random port, and logged in as the seeded owner. One body for both dialects, so a route suite
 * proves SQLite and PGlite with the same assertions — the route-level counterpart of
 * `platform/db/kernel/__tests__/dialect-matrix.ts`'s repo-level `describeEachDialect`.
 *
 * Modeled on `runtime/composition/__tests__/create-site-route-deps.pglite.integration.test.ts`'s
 * `bootOwner`; teardown follows `serve.ts` (`closeSiteDirBoot(boot, composedStore)`).
 */

export type SiteDialect = "sqlite" | "pglite";
export const SITE_DIALECTS: readonly SiteDialect[] = ["sqlite", "pglite"];

export type SiteDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;

export interface BootedSite {
  deps: SiteDeps;
  baseUrl: string;
  cookie: string;
  /** `/api/admin/v1/workspaces/<id>` — the prefix every workspace-scoped admin route shares. */
  ws: string;
  siteDir: string;
}

/** The boot readiness promises {@link drainBootReadiness} settles — a narrow slice so a unit test can
 *  hand it fakes instead of a booted site. */
export type BootReadiness = Pick<
  SiteDeps,
  | "identityReady"
  | "settingsReady"
  | "seoReady"
  | "commentsReady"
  | "commentsSettingsReady"
  | "executionSettingsReady"
  | "settingsUiTabsReady"
  | "analyticsSettingsReady"
  | "siteTitleReady"
  | "pluginRuntimeReady"
>;

/** Every fire-and-forget readiness promise the composition starts, so teardown never races a boot write.
 *  `pluginRuntimeReady` included: closing the site before the boot plugin attach finished raced its writes. */
export async function drainBootReadiness(deps: BootReadiness): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
    deps.siteTitleReady,
    deps.pluginRuntimeReady,
  ]);
}

/** Boots a fresh site of `dialect` and registers its teardown on `t`. */
export async function bootSite(t: TestContext, dialect: SiteDialect): Promise<BootedSite> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `unrun-site-${dialect}-`));
  const siteDir = path.join(parent, "site");
  const savedSocketEnv = process.env[PG_SOCKET_ENV];
  const socketDir = defaultPgliteSocketDir(path.join(siteDir, PGLITE_DATA_DIR_NAME));
  if (dialect === "pglite") process.env[PG_SOCKET_ENV] = path.join(socketDir, PGLITE_SOCKET_FILE);

  await initSite({ dir: siteDir, name: `Unrun ${dialect} site`, storage: { kind: dialect } });
  const boot = await bootSiteDir({ dir: siteDir });
  let composed: SiteStore | undefined;
  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    db: boot.db,
    store: boot.store,
    workspaceId: boot.workspaceId,
    onStoreOpened: (store) => (composed = store),
    uploadsDir: path.join(siteDir, "uploads"),
    themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: path.basename(siteDir), dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => {
    await drainBootReadiness(deps).catch(() => undefined);
    await closeSiteDirBoot(boot, composed).catch(() => undefined);
    if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
    else process.env[PG_SOCKET_ENV] = savedSocketEnv;
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  });
  await drainBootReadiness(deps);

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  return { deps, baseUrl, cookie, ws: `/api/admin/v1/workspaces/${deps.workspaceId}`, siteDir };
}

/** One JSON request with the session cookie; `body` omitted sends no content-type. */
export async function send(site: Pick<BootedSite, "baseUrl" | "cookie">, method: string, route: string, body?: unknown): Promise<Response> {
  return fetch(`${site.baseUrl}${route}`, {
    method,
    headers: { cookie: site.cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Asserts the status (printing the body on mismatch) and parses the JSON body. */
export async function expectJson<T>(res: Response, status: number): Promise<T> {
  const text = await res.text();
  if (res.status !== status) throw new Error(`expected HTTP ${status}, got ${res.status}: ${text}`);
  return (text === "" ? undefined : JSON.parse(text)) as T;
}
