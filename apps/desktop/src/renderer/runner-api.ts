import type { ChatMessage } from '@jini-ai/chat/core';
import type { RunnerAgentSummary } from '../contracts/runtime-inventory.js';
import type {
  SiteRecord,
  CreateSiteInput,
  OpenSiteSurfaceInput,
  RenameSiteInput,
  SiteHistoryCommand,
} from '../contracts/project.js';
import type {
  WorkspaceChatEventMessage,
  WorkspaceChatReattachInput,
  WorkspaceChatRunSnapshot,
  WorkspaceChatStartInput,
  WorkspaceChatStartResult,
} from '../contracts/workspace-chat.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { SaveChatAttachmentInput, SaveChatAttachmentResult } from '../contracts/chat-attachments.js';
import type {
  RenameConversationInput,
  WorkspaceConversationSummary,
  SaveConversationMessageInput,
} from '../contracts/workspace-conversations.js';
import type { FindInPageQuery, FindInPageResult } from '../contracts/find-in-page.js';
import type { ZoomDirection } from '../contracts/zoom.js';

export interface RunnerInventoryBridge {
  listAgents: () => Promise<readonly RunnerAgentSummary[]>;
  rescanAgents: () => Promise<readonly RunnerAgentSummary[]>;
  daemonOnline: () => Promise<boolean>;
  listSites: () => Promise<readonly SiteRecord[]>;
  /** Adopts any untracked Tovu site found on disk and returns the refreshed list. Never resurrects
   *  a project the operator removed — see `SITE_IPC_CHANNELS.rescan`. */
  rescanSites: () => Promise<readonly SiteRecord[]>;
  /** "Add Tovu Website" — tracks a folder that ALREADY holds a site. Takes no argument: main owns
   *  the folder picker. The folder is only pointed at — never moved, copied, or written to, and no
   *  site is ever created — so an empty, half-initialized, or unrelated folder REJECTS with an
   *  operator-facing reason that names the fix. Surface that message verbatim; see
   *  `use-add-site.hooks.ts`. */
  addSite: () => Promise<SiteRecord>;
  createSite: (input: CreateSiteInput) => Promise<SiteRecord>;
  /** Changes a site's display name (`config.json`'s `name`) and resolves the refreshed record.
   *  Rejects with an operator-facing reason — surface it verbatim; see `use-rename-site.hooks.ts`. */
  renameSite: (input: RenameSiteInput) => Promise<SiteRecord>;
  /** One site's cached preview image as a `data:` URL, or `null` when no capture exists yet — the
   *  ordinary state for a site that has never been opened. Fetch again only when
   *  `SiteRecord.previewVersion` CHANGES; see that field's own doc and `use-site-preview.hooks.ts`. */
  getSitePreview: (id: string) => Promise<string | null>;
  startSite: (id: string) => Promise<SiteRecord>;
  stopSite: (id: string) => Promise<SiteRecord>;
  /** Irreversible. Resolves with nothing — the project it names no longer exists. */
  deleteSite: (id: string) => Promise<void>;
  /** Hands one of a project's surfaces to the default browser. Main derives the url from the id. */
  openSiteExternal: (input: OpenSiteSurfaceInput) => Promise<void>;
  chatStart: (input: WorkspaceChatStartInput) => Promise<WorkspaceChatStartResult>;
  chatReattach: (input: WorkspaceChatReattachInput) => Promise<void>;
  chatDetach: (subscriptionId: string) => Promise<void>;
  chatStop: (runId: string) => Promise<void>;
  chatStatus: (runId: string) => Promise<WorkspaceChatRunSnapshot | null>;
  /** Writes one dropped/picked file's bytes into Runner's staging directory; resolves its absolute path. */
  saveChatAttachment: (input: SaveChatAttachmentInput) => Promise<SaveChatAttachmentResult>;
  /** The fleet chat's persisted conversation threads. Most-recently-active first. */
  listConversations: () => Promise<readonly WorkspaceConversationSummary[]>;
  createConversation: () => Promise<WorkspaceConversationSummary>;
  renameConversation: (input: RenameConversationInput) => Promise<void>;
  /** Irreversible: drops the conversation row and every message in it. */
  deleteConversation: (id: string) => Promise<void>;
  loadConversationMessages: (conversationId: string) => Promise<ChatMessage[]>;
  /** Upserts one message by id into a conversation's persisted transcript. */
  saveConversationMessage: (input: SaveConversationMessageInput) => Promise<void>;
  /** Registers a run-event listener; returns its teardown. Every subscription multiplexes over this one channel. */
  onChatEvent: (listener: (message: WorkspaceChatEventMessage) => void) => () => void;
  /** Fires when the `desktop.navigate` tool moves the top nav. */
  onNavigate: (listener: (section: RunnerSectionId) => void) => () => void;
  /** Fires on the app menu's History > Back / Forward (Cmd+[ / Cmd+]); returns its teardown. */
  onSiteHistory: (listener: (command: SiteHistoryCommand) => void) => () => void;
  /** Fires on the app menu's Find (Cmd+F); returns its teardown. See `use-find-in-page.hooks.ts`. */
  onFindToggle: (listener: () => void) => () => void;
  /** Runs a `webContents.findInPage` on the SITES HOME WINDOW'S OWN top-level page — used only when
   *  no project tab's `<webview>` is the visible surface, which calls its own `findInPage` directly
   *  instead. See `contracts/find-in-page.ts`'s header for the full split. */
  findInPage: (query: FindInPageQuery) => Promise<void>;
  stopFindInPage: () => Promise<void>;
  /** One `found-in-page` result for the top-level target above; returns its teardown. */
  onFindResult: (listener: (result: FindInPageResult) => void) => () => void;
  /** Fires on the app menu's Zoom In / Zoom Out / Actual Size (Cmd+Plus / Cmd+- / Cmd+0); returns
   *  its teardown. See `use-zoom.hooks.ts`. */
  onZoomCommand: (listener: (direction: ZoomDirection) => void) => () => void;
  /** The sites home window's OWN top-level page's zoom level (0 = 100%) — used only when no project
   *  tab's `<webview>` is the visible surface, which zooms itself directly instead. Synchronous,
   *  like `getPathForFile`: see the preload's own doc on why this needs no IPC round trip. */
  getZoomLevel: () => number;
  setZoomLevel: (level: number) => void;
  /**
   * Resolves a `File`'s absolute OS path. Runs in the preload, not over IPC — see the bridge
   * implementation. Returns `''` for a `File` that did not come directly off a drop/dialog event
   * (e.g. one synthesized by `@jini-ai/ui`'s folder-expansion via the `FileSystemEntry` API), which
   * is exactly why folder-drop recovery reads `dataTransfer.files` before that expansion runs.
   */
  getPathForFile: (file: File) => string;
  /** Native folder dialog. Resolves `null` when the operator cancels. Also records the pick as recent. */
  pickWorkingDirectory: (currentDirectory?: string) => Promise<string | null>;
  recentWorkingDirectories: () => Promise<readonly string[]>;
  workingDirectoryExists: (directory: string) => Promise<boolean>;
  normalizeWorkingDirectory: (directory: string) => Promise<string | null>;
}

declare global {
  interface Window {
    tovuRunner?: RunnerInventoryBridge;
  }
}

export function runnerInventoryBridge(): RunnerInventoryBridge | undefined {
  return window.tovuRunner;
}
