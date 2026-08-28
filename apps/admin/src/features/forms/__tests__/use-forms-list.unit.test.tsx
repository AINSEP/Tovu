import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useFormsList } from "../hooks/use-forms-list.hooks";
import { createFakeFormsPort } from "../hooks/forms-dependencies.hooks";
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
});
