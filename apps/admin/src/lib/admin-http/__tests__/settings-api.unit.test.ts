import { afterEach, expect, it, vi } from "vitest";

import { settingsApi } from "../settings-api";

/**
 * @file The settings/effective read must never leave the browser without a `namespace`: the server
 * answers a missing or empty one with a 400, which names no caller. A blank namespace is refused
 * here, before any request, with text that says what was wrong and where to fix it.
 */

afterEach(() => { vi.unstubAllGlobals(); });

it("refuses a blank namespace without sending any request", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  for (const namespace of ["", "   "]) {
    await expect(settingsApi.getSettingsEffective({ namespace })).rejects.toThrow(
      "Cannot read settings without a namespace. Pass the settings group to read, for example \"core.language\".",
    );
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("still sends the namespace of a normal read", async () => {
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchSpy);
  await settingsApi.getSettingsEffective({ namespace: "core.language" });
  expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toBe("/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.language");
});
