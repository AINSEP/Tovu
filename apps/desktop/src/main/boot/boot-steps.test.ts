/**
 * @file Behaviour of `main.ts`'s launch steps (`boot-steps.ts`): the `userData` profile choice, the
 * bundled toolchain's best-effort write, boot-mode choice, dev-fallback row upkeep, the two discovery
 * cancellation lanes and the legacy owner-store start check. Replaces the source-text checks in
 * `main-user-data-wiring.test.ts`, `main-owner-store-wiring.test.ts` and `main-node-toolchain-wiring.test.ts`
 * that covered these statements.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUserDataDir, chooseBootMode, createSiteDiscoveryLanes, LEGACY_OWNER_STORE_FILES, prepareNodeToolchainEnv,
  settleDevFallbackRows, settleLegacyOwnerStoreOnStart,
} from "./boot-steps.ts";

function userData(env: Record<string, string | undefined>) {
  let current = "electron-default";
  const sets: string[] = [];
  const result = applyUserDataDir({
    env, defaultUserDataDir: "/Users/x/Library/Application Support/tovu-desktop",
    resolvePath: (dir) => `/cwd/${dir}`,
    setUserDataDir: (dir) => { sets.push(dir); current = dir; },
    getUserDataDir: () => current,
  });
  return { result, sets, env };
}

test("a real launch uses the packaged/dev default profile and leaves the env untouched", () => {
  for (const value of [undefined, "", "   "]) {
    const u = userData({ TOVU_DESKTOP_USER_DATA_DIR: value });
    assert.deepEqual(u.sets, ["/Users/x/Library/Application Support/tovu-desktop"]);
    assert.equal(u.result.overridden, false);
    assert.equal(u.env.TOVU_DESKTOP_USER_DATA_DIR, value);
  }
});

test("an E2E override wins, is trimmed and resolved, and the resolved path is exported for CLI children", () => {
  const u = userData({ TOVU_DESKTOP_USER_DATA_DIR: "  scratch/profile  " });
  assert.deepEqual(u.sets, ["/cwd/scratch/profile"]);
  assert.equal(u.result.overridden, true);
  assert.equal(u.env.TOVU_DESKTOP_USER_DATA_DIR, "/cwd/scratch/profile", "a relative override must not change meaning in another cwd");
});

function toolchain(write: () => { toolchainDir: string } | null) {
  const warnings: string[] = [];
  const builds: unknown[] = [];
  const writes: unknown[] = [];
  const env = prepareNodeToolchainEnv({
    userDataDir: "/ud", electronPath: "/Tovu.app/Tovu", npmRoot: "/npm",
    writeNodeToolchain: (input) => { writes.push(input); return write(); },
    buildNodeToolchainEnv: (input) => { builds.push(input); return { TOVU_NODE_TOOLCHAIN_DIR: input.toolchainDir, TOVU_BUNDLED_NPM_ROOT: input.npmRoot }; },
    warn: (m) => warnings.push(m),
  });
  return { env, warnings, builds, writes };
}

test("a written toolchain yields its env contract", () => {
  const t = toolchain(() => ({ toolchainDir: "/ud/node-toolchain" }));
  assert.deepEqual(t.writes, [{ userDataDir: "/ud", electronPath: "/Tovu.app/Tovu", npmRoot: "/npm" }]);
  assert.deepEqual(t.env, { TOVU_NODE_TOOLCHAIN_DIR: "/ud/node-toolchain", TOVU_BUNDLED_NPM_ROOT: "/npm" });
  assert.deepEqual(t.warnings, []);
});

test("a disk-image launch turns the toolchain off with a move-to-Applications hint", () => {
  const t = toolchain(() => null);
  assert.equal(t.env, undefined);
  assert.deepEqual(t.builds, []);
  assert.match(t.warnings[0]!, /running from a disk image .* move Tovu to Applications/);
});

test("a failed write degrades to no toolchain and never throws", () => {
  const t = toolchain(() => { throw new Error("EROFS"); });
  assert.equal(t.env, undefined);
  assert.match(t.warnings[0]!, /could not write the bundled node toolchain .*: EROFS$/);
});

test("boot mode: sites home by default; attach for a URL; own server for pinned site dirs", () => {
  assert.deepEqual(chooseBootMode({ env: {} }), { kind: "sites-home" });
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_URL: " http://localhost:5173 " } }), { kind: "attach", url: "http://localhost:5173" });
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_SITE_DIR: "/a" } }), { kind: "own-server" });
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_SITE_DIRS: "/a,/b" } }), { kind: "own-server" });
});

test("boot mode: an explicit runner UI beats both attach and pinned dirs", () => {
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_UI: "runner", TOVU_DESKTOP_URL: "http://x", TOVU_DESKTOP_SITE_DIR: "/a" } }), { kind: "sites-home" });
});

test("boot mode: attach wins over a pinned site dir; a blank URL is not attach", () => {
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_URL: "http://x", TOVU_DESKTOP_SITE_DIR: "/a" } }), { kind: "attach", url: "http://x" });
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_URL: "   ", TOVU_DESKTOP_SITE_DIR: "/a" } }), { kind: "own-server" });
  assert.deepEqual(chooseBootMode({ env: { TOVU_DESKTOP_URL: "   " } }), { kind: "sites-home" }, "a blank URL does not bypass sites home");
});

test("dev-fallback rows: migrate dismissals, then seed, then retire — all with the safe classifier", () => {
  const calls: unknown[][] = [];
  const classify = (dir: string) => `verdict:${dir}`;
  const ran = settleDevFallbackRows({
    projectsPath: "/ud/projects.json", devFallbackDir: "/repo/sites/tovu-dev", classifySiteDir: classify,
    migrateLegacyDismissals: (...args) => calls.push(["migrate", ...args]),
    seedDevFallbackSite: (...args) => calls.push(["seed", ...args]),
    retireDevFallbackSite: (...args) => calls.push(["retire", ...args]),
  });
  assert.equal(ran, true);
  assert.deepEqual(calls, [
    ["migrate", "/ud/projects.json", "/repo/sites/tovu-dev"],
    ["seed", "/ud/projects.json", "/repo/sites/tovu-dev", classify],
    ["retire", "/ud/projects.json", "/repo/sites/tovu-dev", classify],
  ]);
});

// REGRESSION: a packaged app has no dev fallback; migrating `null` recorded a corrupt dismissal row.
test("dev-fallback rows: a packaged app (no dev fallback) touches nothing", () => {
  const never = () => assert.fail("no dev-fallback call without a dev fallback");
  assert.equal(settleDevFallbackRows({ projectsPath: "/p", devFallbackDir: null, classifySiteDir: never,
    migrateLegacyDismissals: never, seedDevFallbackSite: never, retireDevFallbackSite: never }), false);
});

function lanes() {
  const signals: { scanRoots: string[] | undefined; signal: AbortSignal }[] = [];
  const l = createSiteDiscoveryLanes({ discover: async (input) => { signals.push(input); return signals.length; } });
  return { l, signals };
}

test("a new rescan aborts the previous rescan but not a running picker validation", async () => {
  const { l, signals } = lanes();
  assert.equal(await l.discoverSites({}), 1);
  await l.discoverSites({ scanRoots: ["/picked"] });
  await l.discoverSites({});
  const [rescan1, validation, rescan2] = signals;
  assert.equal(rescan1!.scanRoots, undefined);
  assert.deepEqual(validation!.scanRoots, ["/picked"]);
  assert.equal(rescan1!.signal.aborted, true);
  assert.equal(validation!.signal.aborted, false);
  assert.equal(rescan2!.signal.aborted, false);
});

test("a new picker validation aborts the previous validation but not a running rescan", async () => {
  const { l, signals } = lanes();
  await l.discoverSites({});
  await l.discoverSites({ scanRoots: ["/a"] });
  await l.discoverSites({ scanRoots: ["/b"] });
  assert.deepEqual(signals.map((s) => s.signal.aborted), [false, true, false]);
});

test("before-quit aborts the live scan of both lanes; with none started it is a no-op", async () => {
  const empty = lanes();
  assert.doesNotThrow(() => empty.l.abortAll());
  const { l, signals } = lanes();
  await l.discoverSites({});
  await l.discoverSites({ scanRoots: ["/a"] });
  l.abortAll();
  assert.deepEqual(signals.map((s) => s.signal.aborted), [true, true]);
});

function ownerStore() {
  const removed: string[] = [];
  const notices: unknown[] = [];
  const warnings: string[] = [];
  let captured: { removeFiles: () => void; notify: () => void; log: (m: string) => void } | undefined;
  const result = settleLegacyOwnerStoreOnStart({
    userDataDir: "/ud",
    settle: async (input) => { captured = input; return "settled"; },
    removeFile: (file) => removed.push(file),
    showNotice: (notice) => notices.push(notice),
    warn: (m) => warnings.push(m),
  });
  return { result, removed, notices, warnings, ports: () => captured! };
}

test("an empty legacy store loses exactly its four files under this launch's userData", async () => {
  const o = ownerStore();
  assert.equal(await o.result, "settled");
  assert.deepEqual(o.removed, []);
  o.ports().removeFiles();
  assert.deepEqual(o.removed, ["/ud/owner.db", "/ud/owner.db-wal", "/ud/owner.db-shm", "/ud/owner.key"]);
  assert.deepEqual([...LEGACY_OWNER_STORE_FILES], ["owner.db", "owner.db-wal", "owner.db-shm", "owner.key"]);
});

test("a store holding keys gets the native import notice; check failures are logged as warnings", () => {
  const o = ownerStore();
  o.ports().notify();
  assert.deepEqual(o.notices, [{ type: "info", message: "Shared keys from an older version can be imported",
    detail: "Open Shared keys and choose Import from this computer. You see what imports before anything changes." }]);
  o.ports().log("could not be checked");
  assert.deepEqual(o.warnings, ["could not be checked"]);
});
