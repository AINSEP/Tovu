import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistant } from "../AiAssistant";
import { getNav } from "../../../nav";

/**
 * @file The "AI Assistant" admin screen — the public assistant's master switch plus the
 * not-yet-built roadmap accordion.
 *
 * Mirrors `Plugins.unit.test.tsx`'s RTL + stubbed-`fetch` shape. The behaviors worth locking down
 * are the ones that would silently degrade the switch into decoration: that the rendered state
 * comes from the SERVER's response rather than the click, that a failed save does not leave the UI
 * claiming the assistant is off, and that the roadmap items are inert rather than fake toggles.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Serves GET from `state`, and applies a successful PUT to it — a stand-in for the real route's
 * "return what is now persisted" contract, so a test asserting the rendered value is asserting
 * server truth rather than local optimism. */
function serveSettings(initial: { publicEnabled: boolean }, options: { failWrites?: boolean } = {}) {
  const state = { ...initial };
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      if (options.failWrites) {
        return jsonResponse({ error: "internal error", code: "INTERNAL_ERROR" }, 500);
      }
      Object.assign(state, JSON.parse(String(init.body)) as { publicEnabled?: boolean });
      return jsonResponse({ data: state });
    }
    return jsonResponse({ data: state });
  });
  return state;
}

function theSwitch(): HTMLInputElement {
  return screen.getByLabelText(/enable the ai assistant on the public site/i) as HTMLInputElement;
}

describe("the public on/off switch", () => {
  it("renders unchecked for a site that has never turned the assistant on", async () => {
    serveSettings({ publicEnabled: false });
    render(<AiAssistant />);

    await waitFor(() => expect(theSwitch()).toBeInTheDocument());
    expect(theSwitch().checked).toBe(false);
  });

  it("renders checked when the server says the assistant is live", async () => {
    serveSettings({ publicEnabled: true });
    render(<AiAssistant />);

    await waitFor(() => expect(theSwitch().checked).toBe(true));
  });

  it("persists a toggle through a PUT and re-renders from the response", async () => {
    const state = serveSettings({ publicEnabled: false });
    render(<AiAssistant />);
    await waitFor(() => expect(theSwitch()).toBeInTheDocument());

    await userEvent.click(theSwitch());

    await waitFor(() => expect(theSwitch().checked).toBe(true));
    expect(state.publicEnabled).toBe(true);

    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(String(putCall?.[0])).toContain("/assistant/settings");
    expect(JSON.parse(String((putCall?.[1] as RequestInit).body))).toEqual({ publicEnabled: true });
  });

  it("turns back off, which is the control's whole reason for existing", async () => {
    const state = serveSettings({ publicEnabled: true });
    render(<AiAssistant />);
    await waitFor(() => expect(theSwitch().checked).toBe(true));

    await userEvent.click(theSwitch());

    await waitFor(() => expect(theSwitch().checked).toBe(false));
    expect(state.publicEnabled).toBe(false);
  });

  it("does NOT claim the assistant changed state when the save fails", async () => {
    serveSettings({ publicEnabled: true }, { failWrites: true });
    const { container } = render(<AiAssistant />);
    await waitFor(() => expect(theSwitch().checked).toBe(true));

    await userEvent.click(theSwitch());

    // The dangerous failure is the inverse of this: a UI showing "off" after a failed disable,
    // while the public assistant is still live and still spending. Asserted on the error slot
    // rather than on exact copy, because the message comes from the server's own body.
    await waitFor(() => expect(container.querySelector(".save-error")?.textContent).toBeTruthy());
    expect(theSwitch().checked).toBe(true);
  });

  it("explains that off means no bundle and no endpoint, not a hidden widget", async () => {
    serveSettings({ publicEnabled: false });
    render(<AiAssistant />);

    await waitFor(() => expect(theSwitch()).toBeInTheDocument());
    expect(screen.getByText(/ships no assistant code and exposes no assistant endpoint/i)).toBeInTheDocument();
  });

  it("surfaces a permission failure in the operator's language", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope", code: "FORBIDDEN" }, 403));
    render(<AiAssistant />);

    await waitFor(() => expect(screen.getByText(/you do not have permission/i)).toBeInTheDocument());
  });
});

