import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormEditor } from "../FormEditor";

/**
 * @file `FormEditor` — pins the fix for the audit's live-verified blocker (exec summary #3): a
 * bogus form id previously rendered `"form definition 'X' was not found"` AND, underneath it, a
 * fully live, empty, saveable form with a working Save button — because the original guard
 * (`if (!isNew && !form && !error) return <Loading/>`) only covered the pre-error state, and fell
 * through once `error` was set. Follows the RTL harness `Plugins.unit.test.tsx` established for
 * this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a form id that does not resolve", () => {
  it("renders only the not-found error, never a live Save button underneath it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "form definition 'bogus' was not found" }, 404));

    render(<FormEditor formId="bogus" />);

    expect(await screen.findByText(/was not found/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create form/i })).not.toBeInTheDocument();
    // The fields table (`Add field` control) must not be reachable either — the whole editor body.
    expect(screen.queryByRole("button", { name: /add field/i })).not.toBeInTheDocument();
  });
});

describe("a later save failure, after the form already loaded", () => {
  it("keeps the editor on screen and shows the error inline, rather than blanking it", async () => {
    const form = {
      id: "f1",
      name: "Contact",
      slug: "contact",
      status: "active",
      fields: [],
      notify: { enabled: false, recipients: [] },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: form }))
      .mockResolvedValueOnce(jsonResponse({ error: "save failed" }, 500));

    render(<FormEditor formId="f1" />);

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    saveButton.click();

    expect(await screen.findByText("save failed")).toBeInTheDocument();
    // Still on screen, not replaced by an error-only view.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });
});

describe("field attributes modal", () => {
  function formWithOneField() {
    return {
      id: "f1",
      name: "Contact",
      slug: "contact",
      status: "active",
      fields: [{ id: "email", label: "Email", type: "text", required: false }],
      notify: { enabled: false, recipients: [] },
    };
  }

  it("opens from the row's kebab trigger, and round-trips a CSS class + an allowlisted attribute into the save payload", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: formWithOneField() }))
      .mockResolvedValueOnce(jsonResponse({ data: formWithOneField() }));

    render(<FormEditor formId="f1" />);

    const trigger = await screen.findByRole("button", { name: /attributes for field "email"/i });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: /field attributes/i });
    const dialogScope = within(dialog);

    await user.type(dialogScope.getByLabelText(/css classes/i), "md:col-span-2 w-1/2");
    await user.click(dialogScope.getByRole("button", { name: /add attribute/i }));
    await user.type(dialogScope.getByLabelText(/^name$/i), "aria-label");
    await user.type(dialogScope.getByLabelText(/^value$/i), "Work email");
    await user.click(dialogScope.getByRole("button", { name: /^save$/i }));

    // Modal closed, back to the field table.
    expect(screen.queryByRole("dialog", { name: /field attributes/i })).not.toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveButton);

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall as [string, RequestInit])[1].body as string);
    expect(body.fields[0].className).toBe("md:col-span-2 w-1/2");
    expect(body.fields[0].attributes).toEqual({ "aria-label": "Work email" });
  });

  it("rejects a non-allowlisted attribute name client-side, keeping the modal open with an error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: formWithOneField() }));

    render(<FormEditor formId="f1" />);

    const trigger = await screen.findByRole("button", { name: /attributes for field "email"/i });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: /field attributes/i });
    const dialogScope = within(dialog);

    await user.click(dialogScope.getByRole("button", { name: /add attribute/i }));
    await user.type(dialogScope.getByLabelText(/^name$/i), "onclick");
    await user.type(dialogScope.getByLabelText(/^value$/i), "alert(1)");
    await user.click(dialogScope.getByRole("button", { name: /^save$/i }));

    expect(await dialogScope.findByRole("alert")).toHaveTextContent(/onclick.*isn't allowed/i);
    // Still open — the save did not go through.
    expect(screen.getByRole("dialog", { name: /field attributes/i })).toBeInTheDocument();
  });

  it("Cancel discards edits without touching the field", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: formWithOneField() }));

    render(<FormEditor formId="f1" />);

    const trigger = await screen.findByRole("button", { name: /attributes for field "email"/i });
    await user.click(trigger);

    let dialog = await screen.findByRole("dialog", { name: /field attributes/i });
    await user.type(within(dialog).getByLabelText(/css classes/i), "should-not-persist");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("dialog", { name: /field attributes/i })).not.toBeInTheDocument();
    // WCAG 2.1 AA — focus returns to the trigger that opened the dialog.
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = await screen.findByRole("dialog", { name: /field attributes/i });
    expect(within(dialog).getByLabelText(/css classes/i)).toHaveValue("");
  });
});
