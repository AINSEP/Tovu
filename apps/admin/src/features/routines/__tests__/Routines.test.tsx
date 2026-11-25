import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/__tests__/render-with-jini-kits";
import { useRecurringSchedulePicker } from "@jini-ai/ui";
import type { RoutineRow, RoutineRunSummary } from "@jini-ai/core/contracts/site/routines";
import { RoutinesMount } from "../RoutinesMount";
import { useRoutinesController } from "../Routines.hooks";
import { RoutinesApiError, type RoutinesApi, type RoutinesListResult } from "../routines-api";
import { routinesKit } from "../../../integrations/jini-kits";
import { useConversationLinkBuilder } from "../use-conversation-deep-link";
import { t, ROUTINES_KEYS } from "../routines-i18n";
import { ADMIN_LOCALES } from "@tovu/contracts/admin-locales";

/**
 * @file Routines screen behavior, driven through the real mount, real controller and the real Jini
 * table / row menu / confirm dialog. Only the API, timers and focus source are fakes, so a label the
 * operator sees is a label the production path produces.
 */
const run = (over: Partial<RoutineRunSummary> = {}): RoutineRunSummary => ({
  runId: "r1", trigger: "scheduled", status: "succeeded", startedAt: Date.UTC(2026, 10, 24, 9, 0), completedAt: Date.UTC(2026, 10, 24, 9, 5),
  projectId: "p1", conversationId: "c-1", agentRunId: "a1", ...over,
});
const row = (over: Partial<RoutineRow> = {}): RoutineRow => ({
  id: "rt1", name: "Morning digest", prompt: "Summarize", schedule: { kind: "daily", time: "09:00", timezone: "Europe/Berlin" },
  target: { mode: "create_each_run" }, skillId: null, agentId: null, model: null, creatorId: "owner", enabled: true,
  nextRunAt: Date.UTC(2026, 10, 25, 9, 0), revision: 3, createdAt: 1, updatedAt: 2, lastRun: null, ...over,
});

function fakeApi(lists: RoutinesListResult[]): RoutinesApi & { list: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } {
  let index = 0;
  return {
    list: vi.fn(async () => lists[Math.min(index++, lists.length - 1)] as RoutinesListResult),
    create: vi.fn(async () => row()), update: vi.fn(async () => row()), remove: vi.fn(async () => undefined),
  };
}
const ready = (...routines: RoutineRow[]): RoutinesListResult => ({ state: "ready", routines });

function mount({ api, visible = true, releaseEnabled = true }: { api: RoutinesApi; visible?: boolean; releaseEnabled?: boolean }) {
  const timers = { setInterval: vi.fn(() => 7), clearInterval: vi.fn() };
  const focus = { subscribe: vi.fn(() => () => undefined) };
  const view = (isVisible: boolean) => (
    <RoutinesMount useAdminLocaleHook={() => "en"} useRoutinesController={({ visible: v }) => useRoutinesController({ api, visible: v, focus, timers })}
      useSchedulePicker={useRecurringSchedulePicker} useConversationDeepLink={useConversationLinkBuilder} kit={routinesKit}
      releaseEnabled={releaseEnabled} theme="light" visible={isVisible} />
  );
  const result = render(view(visible));
  return { ...result, timers, focus, rerenderVisible: (v: boolean) => result.rerender(view(v)) };
}

