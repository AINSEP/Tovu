import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormsList } from "../FormsList";

/**
 * @file `FormsList` — pins this dispatch's row-actions pass: a `RowMenu` "More" column matching
 * `Posts.tsx`/`Pages.tsx`, with exactly two items (Edit, and a single bidirectional status
 * toggle) and deliberately no Delete — see `FormsList.tsx`'s own file header for why a delete
 * item is not invented (no `deleteForm` route exists anywhere in this stack, only
 * `deleteFormSubmission`, a different resource). Follows the RTL harness
 * `Media.unit.test.tsx`/`Plugins.unit.test.tsx` established for this package (mocked global
 * `fetch`, URL-routed rather than call-order-coupled, no server).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_FORM = {
  id: "f1",
  workspaceId: "workspace-local",
  name: "Contact",
  slug: "contact",
  fields: [],
  notify: { enabled: false, recipients: [] },
  status: "active" as const,
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
};

const DISABLED_FORM = {
  ...ACTIVE_FORM,
  id: "f2",
  name: "Newsletter",
  slug: "newsletter",
  status: "disabled" as const,
};

/** Routes a mocked `fetch` call on method + a distinguishing URL substring — see
 *  `Media.unit.test.tsx`'s identical helper for why (order/count-coupled mocks silently
 *  mis-assert the moment a call is added or reordered). */
function routeFetch(routes: Array<{ method?: string; match: string; handler: () => Promise<Response> }>) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const entry = routes.find((r) => url.includes(r.match) && (r.method ?? "GET") === method);
    if (!entry) return Promise.reject(new Error(`FormsList test: no mocked route for ${method} ${url}`));
    return entry.handler();
  };
}

/** Async because the list renders "Loading forms…" first — a synchronous `getByRole` here runs
 *  before the mocked fetch resolves and fails on every caller. `findByRole` waits for the row to
 *  exist, which is what the tests that already awaited a query directly were getting for free. */
async function rowFor(title: string): Promise<HTMLElement> {
  const link = await screen.findByRole("link", { name: title });
  const row = link.closest("tr");
  if (!row) throw new Error(`row for "${title}" has no <tr> ancestor`);
  return row as HTMLElement;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `FormsList` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for and never counted as one of
  // the form-data GETs they assert on. Routed here, ahead of `fetchMock`, so `fetchMock` keeps
  // meaning exactly what this file's tests assert on it.
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
  // `navigate()` (lib/router) drives real `history.pushState` — reset between tests so the Edit
  // test below can't leak a route into a later test run in this same file.
  window.history.pushState(null, "", "/");
});

describe("More column", () => {
  it("renders a More header and one RowMenu trigger per row", async () => {
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM, DISABLED_FORM] })) }]));
    render(<FormsList />);

    expect(await screen.findByRole("columnheader", { name: "More" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Actions for form "Contact"' })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Actions for form "Newsletter"' })).toBeInTheDocument();
  });
});

describe("row menu contents", () => {
  it("an active form's menu offers Edit and Disable (not Enable), Disable carrying the warning tone", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) }]));
    render(<FormsList />);

    await user.click(await screen.findByRole("button", { name: 'Actions for form "Contact"' }));

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    const disable = screen.getByRole("menuitem", { name: "Disable" });
    expect(disable).toHaveClass("btn-warning");
    expect(screen.queryByRole("menuitem", { name: "Enable" })).not.toBeInTheDocument();
  });

  it("a disabled form's menu offers Enable (not Disable), with no warning/danger tone", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [DISABLED_FORM] })) }]));
    render(<FormsList />);

    await user.click(await screen.findByRole("button", { name: 'Actions for form "Newsletter"' }));

    const enable = screen.getByRole("menuitem", { name: "Enable" });
    expect(enable).not.toHaveClass("btn-warning");
    expect(enable).not.toHaveClass("btn-danger");
    expect(screen.queryByRole("menuitem", { name: "Disable" })).not.toBeInTheDocument();
  });

  it("never offers a Delete item — no deleteForm route exists to wire one to", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) }]));
    render(<FormsList />);

    await user.click(await screen.findByRole("button", { name: 'Actions for form "Contact"' }));

    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
    // No ConfirmDialog either — this screen has nothing that needs one.
    expect(document.querySelector("dialog")).not.toBeInTheDocument();
  });
});