describe("the not-yet-built roadmap accordion", () => {
  // Per-visitor rate limiting was removed from this list when it shipped (SPEC-046 REQ-7); the row
  // would otherwise advertise an unbuilt feature that now exists.
  const EXPECTED = [/token \/ cost budget caps/i, /live status and recent activity/i];

  // The roadmap moved from an accordion on the Visitor tab to its own "Not built yet" tab in
  // 6c54aaf ("light theme, single scroller, roadmap tab, explicit Test Key") — a deliberate,
  // browser-verified UX change, not a regression: interleaving the gap list with the visitor
  // credential form pushed it below the fold. `SettingsDialogShell` renders every tab's nav button
  // up front (`data-testid="settings-dialog-nav-<id>"`) regardless of which panel is active, so this
  // helper switches to it before any of these tests query `.assistant-roadmap`.
  async function openRoadmapTab() {
    await waitFor(() => expect(theSwitch()).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("settings-dialog-nav-roadmap"));
  }

  it("lists all three unbuilt controls, each marked as not implemented", async () => {
    serveSettings({ publicEnabled: false });
    const { container } = render(<AiAssistant />);
    await openRoadmapTab();

    // Scoped to the <summary> rows rather than a document-wide text query: the same phrases
    // deliberately appear again in the intro warning and in the sibling items' detail copy.
    const summaries = [...container.querySelectorAll(".assistant-roadmap summary")] as HTMLElement[];
    expect(summaries).toHaveLength(EXPECTED.length);

    for (const label of EXPECTED) {
      const summary = summaries.find((row) => label.test(row.textContent ?? ""));
      expect(summary, `no roadmap row matched ${label}`).toBeDefined();
      expect(within(summary as HTMLElement).getByText(/not implemented/i)).toBeInTheDocument();
    }
  });

  it("renders every roadmap item as an inert unchecked box — no fake toggles", async () => {
    serveSettings({ publicEnabled: false });
    const { container } = render(<AiAssistant />);
    await openRoadmapTab();

    // Scoped to `.assistant-roadmap`, the same way the summary-row test above is, rather than
    // sweeping the document and subtracting the switches by identity. This assertion is about the
    // ROADMAP's boxes being inert; a document-wide query made it accidentally also assert "no other
    // real checkbox exists on this screen", which is a different claim and not one this test is
    // named for. It broke the moment a genuine second control (the admin-dock switch) was added.
    const boxes = [...container.querySelectorAll(".assistant-roadmap input[type='checkbox']")];
    expect(boxes).toHaveLength(EXPECTED.length);
    for (const box of boxes) {
      expect(box).not.toBeChecked();
      expect(box).toBeDisabled();
    }
  });

  it("expands to a one-line explanation of what each missing control would do", async () => {
    serveSettings({ publicEnabled: false });
    render(<AiAssistant />);
    await openRoadmapTab();

    expect(screen.getByText(/per-day and per-conversation spend ceilings/i)).toBeInTheDocument();
    expect(screen.getByText(/recent conversation counts, and spend to date/i)).toBeInTheDocument();
    // The rate-limit row is gone on purpose (SPEC-046 REQ-7 shipped it). Asserted as an absence so
    // this test fails if someone re-adds a row advertising a control that already exists.
    expect(screen.queryByText(/per-ip or per-session request window/i)).not.toBeInTheDocument();
  });

  it("warns, before anyone flips the switch, that there is no cost ceiling yet", async () => {
    serveSettings({ publicEnabled: false });
    render(<AiAssistant />);
    await openRoadmapTab();

    expect(screen.getByText(/without a cost ceiling/i)).toBeInTheDocument();
  });
});

describe("nav wiring", () => {
  it("the AI Assistant entry sits in the ungrouped Overview row and links to its route", () => {
    const overviewGroup = getNav()[0];
    expect(overviewGroup.label).toBeUndefined();

    const item = overviewGroup.items.find((i) => i.id === "ai-assistant");
    expect(item).toBeDefined();
    expect(item?.label).toBe("AI Assistant");
    expect(item?.href).toBe("/ai-assistant");
    expect(item?.soon).toBeFalsy();
  });

  it("the nav id matches the route section id App.activeSectionId derives the highlight from", () => {
    const item = getNav().flatMap((group) => group.items).find((i) => i.id === "ai-assistant");
    // `href` is a route path now, not a hash, and the `section/` segment is gone — so the id is
    // simply the path. That is what lets `activeSectionId` light this row up from the URL alone.
    expect(item?.href).toBe(`/${item?.id}`);
  });
});
