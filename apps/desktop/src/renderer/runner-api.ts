import type { ChatMessage } from '@jini-ai/chat/core';
import type { RunnerAgentSummary } from '../contracts/runtime-inventory.js';
import type { SiteRecord, CreateSiteInput, OpenSiteSurfaceInput } from '../contracts/project.js';
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
