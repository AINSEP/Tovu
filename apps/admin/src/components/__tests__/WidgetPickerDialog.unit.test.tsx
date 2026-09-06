import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetAddControl, WidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog";

/**
 * @file `WidgetPickerDialog` — end-to-end proof, in the real dialog (not just `Select.unit.test.tsx`'s
 * emulated host), that swapping its two native `<select>`s for `components/Select/Select.tsx` didn't
 * reintroduce the exact regression the dispatch that made that swap called out by name: this
 * dialog's own `document`-level Escape listener (the `onCancel` effect below `useExistingInstances`)
 * must not fire when Escape is only meant to close the new dropdown's floating panel.
 *
 * `useExistingInstances`/`useWidgetPickerDialog`/`useWidgetAddControl`'s own state-shape tests moved
 * to `WidgetPickerDialog.hooks.unit.test.tsx` when `WidgetPickerDialog.tsx` split into
 * `WidgetPickerDialog.tsx`/`WidgetPickerDialog.hooks.tsx` — this file keeps only the tests that
 * render the actual `<WidgetPickerDialog>` component.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const EXISTING_WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-banner",
  title: "Hero banner",
  status: "active",
  widgetType: "text",
  config: { body: "" },
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ widgets: [EXISTING_WIDGET] }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("Escape closes the Select's dropdown without cancelling the dialog underneath it", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();

  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={onCancel} />);

  const trigger = await screen.findByRole("combobox", { name: /existing text widgets/i });
  await user.click(trigger);
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // the dropdown closed
  expect(onCancel).not.toHaveBeenCalled(); // the dialog was not cancelled
  expect(screen.getByRole("dialog")).toBeInTheDocument(); // still open
});

it("a bare Escape (no dropdown open) still cancels the dialog, unaffected by the fix above", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();

  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={onCancel} />);
  await screen.findByRole("combobox", { name: /existing text widgets/i });

  await user.keyboard("{Escape}");

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("Cancel is styled as a secondary action, not the primary fill", async () => {
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  expect(await screen.findByRole("button", { name: "Cancel" })).toHaveClass("btn-secondary");
});

// REGRESSION, found live in a real browser (not by this suite): `hasExisting` derives from
// `instances`, which starts `null` while the `listWidgets` fetch is in flight — on the Title
// input's very first paint that always reads as `false` regardless of the real answer, so a plain
// `autoFocus={!hasExisting}` used to focus Title unconditionally on every open, even for a widget
// type that already has existing instances, and `autoFocus` only fires once at mount so the fetch
// resolving a moment later never undid it. `ui.spec.md` §5 (quoted in `WidgetPickerDialog.tsx`'s own
// header) wants no pre-selected default once existing instances are a real, equally-weighted option.
it("does not steal focus onto Title once existing instances resolve as present", async () => {
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  await screen.findByRole("combobox", { name: /existing text widgets/i }); // waits for the fetch to resolve
  expect(screen.getByLabelText("Title")).not.toHaveFocus();
});

it("still focuses Title once instances resolve as empty (a genuinely fresh widget type)", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ widgets: [] }));
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  await screen.findByLabelText("Title");
  await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
});

/**
 * Coverage-gap-fill (2026-09-05). `WidgetPickerDialog.hooks.unit.test.tsx` already pins
 * `submitCreateNew`'s "Title is required." STATE directly; nothing renders the real component with
 * that state to prove the `role="alert"` banner (`WidgetPickerDialog.tsx`'s own `{error ? (...) :
 * null}`) actually appears.
 */
it("submitting Create new with a blank title renders the error as a role=alert banner", async () => {
  const user = userEvent.setup();
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Create and place" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Title is required.");
});

