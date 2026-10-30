/**
 * Platforms without `O_NOFOLLOW` (Windows) open planned files with plain `O_RDONLY`. This process
 * replaces `node:fs` constants before `sources.ts` loads, so the fallback is proven on Linux too.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

const constants = { ...fs.constants, O_NOFOLLOW: undefined };
mock.module("node:fs", { defaultExport: { ...fs, constants }, namedExports: { ...fs, constants } });

test("without O_NOFOLLOW a planned file is opened read-only", async () => {
  const { readPlannedFile } = await import("../sources.js");
  const flags: number[] = [];
  const result = await readPlannedFile({ path: "themes/a", bytes: 1, scope: "themes", absPath: "/never/read", mtimeMs: 1 }, {
    openFile: async (_file, openFlags) => { flags.push(openFlags); throw new Error("not opened"); },
  });
  assert.deepEqual(flags, [fs.constants.O_RDONLY]);
  assert.deepEqual(result, { ok: false, message: "'themes/a' changed since the plan was made. Call site_backup_plan again." });
});

test("without O_NOFOLLOW share planning refuses themes reached through a linked ancestor", { skip: process.platform === "win32" }, async t => {
  const { collectSiteBackupFiles } = await import("../sources.js");
  const { resolveAgentPluginLayout } = await import("../../agent-plugins/layout.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-theme-no-follow-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "share-theme-private-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(outside, "themes"));
  fs.writeFileSync(path.join(outside, "themes/index.html"), "page");
  // The themes root itself is a real directory; the linked ancestor bypasses a root-only lstat.
  fs.symlinkSync(outside, path.join(root, "linked"));
  const sources = { siteDir: root, themesDir: path.join(root, "linked/themes"), mediaUploadsDir: null,
    skillsDir: path.join(root, "skills"), tovuVersion: "test",
    agentPlugins: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }) };
  await assert.rejects(collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: true, plugins: false, settings: false } }, { profile: "share" }), { code: "PLAN_STALE" });
});
