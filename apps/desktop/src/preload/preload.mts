/**
 * Deliberately narrow renderer bridge for the SITES HOME window. This is a native ESM Electron preload:
 * its `.mjs` output and unsandboxed, context-isolated renderer configuration are required by
 * Electron's ESM loader. The page remains isolated from Node and receives only the two fixed,
 * explicit allowlists below.
 *
 * Ported from `Tovu-Runner/src/preload/preload.mts`. The `tovuRunner` half is that file unchanged;
 * `tovuVoice` is this shell's own addition, and the reason for it is that Electron takes exactly
 * ONE `preload` per window. Site-admin windows keep `sandbox: true` and
 * `src/speech/preload-speech.cts` untouched — the wiring fixed in `4b89cd09` is not disturbed by
 * this file. The sites home window cannot use that preload (it needs `tovuRunner` too), so rather than
 * dropping one bridge it re-exposes both, and the mic keeps working inside the ported UI.
 *
 * **The two speech channel names below are INLINED, not imported from `speech-ipc.ts`.** That
 * module is main-process code: it pulls in `mac-on-device-transcriber.ts` and therefore
 * `child_process`, which has no business being resolved from a preload even an unsandboxed one.
 * The same rule `preload-speech.cts` already follows, for a different reason (see its header on
 * the sandboxed `require` polyfill). `preload.test.ts` guards these two literals against drifting
 * from `speech-ipc.ts`'s own exports, which stay the source of truth.
 *
 * The `tovuRunner` channel names, by contrast, are imported from `../contracts/*.js` — this
 * preload is unsandboxed, so a relative import resolves, and the contracts are pure constant/type
 * modules with no Node surface of their own.
 */
import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron';
import { RUNNER_AGENT_INVENTORY_CHANNELS } from '../contracts/runtime-inventory.js';
import {
  SITE_HISTORY_CHANNEL,
  SITE_IPC_CHANNELS,
  type CreateSiteInput,
  type RenameSiteInput,
  type OpenSiteSurfaceInput,
  type SiteHistoryCommand,
} from '../contracts/project.js';
import {
  WORKSPACE_CHAT_CHANNELS,
  type WorkspaceChatEventMessage,
  type WorkspaceChatReattachInput,
  type WorkspaceChatStartInput,
} from '../contracts/workspace-chat.js';
import { RUNNER_WORKING_DIRECTORY_CHANNELS } from '../contracts/working-directory.js';
import {
  FIND_IN_PAGE_CHANNELS,
  FIND_RESULT_CHANNEL,
  FIND_TOGGLE_CHANNEL,
  type FindInPageQuery,
  type FindInPageResult,
} from '../contracts/find-in-page.js';
import { ZOOM_COMMAND_CHANNEL, type ZoomDirection } from '../contracts/zoom.js';
import { ROOT_KEY_CHANNELS } from '../contracts/root-key.js';
import { RUNNER_CHAT_ATTACHMENT_CHANNELS, type SaveChatAttachmentInput } from '../contracts/chat-attachments.js';
import {
  WORKSPACE_CONVERSATION_CHANNELS,
  type RenameConversationInput,
  type SaveConversationMessageInput,
} from '../contracts/workspace-conversations.js';
import type { RunnerSectionId } from '../contracts/sections.js';

/** Mirrors `src/speech/speech-ipc.js`'s own `IPC_CHANNEL_IS_AVAILABLE` — see this file's header
 *  for why this is a literal instead of an import. */
const IPC_CHANNEL_IS_AVAILABLE = 'tovu:speech:isAvailable';
/** Mirrors `src/speech/speech-ipc.js`'s own `IPC_CHANNEL_TRANSCRIBE` — see this file's header for
 *  why this is a literal instead of an import. */
const IPC_CHANNEL_TRANSCRIBE = 'tovu:speech:transcribe';

/**
 * Subscribes to one main→renderer push channel and hands back the matching teardown.
 *
 * The raw `IpcRendererEvent` is dropped rather than forwarded: it carries `sender`, which is a live
 * handle into IPC that the page has no business holding, and returning the unsubscribe function is
 * what lets the renderer detach a pane without leaking a listener per remount.
 */
