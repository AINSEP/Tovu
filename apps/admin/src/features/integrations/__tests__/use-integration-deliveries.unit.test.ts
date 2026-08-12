import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIntegrationDeliveries } from "../hooks/use-integration-deliveries.hooks";
import { createFakeIntegrationDeliveriesPort } from "../hooks/integration-deliveries-dependencies.hooks";
import type { AdminWebhookDelivery } from "../../../lib/api";

/**
 * @file `useIntegrationDeliveries` — the delivery-log screen's load effect.
 * `IntegrationDeliveries.unit.test.tsx` already exercises the full UI flow via the component-level
 * DI prop; this file is the hook's own injected-port coverage — see `integration-deliveries-
 * port.hooks.ts` for why the injection exists.
 */

function deliveryFixture(overrides: Partial<AdminWebhookDelivery> = {}): AdminWebhookDelivery {
  return {
    id: "del1",
    subscriptionId: "sub1",
    eventId: "evt1",
    topic: "post.published",
    status: "delivered",
    attempts: 1,
    nextAttemptAt: "2026-08-01T00:00:00.000Z",
    lastResponseStatus: 200,
    lastError: null,
    signedWithVersion: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    deliveredAt: "2026-08-01T00:00:01.000Z",
    deadAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIntegrationDeliveries — injected port", () => {
  it("loads the fake port's seeded deliveries for the given subscription, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeIntegrationDeliveriesPort({ deliveries: [deliveryFixture()] });

    const { result } = renderHook(() => useIntegrationDeliveries("sub1", port));

    await waitFor(() => expect(result.current.deliveries).not.toBeNull());
    expect(result.current.deliveries).toEqual([deliveryFixture()]);
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected port call's message on the error channel", async () => {
    const port = createFakeIntegrationDeliveriesPort();
    port.listIntegrationDeliveries = () => Promise.reject(new Error("deliveries table locked"));

    const { result } = renderHook(() => useIntegrationDeliveries("sub1", port));

    await waitFor(() => expect(result.current.error).toBe("deliveries table locked"));
    expect(result.current.deliveries).toBeNull();
  });

  it("re-fetches when subscriptionId changes", async () => {
    const port = createFakeIntegrationDeliveriesPort({ deliveries: [deliveryFixture({ id: "del-for-sub1" })] });
    const { result, rerender } = renderHook(({ subscriptionId }) => useIntegrationDeliveries(subscriptionId, port), {
      initialProps: { subscriptionId: "sub1" },
    });
    await waitFor(() => expect(result.current.deliveries).toEqual([deliveryFixture({ id: "del-for-sub1" })]));

    port.listIntegrationDeliveries = async () => ({ deliveries: [deliveryFixture({ id: "del-for-sub2", subscriptionId: "sub2" })] });
    rerender({ subscriptionId: "sub2" });

    await waitFor(() =>
      expect(result.current.deliveries).toEqual([deliveryFixture({ id: "del-for-sub2", subscriptionId: "sub2" })])
    );
  });
});