describe("status toggle", () => {
  it("selecting Disable PUTs status: disabled and updates the row's badge without a full reload", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) },
        {
          match: "/forms/f1",
          method: "PUT",
          handler: () => Promise.resolve(jsonResponse({ data: { ...ACTIVE_FORM, status: "disabled" } })),
        },
      ])
    );
    render(<FormsList />);
    const row = await rowFor("Contact");

    await user.click(within(row).getByRole("button", { name: 'Actions for form "Contact"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));

    await waitFor(() => expect(within(row).getByText("disabled")).toBeInTheDocument());
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeTruthy();
    const putBody = JSON.parse(String((putCall![1] as RequestInit).body));
    expect(putBody).toEqual({ status: "disabled" });
    // Only one GET (initial load) — a status flip updates local state from the PUT's own
    // response rather than re-fetching the whole list, matching Posts.tsx/Pages.tsx.
    const getCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === undefined || (init as RequestInit)?.method === "GET");
    expect(getCalls).toHaveLength(1);
  });

  it("selecting Enable PUTs status: active", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [DISABLED_FORM] })) },
        {
          match: "/forms/f2",
          method: "PUT",
          handler: () => Promise.resolve(jsonResponse({ data: { ...DISABLED_FORM, status: "active" } })),
        },
      ])
    );
    render(<FormsList />);
    const row = await rowFor("Newsletter");

    await user.click(within(row).getByRole("button", { name: 'Actions for form "Newsletter"' }));
    await user.click(screen.getByRole("menuitem", { name: "Enable" }));

    await waitFor(() => expect(within(row).getByText("active")).toBeInTheDocument());
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((putCall![1] as RequestInit).body))).toEqual({ status: "active" });
  });

  it("a failed toggle keeps the table on screen and shows the error inline, rather than blanking it", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) },
        { match: "/forms/f1", method: "PUT", handler: () => Promise.resolve(jsonResponse({ error: "boom" }, 500)) },
      ])
    );
    render(<FormsList />);
    const row = await rowFor("Contact");

    await user.click(within(row).getByRole("button", { name: 'Actions for form "Contact"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));

    // `request()` (api.ts) throws an `ApiError` carrying the server's own `body.error` verbatim
    // ("boom") — the `"failed to update form status"` fallback in `FormsList.tsx`'s catch block
    // only fires for a non-`Error` throw, which this isn't. Asserting the literal server message,
    // same as `FormEditor.unit.test.tsx`'s own "save failed" precedent, not the fallback text.
    expect(await screen.findByText("boom")).toBeInTheDocument();
    // Still on screen — the table did not disappear behind a full-page error.
    expect(screen.getByRole("link", { name: "Contact" })).toBeInTheDocument();
    expect(within(row).getByText("active")).toBeInTheDocument();
  });

  it("guards against a second toggle firing while the first is still in flight (RowMenu has no per-item disabled, so the guard lives in onSelect)", async () => {
    const user = userEvent.setup();
    let resolvePut!: (r: Response) => void;
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    let putCallCount = 0;
    fetchMock.mockImplementation(
      routeFetch([
        { match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) },
        {
          match: "/forms/f1",
          method: "PUT",
          handler: () => {
            putCallCount += 1;
            return putPromise;
          },
        },
      ])
    );
    render(<FormsList />);
    const row = await rowFor("Contact");

    // First selection starts the (still-pending) PUT.
    await user.click(within(row).getByRole("button", { name: 'Actions for form "Contact"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(putCallCount).toBe(1);

    // Re-open the menu while the first PUT is still unresolved and select Disable again — the
    // row's status hasn't changed yet (still "active"), so without the `rowSavingId` guard this
    // would fire a second identical PUT.
    await user.click(within(row).getByRole("button", { name: 'Actions for form "Contact"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(putCallCount).toBe(1);

    resolvePut(jsonResponse({ data: { ...ACTIVE_FORM, status: "disabled" } }));
    await waitFor(() => expect(within(row).getByText("disabled")).toBeInTheDocument());
  });
});

describe("Edit", () => {
  it("navigates to /forms/:id via the router (not a full page load)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) }]));
    render(<FormsList />);
    const row = await rowFor("Contact");

    await user.click(within(row).getByRole("button", { name: 'Actions for form "Contact"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(window.location.pathname).toBe("/admin/forms/f1");
  });
});
