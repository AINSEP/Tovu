import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveSkillLayout } from "../../layout.js";

/**
 * @file `resolveSkillLayout()` — where installed standalone Agent Skill folders live on disk.
 * Mirrors `agent-plugins/__tests__/unit/layout.unit.test.ts`'s own coverage shape, minus the
 * `packages`/`staging`/`pluginDataDir` assertions that module has and this one deliberately does
 * not — see `layout.ts`'s header for why this layout is flat, not content-addressed.
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

test("defaults to sites/<DEFAULT_SITE_NAME>/skills under the given cwd", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(layout.root, path.resolve("/srv/tovu-site/sites/tovu-com/skills"));
});

test("the default root follows TOVU_SITE, so a second local site gets its own skills tree", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: { TOVU_SITE: "second-site" } });
  assert.equal(layout.root, path.resolve("/srv/tovu-site/sites/second-site/skills"));
});

test("the default root follows TOVU_SITE_DIR — a site mounted outside the checkout keeps its skills", () => {
  // The regression this whole 2026-08-27 change exists for: before it, an installed skill lived at
  // `<cwd>/infra/skills` no matter where the SITE was, so a volume-mounted or relocated site
  // silently left its own skill folders behind in the repo checkout.
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: { TOVU_SITE_DIR: "/var/lib/tovu/acme" } });
  assert.equal(layout.root, path.resolve("/var/lib/tovu/acme/skills"));
});

test("TOVU_SKILLS_DIR overrides the default root", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: { TOVU_SKILLS_DIR: "/var/lib/tovu/skills" } });
  assert.equal(layout.root, "/var/lib/tovu/skills");
});

test("a relative TOVU_SKILLS_DIR is rejected", () => {
  assert.throws(
    () => resolveSkillLayout({ cwd: "/srv/tovu-site", env: { TOVU_SKILLS_DIR: "relative/path" } }),
    { message: "TOVU_SKILLS_DIR must be an absolute path, got 'relative/path'" },
  );
});

test("forWorkspace roots the skills directory entirely under ws/<workspaceId>", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace(WORKSPACE_ID);
  assert.equal(ws.root, path.join(layout.root, "ws", WORKSPACE_ID));
});

test("two workspaces resolve to entirely disjoint trees", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  const a = layout.forWorkspace(WORKSPACE_ID);
  const b = layout.forWorkspace(OTHER_WORKSPACE_ID);

  assert.notEqual(a.root, b.root);
  assert.equal(path.relative(b.root, a.root).startsWith(".."), true);
});

test("forWorkspace accepts this instance's real, non-UUID workspace id", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  const ws = layout.forWorkspace("workspace-local");
  assert.equal(ws.root, path.resolve("/srv/tovu-site/sites/tovu-com/skills/ws/workspace-local"));
});

test("forWorkspace normalizes an uppercase id to a lowercase path segment", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  assert.equal(
    layout.forWorkspace("WORKSPACE-LOCAL").root,
    path.resolve("/srv/tovu-site/sites/tovu-com/skills/ws/workspace-local"),
  );
});

test("forWorkspace rejects every shape that could escape or split the path segment", () => {
  const layout = resolveSkillLayout({ cwd: "/srv/tovu-site", env: {} });
  for (const bad of ["../escape", "..", ".", "", "a/b", "a\\b", "a b", "-leading", "trailing-", "a--b", "a_b", "a".repeat(65)]) {
    assert.throws(
      () => layout.forWorkspace(bad),
      { message: `forWorkspace: '${bad}' is not a valid workspace id` },
      `expected '${bad}' to be rejected`,
    );
  }
});
