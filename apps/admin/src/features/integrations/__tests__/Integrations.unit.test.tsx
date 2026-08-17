import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
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
 * `renderScreen` wraps every render in `FetchQueryProvider` (2026-08-12, `lib/fetch-query`
 * migration) — `Integrations`'s hooks are now backed by `useFetchQuery`/`useFetchMutation`, which
 * throw without a `QueryClientProvider` ancestor. `main.tsx` provides this in production; here it
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
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [SUBSCRIPTION] }))
      .mockResolvedValueOnce(jsonResponse({ subscription: SUBSCRIPTION }))
      // `onDelete` reloads the list on success (`await reload()`), same as every other write in
      // this file — a second GET, not just the DELETE itself.
      .mockResolvedValueOnce(jsonResponse({ subscriptions: [] }));

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
  });

  it("withholds the menu entirely for a disabled subscription, rather than an unusable empty dropdown", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscriptions: [{ ...SUBSCRIPTION, status: "disabled" }] }));

    renderScreen(<Integrations />);

    await screen.findByText("My webhook");
    expect(screen.queryByRole("button", { name: /actions for webhook/i })).not.toBeInTheDocument();
  });
});
