import { render, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatTransport } from "@jini-ai/chat/core";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { emptyComposerCapabilityProjection } from "@jini-ai/admin/screens/plugins/composer-capabilities";
import { AssistantDock } from "../AssistantDock";
import { useApplyConversationDeepLink } from "../../../features/routines/use-conversation-deep-link";

/**
 * Through the real dock and its real `useAssistantDockState`: a `?conversation=` link reaches the SAME
 * `chats` the picker uses, calls `select` once, opens the dock, and never starts a run. Only IO is fake.
 */
function mountDock({ query, found }: { query: string | null; found: boolean }) {
  const startRun = vi.fn<ChatTransport["startRun"]>();
  const transport: ChatTransport = { startRun, stopRun: async () => undefined, reattachRun: async () => {}, fetchRunStatus: async () => null };
  const config = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const };
  const execution = { executionConfig: config, executionConfigRef: { current: config }, setExecutionConfig: vi.fn(), handleExecutionModeChange: vi.fn(), hasStoredAdminKey: true, configLoaded: true };
  const chats = {
    conversations: [], activeId: null, paneKey: "deep-link", initialMessages: [],
    select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn(),
    onMessagesChange: vi.fn(), persistUserTurn: async () => {}, ensureConversationId: async () => null,
  };
  const ports = { lookupConversation: vi.fn(async () => found), replaceQuery: vi.fn(), notify: vi.fn(), openDock: vi.fn() };
  render(<AssistantDock query={query === null ? null : new URLSearchParams(query)} useConversationDeepLink={useApplyConversationDeepLink} deepLinkPorts={ports}
    principalId="owner" useChats={() => chats} useAdminLocale={() => "en"} useExecutionConfig={() => execution}
    useByokRuntime={() => ({ byokRuntime: { model: "m", models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: "claude" }, handleLocalCliSelectionChange: vi.fn() })}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={() => transport}
    useRuntimeAccess={() => ({ listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true })}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []} />);
  return { chats, ports, startRun };
}

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it("dock applies an authorized conversation link by selecting it, without starting a run", async () => {
  const { chats, ports, startRun } = mountDock({ query: "conversation=c-9&tab=x", found: true });
  await waitFor(() => expect(chats.select).toHaveBeenCalledWith({ id: "c-9" }, {}));
  expect(chats.select).toHaveBeenCalledTimes(1);
  expect(ports.openDock).toHaveBeenCalledTimes(1);
  expect(chats.create).not.toHaveBeenCalled();
  expect(startRun).not.toHaveBeenCalled();
});

it("dock ignores a conversation link when no query is passed (unrelated route)", async () => {
  const { chats, ports } = mountDock({ query: null, found: true });
  await Promise.resolve();
  expect(ports.lookupConversation).not.toHaveBeenCalled();
  expect(chats.select).not.toHaveBeenCalled();
});

it("dock shows the notice and selects nothing for a missing conversation", async () => {
  const { chats, ports } = mountDock({ query: "conversation=gone", found: false });
  await waitFor(() => expect(ports.notify).toHaveBeenCalledTimes(1));
  expect(ports.replaceQuery).toHaveBeenCalledTimes(1);
  expect(chats.select).not.toHaveBeenCalled();
});
