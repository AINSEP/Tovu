/**
 * @file Tests for `stage-payload-run.ts` — the payload staging orchestration behind
 * `scripts/stage-payload.ts`. Each test builds a REAL temporary checkout (a `dist/` with its
 * runtime manifest, the two SPA shells, a hoisted `node_modules` with an `@jini-ai/core` link into a
 * Jini packages tree, migrations) and stages it with the real filesystem. The heavyweight lib steps
 * that are tested on their own in `stage-payload-lib.test.ts` (strip, prune, closure, bundled npm,
 * disk size) are hand-written fakes that record what they were asked to do, so every refusal path
 * can be driven deliberately. A CLI test also runs the script itself as a child.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as realFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { getFileMatchers, copyFiles } from "app-builder-lib/out/fileMatcher.js";

import { STAGED_SHELLS, stageDir, stagePayloadFiles, stageTransitiveDependencies, assertClosureComplete, declaredDependencies } from "./stage-payload-lib.ts";
import { resolveStageRoot, runStagePayload, stagePayloadCli, StagePayloadError } from "./stage-payload-run.ts";
import type { ShellEntry, StagePorts, StageSteps } from "./stage-payload-run.ts";

const { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } = realFs;
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MB = 1048576;

function write(file: string, content = ""): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A complete, stageable checkout under `<tmp>/repo`, a Jini tree under `<tmp>/jini`, and `<tmp>/desktop`. */
function fixture() {
  // Real path: staging resolves the Jini link, and macOS's tmpdir `/var` is a link to `/private/var`.
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "stage-payload-run-")));
  const repo = path.join(tmp, "repo");
  const desktop = path.join(tmp, "desktop");
  write(path.join(repo, "package.json"), JSON.stringify({ bin: { tovu: "dist/cli.js" }, dependencies: { "dep-a": "1", "better-sqlite3": "1", "playwright": "1", "@playwright/test": "1", "@jini-ai/core": "1" } }));
  write(path.join(repo, "dist", "runtime-manifest.json"), JSON.stringify({ cliEntry: "dist/cli.js" }));
  write(path.join(repo, "dist", "cli.js"), "cli");
  write(path.join(repo, "dist", "src", "platform", "db", "drizzle", "0001.sql"));
  write(path.join(repo, "apps", "website", "src", "platform", "db", "drizzle", "0001.sql"));
  write(path.join(repo, "apps", "website", "src", "platform", "db", "drizzle", "meta.json"));
  write(path.join(repo, "apps", "admin", "dist", "index.html"), "admin");
  write(path.join(repo, "apps", "site-chat", "dist", "site-assistant.js"), "chat");
  write(path.join(repo, "packages", "sdk", "package.json"), JSON.stringify({ name: "@tovu/sdk" }));
  mkdirSync(path.join(repo, "packages", "notes"), { recursive: true });
  write(path.join(repo, "node_modules", "dep-a", "package.json"), JSON.stringify({ dependencies: { nested: "1" } }));
  write(path.join(repo, "node_modules", "dep-a", "node_modules", "nested", "package.json"), "{}");
  write(path.join(repo, "node_modules", "dep-a", "index.js"), "a");
  write(path.join(repo, "node_modules", "dep-a", "node_modules", "nested", "index.js"), "nested");
  write(path.join(repo, "node_modules", "better-sqlite3", "package.json"), "{}");
  write(path.join(repo, "node_modules", "playwright", "package.json"), "{}");
  write(path.join(repo, "node_modules", "better-sqlite3", "index.js"), "sqlite");
  write(path.join(repo, "node_modules", "playwright", "index.js"), "driver");
  write(path.join(repo, "node_modules", "@playwright", "test", "index.js"), "excluded");
  write(path.join(tmp, "jini", "packages", "core", "package.json"), JSON.stringify({ name: "@jini-ai/core", peerDependencies: { "@jini-ai/platform": "1" } }));
  write(path.join(tmp, "jini", "packages", "core", "node_modules", "pnpm-farm", "x.js"), "farm");
  write(path.join(tmp, "jini", "packages", "platform", "package.json"), JSON.stringify({ name: "@jini-ai/platform" }));
  mkdirSync(path.join(tmp, "jini", "packages", "docs"), { recursive: true });
  mkdirSync(path.join(repo, "node_modules", "@jini-ai"), { recursive: true });
  symlinkSync(path.join(tmp, "jini", "packages", "core"), path.join(repo, "node_modules", "@jini-ai", "core"));
  mkdirSync(path.join(tmp, "jini", "node_modules", "@jini-ai"), { recursive: true });
  symlinkSync(path.join(tmp, "jini", "packages", "platform"), path.join(tmp, "jini", "node_modules", "@jini-ai", "platform"));
  // An outward link and a dangling link, as a transitive copy can leave them.
  write(path.join(tmp, "elsewhere", "linked-pkg", "index.js"), "linked");
  const outDir = path.join(desktop, "staging", "tovu-payload");
  return { tmp, repo, desktop, outDir, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

type Fixture = ReturnType<typeof fixture>;

function harness(fx: Fixture, overrides: { steps?: Partial<StageSteps>; ports?: Partial<StagePorts> } = {}) {
  const out: string[] = [];
  const calls: Record<string, unknown[]> = {};
  const record = (name: string, value: unknown) => (calls[name] ??= []).push(value);
  const steps: StageSteps = {
    declaredDependencies,
    stagePayloadFiles,
    stageDir,
    stageTransitiveDependencies({ roots, outDir }) {
      record("transitive", roots);
      const count = stageTransitiveDependencies({ roots, outDir });
      symlinkSync(path.join(fx.tmp, "elsewhere", "linked-pkg"), path.join(outDir, "node_modules", "linked-pkg"));
      symlinkSync(path.join(fx.tmp, "nowhere"), path.join(outDir, "node_modules", "dangling"));
      return count + 2;
    },
    stripNonRuntimeFiles: ({ outDir }) => { record("strip", outDir); return { declaration: 4, sourceMap: 3, coverage: 1, bytes: 2 * MB }; },
    pruneNativePrebuilds: ({ targets }) => { record("prune", targets); return { prebuilds: 6, buildInputs: 2, bytes: 3 * MB }; },
    assertClosureComplete: ({ outDir }) => { record("closure", outDir); },
    assertDistImportsDeclared: (input) => { record("imports", input); },
    stageBundledNpm: (input) => { record("npm", input); return { fileCount: 1962, bytes: 5 * MB }; },
    diskBytes: () => 10 * MB,
    newestMtime: (abs) => (abs.endsWith(".html") || abs.endsWith(".js") ? 200 : 100),
    ...overrides.steps,
  };
  const ports: StagePorts = {
    fs: realFs,
    steps,
    shells: STAGED_SHELLS,
    env: { TOVU_TARGET_ARCH: "universal" },
    host: { execPath: "/bin/node", platform: "darwin", arch: "arm64" },
    stdout: { write: (text: string) => out.push(text) },
    ...overrides.ports,
  };
  const run = () => runStagePayload({ repoRoot: fx.repo, desktopDir: fx.desktop }, ports);
  return { ports, out, calls, run };
}

function refusal(run: () => void, message: string | RegExp): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof StagePayloadError, String(error));
    if (typeof message === "string") assert.equal(error.message, message);
    else assert.match(error.message, message);
    return true;
  });
}

