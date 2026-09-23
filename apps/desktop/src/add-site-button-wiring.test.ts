/**
 * @file The "Add Tovu Website" button, proven end to end on this side of the wire: from the channel
 * string the PRELOAD actually sends, through the real registered IPC handler, to a real pointer row
 * in a real registry file on disk.
 *
 * Every other test in this feature covers one link. The hook's tests cover the renderer half, the
 * `project-ipc.test.ts` tests call `handleAddSite` directly, and `add-site-pointer.test.ts` covers
 * the shared implementation. None of them would catch the single most likely wiring defect: the
 * button invoking a channel nothing is registered on. That is a silent failure — `ipcRenderer.invoke`
 * on an unhandled channel rejects with "No handler registered", which the operator sees as a button
 * that does nothing in particular.
 *
 * **So the channel is READ OUT OF THE PRELOAD rather than restated here.** A literal typed into this
 * file would prove the handler works on the string this test believes in, which is exactly the
 * belief under question. Parsing the preload means a rename on either side fails this test.
 *
 * What this does NOT prove, stated plainly: Electron's own IPC transport and structured-clone
 * serialization are not exercised, because that needs a real Electron process. The chain is closed
 * from the preload's channel name down; the hop above it is covered by
 * `renderer/use-add-site.hooks.test.ts` asserting the hook calls `bridge.addSite()`, and by the
 * preload exposing `addSite` on that same channel.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerSiteIpcHandlers } from "./project-ipc.ts";
import type { ProjectIpcDeps } from "./project-ipc.ts";
import { addSitePointer } from "./add-site-pointer.ts";
import { SITE_ORIGIN, sitesFilePath, readTrackedSites } from "./tracked-sites.ts";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import { readRegistry, isLiveServeRow, registryDirPath } from "./site-process-registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-add-button-"));
}

function siteFixture(name = "existing-site") {
  const dir = path.join(tempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: `id-${name}` }));
  return dir;
}

/**
 * The channel `window.tovuRunner.addSite()` invokes, read from the preload's own source.
 *
 * Resolved in two steps because the preload names the channel through the contract object: find
 * which `SITE_IPC_CHANNELS` key `addSite` invokes, then read that key's literal out of
 * `contracts/project.ts`. Both files are therefore load-bearing for this test, which is the point —
 * the button's channel is only correct if the preload, the contract and the handler all agree.
 */
function channelTheButtonInvokes() {
  const preload = fs.readFileSync(path.join(here, "preload", "preload.mts"), "utf8");
  const invoke = /addSite:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(SITE_IPC_CHANNELS\.(\w+)\)/.exec(preload);
  assert.ok(invoke, "the preload does not expose addSite over SITE_IPC_CHANNELS");

  const contracts = fs.readFileSync(path.join(here, "contracts", "project.ts"), "utf8");
  const literal = new RegExp(`${invoke[1]}:\\s*'([^']+)'`).exec(contracts);
  assert.ok(literal, `contracts/project.ts declares no literal for SITE_IPC_CHANNELS.${invoke[1]}`);
  return literal[1]!; // the pattern's one capturing group matched — assert.ok(literal) above proved the regex matched
}

/**
 * Register the real handlers against a fake `ipcMain` and return the one the button's channel got,
 * plus the registry path it writes to and a record of what the folder dialog was asked.
 *
 * `addSitePointer`, `classifySiteDirSafely`, `readTrackedSites` and the registry file are all
 * REAL — the only fakes are `ipcMain` (a Map) and the folder dialog (which cannot be driven
 * headlessly). A test that also faked the adder would prove the wiring reaches a stub.
 */
function registerRealHandlers(pickedPath: string | null) {
  const handlers = new Map<string, Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]>();
  const shown: Array<Parameters<ProjectIpcDeps["dialog"]["showOpenDialog"]>[0]> = [];
  const userDataDir = tempDir();
  const projectsPath = sitesFilePath(userDataDir);

  registerSiteIpcHandlers({
    ipcMain: { handle: (channel: string, handler: Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]) => handlers.set(channel, handler) },
    dialog: {
      showOpenDialog: async (options: Parameters<ProjectIpcDeps["dialog"]["showOpenDialog"]>[0]) => {
        shown.push(options);
        return pickedPath === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [pickedPath] };
      },
    },
    shell: { openExternal: async () => {} },
    openSites: new Map(),
    serializer: { run: (_key: string, fn: () => unknown) => fn() },
    projectsPath,
    registryPath: registryDirPath(userDataDir),
    repoRoot: "/repo",
    statePath: path.join(userDataDir, "desktop-state.json"),
    cliMode: "source",
    readSiteName: (siteDir: string) => path.basename(siteDir),
    readPreviewVersion: () => null,
    adoptSiteDir: async () => assert.fail("adoptSiteDir must not be reached — it inits empty folders"),
    classifySiteDir: classifySiteDirSafely,
    addSitePointer,
    openSiteServer: async () => {},
    recordSiteClosed: () => {},
    readRegistry,
    isLiveServeRow,
    siteScanRoots: [],
    recentSiteDirs: () => [],
    ctx: {},
    // `writeSiteName`/`readPreviewDataUrl`/`deletePreview` are absent — this suite never renames,
    // fetches, or drops a preview, and the pre-migration JS never had to supply them either.
  } as unknown as ProjectIpcDeps);

  return { handlers, shown, projectsPath };
}

