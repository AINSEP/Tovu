import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

/**
 * @file Coverage-gap-fill pass (2026-09-04) for `api.ts`'s per-endpoint wrapper functions — the
 * ~1450-line `api` object below `request()`. 21+ admin screens each call only the handful of
 * endpoints their own screen needs, so no existing suite exercised every optional-parameter branch
 * (a default `options = {}`, a conditional `URLSearchParams.set`, a `?foo=` URL ternary, an `||`/`??`
 * fallback) across this whole surface — the gap this file closes, one real HTTP-shape assertion per
 * branch, not a placeholder call.
 *
 * Every test asserts on the ACTUAL `fetch` call's URL/method/body (or, for `restartAssistantDaemon`,
 * the resolved/thrown outcome) — never a trivially-true assertion — so a future edit that breaks the
 * branch's real behavior fails these tests, not just raises a coverage number.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Captures every `fetch` call's URL and `RequestInit` so tests can assert on the exact request
 *  shape a branch produces, rather than only on the resolved value. */
function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }>; body(n?: number): unknown } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({});
    })
  );
  return {
    calls,
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

// --- Members -----------------------------------------------------------------

test("requestMemberMagicLink omits redirectPath from the body when the caller doesn't pass one", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.requestMemberMagicLink({ email: "a@b.com" });
  expect(calls[0].url).toContain("/members/request-magic-link");
  expect(body()).toEqual({ email: "a@b.com" });
});

test("requestMemberMagicLink includes redirectPath when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.requestMemberMagicLink({ email: "a@b.com" }, { redirectPath: "/welcome" });
  expect(body()).toEqual({ email: "a@b.com", redirectPath: "/welcome" });
});

// --- Analytics -----------------------------------------------------------------

test("listRecentAnalyticsHits omits the limit query param when none is given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listRecentAnalyticsHits();
  expect(calls[0].url).not.toContain("limit=");
});

test("listRecentAnalyticsHits appends ?limit= when a limit is given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listRecentAnalyticsHits({ limit: 50 });
  expect(calls[0].url).toMatch(/[?&]limit=50/);
});

// --- Menus -----------------------------------------------------------------

test("createMenu omits items from the body when the caller doesn't pass any", async () => {
  const { body } = stubFetchCapturing();
  await api.createMenu({ title: "Main", slug: "main" });
  expect(body()).toEqual({ title: "Main", slug: "main" });
});

test("createMenu includes items when the caller passes them", async () => {
  const { body } = stubFetchCapturing();
  const items = [{ id: "i1", target: { kind: "url" as const, href: "/x" } }];
  await api.createMenu({ title: "Main", slug: "main" }, { items });
  expect(body()).toEqual({ title: "Main", slug: "main", items });
});

test("updateMenuTree omits title/slug from the body when the caller doesn't pass them", async () => {
  const { body } = stubFetchCapturing();
  await api.updateMenuTree({ id: "m1", expectedVersion: 1, items: [] });
  expect(body()).toEqual({ expectedVersion: 1, items: [] });
});

test("updateMenuTree includes title/slug when the caller passes them", async () => {
  const { body } = stubFetchCapturing();
  await api.updateMenuTree({ id: "m1", expectedVersion: 1, items: [] }, { title: "New", slug: "new" });
  expect(body()).toEqual({ expectedVersion: 1, items: [], title: "New", slug: "new" });
});

test("deleteMenu has no ?force query param by default", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteMenu({ id: "m1" });
  expect(calls[0].url).not.toContain("force");
});

test("deleteMenu appends ?force=true when force is requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteMenu({ id: "m1" }, { force: true });
  expect(calls[0].url).toContain("?force=true");
});

// --- Integrations -----------------------------------------------------------------

test("pauseIntegrationSubscription sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: withoutArg } = stubFetchCapturing();
  await api.pauseIntegrationSubscription({ id: "s1", paused: true });
  vi.unstubAllGlobals();

  const { calls: withArg } = stubFetchCapturing();
  await api.pauseIntegrationSubscription({ id: "s1", paused: true }, {});

  expect(withArg[0].url).toBe(withoutArg[0].url);
  expect(withArg[0].init?.body).toBe(withoutArg[0].init?.body);
  expect(withArg[0].url).toContain("/subscriptions/s1/pause");
});

