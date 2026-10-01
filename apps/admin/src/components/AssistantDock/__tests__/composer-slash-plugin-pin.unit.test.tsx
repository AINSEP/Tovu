import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer, useComposer } from "@jini-ai/chat/react";

import {
  useComposerCapabilities,
  useComposerDiscoverySelect,
  useSelectedAgentPlugins,
} from "../hooks/AssistantDock.hooks";

/**
 * @file End-to-end proof (real `@jini-ai/chat/react` `Composer`, real Tovu host wiring, no mocking
 * of the trigger grammar) that typing `/ui-ux-design` and invoking it from the composer's own slash
 * menu pins the identical `pluginRefIds` state the existing "+" picker chip already produces —
 * added alongside `composer-capabilities.ts`'s new `command: "ui-ux-design"` field (2026-08-23),
 * which is what makes the literal id-shaped string discoverable at all (see that field's own doc:
 * without it, `/ui-ux-design` fuzzy-matched nothing, since the label/keywords use spaces and
 * slashes, never hyphens).
 *
 * `Composer`/`useComposer` are used directly rather than the heavier `ChatPane`/`JiniChatProvider`
 * stack — both are public exports `@jini-ai/chat/react`'s own `context.ts` documents as
 * "unit-tested standalone (no `<JiniChatProvider>` mounted)", and nothing this test exercises
 * (discovery matching, selection resolution, plugin pinning) touches a transport or provider.
 */

function ComposerHarness() {
  const composer = useComposer();
  const { composerCapabilities } = useComposerCapabilities();
  const { selectedPluginRefIds, addPluginRef } = useSelectedAgentPlugins();
  const onDiscoverySelect = useComposerDiscoverySelect({
    composerCapabilities,
    callAllowlistedTool: vi.fn(),
    addPluginRef,
  });

  return (
    <div>
      {/* Plain text probes, not the picker's own chip UI — this harness proves the state
          transition (`pluginRefIds`), not the chip's rendering (already covered by
          `SelectedAgentPluginTray`'s own tests). */}
      <div data-testid="pinned-refs">{JSON.stringify(selectedPluginRefIds)}</div>
      <div data-testid="draft">{composer.draft}</div>
      <Composer
        composer={composer}
        onSend={vi.fn()}
        slots={{ discoveryGroups: composerCapabilities.groups, onDiscoverySelect }}
      />
    </div>
  );
}

/** Waits for the bundled catalog's async projection to settle — same wait `AssistantDock.hooks`'s
 *  own `useComposerCapabilities` test uses, via the "+" button that only renders once
 *  `discoveryGroups` is non-empty. */
