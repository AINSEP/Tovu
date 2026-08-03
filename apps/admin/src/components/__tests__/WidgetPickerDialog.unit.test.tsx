import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { WidgetPickerDialog } from "../WidgetPickerDialog";

/**
 * @file `WidgetPickerDialog` — end-to-end proof, in the real dialog (not just `Select.unit.test.tsx`'s
 * emulated host), that swapping its two native `<select>`s for `components/Select.tsx` didn't
 * reintroduce the exact regression the dispatch that made that swap called out by name: this
 * dialog's own `document`-level Escape listener (the `onCancel` effect below `useExistingInstances`)
 * must not fire when Escape is only meant to close the new dropdown's floating panel.
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

let fetchMock: ReturnType<typeof vi.fn>;

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