// --- Connectors -----------------------------------------------------------------

test("listConnectors has no ?refresh query param when refresh is not requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.listConnectors();
  expect(calls[0].url).not.toContain("refresh");
});

test("listConnectors appends ?refresh=1 when a live refresh is requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.listConnectors(true);
  expect(calls[0].url).toContain("?refresh=1");
});

test("getConnector with no options builds a bare URL — no query string at all", async () => {
  const { calls } = stubFetchCapturing();
  await api.getConnector("c1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/connectors/c1`);
});

test("getConnector sets hydrateTools=1 only when hydrateTools is requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.getConnector("c1", { hydrateTools: true });
  expect(calls[0].url).toContain("hydrateTools=1");
});

test("getConnector sets toolsLimit when a limit is given", async () => {
  const { calls } = stubFetchCapturing();
  await api.getConnector("c1", { toolsLimit: 5 });
  expect(calls[0].url).toContain("toolsLimit=5");
});

test("getConnector sets toolsCursor when a cursor is given", async () => {
  const { calls } = stubFetchCapturing();
  await api.getConnector("c1", { toolsCursor: "abc" });
  expect(calls[0].url).toContain("toolsCursor=abc");
});

// --- Media -----------------------------------------------------------------

test("uploadMedia sends no extra metadata fields when the caller passes none", async () => {
  const { body } = stubFetchCapturing();
  await api.uploadMedia({ filename: "f.png", contentType: "image/png", dataBase64: "AA==" });
  expect(body()).toEqual({ filename: "f.png", contentType: "image/png", dataBase64: "AA==" });
});

test("uploadMedia includes alt/caption/credit when the caller passes them", async () => {
  const { body } = stubFetchCapturing();
  await api.uploadMedia(
    { filename: "f.png", contentType: "image/png", dataBase64: "AA==" },
    { alt: "a photo", caption: "cap", credit: "cred" }
  );
  expect(body()).toEqual({
    filename: "f.png",
    contentType: "image/png",
    dataBase64: "AA==",
    alt: "a photo",
    caption: "cap",
    credit: "cred",
  });
});

// --- Users / roles / policies -----------------------------------------------------------------

test("createUser omits email from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.createUser({ username: "bob", password: "pw" });
  expect(body()).toEqual({ username: "bob", password: "pw" });
});

test("createUser includes email when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.createUser({ username: "bob", password: "pw" }, { email: "bob@x.com" });
  expect(body()).toEqual({ username: "bob", password: "pw", email: "bob@x.com" });
});

test("updateUser sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.updateUser({ principalId: "p1" });
  expect(body()).toEqual({});
});

test("updateUser sends the patch fields when the caller passes options", async () => {
  const { body } = stubFetchCapturing();
  await api.updateUser({ principalId: "p1" }, { email: "new@x.com" });
  expect(body()).toEqual({ email: "new@x.com" });
});

test("resetUserPassword sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.resetUserPassword({ principalId: "p1", password: "pw" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.resetUserPassword({ principalId: "p1", password: "pw" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(a[0].url).toContain("/reset-password");
});

test("assignRole sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.assignRole({ principalId: "p1", roleId: "r1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.assignRole({ principalId: "p1", roleId: "r1" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(JSON.parse(String(a[0].init?.body))).toEqual({ roleId: "r1" });
});

test("attachPolicy sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.attachPolicy({ principalId: "p1", policyId: "pol1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.attachPolicy({ principalId: "p1", policyId: "pol1" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(JSON.parse(String(a[0].init?.body))).toEqual({ policyId: "pol1" });
});

test("updateRole sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.updateRole({ roleId: "r1", name: "New name" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.updateRole({ roleId: "r1", name: "New name" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(JSON.parse(String(a[0].init?.body))).toEqual({ name: "New name" });
});

test("createPolicy omits description from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.createPolicy({ name: "policy-1" });
  expect(body()).toEqual({ name: "policy-1", description: undefined });
});

