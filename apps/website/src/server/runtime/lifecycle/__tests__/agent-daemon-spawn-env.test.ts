import assert from "node:assert/strict";
import test from "node:test";

import { resolveSiteRoot } from "#src/platform/site-dir/index";
import { buildDaemonSpawnEnvOverrides } from "../daemon-supervisor.js";

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
  const childEnv = { ...process.env, TOVU_THEMES_DIR: "/custom/themes-elsewhere", ...overrides };

  // Mirrors `deps.ts`'s own `siteThemesDir()` precedence directly: `TOVU_THEMES_DIR ?? join(siteDir(), "themes")`.
  const themesDir = childEnv.TOVU_THEMES_DIR ?? `${resolveSiteRoot({ env: childEnv })}/themes`;

  assert.equal(themesDir, "/custom/themes-elsewhere", "an independently-overridden subpath must keep winning outright over the injected site dir");
  assert.equal(resolveSiteRoot({ env: childEnv }), "/site/A", "the site dir override itself must still be present and correct");
});

test("buildDaemonSpawnEnvOverrides never touches TOVU_CONTENT_DB / TOVU_MEDIA_UPLOADS_DIR / TOVU_THEMES_DIR directly", () => {
  const overrides = buildDaemonSpawnEnvOverrides({ workspaceId: "workspace-1", siteDir: "/site/A", daemonPortOverride: "9999" });

  for (const key of ["TOVU_CONTENT_DB", "TOVU_MEDIA_UPLOADS_DIR", "TOVU_THEMES_DIR"] as const) {
    assert.equal(key in overrides, false, `${key} must remain independently overridable — this function must not set it`);
  }
});
