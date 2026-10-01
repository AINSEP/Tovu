/**
 * @file Static-analysis tests for `../main.ts`'s card-preview capture wiring.
 *
 * `main.ts` requires `"electron"` at module scope, which resolves to a path string (not the real
 * API) outside a real Electron process — `require`-ing it under plain `node --test` would crash
 * immediately without proving anything (same constraint `main-speech-wiring.test.ts` and
 * `main-project-wiring.test.ts` document for their own files). The capture's non-Electron half —
 * the path convention, the version token, the two cleanup paths — is behaviourally covered directly
 * in `site-preview-store.test.ts`; what only this file can check is that `main.ts` actually calls
 * that store's functions, from the right places, bound the right way.
 */
import test from "node:test";
import ts from "typescript";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "..", "main.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

/** One function's own body, from its `function name(` header to the next top-level `function `. */
function functionBody(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `expected a function ${name}(...) in main.ts`);
  const rest = source.slice(start);
  const end = rest.indexOf("\nfunction ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

test("main.ts imports every site-preview-store operation it needs", () => {
  assert.match(source, /from ["']\.\/src\/site-preview-store\.ts["']/);
  for (const name of ["readPreviewVersion", "readPreviewDataUrl", "writePreview", "deletePreview", "sweepOrphanedPreviews"]) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `expected ${name} to be imported and used`);
  }
});

test("captureSitePreview loads the site's OWN public root, never /admin/", () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /loadURL\(`http:\/\/127\.0\.0\.1:\$\{port\}\/`\)/, "must load the bare origin root, not an admin path");
  assert.doesNotMatch(body, /\/admin\//, "must never navigate the capture window to /admin/");
});

/** Execute the actual declaration with Electron/I/O boundaries supplied by the test. */
function executable(name: string, deps: Record<string, unknown>) {
  const sf = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  const js = ts.transpile(declaration.getText(sf), { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), `${js}; return ${name};`)(...Object.values(deps));
}

function captureHarness(failAt?: "load" | "capture" | "store") {
  const options: any[] = [];
  const writes: unknown[][] = [];
  const warnings: unknown[][] = [];
  const urls: string[] = [];
  let destroyed = false;
  const resizedBytes = Buffer.from("resized png");
  const deps = {
    BrowserWindow: class {
      constructor(opts: unknown) { options.push(opts); }
      async loadURL(url: string) { urls.push(url); if (failAt === "load") throw new Error("load failed"); }
      isDestroyed() { return destroyed; }
      destroy() { destroyed = true; }
      webContents = { capturePage: async () => {
        if (failAt === "capture") throw new Error("capture failed");
        return {
          toPNG: () => Buffer.from("original png"),
          resize: (opts: unknown) => {
            assert.deepEqual(opts, { width: 320 });
            return { toPNG: () => resizedBytes };
          },
        };
      } };
    },
    app: { getPath: (key: string) => { assert.equal(key, "userData"); return "/profile"; } },
    writePreview: (...args: unknown[]) => { if (failAt === "store") throw new Error("store failed"); writes.push(args); },
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    setTimeout: (callback: () => void) => { callback(); },
    PREVIEW_CAPTURE_WIDTH_PX: 1280, PREVIEW_CAPTURE_HEIGHT_PX: 800,
    PREVIEW_PAINT_SETTLE_MS: 0, PREVIEW_WIDTH_PX: 320,
  };
  return { run: executable("captureSitePreview", deps), options, writes, warnings, urls, resizedBytes, destroyed: () => destroyed };
}

test("captureSitePreview's window is hidden and scoped to the site's own partition", async () => {
  const body = functionBody("captureSitePreview");
  const windowOptions = body.match(/new BrowserWindow\(\{[\s\S]*?\}\);/);
  assert.ok(windowOptions, "expected a new BrowserWindow(...) in captureSitePreview");
  assert.match(windowOptions[0], /show:\s*false/);
  assert.match(windowOptions[0], /partition/);
  const h = captureHarness();
  await h.run("/sites/alpha", 8123, "persist:alpha-auth");
  assert.equal(h.options.length, 1);
  assert.equal(h.options[0].show, false);
  assert.equal(h.options[0].webPreferences.partition, "persist:alpha-auth");
  assert.deepEqual(h.urls, ["http://127.0.0.1:8123/"]);
});

test("captureSitePreview writes through writePreview, keyed by siteDir, resized before storage", async () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /capturePage\(\)/);
  assert.match(body, /\.resize\(\{[^}]*\}\)/);
  assert.match(body, /writePreview\(app\.getPath\("userData"\),\s*siteDir,/);
  const h = captureHarness();
  await h.run("/sites/beta", 8124, "persist:beta");
  assert.deepEqual(h.writes, [["/profile", "/sites/beta", h.resizedBytes]]);
  assert.equal(h.destroyed(), true);
});

