/**
 * @file Guard for "there is exactly ONE chat FAB", the owner's own words: *"there should only be
 * one chatfab and not two (whether disabled or not)"*.
 *
 * Since SPEC-051 (owner design 2026-10-06) the one that counts is the SHELL's: one desktop agent for
 * the whole app, reached from this app's own FAB and right panel. The embedded site admin's own
 * `ChatFab`/`AssistantDock` (`apps/admin/src/components/ChatFab/`) is hidden inside a desktop
 * `<webview>`, flagged by `--tovu-desktop-embedded` on the guest only.
 *
 * Why both halves are pinned, not just one: before SPEC-051 this page carried a DISABLED host FAB
 * placeholder while the real assistant was the guest's. The host button was `position: fixed` in
 * the same corner at the same `z-index` as the guest's, so it composited above the guest and
 * swallowed every click meant for the working assistant — an unbuilt placeholder blocking the built
 * feature. Two FABs in that corner is the failure; this file keeps it at one from either side.
 *
 * Source text, because `apps/desktop` has no DOM test environment: its test script runs this file
 * itself under `node --import tsx --test`, which transpiles TypeScript/JSX but supplies no DOM, so a
 * `.tsx` component cannot be rendered and queried here. The behavioural counterpart is a live
 * `_electron` run (screenshots in ADS-memory/.local-artifacts/desktop-global-chat-2/); this file is
 * what keeps the decision from being undone silently by an edit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/**
 * Source with every comment stripped. Load-bearing: the comments around the FAB NAME the removed
 * placeholder and the guest's `ChatFab`, and that explanation must not read as markup. A naive scan
 * of `.tsx` for markup false-positives on comment prose in this repo generally, not just here.
 */
function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const appTsx = withoutComments(read("App.tsx"));
const appCss = withoutComments(read("app.css"));
const mainJs = withoutComments(read("..", "..", "main.ts"));
const guestPolicy = withoutComments(read("..", "webview-guest-policy.ts"));
const speechPreload = withoutComments(read("..", "speech", "preload-speech.cts"));
const adminApp = withoutComments(read("..", "..", "..", "admin", "src", "App.tsx"));

test("the shell renders exactly one chat FAB — its own, which opens the one desktop panel", () => {
  const fabs = appTsx.match(/className="[^"]*\bchat-fab\b[^"]*"/g) ?? [];
  assert.deepEqual(fabs, ['className="chat-fab desktop-chat-fab"']);
  assert.match(appTsx, /onClick=\{chatPanel\.openPanel\}/);
});

test("App.tsx does not import a ChatFab component — the other route a second button comes back by", () => {
  assert.doesNotMatch(appTsx, /\bChatFab\b/);
});

test("the disabled-FAB placeholder style stays gone", () => {
  assert.doesNotMatch(appCss, /\.chat-fab--disabled\b/);
});

test("the FAB opens WorkspaceChatPane, mounted with the visible site's folder", () => {
  assert.match(appTsx, /<WorkspaceChatPane onClose=\{chatPanel\.closePanel\} activeSiteDir=\{activeSiteDir\} \/>/);
});

test("main.ts wires the chat's main-process half before the stubs", () => {
  const chat = mainJs.indexOf("startDesktopChat({");
  const stubs = mainJs.indexOf("registerRunnerIpcStubs({ ipcMain })");
  assert.ok(chat > 0, "main.ts no longer starts the desktop chat");
  assert.ok(chat < stubs, "startDesktopChat must register its channels before the stubs (ipcMain.handle throws on a duplicate)");
});

test("the embedded site admin hides its own chat inside the shell: guest flag, preload bridge, admin gate", () => {
  assert.match(guestPolicy, /--tovu-desktop-embedded/, "webview guests are no longer flagged as embedded");
  assert.match(speechPreload, /process\.argv\.includes\(DESKTOP_EMBEDDED_ARG\)/);
  assert.match(speechPreload, /exposeInMainWorld\("tovuDesktop"/);
  assert.match(adminApp, /enabled=\{adminAssistantEnabled && !desktopEmbedded\}/);
});