describe("WidgetPickerDialog dialog-hook injection", () => {
  it("renders purely off an injected fake, proving useWidgetPickerDialog is not hardcoded", async () => {
    // A fake that never touches `listWidgets`/`document`-level Escape handling at all — if
    // `WidgetPickerDialog` rendered off anything other than what this hook returns (e.g. called the
    // real `useWidgetPickerDialog` itself somewhere internally), `typeLabel` below would resolve to
    // "Text" (the real `WIDGET_TYPE_OPTIONS` lookup for `widgetType: "text"`), not this fake's value.
    const user = userEvent.setup();
    const submitCreateNew = vi.fn((e: React.FormEvent) => e.preventDefault());
    function useFakeDialog() {
      return {
        instances: [],
        loadError: null,
        selectedExistingId: "",
        setSelectedExistingId: vi.fn(),
        newTitle: "",
        setNewTitle: vi.fn(),
        newConfig: {},
        setNewConfig: vi.fn(),
        error: null,
        titleId: "fake-title-id",
        existingSelectId: "fake-existing-select-id",
        newTitleInputId: "fake-title-input-id",
        newTitleInputRef: { current: null },
        typeLabel: "Fake Type",
        hasExisting: false,
        submitUseExisting: vi.fn((e: React.FormEvent) => e.preventDefault()),
        submitCreateNew,
      };
    }

    render(
      <WidgetPickerDialog
        widgetType="text"
        onUseExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        useDialog={useFakeDialog}
      />
    );

    expect(screen.getByRole("heading", { name: "Place a Fake Type widget" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby", "fake-title-id");
    // `hasExisting: false` in the fake means only "Create new" renders, same as the real hook would
    // for a genuinely empty `instances` — but here that's the fake's own value, not a real fetch.
    expect(screen.queryByRole("button", { name: "Use this widget" })).not.toBeInTheDocument();

    // Submitting "Create new" routes through the fake's `submitCreateNew`, not the real hook's —
    // the real `useWidgetPickerDialog` is never invoked at all in this render.
    await user.click(screen.getByRole("button", { name: "Create and place" }));
    expect(submitCreateNew).toHaveBeenCalledOnce();
  });
});

describe("WidgetAddControl add-control-hook injection", () => {
  it("renders purely off an injected fake, proving useWidgetAddControl is not hardcoded", () => {
    // A freshly-mounted real `useWidgetAddControl` always starts `error: null` — it only ever sets a
    // string there after a failed `handleCreateNew`. A fake that reports an error on first render is
    // something the real hook cannot produce, so its presence proves the fake was actually used.
    function useFakeAddControl() {
      return {
        pickerType: null,
        setPickerType: vi.fn(),
        selectedType: "text" as const,
        setSelectedType: vi.fn(),
        error: "fake add-control error",
        handleCreateNew: vi.fn(),
        handleUseExisting: vi.fn(),
      };
    }

    render(<WidgetAddControl triggerLabel="+ Add widget" onResolved={vi.fn()} useAddControl={useFakeAddControl} />);

    expect(screen.getByText("fake add-control error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add widget" })).toBeInTheDocument();
    // `pickerType: null` in the fake means no dialog renders — same as the real hook's own default.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * Coverage-gap-fill (2026-09-05). The injection block above always drives `WidgetAddControl`
 * through a FAKE `useAddControl`, so three real-hook-only lines had never run: the type `<Select>`'s
 * own `onChange` (only its presence was asserted, never a change), the "Create new" Title input's
 * `onChange`, and `WidgetAddControl`'s own `onCancel={() => setPickerType(null)}` (distinct from
 * `WidgetPickerDialog`'s own Escape-driven `onCancel` tested above, which renders the dialog
 * directly rather than through `WidgetAddControl`).
 */
describe("WidgetAddControl — real flow (unmocked useWidgetAddControl)", () => {
  it("changing the type Select, typing a new title, then Cancel — all three reach the real hook with no widget created", async () => {
    const user = userEvent.setup();
    // No existing instances of ANY type — forces the dialog straight to "Create new", the section
    // the Title input lives in.
    fetchMock.mockResolvedValue(jsonResponse({ widgets: [] }));
    const onResolved = vi.fn();

    render(<WidgetAddControl triggerLabel="Insert widget" onResolved={onResolved} />);

    await user.click(screen.getByRole("combobox", { name: "Widget type" }));
    await user.click(screen.getByRole("option", { name: "Social Links" }));

    await user.click(screen.getByRole("button", { name: "Insert widget" }));
    expect(await screen.findByRole("heading", { name: "Place a Social Links widget" })).toBeInTheDocument();

    const titleInput = screen.getByLabelText("Title");
    await user.type(titleInput, "My new widget");
    expect(titleInput).toHaveValue("My new widget");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
