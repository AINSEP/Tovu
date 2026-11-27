import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { settingsApi } from "@/lib/admin-http/settings-api";
import { ApiError } from "@/lib/admin-http/request";
import { defaultSiteListPrefsPort, useWiredSiteListPrefs } from "../hooks/use-site-list-prefs.hooks";

afterEach(() => vi.unstubAllGlobals());

it("reads the owner's saved list choices and writes only the changed personal row", async () => {
  const initial = { sort: "oldest", pinned: ["site-a"], hidden: ["site-z"] };
  const next = { sort: "name" as const, pinned: ["site-b", "site-a"], hidden: ["site-z"] };
  const writes: unknown[] = [];
  let stored: unknown = initial;
  const endpoint = "/api/admin/v1/workspaces/workspace-local/settings";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === `${endpoint}/effective` && url.search === "?namespace=core.interface" && init?.method === "GET") {
      return Response.json({ data: [{ key: "sitesList", value: stored }, { key: "theme", value: "dark" }] });
    }
    if (url.pathname === `${endpoint}/value` && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      if (body.namespace === "core.interface" && body.scope === "user" && body.key === "sitesList") {
        stored = body.valueJson;
        return Response.json({ key: "sitesList", value: stored });
      }
    }
    return Response.json({ error: "Unexpected settings request" }, { status: 400 });
  });
  const { result } = renderHook(() => useWiredSiteListPrefs());
  await waitFor(() => expect(result.current.prefs).toEqual(initial));

  await act(async () => result.current.onPrefsChange(next));
  await waitFor(() => expect(writes).toEqual([{ namespace: "core.interface", scope: "user", key: "sitesList", valueJson: next }]));
  expect(result.current.prefs).toEqual(next);
  await expect(defaultSiteListPrefsPort.load()).resolves.toEqual(next);
});

it("shows a denied read without overwriting the owner's unseen saved choices", async () => {
  const read = vi.spyOn(settingsApi, "getSettingsEffective").mockRejectedValueOnce(
    new ApiError({ message: "You cannot read personal settings.", status: 403 }),
  );
  const write = vi.spyOn(settingsApi, "setSetting").mockRejectedValue(new Error("must not overwrite after a failed read"));
  try {
    const { result } = renderHook(() => useWiredSiteListPrefs());
    await waitFor(() => expect(result.current.loadError).toBe("You cannot read personal settings."));
    expect(read).toHaveBeenCalledExactlyOnceWith({ namespace: "core.interface" });
    const next = { sort: "name" as const, pinned: ["site-b"], hidden: [] };
    await act(async () => result.current.onPrefsChange(next));
    expect(result.current.prefs).toEqual(next);
    expect(write).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
