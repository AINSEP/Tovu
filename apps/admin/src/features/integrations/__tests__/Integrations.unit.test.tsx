import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { Integrations } from "../Integrations";

/**
 * @file `Integrations` — pins the MSG-03 RowMenu rollout: the row's Pause/Delete buttons moved
 * into a shared `RowMenu`, and Delete's confirmation moved off a blocking `window.confirm` onto
 * the shared `ConfirmDialog`, preserving the exact prior copy ("cannot be undone"). Follows the
 * RTL harness `FormEditor.unit.test.tsx`/`PostEditor.unit.test.tsx` established for this package.
 *
 * `Integrations` now also reads the operator's locale via `useAdminLocale()` (a `core.language`
 * settings-effective GET). Routed to a fixed default-locale response outside `fetchMock`'s own
 * call queue below (same shim `Members.unit.test.tsx`/`Plugins.unit.test.tsx`/`Users.*.unit.test.tsx`
 * already use) so `fetchMock.mock.calls` still holds exactly this screen's own requests, in the
 * order each test already expects — order-independent, unlike seeding a leading queue slot.
 *
 * `renderScreen` wraps every render in `FetchQueryProvider` (2026-08-12, `@jini-ai/ui/fetch-query`
 * migration) — `Integrations`'s hooks are now backed by `useFetchQuery`/`useFetchMutation`, which
 * throw without a `FetchQueryProvider` ancestor. `main.tsx` provides this in production; here it
 * is one `FetchQueryProvider` per render, matching `taxonomy`'s own component-test precedent.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderScreen(node: React.ReactElement) {
  return render(<FetchQueryProvider>{node}</FetchQueryProvider>);
}

const SUBSCRIPTION = {
  id: "sub1",
  label: "My webhook",
  targetUrl: "https://example.com/hooks",
  topics: ["post.published"],
  status: "active" as const,
  secretVersion: 1,
  previousSecretVersion: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  disabledAt: null,
  lastDelivery: null,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("row actions menu", () => {
  it("moves Pause/Delete into a RowMenu, and Delete opens ConfirmDialog instead of window.confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const other = { ...SUBSCRIPTION, id: "sub2", label: "Other webhook" };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [other, SUBSCRIPTION] }))
      .mockResolvedValueOnce(jsonResponse({ subscription: SUBSCRIPTION }))
      // `onDelete` reloads the list on success (`await reload()`), same as every other write in
      // this file — a second GET, not just the DELETE itself.
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [other] }));

    renderScreen(<Integrations />);

    const trigger = await screen.findByRole("button", { name: /actions for webhook "my webhook"/i });
    await user.click(trigger);

    expect(await screen.findByRole("menuitem", { name: /^pause$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/delete webhook "my webhook"\? this cannot be undone\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    // GET (list) + DELETE + GET (reload).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[1]?.method).toBe("DELETE");
    expect(deleteCall[0]).toBe("/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/sub1");
    await waitFor(() => expect(screen.queryByRole("link", { name: "My webhook" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Other webhook" })).toBeInTheDocument();
  });

  it("Pause targets the chosen subscription and changes only its row to paused", async () => {
    const user = userEvent.setup();
    const other = { ...SUBSCRIPTION, id: "sub2", label: "Other webhook" };
    const paused = { ...SUBSCRIPTION, status: "paused" };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [other, SUBSCRIPTION] }))
      .mockResolvedValueOnce(jsonResponse({ subscription: paused }))
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [other, paused] }));
    renderScreen(<Integrations />);

    await user.click(await screen.findByRole("button", { name: /actions for webhook "my webhook"/i }));
    await user.click(screen.getByRole("menuitem", { name: /^pause$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/sub1/pause");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ paused: true });
    await waitFor(() => expect(within(screen.getByRole("link", { name: "My webhook" }).closest("tr")!).getByText("paused")).toBeInTheDocument());
    expect(within(screen.getByRole("link", { name: "Other webhook" }).closest("tr")!).getByText("active")).toBeInTheDocument();
  });

  it("withholds the menu entirely for a disabled subscription, rather than an unusable empty dropdown", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscriptions: [{ ...SUBSCRIPTION, status: "disabled" }] }));

    renderScreen(<Integrations />);

    await screen.findByText("My webhook");
    expect(screen.queryByRole("button", { name: /actions for webhook/i })).not.toBeInTheDocument();
  });
});
