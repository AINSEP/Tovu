import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { useFormsList } from "../hooks/use-forms-list.hooks";
import { createFakeFormsPort } from "../hooks/forms-dependencies.hooks";
import { FORMS_LIST_RESOURCE } from "../rules";
import type { AdminFormDefinition } from "@/lib/api";

/**
 * @file `useFormsList` — the Forms LIST screen's load/status-toggle state.
 * `FormsList.unit.test.tsx` already exercises the full UI flow through a stubbed `fetch`; this
 * file is the hook's own injected-port coverage — see `forms-port.hooks.ts` for why the injection
 * exists.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function formFixture(overrides: Partial<AdminFormDefinition> = {}): AdminFormDefinition {
  return {
    id: "f1",
    workspaceId: "fake-ws",
    name: "Contact",
    slug: "contact",
    fields: [],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFormsList — injected port", () => {
  it("loads forms on mount from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeFormsPort({ forms: [formFixture()] });
    const t = (key: string) => `[${key}]`;

    const { result } = renderHook(() => useFormsList({ port, t }), { wrapper });

    await waitFor(() => expect(result.current.forms).not.toBeNull());
    expect(result.current.forms).toEqual([formFixture()]);
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
    // Proves `t` is the injected fake, not a real FORMS_DICT lookup — the whole point of the
    // standing i18n rule (a component sources `t` from its hook, and a test can hand it a stable
    // fake instead of asserting on translated copy).
    expect(result.current.t("Forms")).toBe("[Forms]");
  });

  it("toggleStatus flips the form's status through the port", async () => {
    const port = createFakeFormsPort({ forms: [formFixture({ status: "active" })] });
    const { result } = renderHook(() => useFormsList({ port, t: (key: string) => key }), { wrapper });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));

    await act(async () => {
      await result.current.toggleStatus(formFixture({ status: "active" }));
    });

    expect(result.current.forms?.[0]?.status).toBe("disabled");
    expect(result.current.rowSavingId).toBeNull();
  });

  it("toggleStatus is a no-op while a previous call is still in flight (RowMenu has no per-item disabled, so this is the only guard against a second identical write)", async () => {
    const port = createFakeFormsPort({ forms: [formFixture({ status: "active" })] });
    let resolveUpdate!: (value: { data: AdminFormDefinition }) => void;
    const updateSpy = vi.fn(() => new Promise<{ data: AdminFormDefinition }>((resolve) => { resolveUpdate = resolve; }));
    port.updateForm = updateSpy;
    const { result } = renderHook(() => useFormsList({ port, t: (key: string) => key }), { wrapper });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));

    // First call starts and stays pending (updateSpy never resolves until we say so).
    act(() => {
      void result.current.toggleStatus(formFixture({ status: "active" }));
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe("f1"));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // A second call while the first is still unresolved must not reach the port at all — proves the
    // guard lives inside toggleStatus itself, not merely in FormsList.tsx's caller.
    await act(async () => {
      await result.current.toggleStatus(formFixture({ status: "active" }));
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);

    resolveUpdate({ data: formFixture({ status: "disabled" }) });
    await waitFor(() => expect(result.current.rowSavingId).toBeNull());
  });
});

/**
 * Regression coverage for the same class of bug `use-taxonomy.hooks.ts`'s own content-refresh suite
 * fixed first (see that file's header): `forms_create_definition`/`forms_update_definition`/
 * `forms_set_definition_status` (`apps/website/src/features/forms/agent-tools.ts`) are agent-
 * callable, so this list needs the same fix.
 *
 * Driven through the REAL `lib/content-refresh-bus`, same choice `use-taxonomy.hooks.ts` makes and
 * for the same reason: the thing worth asserting is the wiring between this hook and the bus.
 */
describe("useFormsList — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the list when a content refresh fires", async () => {
    const port = createFakeFormsPort({ forms: [formFixture()] });
    const { result } = renderHook(() => useFormsList({ port, t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));

    // A write landing server-side outside this hook — the screen has no other way to know it happened.
    port.forms.push(formFixture({ id: "f2", name: "Newsletter signup", slug: "newsletter" }));
    expect(result.current.forms).toHaveLength(1);

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.forms).toHaveLength(2));
  });

  it("refreshes on a notification that names forms, and ignores one that names only other resources", async () => {
    const port = createFakeFormsPort({ forms: [formFixture()] });
    const { result } = renderHook(() => useFormsList({ port, t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));

    port.forms.push(formFixture({ id: "f2", name: "Newsletter signup", slug: "newsletter" }));

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.forms).toHaveLength(1);

    act(() => publishContentRefresh([FORMS_LIST_RESOURCE]));
    await waitFor(() => expect(result.current.forms).toHaveLength(2));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeFormsPort({ forms: [formFixture()] });
    const listSpy = vi.spyOn(port, "listForms");
    const { result, unmount } = renderHook(() => useFormsList({ port, t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
