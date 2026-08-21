import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveAgentPluginLayout } from "../../layout.js";

/**
 * @file `resolveAgentPluginLayout()` — where installed Agent Plugin bytes live on disk.
 *
 * TENANT-GRADE, revised 2026-08-12: the owner's explicit decision — "if I have one Tovu website, it
 * should not have anything to do with another Tovu website" — rules out this module's original
 * shared, content-addressed `packages/sha256/` (see the handoff's tenancy analysis for the full
 * argument). Every path below is now rooted under `ws/<workspaceId>/`, including `staging/` — even a
 * transient shared staging directory leaks "some workspace is mid-install" during its race window,
 * and moving it in costs nothing. `resolveAgentPluginLayout()` itself only resolves the INSTANCE
 * root and `TOVU_AGENT_PLUGINS_DIR`; `.forWorkspace(workspaceId)` is the only way to reach a real,
 * usable (packages/data/staging) layout, so there is no shared path type to accidentally hand to
 * `install.ts` by mistake.
 *
 * Still mirrors this codebase's own `TOVU_*_DIR` convention: `mediaUploadsDir()`
 * (`src/server/deps.ts:134`) defaults to `join(process.cwd(), "infra", "uploads")`, overridden by
 * `TOVU_MEDIA_UPLOADS_DIR`; `infra/` is the repo's own gitignored runtime-data root
 * (`.gitignore:17-22`) and already has a `ws/<workspaceId>/` shape for uploads
 * (`infra/uploads/ws/workspace-local/`).
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

test("defaults to infra/agent-plugins under the given cwd", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(layout.root, path.resolve("/srv/tovu-site/infra/agent-plugins"));
});

test("TOVU_AGENT_PLUGINS_DIR overrides the default root", () => {
  const layout = resolveAgentPluginLayout({
    cwd: "/srv/tovu-site",
    env: { TOVU_AGENT_PLUGINS_DIR: "/var/lib/tovu/agent-plugins" },
  });
  assert.equal(layout.root, "/var/lib/tovu/agent-plugins");
});

test("a relative TOVU_AGENT_PLUGINS_DIR is rejected", () => {
  assert.throws(
    () => resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: { TOVU_AGENT_PLUGINS_DIR: "relative/path" } }),
    /must be an absolute path/,
  );
});

test("forWorkspace roots packages, data, and staging entirely under ws/<workspaceId> -- no shared path", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace(WORKSPACE_ID);

  const workspaceRoot = path.join(layout.root, "ws", WORKSPACE_ID);
  assert.equal(ws.root, workspaceRoot);
  assert.equal(ws.packages, path.join(workspaceRoot, "packages", "sha256"));
  assert.equal(ws.staging, path.join(workspaceRoot, "staging"));
});

test("two workspaces resolve to entirely disjoint trees -- neither path is a prefix of the other's sibling content", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const a = layout.forWorkspace(WORKSPACE_ID);
  const b = layout.forWorkspace(OTHER_WORKSPACE_ID);

  assert.notEqual(a.root, b.root);
  assert.notEqual(a.packages, b.packages);
  assert.notEqual(a.staging, b.staging);
  // Not merely different strings -- structurally disjoint, so nothing under `a` can ever be reached
  // by walking from `b`'s root.
  assert.equal(path.relative(b.root, a.root).startsWith(".."), true);
});

test("pluginDataDir joins the plugin id under this workspace's own data root", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace(WORKSPACE_ID);
  const dir = ws.pluginDataDir("ui-ux-design");
  assert.equal(dir, path.join(ws.root, "data", "ui-ux-design"));
});

test("pluginDataDir rejects a plugin id that isn't a valid Agent Plugin name", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace(WORKSPACE_ID);
  assert.throws(() => ws.pluginDataDir("../escape"));
});

test("forWorkspace rejects a workspace id that could escape its own path segment", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.throws(
    () => layout.forWorkspace("../escape"),
    { message: "forWorkspace: '../escape' is not a valid workspace id" },
  );
});

/**
 * ---------------------------------------------------------------------------
 * Workspace id grammar, revised 2026-08-21 (owner decision: option B)
 * ---------------------------------------------------------------------------
 * `forWorkspace` originally required a syntactic UUID. This instance's REAL workspace id, read
 * straight out of `infra/content.db`, is the literal string `workspace-local` — so the UUID rule
 * could never pass on real data; it was validating against a format the product does not use, and
 * `installAgentPluginFromUrl` was unreachable from any real caller because of it.
 *
 * The check's actual job is narrower than "is this a UUID": keep a traversal or separator segment
 * out of a path built by string join. `layout.ts` already contains a pattern that does exactly that
 * job for plugin ids. The workspace check now uses the same grammar, which still accepts every UUID
 * this module ever accepted (the tests above are unchanged and still pass) while also accepting the
 * ids Tovu really issues — and `infra/uploads/ws/workspace-local/` shows that shape is already this
 * repo's own on-disk convention (see this file's header).
 */

test("forWorkspace accepts this instance's real, non-UUID workspace id", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace("workspace-local");
  assert.equal(ws.root, path.resolve("/srv/tovu-site/infra/agent-plugins/ws/workspace-local"));
  assert.equal(ws.packages, path.resolve("/srv/tovu-site/infra/agent-plugins/ws/workspace-local/packages/sha256"));
});

test("forWorkspace still normalizes an uppercase id to a lowercase path segment", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(
    layout.forWorkspace("11111111-1111-4111-8111-11111111111A").root,
    path.resolve("/srv/tovu-site/infra/agent-plugins/ws/11111111-1111-4111-8111-11111111111a"),
  );
  assert.equal(
    layout.forWorkspace("WORKSPACE-LOCAL").root,
    path.resolve("/srv/tovu-site/infra/agent-plugins/ws/workspace-local"),
  );
});

test("forWorkspace rejects every shape that could escape or split the path segment", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  for (const bad of ["../escape", "..", ".", "", "a/b", "a\\b", "a b", "-leading", "trailing-", "a--b", "a_b", "ws/../..", "a".repeat(65)]) {
    assert.throws(
      () => layout.forWorkspace(bad),
      new RegExp(`^Error: forWorkspace: '${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}' is not a valid workspace id$`),
      `expected '${bad}' to be rejected`,
    );
  }
});
