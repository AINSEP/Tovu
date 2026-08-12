import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useIntegrations } from "../hooks/use-integrations.hooks";
import { createFakeIntegrationsPort } from "../hooks/integrations-dependencies.hooks";
import type { AdminWebhookSubscription } from "../../../lib/api";

/**
 * @file `useIntegrations` — the Integrations LIST screen's load/create/pause/delete state.
 * `Integrations.unit.test.tsx` already exercises the full UI flow through a stubbed `fetch`; this
 * file is the hook's own injected-port coverage — see `integrations-port.hooks.ts` for why the
 * injection exists.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — see `use-integrations.hooks.ts`'s own file
 * header): every `useIntegrations(port, ...)` call below passes `fakeT`/`fakeLocale`, matching
 * `wired-hooks-convention.md`'s own `t: (k) => k` example — except the dedicated "injected t/locale
 * are genuinely returned" group, which uses distinctive fakes to prove the values are not built
 * internally.
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
const fakeLocale = "en";

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

    const { result } = renderHook(() => useIntegrations(port, fakeT, fakeLocale), { wrapper });

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
    const { result } = renderHook(() => useIntegrations(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.subscriptions).toEqual([]));

    act(() => {
      result.current.setLabel("New hook");
      result.current.setTargetUrl("https://example.com/new");
      result.current.setTopics("post.published, post.deleted");
    });
    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    // `createMutation` invalidates `KEYS.list` rather than setting `subscriptions` directly from
    // its own response (2026-08-12, `lib/fetch-query` migration) — the invalidated query's
    // background refetch is not guaranteed to have landed the instant `onCreate` resolves (`
    // invalidateQueries` is deliberately not awaited, `adapter.tanstack.tsx`'s own comment), so
    // `waitFor` instead of a bare synchronous read.
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));
    expect(result.current.subscriptions?.[0]?.label).toBe("New hook");
    expect(result.current.subscriptions?.[0]?.topics).toEqual(["post.published", "post.deleted"]);
    expect(result.current.formOpen).toBe(false);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("onTogglePause flips status through the port", async () => {
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture({ status: "active" })] });
    const { result } = renderHook(() => useIntegrations(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));

    await act(async () => {
      await result.current.onTogglePause(subscriptionFixture({ status: "active" }));
    });

    // See `onCreate`'s own comment above — the invalidated `KEYS.list` refetch, not a direct
    // response assignment, is what updates `subscriptions` here.
    await waitFor(() => expect(result.current.subscriptions?.[0]?.status).toBe("paused"));
  });

  it("onDelete removes the pending subscription through the port", async () => {
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture()] });
    const { result } = renderHook(() => useIntegrations(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));

    act(() => result.current.setPendingDelete(subscriptionFixture()));
    await act(async () => {
      await result.current.onDelete();
    });

    // See `onCreate`'s own comment above — the invalidated `KEYS.list` refetch, not a direct
    // response assignment, is what updates `subscriptions` here.
    await waitFor(() => expect(result.current.subscriptions).toEqual([]));
    expect(result.current.pendingDelete).toBeNull();
  });
});

describe("useIntegrations — injected t/locale are genuinely returned, not built internally", () => {
  /**
   * Standing i18n rule (2026-08-11, `Integrations.tsx` no longer imports `useAdminLocale` itself):
   * `t`/`locale` must come from the hook's own second/third parameters, not something this hook
   * quietly rebuilds internally. Distinctive fakes (not the identity `fakeT`/`"en"` every other
   * test in this file uses) prove the returned values are literally the ones passed in — an
   * identity `t` or the same `fakeLocale` value would pass this same assertion even if the hook
   * silently ignored its arguments. Mirrors `use-post-editor.hooks.unit.test.tsx`'s identical
   * negative-verification group.
   */
  it("result.current.t/locale are exactly the injected values, not hook-internal ones", async () => {
    const port = createFakeIntegrationsPort({ subscriptions: [subscriptionFixture()] });
    const distinctiveT = (key: string): string => `TRANSLATED[${key}]`;

    const { result } = renderHook(() => useIntegrations(port, distinctiveT, "fr"), { wrapper });

    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));
    expect(result.current.t("Integrations")).toBe("TRANSLATED[Integrations]");
    expect(result.current.t).toBe(distinctiveT);
    expect(result.current.locale).toBe("fr");
  });
});