test("the preload, the contract and the handler all agree on the button's channel", () => {
  const channel = channelTheButtonInvokes();
  const { handlers } = registerRealHandlers(siteFixture());

  // The defect this catches: a button wired to a channel nothing handles. `ipcRenderer.invoke`
  // rejects with "No handler registered", which reaches the operator as a button that does nothing
  // they can interpret.
  assert.ok(handlers.has(channel), `no handler is registered on '${channel}'`);
  assert.equal(channel, "runner:sites:add-site");
});

test("CLICKING the button adds a pointer for an existing site folder", async () => {
  const siteDir = siteFixture("my-real-website");
  const { handlers, projectsPath } = registerRealHandlers(siteDir);
  const before = fs.readdirSync(siteDir).sort();

  // Invoked exactly as Electron would: the handler for the preload's channel, with an event object
  // and no argument (main owns the dialog).
  const record = await handlers.get(channelTheButtonInvokes())!({}); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above

  // 1. The renderer gets a usable record back, so the card can render without a second round trip.
  assert.equal(record.id, siteDir);
  assert.equal(record.installDir, siteDir);
  assert.equal(record.displayName, "my-real-website");
  // 2. A POINTER is on disk — read back through the same reader the Projects screen uses.
  const rows = readTrackedSites(projectsPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.siteDir, siteDir); // just asserted rows.length === 1 above, so index 0 exists
  // 3. `adopted`, so a later delete can never erase someone else's website.
  assert.equal(rows[0]!.origin, SITE_ORIGIN.adopted); // just asserted rows.length === 1 above, so index 0 exists
  assert.equal(record.deleteErasesFiles, false);
  // 4. Pointer semantics, proven rather than promised: the folder is byte-for-byte as it was found.
  assert.deepEqual(fs.readdirSync(siteDir).sort(), before);
});

test("CLICKING the button REFUSES an empty folder and creates nothing in it", async () => {
  const empty = path.join(tempDir(), "fresh");
  fs.mkdirSync(empty);
  const { handlers, projectsPath } = registerRealHandlers(empty);

  await assert.rejects(() => handlers.get(channelTheButtonInvokes())!({}), /no Tovu site here to add/); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above

  // The refusal names the fix, which is what the renderer surfaces verbatim.
  await assert.rejects(() => handlers.get(channelTheButtonInvokes())!({}), /Create website/); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above
  // No site was initialized — the exact difference from "Create website", which WOULD init here.
  assert.deepEqual(fs.readdirSync(empty), []);
  assert.deepEqual(readTrackedSites(projectsPath), []);
});

test("CLICKING the button REFUSES a folder of unrelated files and an incomplete site", async () => {
  const occupied = path.join(tempDir(), "documents");
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "taxes.pdf"), "x");
  const incomplete = path.join(tempDir(), "half");
  fs.mkdirSync(incomplete);
  fs.writeFileSync(path.join(incomplete, "config.json"), "{}");

  const first = registerRealHandlers(occupied);
  await assert.rejects(() => first.handlers.get(channelTheButtonInvokes())!({}), /folder of unrelated files/); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above
  const second = registerRealHandlers(incomplete);
  await assert.rejects(() => second.handlers.get(channelTheButtonInvokes())!({}), /half-initialized or damaged/); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above

  assert.deepEqual(readTrackedSites(first.projectsPath), []);
  assert.deepEqual(readTrackedSites(second.projectsPath), []);
  assert.deepEqual(fs.readdirSync(occupied), ["taxes.pdf"]);
  assert.deepEqual(fs.readdirSync(incomplete), ["config.json"]);
});

test("the button's dialog cannot create the folder it is about to refuse", async () => {
  const { handlers, shown } = registerRealHandlers(siteFixture());

  await handlers.get(channelTheButtonInvokes())!({}); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above

  // `handleCreate` passes `createDirectory` deliberately; this must not. A folder made in the
  // dialog is empty by definition, and empty is exactly what this verb refuses.
  assert.deepEqual(shown[0]!.properties, ["openDirectory"]); // this test's own call above pushed exactly one entry
});

test("a cancelled dialog rejects and writes nothing", async () => {
  const { handlers, projectsPath } = registerRealHandlers(null);

  await assert.rejects(() => handlers.get(channelTheButtonInvokes())!({}), /No folder was chosen/); // registerSiteIpcHandlers always registers this exact channel — proven by the first test above

  assert.deepEqual(readTrackedSites(projectsPath), []);
});
