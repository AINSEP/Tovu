import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { FormsList } from "../index";
import { AdminModulesContext, createHostAdminScope } from "../../../integrations/jini-admin/modules.hooks";

/**
 * @file `FormsList` — pins this dispatch's row-actions pass: a `RowMenu` "More" column matching
 * `Posts.tsx`/`Pages.tsx`, with Edit, a bidirectional status toggle, and (T7a, 2026-09-21) a
 * destructive Delete that opens a `ConfirmDialog` ("Move to trash?") and, only on confirm, POSTs
 * the generic `/trash/items` route (`type: "form"`) — see `FormsList.tsx`'s own file header for the
 * fuller rationale. Follows the RTL harness `Media.unit.test.tsx`/`Plugins.unit.test.tsx`
 * established for this package (mocked global `fetch`, URL-routed rather than call-order-coupled,
 * no server).
 *
 * `renderScreen` wraps every render in `FetchQueryProvider` (2026-08-12, `@jini-ai/ui/fetch-query`
 * migration) — `FormsList`'s hooks are now backed by `useFetchQuery`/`useFetchMutation`, which
 * throw without a `FetchQueryProvider` ancestor. `main.tsx` provides this in production; here it
 * is one `FetchQueryProvider` per render, matching `taxonomy`'s own component-test precedent.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const scopes: ReturnType<typeof createHostAdminScope>[] = [];
function renderScreen(node: React.ReactElement) {
  const runtime = createHostAdminScope({ permissions: ['*'] });
  scopes.push(runtime);
  return render(<FetchQueryProvider><AdminModulesContext.Provider value={runtime}>{node}</AdminModulesContext.Provider></FetchQueryProvider>);
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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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
  for (const scope of scopes.splice(0)) { scope.admin.dispose(); scope.overlays.dispose(); }
  vi.unstubAllGlobals();
  // `navigate()` (lib/router) drives real `history.pushState` — reset between tests so the Edit
  // test below can't leak a route into a later test run in this same file.
  window.history.pushState(null, "", "/");
});

/** What a sighted operator reads in the dates cell: each line's short text, with the
 *  screen-reader-only labels left out. */
function visibleDateLines(cell: HTMLElement): string[] {
  return Array.from(cell.querySelectorAll("time [aria-hidden='true']"), (line) => line.textContent ?? "");
}

describe("Created / Updated column — host locale wiring", () => {
  it("uses the stored admin locale for the header, date order and hover labels", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/settings/effective")) {
        return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "de" }] }));
      }
      return fetchMock(input, init);
    });
    fetchMock.mockImplementation(routeFetch([{ match: "/forms", handler: () => Promise.resolve(jsonResponse({ data: [ACTIVE_FORM] })) }]));
    renderScreen(<FormsList />);

    expect(await screen.findByRole("columnheader", { name: "Erstellt / Aktualisiert" })).toBeInTheDocument();
    const dateCell = within(await rowFor("Contact")).getAllByRole("cell")[2];
    // German short order is day.month.year — "01.07.26, 11:00" in CEST.
    expect(visibleDateLines(dateCell)).toEqual([expect.stringMatching(/^\d{2}\.0[67]\.26, \d{2}:\d{2}$/)]);
    const title = dateCell.querySelector("time")!.getAttribute("title");
    expect(title).toMatch(/^Erstellt .* · Aktualisiert /);
    expect(title).toMatch(/(?:Juni|Juli)/);
  });
});
