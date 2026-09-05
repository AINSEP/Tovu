import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

/**
 * @file Coverage-gap-fill pass (2026-09-05) for the `connectors`/`policies`/`forms`/`seo`/
 * `redirects`/`posts` endpoint wrappers in `api.ts` — of these ~40 methods, most had no test at all
 * before this file (`listPosts`, `createPost`, `getPost`, `templatePreviewUrl`, `updatePost`,
 * `deletePost`, `getComposioConfig`, `saveComposioConfig`, `getConnectorStatuses`,
 * `connectConnector`, `disconnectConnector`, `cancelConnectorAuthorization`, `listPolicies`,
 * `deletePolicy`, `listPolicyPermissions`, `removePolicyPermission`, `listForms`, `getForm`,
 * `getSeoSettings`, `regenerateSitemap`, `getSeoEntry`, `getSeoEntryAnalyze`, `listRedirects`,
 * `tombstoneRedirect`, `getRedirectHits`, `importRedirects`). A handful of others
 * (`listConnectors`, `getConnector`, `createPolicy`, `updatePolicy`, `writePolicyPermission`,
 * `createForm`, `updateForm`, `listFormSubmissions`, `getFormSubmission`, `deleteFormSubmission`,
 * `setSeoSettings`, `putSeoEntry`, `createRedirect`, `updateRedirect`) already had partial coverage
 * in `api-endpoint-option-branches.unit.test.ts` (URL/body branch shape only) — this file adds the
 * method + parsed-response assertions those left uncovered, and fills the missing "options passed"
 * branch for `updateForm`, `setSeoSettings`, `putSeoEntry`, and `updateRedirect` (each of those four
 * only had an "empty options" test before).
 *
 * Every method here routes through the shared `request()` seam with no bespoke per-endpoint error
 * handling (confirmed by reading each — none pass an `onOk` hook or post-process the thrown error),
 * so this file does not re-test `request()`'s generic error-shaping branches (already characterized
 * in `api-request-unreachable.unit.test.ts`/`api-request-onok-and-null-body.unit.test.ts`); it adds
 * one representative thrown-`ApiError` test per resource group to confirm the wiring reaches each
 * call site, plus `importRedirects`' documented "207 is always a success, never a thrown ApiError"
 * behavior specifically, since that's the one case in this shard where non-2xx-shaped data still
 * resolves.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Captures every `fetch` call's URL/init and answers `respond()` (default: `200 {}`) for each —
 *  mirrors `api-endpoint-option-branches.unit.test.ts`'s own `stubFetchCapturing` shape so the two
 *  files read the same way, but adds a `method()` reader (defaulting to "GET", matching
 *  `buildFetchInit`'s real behavior of never setting `method` for a GET call) since this file also
 *  asserts HTTP method, not just URL/body. */
