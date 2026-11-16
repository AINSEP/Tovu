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

type Call = { url: string; method: string; body: unknown };
/** Stubs fetch with an empty-object JSON reply and records every request. */
function recordFetch() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method as string, body: init.body ? JSON.parse(init.body as string) : undefined });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}
const BASE = "/api/admin/v1/workspaces/workspace-local";

it("addresses every provider, DNS, test-send and use route with the right verb, path and body", async () => {
  const calls = recordFetch();
  await emailApi.listProviders();
  await emailApi.saveProviderKey({ providerId: "a/b", input: { token: "t" } });
  await emailApi.activateProvider({ providerId: "a/b" });
  await emailApi.readDns();
  await emailApi.verifyDns();
  await emailApi.sendTest({ requestId: "r1" });
  await emailApi.sendTest({ to: "x@y.test", requestId: "r2" });
  await emailApi.readUses();
  expect(calls).toEqual([
    { url: `${BASE}/system/mail-providers`, method: "GET", body: undefined },
    { url: `${BASE}/system/mail-providers/a%2Fb/credential`, method: "PUT", body: { token: "t" } },
    { url: `${BASE}/system/mail-providers/a%2Fb/activate`, method: "POST", body: {} },
    { url: `${BASE}/system/mail-dns`, method: "GET", body: undefined },
    { url: `${BASE}/system/mail-dns/verify`, method: "POST", body: {} },
    { url: `${BASE}/system/mail-test-send`, method: "POST", body: { requestId: "r1" } },
    { url: `${BASE}/system/mail-test-send`, method: "POST", body: { to: "x@y.test", requestId: "r2" } },
    { url: `${BASE}/system/mail-uses`, method: "GET", body: undefined },
  ]);
});

it("builds activity and suppression queries from only the filters that are set", async () => {
  const calls = recordFetch();
  await emailApi.listActivity({ filter: {} });
  await emailApi.listActivity({ filter: { outcome: "failed", recipient: "a@b.test" }, cursor: "c1" });
  await emailApi.getActivity({ id: "id/1" });
  await emailApi.listSuppressions({});
  await emailApi.listSuppressions({ search: "bob", cursor: "c2" });
  await emailApi.readFeedback();
  expect(calls.map(c => c.url)).toEqual([
    `${BASE}/system/mail-activity`,
    `${BASE}/system/mail-activity?outcome=failed&recipient=a%40b.test&cursor=c1`,
    `${BASE}/system/mail-activity/id%2F1`,
    `${BASE}/system/mail-suppressions`,
    `${BASE}/system/mail-suppressions?search=bob&cursor=c2`,
    `${BASE}/system/mail-feedback`,
  ]);
});

it("previews a suppression removal without confirmation and confirms with the previewed revision", async () => {
  const calls = recordFetch();
  const required = { address: "a@b.test", scope: "all" as const, reason: "asked" };
  await emailApi.removeSuppression(required);
  await emailApi.removeSuppression(required, { confirm: { revision: "rev-7" } });
  expect(calls.map(c => c.body)).toEqual([required, { ...required, confirmed: true, revision: "rev-7" }]);
  expect(calls.every(c => c.url === `${BASE}/system/mail-suppressions/remove` && c.method === "POST")).toBe(true);
});

it("addresses template CRUD, preview, sender read and sender save", async () => {
  const calls = recordFetch();
  await emailApi.listTemplates();
  await emailApi.createTemplate({ name: "Welcome" });
  await emailApi.getTemplate({ id: "t/1" });
  await emailApi.saveTemplateHtml({ id: "t1", html: "<p/>", expectedVersion: 2 });
  await emailApi.renameTemplate({ id: "t1", name: "New", expectedVersion: 3 });
  await emailApi.previewTemplate({ html: "<p/>", values: { a: "b" }, mode: "admin" });
  await emailApi.readSender();
  await emailApi.saveSender({ key: "senderName", value: "Tovu" });
  expect(calls).toEqual([
    { url: `${BASE}/email-templates?limit=100`, method: "GET", body: undefined },
    { url: `${BASE}/email-templates`, method: "POST", body: { name: "Welcome" } },
    { url: `${BASE}/email-templates/t%2F1`, method: "GET", body: undefined },
    { url: `${BASE}/email-templates/t1/html`, method: "PUT", body: { html: "<p/>", expectedVersion: 2 } },
    { url: `${BASE}/email-templates/t1`, method: "PATCH", body: { name: "New", expectedVersion: 3 } },
    { url: `${BASE}/email-templates/preview`, method: "POST", body: { html: "<p/>", values: { a: "b" }, mode: "admin" } },
    { url: `${BASE}/settings/effective?namespace=core.mail`, method: "GET", body: undefined },
    { url: `${BASE}/settings/value`, method: "PUT", body: { namespace: "core.mail", key: "senderName", scope: "workspace", valueJson: "Tovu" } },
  ]);
});

it("surfaces a failed request as a rejection rather than an empty result", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500, headers: { "Content-Type": "application/json" } })));
  await expect(emailApi.listProviders()).rejects.toBeInstanceOf(Error);
});
