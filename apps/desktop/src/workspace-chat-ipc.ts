/**
 * @file The main-process half of the desktop chat: every `workspace:chat:*`, `runner:agents:*`,
 * `workspace:conversations:*` and `runner:working-directory:*` invoke channel the ported pane calls,
 * backed by the ONE desktop agent (`desktop-agent.ts`) and the app-level conversation store.
 *
 * This is the "phase 2" `runner-ipc-stubs.ts` has been holding the place of: each channel registered
 * here is removed from that file's stub list in the same change, because Electron's `ipcMain.handle`
 * throws on a duplicate registration — a real handler and a stub for one verb is a bug.
 *
 * **Channel literals are INLINED, not imported from `src/contracts/*.ts`** — same trade, same reason
 * as `runner-ipc-stubs.ts`: those contracts import `./sections.js`, which only exists after a build,
 * and main loads `.ts` sources directly. `workspace-chat-ipc.test.ts` parses the contract sources and
 * fails on any drift, so the contracts stay the source of truth. Type-only imports are erased and safe.
 *
 * Streaming over a request/response IPC: `start` attaches the run's `RunLifecycle.stream()`
 * subscription BEFORE it resolves (the contract's own load-bearing ordering — see
 * `contracts/workspace-chat.ts`), and every event is pushed on `workspace:chat:event` tagged with the
 * renderer-minted `subscriptionId`.
 */
import fs from "node:fs";
import path from "node:path";
import type { RunProtocolEvent } from "@jini-ai/protocol";
import { isTrustedMainFrame, type IpcSenderEvent } from "./ipc-sender-trust.ts";
import type { DesktopAgentRuntime } from "./desktop-agent.ts";
import type { TurnAddressee } from "./desktop-agent-tools.ts";
import type { ConversationStore } from "./workspace-conversation-store.ts";
import type { WorkspaceChatEventMessage, WorkspaceChatReattachInput, WorkspaceChatRunSnapshot, WorkspaceChatStartInput } from "./contracts/workspace-chat.ts";
import type { RunnerAgentSummary } from "./contracts/runtime-inventory.ts";
import type { RenameConversationInput, SaveConversationMessageInput } from "./contracts/workspace-conversations.ts";

const WORKSPACE_CHAT_IPC = Object.freeze({
  start: "workspace:chat:start",
  reattach: "workspace:chat:reattach",
  detach: "workspace:chat:detach",
  stop: "workspace:chat:stop",
  status: "workspace:chat:status",
  event: "workspace:chat:event",
  navigate: "workspace:chat:navigate",
});

const AGENT_INVENTORY_IPC = Object.freeze({
  list: "runner:agents:list",
  rescan: "runner:agents:rescan",
  daemonOnline: "runner:daemon:online",
});

const CONVERSATION_IPC = Object.freeze({
  list: "workspace:conversations:list",
  create: "workspace:conversations:create",
  rename: "workspace:conversations:rename",
  delete: "workspace:conversations:delete",
  loadMessages: "workspace:conversations:load-messages",
  saveMessage: "workspace:conversations:save-message",
});

const WORKING_DIRECTORY_IPC = Object.freeze({
  pick: "runner:working-directory:pick",
  recent: "runner:working-directory:recent",
  exists: "runner:working-directory:exists",
  normalize: "runner:working-directory:normalize",
});

/** Every invoke channel this module claims — `runner-ipc-stubs.ts` must not stub any of them. */
const DESKTOP_CHAT_INVOKE_CHANNELS: readonly string[] = Object.freeze([
  WORKSPACE_CHAT_IPC.start, WORKSPACE_CHAT_IPC.reattach, WORKSPACE_CHAT_IPC.detach, WORKSPACE_CHAT_IPC.stop, WORKSPACE_CHAT_IPC.status,
  ...Object.values(AGENT_INVENTORY_IPC),
  ...Object.values(CONVERSATION_IPC),
  ...Object.values(WORKING_DIRECTORY_IPC),
]);

/** The slice of a `WebContents` a subscription pushes to and whose page the sender check reads. */
interface EventSink {
  send(channel: string, message: WorkspaceChatEventMessage): void;
  isDestroyed(): boolean;
  getURL(): string;
}

/** The slice of an Electron invoke event this module reads. */
type ChatIpcEvent = IpcSenderEvent & { sender: EventSink };

/** The slice of Electron's `ipcMain` this module uses. */
interface ChatIpcMain {
  handle(channel: string, listener: (event: ChatIpcEvent, ...args: any[]) => unknown): void;
}