function stubFetchCapturing(respond: () => Response = () => jsonResponse({})): {
  calls: Array<{ url: string; init?: RequestInit }>;
  method(n?: number): string;
  body(n?: number): unknown;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return respond();
    })
  );
  return {
    calls,
    method(n = 0) {
      return calls[n]?.init?.method ?? "GET";
    },
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

const BASE_WORKSPACE = "/api/admin/v1/workspaces/workspace-local";

// --- Posts -----------------------------------------------------------------

describe("posts", () => {
  test("listPosts GETs the workspace posts collection and resolves the parsed envelope", async () => {
    const { calls, method } = stubFetchCapturing(() =>
      jsonResponse({ posts: [{ post: { id: "p1", kind: "post" } }] })
    );
    await expect(api.listPosts()).resolves.toEqual({ posts: [{ post: { id: "p1", kind: "post" } }] });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/posts`);
    expect(method()).toBe("GET");
  });

  test("createPost POSTs { title } and resolves the created post", async () => {
    const { body, method } = stubFetchCapturing(() => jsonResponse({ post: { id: "p1", title: "Hello" } }));
    await expect(api.createPost("Hello")).resolves.toEqual({ post: { id: "p1", title: "Hello" } });
    expect(body()).toEqual({ title: "Hello" });
    expect(method()).toBe("POST");
  });

  test("getPost GETs the post by id, unencoded — no encodeURIComponent applied to id", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ post: { id: "a/b" } }));
    await api.getPost("a/b");
    // Pinning current behavior: unlike getConnector/templatePreviewUrl, getPost/updatePost/deletePost
    // interpolate `id` raw. Not a bug this task fixes — reported as a structural finding.
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/posts/a/b`);
  });

  test("getPost propagates a thrown ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "post not found", code: "NOT_FOUND" }, 404));
    const error = await api.getPost("missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("post not found");
    expect((error as ApiError).code).toBe("NOT_FOUND");
  });

  test("updatePost PUTs the given partial fields as the body", async () => {
    const { body, method, calls } = stubFetchCapturing(() => jsonResponse({ post: { id: "p1", title: "New" } }));
    await api.updatePost({ id: "p1" }, { title: "New", status: "published" });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/posts/p1`);
    expect(method()).toBe("PUT");
    expect(body()).toEqual({ title: "New", status: "published" });
  });

  test("updatePost sends an empty body when the caller passes no options", async () => {
    const { body } = stubFetchCapturing();
    await api.updatePost({ id: "p1" });
    expect(body()).toEqual({});
  });

  test("deletePost DELETEs the post by id and resolves the (soft-deleted) post", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ post: { id: "p1", status: "draft" } }));
    await expect(api.deletePost("p1")).resolves.toEqual({ post: { id: "p1", status: "draft" } });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/posts/p1`);
    expect(method()).toBe("DELETE");
  });

  describe("templatePreviewUrl", () => {
    // Not routed through `request()`/`fetch` at all — it only builds a URL string (see the method's
    // own doc comment for why: callers point an <iframe src>/form action at it directly).

    test("outside dev, builds a bare relative BASE-prefixed URL with the id encoded", async () => {
      vi.stubEnv("DEV", false);
      expect(api.templatePreviewUrl("a/b", null)).toBe(
        `${BASE_WORKSPACE}/posts/${encodeURIComponent("a/b")}/template-preview`
      );
    });

    test("in dev, prefixes with the site origin (VITE_TOVU_SITE_URL when set)", async () => {
      vi.stubEnv("DEV", true);
      vi.stubEnv("VITE_TOVU_SITE_URL", "https://staging.example.com");
      expect(api.templatePreviewUrl("p1", null)).toBe(
        `https://staging.example.com${BASE_WORKSPACE}/posts/p1/template-preview`
      );
    });

    test("templateChoice: null omits the query param entirely", async () => {
      vi.stubEnv("DEV", false);
      expect(api.templatePreviewUrl("p1", null)).not.toContain("templateChoice");
    });

    test("templateChoice: empty string sends the explicit opt-out `?templateChoice=`", async () => {
      vi.stubEnv("DEV", false);
      expect(api.templatePreviewUrl("p1", "")).toBe(`${BASE_WORKSPACE}/posts/p1/template-preview?templateChoice=`);
    });

    test("templateChoice: a real filename is sent, encoded", async () => {
      vi.stubEnv("DEV", false);
      expect(api.templatePreviewUrl("p1", "page one.html")).toBe(
        `${BASE_WORKSPACE}/posts/p1/template-preview?templateChoice=${encodeURIComponent("page one.html")}`
      );
    });
  });
});

// --- Connectors -----------------------------------------------------------------

