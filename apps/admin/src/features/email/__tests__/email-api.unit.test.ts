import { afterEach, expect, it, vi } from "vitest";
import { emailApi } from "../email-api";

/** Chrome Email T3: the wire kind must resolve to the scoped, restorable Trash registration. */
afterEach(() => vi.unstubAllGlobals());

it("moves templates through the generic Trash endpoint using the template kind", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, version: 3 }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetch);
  await emailApi.trashTemplate({ id: "template-1" });
  const [url, init] = (fetch.mock.calls as unknown as [string, RequestInit][])[0]!;
  expect(url).toBe("/api/admin/v1/workspaces/workspace-local/trash/items");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({ type: "email-template", id: "template-1" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
