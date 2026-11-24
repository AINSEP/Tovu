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

/** Clear-all captured test emails (bt2-todos clear-all-admin-ui): preview sends `{}`, only a reviewed confirm sends `confirmed` + revision. */
function stubFetchJson(answer: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return () => (fetch.mock.calls as unknown as [string, RequestInit][])[0]!;
}

it("previews clearing captured test emails with an empty body, so nothing can be deleted by it", async () => {
  const firstCall = stubFetchJson({ cleared: false, confirmationRequired: true, plan: { count: 2, newestAt: null }, revision: "2:" });
  const answer = await emailApi.clearCaptured();
  const [url, init] = firstCall();
  expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/mail-capture/clear");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({});
  expect(answer).toMatchObject({ confirmationRequired: true, plan: { count: 2 }, revision: "2:" });
});

it("confirms clearing captured test emails with exactly the previewed revision", async () => {
  const firstCall = stubFetchJson({ cleared: true, deleted: 2 });
  await emailApi.clearCaptured({ confirm: { revision: "2:2026-11-24T10:00:00Z" } });
  const [, init] = firstCall();
  expect(JSON.parse(init.body as string)).toEqual({ confirmed: true, revision: "2:2026-11-24T10:00:00Z" });
});
