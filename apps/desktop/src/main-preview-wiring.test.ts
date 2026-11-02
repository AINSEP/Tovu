/**
 * @file The card-preview bindings that live only in the Electron entry (`src/main/index.ts`, formerly
 * `main.ts`), plus the boot discovery's preview-hygiene ordering.
 *
 * The entry imports "electron" at module scope, so it cannot load under node --test. The capture,
 * the scheduler's target, the list poll's requests and the boot sweep are tested through the real
 * module in `src/main/boot/site-preview.test.ts`; that both site opens schedule a capture right after
 * publishing into `openSites` is tested in `src/main/windows/site-window.test.ts` and
 * `src/main/boot/site-backend.test.ts`. What stays here as source text is the sites-home deps object,
 * an inline literal in the entry with no module of its own: its preview operations must be bound to
 * THIS launch's userData, or E2E previews land in the real operator's profile.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDesktopSiteDiscovery } from "./site-discovery.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "main", "index.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

test("the sites-home deps object carries the three preview operations, bound to this launch's userData", () => {
  // `buildProjectDeps` since the whenReady split; the inline `const projectDeps = {` before it.
  const builder = source.indexOf("function buildProjectDeps(");
  const depsStart = builder === -1 ? source.indexOf("const projectDeps = {") : builder;
  assert.notEqual(depsStart, -1, "expected the sites-home deps object in the entry");
  // Up to the literal's own closing `};`, whatever its indentation.
  const rest = source.slice(depsStart);
  const end = rest.search(/\n\s*};\n/);
  const depsBlock = end === -1 ? rest : rest.slice(0, end);

  assert.match(depsBlock, /readPreviewVersion: \(siteDir: string\) => readPreviewVersion\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /readPreviewDataUrl: \(siteDir: string\) => readPreviewDataUrl\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /deletePreview: \(siteDir: string\) => deletePreview\(app\.getPath\("userData"\), siteDir\)/);
});

test("boot discovery leaves the home window free and sweeps only after the scan settles", async () => {
  const effects: string[] = [];
  let finish!: () => void;
  const pending = startDesktopSiteDiscovery({ scan: () => new Promise<void>((resolve) => { finish = resolve; }),
    sweep: () => { effects.push('sweep'); }, report: () => assert.fail('successful scan must not report failure'),
  });
  effects.push('home-window-opened');
  assert.deepEqual(effects, ['home-window-opened']);
  finish(); await pending;
  assert.deepEqual(effects, ['home-window-opened', 'sweep']);
});

test("a failed boot scan reports the failure and still performs preview hygiene", async () => {
  const failure = new Error('unavailable volume'), effects: unknown[] = [];
  await startDesktopSiteDiscovery({ scan: async () => { throw failure; },
    report: (error) => { effects.push(error); }, sweep: () => { effects.push('sweep'); },
  });
  assert.deepEqual(effects, [failure, 'sweep']);
});
