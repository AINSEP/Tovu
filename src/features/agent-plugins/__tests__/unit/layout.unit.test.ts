import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveAgentPluginLayout } from "../../layout";

/**
 * @file `resolveAgentPluginLayout()` — where installed Agent Plugin bytes live on disk.
 *
 * Mirrors this codebase's own existing convention rather than inventing one: `mediaUploadsDir()`
 * (`src/server/deps.ts:134`) defaults to `join(process.cwd(), "infra", "uploads")` and is overridden
 * by `TOVU_MEDIA_UPLOADS_DIR`; `builtInThemesDir()` (`deps.ts:144`) follows the same `TOVU_*_DIR`
 * shape. `infra/` is the repo's own gitignored runtime-data root (`.gitignore:17-22`, `infra/README.md`)
 * and already contains a `ws/<workspaceId>/` shape for uploads (`infra/uploads/ws/workspace-local/`).
 */

test("defaults to infra/agent-plugins under the given cwd", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(layout.root, path.resolve("/srv/tovu-site/infra/agent-plugins"));
});

test("splits into packages/sha256, data/ws, and staging under the root", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(layout.packages, path.join(layout.root, "packages", "sha256"));
  assert.equal(layout.data, path.join(layout.root, "data", "ws"));
  assert.equal(layout.staging, path.join(layout.root, "staging"));
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

test("workspaceDataDir joins the plugin id under the workspace's data root", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  const dir = layout.workspaceDataDir("11111111-1111-4111-8111-111111111111", "ui-ux-design");
  assert.equal(
    dir,
    path.join(layout.data, "11111111-1111-4111-8111-111111111111", "ui-ux-design"),
  );
});

test("workspaceDataDir rejects a workspace id that is not a UUID", () => {
  const layout = resolveAgentPluginLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.throws(() => layout.workspaceDataDir("../escape", "ui-ux-design"));
});