test("stages the payload, the dependency closure and the Jini packages, and reports every tally", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const { out, calls, run } = harness(fx);
  run();
  const modules = path.join(fx.outDir, "node_modules");
  for (const file of ["package.json", "dist/cli.js", "apps/admin/dist/index.html", "apps/site-chat/dist/site-assistant.js"]) {
    assert.ok(existsSync(path.join(fx.outDir, file)), file);
  }
  assert.equal(readFileSync(path.join(modules, "dep-a", "node_modules", "nested", "index.js"), "utf8"), "nested");
  assert.ok(existsSync(path.join(modules, "better-sqlite3", "index.js")));
  // Rendered fetch and screenshots need the driver; only Playwright test tooling is excluded.
  assert.equal(readFileSync(path.join(modules, "playwright", "index.js"), "utf8"), "driver");
  assert.ok(!existsSync(path.join(modules, "@playwright", "test")), "an EXCLUDED package never ships");
  assert.ok(!existsSync(path.join(modules, "not-installed")));
  // Declared Jini packages and required peers are flat, without their pnpm symlink farm.
  assert.ok(existsSync(path.join(modules, "@jini-ai", "core", "package.json")));
  assert.ok(!existsSync(path.join(modules, "@jini-ai", "core", "node_modules")));
  assert.ok(existsSync(path.join(modules, "@jini-ai", "platform", "package.json")));
  assert.deepEqual(calls.transitive, [[
    path.join(fx.repo, "packages/sdk"), path.join(fx.repo, "node_modules/dep-a"),
    path.join(fx.repo, "node_modules/better-sqlite3"), path.join(fx.repo, "node_modules/playwright"),
    path.join(fx.tmp, "jini/packages/core"),
  ]]);
  // The outward link is now a real directory; the dangling one is gone.
  assert.ok(lstatSync(path.join(modules, "linked-pkg")).isDirectory());
  assert.equal(readFileSync(path.join(modules, "linked-pkg", "index.js"), "utf8"), "linked");
  // Materializing an outward link must preserve its original target as well as the staged copy.
  assert.equal(readFileSync(path.join(fx.tmp, "elsewhere", "linked-pkg", "index.js"), "utf8"), "linked");
  assert.ok(!readdirSync(modules).includes("dangling"));
  assert.deepEqual(calls.prune, [[{ platform: "darwin", arch: "x64" }, { platform: "darwin", arch: "arm64" }]]);
  assert.deepEqual(calls.imports, [{
    distDir: path.join(fx.outDir, "dist"), entry: path.join(fx.outDir, "dist/cli.js"),
    declared: new Set(["dep-a", "better-sqlite3", "playwright", "@playwright/test", "@jini-ai/core", "@tovu/sdk"]),
  }]);
  assert.deepEqual(calls.npm, [{ npmSrc: path.join(fx.desktop, "node_modules/npm"), outDir: path.join(fx.desktop, "staging/npm") }]);
  assert.deepEqual(out, [
    `stage-payload: staged bundled npm -> ${path.join(fx.desktop, "staging/npm")} (1962 files, 5.0 MB)\n`,
    // sdk + dep-a + nested + better-sqlite3 + playwright + core + required platform + 2 fake transitive.
    `stage-payload: staged 9 packages, materialized 1 symlinks -> ${fx.outDir} (10.0 MB)\n`,
    "stage-payload: stripped 4 declarations, 3 third-party source maps, 1 coverage reports (2.0 MB on disk)\n",
    "stage-payload: native prebuilds kept for darwin-x64 + darwin-arm64 only; removed 6 other-architecture prebuilds and 2 from-source build inputs (3.0 MB on disk)\n",
  ]);
});