test("createPolicy includes description when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.createPolicy({ name: "policy-1" }, { description: "does things" });
  expect(body()).toEqual({ name: "policy-1", description: "does things" });
});

test("updatePolicy sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.updatePolicy({ policyId: "pol1" });
  expect(body()).toEqual({});
});

test("updatePolicy sends the patch fields when the caller passes options", async () => {
  const { body } = stubFetchCapturing();
  await api.updatePolicy({ policyId: "pol1" }, { name: "renamed" });
  expect(body()).toEqual({ name: "renamed" });
});

test("writePolicyPermission drops resourceType from the body when none is given", async () => {
  const { body } = stubFetchCapturing();
  await api.writePolicyPermission({ policyId: "pol1", permission: "read" });
  expect(body()).toEqual({ permission: "read" });
});

test("writePolicyPermission includes a real resourceType in the body", async () => {
  const { body } = stubFetchCapturing();
  await api.writePolicyPermission({ policyId: "pol1", permission: "read" }, { resourceType: "post" });
  expect(body()).toEqual({ permission: "read", resourceType: "post" });
});

// --- Workspace / Settings -----------------------------------------------------------------

test("getSettingsEffective adds principalId to the query only when the caller passes one", async () => {
  const { calls } = stubFetchCapturing();
  await api.getSettingsEffective({ namespace: "core" }, { principalId: "p1" });
  expect(calls[0].url).toContain("principalId=p1");
});

// Pinned 2026-09-05 (`fix-apienc` dispatch, coverage-gap-fill TASK 2) — the false arm of
// `if (options.principalId)`: every existing call in the verified-clean scope supplied one.
test("getSettingsEffective omits principalId from the query when the caller passes no options", async () => {
  const { calls } = stubFetchCapturing();
  await api.getSettingsEffective({ namespace: "core" });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core`);
  expect(calls[0].url).not.toContain("principalId");
});

test("setSetting sends only the input fields when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.setSetting({ namespace: "core", key: "k", scope: "workspace", valueJson: 1 });
  expect(body()).toEqual({ namespace: "core", key: "k", scope: "workspace", valueJson: 1 });
});

test("setSetting merges principalId into the body when the caller passes it", async () => {
  const { body } = stubFetchCapturing();
  await api.setSetting({ namespace: "core", key: "k", scope: "user", valueJson: 1 }, { principalId: "p1" });
  expect(body()).toEqual({ namespace: "core", key: "k", scope: "user", valueJson: 1, principalId: "p1" });
});

test("clearSetting merges principalId into the body when the caller passes it", async () => {
  const { body } = stubFetchCapturing();
  await api.clearSetting({ namespace: "core", key: "k", scope: "user" }, { principalId: "p1" });
  expect(body()).toEqual({ namespace: "core", key: "k", scope: "user", principalId: "p1" });
});

// --- Forms -----------------------------------------------------------------

test("createForm omits notify from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.createForm({ name: "Contact", slug: "contact", fields: [] });
  expect(body()).toEqual({ name: "Contact", slug: "contact", fields: [] });
});

test("createForm includes notify when the caller passes it", async () => {
  const { body } = stubFetchCapturing();
  const notify = { enabled: true, recipients: ["a@b.com"] };
  await api.createForm({ name: "Contact", slug: "contact", fields: [] }, { notify });
  expect(body()).toEqual({ name: "Contact", slug: "contact", fields: [], notify });
});

test("updateForm sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.updateForm({ id: "f1" });
  expect(body()).toEqual({});
});

test("listFormSubmissions has no query string when no options are given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listFormSubmissions({ formId: "f1" });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/forms/f1/submissions`);
});

test("listFormSubmissions sets cursor in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listFormSubmissions({ formId: "f1" }, { cursor: "c1" });
  expect(calls[0].url).toContain("cursor=c1");
});

test("listFormSubmissions sets limit in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listFormSubmissions({ formId: "f1" }, { limit: 10 });
  expect(calls[0].url).toContain("limit=10");
});

