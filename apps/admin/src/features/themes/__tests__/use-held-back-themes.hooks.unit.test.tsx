import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import { heldBackThemesApi, type HeldBackTheme } from "../api/held-back-themes-api";
import { createFakeHeldBackThemesPort, defaultHeldBackThemesPort, heldBackApiError } from "../hooks/held-back-themes-dependencies.hooks";
import { heldBackFailure } from "../held-back-themes-failure";
import { useHeldBackThemes } from "../hooks/use-held-back-themes.hooks";

/**
 * @file `useHeldBackThemes` — the code-to-message mapping, the CHANGED_SINCE_CHECK path, and the
 * real port's wire shape (ids travel in the body, never the URL).
 */

const identity = (key: string): string => key;
const FOO: HeldBackTheme = { id: "static/foo", name: "Foo Theme", tier: "static", original: false, files: 2, bytes: 10 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function loaded(port = createFakeHeldBackThemesPort({ themes: [FOO] }), onRestored = vi.fn()) {
  const view = renderHook(() => useHeldBackThemes({ port, t: identity, onRestored }));
  await waitFor(() => expect(view.result.current.status).not.toBe("loading"));
  return { ...view, port, onRestored };
}

/** Checks the theme, opens the approval card and accepts it. */
async function checkAndConfirm(view: Awaited<ReturnType<typeof loaded>>) {
  await act(async () => { await view.result.current.check({ themeId: "static/foo" }); });
  let pending!: Promise<void>;
  act(() => { pending = view.result.current.requestRestore({ themeId: "static/foo" }); });
  await act(async () => { view.result.current.dialog.onConfirm(); await pending; });
}

describe("heldBackFailure — code to plain words", () => {
  const cases: Array<[string, number, string]> = [
    ["APPROVAL_REQUIRED", 400, "Restoring needs your approval. Check the theme, then confirm again."],
    ["CHECK_FAILED", 409, "This theme still fails the safety checks, so it stays held back."],
    ["CHANGED_SINCE_CHECK", 409, "This theme changed since you checked it — check again."],
    ["NAME_TAKEN", 409, "A theme with this name is already installed, so this one can't be restored."],
    ["HELD_BACK_NOT_FOUND", 404, "This theme is no longer held back. The list was refreshed."],
  ];
  it.each(cases)("%s maps to its own message and no incident report", (code, status, message) => {
    const result = heldBackFailure({ error: heldBackApiError({ status, code, message: "raw server text" }), fallbackKey: "failed to restore theme", t: identity });
    expect(result.message).toBe(message);
    expect(result.report).toBeNull();
  });

  it("keeps the problem list from a CHECK_FAILED body and drops non-strings", () => {
    const error = heldBackApiError({ status: 409, code: "CHECK_FAILED", message: "x", body: { problems: ["a", 3, "b"] } });
    expect(heldBackFailure({ error, fallbackKey: "failed to restore theme", t: identity }).problems).toEqual(["a", "b"]);
  });

  it("an unexpected failure keeps the server message and its ERR- reference", () => {
    const error = heldBackApiError({ status: 500, code: "INTERNAL", message: "The disk is full", errorId: "ERR-9F2" });
    const result = heldBackFailure({ error, fallbackKey: "failed to restore theme", t: identity });
    expect(result.message).toBe("The disk is full");
    expect(result.report?.errorId).toBe("ERR-9F2");
  });

  it("an unexpected failure without a reference is just the message; a non-Error uses the fallback", () => {
    expect(heldBackFailure({ error: heldBackApiError({ status: 500, code: "X", message: "boom" }), fallbackKey: "failed to restore theme", t: identity })).toMatchObject({ message: "boom", report: null });
    expect(heldBackFailure({ error: "nope", fallbackKey: "failed to check theme", t: identity }).message).toBe("failed to check theme");
  });
});

describe("useHeldBackThemes — restore refusals", () => {
  it("CHANGED_SINCE_CHECK says check again, forgets the stale check, and does not retry", async () => {
    const view = await loaded();
    const restore = vi.spyOn(view.port, "restore").mockRejectedValueOnce(heldBackApiError({ status: 409, code: "CHANGED_SINCE_CHECK", message: "x" }));
    await checkAndConfirm(view);
    const row = view.result.current.rows["static/foo"]!;
    expect(row.failure?.message).toBe("This theme changed since you checked it — check again.");
    expect(row.check).toBeNull();
    expect(row.phase).toBe("idle");
    expect(restore).toHaveBeenCalledTimes(1);
    expect(view.onRestored).not.toHaveBeenCalled();
  });

  it("CHECK_FAILED keeps the server's problems on the row and forgets the check", async () => {
    const view = await loaded();
    vi.spyOn(view.port, "restore").mockRejectedValueOnce(heldBackApiError({ status: 409, code: "CHECK_FAILED", message: "x", body: { problems: ["bad file"] } }));
    await checkAndConfirm(view);
    expect(view.result.current.rows["static/foo"]!.failure?.problems).toEqual(["bad file"]);
    expect(view.result.current.rows["static/foo"]!.check).toBeNull();
  });

  it("HELD_BACK_NOT_FOUND reloads the list", async () => {
    const view = await loaded();
    const list = vi.spyOn(view.port, "list");
    vi.spyOn(view.port, "restore").mockRejectedValueOnce(heldBackApiError({ status: 404, code: "HELD_BACK_NOT_FOUND", message: "x" }));
    await checkAndConfirm(view);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });

  it("a failed check keeps the row retryable with the mapped message", async () => {
    const view = await loaded();
    vi.spyOn(view.port, "check").mockRejectedValueOnce(heldBackApiError({ status: 404, code: "HELD_BACK_NOT_FOUND", message: "x" }));
    await act(async () => { await view.result.current.check({ themeId: "static/foo" }); });
    expect(view.result.current.rows["static/foo"]).toMatchObject({ phase: "idle", failure: { message: "This theme is no longer held back. The list was refreshed." } });
  });

  it("restore refuses to run without a passing check (no digest, no request)", async () => {
    const view = await loaded();
    const restore = vi.spyOn(view.port, "restore");
    await act(async () => { await view.result.current.requestRestore({ themeId: "static/foo" }); });
    expect(restore).not.toHaveBeenCalled();
    expect(view.result.current.dialog.open).toBe(false);
  });
});

describe("the real port", () => {
  function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends ids in the body of POST .../held-back-themes/check and /restore, never in the URL", async () => {
    const fetchMock = stubFetch({ themeId: "static/foo", passes: true, problems: [], digest: "d", nameTaken: false });
    await defaultHeldBackThemesPort.check({ themeId: "static/foo" });
    await defaultHeldBackThemesPort.restore({ themeId: "static/foo", approvedDigest: "d" });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toMatch(/\/workspaces\/[^/]+\/held-back-themes\/check$/);
    expect(calls[0]![1].method).toBe("POST");
    expect(JSON.parse(String(calls[0]![1].body))).toEqual({ themeId: "static/foo" });
    expect(calls[1]![0]).toMatch(/\/workspaces\/[^/]+\/held-back-themes\/restore$/);
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({ themeId: "static/foo", approvedDigest: "d" });
    expect(calls.every(([url]) => !url.includes("static%2Ffoo") && !url.includes("static/foo"))).toBe(true);
  });

  it("lists with a plain GET", async () => {
    const fetchMock = stubFetch({ themes: [], chosenThemeHeldBack: null });
    await expect(heldBackThemesApi.list()).resolves.toEqual({ themes: [], chosenThemeHeldBack: null });
    expect((fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>)[0]![0]).toMatch(/\/workspaces\/[^/]+\/held-back-themes$/);
  });
});

describe("the fake port", () => {
  it("hides the chosen-theme marker once that theme leaves the list, and refuses an unknown id", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO], chosenThemeHeldBack: { themeId: "static/foo", name: "Foo Theme", fallbackThemeId: "s" } });
    expect((await port.list()).chosenThemeHeldBack).not.toBeNull();
    await port.restore({ themeId: "static/foo", approvedDigest: "x" });
    expect(await port.list()).toEqual({ themes: [], chosenThemeHeldBack: null });
    await expect(port.check({ themeId: "static/foo" })).rejects.toMatchObject({ code: "HELD_BACK_NOT_FOUND" });
    await expect(port.restore({ themeId: "static/foo", approvedDigest: "" })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
});