describe("connectors", () => {
  test("getComposioConfig GETs the connectors config and resolves it verbatim", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ configured: true, apiKeyTail: "abcd" }));
    await expect(api.getComposioConfig()).resolves.toEqual({ configured: true, apiKeyTail: "abcd" });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/connectors/config`);
    expect(method()).toBe("GET");
  });

  test("saveComposioConfig PUTs { apiKey } with a real key", async () => {
    const { body, method } = stubFetchCapturing(() => jsonResponse({ configured: true, apiKeyTail: "wxyz" }));
    await api.saveComposioConfig("sk-live-wxyz");
    expect(body()).toEqual({ apiKey: "sk-live-wxyz" });
    expect(method()).toBe("PUT");
  });

  test("saveComposioConfig PUTs { apiKey: null } to clear the key", async () => {
    const { body } = stubFetchCapturing();
    await api.saveComposioConfig(null);
    expect(body()).toEqual({ apiKey: null });
  });

  test("getConnectorStatuses GETs the statuses map and resolves it verbatim", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ c1: { status: "connected" } }));
    await expect(api.getConnectorStatuses()).resolves.toEqual({ c1: { status: "connected" } });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/connectors/statuses`);
  });

  test("connectConnector POSTs to /connect with the connector id encoded", async () => {
    const { calls, method, body } = stubFetchCapturing(() =>
      jsonResponse({ connector: { id: "gh/hub" }, auth: { kind: "redirect_required", redirectUrl: "https://x" } })
    );
    await expect(api.connectConnector("gh/hub")).resolves.toEqual({
      connector: { id: "gh/hub" },
      auth: { kind: "redirect_required", redirectUrl: "https://x" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/connectors/${encodeURIComponent("gh/hub")}/connect`);
    expect(method()).toBe("POST");
    expect(body()).toBeUndefined();
  });

  test("disconnectConnector POSTs to /disconnect with the connector id encoded", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ id: "c1", status: "available" }));
    await expect(api.disconnectConnector("c1")).resolves.toEqual({ id: "c1", status: "available" });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/connectors/c1/disconnect`);
    expect(method()).toBe("POST");
  });

  test("cancelConnectorAuthorization POSTs to /cancel with the connector id encoded", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ id: "c1", status: "available" }));
    await expect(api.cancelConnectorAuthorization("c1")).resolves.toEqual({ id: "c1", status: "available" });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/connectors/c1/cancel`);
    expect(method()).toBe("POST");
  });

  test("getConnector with hydrateTools+toolsLimit+toolsCursor resolves the parsed connector", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ id: "c1", tools: [] }));
    await expect(
      api.getConnector("c1", { hydrateTools: true, toolsLimit: 5, toolsCursor: "cur1" })
    ).resolves.toEqual({ id: "c1", tools: [] });
    const url = new URL(calls[0].url, "http://x");
    expect(url.searchParams.get("hydrateTools")).toBe("1");
    expect(url.searchParams.get("toolsLimit")).toBe("5");
    expect(url.searchParams.get("toolsCursor")).toBe("cur1");
  });

  test("a connector-scoped call propagates a thrown ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "connector not found", code: "NOT_FOUND" }, 404));
    const error = await api.disconnectConnector("missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("connector not found");
  });
});

// --- Policies -----------------------------------------------------------------

describe("policies", () => {
  test("listPolicies GETs the workspace policies collection and resolves it verbatim", async () => {
    const { calls, method } = stubFetchCapturing(() =>
      jsonResponse({ policies: [{ id: "pol1", name: "editors" }] })
    );
    await expect(api.listPolicies()).resolves.toEqual({ policies: [{ id: "pol1", name: "editors" }] });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies`);
    expect(method()).toBe("GET");
  });

  test("createPolicy POSTs and resolves the created policy", async () => {
    const { method } = stubFetchCapturing(() => jsonResponse({ policy: { id: "pol1", name: "policy-1" } }));
    await expect(api.createPolicy({ name: "policy-1" })).resolves.toEqual({ policy: { id: "pol1", name: "policy-1" } });
    expect(method()).toBe("POST");
  });

  test("updatePolicy PATCHes and resolves the updated policy", async () => {
    const { method, calls } = stubFetchCapturing(() => jsonResponse({ policy: { id: "pol1", name: "renamed" } }));
    await expect(api.updatePolicy({ policyId: "pol1" }, { name: "renamed" })).resolves.toEqual({
      policy: { id: "pol1", name: "renamed" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/pol1`);
    expect(method()).toBe("PATCH");
  });

  test("deletePolicy DELETEs the policy by id", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse(null));
    await api.deletePolicy("pol1");
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/pol1`);
    expect(method()).toBe("DELETE");
  });

  test("writePolicyPermission POSTs and resolves the created permission", async () => {
    const { method, calls } = stubFetchCapturing(() =>
      jsonResponse({ policyPermission: { id: "pp1", permission: "read" } })
    );
    await expect(api.writePolicyPermission({ policyId: "pol1", permission: "read" })).resolves.toEqual({
      policyPermission: { id: "pp1", permission: "read" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/pol1/permissions`);
    expect(method()).toBe("POST");
  });

  test("listPolicyPermissions GETs the policy's permissions and resolves them verbatim", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse({ policyPermissions: [{ id: "pp1", policyId: "pol1", permission: "read" }] })
    );
    await expect(api.listPolicyPermissions("pol1")).resolves.toEqual({
      policyPermissions: [{ id: "pp1", policyId: "pol1", permission: "read" }],
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/pol1/permissions`);
  });

  test("removePolicyPermission DELETEs the specific permission by both ids", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse(null));
    await api.removePolicyPermission({ policyId: "pol1", policyPermissionId: "pp1" });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/pol1/permissions/pp1`);
    expect(method()).toBe("DELETE");
  });

  test("a policy-scoped call propagates a thrown ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "cannot delete a builtin policy", code: "FORBIDDEN" }, 403));
    const error = await api.deletePolicy("builtin-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("cannot delete a builtin policy");
    expect((error as ApiError).status).toBe(403);
  });
});

// --- Forms -----------------------------------------------------------------

describe("forms", () => {
  test("listForms GETs the workspace forms collection and resolves it verbatim", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ data: [{ id: "f1", name: "Contact" }] }));
    await expect(api.listForms()).resolves.toEqual({ data: [{ id: "f1", name: "Contact" }] });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms`);
    expect(method()).toBe("GET");
  });

  test("getForm GETs the form by id and resolves it verbatim", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ data: { id: "f1", name: "Contact" } }));
    await expect(api.getForm("f1")).resolves.toEqual({ data: { id: "f1", name: "Contact" } });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms/f1`);
  });

  test("createForm resolves the created form definition", async () => {
    const { method } = stubFetchCapturing(() => jsonResponse({ data: { id: "f1", name: "Contact" } }));
    await expect(api.createForm({ name: "Contact", slug: "contact", fields: [] })).resolves.toEqual({
      data: { id: "f1", name: "Contact" },
    });
    expect(method()).toBe("POST");
  });

  // `updateForm` previously only had an "empty options" test in api-endpoint-option-branches.unit.test.ts —
  // the "options passed" branch (and PUT/response assertions) were entirely uncovered.
  test("updateForm PUTs the given patch fields and resolves the updated form", async () => {
    const { body, method, calls } = stubFetchCapturing(() =>
      jsonResponse({ data: { id: "f1", status: "disabled" } })
    );
    await expect(api.updateForm({ id: "f1" }, { status: "disabled" })).resolves.toEqual({
      data: { id: "f1", status: "disabled" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms/f1`);
    expect(method()).toBe("PUT");
    expect(body()).toEqual({ status: "disabled" });
  });

  test("listFormSubmissions resolves the submissions page verbatim, including nextCursor", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse({ data: [{ id: "s1" }], nextCursor: "c2" })
    );
    await expect(api.listFormSubmissions({ formId: "f1" })).resolves.toEqual({
      data: [{ id: "s1" }],
      nextCursor: "c2",
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms/f1/submissions`);
  });

  test("getFormSubmission resolves the single submission verbatim", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ data: { id: "s1", formDefinitionId: "f1" } }));
    await expect(api.getFormSubmission({ formId: "f1", submissionId: "s1" })).resolves.toEqual({
      data: { id: "s1", formDefinitionId: "f1" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms/f1/submissions/s1`);
  });

  test("a form-scoped call propagates a thrown ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "slug already in use", code: "VALIDATION_ERROR" }, 400));
    const error = await api
      .createForm({ name: "Contact", slug: "contact", fields: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("slug already in use");
  });
});