test("restaging wipes the previous payload and preserves an already staged package", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  write(path.join(fx.outDir, "stale-leftover.txt"), "old");
  // A root manifest declaring no `dependencies` leaves only the workspace packages importable.
  write(path.join(fx.repo, "package.json"), JSON.stringify({ bin: { tovu: "dist/cli.js" } }));
  // An earlier copy must survive the dependency pass without being overwritten.
  write(path.join(fx.repo, "node_modules", "@jini-ai", "platform", "package.json"), JSON.stringify({ name: "@jini-ai/platform", hoisted: true }));
  const { run, calls } = harness(fx, {
    steps: {
      stageTransitiveDependencies({ outDir }) {
        stageDir(path.join(fx.repo, "node_modules/better-sqlite3"), path.join(outDir, "node_modules/better-sqlite3"), true);
        return 1;
      },
      stagePayloadFiles(input) {
        stagePayloadFiles(input);
        stageDir(path.join(fx.repo, "node_modules", "@jini-ai", "platform"), path.join(input.outDir, "node_modules", "@jini-ai", "platform"), false);
      },
    },
    ports: { env: { npm_execpath: "/npm/bin/npm-cli.js" }, host: { execPath: "/bin/node", platform: "linux", arch: "x64" } },
  });
  run();
  assert.deepEqual((calls.imports as { declared: Set<string> }[])[0]!.declared, new Set(["@tovu/sdk"]));
  assert.ok(!existsSync(path.join(fx.outDir, "stale-leftover.txt")));
  assert.equal(JSON.parse(readFileSync(path.join(fx.outDir, "node_modules/@jini-ai/platform/package.json"), "utf8")).hoisted, true);
});

test("a missing declared runtime dependency is a refusal, rather than silently relying on ancestors", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  unlinkSync(path.join(fx.repo, "node_modules/@jini-ai/core"));
  refusal(harness(fx).run, `Unresolved runtime dependency: ${fx.repo} -> @jini-ai/core`);
});

