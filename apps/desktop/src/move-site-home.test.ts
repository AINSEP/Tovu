import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moveSiteHome, parseMovedSiteDestination } from "./move-site-home.ts";
import { buildCliSpawnPlan } from "./tovu-server.ts";

/** Real entry paths satisfy the spawn owner's admission without executing either CLI. */
function fixture({ t }: { t: TestContext }, _options = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-move-cli-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const source = path.join(repoRoot, "apps", "website", "src", "cli", "main.ts");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "");
  fs.mkdirSync(path.join(repoRoot, "dist"));
  fs.writeFileSync(path.join(repoRoot, "dist", "cli.js"), "");
  fs.writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({ bin: { tovu: "dist/cli.js" } }));
  return { dir: "/users/a/Documents/Tovu/sites/alpha", repoRoot, cliMode: "source" as const, projectsPath: "/profile/desktop-projects.json" };
}
for (const cliMode of ["source", "compiled"] as const) test(`desktop uses the ${cliMode} CLI move owner and forwards its profile without credentials`, async (t) => {
  const input = { ...fixture({ t }), cliMode };
  const calls: unknown[] = [];
  const to = "/users/a/Documents/Tovu/alpha";
  const result = await moveSiteHome(input, { baseEnv: { TOVU_ADMIN_PASSWORD: "private", TOVU_SITES_HOME: "/custom" }, execute: async (command, args, options) => {
    calls.push([command, args]); assert.equal(options?.env?.TOVU_ADMIN_PASSWORD, undefined);
    assert.equal(options?.env?.TOVU_SITE_DIR, input.dir); assert.equal(options?.env?.TOVU_SITES_HOME, "/custom");
    assert.equal(options?.timeout, 1_200_000);
    return { ok: true, error: null, code: 0, stdout: JSON.stringify({ to }), stderr: "" };
  } });
  const plan = buildCliSpawnPlan({ repoRoot: input.repoRoot, cliMode: input.cliMode, cliArgs: ["sites", "move-home", input.dir, "--projects-path", input.projectsPath] });
  assert.deepEqual(calls, [[plan.command, plan.args]]); assert.equal(result, to);
  assert.ok(plan.args.includes(path.join(input.repoRoot, cliMode === "source" ? "apps/website/src/cli/main.ts" : "dist/cli.js")));
});
test("CLI running-site refusals reach the desktop without invoking a stop", async (t) => {
  const input = fixture({ t });
  await assert.rejects(moveSiteHome(input, { execute: async () => ({ ok: false, error: new Error("failed"), code: 1, stdout: "", stderr: "Stop this site before moving it." }) }), /Stop this site before moving it/);
});
test("a CLI failure with no stderr reports the spawn error, and a bare failure a generic refusal", async (t) => {
  const input = fixture({ t });
  await assert.rejects(moveSiteHome(input, { execute: async () => ({ ok: false, error: new Error("spawn ENOENT"), code: null, stdout: "", stderr: "" }) }), { message: "spawn ENOENT" });
  await assert.rejects(moveSiteHome(input, { execute: async () => ({ ok: false, error: null, code: 1, stdout: "", stderr: "" }) }), { message: "Could not move the stopped site." });
});
test("a missing destination contract is rejected", async (t) => {
  const input = fixture({ t });
  await assert.rejects(moveSiteHome(input, { execute: async () => ({ ok: true, error: null, code: 0, stdout: "{}", stderr: "" }) }), /no destination/);
});

test("move destination parser reads exactly the final line and preserves its string", () => {
  assert.equal(parseMovedSiteDestination({ stdout: 'progress\n{"to":"/sites/alpha"}' }), "/sites/alpha");
  assert.equal(parseMovedSiteDestination({ stdout: 'progress\r\n{"to":"  /sites/alpha  "}' }), "  /sites/alpha  ");
  assert.equal(parseMovedSiteDestination({ stdout: '{"to":""}' }), "");
  // A lone "\r" is not a line break: only "\n" (optionally preceded by "\r") ends a line.
  assert.throws(() => parseMovedSiteDestination({ stdout: 'progress\r{"to":"/sites/alpha"}' }), SyntaxError);
  for (const stdout of ['{}', '{"to":null}', '{"to":42}']) {
    assert.throws(() => parseMovedSiteDestination({ stdout }), /Site move returned no destination/);
  }
  for (const stdout of ["", "not json", '{"to":"/sites/alpha"}\n']) {
    assert.throws(() => parseMovedSiteDestination({ stdout }), SyntaxError);
  }
  assert.throws(() => parseMovedSiteDestination({ stdout: "null" }), TypeError);
});