// --- SEO -----------------------------------------------------------------

describe("seo", () => {
  test("getSeoSettings GETs the workspace SEO settings and resolves them verbatim", async () => {
    const { calls, method } = stubFetchCapturing(() =>
      jsonResponse({ data: { titleTemplate: "%s | Tovu", defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: true, robotsRules: [] } })
    );
    await expect(api.getSeoSettings()).resolves.toEqual({
      data: { titleTemplate: "%s | Tovu", defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: true, robotsRules: [] },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/seo/settings`);
    expect(method()).toBe("GET");
  });

  // `setSeoSettings` previously only had an "empty options" test — the "options passed" branch was
  // entirely uncovered.
  test("setSeoSettings PUTs the given patch fields", async () => {
    const { body, method } = stubFetchCapturing();
    await api.setSeoSettings({ titleTemplate: "%s — New", sitemapEnabled: false });
    expect(method()).toBe("PUT");
    expect(body()).toEqual({ titleTemplate: "%s — New", sitemapEnabled: false });
  });

  test("regenerateSitemap POSTs with no body and resolves the accepted marker", async () => {
    const { calls, method, body } = stubFetchCapturing(() => jsonResponse({ data: { accepted: true } }));
    await expect(api.regenerateSitemap()).resolves.toEqual({ data: { accepted: true } });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/seo/sitemap/regenerate`);
    expect(method()).toBe("POST");
    expect(body()).toBeUndefined();
  });

  test("getSeoEntry GETs the entry's resolved SEO meta", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse({ data: { title: "Hi", canonical: "/hi", robots: { noindex: false, nofollow: false }, openGraph: {}, twitter: {}, jsonLd: [] } })
    );
    await api.getSeoEntry("e1");
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/seo/entries/e1`);
  });

  // `putSeoEntry` previously only had an "empty options" test — the "options passed" branch was
  // entirely uncovered.
  test("putSeoEntry PUTs the given override fields", async () => {
    const { body, method, calls } = stubFetchCapturing();
    await api.putSeoEntry({ entryId: "e1" }, { title: "Override title", noindex: true });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/seo/entries/e1`);
    expect(method()).toBe("PUT");
    expect(body()).toEqual({ title: "Override title", noindex: true });
  });

  test("getSeoEntryAnalyze GETs the entry's score+issues", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse({ data: { entryId: "e1", score: 80, issues: [], resolved: {} } })
    );
    await expect(api.getSeoEntryAnalyze("e1")).resolves.toEqual({
      data: { entryId: "e1", score: 80, issues: [], resolved: {} },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/seo/entries/e1/analyze`);
  });

  // Doc comment on `putSeoEntry` claims failures here are always 400 validation errors, never the
  // 409-shaped conflict body other endpoints use (no optimistic-concurrency field on this route) —
  // pinning that the client surfaces whatever the server actually returns, since `request()` doesn't
  // special-case SEO's status codes.
  test("putSeoEntry propagates a 400 validation ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "canonical must be an absolute path", code: "VALIDATION_ERROR" }, 400));
    const error = await api.putSeoEntry({ entryId: "e1" }, { canonical: "not-a-path" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("canonical must be an absolute path");
    expect((error as ApiError).status).toBe(400);
  });
});

// --- Redirects -----------------------------------------------------------------

describe("redirects", () => {
  test("listRedirects GETs the workspace redirects collection and resolves it verbatim", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ data: [{ id: "r1", fromPattern: "/a" }] }));
    await expect(api.listRedirects()).resolves.toEqual({ data: [{ id: "r1", fromPattern: "/a" }] });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects`);
    expect(method()).toBe("GET");
  });

  test("createRedirect resolves the created redirect", async () => {
    const { method } = stubFetchCapturing(() => jsonResponse({ data: { id: "r1", fromPattern: "/a" } }));
    await expect(
      api.createRedirect({ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 })
    ).resolves.toEqual({ data: { id: "r1", fromPattern: "/a" } });
    expect(method()).toBe("POST");
  });

  // `updateRedirect` previously only had an "empty options" test — the "options passed" branch was
  // entirely uncovered.
  test("updateRedirect PATCHes the given patch fields and resolves the updated redirect", async () => {
    const { body, method, calls } = stubFetchCapturing(() => jsonResponse({ data: { id: "r1", statusCode: 302 } }));
    await expect(api.updateRedirect({ id: "r1" }, { statusCode: 302, status: "active" })).resolves.toEqual({
      data: { id: "r1", statusCode: 302 },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects/r1`);
    expect(method()).toBe("PATCH");
    expect(body()).toEqual({ statusCode: 302, status: "active" });
  });

  test("tombstoneRedirect DELETEs the redirect by id and resolves the tombstoned row", async () => {
    const { calls, method } = stubFetchCapturing(() => jsonResponse({ data: { id: "r1", status: "tombstoned" } }));
    await expect(api.tombstoneRedirect("r1")).resolves.toEqual({ data: { id: "r1", status: "tombstoned" } });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects/r1`);
    expect(method()).toBe("DELETE");
  });

  test("getRedirectHits GETs the redirect's hit stats", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse({ data: { redirectId: "r1", hitCount: 12, lastHitAt: "2026-09-01T00:00:00.000Z" } })
    );
    await expect(api.getRedirectHits("r1")).resolves.toEqual({
      data: { redirectId: "r1", hitCount: 12, lastHitAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects/r1/hits`);
  });

  test("importRedirects POSTs { rules } and resolves the created/failed breakdown", async () => {
    const { body, method, calls } = stubFetchCapturing(() =>
      jsonResponse({ created: [{ id: "r1" }], failed: [] })
    );
    const rules = [{ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 }];
    await expect(api.importRedirects(rules)).resolves.toEqual({ created: [{ id: "r1" }], failed: [] });
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects/import`);
    expect(method()).toBe("POST");
    expect(body()).toEqual({ rules });
  });

  // The method's own doc comment claims the route "always answers 207 on the wire" and that
  // `request()` treats 2xx (incl. 207) as success, so a batch with per-item failures still resolves
  // rather than throwing. Pinning that claim against a real stubbed 207 response, including when
  // every item in the batch failed.
  test("importRedirects resolves (does not throw) on a 207 response, even when every rule failed", async () => {
    const { calls } = stubFetchCapturing(() =>
      jsonResponse(
        { created: [], failed: [{ index: 0, code: "VALIDATION_ERROR", message: "bad fromPattern" }] },
        207
      )
    );
    await expect(api.importRedirects([{ matchType: "exact", fromPattern: "", toTarget: "/b", statusCode: 301 }])).resolves.toEqual(
      { created: [], failed: [{ index: 0, code: "VALIDATION_ERROR", message: "bad fromPattern" }] }
    );
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/redirects/import`);
  });

  test("a redirect-scoped call propagates a thrown ApiError with the server's exact message", async () => {
    stubFetchCapturing(() => jsonResponse({ error: "redirect not found", code: "NOT_FOUND" }, 404));
    const error = await api.tombstoneRedirect("missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("redirect not found");
  });
});