test("source preconditions refuse BEFORE anything under staging/ is written", (t) => {
  const cases: [string, (fx: Fixture) => void, (fx: Fixture) => string | RegExp][] = [
    ["no runtime manifest", (fx) => rmSync(path.join(fx.repo, "dist", "runtime-manifest.json")),
      (fx) => `no ${path.join(fx.repo, "dist/runtime-manifest.json")}. Run \`npm run build\` at ${fx.repo} first.`],
    ["manifest without cliEntry", (fx) => write(path.join(fx.repo, "dist", "runtime-manifest.json"), JSON.stringify({ cliEntry: 7 })),
      (fx) => `${path.join(fx.repo, "dist/runtime-manifest.json")} has no "cliEntry" string field.`],
    ["bin.tovu disagrees", (fx) => write(path.join(fx.repo, "package.json"), JSON.stringify({ bin: { tovu: "dist/other.js" } })),
      () => `the root package.json's bin.tovu ("dist/other.js") and dist/runtime-manifest.json's cliEntry ("dist/cli.js") disagree. Re-run \`npm run build\`.`],
    ["no bin at all", (fx) => write(path.join(fx.repo, "package.json"), "{}"), () => /bin\.tovu \("undefined"\)/],
    ["CLI not built", (fx) => rmSync(path.join(fx.repo, "dist", "cli.js")),
      (fx) => `no built Tovu CLI at ${path.join(fx.repo, "dist/cli.js")} (from runtime-manifest.json's cliEntry). Run \`npm run build\` at ${fx.repo} first.`],
    ["admin shell not built", (fx) => rmSync(path.join(fx.repo, "apps", "admin", "dist", "index.html")),
      (fx) => `no built shell at ${path.join(fx.repo, "apps/admin/dist/index.html")}. Run \`cd apps/admin && npx vite build\` at ${fx.repo} first.`],
  ];
  for (const [name, breakIt, expected] of cases) {
    const fx = fixture();
    t.after(fx.cleanup);
    breakIt(fx);
    refusal(harness(fx).run, expected(fx));
    assert.ok(!existsSync(fx.outDir), `${name}: staging/ must be untouched`);
  }
});

test("a shell built before its own newest source edit is refused, from source dirs or files", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const asked: string[] = [];
  const newestMtime = (stale: string) => (abs: string) => { asked.push(abs); return abs.startsWith(stale) ? 300 : 100; };
  refusal(harness(fx, { steps: { newestMtime: newestMtime(path.join(fx.repo, "apps/admin/src")) } }).run, /apps[/\\]admin/);
  assert.ok(asked.includes(path.join(fx.repo, "apps/admin/package.json")));
  refusal(harness(fx, { steps: { newestMtime: newestMtime(path.join(fx.repo, "apps/site-chat/package.json")) } }).run, /apps[/\\]site-chat/);
  assert.ok(!existsSync(fx.outDir));
});

test("a shell entry with no declared source lists is only checked for existence", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  write(path.join(fx.repo, "apps", "extra", "dist", "x.js"));
  const extra: ShellEntry = { relative: path.join("apps", "extra", "dist"), marker: "x.js", buildWith: "build extra" };
  const asked: string[] = [];
  const { run } = harness(fx, {
    ports: { shells: [...STAGED_SHELLS, extra] },
    steps: {
      newestMtime: (abs) => { asked.push(abs); return 100; },
      stagePayloadFiles(input) {
        stagePayloadFiles(input);
        realFs.cpSync(path.join(fx.repo, extra.relative), path.join(input.outDir, extra.relative), { recursive: true });
      },
    },
  });
  run();
  assert.deepEqual(asked.filter((abs) => abs.includes("extra")), [path.join(fx.repo, "apps/extra/dist/x.js")]);
});

test("no better-sqlite3 in the staged tree refuses even if an injected staging step omits it", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  refusal(harness(fx, { steps: { stageTransitiveDependencies({ outDir }) {
    rmSync(path.join(outDir, "node_modules/better-sqlite3"), { recursive: true });
    return 0;
  } } }).run,
    "staged tree has no better-sqlite3 — Tovu's CLI cannot open a site database without it.");
});

