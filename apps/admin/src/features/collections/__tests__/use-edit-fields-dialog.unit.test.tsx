import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminContentType } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { tabFromLastFocusableInDialog } from "@/hooks/__tests__/focus-trap.test-helpers";
import { createFakeEditFieldsDialogPort } from "../hooks/edit-fields-dialog-dependencies.hooks";
import { useEditFieldsDialog, useWiredEditFieldsDialog } from "../hooks/use-edit-fields-dialog.hooks";
import type { EditFieldsDialogPort } from "../hooks/edit-fields-dialog-port.hooks";

/**
 * @file `useEditFieldsDialog` — `EditFieldsDialog`'s own state and submit action (SPEC-037 REQ-05).
 * Follows the fetch-mocking harness `use-migrate-forward-section.unit.test.ts` established for
 * this package. The distinguishing behavior versus `use-new-content-type-dialog`: seeds its draft
 * list from an EXISTING content type's fields (not one empty field), and its 409 failure path maps
 * to `describeEditFieldsError`'s dedicated stale-version copy.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): `updateContentTypeFields` now goes through
 * `useFetchMutation`, which throws without a `QueryClientProvider` ancestor.
 *
 * `mount()` below drives the wired hook (real `fetch`) — unchanged from before the `useWiredX`
 * conversion, just a call-site swap. The "injected port" describe block at the bottom is new
 * coverage added alongside that conversion, proving the pure hook is independently testable
 * against `createFakeEditFieldsDialogPort` with no `fetch` stub at all.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A manually-resolved promise, for race tests — never a timer (WRITER-RULES). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [{ name: "prep_time", kind: "integer", required: true, queryable: false }],
  status: "active",
  version: 3,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(contentType = TYPE, onSaved = vi.fn(), onCancel = vi.fn()) {
  const view = renderHook(() => useWiredEditFieldsDialog({ contentType, onSaved, onCancel }), { wrapper });
  return { view, onSaved, onCancel };
}

describe("initial state", () => {
  it("seeds the draft field list from the content type's own fields, with fresh _rowIds", () => {
    const { view } = mount();
    expect(view.result.current.fields).toHaveLength(1);
    expect(view.result.current.fields[0]).toMatchObject({ name: "prep_time", kind: "integer", required: true, queryable: false });
    expect(typeof view.result.current.fields[0]._rowId).toBe("number");
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.saving).toBe(false);
  });

  it("seeds an empty draft list for a content type with no fields yet", () => {
    const { view } = mount({ ...TYPE, fields: [] });
    expect(view.result.current.fields).toEqual([]);
  });
});

describe("field editing", () => {
  it("updateField patches the matching row", () => {
    const { view } = mount();
    const rowId = view.result.current.fields[0]._rowId;
    act(() => view.result.current.updateField(rowId, { required: false }));
    expect(view.result.current.fields[0].required).toBe(false);
  });

  it("addField appends a new empty field", () => {
    const { view } = mount();
    act(() => view.result.current.addField());
    expect(view.result.current.fields).toHaveLength(2);
  });

  it("removeField can remove down to an empty list (dialog-level; validation catches it on submit)", () => {
    const { view } = mount();
    const rowId = view.result.current.fields[0]._rowId;
    act(() => view.result.current.removeField(rowId));
    expect(view.result.current.fields).toEqual([]);
  });
});

describe("submit — validation", () => {
  it("blocks submit with 'At least one field is required.' when the draft is emptied out, without calling fetch", async () => {
    const { view } = mount();
    act(() => view.result.current.removeField(view.result.current.fields[0]._rowId));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(view.result.current.error).toBe("At least one field is required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("submit — success", () => {
  it("PUTs fields (row-id-stripped) + expectedVersion from the content type, then calls onSaved", async () => {
    const { view, onSaved } = mount();
    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: {} }));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/content-types/recipe/fields");
    expect((call[1] as RequestInit).method).toBe("PUT");
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.fields).toEqual([{ name: "prep_time", kind: "integer", required: true, queryable: false }]);
    expect(body.expectedVersion).toBe(3);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("submit — failure", () => {
  it("maps a 409 to the dedicated stale-version message", async () => {
    const { view, onSaved } = mount();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    // `waitFor`, not a bare synchronous read (2026-08-12, `lib/fetch-query` migration): `error` is
    // now derived from `useFetchMutation`'s own `.error`, which can land one render after `submit()`
    // itself resolves — see `use-merge-term-section.unit.test.tsx`'s identical note in `taxonomy`.
    await waitFor(() =>
      expect(view.result.current.error).toBe("This content type changed since you loaded it, refresh and try again.")
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("uses the generic fallback for a non-409 failure", async () => {
    const { view } = mount();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => expect(view.result.current.error).toBe("Failed to update fields"));
  });
});

describe("Escape-to-cancel", () => {
  it("calls onCancel when Escape is pressed while mounted", () => {
    const { onCancel } = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("focus trap (M3)", () => {
  it("Tab from the dialog's last focusable element wraps to the first instead of leaving", () => {
    function Harness() {
      const { dialogRef } = useEditFieldsDialog({ contentType: TYPE, onSaved: vi.fn(), onCancel: vi.fn() }, createFakeEditFieldsDialogPort());
      return (
        <>
          <button type="button">page behind</button>
          <form ref={dialogRef} role="dialog" aria-modal="true">
            <button type="button">first</button>
            <button type="button">last</button>
          </form>
        </>
      );
    }
    render(<Harness />, { wrapper });

    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});

describe("cancel — in-flight guard (H4)", () => {
  it("Escape while the update request is in flight does not dismiss the dialog", async () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    const updated = deferred<{ contentType: AdminContentType }>();
    const port: EditFieldsDialogPort = { updateContentTypeFields: () => updated.promise };
    const { result } = renderHook(() => useEditFieldsDialog({ contentType: TYPE, onSaved, onCancel }, port), {
      wrapper,
    });

    act(() => {
      void result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });
    await waitFor(() => expect(result.current.saving).toBe(true));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).not.toHaveBeenCalled();

    updated.resolve({ contentType: TYPE });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("submits fields (row-id-stripped) + expectedVersion through the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    try {
      const port = createFakeEditFieldsDialogPort();
      const { result } = renderHook(() => useEditFieldsDialog({ contentType: TYPE, onSaved, onCancel: vi.fn() }, port), { wrapper });

      await act(async () => {
        await result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(port.lastUpdate).toEqual({
        key: "recipe",
        fields: [{ name: "prep_time", kind: "integer", required: true, queryable: false }],
        expectedVersion: 3,
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps a rejected injected port call through describeEditFieldsError (plain Error: its own message)", async () => {
    const port = createFakeEditFieldsDialogPort({ updateError: new Error("network down") });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useEditFieldsDialog({ contentType: TYPE, onSaved, onCancel: vi.fn() }, port), { wrapper });

    await act(async () => {
      await result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    // `waitFor`, not a bare synchronous read (2026-08-12, `lib/fetch-query` migration): `error` is
    // now derived from `useFetchMutation`'s own `.error`, which can land one render after `submit()`
    // itself resolves — see `use-merge-term-section.unit.test.tsx`'s identical note in `taxonomy`.
    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
