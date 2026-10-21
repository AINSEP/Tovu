import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminWebhookSubscription } from "@/lib/api";
import { Integrations } from "../Integrations";
import { createFakeIntegrationsPort } from "../hooks/integrations-dependencies.hooks";
import { useIntegrations, type IntegrationsController } from "../hooks/use-integrations.hooks";

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
    await waitFor(() => expect(within(screen.getByRole("link", { name: "My webhook" }).closest("tr")!).getByText("Paused")).toBeInTheDocument());
    expect(within(screen.getByRole("link", { name: "Other webhook" }).closest("tr")!).getByText("Active")).toBeInTheDocument();
  });

  it("withholds the menu entirely for a disabled subscription, rather than an unusable empty dropdown", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscriptions: [{ ...SUBSCRIPTION, status: "disabled" }] }));

    renderScreen(<Integrations />);

    await screen.findByText("My webhook");
    expect(screen.queryByRole("button", { name: /actions for webhook/i })).not.toBeInTheDocument();
  });
});

/**
 * The real `useIntegrations` over the in-memory port, through the component's `useIntegrationsHook`
 * seam; `overrides` pins a state (an error, an in-flight save) the fake port would otherwise only
 * reach transiently.
 */
function renderWithPort(
  port: ReturnType<typeof createFakeIntegrationsPort>,
  overrides: Partial<IntegrationsController> = {},
) {
  function useHook(): IntegrationsController {
    return { ...useIntegrations(port, (key) => key, "en"), ...overrides };
  }
  return renderScreen(<Integrations useIntegrationsHook={useHook} />);
}

describe("screen states", () => {
  it("shows the load error instead of the list", () => {
    renderWithPort(createFakeIntegrationsPort(), { error: "Could not load webhooks." });
    expect(screen.getByText("Could not load webhooks.")).toHaveClass("notice", "error");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the last delivery's status, and never when there is none", async () => {
    const delivered: AdminWebhookSubscription = {
      ...SUBSCRIPTION,
      id: "sub2",
      label: "Release hook",
      lastDelivery: {
        id: "del1",
        status: "delivered",
        attempts: 1,
        lastResponseStatus: 200,
        lastError: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        deliveredAt: "2026-08-02T00:00:01.000Z",
      },
    };
    renderWithPort(createFakeIntegrationsPort({ subscriptions: [SUBSCRIPTION, delivered] }));
    await screen.findByRole("link", { name: "Release hook" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]!.querySelector(".muted-cell")).toHaveTextContent("never");
    expect(rows[1]!.querySelector(".status-delivery-delivered")).toHaveTextContent("Delivered");
  });
});

describe("create form", () => {
  it("Add webhook opens the form (hiding itself), Cancel closes it again", async () => {
    const user = userEvent.setup();
    renderWithPort(createFakeIntegrationsPort());
    await user.click(await screen.findByRole("button", { name: "Add webhook" }));
    expect(screen.queryByRole("button", { name: "Add webhook" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add webhook" })).toBeInTheDocument();
  });

  it("creates a subscription from the three fields", async () => {
    const user = userEvent.setup();
    const port = createFakeIntegrationsPort();
    renderWithPort(port);
    await user.click(await screen.findByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByRole("textbox", { name: "Label" }), "Deploy hook");
    await user.type(screen.getByRole("textbox", { name: "Target URL" }), "https://example.com/deploy");
    await user.type(screen.getByRole("textbox", { name: /Topics/ }), "post.published, post.*");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("link", { name: "Deploy hook" })).toBeInTheDocument();
    expect(port.subscriptions).toMatchObject([
      { label: "Deploy hook", targetUrl: "https://example.com/deploy", topics: ["post.published", "post.*"] },
    ]);
  });

  it("shows the form error and a disabled Saving… button while a create is in flight", async () => {
    renderWithPort(createFakeIntegrationsPort(), { formOpen: true, formError: "Target URL must be https.", saving: true });
    expect(await screen.findByText("Target URL must be https.")).toHaveClass("save-error");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("delete confirm", () => {
  it("cancelling the confirm dialog keeps the subscription", async () => {
    const user = userEvent.setup();
    const port = createFakeIntegrationsPort({ subscriptions: [SUBSCRIPTION] });
    renderWithPort(port);
    await user.click(await screen.findByRole("button", { name: /actions for webhook "my webhook"/i }));
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(port.subscriptions).toHaveLength(1);
  });
});