test("a symlink that survives materialization (cpSync recreating a link) refuses", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const survivor = path.join(fx.outDir, "node_modules", "linked-file");
  const { run } = harness(fx, {
    steps: {
      stageTransitiveDependencies({ outDir }) {
        symlinkSync(path.join(fx.tmp, "elsewhere", "linked-pkg", "index.js"), path.join(outDir, "node_modules", "linked-file"));
        return 0;
      },
    },
    ports: {
      fs: { ...realFs, cpSync: ((src: string, dest: string, options: realFs.CopySyncOptions) =>
        dest === survivor ? symlinkSync(src, dest) : realFs.cpSync(src, dest, options)) as typeof realFs.cpSync },
    },
  });
  refusal(run, `staged tree still contains a symlink after materialization: ${survivor}`);
});

test("prune, closure, dist-import and bundled-npm failures surface as refusals with their own message", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const boom = (message: string) => () => { throw new Error(message); };
  for (const [step, message] of [["pruneNativePrebuilds", "no prebuild serves linux-riscv"], ["assertClosureComplete", "closure missing: ms"],
    ["assertDistImportsDeclared", "dist imports undeclared package left-pad"], ["stageBundledNpm", "npm ships a native binary"]] as const) {
    rmSync(fx.outDir, { recursive: true, force: true });
    refusal(harness(fx, { steps: { stageTransitiveDependencies: () => 0, [step]: boom(message) } }).run, message);
  }
});

test("the staged tree must still carry the manifest's CLI entry and every shell", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const after = (mutate: (outDir: string) => void): Partial<StageSteps> => ({
    stageTransitiveDependencies: () => 0,
    stagePayloadFiles(input) { stagePayloadFiles(input); mutate(input.outDir); },
  });
  refusal(harness(fx, { steps: after((outDir) => write(path.join(outDir, "dist", "runtime-manifest.json"), JSON.stringify({ cliEntry: "dist/moved.js" }))) }).run,
    `the staged tree's runtime-manifest.json names cliEntry "dist/moved.js", which did not survive the dist/ copy.`);
  refusal(harness(fx, { steps: after((outDir) => rmSync(path.join(outDir, "dist", "cli.js"))) }).run,
    `the staged tree's runtime-manifest.json names cliEntry "dist/cli.js", which did not survive the dist/ copy.`);
  refusal(harness(fx, { steps: after((outDir) => rmSync(path.join(outDir, "apps", "site-chat"), { recursive: true })) }).run,
    `staged tree has no shell at ${path.join(fx.outDir, "apps/site-chat/dist/site-assistant.js")} — the copy must have gone wrong.`);
});

test("a staged dist/ with fewer migrations than source is refused as stale; none on either side is fine", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  write(path.join(fx.repo, "apps", "website", "src", "platform", "db", "drizzle", "0002.sql"));
  refusal(harness(fx, { steps: { stageTransitiveDependencies: () => 0 } }).run,
    /^the staged dist\/ carries 1 migrations but source has 2\. .*SITE_NEWER_THAN_RUNTIME/);
  rmSync(path.join(fx.repo, "apps", "website"), { recursive: true });
  rmSync(path.join(fx.repo, "dist", "src"), { recursive: true });
  harness(fx, { steps: { stageTransitiveDependencies: () => 0 } }).run();
  assert.ok(existsSync(path.join(fx.outDir, "dist", "cli.js")));
});

test("the CLI wrapper prints a refusal and exits 1, exits 0 on success, and lets a real bug propagate", (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const err: string[] = [];
  const stderr = { write: (text: string) => err.push(text) };
  const base = harness(fx, { steps: { stageTransitiveDependencies: () => 0 } }).ports;
  assert.equal(stagePayloadCli({ argv: ["--repo-root", fx.repo], desktopDir: fx.desktop }, { ...base, stderr }), 0);
  assert.deepEqual(err, []);
  rmSync(path.join(fx.repo, "dist", "cli.js"));
  assert.equal(stagePayloadCli({ argv: ["--repo-root", fx.repo], desktopDir: fx.desktop }, { ...base, stderr }), 1);
  assert.deepEqual(err, [`stage-payload: no built Tovu CLI at ${path.join(fx.repo, "dist/cli.js")} (from runtime-manifest.json's cliEntry). Run \`npm run build\` at ${fx.repo} first.\n`]);
  write(path.join(fx.repo, "dist", "runtime-manifest.json"), "{not json");
  assert.throws(() => stagePayloadCli({ argv: ["--repo-root", fx.repo], desktopDir: fx.desktop }, { ...base, stderr }), SyntaxError);
});