function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const handler = (_event: unknown, payload: Payload): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld(
  'tovuRunner',
  Object.freeze({
    listAgents: () => ipcRenderer.invoke(RUNNER_AGENT_INVENTORY_CHANNELS.list),
    rescanAgents: () => ipcRenderer.invoke(RUNNER_AGENT_INVENTORY_CHANNELS.rescan),
    daemonOnline: () => ipcRenderer.invoke(RUNNER_AGENT_INVENTORY_CHANNELS.daemonOnline),
    listSites: () => ipcRenderer.invoke(SITE_IPC_CHANNELS.list),
    /** The shell's BOOT-time root-key verdict — presence, source, a one-way fingerprint and the
     *  key-file path, never key material (`contracts/root-key.ts` has no field that could carry
     *  any). Backs the "no root key" banner. */
    rootKeyStatus: () => ipcRenderer.invoke(ROOT_KEY_CHANNELS.status),
    rescanSites: () => ipcRenderer.invoke(SITE_IPC_CHANNELS.rescan),
    /** "Add Tovu Website" — track a folder that ALREADY holds a site. Takes no argument: main owns
     *  the folder dialog, so the renderer never names a filesystem path. Rejects when the operator
     *  cancels, or when the folder is not already a complete Tovu site — surface that message
     *  verbatim, it names the fix. See `SITE_IPC_CHANNELS.addSite`. */
    addSite: () => ipcRenderer.invoke(SITE_IPC_CHANNELS.addSite),
    createSite: (input: CreateSiteInput) => ipcRenderer.invoke(SITE_IPC_CHANNELS.create, input),
    /** Change a site's display name — `config.json`'s `name`. Rejects with an operator-facing
     *  reason when the row is unknown, the folder is no longer a Tovu site, its recorded identity
     *  no longer matches, or the name is empty/blank/over 200 chars after trimming. Surface that
     *  message verbatim. See `SITE_IPC_CHANNELS.rename`. */
    renameSite: (input: RenameSiteInput) => ipcRenderer.invoke(SITE_IPC_CHANNELS.rename, input),
    /** A site's cached preview as a `data:` URL, or `null` when no capture exists yet. Fetched on
     *  demand rather than carried on `SiteRecord` — see that field's own doc. See `SITE_IPC_CHANNELS.preview`. */
    getSitePreview: (id: string) => ipcRenderer.invoke(SITE_IPC_CHANNELS.preview, id),
    startSite: (id: string) => ipcRenderer.invoke(SITE_IPC_CHANNELS.start, id),
    stopSite: (id: string) => ipcRenderer.invoke(SITE_IPC_CHANNELS.stop, id),
    deleteSite: (id: string) => ipcRenderer.invoke(SITE_IPC_CHANNELS.delete, id),
    openSiteExternal: (input: OpenSiteSurfaceInput) =>
      ipcRenderer.invoke(SITE_IPC_CHANNELS.openExternal, input),
    chatStart: (input: WorkspaceChatStartInput) => ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.start, input),
    chatReattach: (input: WorkspaceChatReattachInput) => ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.reattach, input),
    chatDetach: (subscriptionId: string) => ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.detach, { subscriptionId }),
    chatStop: (runId: string) => ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.stop, { runId }),
    chatStatus: (runId: string) => ipcRenderer.invoke(WORKSPACE_CHAT_CHANNELS.status, { runId }),
    onChatEvent: (listener: (message: WorkspaceChatEventMessage) => void) =>
      subscribe(WORKSPACE_CHAT_CHANNELS.event, listener),
    onNavigate: (listener: (section: RunnerSectionId) => void) =>
      subscribe(WORKSPACE_CHAT_CHANNELS.navigate, listener),
    /** The app menu's History > Back / Forward. Only the visible project tab subscribes. */
    onSiteHistory: (listener: (command: SiteHistoryCommand) => void) =>
      subscribe(SITE_HISTORY_CHANNEL, listener),
    /** The app menu's Find (Cmd+F). Carries no payload — see `use-find-in-page.hooks.ts`. */
    onFindToggle: (listener: () => void) => subscribe<undefined>(FIND_TOGGLE_CHANNEL, listener),
    /** Runs a `webContents.findInPage` on the SITES HOME WINDOW'S OWN top-level page — used only
     *  when no project tab's `<webview>` is the visible surface. See `find-in-page-ipc.ts`. */
    findInPage: (query: FindInPageQuery) => ipcRenderer.invoke(FIND_IN_PAGE_CHANNELS.find, query),
    stopFindInPage: () => ipcRenderer.invoke(FIND_IN_PAGE_CHANNELS.stop),
    /** One `found-in-page` result for the top-level target above. */
    onFindResult: (listener: (result: FindInPageResult) => void) => subscribe(FIND_RESULT_CHANNEL, listener),
    /** The app menu's Zoom In / Zoom Out / Actual Size (Cmd+Plus / Cmd+- / Cmd+0). Carries the
     *  direction. See `use-zoom.hooks.ts`. */
    onZoomCommand: (listener: (direction: ZoomDirection) => void) => subscribe(ZOOM_COMMAND_CHANNEL, listener),
    /**
     * The SITES HOME WINDOW'S OWN top-level page's zoom — used only when no project tab's
     * `<webview>` is the visible surface, which zooms itself directly instead (`WebviewTag`'s own
     * `getZoomLevel`/`setZoomLevel`). Synchronous and in-process, like `getPathForFile` above:
     * `webFrame` is this renderer's OWN frame, so there is nothing for main to do here — no
     * `ipcRenderer.invoke` round trip, unlike `findInPage`'s top-level target (which needs
     * `webContents`, main-process-only). Zoom level 0 is 100%; see Electron's own `webFrame` doc.
     */
    getZoomLevel: () => webFrame.getZoomLevel(),
    setZoomLevel: (level: number) => webFrame.setZoomLevel(level),
    // Synchronous and in-process, deliberately not an `ipcRenderer.invoke` round trip: `webUtils`
    // only exists in the preload's Node-capable context, not the isolated page, so this function IS
    // the bridge rather than a proxy for one. Electron's contextBridge structured-clones `File`
    // arguments across the isolation boundary specifically to make this call possible.
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    pickWorkingDirectory: (currentDirectory?: string) =>
      ipcRenderer.invoke(RUNNER_WORKING_DIRECTORY_CHANNELS.pick, currentDirectory),
    recentWorkingDirectories: () => ipcRenderer.invoke(RUNNER_WORKING_DIRECTORY_CHANNELS.recent),
    workingDirectoryExists: (directory: string) =>
      ipcRenderer.invoke(RUNNER_WORKING_DIRECTORY_CHANNELS.exists, directory),
    normalizeWorkingDirectory: (directory: string) =>
      ipcRenderer.invoke(RUNNER_WORKING_DIRECTORY_CHANNELS.normalize, directory),
    saveChatAttachment: (input: SaveChatAttachmentInput) =>
      ipcRenderer.invoke(RUNNER_CHAT_ATTACHMENT_CHANNELS.save, input),
    listConversations: () => ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.list),
    createConversation: () => ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.create),
    renameConversation: (input: RenameConversationInput) =>
      ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.rename, input),
    deleteConversation: (id: string) => ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.delete, { id }),
    loadConversationMessages: (conversationId: string) =>
      ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.loadMessages, { conversationId }),
    saveConversationMessage: (input: SaveConversationMessageInput) =>
      ipcRenderer.invoke(WORKSPACE_CONVERSATION_CHANNELS.saveMessage, input),
  }),
);

/**
 * Byte-for-byte the same surface `src/speech/preload-speech.cts` exposes, against the same two
 * channels `registerSpeechIpc` registers — see this file's header for why the sites home window needs
 * its own copy rather than sharing that preload.
 */
contextBridge.exposeInMainWorld(
  'tovuVoice',
  Object.freeze({
    isAvailable: () => ipcRenderer.invoke(IPC_CHANNEL_IS_AVAILABLE),
    transcribe: (samples: Float32Array | readonly number[], sampleRate: number) =>
      ipcRenderer.invoke(IPC_CHANNEL_TRANSCRIBE, samples, sampleRate),
  }),
);
