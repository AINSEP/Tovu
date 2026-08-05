import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminContentType } from "../../../lib/api";
import { useCollections } from "../hooks/use-collections.hooks";

/**
 * @file `useCollections` — the Collections list screen's content-type registry load + dialog
 * open/close state + the shared `runLifecycle` action. Follows the fetch-mocking harness
 * `use-restore-points-section.unit.test.ts` established for this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [],
  status: "active",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE] }));
  const view = renderHook(() => useCollections());
  await waitFor(() => expect(view.result.current.types).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with types=null, resolves to the raw items", async () => {
    const { result } = await loaded();
    expect(result.current.types).toEqual([TYPE]);
    expect(result.current.error).toBeNull();
  });

  it("sets the Collections-specific fallback error on a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load content types");
    expect(result.current.types).toBeNull();
  });
});

describe("dialog open/close state", () => {
  it("showNewDialog starts false and toggles via setShowNewDialog", async () => {
    const { result } = await loaded();
    expect(result.current.showNewDialog).toBe(false);
    act(() => result.current.setShowNewDialog(true));
    expect(result.current.showNewDialog).toBe(true);
  });

  it("pendingLifecycle starts null and can be set/cleared", async () => {
    const { result } = await loaded();
    expect(result.current.pendingLifecycle).toBeNull();
    act(() => result.current.setPendingLifecycle({ op: "tombstone", contentType: TYPE }));
    expect(result.current.pendingLifecycle).toEqual({ op: "tombstone", contentType: TYPE });
    act(() => result.current.setPendingLifecycle(null));
    expect(result.current.pendingLifecycle).toBeNull();
  });

  it("editingFieldsFor starts null and can be set/cleared", async () => {
    const { result } = await loaded();
    expect(result.current.editingFieldsFor).toBeNull();
    act(() => result.current.setEditingFieldsFor(TYPE));
    expect(result.current.editingFieldsFor).toEqual(TYPE);
  });
});

describe("load (re-fetch)", () => {
  it("re-fetches the list", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE, { ...TYPE, key: "article" }] }));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.types).toHaveLength(2));
  });
});

describe("runLifecycle", () => {
  it("POSTs { key, op, expectedVersion } to the lifecycle endpoint and reloads on success", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: { ...TYPE, status: "deprecated" } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ ...TYPE, status: "deprecated" }] })); // reload

    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });

    const call = fetchMock.mock.calls.at(-2)!;
    expect(String(call[0])).toContain("/content-types/recipe/lifecycle");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ op: "deprecate", expectedVersion: 1 });
    expect(result.current.types).toEqual([{ ...TYPE, status: "deprecated" }]);
    expect(result.current.actionError).toBeNull();
  });

  it("sets an op- and label-specific fallback actionError on failure, without reloading", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.runLifecycle(TYPE, "tombstone");
    });

    expect(result.current.actionError).toBe('Failed to tombstone "Recipe"');
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1); // no follow-up reload GET
  });

  it("clears a prior actionError when re-invoked", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });
    expect(result.current.actionError).not.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: TYPE }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE] }));
    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });
    expect(result.current.actionError).toBeNull();
  });
});