test("the repo root defaults to this checkout and --repo-root overrides it", () => {
  assert.equal(resolveStageRoot({ argv: [], desktopDir: "/r/apps/desktop" }), "/r");
  assert.equal(resolveStageRoot({ argv: ["--repo-root"], desktopDir: "/r/apps/desktop" }), "/r");
  assert.equal(resolveStageRoot({ argv: ["--repo-root", "/clean/clone"], desktopDir: "/r/apps/desktop" }), "/clean/clone");
});

test("scripts/stage-payload.ts refuses an unbuilt checkout with exit 1 and a stage-payload: message", (t) => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "stage-payload-empty-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  // Node 24.2 still prints a type-stripping ExperimentalWarning, which would break the exact stderr match.
  const run = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(DESKTOP_ROOT, "scripts/stage-payload.ts"), "--repo-root", empty], {
    cwd: DESKTOP_ROOT, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stdout, "");
  assert.equal(run.stderr, `stage-payload: no ${path.join(empty, "dist/runtime-manifest.json")}. Run \`npm run build\` at ${empty} first.\n`);
});

// Real dependency traversal is essential here: a fake closure could hide the sibling sweep.
for (const selection of ["none", "dependency", "optional"] as const) {
  test(`provider selection ${selection}: stages only declared packages, never linked siblings or development plugins`, async (t) => {
    const fx = fixture();
    t.after(fx.cleanup);
    const selected = "@jini-ai/plugin-observability-sentry";
    const unused = "@jini-ai/plugin-analytics-posthog";
    const rootManifest = path.join(fx.repo, "package.json");
    const manifest = JSON.parse(readFileSync(rootManifest, "utf8"));
    manifest.optionalDependencies = { "@jini-ai/plugin-not-installed": "1" };
    manifest.devDependencies = { [unused]: "1" };
    if (selection === "dependency") manifest.dependencies[selected] = "1";
    if (selection === "optional") manifest.optionalDependencies[selected] = "1";
    write(rootManifest, JSON.stringify(manifest));
    for (const name of [selected, unused]) {
      const source = path.join(fx.tmp, "jini/packages", name.slice("@jini-ai/".length));
      write(path.join(source, "package.json"), JSON.stringify({ name }));
      write(path.join(source, "plugins", "artifact.json"), name);
      symlinkSync(source, path.join(fx.repo, "node_modules", name));
    }
    const { run } = harness(fx, { steps: { assertClosureComplete } });
    run();
    const scope = path.join(fx.outDir, "node_modules/@jini-ai");
    const expected = ["core", "platform"];
    if (selection !== "none") expected.push("plugin-observability-sentry");
    assert.deepEqual(readdirSync(scope).sort(), expected.sort());
    assert.equal(existsSync(path.join(scope, "plugin-analytics-posthog")), false);
    if (selection !== "none") {
      assert.equal(readFileSync(path.join(scope, "plugin-observability-sentry/plugins/artifact.json"), "utf8"), selected);
    }
    // Inspect the payload at its final Resources/tovu location using electron-builder's real copy.
    const config = yaml.load(readFileSync(path.join(DESKTOP_ROOT, "electron-builder.yml"), "utf8")) as {
      extraResources: { from: string; to: string; filter?: string[] }[];
    };
    const output = path.join(fx.tmp, "Resources");
    const matchers = getFileMatchers({
      extraResources: config.extraResources.filter((entry) => entry.to === "tovu/node_modules"),
    }, "extraResources", output, {
      defaultSrc: fx.desktop, macroExpander: (value: string) => value,
      customBuildOptions: {}, globalOutDir: path.join(fx.desktop, "release"),
    });
    await copyFiles(matchers, undefined, false);
    const shippedScope = path.join(output, "tovu/node_modules/@jini-ai");
    assert.deepEqual(readdirSync(shippedScope).sort(), expected.sort());
    if (selection !== "none") {
      assert.equal(readFileSync(path.join(shippedScope, "plugin-observability-sentry/plugins/artifact.json"), "utf8"), selected);
    }
    // Changing the owner's selection and staging again must remove the formerly selected payload.
    delete manifest.dependencies[selected];
    delete manifest.optionalDependencies[selected];
    write(rootManifest, JSON.stringify(manifest));
    run();
    assert.deepEqual(readdirSync(scope).sort(), ["core", "platform"]);
    assert.equal(readFileSync(path.join(fx.tmp, "jini/packages/plugin-observability-sentry/plugins/artifact.json"), "utf8"), selected);
  });
}
