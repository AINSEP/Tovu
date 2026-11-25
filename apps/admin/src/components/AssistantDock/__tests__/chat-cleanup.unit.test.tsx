import { cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConversationListHooks } from "@jini-ai/chat/react";

import { useWiredChatCleanup } from "@/hooks/assistant-chats-dependencies.hooks";
import type { ChatCleanupClient, WiredChatCleanup } from "../hooks/chat-cleanup.hooks";
import { HttpError } from "@/lib/assistant-chats";
import { createChatI18nAdapter } from "@jini-ai/admin/shell/components/AssistantDock/assistant-dock-i18n";
import { CHAT_I18N_HOST_FIELDS } from "@/app-i18n";
import { DEFAULT_CHAT_DISPLAY } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";
import { ChatCleanupPanel } from "../ChatCleanupPanel";
import { chatCleanupCopy } from "../chat-cleanup-copy";
import { DockHeader } from "../DockHeader";

/**
 * @file The dock's chat cleanup: the age chooser's server-counted preview, the token-bound apply,
 * the visible confirmation in front of delete-selected (owner rule d), and the dock taking its list
 * and cleanup hooks only from its props. The real `/api/assistant/chats` client is never reached:
 * every test hands `useWiredChatCleanup` a fake client.
 */

afterEach(() => cleanup());

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const COPY = chatCleanupCopy({ t: ({ key }) => key, locale: "en", untitled: "Untitled" });

function fakeClient(overrides: Partial<ChatCleanupClient> = {}): ChatCleanupClient {
  return {
    setPinned: vi.fn(async ({ id, pinned }: { id: string; pinned: boolean }) => ({ id, pinned })),
    preview: vi.fn(async () => ({ count: 7, bytes: 2048, kept: [{ id: "p1", title: "Launch notes", reason: "pinned" }], previewToken: "tok-1" })),
    apply: vi.fn(async () => ({ deleted: ["a"], kept: [] })),
    deleteSelected: vi.fn(async ({ ids }: { ids: readonly string[] }) => ({ deleted: [...ids], kept: [] })),
    ...overrides,
  };
}

function Harness({ client, confirm }: { client: ChatCleanupClient; confirm: (required: { dialog: { title: string; body: string; confirmLabel: string; tone: "danger" } }) => Promise<boolean> }) {
  const chatCleanup = useWiredChatCleanup({ client, kit: { Button: "button" }, copy: COPY, clock: () => NOW });
  return <>
    <button type="button" onClick={() => chatCleanup.select({ ids: ["a", "b"] })}>pick</button>
    <ChatCleanupPanel cleanup={chatCleanup} confirm={confirm} />
  </>;
}

async function previewOlderThan({ days }: { days: string }) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Clean up chats" }));
  const input = screen.getByLabelText("Delete chats older than this many days");
  await user.clear(input);
  await user.type(input, days);
  await user.click(screen.getByRole("button", { name: "Show what would be deleted" }));
  return user;
}

describe("chat cleanup", () => {
  it("dialog shows the server count before deleting", async () => {
    const client = fakeClient();
    render(<Harness client={client} confirm={vi.fn(async () => true)} />);
    const user = await previewOlderThan({ days: "30" });
    expect(client.preview).toHaveBeenCalledWith({ before: NOW - 30 * DAY });
    expect(screen.getByText(/Chats to delete: 7/)).toBeTruthy();
    expect(client.apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete these chats" }));
    expect(client.apply).toHaveBeenCalledWith({ previewToken: "tok-1" });
  });

  it("kept items are named", async () => {
    render(<Harness client={fakeClient()} confirm={vi.fn(async () => true)} />);
    await previewOlderThan({ days: "90" });
    expect(screen.getByText("Launch notes: Pinned")).toBeTruthy();
  });

  it("an expired preview goes back to choosing", async () => {
    const expired = new HttpError({ status: 409, statusText: "Conflict" }, { code: "PREVIEW_EXPIRED" });
    const client = fakeClient({ apply: vi.fn(async () => { throw expired; }) });
    render(<Harness client={client} confirm={vi.fn(async () => true)} />);
    const user = await previewOlderThan({ days: "90" });
    await user.click(screen.getByRole("button", { name: "Delete these chats" }));
    expect(screen.getByText("This preview expired. Choose again to see what would be deleted.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose again" }));
    expect(screen.getByRole("button", { name: "Show what would be deleted" })).toBeTruthy();
  });

  it("delete-selected waits for the visible confirmation", async () => {
    const client = fakeClient();
    const confirm = vi.fn(async () => false);
    render(<Harness client={client} confirm={confirm} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clean up chats" }));
    await user.click(screen.getByRole("button", { name: "pick" }));
    await user.click(screen.getByRole("button", { name: "Delete selected (2)" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(client.deleteSelected).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete selected (2)" }));
    expect(client.deleteSelected).toHaveBeenCalledWith({ ids: ["a", "b"], confirm: true });
  });

  it("uses injected hooks", async () => {
    const useConversationListView = vi.fn(defaultConversationListHooks.useConversationListView);
    const togglePin = vi.fn();
    const fake: WiredChatCleanup = {
      listHooks: { ...defaultConversationListHooks, useConversationListView },
      kit: { Button: "button" }, copy: COPY, open: false, setOpen: vi.fn(), olderThanDays: 90, setOlderThanDays: vi.fn(),
      selectedIds: [], select: vi.fn(), togglePin, visibleConversations: ({ conversations }) => conversations,
      useDialog: () => ({ state: "preview", count: 0, bytes: 0, kept: [], preview: vi.fn(), choose: vi.fn(), apply: vi.fn() }),
      deleteSelected: vi.fn(), error: null,
    };
    const useChatCleanup = vi.fn(() => fake);
    render(<DockHeader chats={{ conversations: [{ id: "c1", title: "Plan", pinned: false } as never], activeId: null, select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn() }}
      activeTitle="Tovu assistant" mode="local-cli" agentId="claude" locale="en" t={({ key }) => key}
      chatI18n={createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "en" })} conversationDelete={{ confirm: vi.fn(async () => true) }}
      chatDisplay={{ preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn(), saveFailed: false }} agentPlugins={{ mode: "auto", update: vi.fn(), saveFailed: false }}
      onMoreSettings={undefined} empty={false} useChatCleanup={useChatCleanup} />);
    expect(useChatCleanup).toHaveBeenCalled();
    expect(useConversationListView).toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Chats" }));
    await user.click(screen.getByRole("button", { name: "Pin Plan" }));
    expect(togglePin).toHaveBeenCalledWith({ id: "c1", pinned: true });
  });
});
