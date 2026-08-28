import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveAgentPluginLayout } from "../../layout.js";
import { resolveAgentPluginRefs } from "../../resolve-agent-plugin-refs.js";

/**
 * @file Proves `resolveAgentPluginRefs()` — the exact function `agent-daemon-server.ts`'s
 * `onStarted` calls via `resolveAgentPluginPromptPrefix()` before every run — against the REAL,
 * already-installed `ui-ux-design` Agent Plugin package on THIS machine
 * (`sites/<name>/agent-plugins/ws/workspace-local/packages/sha256/<digest>/`), not a synthetic fixture
 * built by the test itself.
 *
 * `resolve-agent-plugin-refs.unit.test.ts` (sibling file) already proves the resolver's LOGIC
 * thoroughly — zero/one/many-match, ordering, partial-failure — against packages it installs into
 * a temp directory via the real `installAgentPlugin()` pipeline. That is the right way to test
 * logic portably. This file exists for a narrower, different claim: that on THIS machine, right
 * now, the actual production install for workspace `workspace-local` really does contain real
 * `ui-ux-design` prose, and `resolveAgentPluginRefs()` really does read it byte-for-byte off real
 * disk. Nothing here is asserted against a string this test itself wrote.
 *
 * ENVIRONMENT-SCOPED, not portable CI coverage: `sites/` is this repo's gitignored site-data
 * root (see `.gitignore` and `layout.ts`'s own header) — a machine that has never installed this
 * plugin (a fresh clone, a CI runner with no prior install step) has no
 * `<site>/agent-plugins/ws/workspace-local/` tree at all. This test deliberately FAILS LOUDLY with
 * an explicit message naming the missing path in that case, rather than silently skipping — on a
 * machine where the plugin genuinely is not installed, "the wiring is proven" would be a false
 * claim to make quietly.
 *
 * The ambiguous-multi-digest case is intentionally NOT reproduced here: doing so would mean
 * installing a second real package into this machine's live `workspace-local` tree, mutating
 * production data to make a test pass. `resolve-agent-plugin-refs.unit.test.ts`'s own
 * "fails closed with an exact ambiguity reason..." test already proves that exact-error-text
 * behavior against disposable temp-directory fixtures.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const WORKSPACE_ID = "workspace-local";
const PLUGIN_ID = "ui-ux-design";

test("resolveAgentPluginRefs injects the REAL installed ui-ux-design SKILL.md verbatim (production install, this machine)", async () => {
  const layout = resolveAgentPluginLayout({ cwd: REPO_ROOT, env: {} }).forWorkspace(WORKSPACE_ID);

  let digestDirs: string[];
  try {
    digestDirs = await readdir(layout.packages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(
      `expected a real installed Agent Plugin package tree at ${layout.packages} (workspace ` +
        `'${WORKSPACE_ID}') but found none (${message}). This test proves the REAL on-disk install ` +
        `on this machine, not portable logic — if 'ui-ux-design' was never installed here, install it ` +
        `first rather than treating this failure as a wiring regression.`,
    );
    return;
  }
  // Locate the `ui-ux-design` package BY ITS SKILL, rather than asserting the tree holds exactly one
  // digest and indexing [0]. That older form encoded "this machine has exactly one Agent Plugin
  // installed", which was true when it was written and stopped being true the moment a second one
  // (`site-compliance`) was installed beside it — a stale environment assumption failing as though
  // it were a wiring regression. Package count was never what this test proves; the verbatim-bytes
  // assertion below is.
  const skillPaths = digestDirs.map((digest) => path.join(layout.packages, digest, "skills", PLUGIN_ID, "SKILL.md"));
  const skillPath = skillPaths.find((candidate) => existsSync(candidate));
  assert.ok(
    skillPath !== undefined,
    `expected one installed digest under ${layout.packages} to carry skills/${PLUGIN_ID}/SKILL.md, ` +
      `searched: ${skillPaths.join(", ") || "(none)"}`,
  );
  const realSkillMarkdown = await readFile(skillPath, "utf8");
  assert.ok(realSkillMarkdown.length > 0, `real SKILL.md at ${skillPath} was unexpectedly empty`);

  const result = await resolveAgentPluginRefs([PLUGIN_ID], layout);

  assert.equal(result.ok, true, `expected resolution to succeed, got: ${JSON.stringify(result)}`);
  assert.ok(result.ok);
  // The load-bearing assertion: the resolver's output contains the EXACT bytes this test just read
  // independently off disk — not a value that merely happens to match what the test itself wrote.
  assert.ok(
    result.promptPrefix.includes(realSkillMarkdown),
    "resolved promptPrefix does not contain the exact real SKILL.md bytes read independently from disk",
  );
  assert.ok(result.promptPrefix.startsWith(`<<AGENT_PLUGIN pluginId="${PLUGIN_ID}">>`));

  // The composer's un-pinned state (no chip selected) must inject nothing from this same real
  // package — the regression this whole feature chain exists to prevent.
  const noRefsResult = await resolveAgentPluginRefs([], layout);
  assert.deepEqual(noRefsResult, { ok: true, promptPrefix: "" });
});

test("resolveAgentPluginRefs fails closed with an exact reason for a pluginRefId absent from the real installed packages", async () => {
  const layout = resolveAgentPluginLayout({ cwd: REPO_ROOT, env: {} }).forWorkspace(WORKSPACE_ID);

  const result = await resolveAgentPluginRefs(["not-a-real-installed-plugin-id"], layout);

  assert.deepEqual(result, {
    ok: false,
    reason:
      "Agent Plugin 'not-a-real-installed-plugin-id' is not installed in this workspace — pinned by the composer but not found under any installed package",
  });
});
