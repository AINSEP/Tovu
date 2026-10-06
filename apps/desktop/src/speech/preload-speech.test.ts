/**
 * Exercise the bundled CommonJS preload that Electron actually loads. npm test builds preloads first:
 * Jini must be inlined, and the restricted sandbox must require only Electron at runtime.
 * The VM retains the admin-only file capability and positional speech wire assertions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "./speech-ipc.ts";

// Electron's sandbox neither strips TypeScript nor accepts ESM, so the deployed CommonJS text
// is the security boundary. Its restricted require cannot resolve relative imports; bundled
// package code must leave only Electron as a runtime dependency.
// Bridge isolation rationale: Jini/packages/desktop-host/src/speech/speech-bridge.ts.
// Plain Node resolves require("electron") to a path string rather than the bridge API. The VM
// uses a recording stub to exercise host capability exposure and channel forwarding instead.
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
const compiledText = fs.readFileSync(COMPILED_PATH, "utf8");

/** Every top-level `require(...)` call's argument, in source order — block comments are stripped
 *  first so a doc comment merely MENTIONING a `require(...)` call (as the preload's own header does,
 *  to explain why one is forbidden) is never mistaken for an actual one. */
function requiredSpecifiers(text: string): string[] {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Group 1 is not optional, so every match carries it.
  return [...withoutBlockComments.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] as string);
}

// REGRESSION: fails if the deployed speech bundle predates its source.
test("the preload config includes speech source and the deployed bundle is fresh", () => {
  assert.ok(preloadTsconfig.fileNames.includes(SOURCE_PATH), "tsconfig.preload.json must include src/speech/preload-speech.cts");
  const outputs = ts.getOutputFileNames(preloadTsconfig, SOURCE_PATH, false);
  assert.ok(outputs.includes(COMPILED_PATH), `expected ${COMPILED_PATH} among ${outputs.join(", ")}`);
  assert.ok(fs.statSync(COMPILED_PATH).mtimeMs >= fs.statSync(SOURCE_PATH).mtimeMs, "build:preload must produce fresh bundled output before these tests run");
});

test("the compiled preload requires nothing but \"electron\" — a sandboxed preload's require resolves no relative specifier", () => {
  assert.deepEqual(requiredSpecifiers(compiledText), ["electron"]);
});

/** Runs the compiled preload in a `vm` context whose `require("electron")` is a recording stub and
 *  whose `window.location.pathname` is `pathname`, returning every global it exposes to the page, in
 *  order. This checks capability exposure and the bridged calls without a real Electron process.
 *
 *  `exports` and `module` are supplied because the compiled CommonJS writes
 *  `Object.defineProperty(exports, "__esModule", …)`, and Electron's sandboxed loader supplies them
 *  too: its `runPreloadScript` (`lib/sandboxed_renderer/preload.ts`, read out of the installed
 *  Electron 43.6.0 framework's `sandbox_bundle`) compiles every preload as a function of
 *  `require, process, exports, module, …` and calls it with a fresh `{}` and `{ exports }`; its
 *  `process.argv` carries `webPreferences.additionalArguments`, which `argv` stands in for. Any
 *  OTHER free identifier the compiled output grows still throws here, as it would there. */
function preloadAt(pathname: string, argv: readonly string[] = []) {
  const exposed: Record<string, any> = {};
  const invokes: unknown[][] = [];
  const files: unknown[] = [];
  const availability = { available: true };
  const transcription = { text: "hello", elapsedMs: 7 };
  const electron = {
    contextBridge: { exposeInMainWorld: (key: string, value: unknown) => { exposed[key] = value; } },
    ipcRenderer: { invoke: async (channel: string, ...args: unknown[]) => {
      invokes.push([channel, ...args]);
      return channel === IPC_CHANNEL_IS_AVAILABLE ? availability : transcription;
    } },
    webUtils: { getPathForFile: (file: unknown) => { files.push(file); return "/tmp/dropped/file.txt"; } },
  };
  const requireStub = (specifier: string) => {
    assert.equal(specifier, "electron");
    return electron;
  };
  const moduleExports = {};
  const context = { require: requireStub, process: { argv: [...argv] }, exports: moduleExports, module: { exports: moduleExports }, window: { location: { pathname } } };
  vm.runInNewContext(compiledText, context, { filename: COMPILED_PATH });
  return { exposed, invokes, files, availability, transcription };
}

function exposedGlobalsAt(pathname: string): string[] {
  return Object.keys(preloadAt(pathname).exposed);
}

test("window.tovuFiles is exposed on the admin surface — /admin and every path under /admin/", () => {
  for (const pathname of ["/admin", "/admin/", "/admin/posts/42"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice", "tovuFiles"], `at ${pathname}`);
  }
});

test("window.tovuDesktop is exposed only in a shell <webview> guest (the --tovu-desktop-embedded flag)", () => {
  // SPEC-051: the site admin hides its own chat on this, because the shell's chat is the one chat.
  assert.deepEqual(exposedGlobalsAt("/admin"), ["tovuVoice", "tovuFiles"], "a standalone site window gets no flag");
  const embedded = preloadAt("/admin", ["/path/Electron Helper", "--tovu-desktop-embedded"]);
  assert.deepEqual(Object.keys(embedded.exposed), ["tovuVoice", "tovuDesktop", "tovuFiles"]);
  assert.equal(embedded.exposed.tovuDesktop.embedded, true);
});

test("window.tovuFiles is NOT exposed to same-origin public pages, previews, or look-alike paths", () => {
  // Every one of these loads with this same preload: `createWindow`'s same-origin `allow` popups and
  // in-window navigation, and a `<webview>` guest confined only to its origin, all reach them.
  for (const pathname of ["/", "/about", "/blog/hello-world", "/theme-assets/site.css", "/administrator", "/admin-old/"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice"], `at ${pathname}`);
  }
});


// PARITY: the shared bridge preserves positional renderer payloads and IPC results.
test("compiled voice bridge forwards the channels, sample object and sample rate and returns IPC results", async () => {
  const f = preloadAt("/admin");
  assert.equal(await f.exposed.tovuVoice.isAvailable(), f.availability);
  const samples = new Float32Array([0.1, -0.2]);
  assert.equal(await f.exposed.tovuVoice.transcribe(samples, 16000), f.transcription);
  assert.deepEqual(f.invokes, [[IPC_CHANNEL_IS_AVAILABLE], [IPC_CHANNEL_TRANSCRIBE, samples, 16000]]);
  const transcriptionInvoke = f.invokes[1];
  assert.ok(transcriptionInvoke);
  assert.equal(transcriptionInvoke[1], samples);
});

test("compiled admin file bridge delegates to webUtils and returns the resolved path", () => {
  for (const pathname of ["/admin", "/admin/", "/admin/posts/42"]) {
    const f = preloadAt(pathname);
    const file = { name: "file.txt" };
    assert.equal(f.exposed.tovuFiles.getPathForFile(file), "/tmp/dropped/file.txt");
    assert.deepEqual(f.files, [file]);
    assert.equal(f.files[0], file);
  }
});