async function waitForCapabilitiesLoaded() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /add context/i })).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("typing /ui-ux-design in the composer", () => {
  it("pins pluginRefIds=[\"ui-ux-design\"] and clears the draft, identically to the + picker chip", async () => {
    const user = userEvent.setup();
    render(<ComposerHarness />);
    await waitForCapabilitiesLoaded();

    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.type(textarea, "/ui-ux-design");
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveValue("/ui-ux-design");

    // Two rows fuzzy-match while the exact command word is still being confirmed: the agent-plugin
    // item itself (now via its new `command` field) and the Skill row, whose description literally
    // contains the substring "the ui-ux-design Agent Plugin". The agent-plugin item sorts first
    // (bundled catalog's "agent-plugins" group precedes "skills"), so it is the default-highlighted
    // option Enter invokes below — asserted explicitly here so a future catalog reorder fails this
    // test instead of silently pinning the wrong row.
    const options = await waitFor(() => {
      const found = screen.getAllByRole("option");
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    expect(options[0]).toHaveTextContent("UI/UX Design (Agent Plugin)");

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("pinned-refs")).toHaveTextContent("ui-ux-design");
      expect(JSON.parse(screen.getByTestId("pinned-refs").textContent!)).toEqual(["ui-ux-design"]);
    });
    // The literal typed `/ui-ux-design` does not linger in the box — the command-bearing slash path
    // skips Composer.tsx's own insertText-driven clear, so the host's `{ draft: "" }` outcome
    // (`resolveComposerDiscoveryOutcome`'s pluginRefId branch) is what clears it.
    await waitFor(() => {
      expect(screen.getByTestId("draft")).toHaveTextContent("");
      expect(screen.getByTestId("draft").textContent).toBe("");
      expect(textarea).toHaveValue("");
    });
  });

  it("produces the exact same pluginRefIds state as selecting the row from the + picker menu", async () => {
    // Two independent harness instances (two independent `useSelectedAgentPlugins` state) — one
    // driven via the slash trigger, one via the existing "+" menu click path — compared directly
    // rather than asserting the new path in isolation.
    // Rendered and unmounted before the "+" instance mounts (rather than kept side by side) so each
    // instance's `getByRole`/`getByTestId` — bound to `document.body` by default, not to just that
    // render's own container — cannot find two matching elements at once.
    const slashRender = render(<ComposerHarness />);
    await waitForCapabilitiesLoaded();
    const slashTextarea = slashRender.getByRole("textbox");
    fireEvent.change(slashTextarea, { target: { value: "/ui-ux-design" } });
    await waitFor(() => expect(slashRender.getAllByRole("option").length).toBeGreaterThan(0));
    fireEvent.keyDown(slashTextarea, { key: "Enter" });
    await waitFor(() => expect(slashRender.getByTestId("pinned-refs")).toHaveTextContent("ui-ux-design"));
    const slashPinnedRefs = slashRender.getByTestId("pinned-refs").textContent;
    const slashDraft = slashRender.getByTestId("draft").textContent;
    slashRender.unmount();

    const plusRender = render(<ComposerHarness />);
    await waitFor(() => {
      expect(plusRender.getByRole("button", { name: /add context/i })).toBeInTheDocument();
    });
    fireEvent.click(plusRender.getByRole("button", { name: /add context/i }));
    const menuLabel = await waitFor(() => plusRender.getByText("UI/UX Design (Agent Plugin)"));
    fireEvent.click(menuLabel.closest("button")!);
    await waitFor(() => expect(plusRender.getByTestId("pinned-refs")).toHaveTextContent("ui-ux-design"));

    expect(plusRender.getByTestId("pinned-refs").textContent).toBe(slashPinnedRefs);
    expect(plusRender.getByTestId("draft").textContent).toBe(slashDraft);

    plusRender.unmount();
  });

  it("leaves an unrecognized slash command (e.g. /nonexistent-plugin) as literal text — no match, nothing pinned", async () => {
    render(<ComposerHarness />);
    await waitForCapabilitiesLoaded();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/nonexistent-plugin" } });

    // Same "no fuzzy match, no menu" convention the bundled catalog already relies on for every
    // other typed string that isn't a real command/label/keyword hit (e.g. typing "/xyz" today) —
    // no new autocomplete/error affordance was invented for this.
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    // Negative assertions must observe async host outcomes as well as the key event itself.
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

    expect(screen.getByTestId("draft")).toHaveTextContent("/nonexistent-plugin");
    expect(screen.getByTestId("pinned-refs")).toHaveTextContent("[]");
    expect(JSON.parse(screen.getByTestId("pinned-refs").textContent!)).toEqual([]);
    expect(textarea).toHaveValue("/nonexistent-plugin");
  });

  it("does not pin or clear the draft when Enter commits an IME composition", async () => {
    const user = userEvent.setup();
    render(<ComposerHarness />);
    await waitForCapabilitiesLoaded();
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "/ui-ux-design");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    expect(JSON.parse(screen.getByTestId("pinned-refs").textContent!)).toEqual([]);
    expect(screen.getByTestId("draft").textContent).toBe("/ui-ux-design");
    expect(textarea).toHaveValue("/ui-ux-design");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(JSON.parse(screen.getByTestId("pinned-refs").textContent!)).toEqual(["ui-ux-design"]));
    await waitFor(() => expect(textarea).toHaveValue(""));
  });
});