/** Plain words for the one refusal: a page that is not the shell (a site in a frame or tab) asked. */
const SENDER_REFUSED = "Only Tovu's own window can use the desktop chat, so this request was refused. (ERR-DESKTOP-CHAT-SENDER)";

/** The pane's start input plus the active site the shell renderer reports for THIS turn. */
type DesktopChatStartInput = WorkspaceChatStartInput & { activeSiteDir?: string | null };

interface WorkspaceChatIpcDeps {
  ipcMain: ChatIpcMain;
  /** A promise: the runtime binds its loopback listener asynchronously, while these handlers must
   *  be registered synchronously before the shell window can call any of them. */
  runtime: Promise<Pick<DesktopAgentRuntime, "lifecycle" | "startTurn">>;
  conversations: ConversationStore;
  /** Resolves a renderer-reported site dir to a TRACKED site, or `null`. Never trusts the path itself. */
  resolveAddressee: (input: { siteDir: string }, options?: Record<string, never>) => TurnAddressee | null;
  listAgents: (required: { rescan: boolean }) => Promise<RunnerAgentSummary[]>;
  pickDirectory: (required: Record<string, never>, optional?: { currentDirectory?: string }) => Promise<string | null>;
  /** The host's own renderer page(s). Every channel answers only that page's main frame (B115):
   *  these channels run the agent, delete conversations and probe folders. */
  isTrustedUrl: (required: { url: string }) => boolean;
}

/**
 * The turn's addressee from the renderer's report: only a site this app tracks counts, so a
 * renderer cannot point the agent's site tools at an arbitrary folder. Pure over its port.
 * @complexity O(1) plus the resolver.
 */
function addresseeForStart({ input, resolve }: { input: DesktopChatStartInput; resolve: WorkspaceChatIpcDeps["resolveAddressee"] }, _options = {}): TurnAddressee | null {
  const siteDir = input.activeSiteDir;
  return typeof siteDir === "string" && siteDir !== "" ? resolve({ siteDir }) : null;
}

/**
 * Registers every handler. Returns the subscription table's size reader for tests.
 *
 * @param deps ports — `ipcMain`, the agent runtime, the store, and three resolvers.
 * @complexity O(1) per registration; each pushed event is O(1).
 */
function registerWorkspaceChatIpc(deps: WorkspaceChatIpcDeps): { activeSubscriptions: () => number } {
  const subscriptions = new Map<string, () => void>();
  const lifecycleOf = async () => (await deps.runtime).lifecycle;
  // Every handler below goes through this guard, so no channel can be registered without the check.
  const ipcMain: ChatIpcMain = {
    handle: (channel, listener) => deps.ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedMainFrame({ event, isTrustedUrl: deps.isTrustedUrl })) throw new Error(SENDER_REFUSED);
      return listener(event, ...args);
    }),
  };

  const detach = ({ subscriptionId }: { subscriptionId: string }, _options = {}) => {
    subscriptions.get(subscriptionId)?.();
    subscriptions.delete(subscriptionId);
  };

  /** Attaches one subscription; resolves with its outcome. Every event is pushed tagged. */
  const subscribe = createWorkspaceRunSubscriber(detach, lifecycleOf, subscriptions);

  ipcMain.handle(WORKSPACE_CHAT_IPC.start, async (event, input: DesktopChatStartInput) => {
    const { runId } = await (await deps.runtime).startTurn(
      { prompt: input.prompt, agentId: input.agentId },
      {
        ...(input.conversationId === undefined ? {} : { chatId: input.conversationId }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
        ...(input.attachmentPaths === undefined ? {} : { attachmentPaths: input.attachmentPaths }),
        addressee: addresseeForStart({ input, resolve: deps.resolveAddressee }),
      },
    );
    await subscribe({ sender: event.sender, subscriptionId: input.subscriptionId, runId, afterCursor: null });
    return { runId };
  });
  ipcMain.handle(WORKSPACE_CHAT_IPC.reattach, async (event, input: WorkspaceChatReattachInput) => {
    await subscribe({ sender: event.sender, subscriptionId: input.subscriptionId, runId: input.runId, afterCursor: input.afterCursor ?? null });
  });
  ipcMain.handle(WORKSPACE_CHAT_IPC.detach, (_event, { subscriptionId }: { subscriptionId: string }) => detach({ subscriptionId }));
  ipcMain.handle(WORKSPACE_CHAT_IPC.stop, async (_event, { runId }: { runId: string }) => {
    await (await lifecycleOf()).cancel({ runId, reason: "Stopped by the operator." });
  });
  ipcMain.handle(WORKSPACE_CHAT_IPC.status, async (_event, { runId }: { runId: string }): Promise<WorkspaceChatRunSnapshot | null> => {
    const run = await (await lifecycleOf()).get({ runId });
    return run === undefined ? null : { runId: run.id, state: run.state };
  });

  ipcMain.handle(AGENT_INVENTORY_IPC.list, () => deps.listAgents({ rescan: false }));
  ipcMain.handle(AGENT_INVENTORY_IPC.rescan, () => deps.listAgents({ rescan: true }));
  // The daemon is in-process: if this handler answers, it is online.
  ipcMain.handle(AGENT_INVENTORY_IPC.daemonOnline, () => true);

  ipcMain.handle(CONVERSATION_IPC.list, () => deps.conversations.list());
  ipcMain.handle(CONVERSATION_IPC.create, () => deps.conversations.create());
  ipcMain.handle(CONVERSATION_IPC.rename, (_event, input: RenameConversationInput) => deps.conversations.rename(input));
  ipcMain.handle(CONVERSATION_IPC.delete, (_event, { id }: { id: string }) => deps.conversations.remove({ id }));
  ipcMain.handle(CONVERSATION_IPC.loadMessages, (_event, { conversationId }: { conversationId: string }) => deps.conversations.loadMessages({ conversationId }));
  ipcMain.handle(CONVERSATION_IPC.saveMessage, (_event, input: SaveConversationMessageInput) => deps.conversations.saveMessage(input));

  ipcMain.handle(WORKING_DIRECTORY_IPC.pick, (_event, currentDirectory?: string) => deps.pickDirectory({}, { currentDirectory }));
  ipcMain.handle(WORKING_DIRECTORY_IPC.recent, () => []);
  ipcMain.handle(WORKING_DIRECTORY_IPC.exists, (_event, directory: string) => isDirectory({ directory }));
  ipcMain.handle(WORKING_DIRECTORY_IPC.normalize, (_event, directory: string) => (isDirectory({ directory }) ? path.resolve(directory) : null));

  return { activeSubscriptions: () => subscriptions.size };
}

