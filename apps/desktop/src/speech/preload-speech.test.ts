/**
 * @file Tests for `preload-speech.cts`, run against what it COMPILES to — that is the file Electron
 * loads (`main.ts`'s `SPEECH_PRELOAD_PATH` → `dist/speech/preload-speech.cjs`); the `.cts` source
 * itself never runs, because Electron's sandboxed preload loader neither strips types nor accepts ESM.
 *
 * The compiled text is produced here by `ts.transpileModule` with `tsconfig.preload.json`'s own
 * parsed compiler options, not read from `dist/`: tests run before any build (`npm run package` runs
 * its gates first), so a `dist/` copy may be missing or stale. The preload imports nothing but
 * `"electron"`, so no cross-file type information can change its emit — `transpileModule`'s output
 * was byte-identical to `tsc -p tsconfig.preload.json`'s when this test was written (2026-09-14).
 * The first test pins that `tsconfig.preload.json` really builds this file to the path `main.ts` loads.
 *
 * The `contextBridge`/`ipcRenderer` bridging cannot be exercised under plain `node --test` —
 * `require("electron")` outside a real Electron process resolves to a path string, not the API. What
 * IS testable without Electron, and is exactly what the source's own header says matters, is the
 * compiled TEXT: no `require()` of anything but `"electron"` (a sandboxed preload's `require` resolves
 * only `"electron"`/`"events"`/`"timers"`/`"url"` — a relative specifier throws), and its two inlined
 * channel-name literals never drifting from `speech-ipc.ts`'s own exports, which stay the source of
 * truth for both preloads.
 *
 * The one decision the file makes — which page gets `window.tovuFiles` — IS exercised, by running the
 * compiled output in a `vm` context with a stubbed `require("electron")` (`exposedGlobalsAt` below).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "./speech-ipc.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DESKTOP_ROOT = path.join(__dirname, "..", "..");
const SOURCE_PATH = path.join(__dirname, "preload-speech.cts");
const PRELOAD_TSCONFIG_PATH = path.join(DESKTOP_ROOT, "tsconfig.preload.json");
/** Where `main.ts`'s `SPEECH_PRELOAD_PATH` points (`main-speech-wiring.test.ts` asserts that half). */
const COMPILED_PATH = path.join(DESKTOP_ROOT, "dist", "speech", "preload-speech.cjs");

/** `tsconfig.preload.json`, parsed the way `tsc -p` parses it. Throws if the file is unreadable or
 *  malformed, so a broken config fails every test here loudly rather than compiling with defaults. */
function parsePreloadTsconfig(): ts.ParsedCommandLine {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(PRELOAD_TSCONFIG_PATH, {}, host);
  assert.ok(parsed, `could not parse ${PRELOAD_TSCONFIG_PATH}`);
  return parsed;
}

const preloadTsconfig = parsePreloadTsconfig();
const compiled = ts.transpileModule(fs.readFileSync(SOURCE_PATH, "utf8"), {
  compilerOptions: preloadTsconfig.options,
  fileName: SOURCE_PATH,
  reportDiagnostics: true,
});
const compiledText = compiled.outputText;

/** Every top-level `require(...)` call's argument, in source order — block comments are stripped
 *  first so a doc comment merely MENTIONING a `require(...)` call (as the preload's own header does,
 *  to explain why one is forbidden) is never mistaken for an actual one. */
function requiredSpecifiers(text: string): string[] {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Group 1 is not optional, so every match carries it.
  return [...withoutBlockComments.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] as string);
}

test("tsconfig.preload.json builds preload-speech.cts to dist/speech/preload-speech.cjs, the path main.ts loads", () => {
  assert.ok(preloadTsconfig.fileNames.includes(SOURCE_PATH), "tsconfig.preload.json must include src/speech/preload-speech.cts");
  const outputs = ts.getOutputFileNames(preloadTsconfig, SOURCE_PATH, false);
  assert.ok(outputs.includes(COMPILED_PATH), `expected ${COMPILED_PATH} among ${outputs.join(", ")}`);
  assert.deepEqual(compiled.diagnostics ?? [], []);
});

test("the compiled preload requires nothing but \"electron\" — a sandboxed preload's require resolves no relative specifier", () => {
  assert.deepEqual(requiredSpecifiers(compiledText), ["electron"]);
});

test("the compiled preload's inlined IPC_CHANNEL_IS_AVAILABLE literal matches speech-ipc.ts's own export", () => {
  const match = compiledText.match(/IPC_CHANNEL_IS_AVAILABLE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_IS_AVAILABLE string literal in the compiled preload");
  assert.equal(match[1], IPC_CHANNEL_IS_AVAILABLE);
});

test("the compiled preload's inlined IPC_CHANNEL_TRANSCRIBE literal matches speech-ipc.ts's own export", () => {
  const match = compiledText.match(/IPC_CHANNEL_TRANSCRIBE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_TRANSCRIBE string literal in the compiled preload");
  assert.equal(match[1], IPC_CHANNEL_TRANSCRIBE);
});

/** Runs the compiled preload in a `vm` context whose `require("electron")` is a recording stub and
 *  whose `window.location.pathname` is `pathname`, returning every global it exposes to the page, in
 *  order. This exercises the one decision the file makes (which bridges a given page gets) without
 *  Electron; the bridged calls themselves stay untested here, as the header above says.
 *
 *  `exports` and `module` are supplied because the compiled CommonJS writes
 *  `Object.defineProperty(exports, "__esModule", …)`, and Electron's sandboxed loader supplies them
 *  too: its `runPreloadScript` (`lib/sandboxed_renderer/preload.ts`, read out of the installed
 *  Electron 43.6.0 framework's `sandbox_bundle`) compiles every preload as a function of
 *  `require, process, exports, module, …` and calls it with a fresh `{}` and `{ exports }`. Any
 *  OTHER free identifier the compiled output grows still throws here, as it would there. */
function exposedGlobalsAt(pathname: string): string[] {
  const exposed: string[] = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (key: string) => void exposed.push(key) },
    ipcRenderer: { invoke: async () => undefined },
    webUtils: { getPathForFile: () => "" },
  };
  const requireStub = (specifier: string) => {
    assert.equal(specifier, "electron");
    return electron;
  };
  const moduleExports = {};
  const context = { require: requireStub, exports: moduleExports, module: { exports: moduleExports }, window: { location: { pathname } } };
  vm.runInNewContext(compiledText, context, { filename: COMPILED_PATH });
  return exposed;
}

test("window.tovuFiles is exposed on the admin surface — /admin and every path under /admin/", () => {
  for (const pathname of ["/admin", "/admin/", "/admin/posts/42"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice", "tovuFiles"], `at ${pathname}`);
  }
});

test("window.tovuFiles is NOT exposed to same-origin public pages, previews, or look-alike paths", () => {
  // Every one of these loads with this same preload: `createWindow`'s same-origin `allow` popups and
  // in-window navigation, and a `<webview>` guest confined only to its origin, all reach them.
  for (const pathname of ["/", "/about", "/blog/hello-world", "/theme-assets/site.css", "/administrator", "/admin-old/"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice"], `at ${pathname}`);
  }
});
