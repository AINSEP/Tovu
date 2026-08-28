import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useIntegrationDeliveries } from "../hooks/use-integration-deliveries.hooks";
import { createFakeIntegrationDeliveriesPort } from "../hooks/integration-deliveries-dependencies.hooks";
import type { AdminWebhookDelivery } from "@/lib/api";

/**
 * @file `useIntegrationDeliveries` — the delivery-log screen's load effect.
 * `IntegrationDeliveries.unit.test.tsx` already exercises the full UI flow via the component-level
 * DI prop; this file is the hook's own injected-port coverage — see `integration-deliveries-
 * port.hooks.ts` for why the injection exists.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-integration-deliveries.hooks.ts`'s own file
 * header): every `useIntegrationDeliveries(id, port, ...)` call below passes `fakeT`, the identity
 * function, matching `wired-hooks-convention.md`'s own `t: (k) => k` example — except the dedicated
 * "injected t is genuinely returned" group, which uses a distinctive fake.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

/** Identity translator for tests that don't care about `t`'s own behavior — see this file's header. */
const fakeT = (key: string): string => key;

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

    const { result } = renderHook(() => useIntegrationDeliveries("sub1", port, fakeT), { wrapper });

    await waitFor(() => expect(result.current.deliveries).not.toBeNull());
    expect(result.current.deliveries).toEqual([deliveryFixture()]);
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected port call's message on the error channel", async () => {
    const port = createFakeIntegrationDeliveriesPort();
    port.listIntegrationDeliveries = () => Promise.reject(new Error("deliveries table locked"));

    const { result } = renderHook(() => useIntegrationDeliveries("sub1", port, fakeT), { wrapper });

    await waitFor(() => expect(result.current.error).toBe("deliveries table locked"));
    expect(result.current.deliveries).toBeNull();
  });

  it("re-fetches when subscriptionId changes", async () => {
    const port = createFakeIntegrationDeliveriesPort({ deliveries: [deliveryFixture({ id: "del-for-sub1" })] });
    const { result, rerender } = renderHook(({ subscriptionId }) => useIntegrationDeliveries(subscriptionId, port, fakeT), {
      initialProps: { subscriptionId: "sub1" },
      wrapper,
    });
    await waitFor(() => expect(result.current.deliveries).toEqual([deliveryFixture({ id: "del-for-sub1" })]));

    port.listIntegrationDeliveries = async () => ({ deliveries: [deliveryFixture({ id: "del-for-sub2", subscriptionId: "sub2" })] });
    rerender({ subscriptionId: "sub2" });

    await waitFor(() =>
      expect(result.current.deliveries).toEqual([deliveryFixture({ id: "del-for-sub2", subscriptionId: "sub2" })])
    );
  });
});

describe("useIntegrationDeliveries — injected t is genuinely returned, not built internally", () => {
  /**
   * Standing i18n rule (2026-08-11, `IntegrationDeliveries.tsx` no longer imports `useAdminLocale`/
   * `integrations-i18n` itself): `t` must come from the hook's own third parameter, not something
   * this hook quietly rebuilds internally. A DISTINCTIVE fake (not the identity `fakeT` every other
   * test in this file uses) proves the returned `t` is literally the same function reference passed
   * in. Mirrors `use-post-editor.hooks.unit.test.tsx`'s identical negative-verification group.
   */
  it("result.current.t is exactly the injected function, not a hook-internal one", async () => {
    const port = createFakeIntegrationDeliveriesPort({ deliveries: [deliveryFixture()] });
    const distinctiveT = (key: string): string => `TRANSLATED[${key}]`;

    const { result } = renderHook(() => useIntegrationDeliveries("sub1", port, distinctiveT), { wrapper });

    await waitFor(() => expect(result.current.deliveries).not.toBeNull());
    expect(result.current.t("Delivery log")).toBe("TRANSLATED[Delivery log]");
    expect(result.current.t).toBe(distinctiveT);
  });
});