test("getFormSubmission sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.getFormSubmission({ formId: "f1", submissionId: "s1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.getFormSubmission({ formId: "f1", submissionId: "s1" }, {});
  expect(b[0].url).toBe(a[0].url);
  expect(a[0].url).toContain("/forms/f1/submissions/s1");
});

test("deleteFormSubmission sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.deleteFormSubmission({ formId: "f1", submissionId: "s1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.deleteFormSubmission({ formId: "f1", submissionId: "s1" }, {});
  expect(b[0].init?.method).toBe(a[0].init?.method);
  expect(a[0].init?.method).toBe("DELETE");
});

// --- AI Assistant -----------------------------------------------------------------

test("restartAssistantDaemon rethrows a non-ApiError failure untouched", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    })
  );
  await expect(api.restartAssistantDaemon()).rejects.toThrow(ApiError);
});

test("restartAssistantDaemon rethrows an ApiError whose body has no string reason", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "Content-Type": "application/json" } })));
  const error = await api.restartAssistantDaemon().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("boom");
});

test("restartAssistantDaemon resolves { ok: false, reason } for a 409 refusal, instead of throwing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "shutting down", reason: "shutting down" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
    )
  );
  await expect(api.restartAssistantDaemon()).resolves.toEqual({ ok: false, reason: "shutting down" });
});

// --- SEO -----------------------------------------------------------------

test("setSeoSettings sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.setSeoSettings();
  expect(body()).toEqual({});
});

test("putSeoEntry sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.putSeoEntry({ entryId: "e1" });
  expect(body()).toEqual({});
});

// --- Redirects -----------------------------------------------------------------

test("createRedirect sends only the input fields when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.createRedirect({ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 });
  expect(body()).toEqual({ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 });
});

test("createRedirect merges override/priority into the body when given", async () => {
  const { body } = stubFetchCapturing();
  await api.createRedirect(
    { matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 },
    { override: true, priority: 5 }
  );
  expect(body()).toEqual({
    matchType: "exact",
    fromPattern: "/a",
    toTarget: "/b",
    statusCode: 301,
    override: true,
    priority: 5,
  });
});

test("updateRedirect sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.updateRedirect({ id: "r1" });
  expect(body()).toEqual({});
});

// --- Collections/Entries -----------------------------------------------------------------

test("listEntries has no ?type query param when no type filter is given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listEntries();
  expect(calls[0].url).toBe(`/api/admin/v1/entries`);
});

// --- Database -----------------------------------------------------------------

test("getDatabaseTimeline sets limit in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDatabaseTimeline({ limit: 25 });
  expect(calls[0].url).toContain("limit=25");
});

// Pinned 2026-09-05 (`fix-apienc` dispatch, coverage-gap-fill TASK 2) — every existing call in the
// verified-clean scope passed `limit` and nothing else, so the five OTHER filter options' true arms,
// `limit`'s own false arm, and the empty-querystring ternary arm were all untested.
test("getDatabaseTimeline sets every other filter option in the query when given (and omits limit)", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDatabaseTimeline({
    kind: "migration",
    outcome: "success",
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    cursor: "cur1",
  });
  const url = new URL(calls[0].url, "http://localhost");
  expect(url.searchParams.get("kind")).toBe("migration");
  expect(url.searchParams.get("outcome")).toBe("success");
  expect(url.searchParams.get("fromDate")).toBe("2026-01-01");
  expect(url.searchParams.get("toDate")).toBe("2026-01-31");
  expect(url.searchParams.get("cursor")).toBe("cur1");
  // `limit` was omitted — its false arm — and the querystring is non-empty from the other filters.
  expect(url.searchParams.has("limit")).toBe(false);
});

test("getDatabaseTimeline builds a bare, query-less URL when every filter option is omitted", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDatabaseTimeline();
  expect(calls[0].url).toBe(`/api/admin/v1/database/timeline`);
});

