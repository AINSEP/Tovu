import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";
import { renameSiteFolder, type MovePlan } from "../../move-sites-home.js";
import { createSitesWorkspace, type SitesWorkspace } from "../../sites-home.js";

/** The rename adapter delegates all relocation effects to the existing stopped-site owner.
 * Every filesystem/workspace/effect is fake: these tests never inspect the user's home.
 */
function fixture() {
  const home = path.resolve("/fake-home/Documents/Tovu");
  const calls: string[] = [];
  const workspace = { home: () => { calls.push("home"); return home; } } as unknown as SitesWorkspace;
  let directory = true;
  let running: DirectoryRunningRecord | null = null;
  let planFailure: Error | undefined;
  let moveFailure: Error | undefined;
  let receivedPlan: MovePlan | undefined;
  const filesystem = {
    realpathSync: (dir: fs.PathLike) => { assert.equal(dir, home); return home; },
    lstatSync: (dir: fs.PathLike) => {
      assert.equal(dir, path.join(home, "old-site"));
      return { isDirectory: () => directory };
    },
  } as unknown as Pick<typeof fs, "lstatSync" | "realpathSync">;
  const planMove = (input: { from: string; to: string; workspace: SitesWorkspace }): MovePlan => {
    calls.push("plan");
    assert.equal(input.workspace, workspace);
    assert.equal(input.from, path.join(home, "old-site"));
    assert.equal(input.to, path.join(home, "new-site"));
    if (planFailure) throw planFailure;
    return { from: input.from, to: input.to, id: "stable-id", name: "Keep this display title", databases: [], running };
  };
  const moveSite = async (input: { plan: MovePlan; workspace: SitesWorkspace }, ports: {
    relocateDirectory: unknown; verifyDatabase: unknown;
  }) => {
    calls.push("move");
    assert.equal(input.workspace, workspace);
    assert.equal(typeof ports.relocateDirectory, "function");
    assert.equal(typeof ports.verifyDatabase, "function");
    if (moveFailure) throw moveFailure;
    receivedPlan = input.plan;
  };
  return { home, calls, options: { workspace, filesystem, planMove, moveSite },
    setDirectory: (value: boolean) => { directory = value; },
    setRunning: (value: DirectoryRunningRecord) => { running = value; },
    failPlan: (error: Error) => { planFailure = error; },
    failMove: (error: Error) => { moveFailure = error; },
    plan: () => receivedPlan,
  };
}

const input = { oldName: "old-site", newName: "new-site" };

test("renames within the configured home through the verified mover, preserving identity/title", async () => {
  const f = fixture();
  assert.deepEqual(await renameSiteFolder(input, f.options), {
    from: path.join(f.home, "old-site"), to: path.join(f.home, "new-site"),
  });
  assert.deepEqual(f.calls, ["home", "plan", "move"]);
  assert.equal(f.plan()?.id, "stable-id");
  assert.equal(f.plan()?.name, "Keep this display title");
});

for (const name of ["", "..", "../escape", "a/b", "a\\b", "C:escape", "a.", "a ", "con", "nul", "com1", "lpt9"]) {
  test(`refuses unsafe/Windows-reserved destination ${JSON.stringify(name)} before workspace I/O`, async () => {
    const f = fixture();
    await assert.rejects(renameSiteFolder({ ...input, newName: name }, f.options));
    assert.deepEqual(f.calls, []);
  });
}

test("refuses an unsafe source name before resolving the home", async () => {
  const f = fixture();
  await assert.rejects(renameSiteFolder({ ...input, oldName: "../other" }, f.options));
  assert.deepEqual(f.calls, []);
});

test("refuses symlink/file source entries before planning or moving", async () => {
  const f = fixture();
  f.setDirectory(false);
  await assert.rejects(renameSiteFolder(input, f.options), /real directory/);
  assert.deepEqual(f.calls, ["home"]);
});

for (const port of [0, 3001]) {
  test(`refuses a live lease at port ${port}, including a site still starting`, async () => {
    const f = fixture();
    f.setRunning({ pid: 123, port, app: "Web", started: "", token: "lease", scheme: "http" });
    await assert.rejects(renameSiteFolder(input, f.options), /Site is running in Web/);
    assert.deepEqual(f.calls, ["home", "plan"]);
  });
}

for (const message of ["Move target already exists", "Invalid site metadata", "Running lock unreadable", "Database move target already exists"]) {
  test(`preserves the planner's refusal without moving: ${message}`, async () => {
    const f = fixture();
    const error = new Error(message);
    f.failPlan(error);
    await assert.rejects(renameSiteFolder(input, f.options), (actual) => actual === error);
    assert.deepEqual(f.calls, ["home", "plan"]);
  });
}

test("propagates a failed verified move/registry commit without reporting success", async () => {
  const f = fixture();
  const error = new Error("registry relocation failed; mover rolled back");
  f.failMove(error);
  await assert.rejects(renameSiteFolder(input, f.options), (actual) => actual === error);
  assert.equal(f.plan(), undefined);
});

/** Real temp home: the folder move and Jini's registry relocate commit together or not at all. */
function realSite() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-rename-")));
  fs.mkdirSync(path.join(root, "Documents"));
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: path.join(root, "repo"), env: {}, platform: "linux" });
  const from = path.join(workspace.home({}), "old-site"), to = path.join(workspace.home({}), "new-site");
  fs.mkdirSync(from, { recursive: true });
  fs.writeFileSync(path.join(from, "config.json"), JSON.stringify({ name: "Old Title", domain: null, port: null }));
  fs.writeFileSync(path.join(from, ".site-meta.json"), JSON.stringify({ siteId: "old-id", templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-24" }));
  workspace.registry({}).merge({ entries: [{ id: "old-id", name: "Old Title", path: from, createdBy: "Desktop", lastOpened: "2026-10-24T00:00:00Z" }] });
  return { workspace, from, to, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("a real rename moves the folder and repoints the registry entry, keeping its fields", async () => {
  const f = realSite();
  try {
    await renameSiteFolder(input, { workspace: f.workspace });
    assert.equal(fs.existsSync(f.from), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.to, "config.json"), "utf8")).name, "Old Title");
    assert.deepEqual(f.workspace.registry({}).list({}), [{ id: "old-id", name: "Old Title", path: f.to, createdBy: "Desktop", lastOpened: "2026-10-24T00:00:00Z" }]);
  } finally { f.cleanup(); }
});

test("a refused registry relocate rolls the folder back, leaving no half-renamed site", async () => {
  const f = realSite();
  try {
    f.workspace.registry({}).merge({ entries: [{ id: "other-id", name: "Other", path: f.to, createdBy: "Desktop", lastOpened: null }] });
    const before = f.workspace.registry({}).list({});
    await assert.rejects(renameSiteFolder(input, { workspace: f.workspace }), /overwrite a registered directory/);
    assert.equal(fs.existsSync(path.join(f.from, ".site-meta.json")), true);
    assert.equal(fs.existsSync(f.to), false);
    assert.deepEqual(f.workspace.registry({}).list({}), before);
  } finally { f.cleanup(); }
});
