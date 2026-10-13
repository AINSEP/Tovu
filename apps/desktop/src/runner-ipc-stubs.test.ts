/**
 * @file Coverage for `runner-ipc-stubs.ts`.
 *
 * Two jobs. The behavioural one: prove every stub REJECTS rather than resolving — a stub that
 * quietly returned `[]` or `null` would render as real, correct, empty state, which is the exact
 * failure mode this module exists to prevent.
 *
 * The drift one: `runner-ipc-stubs.ts` inlines its channel literals because it is CommonJS
 * main-process code and the contracts are TypeScript (see that file's header). This test imports
 * the real `*_CHANNELS` values and compares both
 * directions, so renaming a channel in a contract, or adding a new verb to one, fails here instead
 * of at runtime inside Electron.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { SITE_IPC_CHANNELS, SITE_HISTORY_CHANNEL, SITE_THEME_PREVIEW_CHANNELS } from "./contracts/project.ts";
import { RUNNER_AGENT_INVENTORY_CHANNELS } from "./contracts/runtime-inventory.ts";
import { RUNNER_WORKING_DIRECTORY_CHANNELS } from "./contracts/working-directory.ts";
import { WORKSPACE_CONVERSATION_CHANNELS } from "./contracts/workspace-conversations.ts";
import { WORKSPACE_CHAT_CHANNELS } from "./contracts/workspace-chat.ts";
import { RUNNER_CHAT_ATTACHMENT_CHANNELS } from "./contracts/chat-attachments.ts";
import { FIND_IN_PAGE_CHANNELS, FIND_TOGGLE_CHANNEL, FIND_RESULT_CHANNEL } from "./contracts/find-in-page.ts";
import { ZOOM_COMMAND_CHANNEL } from "./contracts/zoom.ts";

import { registerRunnerIpcStubs, notPortedError, RUNNER_STUB_CHANNELS, RUNNER_MAIN_NOT_PORTED } from "./runner-ipc-stubs.ts";
import type { RunnerNotPortedError } from "./runner-ipc-stubs.ts";
import { RUNNER_APP_VERSION_CHANNEL } from "./contracts/app-version.ts";

/**
 * Channels declared by `src/contracts/*.ts`, minus the push-only ones.
 *
 * Import values through the same runtime contract as production; source formatting cannot
 * manufacture or hide a channel. A new contract module must join this import list.
 */
function declaredChannels(): Set<string> {
  const found = new Set<string>([
    ...Object.values(SITE_IPC_CHANNELS), ...Object.values(SITE_THEME_PREVIEW_CHANNELS),
    ...Object.values(RUNNER_AGENT_INVENTORY_CHANNELS), ...Object.values(RUNNER_WORKING_DIRECTORY_CHANNELS),
    ...Object.values(WORKSPACE_CONVERSATION_CHANNELS), ...Object.values(WORKSPACE_CHAT_CHANNELS),
    ...Object.values(RUNNER_CHAT_ATTACHMENT_CHANNELS), ...Object.values(FIND_IN_PAGE_CHANNELS),
    RUNNER_APP_VERSION_CHANNEL, SITE_HISTORY_CHANNEL, FIND_TOGGLE_CHANNEL, FIND_RESULT_CHANNEL, ZOOM_COMMAND_CHANNEL,
  ]);
  // Main->renderer sends, not `invoke` targets: there is no handler to register for any of them, so
  // `runner-ipc-stubs.ts` deliberately omits them. `find:query`/`find:stop` are NOT in this list —
  // those two ARE real `invoke` targets, with real handlers in `find-in-page-ipc.ts`; see
  // `IMPLEMENTED_CHANNELS` below.
  found.delete("workspace:chat:event");
  found.delete("workspace:chat:navigate");
  found.delete("runner:sites:history");
  found.delete("runner:find:toggle");
  found.delete("runner:find:result");
  found.delete("runner:zoom:command");
  found.delete("runner:sites:theme-preview:event");
  return found;
}

