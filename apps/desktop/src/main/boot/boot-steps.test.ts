/**
 * @file Behaviour of `main.ts`'s launch steps (`boot-steps.ts`): the `userData` profile choice, the
 * bundled toolchain's warning copy, boot-mode choice, dev-fallback row upkeep and the legacy owner-store
 * start check (the toolchain mechanics and the two discovery cancellation lanes are tested in Jini's
 * `desktop-host/node-toolchain`). Replaces the source-text checks in
 * `main-user-data-wiring.test.ts`, `main-owner-store-wiring.test.ts` and `main-node-toolchain-wiring.test.ts`
 * that covered these statements.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUserDataDir, chooseBootMode, LEGACY_OWNER_STORE_FILES, prepareNodeToolchainEnv,
  settleDevFallbackRows, settleLegacyOwnerStoreOnStart,
} from "./boot-steps.ts";

function userData(env: Record<string, string | undefined>) {
  let current = "electron-default";
  const sets: string[] = [];
  const result = applyUserDataDir({
    env, defaultUserDataDir: "/Users/x/Library/Application Support/tovu-desktop",
    resolvePath: ({ dir }) => `/cwd/${dir}`,
    setUserDataDir: ({ dir }) => { sets.push(dir); current = dir; },
    getUserDataDir: () => current,
  });
  return { result, sets, env };
}

test("a blank profile override uses the normal profile without disabling desktop tools", () => {
  for (const value of [undefined, "", "   "]) {
    const u = userData({ TOVU_DESKTOP_USER_DATA_DIR: value });
    assert.deepEqual(u.sets, ["/Users/x/Library/Application Support/tovu-desktop"]);
    assert.equal(u.result.overridden, false);
    assert.equal(u.env.TOVU_DESKTOP_USER_DATA_DIR, undefined);
    assert.equal(Object.hasOwn(u.env, "TOVU_DESKTOP_USER_DATA_DIR"), false);
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
    warn: ({ message }) => warnings.push(message),
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
    ["migrate", { projectsPath: "/ud/projects.json", devFallbackDir: "/repo/sites/tovu-dev" }],
    ["seed", { projectsPath: "/ud/projects.json", devFallbackDir: "/repo/sites/tovu-dev", classifySiteDir: classify }],
    ["retire", { projectsPath: "/ud/projects.json", devFallbackDir: "/repo/sites/tovu-dev", classifySiteDir: classify }],
  ]);
});

// REGRESSION: a packaged app has no dev fallback; migrating `null` recorded a corrupt dismissal row.
test("dev-fallback rows: a packaged app (no dev fallback) touches nothing", () => {
  const never = () => assert.fail("no dev-fallback call without a dev fallback");
  assert.equal(settleDevFallbackRows({ projectsPath: "/p", devFallbackDir: null, classifySiteDir: never,
    migrateLegacyDismissals: never, seedDevFallbackSite: never, retireDevFallbackSite: never }), false);
});

function ownerStore() {
  const removed: string[] = [];
  const notices: unknown[] = [];
  const warnings: string[] = [];
  let captured: { removeFiles: () => void; notify: () => void; log: (required: { message: string }) => void } | undefined;
  const result = settleLegacyOwnerStoreOnStart({
    userDataDir: "/ud",
    settle: async (input) => { captured = input; return "settled"; },
    removeFile: ({ filePath }) => removed.push(filePath),
    showNotice: (notice) => notices.push(notice),
    warn: ({ message }) => warnings.push(message),
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
  o.ports().log({ message: "could not be checked" });
  assert.deepEqual(o.warnings, ["could not be checked"]);
});