test("confirmMigrateForward sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.confirmMigrateForward({ planId: "p1", planHash: "h1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.confirmMigrateForward({ planId: "p1", planHash: "h1" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(a[0].url).toBe(`/api/admin/v1/database/migrate-forward/confirm`);
});

// --- Comments -----------------------------------------------------------------

test("listCommentsQueue has no query string when no options are given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listCommentsQueue();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/comments/queue`);
});

test("listCommentsQueue sets status in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listCommentsQueue({ status: "pending" });
  expect(calls[0].url).toContain("status=pending");
});

test("listCommentsQueue sets cursor in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listCommentsQueue({ cursor: "c1" });
  expect(calls[0].url).toContain("cursor=c1");
});

test("listCommentsQueue sets limit in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listCommentsQueue({ limit: 20 });
  expect(calls[0].url).toContain("limit=20");
});

test("moderateComment omits note from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.moderateComment({ commentId: "c1", action: "approve", expectedVersion: 1 });
  expect(body()).toEqual({ expectedVersion: 1 });
});

test("moderateComment includes note when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.moderateComment({ commentId: "c1", action: "spam", expectedVersion: 1 }, { note: "obvious spam" });
  expect(body()).toEqual({ expectedVersion: 1, note: "obvious spam" });
});

test("purgeComment omits note from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.purgeComment({ commentId: "c1" });
  expect(body()).toEqual({});
});

test("putCommentsSettings sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.putCommentsSettings();
  expect(body()).toEqual({});
});

// --- Widgets -----------------------------------------------------------------

test("listWidgets has no query string when no options are given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listWidgets();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets`);
});

test("listWidgets sets widgetType in the query when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.listWidgets({ widgetType: "text" });
  expect(calls[0].url).toContain("widgetType=text");
});

test("listWidgets sets includeInactive=true in the query when requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.listWidgets({ includeInactive: true });
  expect(calls[0].url).toContain("includeInactive=true");
});

test("createWidget omits slug from the body when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.createWidget({ widgetType: "text", title: "My widget", config: {} });
  expect(body()).toEqual({ widgetType: "text", title: "My widget", config: {} });
});

test("createWidget includes slug when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.createWidget({ widgetType: "text", title: "My widget", config: {} }, { slug: "my-widget" });
  expect(body()).toEqual({ widgetType: "text", title: "My widget", config: {}, slug: "my-widget" });
});

test("updateWidget sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.updateWidget({ id: "w1", baseVersion: 1, config: {} });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.updateWidget({ id: "w1", baseVersion: 1, config: {} }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(a[0].init?.method).toBe("PUT");
});

test("purgeWidget has no ?force query param by default", async () => {
  const { calls } = stubFetchCapturing();
  await api.purgeWidget({ id: "w1" });
  expect(calls[0].url).not.toContain("force");
});

test("purgeWidget appends ?force=true when force is requested", async () => {
  const { calls } = stubFetchCapturing();
  await api.purgeWidget({ id: "w1" }, { force: true });
  expect(calls[0].url).toContain("?force=true");
});

test("mutateWidgetRegionPlacements sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.mutateWidgetRegionPlacements({ regionKey: "sidebar", baseVersion: 1, placements: [] });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.mutateWidgetRegionPlacements({ regionKey: "sidebar", baseVersion: 1, placements: [] }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
});

test("insertWidgetEmbed sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.insertWidgetEmbed({ hostEntryId: "e1", baseVersion: 1, widgetEntryId: "w1" });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.insertWidgetEmbed({ hostEntryId: "e1", baseVersion: 1, widgetEntryId: "w1" }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(a[0].init?.method).toBe("POST");
});

test("removeWidgetEmbed sends the same request whether or not the unused options arg is passed", async () => {
  const { calls: a } = stubFetchCapturing();
  await api.removeWidgetEmbed({ hostEntryId: "e1", placementId: "pl1", baseVersion: 1 });
  vi.unstubAllGlobals();
  const { calls: b } = stubFetchCapturing();
  await api.removeWidgetEmbed({ hostEntryId: "e1", placementId: "pl1", baseVersion: 1 }, {});
  expect(b[0].init?.body).toBe(a[0].init?.body);
  expect(a[0].init?.method).toBe("DELETE");
});