/**
 * Channels the Projects screen needs for real, given real handlers in `project-ipc.ts` (registered
 * in `main.ts` before `registerRunnerIpcStubs` runs) — see `SITE_IPC_CHANNELS`'s own doc.
 * Declared by the contracts, on purpose absent from `RUNNER_STUB_CHANNELS`: a real handler and a
 * stub for the same channel is a duplicate `ipcMain.handle` registration, which Electron itself
 * refuses. `stop` joined them with the site card's own Stop button — every `runner:sites:*` verb is
 * real now.
 */
const IMPLEMENTED_CHANNELS = new Set([
  // Read-only native version handler in app-version-ipc.ts, registered before the home window.
  RUNNER_APP_VERSION_CHANNEL,
  "runner:sites:list",
  "runner:sites:create",
  "runner:sites:plan-new-dir",
  "runner:sites:delete",
  "runner:sites:open-external",
  "runner:sites:start",
  "runner:sites:stop",
  "runner:sites:rescan",
  "runner:sites:folders:list",
  "runner:sites:folders:add",
  "runner:sites:folders:remove",
  "runner:sites:home:set",
  "runner:sites:settings:save",
  "runner:sites:add-site",
  "runner:sites:rename",
  "runner:sites:preview",
  "runner:sites:locate",
  "runner:sites:token-sign-in-plugins",
  // Real subscription handlers in site-theme-preview-ipc.ts; its event is push-only.
  "runner:sites:theme-preview:watch",
  "runner:sites:theme-preview:unwatch",
  // Real handlers in `find-in-page-ipc.ts` (`registerFindInPageIpc`, called from `main.ts`) — the
  // sites home window's OWN top-level find target. `runner:find:toggle`/`runner:find:result` are
  // push-only and excluded in `declaredChannels()` instead; see that function's own comment.
  "runner:find:query",
  "runner:find:stop",
]);

test("the runtime contracts declare a nonempty IPC surface", () => {
  assert.ok(declaredChannels().size >= 20, `expected 20+ channels, got ${declaredChannels().size}`);
});

test("every channel the contracts declare has a stub or a real handler", () => {
  const missing = [...declaredChannels()].filter(
    (channel) => !RUNNER_STUB_CHANNELS.includes(channel) && !IMPLEMENTED_CHANNELS.has(channel),
  );
  assert.deepEqual(missing, []);
});

test("every stubbed channel is declared by a contract", () => {
  const declared = declaredChannels();
  const orphaned = RUNNER_STUB_CHANNELS.filter((channel) => !declared.has(channel));
  assert.deepEqual(orphaned, []);
});

test("no channel is both stubbed and implemented for real", () => {
  const both = RUNNER_STUB_CHANNELS.filter((channel) => IMPLEMENTED_CHANNELS.has(channel));
  assert.deepEqual(both, []);
});

test("the push-only channels are NOT stubbed", () => {
  assert.equal(RUNNER_STUB_CHANNELS.includes("workspace:chat:event"), false);
  assert.equal(RUNNER_STUB_CHANNELS.includes("workspace:chat:navigate"), false);
  assert.equal(RUNNER_STUB_CHANNELS.includes("runner:sites:history"), false);
});

test("registerRunnerIpcStubs registers one handler per channel", () => {
  const registered = new Map<string, () => never>();
  const returned = registerRunnerIpcStubs({ ipcMain: { handle: (c, l) => registered.set(c, l) } });

  assert.deepEqual([...registered.keys()], [...RUNNER_STUB_CHANNELS]);
  assert.deepEqual(returned, RUNNER_STUB_CHANNELS);
});

test("every registered handler throws rather than returning any value", () => {
  const registered = new Map<string, () => never>();
  registerRunnerIpcStubs({ ipcMain: { handle: (c, l) => registered.set(c, l) } });

  for (const [channel, handler] of registered) {
    assert.throws(handler, (error: RunnerNotPortedError) => {
      assert.equal(error.code, RUNNER_MAIN_NOT_PORTED);
      assert.equal(error.channel, channel);
      assert.match(error.message, new RegExp(`^${RUNNER_MAIN_NOT_PORTED}: ${channel} has no main-process implementation yet\\.`));
      return true;
    }, `handler for ${channel} did not throw`);
  }
});

test("notPortedError names the channel it was built for, not a shared one", () => {
  assert.notEqual(
    notPortedError("workspace:chat:start").message,
    notPortedError("workspace:chat:stop").message,
  );
});
