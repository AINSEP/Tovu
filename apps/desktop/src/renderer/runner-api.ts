import type { ChatMessage } from '@jini-ai/chat/core';
import type { RunnerAgentSummary } from '../contracts/runtime-inventory.js';
import type { ProjectRecord, CreateSiteInput, OpenSiteSurfaceInput } from '../contracts/project.js';
import type {
  RunnerChatEventMessage,
  RunnerChatReattachInput,
  RunnerChatRunSnapshot,
  RunnerChatStartInput,
  RunnerChatStartResult,
} from '../contracts/fleet-chat.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { SaveChatAttachmentInput, SaveChatAttachmentResult } from '../contracts/chat-attachments.js';
import type {
  RenameConversationInput,
  RunnerConversationSummary,
  SaveConversationMessageInput,
} from '../contracts/fleet-conversations.js';

export interface RunnerInventoryBridge {
  listAgents: () => Promise<readonly RunnerAgentSummary[]>;
  rescanAgents: () => Promise<readonly RunnerAgentSummary[]>;
  daemonOnline: () => Promise<boolean>;
  listProjects: () => Promise<readonly ProjectRecord[]>;
  /** Adopts any untracked Tovu site found on disk and returns the refreshed list. Never resurrects
   *  a project the operator removed — see `RUNNER_PROJECT_CHANNELS.rescan`. */
  rescanSites: () => Promise<readonly ProjectRecord[]>;
  /** "Add Tovu Website" — tracks a folder that ALREADY holds a site. Takes no argument: main owns
   *  the folder picker. The folder is only pointed at — never moved, copied, or written to, and no
   *  site is ever created — so an empty, half-initialized, or unrelated folder REJECTS with an
   *  operator-facing reason that names the fix. Surface that message verbatim; see
   *  `use-add-site.hooks.ts`. */
  addSite: () => Promise<ProjectRecord>;
  createProject: (input: CreateSiteInput) => Promise<ProjectRecord>;
  startProject: (id: string) => Promise<ProjectRecord>;
  stopProject: (id: string) => Promise<ProjectRecord>;
  /** Irreversible. Resolves with nothing — the project it names no longer exists. */
  deleteProject: (id: string) => Promise<void>;
  /** Hands one of a project's surfaces to the default browser. Main derives the url from the id. */
  openSiteExternal: (input: OpenSiteSurfaceInput) => Promise<void>;
  chatStart: (input: RunnerChatStartInput) => Promise<RunnerChatStartResult>;
  chatReattach: (input: RunnerChatReattachInput) => Promise<void>;
  chatDetach: (subscriptionId: string) => Promise<void>;
  chatStop: (runId: string) => Promise<void>;
  chatStatus: (runId: string) => Promise<RunnerChatRunSnapshot | null>;
  /** Writes one dropped/picked file's bytes into Runner's staging directory; resolves its absolute path. */
  saveChatAttachment: (input: SaveChatAttachmentInput) => Promise<SaveChatAttachmentResult>;
  /** The fleet chat's persisted conversation threads. Most-recently-active first. */
  listConversations: () => Promise<readonly RunnerConversationSummary[]>;
  createConversation: () => Promise<RunnerConversationSummary>;
  renameConversation: (input: RenameConversationInput) => Promise<void>;
  /** Irreversible: drops the conversation row and every message in it. */
  deleteConversation: (id: string) => Promise<void>;
  loadConversationMessages: (conversationId: string) => Promise<ChatMessage[]>;
  /** Upserts one message by id into a conversation's persisted transcript. */
  saveConversationMessage: (input: SaveConversationMessageInput) => Promise<void>;
  /** Registers a run-event listener; returns its teardown. Every subscription multiplexes over this one channel. */
  onChatEvent: (listener: (message: RunnerChatEventMessage) => void) => () => void;
  /** Fires when the `runner.navigate` tool moves the top nav. */
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
