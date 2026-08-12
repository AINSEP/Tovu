import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIntegrations } from "../hooks/use-integrations.hooks";
import { createFakeIntegrationsPort } from "../hooks/integrations-dependencies.hooks";
import type { AdminWebhookSubscription } from "../../../lib/api";

/**
 * @file `useIntegrations` — the Integrations LIST screen's load/create/pause/delete state.
 * `Integrations.unit.test.tsx` already exercises the full UI flow through a stubbed `fetch`; this
 * file is the hook's own injected-port coverage — see `integrations-port.hooks.ts` for why the
 * injection exists.
 */

function subscriptionFixture(overrides: Partial<AdminWebhookSubscription> = {}): AdminWebhookSubscription {
  return {
    id: "sub1",
    label: "My webhook",
    targetUrl: "https://example.com/hooks",
    topics: ["post.published"],
    status: "active",
    secretVersion: 1,
    previousSecretVersion: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    disabledAt: null,
    lastDelivery: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIntegrations — injected port", () => {
  it("loads subscriptions on mount from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture()] });

    const { result } = renderHook(() => useIntegrations(port));

    await waitFor(() => expect(result.current.subscriptions).not.toBeNull());
    expect(result.current.subscriptions).toEqual([subscriptionFixture()]);
    expect(result.current.error).toBeNull();
    // Proves the injection actually took, not just that the hook happened to resolve something —
    // a hook that still reached `api` internally would have hit this stub.
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("onCreate adds through the port and reloads the list", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeIntegrationsPort();
    const { result } = renderHook(() => useIntegrations(port));
    await waitFor(() => expect(result.current.subscriptions).toEqual([]));

    act(() => {
      result.current.setLabel("New hook");
      result.current.setTargetUrl("https://example.com/new");
      result.current.setTopics("post.published, post.deleted");
    });
    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(result.current.subscriptions).toHaveLength(1);
    expect(result.current.subscriptions?.[0]?.label).toBe("New hook");
    expect(result.current.subscriptions?.[0]?.topics).toEqual(["post.published", "post.deleted"]);
    expect(result.current.formOpen).toBe(false);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("onTogglePause flips status through the port", async () => {
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture({ status: "active" })] });
    const { result } = renderHook(() => useIntegrations(port));
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));

    await act(async () => {
      await result.current.onTogglePause(subscriptionFixture({ status: "active" }));
    });

    expect(result.current.subscriptions?.[0]?.status).toBe("paused");
  });

  it("onDelete removes the pending subscription through the port", async () => {
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture()] });
    const { result } = renderHook(() => useIntegrations(port));
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));

    act(() => result.current.setPendingDelete(subscriptionFixture()));
    await act(async () => {
      await result.current.onDelete();
    });

    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.pendingDelete).toBeNull();
  });
});
