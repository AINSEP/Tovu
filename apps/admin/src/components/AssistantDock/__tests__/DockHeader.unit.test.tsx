import { cleanup, render as renderWithoutProvider, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { DockHeader, type DockHeaderProps } from "../DockHeader";
import { createChatI18nAdapter } from "../assistant-dock-i18n";
import { DEFAULT_CHAT_DISPLAY } from "../chat-display-preferences";

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
    t: (key) => key,
    chatI18n: createChatI18nAdapter("en"),
    conversationDelete: { confirm: vi.fn(async () => true) },
    chatDisplay: { preferences: DEFAULT_CHAT_DISPLAY, update: vi.fn(), saveFailed: false },
    agentPlugins: { mode: "auto", update: vi.fn(), saveFailed: false },
    onMoreSettings: undefined,
    empty: false,
    ...overrides,
  };
}

function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
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
