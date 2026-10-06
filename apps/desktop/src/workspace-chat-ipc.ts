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

/** The slice of a `WebContents` a subscription pushes to. */
interface EventSink {
  send(channel: string, message: WorkspaceChatEventMessage): void;
  isDestroyed(): boolean;
}

/** The slice of Electron's `ipcMain` this module uses. */
interface ChatIpcMain {
  handle(channel: string, listener: (event: { sender: EventSink }, ...args: any[]) => unknown): void;
}

/** The pane's start input plus the active site the shell renderer reports for THIS turn. */
type DesktopChatStartInput = WorkspaceChatStartInput & { activeSiteDir?: string | null };

interface WorkspaceChatIpcDeps {
  ipcMain: ChatIpcMain;
  /** A promise: the runtime binds its loopback listener asynchronously, while these handlers must
   *  be registered synchronously before the shell window can call any of them. */
  runtime: Promise<Pick<DesktopAgentRuntime, "lifecycle" | "startTurn">>;
  conversations: ConversationStore;
  /** Resolves a renderer-reported site dir to a TRACKED site, or `null`. Never trusts the path itself. */
  resolveAddressee: (siteDir: string) => TurnAddressee | null;
  listAgents: (required: { rescan: boolean }) => Promise<RunnerAgentSummary[]>;
  pickDirectory: (currentDirectory?: string) => Promise<string | null>;
}

/**
 * The turn's addressee from the renderer's report: only a site this app tracks counts, so a
 * renderer cannot point the agent's site tools at an arbitrary folder. Pure over its port.
 * @complexity O(1) plus the resolver.
 */
function addresseeForStart(input: DesktopChatStartInput, resolve: WorkspaceChatIpcDeps["resolveAddressee"]): TurnAddressee | null {
  const siteDir = input.activeSiteDir;
  return typeof siteDir === "string" && siteDir !== "" ? resolve(siteDir) : null;
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

  const detach = (subscriptionId: string) => {
    subscriptions.get(subscriptionId)?.();
    subscriptions.delete(subscriptionId);
  };

  /** Attaches one subscription; resolves with its outcome. Every event is pushed tagged. */
  async function subscribe(sender: EventSink, subscriptionId: string, runId: string, afterCursor: string | null): Promise<void> {
    const push = (message: WorkspaceChatEventMessage) => {
      if (sender.isDestroyed()) return detach(subscriptionId);
      sender.send(WORKSPACE_CHAT_IPC.event, message);
    };
    const onEvent = (event: RunProtocolEvent) => {
      push({ subscriptionId, kind: "event", event });
      if (event.kind === "end") {
        push({ subscriptionId, kind: "closed", reason: "terminal" });
        // Deferred: `stream()` may deliver a replayed `end` before it has returned its unsubscribe.
        queueMicrotask(() => detach(subscriptionId));
      }
    };
    try {
      const result = await (await lifecycleOf()).stream({ runId, onEvent }, { afterCursor });
      if (result.kind === "ok") {
        if (!subscriptions.has(subscriptionId)) subscriptions.set(subscriptionId, result.unsubscribe);
        return;
      }
      push({ subscriptionId, kind: "closed", reason: "replay-gap" });
    } catch {
      push({ subscriptionId, kind: "closed", reason: "unknown-run" });
    }
  }

  deps.ipcMain.handle(WORKSPACE_CHAT_IPC.start, async (event, input: DesktopChatStartInput) => {
    const { runId } = await (await deps.runtime).startTurn(
      { prompt: input.prompt, agentId: input.agentId },
      {
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
        ...(input.attachmentPaths === undefined ? {} : { attachmentPaths: input.attachmentPaths }),
        addressee: addresseeForStart(input, deps.resolveAddressee),
      },
    );
    await subscribe(event.sender, input.subscriptionId, runId, null);
    return { runId };
  });
  deps.ipcMain.handle(WORKSPACE_CHAT_IPC.reattach, async (event, input: WorkspaceChatReattachInput) => {
    await subscribe(event.sender, input.subscriptionId, input.runId, input.afterCursor ?? null);
  });
  deps.ipcMain.handle(WORKSPACE_CHAT_IPC.detach, (_event, { subscriptionId }: { subscriptionId: string }) => detach(subscriptionId));
  deps.ipcMain.handle(WORKSPACE_CHAT_IPC.stop, async (_event, { runId }: { runId: string }) => {
    await (await lifecycleOf()).cancel({ runId, reason: "Stopped by the operator." });
  });
  deps.ipcMain.handle(WORKSPACE_CHAT_IPC.status, async (_event, { runId }: { runId: string }): Promise<WorkspaceChatRunSnapshot | null> => {
    const run = await (await lifecycleOf()).get({ runId });
    return run === undefined ? null : { runId: run.id, state: run.state };
  });

  deps.ipcMain.handle(AGENT_INVENTORY_IPC.list, () => deps.listAgents({ rescan: false }));
  deps.ipcMain.handle(AGENT_INVENTORY_IPC.rescan, () => deps.listAgents({ rescan: true }));
  // The daemon is in-process: if this handler answers, it is online.
  deps.ipcMain.handle(AGENT_INVENTORY_IPC.daemonOnline, () => true);

  deps.ipcMain.handle(CONVERSATION_IPC.list, () => deps.conversations.list());
  deps.ipcMain.handle(CONVERSATION_IPC.create, () => deps.conversations.create());
  deps.ipcMain.handle(CONVERSATION_IPC.rename, (_event, input: RenameConversationInput) => deps.conversations.rename(input));
  deps.ipcMain.handle(CONVERSATION_IPC.delete, (_event, { id }: { id: string }) => deps.conversations.remove({ id }));
  deps.ipcMain.handle(CONVERSATION_IPC.loadMessages, (_event, { conversationId }: { conversationId: string }) => deps.conversations.loadMessages({ conversationId }));
  deps.ipcMain.handle(CONVERSATION_IPC.saveMessage, (_event, input: SaveConversationMessageInput) => deps.conversations.saveMessage(input));

  deps.ipcMain.handle(WORKING_DIRECTORY_IPC.pick, (_event, currentDirectory?: string) => deps.pickDirectory(currentDirectory));
  deps.ipcMain.handle(WORKING_DIRECTORY_IPC.recent, () => []);
  deps.ipcMain.handle(WORKING_DIRECTORY_IPC.exists, (_event, directory: string) => isDirectory(directory));
  deps.ipcMain.handle(WORKING_DIRECTORY_IPC.normalize, (_event, directory: string) => (isDirectory(directory) ? path.resolve(directory) : null));

  return { activeSubscriptions: () => subscriptions.size };
}

/** `true` only for an existing directory. @complexity O(1) syscall. */
function isDirectory(directory: unknown): boolean {
  if (typeof directory !== "string" || directory === "") return false;
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

export { registerWorkspaceChatIpc, addresseeForStart, DESKTOP_CHAT_INVOKE_CHANNELS, WORKSPACE_CHAT_IPC, AGENT_INVENTORY_IPC, CONVERSATION_IPC, WORKING_DIRECTORY_IPC };
export type { WorkspaceChatIpcDeps, DesktopChatStartInput, EventSink, ChatIpcMain };