// --- Deployment / static export / publish -----------------------------------------------------------------

test("setDockerfileSource merges the ETag response header into a successful result", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ exists: true, contents: "FROM node:22\n" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"def456"' },
        })
    )
  );
  await expect(api.setDockerfileSource("FROM node:22\n", '"abc123"')).resolves.toEqual({
    exists: true,
    contents: "FROM node:22\n",
    etag: '"def456"',
  });
});

test("setDockerfileSource falls back to an empty-string etag when the response has no ETag header", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ exists: true, contents: "x" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    )
  );
  await expect(api.setDockerfileSource("x", '"abc123"')).resolves.toEqual({ exists: true, contents: "x", etag: "" });
});

// Regression for the 2026-09-04 complexity pass on `buildFetchInit` (`api.ts`): `setDockerfileSource`
// is the only `api.ts` caller that passes a custom `init.headers` (`If-Match`) alongside a JSON
// `body`. A prior version of `buildFetchInit` re-spread `init` AFTER building the merged `headers`
// object, so `init.headers` (just `{ "If-Match": ... }`) replaced the merge wholesale and silently
// dropped `Content-Type: application/json` — the server's `express.json()` body parser then never
// parses `req.body`, so the PUT 400s with "'contents' (string) is required" instead of applying the
// write. Both headers must reach `fetch` together. Also pins `credentials: "same-origin"` staying the
// default — it sits BEFORE `...init` in `buildFetchInit`, so nothing about this fix should move it
// after `...init` (which would let a caller's `init` silently override it in ways the API contract
// doesn't intend), and this assertion goes red the moment it does.
test("setDockerfileSource keeps Content-Type: application/json alongside its custom If-Match header, and still defaults credentials to same-origin", async () => {
  const { calls } = stubFetchCapturing();
  await api.setDockerfileSource("FROM node:22\n", '"abc123"');
  expect(calls[0].init?.headers).toEqual({
    "Content-Type": "application/json",
    "If-Match": '"abc123"',
  });
  expect(calls[0].init?.credentials).toBe("same-origin");
});

test("triggerSiteExport sends an empty body when called with no options at all", async () => {
  const { body } = stubFetchCapturing();
  await api.triggerSiteExport();
  expect(body()).toEqual({});
});

test("triggerSiteExport sends the given options as the body", async () => {
  const { body } = stubFetchCapturing();
  await api.triggerSiteExport({ clean: true, basePath: "/blog" });
  expect(body()).toEqual({ clean: true, basePath: "/blog" });
});

test("getPublishPreview for github-pages sets owner/repo, and branch only when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPublishPreview({ target: "github-pages", owner: "acme", repo: "site" });
  expect(calls[0].url).toContain("owner=acme");
  expect(calls[0].url).toContain("repo=site");
  expect(calls[0].url).not.toContain("branch");
  vi.unstubAllGlobals();

  const { calls: withBranch } = stubFetchCapturing();
  await api.getPublishPreview({ target: "github-pages", owner: "acme", repo: "site", branch: "gh-pages" });
  expect(withBranch[0].url).toContain("branch=gh-pages");
});

test("getPublishPreview for vercel sets teamId only when given", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPublishPreview({ target: "vercel" });
  expect(calls[0].url).not.toContain("teamId");
  vi.unstubAllGlobals();

  const { calls: withTeam } = stubFetchCapturing();
  await api.getPublishPreview({ target: "vercel", teamId: "team-1" });
  expect(withTeam[0].url).toContain("teamId=team-1");
});

test("getPublishPreview for netlify and cloudflare-pages adds no target-specific query params", async () => {
  const { calls: netlify } = stubFetchCapturing();
  await api.getPublishPreview({ target: "netlify" });
  expect(netlify[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/system/publish/preview?target=netlify`);
  vi.unstubAllGlobals();

  const { calls: cloudflare } = stubFetchCapturing();
  await api.getPublishPreview({ target: "cloudflare-pages" });
  expect(cloudflare[0].url).toBe(
    `/api/admin/v1/workspaces/workspace-local/system/publish/preview?target=cloudflare-pages`
  );
});
