import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { pinServedSiteDirIntoEnv } from "../../commands/serve.js";
import { resolveChatAttachmentUploadDirectory } from "../../../server/inbound/assistant/chat-attachment-directory.js";
import { buildDaemonSpawnEnvOverrides } from "../../../server/runtime/lifecycle/daemon-supervisor.js";
import { resolveSiteRoot } from "../../../platform/site-dir/site-root.js";
import { describeSiteBinding } from "../../../platform/site-dir/site-registry.js";
import { resolveSitesDeps } from "../../../features/sites/deps.js";

/**
 * @file `tovu serve <dir>` must leave ONE answer to "where is this site?" behind — the 2026-09-07
 * audit's claim #5.
 *
 * `runServeCommand` overrode `uploadsDir`/`themesDir`/the content-db path explicitly but set no
 * `TOVU_SITE_DIR`, so everything else it derives from `siteDir()` (`chat.db`, the ops journal, the
 * skills and agent-plugin roots, and the chat-attachment staging directory) still resolved against
 * `<cwd>/sites/tovu-com`. The agent daemon it spawns did not share that fate —
 * `buildDaemonSpawnEnvOverrides` sets `TOVU_SITE_DIR: input.siteDir` on the child whenever the
 * parent has none — so the two processes disagreed by construction. Measured for
 * `tovu serve /tmp/client-a` before the fix:
 *
 *     API  reads   : <repo>/sites/tovu-com/uploads/chat-attachments
 *     daemon writes: /tmp/client-a/uploads/chat-attachments
 *
 * These tests use an INJECTED env object wherever they can; the two that must exercise the real
 * `process.env`-reading resolvers save and restore every key they touch.
 */

const TARGET = path.resolve("/tmp/tovu-serve-pin-target-site");

/** Runs `body` with `process.env` temporarily replaced by `env`, restoring the real one after —
 *  including on throw. The chat-attachment and content-db resolvers read `process.env` directly
 *  (they take no env parameter), so there is no narrower seam available for them. */
function withProcessEnv<T>(env: NodeJS.ProcessEnv, body: () => T): T {
  const saved = process.env;
  process.env = env;
  try {
    return body();
  } finally {
    process.env = saved;
  }
}

/** The environment an ordinary `tovu serve <dir>` invocation starts from: no site override of any
 *  kind, so every `siteDir()`-derived path falls back to `<cwd>/sites/<default>`. */
function bareServeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TOVU_SITE_DIR;
  delete env.TOVU_SITE;
  delete env.TOVU_CONTENT_DB;
  delete env.TOVU_CHAT_ATTACHMENTS_DIR;
  return env;
}

test("pinServedSiteDirIntoEnv points the site root at the directory this invocation was told to serve", () => {
  const env = bareServeEnv();
  assert.notEqual(resolveSiteRoot({ env, cwd: process.cwd() }), TARGET, "control: unpinned, the root is cwd-derived");

  pinServedSiteDirIntoEnv(TARGET, env);

  assert.equal(env.TOVU_SITE_DIR, TARGET);
  assert.equal(resolveSiteRoot({ env, cwd: process.cwd() }), TARGET);
});

test("pinServedSiteDirIntoEnv overrides an operator's own TOVU_SITE_DIR — the explicit <dir> argument is what this process serves", () => {
  const env = { ...bareServeEnv(), TOVU_SITE_DIR: "/somewhere/else" };
  pinServedSiteDirIntoEnv(TARGET, env);
  assert.equal(env.TOVU_SITE_DIR, TARGET);
});

test("tovu serve <dir>: the API and the daemon it spawns resolve the SAME chat-attachment directory", () => {
  const apiEnv = bareServeEnv();
  pinServedSiteDirIntoEnv(TARGET, apiEnv);
  const apiDirectory = withProcessEnv(apiEnv, resolveChatAttachmentUploadDirectory);

  const childEnv = { ...apiEnv, ...buildDaemonSpawnEnvOverrides({ workspaceId: "ws-1", siteDir: TARGET }) };
  const daemonDirectory = withProcessEnv(childEnv, resolveChatAttachmentUploadDirectory);

  assert.equal(
    apiDirectory,
    daemonDirectory,
    "the daemon writes staged attachments here and the admin read-back route reads them — they cannot differ"
  );
  assert.equal(apiDirectory, path.join(TARGET, "uploads", "chat-attachments"));
});

test("the pinned value is what the daemon child inherits — buildDaemonSpawnEnvOverrides leaves an already-set TOVU_SITE_DIR alone", () => {
  const apiEnv = bareServeEnv();
  pinServedSiteDirIntoEnv(TARGET, apiEnv);

  const overrides = withProcessEnv(apiEnv, () => buildDaemonSpawnEnvOverrides({ workspaceId: "ws-1", siteDir: TARGET }));
  assert.equal(overrides.TOVU_SITE_DIR, undefined, "the parent already carries it, so the child override is a no-op");
  assert.equal({ ...apiEnv, ...overrides }.TOVU_SITE_DIR, TARGET);
});

// ---------------------------------------------------------------------------
// 2026-09-07 audit claim #4 (second half) — the site-switching guard was enforced by the HTTP
// routes and bypassed by the agent tool. `runServeCommand` hands the API a `siteBinding` with
// `switcherCompatible: false`, but the agent daemon is a separate process that rebuilds its own
// `RouteDeps` through `createSqliteRouteDepsForWorkspace` (no override) and so fell back to
// `describeSiteBinding()`, which reported `true`. `sites_duplicate_site` executes in THAT process.
// ---------------------------------------------------------------------------

test("tovu serve <dir>: the daemon reconstructs a NON-switchable binding, matching the API's own refusal", () => {
  const apiEnv = bareServeEnv();
  pinServedSiteDirIntoEnv(TARGET, apiEnv);
  const childEnv = { ...apiEnv, ...buildDaemonSpawnEnvOverrides({ workspaceId: "ws-1", siteDir: TARGET }) };

  const daemonBinding = describeSiteBinding({ env: childEnv, cwd: process.cwd() });
  assert.equal(daemonBinding.dir, TARGET);
  assert.equal(
    daemonBinding.switcherCompatible,
    false,
    "the process that actually runs sites_duplicate_site must refuse exactly what the HTTP routes refuse"
  );
});

test("tovu serve <dir>: the sites agent-tool deps built from the daemon's own binding are non-switchable", () => {
  const apiEnv = bareServeEnv();
  pinServedSiteDirIntoEnv(TARGET, apiEnv);
  const childEnv = { ...apiEnv, ...buildDaemonSpawnEnvOverrides({ workspaceId: "ws-1", siteDir: TARGET }) };

  const resolved = resolveSitesDeps({ siteBinding: describeSiteBinding({ env: childEnv, cwd: process.cwd() }) });
  assert.equal(resolved.switcherCompatible, false, "this is the flag sites_duplicate_site's handler refuses on");
});

test("a switcher-chosen boot is untouched — the default dev boot keeps site switching enabled", () => {
  const env = bareServeEnv();
  const binding = describeSiteBinding({ env, cwd: "/repo" });
  assert.equal(binding.switcherCompatible, true, "no pin, a <cwd>/sites-relative root: nothing changes");
});
