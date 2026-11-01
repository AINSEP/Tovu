// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import { createApp } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, type SiteStore } from "#src/server/runtime/composition/open-site-store";
import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { bootSiteDir, initSite } from "#src/server/runtime/composition/site-dir";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
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
  | "legacyPublishCredentialsReady"
>;

/** Every fire-and-forget readiness promise the composition starts, so teardown never races a boot write.
 *  `pluginRuntimeReady` included: closing the site before the boot plugin attach finished raced its writes.
 *  `legacyPublishCredentialsReady` included: it is the composition's detached boot tail (widget
 *  adoption, then the legacy publish-credential copy), and closing under it logged "The database
 *  connection is not open" on every teardown. */
export async function drainBootReadiness(deps: BootReadiness): Promise<void> {
  const results = await Promise.allSettled([
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
    deps.legacyPublishCredentialsReady,
  ]);
  // A failed pass must not let teardown close beneath its still-running siblings.
  const failed = results.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

/** Boots a fresh site of `dialect` and registers its teardown on `t`. */
export async function bootSite(t: TestContext, dialect: SiteDialect, optional: { configureDeps?: (deps: SiteDeps) => void } = {}): Promise<BootedSite> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `unrun-site-${dialect}-`));
  const siteDir = path.join(parent, "site");
  const savedSocketEnv = process.env[PG_SOCKET_ENV];
  const socketDir = defaultPgliteSocketDir(path.join(siteDir, PGLITE_DATA_DIR_NAME));
  if (dialect === "pglite") process.env[PG_SOCKET_ENV] = path.join(socketDir, PGLITE_SOCKET_FILE);

  let boot: Awaited<ReturnType<typeof bootSiteDir>> | undefined;
  let composed: SiteStore | undefined;
  let deps: SiteDeps | undefined;
  // Background passes `createApp` starts and returns before they finish (`onBootWork`); teardown
  // awaits them so the store does not close under their reads.
  const appBootWork: Promise<void>[] = [];
  try {
    await initSite({ dir: siteDir, name: `Unrun ${dialect} site`, storage: { kind: dialect } });
    boot = await bootSiteDir({ dir: siteDir });
    deps = await createSiteRouteDeps(resolveSiteDatabasePaths({ dir: siteDir }).contentDbPath, {
      db: boot.db,
      store: boot.store,
      workspaceId: boot.workspaceId,
      onStoreOpened: (store) => (composed = store),
      uploadsDir: path.join(siteDir, "uploads"),
      themesDir: path.join(siteDir, "themes"),
      siteBinding: { dir: siteDir, name: path.basename(siteDir), dirOverridden: true, switcherCompatible: false },
    });
    await drainBootReadiness(deps);
    optional.configureDeps?.(deps);
    const { baseUrl, cookie } = await bootAuthenticated(createApp(deps, { onBootWork: (work) => appBootWork.push(work) }), t);
    return { deps, baseUrl, cookie, ws: `/api/admin/v1/workspaces/${deps.workspaceId}`, siteDir };
  } finally {
    // Register after HTTP teardown, even if login fails: node:test skips hooks after one throws.
    t.after(async () => {
      try {
        if (deps) await drainBootReadiness(deps).catch(() => undefined);
        const results = await Promise.allSettled(appBootWork);
        const failed = results.find(result => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      } finally {
        // A rejected boot pass must still close the store and restore process-global fixtures.
        if (boot) await closeSiteDirBoot(boot, composed).catch(() => undefined);
        if (savedSocketEnv === undefined) delete process.env[PG_SOCKET_ENV];
        else process.env[PG_SOCKET_ENV] = savedSocketEnv;
        try { fs.rmSync(parent, { recursive: true, force: true }); }
        finally { fs.rmSync(socketDir, { recursive: true, force: true }); }
      }
    });
  }
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
