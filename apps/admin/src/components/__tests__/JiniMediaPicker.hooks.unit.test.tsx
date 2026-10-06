import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaPickerPort } from "@jini-ai/admin/contracts/media-picker";
import { useJiniMediaPicker } from "../MediaPickerDialog/JiniMediaPicker.hooks";
import { AdminModulesContext } from "../../integrations/jini-admin/modules.hooks";
import type { AdminMedia } from "../../lib/api";
import type { MediaPickerDialogProps } from "../MediaPickerDialog/MediaPickerDialog";

/**
 * The bridge from the Jini picker service to the legacy dialog contract: the service picks an id,
 * the host re-reads its own media list (for CMS fields like the slug) and hands back the ACTIVE
 * row. The picker port is a hand-written deferred fake; the HTTP boundary is a fetch stub, so the
 * real `authenticatedAdminRequest` builds the request.
 */

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function media(id: string, status: AdminMedia["status"] = "active"): AdminMedia {
  return { id, slug: `${id}-slug`, workspaceId: "workspace-local", title: id, alt: "", caption: "", credit: "", sha256: "h", status, createdAt: "2026-10-04", updatedAt: "2026-10-04", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null, contentType: "image/png", publicUrl: `/m/${id}` } as AdminMedia;
}

function deferredPicker() {
  const calls: { required: unknown; signal?: AbortSignal; resolve: (value: { id: string } | null) => void }[] = [];
  const picker = {
    pick: vi.fn((required: unknown, { signal }: { signal?: AbortSignal } = {}) => new Promise((resolve) => { calls.push({ required, signal, resolve }); })),
  } as unknown as MediaPickerPort;
  return { picker, calls };
}

function scope(picker: MediaPickerPort | null) {
  const runtime = picker ? ({ picker } as unknown as NonNullable<React.ContextType<typeof AdminModulesContext>>) : null;
  return ({ children }: { children: ReactNode }) => <AdminModulesContext.Provider value={runtime}>{children}</AdminModulesContext.Provider>;
}