test("captureSitePreview never throws past its own boundary — every failure is caught and logged", async () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /catch \(error\)/);
  assert.match(body, /finally/);
  for (const stage of ["load", "capture", "store"] as const) {
    const h = captureHarness(stage);
    await assert.doesNotReject(() => h.run("/sites/failing", 8125, "persist:fail"));
    assert.equal(h.warnings.length, 1, stage);
    assert.match(String(h.warnings[0][0]), new RegExp(`${stage} failed`));
    assert.equal(h.destroyed(), true, stage);
    assert.deepEqual(h.writes, []);
  }
});

test("scheduleSitePreview captures a site at most once per process run", () => {
  const body = functionBody("scheduleSitePreview");
  assert.match(body, /previewCapturedThisRun\.has\(siteDir\)/);
  assert.match(body, /previewCapturedThisRun\.add\(siteDir\)/);
  assert.match(body, /setTimeout\(/);
  const timers: Array<() => void> = [];
  const captures: unknown[][] = [];
  const schedule = executable("scheduleSitePreview", {
    previewCapturedThisRun: new Set<string>(),
    PREVIEW_CAPTURE_DEBOUNCE_MS: 1500,
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 1500); timers.push(fn); },
    captureSitePreview: (...args: unknown[]) => captures.push(args),
  });
  schedule("/sites/alpha", 8123, "persist:alpha");
  schedule("/sites/alpha", 8123, "persist:alpha");
  assert.equal(timers.length, 1);
  assert.deepEqual(captures, []);
  for (const timer of timers) timer();
  assert.deepEqual(captures, [["/sites/alpha", 8123, "persist:alpha"]]);
  schedule("/sites/alpha", 8123, "persist:alpha");
  assert.equal(timers.length, 1);
});

test("both places a site enters openSites schedule its preview capture", () => {
  // Design decision (2026-09-12): hook exactly these two, and nowhere else — never the tab-open
  // hot path, never a timer. A capture scheduled anywhere but right after `openSites.set(...)`
  // would either fire before the entry exists or fire again on every reuse.
  const windowBody = functionBody("openSiteWindow");
  const serverBody = functionBody("openSiteServer");

  assert.match(
    windowBody,
    /openSites\.set\(siteDir, \{ server, window \}\);\s*\n\s*scheduleSitePreview\(siteDir, server\.port, partition\);/,
    "openSiteWindow must schedule a capture immediately after publishing into openSites",
  );
  assert.match(
    serverBody,
    /openSites\.set\(siteDir, \{ server \}\);\s*\n\s*scheduleSitePreview\(siteDir, server\.port, partition\);/,
    "openSiteServer must schedule a capture immediately after publishing into openSites",
  );
  // `openSiteServer` used to destructure only `{ server }` from `startSiteBackend` — the capture
  // needs `partition` too, or the capture window would run on the DEFAULT (unauthenticated)
  // partition instead of the site's own.
  assert.match(serverBody, /const \{ server, partition \} = await startSiteBackend\(/);
});

test("the sites-home deps object carries the three preview operations, bound to this launch's userData", () => {
  const depsStart = source.indexOf("const projectDeps = {");
  assert.notEqual(depsStart, -1, "expected a projectDeps object in the sites-home branch");
  const depsBlock = source.slice(depsStart, source.indexOf("\n      };", depsStart));

  assert.match(depsBlock, /readPreviewVersion: \(siteDir: string\) => readPreviewVersion\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /readPreviewDataUrl: \(siteDir: string\) => readPreviewDataUrl\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /deletePreview: \(siteDir: string\) => deletePreview\(app\.getPath\("userData"\), siteDir\)/);
});

test("the boot sweep runs against the tracked list, after the boot discovery pass", () => {
  const sweepCall = source.indexOf("sweepSitePreviewsOnBoot(sitesCtx.projectsPath);");
  const rescanCall = source.indexOf("rescanSites(projectDeps);");
  assert.notEqual(sweepCall, -1, "expected a sweepSitePreviewsOnBoot(sitesCtx.projectsPath) call");
  assert.ok(rescanCall !== -1 && rescanCall < sweepCall, "the sweep must run after the boot scan has populated the tracked list");

  const body = functionBody("sweepSitePreviewsOnBoot");
  assert.match(body, /readTrackedSites\(projectsPath\)/);
  assert.match(body, /sweepOrphanedPreviews\(app\.getPath\("userData"\),/);
  assert.match(body, /catch \(error\)/, "a hygiene sweep must never be able to fail the boot sequence");
});
