/**
 * @file Explicit not-yet-implemented handlers for every `runner:*` IPC verb the ported sites home
 * renderer can call.
 *
 * Phase 1 of the Tovu-Runner port brought the renderer, the shared contracts, and the preload
 * across; `Tovu-Runner/src/main/` — the project registry, the provisioner, the co-located Jini
 * daemon, the fleet-chat IPC and the conversation store — is phase 2. Without something registered
 * here, `ipcRenderer.invoke` on those channels rejects with Electron's own generic "No handler
 * registered for '<channel>'", which is indistinguishable from a wiring bug.
 *
 * **Every handler throws. None returns a value.** An empty array from a stubbed list channel would
 * render as a real, correct, empty result — a lie the UI has no way to detect. A rejection surfaces
 * in the renderer's own error paths as text naming the channel, which is the honest answer to "why
 * is nothing here". (`runner:sites:list`/`create`/`delete`/`open-external`/`start` are no
 * longer stubbed here — see `project-ipc.js` for their real handlers.)
 *
 * The push channels — `workspace:chat:event`, `workspace:chat:navigate` and `runner:sites:history` —
 * are deliberately absent. They are main→renderer sends, not `invoke` targets, so there is no
 * handler to register and no stub to write. The two chat channels have no sender until phase 2;
 * `runner:sites:history` is sent by the app menu (`site-history-menu.ts`).
 *
 * **The channel literals below are INLINED rather than read from `src/contracts/*.ts`.** This is
 * CommonJS main-process code and those are TypeScript; the compiled `dist/contracts/*.js` exists
 * only after a build, and the stubs must be registerable from a source checkout. Same trade
 * `src/speech/preload-speech.cjs` makes. `runner-ipc-stubs.test.js` parses the contract sources
 * and fails if any literal here drifts from them, so the contracts stay the source of truth.
 */

/** The marker every stub rejects with. Named so a renderer-side error message, a log line, or a
 *  test can identify the cause without matching on prose. */
const RUNNER_MAIN_NOT_PORTED = "RUNNER_MAIN_NOT_PORTED";

/**
 * Every `ipcRenderer.invoke` channel `src/preload/preload.mts` exposes, grouped by the contract
 * file that declares it. Kept as a flat frozen list because the only thing this module does with
 * them is register one identical handler per name.
 */
const RUNNER_STUB_CHANNELS = Object.freeze([
  // contracts/runtime-inventory.ts
  "runner:agents:list",
  "runner:agents:rescan",
  "runner:daemon:online",
  // contracts/project.ts — list/create/delete/open-external/start are real handlers now
  // (`project-ipc.js`, registered in `main.js` before this module runs). `stop` stays stubbed —
  // no control in the per-project bar calls it yet; see `SITE_IPC_CHANNELS.stop`'s own doc.
  "runner:sites:stop",
  // contracts/workspace-chat.ts — `event` and `navigate` are push-only, see this file's header
  "workspace:chat:start",
  "workspace:chat:reattach",
  "workspace:chat:detach",
  "workspace:chat:stop",
  "workspace:chat:status",
  // contracts/working-directory.ts
  "runner:working-directory:pick",
  "runner:working-directory:recent",
  "runner:working-directory:exists",
  "runner:working-directory:normalize",
  // contracts/chat-attachments.ts
  "runner:chat-attachments:save",
  // contracts/workspace-conversations.ts
  "workspace:conversations:list",
  "workspace:conversations:create",
  "workspace:conversations:rename",
  "workspace:conversations:delete",
  "workspace:conversations:load-messages",
  "workspace:conversations:save-message",
]);

/**
 * The error one stubbed channel rejects with. Built rather than shared so each rejection names its
 * own channel — a single shared instance would carry one channel's name into every other's stack.
 *
 * @param {string} channel
 * @returns {Error}
 * @complexity O(1).
 */
function notPortedError(channel) {
  const error = new Error(
    `${RUNNER_MAIN_NOT_PORTED}: ${channel} has no main-process implementation yet. The Tovu-Runner UI port brought the renderer across in phase 1; Tovu-Runner/src/main/ lands in phase 2.`,
  );
  error.code = RUNNER_MAIN_NOT_PORTED;
  error.channel = channel;
  return error;
}

/**
 * Registers one throwing handler per channel in {@link RUNNER_STUB_CHANNELS}.
 *
 * Callers must not call this for a channel phase 2 has already implemented — Electron's
 * `ipcMain.handle` throws on a duplicate registration, which is the desired failure: a real
 * handler and a stub for the same verb is a bug, not a fallback. Removing a name from the list
 * above is therefore part of implementing it.
 *
 * @param {{ ipcMain: { handle: (channel: string, listener: Function) => void } }} deps
 *   Injected rather than `require("electron")`'d so this is testable under plain `node --test`.
 * @returns {readonly string[]} the channels registered, in list order.
 * @complexity O(n) in the channel count (19, fixed — 24 total minus the 5 real handlers in
 *   `project-ipc.js`).
 */
function registerRunnerIpcStubs({ ipcMain }) {
  for (const channel of RUNNER_STUB_CHANNELS) {
    ipcMain.handle(channel, () => {
      throw notPortedError(channel);
    });
  }
  return RUNNER_STUB_CHANNELS;
}

export { registerRunnerIpcStubs, notPortedError, RUNNER_STUB_CHANNELS, RUNNER_MAIN_NOT_PORTED };
