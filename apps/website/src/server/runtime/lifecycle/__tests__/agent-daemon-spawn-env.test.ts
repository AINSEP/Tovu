import assert from "node:assert/strict";
import test from "node:test";

import { resolveSiteRoot } from "#src/platform/site-dir/index";
import { buildDaemonSpawnEnvOverrides } from "../daemon-supervisor.js";
import { siteThemesDir } from "../../composition/deps.js";

/**
 * @file Regression coverage for the daemon-spawn site-dir defect (2026-08-29 follow-up to the
 * 2026-08-28 daemon startup + port-scoping fix). `spawnRealDaemonProcessFor` inherited the parent's
 * `process.env` unchanged plus a `JINI_AGENT_DAEMON_PORT` override, but never told the child which
 * SITE to open — the daemon fell back to `resolveSiteRoot()`'s cwd-relative default
 * (`<cwd>/sites/tovu-com`), which only happened to agree with the real site when the daemon's cwd
 * was accidentally the site dir itself. Confirmed live via Tovu-Runner (cwd is Tovu-Runner's own
 * repo root, `sites/tovu-com` does not exist there — crash-loop) and, worse, via a direct `tovu
 * serve <dir>` run from this repo's own root, where `sites/tovu-com` DOES exist as a fixture — the
 * daemon bound its self-allocated port cleanly and answered requests while quietly attached to the
 * WRONG site's database. The port-focused regression test from the prior fix could not have caught
 * this: it only proves the PORT round-trips correctly, never that the SITE does.
 *
 * The load-bearing assertion is the invariant the earlier port fix already established the pattern
 * for: the daemon child's resolved site root must equal the PARENT's own already-resolved site
 * root — not merely that some env var got set to some non-empty string, and not for a site dir that
 * happens to equal the cwd fallback (which would pass even with the bug present).
 */

test("the daemon child's spawn env resolves to the SAME site root the parent already resolved, for a site dir that is NOT the cwd fallback", () => {
  const parentSiteRoot = "/Users/la/some/install-dir/tovu-project";

  const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: parentSiteRoot, daemonPortOverride: undefined });
  const childEnv = { ...process.env, ...overrides };

  // A deliberately unrelated cwd — proves the child's resolution no longer depends on sharing the
  // parent's working directory (Tovu-Runner's cwd is its own repo, nowhere near any site dir).
  const childResolvedSiteRoot = resolveSiteRoot({ env: childEnv, cwd: "/completely/unrelated/cwd" });

  assert.equal(childResolvedSiteRoot, parentSiteRoot, "the daemon must open the SAME site the parent website process is serving");
});

test("an operator-set TOVU_SITE_DIR in the parent's own env is never shadowed by this process's own resolved site dir", () => {
  const previous = process.env.TOVU_SITE_DIR;
  process.env.TOVU_SITE_DIR = "/operator/pinned/site";
  try {
    const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/whatever/this/process/independently/resolved", daemonPortOverride: undefined });

    assert.equal(
      overrides.TOVU_SITE_DIR,
      undefined,
      "must not inject an override at all — the child already inherits the operator's own TOVU_SITE_DIR via ...process.env",
    );
  } finally {
    if (previous === undefined) delete process.env.TOVU_SITE_DIR;
    else process.env.TOVU_SITE_DIR = previous;
  }
});

test("an independently-set TOVU_THEMES_DIR still wins over the injected TOVU_SITE_DIR in the child's resolution", () => {
  const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: undefined });
  const childEnv: NodeJS.ProcessEnv = { ...process.env, TOVU_THEMES_DIR: "/custom/themes-elsewhere", ...overrides };

  const previous = { TOVU_SITE_DIR: process.env.TOVU_SITE_DIR, TOVU_THEMES_DIR: process.env.TOVU_THEMES_DIR };
  try {
    process.env.TOVU_SITE_DIR = childEnv.TOVU_SITE_DIR;
    process.env.TOVU_THEMES_DIR = childEnv.TOVU_THEMES_DIR;
    assert.equal(siteThemesDir(), "/custom/themes-elsewhere", "the real resolver must honor the independent subpath override");
    assert.equal(resolveSiteRoot({ env: childEnv }), "/site/A", "the site dir override itself must still be present and correct");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("buildDaemonSpawnEnvOverrides never touches TOVU_CONTENT_DB / TOVU_MEDIA_UPLOADS_DIR / TOVU_THEMES_DIR directly", () => {
  const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: "9999" });
  assert.equal(overrides.JINI_AGENT_DAEMON_PORT, "9999");

  for (const key of ["TOVU_CONTENT_DB", "TOVU_MEDIA_UPLOADS_DIR", "TOVU_THEMES_DIR"] as const) {
    assert.equal(key in overrides, false, `${key} must remain independently overridable — this function must not set it`);
  }
});

test("an undefined daemon port injects no JINI_AGENT_DAEMON_PORT override", () => {
  const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: undefined });
  assert.equal("JINI_AGENT_DAEMON_PORT" in overrides, false);
});

test("a PGlite site's owner socket is handed to the daemon as TOVU_PG_SOCKET; other sites get no such var", () => {
  const pglite = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: undefined, pgSocketPath: "/tmp/owner/.s.PGSQL.5432" });
  assert.equal(pglite.TOVU_PG_SOCKET, "/tmp/owner/.s.PGSQL.5432");

  const sqlite = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: undefined });
  assert.equal("TOVU_PG_SOCKET" in sqlite, false, "a SQLite (or Postgres) site's daemon env is unchanged");
});