function stubMediaList(rows: AdminMedia[] | Error, { gate }: { gate?: Promise<void> } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (gate) await gate;
    if (rows instanceof Error) return new Response(JSON.stringify({ error: rows.message }), { status: 500 });
    return Response.json({ media: rows });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useJiniMediaPicker", () => {
  it("stays disabled without an admin scope and never asks a picker", () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel }), { wrapper: scope(null) });
    expect(result.current).toEqual({ enabled: false, error: null, onCancel });
  });

  it("stays disabled when the caller injects the legacy dialog seam", () => {
    const { picker } = deferredPicker();
    const { result } = renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel: vi.fn(), useDialog: vi.fn() as never }), { wrapper: scope(picker) });
    expect(result.current.enabled).toBe(false);
    expect(picker.pick).not.toHaveBeenCalled();
  });

  it("opens the service picker for any media type and cancels when nothing is chosen", async () => {
    const { picker, calls } = deferredPicker();
    const fetchMock = stubMediaList([]);
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    const { result } = renderHook(() => useJiniMediaPicker({ onSelect, onCancel }), { wrapper: scope(picker) });
    expect(result.current.enabled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.required).toEqual({ accept: [] });
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    await act(async () => { calls[0]!.resolve(null); });
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSelect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the picked id to the host's active media row through the authenticated media route", async () => {
    const { picker, calls } = deferredPicker();
    const chosen = media("m2");
    const fetchMock = stubMediaList([media("m1"), media("m2", "trashed" as AdminMedia["status"]), chosen]);
    const onSelect = vi.fn();
    renderHook(() => useJiniMediaPicker({ onSelect, onCancel: vi.fn() }), { wrapper: scope(picker) });
    await act(async () => { calls[0]!.resolve({ id: "m2" }); });
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
    expect(onSelect).toHaveBeenCalledWith(chosen);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/media");
    expect(init?.method).toBe("GET");
  });

  it("reports an error when the picked media is no longer active", async () => {
    const { picker, calls } = deferredPicker();
    stubMediaList([media("m1"), media("m3", "trashed" as AdminMedia["status"])]);
    const onSelect = vi.fn();
    const { result } = renderHook(() => useJiniMediaPicker({ onSelect, onCancel: vi.fn() }), { wrapper: scope(picker) });
    await act(async () => { calls[0]!.resolve({ id: "m3" }); });
    await waitFor(() => expect(result.current.error).toBe("Unable to choose media. Please try again."));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports an error when the media list cannot be read", async () => {
    const { picker, calls } = deferredPicker();
    stubMediaList(new Error("boom"));
    const { result } = renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel: vi.fn() }), { wrapper: scope(picker) });
    await act(async () => { calls[0]!.resolve({ id: "m1" }); });
    await waitFor(() => expect(result.current.error).toBe("Unable to choose media. Please try again."));
  });

  it("uses the latest callbacks without reopening the picker", async () => {
    const { picker, calls } = deferredPicker();
    stubMediaList([media("m1")]);
    const first = vi.fn();
    const second = vi.fn();
    let onSelect = first;
    const { rerender } = renderHook(() => useJiniMediaPicker({ onSelect, onCancel: vi.fn() }), { wrapper: scope(picker) });
    onSelect = second;
    rerender();
    expect(picker.pick).toHaveBeenCalledOnce();
    await act(async () => { calls[0]!.resolve({ id: "m1" }); });
    await waitFor(() => expect(second).toHaveBeenCalledOnce());
    expect(first).not.toHaveBeenCalled();
  });

  it("aborts the pick on unmount and ignores a late answer", async () => {
    const { picker, calls } = deferredPicker();
    const fetchMock = stubMediaList([media("m1")]);
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { unmount } = renderHook(() => useJiniMediaPicker({ onSelect, onCancel }), { wrapper: scope(picker) });
    unmount();
    expect(calls[0]!.signal!.aborted).toBe(true);
    await act(async () => { calls[0]!.resolve(null); });
    await act(async () => { await Promise.resolve(); });
    expect(onCancel).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not select or report an error when unmounted while the media list is loading", async () => {
    const { picker, calls } = deferredPicker();
    let release!: () => void;
    const fetchMock = stubMediaList([media("m1")], { gate: new Promise<void>((resolve) => { release = resolve; }) });
    const onSelect = vi.fn();
    const { unmount } = renderHook(() => useJiniMediaPicker({ onSelect, onCancel: vi.fn() }), { wrapper: scope(picker) });
    await act(async () => { calls[0]!.resolve({ id: "m1" }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    unmount();
    // The stub ignores the abort signal, so the response still arrives: the hook must drop it.
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("drops a failure that arrives after the pick was abandoned", async () => {
    const { picker, calls } = deferredPicker();
    let release!: () => void;
    const fetchMock = stubMediaList(new Error("late"), { gate: new Promise<void>((resolve) => { release = resolve; }) });
    // Stay mounted: React silently discards an unmounted update, so only a live hook can show
    // whether the abandoned request's failure still reaches `error`.
    let useDialog: MediaPickerDialogProps["useDialog"];
    const { result, rerender } = renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel: vi.fn(), useDialog }), { wrapper: scope(picker) });
    await act(async () => { calls[0]!.resolve({ id: "m1" }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    useDialog = vi.fn() as never;
    rerender();
    expect(calls[0]!.signal!.aborted).toBe(true);
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.current).toMatchObject({ enabled: false, error: null });
  });

  it("forwards the caller's accept filter to the service picker", () => {
    const { picker, calls } = deferredPicker();
    stubMediaList([]);
    renderHook(() => useJiniMediaPicker({ onSelect: vi.fn(), onCancel: vi.fn(), accept: ["image/*"] }), { wrapper: scope(picker) });
    expect(calls[0]!.required).toEqual({ accept: ["image/*"] });
  });
});