describe("Routines screen", () => {
  it("shows Waiting for approval and Catch-up run labels", async () => {
    mount({ api: fakeApi([ready(row({ lastRun: run({ status: "running", completedAt: undefined, catchUp: true, approvalState: "waiting" }) }))]) });
    expect(await screen.findByText(/Waiting for approval/)).toBeTruthy();
    expect(screen.getByText(/Catch-up run/)).toBeTruthy();
  });

  it("an affirmative receipt says owner said yes, not done", async () => {
    mount({ api: fakeApi([ready(row({ lastRun: run({ status: "running", completedAt: undefined, approvalState: "approved" }) }))]) });
    expect(await screen.findByText(/owner said yes/)).toBeTruthy();
    expect(screen.queryByText(/\bdone\b/i)).toBeNull();
    expect(screen.queryByText(/Succeeded/)).toBeNull();
  });

  it("hourly shows minute past the hour, daily shows its timezone", async () => {
    mount({ api: fakeApi([ready(row({ id: "h", name: "Hourly", schedule: { kind: "hourly", minute: 15 } }), row({ id: "d", name: "Daily" }))]) });
    expect(await screen.findByText(/15 minutes past the hour/)).toBeTruthy();
    expect(screen.getByText(/Europe\/Berlin/)).toBeTruthy();
  });

  it("links a run to its conversation by id only", async () => {
    mount({ api: fakeApi([ready(row({ lastRun: run() }))]) });
    const link = await screen.findByRole("link", { name: "Open conversation" });
    expect(link.getAttribute("href")).toBe("/ai-assistant?conversation=c-1");
  });

  it("pause/resume and delete with cancel", async () => {
    const user = userEvent.setup();
    const api = fakeApi([ready(row()), ready(row({ enabled: false, revision: 4 })), ready(row({ enabled: false, revision: 4 }))]);
    mount({ api });
    const openMenu = async () => user.click(await screen.findByRole("button", { name: /Routines: Morning digest/ }));
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Pause routine" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.update).not.toHaveBeenCalled();
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Pause routine" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pause routine" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({ id: "rt1", patch: { enabled: false }, expectedRevision: 3 }));
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Resume routine" }));
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith({ id: "rt1", patch: { enabled: true }, expectedRevision: 4 }));
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Delete routine" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.remove).not.toHaveBeenCalled();
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Delete routine" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete routine" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ id: "rt1", revision: 4 }));
  });

  it("menu works by keyboard", async () => {
    const user = userEvent.setup();
    mount({ api: fakeApi([ready(row())]) });
    const trigger = await screen.findByRole("button", { name: /Routines: Morning digest/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Edit", "Pause routine", "Delete routine"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("stale write shows the reload message and refreshes without resubmitting", async () => {
    const user = userEvent.setup();
    const api = fakeApi([ready(row()), ready(row({ revision: 9 }))]);
    api.update.mockRejectedValueOnce(new RoutinesApiError({ message: "x", status: 409, reason: "ROUTINE_CHANGED", errorId: null }));
    mount({ api });
    await user.click(await screen.findByRole("button", { name: /Routines: Morning digest/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Pause routine" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pause routine" }));
    expect(await screen.findByText("This routine changed since you looked. The list has been reloaded.")).toBeTruthy();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("a 503 refusal is not an empty ready list and offers no mutation", async () => {
    mount({ api: fakeApi([{ state: "assistant-off", reason: "ROUTINES_ASSISTANT_OFF", errorId: "ERR-1" }]) });
    expect(await screen.findByText(/Turn on the AI assistant to run routines\./)).toBeTruthy();
    expect(screen.queryByText("No routines yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "New routine" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("an empty ready list says there are no routines yet", async () => {
    mount({ api: fakeApi([ready()]) });
    expect(await screen.findByText("No routines yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New routine" })).toBeTruthy();
  });

  it("renders nothing and loads nothing while the release flag is off", () => {
    const api = fakeApi([ready(row())]);
    const { container } = mount({ api, releaseEnabled: false });
    expect(container.textContent).toBe("");
    expect(api.list).not.toHaveBeenCalled();
  });

  it("does not poll while hidden and polls only while visible", async () => {
    const api = fakeApi([ready(row())]);
    const { timers, focus, rerenderVisible, unmount } = mount({ api, visible: false });
    expect(api.list).not.toHaveBeenCalled();
    expect(timers.setInterval).not.toHaveBeenCalled();
    expect(focus.subscribe).not.toHaveBeenCalled();
    rerenderVisible(true);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 30_000);
    rerenderVisible(false);
    expect(timers.clearInterval).toHaveBeenCalledWith(7);
    unmount();
  });
});

// Loanwords many languages keep verbatim; every other key must differ from English.
const LOANWORDS = new Set<string>(["Model", "Agent", "Prompt", "Name"]);

describe("routines copy", () => {
  it("has a real translation for every key in every non-English admin locale", () => {
    for (const { code } of ADMIN_LOCALES.filter((locale) => locale.code !== "en")) {
      for (const key of ROUTINES_KEYS) {
        const text = t({ locale: code, key });
        if (!LOANWORDS.has(key)) expect(text, `${code}: ${key}`).not.toBe(key);
        expect(text.match(/\{\w+\}/g)?.sort(), `${code}: ${key} placeholders`).toEqual(key.match(/\{\w+\}/g)?.sort());
      }
    }
  });
});
