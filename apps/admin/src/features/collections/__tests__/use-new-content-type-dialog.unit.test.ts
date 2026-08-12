import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api";
import { createFakeNewContentTypeDialogPort } from "../hooks/new-content-type-dialog-dependencies.hooks";
import { useNewContentTypeDialog, useWiredNewContentTypeDialog } from "../hooks/use-new-content-type-dialog.hooks";

/**
 * @file `useNewContentTypeDialog` — `NewContentTypeDialog`'s own state and submit action
 * (design-spec.md §1.3). Follows the fetch-mocking harness `use-migrate-forward-section.unit.test.ts`
 * established for this package.
 *
 * `mount()` below drives the wired hook (real `fetch`) — unchanged from before the `useWiredX`
 * conversion, just a call-site swap. The "injected port" describe block at the bottom is new
 * coverage added alongside that conversion, proving the pure hook is independently testable
 * against `createFakeNewContentTypeDialogPort` with no `fetch` stub at all.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useNewContentTypeDialog` now also calls `useAdminLocale()` (real `fetch`, not this hook's
  // own concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(onCreated = vi.fn(), onCancel = vi.fn()) {
  const view = renderHook(() => useWiredNewContentTypeDialog({ onCreated, onCancel }));
  return { view, onCreated, onCancel };
}

describe("initial state", () => {
  it("starts with empty label/key, one empty field, no error, not saving", () => {
    const { view } = mount();
    expect(view.result.current.label).toBe("");
    expect(view.result.current.key).toBe("");
    expect(view.result.current.fields).toHaveLength(1);
    expect(view.result.current.fields[0]).toMatchObject({ name: "", kind: "text", required: false, queryable: false });
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.saving).toBe(false);
  });
});

describe("field editing", () => {
  it("updateField patches the matching row", () => {
    const { view } = mount();
    const rowId = view.result.current.fields[0]._rowId;
    act(() => view.result.current.updateField(rowId, { name: "prep_time" }));
    expect(view.result.current.fields[0].name).toBe("prep_time");
  });

  it("addField appends a new empty field", () => {
    const { view } = mount();
    act(() => view.result.current.addField());
    expect(view.result.current.fields).toHaveLength(2);
  });

  it("removeField removes the matching row", () => {
    const { view } = mount();
    act(() => view.result.current.addField());
    const secondRowId = view.result.current.fields[1]._rowId;
    act(() => view.result.current.removeField(secondRowId));
    expect(view.result.current.fields).toHaveLength(1);
  });
});

describe("submit — validation", () => {
  it("prevents default and blocks submit with a validation error for an invalid key, without calling fetch", async () => {
    const { view } = mount();
    act(() => view.result.current.setKey("Bad Key"));
    act(() => view.result.current.setLabel("Recipe"));
    const preventDefault = vi.fn();

    await act(async () => {
      await view.result.current.submit({ preventDefault } as unknown as React.FormEvent);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(view.result.current.error).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a prior validation error once the draft becomes valid", async () => {
    const { view } = mount();
    const preventDefault = vi.fn();
    await act(async () => {
      await view.result.current.submit({ preventDefault } as unknown as React.FormEvent);
    });
    expect(view.result.current.error).not.toBeNull();

    act(() => view.result.current.setKey("recipe"));
    act(() => view.result.current.setLabel("Recipe"));
    act(() => view.result.current.updateField(view.result.current.fields[0]._rowId, { name: "prep_time" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: {} }));

    await act(async () => {
      await view.result.current.submit({ preventDefault } as unknown as React.FormEvent);
    });
    expect(view.result.current.error).toBeNull();
  });
});

describe("submit — success", () => {
  it("POSTs the trimmed key/label and row-id-stripped fields, then calls onCreated", async () => {
    const { view, onCreated } = mount();
    act(() => view.result.current.setKey("  recipe  "));
    act(() => view.result.current.setLabel("  Recipe  "));
    act(() => view.result.current.updateField(view.result.current.fields[0]._rowId, { name: "prep_time" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: {} }));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/content-types");
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.key).toBe("recipe");
    expect(body.label).toBe("Recipe");
    expect(body.fields).toEqual([{ name: "prep_time", kind: "text", required: false, queryable: false }]);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("sets saving=true during the request and false after", async () => {
    const { view } = mount();
    act(() => view.result.current.setKey("recipe"));
    act(() => view.result.current.setLabel("Recipe"));
    act(() => view.result.current.updateField(view.result.current.fields[0]._rowId, { name: "prep_time" }));

    let resolveCreate: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveCreate = resolve)));

    let promise!: Promise<void>;
    act(() => {
      promise = view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent) as unknown as Promise<void>;
    });
    expect(view.result.current.saving).toBe(true);

    await act(async () => {
      resolveCreate?.(jsonResponse({ contentType: {} }));
      await promise;
    });
    expect(view.result.current.saving).toBe(false);
  });
});

describe("submit — failure", () => {
  it("sets the generic fallback error and does not call onCreated", async () => {
    const { view, onCreated } = mount();
    act(() => view.result.current.setKey("recipe"));
    act(() => view.result.current.setLabel("Recipe"));
    act(() => view.result.current.updateField(view.result.current.fields[0]._rowId, { name: "prep_time" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(view.result.current.error).toBe("Failed to create content type");
    expect(onCreated).not.toHaveBeenCalled();
    expect(view.result.current.saving).toBe(false);
  });

  it("uses the server's own error message when present", async () => {
    const { view } = mount();
    act(() => view.result.current.setKey("recipe"));
    act(() => view.result.current.setLabel("Recipe"));
    act(() => view.result.current.updateField(view.result.current.fields[0]._rowId, { name: "prep_time" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "recipe already exists" }, 409));

    await act(async () => {
      await view.result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(view.result.current.error).toBe("recipe already exists");
  });
});

describe("Escape-to-cancel", () => {
  it("calls onCancel when Escape is pressed while mounted", () => {
    const { onCancel } = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("submits the trimmed key/label and row-id-stripped fields through the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    try {
      const port = createFakeNewContentTypeDialogPort();
      const { result } = renderHook(() => useNewContentTypeDialog({ onCreated, onCancel: vi.fn() }, { port, locale: "en" }));

      act(() => result.current.setKey("  recipe  "));
      act(() => result.current.setLabel("  Recipe  "));
      act(() => result.current.updateField(result.current.fields[0]._rowId, { name: "prep_time" }));

      await act(async () => {
        await result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(port.lastCreate).toEqual({
        key: "recipe",
        label: "Recipe",
        fields: [{ name: "prep_time", kind: "text", required: false, queryable: false }],
      });
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sets the locale-aware fallback error when the injected port rejects with an ApiError-shaped empty message", async () => {
    const port = createFakeNewContentTypeDialogPort({ createError: new ApiError("", 500) });
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewContentTypeDialog({ onCreated, onCancel: vi.fn() }, { port, locale: "en" }));

    act(() => result.current.setKey("recipe"));
    act(() => result.current.setLabel("Recipe"));
    act(() => result.current.updateField(result.current.fields[0]._rowId, { name: "prep_time" }));

    await act(async () => {
      await result.current.submit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.error).toBe("Failed to create content type");
    expect(onCreated).not.toHaveBeenCalled();
  });
});
