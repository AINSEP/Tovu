import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { FormEditor } from "../FormEditor";

/**
 * @file `FormEditor` — pins the fix for the audit's live-verified blocker (exec summary #3): a
 * bogus form id previously rendered `"form definition 'X' was not found"` AND, underneath it, a
 * fully live, empty, saveable form with a working Save button — because the original guard
 * (`if (!isNew && !form && !error) return <Loading/>`) only covered the pre-error state, and fell
 * through once `error` was set. Follows the RTL harness `Plugins.unit.test.tsx` established for
 * this package.
 *
 * `renderScreen` wraps every render in `FetchQueryProvider` (2026-08-12, `lib/fetch-query`
 * migration) — `FormEditor`'s hooks are now backed by `useFetchQuery`/`useFetchMutation`, which
 * throw without a `QueryClientProvider` ancestor. `main.tsx` provides this in production; here it
 * is one `FetchQueryProvider` per render, matching `taxonomy`'s own component-test precedent.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderScreen(node: React.ReactElement) {
  return render(<FetchQueryProvider>{node}</FetchQueryProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `FormEditor` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the `mockResolvedValueOnce` sequence every test
  // below still queues on `fetchMock` itself unchanged.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a form id that does not resolve", () => {
  it("renders only the not-found error, never a live Save button underneath it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "form definition 'bogus' was not found" }, 404));

    renderScreen(<FormEditor formId="bogus" />);

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

    renderScreen(<FormEditor formId="f1" />);

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

    renderScreen(<FormEditor formId="f1" />);

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

    renderScreen(<FormEditor formId="f1" />);

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

    renderScreen(<FormEditor formId="f1" />);

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

/**
 * @file (cont'd) Direct coverage for `FormEditorFieldsBody`, `FormEditorTabStrip`, and
 * `FormEditorMainPanel` — extracted out of `FormEditor` by the complexity-ceiling pass. None of
 * these branches (notify recipients reveal, the Enable/Disable status toggle, the Fields/
 * Submissions tab switch, and the new-form "Create form" vs existing-form "Save" label) were
 * exercised by the tests above, which only drove the load-error guards and the field-attributes
 * modal. Added per the refactor brief's "every extracted unit gets its own direct unit test" rule.
 */
describe("new form — no tabs, Create form label, notify recipients reveal", () => {
  it("renders no tab strip for a new form, and the Save button reads 'Create form'", async () => {
    renderScreen(<FormEditor formId="new" />);

    expect(screen.getByRole("button", { name: /create form/i })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("reveals the recipients input only once notify is enabled", async () => {
    const user = userEvent.setup();
    renderScreen(<FormEditor formId="new" />);

    expect(screen.queryByLabelText(/recipients/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /enable email notification/i }));
    expect(screen.getByLabelText(/recipients/i)).toBeInTheDocument();
  });
});

describe("existing form — tab strip, status toggle, submissions panel", () => {
  function activeForm() {
    return {
      id: "f1",
      name: "Contact",
      slug: "contact",
      status: "active",
      fields: [],
      notify: { enabled: false, recipients: [] },
    };
  }

  it("shows the tab strip and switches to the Submissions panel on click", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: activeForm() }))
      .mockResolvedValueOnce(jsonResponse({ data: [] })); // FormSubmissions' own load on mount

    renderScreen(<FormEditor formId="f1" />);

    const tablist = await screen.findByRole("tablist");
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: /fields/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /submissions/i }));

    expect(await screen.findByRole("tabpanel", { name: /submissions/i })).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: /fields/i })).not.toBeInTheDocument();
  });

  it("an active form's status button reads 'Disable' (btn-warning) and flips the form to disabled", async () => {
    const user = userEvent.setup();
    // Two mocked responses, not three (2026-08-12, `lib/fetch-query` migration): `handleStatusToggle`
    // now sets `form` directly from the PUT's OWN response rather than following it with a separate
    // reload GET — see `use-form-editor.hooks.ts`'s own doc comment on why `statusMutation` doesn't
    // invalidate its own `KEYS.form(id)` read. The PUT response therefore needs to carry the real
    // updated `data`, not the empty body the pre-migration reload-based flow could get away with.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: activeForm() }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...activeForm(), status: "disabled" } })); // PUT status update

    renderScreen(<FormEditor formId="f1" />);

    const disableButton = await screen.findByRole("button", { name: /^disable$/i });
    expect(disableButton).toHaveClass("btn-warning");

    await user.click(disableButton);

    expect(await screen.findByRole("button", { name: /^enable$/i })).toBeInTheDocument();
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall as [string, RequestInit])[1].body as string);
    expect(body.status).toBe("disabled");
  });
});
