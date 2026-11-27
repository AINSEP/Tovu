import { useAttachmentValidator } from "../hooks/composer-files.hooks";
import { renderHook } from "@/__tests__/render-with-jini-kits";
import type { ChatAttachment } from "@jini-ai/chat/core";
import { cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationTitle } from "@jini-ai/chat/react";
import { ChatCleanupPanel } from "@jini-ai/chat/react/chat-cleanup/ChatCleanupPanel";
import { bindAssistantDockState } from "@jini-ai/admin/shell/components/AssistantDock/AssistantDock.state.hooks";
import { bindDockChatPane } from "@jini-ai/admin/shell/components/AssistantDock/DockChatPane";
import { DockHeader } from "@jini-ai/admin/shell/components/AssistantDock/DockHeader";
import { FailureSurfaceContext } from "@jini-ai/admin/shell/components/AssistantDock/AgentFailureCard.hooks";
import { DockLeadingAccessory } from "@jini-ai/admin/shell/components/AssistantDock/DockLeadingAccessory";
import { FolderPathButton } from "@jini-ai/admin/shell/components/AssistantDock/FolderPathButton";
import { dockSettingsMenuSections } from "@jini-ai/admin/shell/components/AssistantDock/dock-header-rules";
import { CHAT_TOOL_CALL_OPTIONS, DEFAULT_CHAT_DISPLAY, chatPaneDisplayProps } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";
import { REPLY_LENGTH_OPTIONS, visibleAssistantRuntimePreferences } from "@jini-ai/admin/shell/components/AssistantDock/assistant-runtime-preferences";
import { resolveSkillsAvailable } from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-files.hooks";
import { useAssistantTransportSeam } from "@jini-ai/admin/shell/components/AssistantDock/hooks/assistant-transport.hooks";
import { createChatI18nAdapter } from "@jini-ai/admin/shell/components/AssistantDock/assistant-dock-i18n";
import { CHAT_I18N_HOST_FIELDS } from "@/app-i18n";
import { useDockChatCleanup } from "@/hooks/assistant-chats-dependencies.hooks";
import "../AssistantDock";

vi.mock("@jini-ai/admin/shell/components/AssistantDock/AssistantDock.state.hooks", { spy: true });
vi.mock("@jini-ai/admin/shell/components/AssistantDock/DockChatPane", { spy: true });
vi.mock("@jini-ai/admin/shell/components/AssistantDock/DockHeader", { spy: true });

afterEach(() => cleanup());

it("binds the original assistant transport seam and runtime/composer rules", () => {
  const { hooks, deps } = vi.mocked(bindAssistantDockState).mock.calls[0][0];
  expect(hooks.useAssistantTransportSeam).toBe(useAssistantTransportSeam);
  expect(deps.visibleAssistantRuntimePreferences).toBe(visibleAssistantRuntimePreferences);
  expect(deps.resolveSkillsAvailable).toBe(resolveSkillsAvailable);
});

it("binds the failure cards' provider and the original pane components and preferences", () => {
  const { kit, deps } = vi.mocked(bindDockChatPane).mock.calls[0][0];
  expect(kit.FailureSurfaceProvider).toBe(FailureSurfaceContext.Provider);
  expect(kit.DockLeadingAccessory).toBe(DockLeadingAccessory);
  expect(kit.FolderPathButton).toBe(FolderPathButton);
  expect(deps.dockSettingsMenuSections).toBe(dockSettingsMenuSections);
  expect(deps.toolCallOptions).toBe(CHAT_TOOL_CALL_OPTIONS);
  expect(deps.replyLengthOptions).toBe(REPLY_LENGTH_OPTIONS);
  expect(deps.chatPaneDisplayProps).toBe(chatPaneDisplayProps);
});

it("prebinds the original DockHeader without forwarding its binding field", () => {
  // The production kit's cleanup panel: it adapts the dock's cleanup controller to the chat package's panel props.
  const { kit: { DockCleanupHeader, ChatCleanupPanel: BoundCleanupPanel } } = vi.mocked(bindDockChatPane).mock.calls[0][0];
  render(<DockCleanupHeader ChatCleanupPanel={BoundCleanupPanel}
    chats={{ conversations: [], activeId: null, select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn() }}
    activeTitle="Tovu assistant" mode="local-cli" agentId="claude" locale="en" t={({ key }) => key}
    chatI18n={createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "en" })} conversationDelete={{ confirm: vi.fn(async () => true) }}
    chatDisplay={{ preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn(), saveFailed: false }} agentPlugins={{ mode: "auto", update: vi.fn(), saveFailed: false }}
    onMoreSettings={undefined} empty={false} useChatCleanup={useDockChatCleanup}
    toolCallOptions={CHAT_TOOL_CALL_OPTIONS} replyLengthOptions={REPLY_LENGTH_OPTIONS} translateAiAssistant={({ key }) => key}
    useSubagentsSettingsHook={() => ({ tooltipKey: null })} ConversationTitle={ConversationTitle} />);
  expect(DockHeader).toHaveBeenCalled();
  expect(vi.mocked(DockHeader).mock.calls[0][0]).not.toHaveProperty("DockHeader");
  expect(screen.getByRole("button", { name: "Clean up chats" })).toBeTruthy();
});

it("probes saved dock attachments through the current browser fetch and restores only live ones", async () => {
  const { result } = renderHook(() => useAttachmentValidator());
  const live: ChatAttachment = { path: "attachment:still-present", name: "diagram.png", kind: "image", size: 16 };
  const gone: ChatAttachment = { path: "attachment:expired", name: "old.png", kind: "image", size: 8 };
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method !== "HEAD" || init.credentials !== "same-origin") {
      return new Response(null, { status: 405 });
    }
    calls.push(path);
    return new Response(null, { status: path === "/api/attachments/attachment%3Astill-present" ? 200 : 404 });
  });
  try {
    await expect(result.current([gone, live])).resolves.toEqual([live]);
    expect(calls.sort()).toEqual(["/api/attachments/attachment%3Aexpired", "/api/attachments/attachment%3Astill-present"]);
  } finally {
    vi.unstubAllGlobals();
  }
});
