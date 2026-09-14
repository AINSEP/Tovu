/**
 * @file Guard for "there is exactly ONE chat FAB", the owner's own words: *"there should only be
 * one chatfab and not two (whether disabled or not)"*.
 *
 * The one that counts is the site's own assistant FAB, which lives INSIDE the `<webview>`
 * (`apps/admin/src/components/ChatFab/`) and is the button with the tools and the content database
 * behind it. This app's fleet page must not render a second one. It did, and the two were not
 * merely redundant: the host-page button was `position: fixed` in the same corner at the same
 * `z-index` as the guest's, so it composited above the guest and swallowed every click meant for
 * the working assistant. An unbuilt placeholder was blocking the built feature.
 *
 * Source text, because `apps/desktop` has no DOM test environment: its test script is
 * `node --test "src/**\/*.test.js"` plus `--import tsx` for `.test.ts`, and there is no jsdom or
 * testing-library in `devDependencies`, so a `.tsx` component cannot be rendered and queried here.
 * The behavioural counterpart is a live `_electron` run against the packaged app; this file is what
 * keeps the decision from being undone silently by an edit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/**
 * `App.tsx` with every comment stripped. Load-bearing: this file's assertions are all "the string
 * `chat-fab` does not appear", and the commit that removed the button deliberately left a long
 * comment where it used to be that NAMES it. Matching against raw source would make that
 * explanation itself fail the test, and the obvious repair — deleting the explanation — is the
 * wrong one. A naive scan of `.tsx` for markup false-positives on comment prose in this repo
 * generally, not just here.
 */
function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// Comments stripped on the stylesheet for the same reason as on `App.tsx`: the rule's removal left
// a comment in its place that names `.chat-fab--disabled`, and that explanation must not read as the
// rule still existing. Caught by running this test, not by reading it — the CSS assertion below
// failed on its own replacement comment first time out.
const appTsx = withoutComments(read("App.tsx"));
const appCss = withoutComments(read("app.css"));
const mainJs = withoutComments(read("..", "..", "main.ts"));

// THE load-bearing assertion, and the negative one. "No `DisabledChatFab`" would pass again the
// moment someone re-adds a host FAB under any other name — including by rendering
// `@jini-ai/chat/react`'s own `ChatFab`, which is the likeliest way it comes back. So this asserts
// the class name that any chat FAB must carry to be styled at all, in the rendered markup rather
// than the removed component's identifier.
test("the fleet page renders no chat FAB of its own — the site's assistant FAB inside the <webview> is the only one", () => {
  assert.doesNotMatch(
    appTsx,
    /chat-fab/,
    "App.tsx renders a chat FAB again. The site's own FAB lives inside the <webview> at the same corner and z-index, so a host-page FAB composites over it and intercepts its clicks.",
  );
});

test("App.tsx does not import a ChatFab component either — the other route the second button comes back by", () => {
  assert.doesNotMatch(appTsx, /\bChatFab\b/);
});

test("the disabled-FAB style went with the button, so nothing is left to style a placeholder back into place", () => {
  assert.doesNotMatch(appCss, /\.chat-fab--disabled\b/);
});

// Kept, because the pane is what a future workspace chat is built from and deleting it is a
// separate decision from removing the button.
test("WorkspaceChatPane survives the FAB's removal, unreferenced, for the panel that replaces it", () => {
  assert.match(read("App.tsx"), /function WorkspaceChatPane\(/);
});

// A tripwire, not a prohibition. The FAB was removed BECAUSE the fleet chat has no main-process
// half: nothing in `main.ts` answers `workspace:chat:start`, so the pane's transport reaches nothing.
// If someone wires those handlers, this fails on purpose — that is the moment to decide where the
// now-real workspace chat is reached from, and the answer should be a panel in this app's own
// chrome rather than a second floating button over the guest.
test("the fleet chat still has no main-process half — if this fails, revisit where the workspace chat is reached from", () => {
  assert.doesNotMatch(
    mainJs,
    /ipcMain\.handle\(\s*WORKSPACE_CHAT_CHANNELS/,
    "main.ts now handles the fleet chat channels. The chat is real; give it a panel entry point, not a second FAB over the <webview>.",
  );
  assert.doesNotMatch(mainJs, /["']workspace:chat:/);
});
