import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { isAdminDevServerOrigin } from "../admin-dev-origin";
import { ApiError, api } from "../api";

// `templatePreviewUrl` routes through `lib/site-url.ts`, which now asks whether the page is actually
// on the admin dev server's own origin before absolutizing. Mocked rather than driven through
// `window.location`, which jsdom does not reliably let a test reconfigure — same reasoning (and the
// same zero-coverage caveat) as `site-url.unit.test.ts`; `admin-dev-origin.unit.test.ts` covers the
// real predicate.
vi.mock("../admin-dev-origin", () => ({ isAdminDevServerOrigin: vi.fn() }));

/**
 * @file Host policy, forms-picker and post endpoints. Each test checks the actual request and
 * parsed response; generic request error-shaping remains covered in the request suites.
 */

beforeEach(() => {
  // Default to the historical premise (the browser really is on Vite's origin); the one test that
  // cares about the desktop's proxied origin overrides it.
  vi.mocked(isAdminDevServerOrigin).mockReturnValue(true);
});

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

  test("getPost GETs the post by id, encodeURIComponent-applied like templatePreviewUrl", async () => {
    const { calls } = stubFetchCapturing(() => jsonResponse({ post: { id: "a/b" } }));
    await api.getPost("a/b");
    // Was pinned as raw/unencoded (`.../posts/a/b`) — fixed 2026-09-05 (`fix-apienc` dispatch) for
    // consistency with templatePreviewUrl and the rest of this sweep; see
    // `api-id-url-encoding.unit.test.ts` for the full id-encoding coverage this fix added.
    expect(calls[0].url).toBe(`${BASE_WORKSPACE}/posts/${encodeURIComponent("a/b")}`);
    expect(calls[0].init?.method ?? "GET").toBe("GET");
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

    test("in dev but NOT on the admin dev server's origin, stays relative — protects the desktop's preview iframe", async () => {
      // `apps/desktop` serves this dev bundle through its own site server at `/admin/*`, on a port
      // assigned at runtime. Absolutizing there points the iframe at `https://localhost:3000`, which
      // a bare `npm run desktop` has nothing listening on.
      vi.stubEnv("DEV", true);
      vi.mocked(isAdminDevServerOrigin).mockReturnValue(false);
      expect(api.templatePreviewUrl("p1", null)).toBe(`${BASE_WORKSPACE}/posts/p1/template-preview`);
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
    expect(calls[0].init?.method ?? "GET").toBe("GET");
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

});
