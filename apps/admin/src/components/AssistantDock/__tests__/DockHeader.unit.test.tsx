import { cleanup, render, screen, within, render as renderWithoutProvider } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockHeader, type DockHeaderProps } from "../DockHeader";
import { defaultConversationListHooks } from "@jini-ai/chat/react";
import { chatCleanupCopy } from "../chat-cleanup-copy";
import { createChatI18nAdapter } from "@jini-ai/admin/shell/components/AssistantDock/assistant-dock-i18n";
import { CHAT_I18N_HOST_FIELDS } from "@/app-i18n";
import { DEFAULT_CHAT_DISPLAY } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";

/**
 * @file `DockHeader` — the dock's replacement for `ChatPane`'s default header — rendered on its
 * own: the title heading, the empty-transcript greeting, and the gear menu's failed-save notice.
 * The conversation switcher's delete gate and the title editor are driven through the whole dock
 * in `components/__tests__/AssistantDock.unit.test.tsx` and `conversation-title-editor.unit.test.tsx`.
 */

afterEach(() => cleanup());

const SAVE_FAILED = "Couldn't save. This choice lasts until you reload.";

function headerProps(overrides: Partial<DockHeaderProps> = {}): DockHeaderProps {
  return {
    chats: { conversations: [], activeId: null, select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn() },
    activeTitle: "Tovu assistant",
    mode: "local-cli",
    agentId: "claude",
    locale: "en",
    t: ({ key }) => key,
    chatI18n: createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "en" }),
    conversationDelete: { confirm: vi.fn(async () => true) },
    chatDisplay: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn(), saveFailed: false },
    agentPlugins: { mode: "auto", update: vi.fn(), saveFailed: false },
    onMoreSettings: undefined,
    empty: false,
    useChatCleanup: () => ({ listHooks: defaultConversationListHooks, kit: { Button: "button" }, copy: chatCleanupCopy({ t: ({ key }) => key, locale: "en", untitled: "Untitled" }),
      open: false, setOpen: vi.fn(), olderThanDays: 90, setOlderThanDays: vi.fn(), selectedIds: [], select: vi.fn(), togglePin: vi.fn(),
      visibleConversations: ({ conversations }) => conversations, deleteSelected: vi.fn(), error: null,
      useDialog: () => ({ state: "preview", count: 0, bytes: 0, kept: [], preview: vi.fn(), choose: vi.fn(), apply: vi.fn() }) }),
    ...overrides,
  };
}

async function openSettingsMenu() {
  await userEvent.setup().click(screen.getByRole("button", { name: "Settings" }));
  return screen.getByRole("menu", { name: "Settings" });
}

describe("DockHeader", () => {
  it("names the heading after the active conversation's display title, as text and tooltip", () => {
    render(<DockHeader {...headerProps({ activeTitle: "Quarterly report" })} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Quarterly report" });
    expect(heading).toHaveAttribute("title", "Quarterly report");
  });

  it("greets an empty transcript under the header row", () => {
    render(<DockHeader {...headerProps({ empty: true })} />);
    expect(screen.getByText("Hello! Ask me to help with your site.").closest(".assistant-empty-state")).toHaveAttribute("role", "status");
  });

  it("shows no greeting once the transcript has messages", () => {
    render(<DockHeader {...headerProps({ empty: false })} />);
    expect(screen.queryByText("Hello! Ask me to help with your site.")).toBeNull();
  });

  it("reports a failed chat display save in the gear menu", async () => {
    render(<DockHeader {...headerProps({ chatDisplay: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn(), saveFailed: true } })} />);
    expect(within(await openSettingsMenu()).getByRole("status")).toHaveTextContent(SAVE_FAILED);
  });

  it("reports a failed Agent plugins save in the gear menu", async () => {
    render(<DockHeader {...headerProps({ agentPlugins: { mode: "auto", update: vi.fn(), saveFailed: true } })} />);
    expect(within(await openSettingsMenu()).getByRole("status")).toHaveTextContent(SAVE_FAILED);
  });

  it("shows no save notice in the gear menu when both choices saved", async () => {
    render(<DockHeader {...headerProps()} />);
    expect(within(await openSettingsMenu()).queryByRole("status")).toBeNull();
  });
});
