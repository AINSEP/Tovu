import { expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import type { AdminCredentialCopyResult, AdminCredentialCopySource } from "@/lib/api";
import { useCopyKeys, useWiredCopyKeys, type CopyKeysPort } from "../hooks/use-copy-keys.hooks";

const t = (key: string) => `T:${key}`;
const source: AdminCredentialCopySource = {
  siteId: "shared-keys", siteName: null,
  keys: [
    { id: "k1", label: "OpenAI", kind: "api", provider: "openai", worksFor: ["chat", "images"], locked: null },
    { id: "k2", label: "Plain", kind: "api", provider: null, siteName: "Other site", locked: "Needs the owner" },
    { id: "k3", label: "Kindly", kind: "token", provider: null },
  ],
} as unknown as AdminCredentialCopySource;
const click = { currentTarget: { focus: vi.fn() } } as unknown as Pick<MouseEvent<HTMLButtonElement>, "currentTarget">;
const submitEvent = { preventDefault: vi.fn() } as Pick<FormEvent<HTMLFormElement>, "preventDefault">;
const pick = (id: string, checked = true) => ({ currentTarget: { checked, value: id } }) as unknown as ChangeEvent<HTMLInputElement>;

function port(overrides: Partial<CopyKeysPort> = {}): CopyKeysPort {
  return {
    listCredentialCopySources: vi.fn(async () => ({ sources: [{ siteId: "other", keys: [] }, source] })),
    copyCredentials: vi.fn(async () => ({ results: [{ id: "k1", status: "granted" }] as AdminCredentialCopyResult[] })),
    ...overrides,
  } as unknown as CopyKeysPort;
}

it("opens, lists secret-free key rows (label, provider or kind, works-for, locked) and starts with nothing chosen", async () => {
  const p = port();
  const { result } = renderHook(() => useCopyKeys({ t }, { port: p }));
  expect(result.current.open).toBe(false);
  act(() => result.current.show(click));
  expect(click.currentTarget.focus).toHaveBeenCalledWith({ preventScroll: true });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.keys).toEqual([
    { id: "k1", checked: false, text: "OpenAI · openai", worksFor: "chat, images", locked: "" },
    { id: "k2", checked: false, text: "Plain", worksFor: "", locked: "Needs the owner" },
    { id: "k3", checked: false, text: "Kindly · token", worksFor: "", locked: "" },
  ]);
  expect(result.current.empty).toBe(false);
  expect(result.current.disabled).toBe(true);
});

it("chooses a key, grants it once, shows the outcome and clears the choice when unchecked", async () => {
  const p = port();
  const { result } = renderHook(() => useCopyKeys({ t }, { port: p }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.keys).toHaveLength(3));
  act(() => result.current.changeKey(pick("k1")));
  expect(result.current.disabled).toBe(false);
  act(() => result.current.changeKey(pick("k1", false)));
  expect(result.current.disabled).toBe(true);
  act(() => result.current.changeKey(pick("k1")));
  await act(async () => { await result.current.submit(submitEvent); });
  expect(submitEvent.preventDefault).toHaveBeenCalled();
  expect(p.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: "shared-keys", ids: ["k1"], overwrite: false });
  expect(result.current.results).toEqual([{ key: "k1:0", text: "T:Granted to this site" }]);
  expect(result.current.error).toBe("");
});

it("never submits a locked key or a submit with nothing chosen", async () => {
  const p = port();
  const { result } = renderHook(() => useCopyKeys({ t }, { port: p }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.keys).toHaveLength(3));
  await act(async () => { await result.current.submit(submitEvent); });
  act(() => result.current.changeKey(pick("k2")));
  expect(result.current.disabled).toBe(true);
  await act(async () => { await result.current.submit(submitEvent); });
  expect(p.copyCredentials).not.toHaveBeenCalled();
});

it("reports a refused grant in plain words and a non-granted result as a failure line", async () => {
  const copyCredentials = vi.fn()
    .mockRejectedValueOnce(new Error("nope"))
    .mockResolvedValueOnce({ results: [{ id: "k1", status: "failed" }] });
  const { result } = renderHook(() => useCopyKeys({ t }, { port: port({ copyCredentials }) }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.keys).toHaveLength(3));
  act(() => result.current.changeKey(pick("k1")));
  await act(async () => { await result.current.submit(submitEvent); });
  expect(result.current.error).toContain("T:Using the saved key failed.");
  expect(result.current.pending).toBe(false);
  await act(async () => { await result.current.submit(submitEvent); });
  expect(result.current.results[0]!.text).toContain("T:Using the saved key failed.");
  expect(result.current.error).toBe("");
});

it("says the key picker could not load when the metadata read fails, and ignores a read that lands after closing", async () => {
  const { result } = renderHook(() => useCopyKeys({ t }, { port: port({ listCredentialCopySources: vi.fn(async () => { throw new Error("down"); }) }) }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.error).toContain("T:Couldn't load Shared Keys."));
  expect(result.current.empty).toBe(true);

  let finish!: (value: { sources: AdminCredentialCopySource[] }) => void;
  const slow = port({ listCredentialCopySources: vi.fn(() => new Promise(resolve => { finish = resolve as typeof finish; })) as never });
  const second = renderHook(() => useCopyKeys({ t }, { port: slow }));
  act(() => second.result.current.show(click));
  second.unmount();
  await act(async () => { finish({ sources: [source] }); });
  expect(slow.listCredentialCopySources).toHaveBeenCalledTimes(1);
});

it("cancel closes the dialog unless a grant is in flight", async () => {
  let finish!: (value: { results: AdminCredentialCopyResult[] }) => void;
  const copyCredentials = vi.fn(() => new Promise(resolve => { finish = resolve as typeof finish; }));
  const { result } = renderHook(() => useCopyKeys({ t }, { port: port({ copyCredentials: copyCredentials as never }) }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.keys).toHaveLength(3));
  act(() => result.current.changeKey(pick("k1")));
  let submitting!: Promise<void>;
  act(() => { submitting = result.current.submit(submitEvent); });
  act(() => result.current.cancel());
  expect(result.current.open).toBe(true);
  await act(async () => { finish({ results: [] }); await submitting; });
  act(() => result.current.cancel());
  expect(result.current.open).toBe(false);
});

it("a read that fails after the dialog was closed changes nothing", async () => {
  let fail!: (error: Error) => void;
  const slow = port({ listCredentialCopySources: vi.fn(() => new Promise((_resolve, reject) => { fail = reject; })) as never });
  const view = renderHook(() => useCopyKeys({ t }, { port: slow }));
  act(() => view.result.current.show(click));
  view.unmount();
  // The failure is swallowed (an unhandled rejection would fail the run) and the one read is not repeated.
  await act(async () => { fail(new Error("late")); });
  expect(slow.listCredentialCopySources).toHaveBeenCalledTimes(1);
});

it("the wired hook reads Shared Keys through the owner API", async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ sources: [source] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useWiredCopyKeys({ t }));
  act(() => result.current.show(click));
  await waitFor(() => expect(result.current.keys).toHaveLength(3));
  expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/admin/v1/");
  vi.unstubAllGlobals();
});