function createWorkspaceRunSubscriber(detach: ({ subscriptionId }: { subscriptionId: string; }, _options?: {}) => void, lifecycleOf: () => Promise<Awaited<WorkspaceChatIpcDeps["runtime"]>["lifecycle"]>, subscriptions: Map<string, () => void>) {
  return async function subscribe({ sender, subscriptionId, runId, afterCursor }: { sender: EventSink; subscriptionId: string; runId: string; afterCursor: string | null }, _options = {}): Promise<void> {
    const push = (message: WorkspaceChatEventMessage) => {
      if (sender.isDestroyed()) { detach({ subscriptionId }); return; }
      sender.send(WORKSPACE_CHAT_IPC.event, message);
    };
    let ended = false;
    const onEvent = (event: RunProtocolEvent) => {
      push({ subscriptionId, kind: "event", event });
      if (event.kind === "end") {
        ended = true;
        push({ subscriptionId, kind: "closed", reason: "terminal" });
        // Deferred: `stream()` may deliver a replayed `end` before it has returned its unsubscribe.
        queueMicrotask(() => detach({ subscriptionId }));
      }
    };
    try {
      const result = await (await lifecycleOf()).stream({ runId, onEvent }, { afterCursor });
      if (result.kind === "ok") {
        // A REPLAYED `end` (an already-finished run) queues its detach before `stream()`'s promise
        // settles, so that detach runs first and finds nothing to drop; registering now would leave a
        // dead subscription in the table for good. Release it instead.
        if (ended) {
          result.unsubscribe();
          return;
        }
        if (!subscriptions.has(subscriptionId)) subscriptions.set(subscriptionId, result.unsubscribe);
        return;
      }
      // Jini answers an evicted / never-started run with `unknown-run`; every other refusal
      // (`replay-gap`, `invalid-cursor`) means the cursor cannot be replayed, so the turn restarts.
      push({ subscriptionId, kind: "closed", reason: result.kind === "unknown-run" ? "unknown-run" : "replay-gap" });
    } catch {
      push({ subscriptionId, kind: "closed", reason: "unknown-run" });
    }
  };
}

/** `true` only for an existing directory. @complexity O(1) syscall. */
function isDirectory({ directory }: { directory: unknown }, _options = {}): boolean {
  if (typeof directory !== "string" || directory === "") return false;
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

export { registerWorkspaceChatIpc, addresseeForStart, DESKTOP_CHAT_INVOKE_CHANNELS, WORKSPACE_CHAT_IPC, AGENT_INVENTORY_IPC, CONVERSATION_IPC, WORKING_DIRECTORY_IPC };
export type { WorkspaceChatIpcDeps, DesktopChatStartInput, EventSink, ChatIpcMain, ChatIpcEvent };
