import { describe, expect, it } from "vitest";

import { resolveAdminSitePreviewPath, SitePreviewPathError } from "../site-preview-path";

/**
 * @file `resolveAdminSitePreviewPath` — the admin-side sibling of
 * `apps/website/src/features/site-inspection/published-page.ts`'s `resolveSameOriginPath`, one
 * assertion per rule for the same reason that file's own test suite does it: each rule closes a
 * different hole, so a single combined assertion would hide which one broke.
 *
 * `/api/` and `/admin` refusals are THIS validator's own addition (§Q4 of
 * `ADS-memory/.local-artifacts/handoffs/2026-09-15-view-site-tool-PLAN.md`): the iframe this path
 * feeds loads in the operator's browser WITH their admin session cookie, unlike
 * `fetch_published_page`'s unauthenticated in-process fetch — so this validator must refuse the
 * admin app itself, not only the API surface.
 *
 * `ORIGIN` is passed explicitly (this function's own testability seam — mirrors
 * `resolveSameOriginPath`'s `base` parameter) so these tests need no real `window.location`.
 */
const ORIGIN = "https://example.tovu.test";

describe("resolveAdminSitePreviewPath", () => {
  it("accepts ordinary root-relative site paths, keeping the query string", () => {
    expect(resolveAdminSitePreviewPath("/", ORIGIN)).toBe("/");
    expect(resolveAdminSitePreviewPath("/blog/hello", ORIGIN)).toBe("/blog/hello");
    expect(resolveAdminSitePreviewPath("/blog?page=2", ORIGIN)).toBe("/blog?page=2");
  });

  it("refuses an empty, non-string, or oversized path", () => {
    expect(() => resolveAdminSitePreviewPath("", ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath(undefined, ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath(42, ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath(`/${"a".repeat(2049)}`, ORIGIN)).toThrow(SitePreviewPathError);
  });

  it("refuses a path with no leading slash — never a bare relative path or a full URL", () => {
    expect(() => resolveAdminSitePreviewPath("blog/hello", ORIGIN)).toThrow(/must start with '\//);
    // An absolute URL is caught by this SAME rule (it does not start with '/'), before the
    // structural same-origin `new URL()` check ever runs — matching `published-page.ts`'s own
    // suite, which asserts this identically rather than a dedicated "off-origin" message.
    expect(() => resolveAdminSitePreviewPath("https://evil.example/x", ORIGIN)).toThrow(/must start with '\//);
  });

  it("refuses a protocol-relative path — the classic same-origin bypass", () => {
    expect(() => resolveAdminSitePreviewPath("//evil.example/x", ORIGIN)).toThrow(/protocol-relative/);
  });

  it("refuses a backslash, which URL parsers treat as a slash", () => {
    expect(() => resolveAdminSitePreviewPath("/a\\b", ORIGIN)).toThrow(/backslash/);
  });

  it("refuses control characters, including CR/LF request splitting", () => {
    expect(() => resolveAdminSitePreviewPath("/ok\r\nX-Injected: 1", ORIGIN)).toThrow(/control character/);
  });

  it("refuses a raw '..' traversal segment", () => {
    expect(() => resolveAdminSitePreviewPath("/a/../b", ORIGIN)).toThrow(/'\.\.' segment/);
  });

  it("refuses a percent-encoded '..' traversal segment", () => {
    expect(() => resolveAdminSitePreviewPath("/a/%2e%2e/b", ORIGIN)).toThrow(/'\.\.' segment/);
  });

  it("refuses '/api/' case-insensitively, raw or percent-encoded", () => {
    expect(() => resolveAdminSitePreviewPath("/api/admin/settings", ORIGIN)).toThrow(/'\/api\/'/);
    expect(() => resolveAdminSitePreviewPath("/API/admin/settings", ORIGIN)).toThrow(/'\/api\/'/);
    // decodes to "/api/x" — the same %61 ("a") bypass published-page.unit.test.ts pins for the
    // sibling validator.
    expect(() => resolveAdminSitePreviewPath("/%61pi/x", ORIGIN)).toThrow(/'\/api\/'/);
  });

  it("⚠️ refuses '/admin' and every '/admin/*' path — this validator's own load-bearing rule, absent from fetch_published_page's sibling", () => {
    expect(() => resolveAdminSitePreviewPath("/admin", ORIGIN)).toThrow(/admin/i);
    expect(() => resolveAdminSitePreviewPath("/admin/", ORIGIN)).toThrow(/admin/i);
    expect(() => resolveAdminSitePreviewPath("/admin/posts", ORIGIN)).toThrow(/admin/i);
    // decodes to "/admin" — closes the same decode-based bypass the '/api/' case above proves.
    expect(() => resolveAdminSitePreviewPath("/%61dmin", ORIGIN)).toThrow(/admin/i);
  });

  it("refuses '/ADMIN' and '/Admin/...' — the case-insensitivity is load-bearing, not incidental", () => {
    // Pins `isAdminAppPath`'s own `.toLowerCase()`. The pre-existing cases below are all already
    // lowercase, so dropping that call left every one of them green (mutation M1, 2026-09-15).
    expect(() => resolveAdminSitePreviewPath("/ADMIN", ORIGIN)).toThrow(/admin/i);
    expect(() => resolveAdminSitePreviewPath("/Admin/settings", ORIGIN)).toThrow(/admin/i);
    expect(() => resolveAdminSitePreviewPath("/aDmIn", ORIGIN)).toThrow(/admin/i);
  });

  it("⚠️ refuses an ENCODED-SLASH path whose decoded form denotes '/admin' or '/api/'", () => {
    // `new URL()` never decodes `%2f`, so the once-decoded pathname of `/%2fadmin` is `//admin`,
    // whose split("/") index 1 is the empty string — the shape the original first-segment read
    // scored as "not admin". Any consumer that decodes before routing resolves it to the admin app.
    // The MESSAGE is asserted, not just the class: `isAdminAppPath`'s empty-segment filter is what
    // names this "/admin" rather than letting it fall through to the later off-origin refusal. Both
    // refuse, so a class-only assertion cannot tell the two layers apart — and a mutation sweep
    // (2026-09-15, M5) confirmed dropping the filter stayed green against one.
    expect(() => resolveAdminSitePreviewPath("/%2fadmin", ORIGIN)).toThrow(/must not target '\/admin'/);
    expect(() => resolveAdminSitePreviewPath("/%2Fadmin", ORIGIN)).toThrow(/must not target '\/admin'/);
    expect(() => resolveAdminSitePreviewPath("/%2f%2fadmin", ORIGIN)).toThrow(/must not target '\/admin'/);
    expect(() => resolveAdminSitePreviewPath("/%2fapi/x", ORIGIN)).toThrow(SitePreviewPathError);
  });

  it("does NOT refuse a path that merely starts with the letters 'api' — the refusal is '/api/', not '/api'", () => {
    // Sibling of the '/administer-survey' case below, for the OTHER refused prefix. Without this,
    // widening `startsWith("/api/")` to `startsWith("/api")` stays green (mutation sweep M8) and
    // silently makes every page slugged `api-…` unshowable.
    expect(resolveAdminSitePreviewPath("/apifoo", ORIGIN)).toBe("/apifoo");
    expect(resolveAdminSitePreviewPath("/api-docs", ORIGIN)).toBe("/api-docs");
  });

  it("⚠️ refuses a traversal that only becomes one AFTER the single decode", () => {
    // `%2e%2e%2fadmin` is one segment, so neither the raw `..` scan nor `new URL()`'s own
    // double-dot collapsing sees it; only re-resolving the DECODED `/../admin` does.
    expect(() => resolveAdminSitePreviewPath("/%2e%2e%2fadmin", ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath("/%2E%2E%2Fadmin", ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath("/a/..%2fadmin", ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath("/a/%252e%252e/admin", ORIGIN)).toThrow(SitePreviewPathError);
    expect(() => resolveAdminSitePreviewPath("/admin%20", ORIGIN)).toThrow(/admin/i);
  });

  it("the decode-and-re-resolve pass refuses nothing an ordinary published path needs", () => {
    // The refusals above are additive; these are the shapes a real site slug actually takes, and
    // every one of them must survive the second resolve untouched.
    expect(resolveAdminSitePreviewPath("/blog/hello%20world", ORIGIN)).toBe("/blog/hello%20world");
    expect(resolveAdminSitePreviewPath("/blog/caf%C3%A9", ORIGIN)).toBe("/blog/caf%C3%A9");
    expect(resolveAdminSitePreviewPath("/blog/100%25-off", ORIGIN)).toBe("/blog/100%25-off");
    expect(resolveAdminSitePreviewPath("/search?q=admin", ORIGIN)).toBe("/search?q=admin");
    expect(resolveAdminSitePreviewPath("/blog/admin", ORIGIN)).toBe("/blog/admin");
    expect(resolveAdminSitePreviewPath("/docs/api/overview", ORIGIN)).toBe("/docs/api/overview");
  });

  it("does NOT refuse a path that merely CONTAINS 'admin' as a sibling segment or substring", () => {
    // '/administer-survey' shares no path segment with '/admin' — must not be caught by a naive
    // prefix check that forgets the trailing-slash/exact-match boundary.
    expect(resolveAdminSitePreviewPath("/administer-survey", ORIGIN)).toBe("/administer-survey");
  });

  it("a rejection names the rule so a model can fix the input in one turn", () => {
    expect(() => resolveAdminSitePreviewPath("/admin/settings", ORIGIN)).toThrow(SitePreviewPathError);
    try {
      resolveAdminSitePreviewPath("/admin/settings", ORIGIN);
      throw new Error("expected resolveAdminSitePreviewPath to throw");
    } catch (error) {
      expect((error as Error).message).toMatch(/admin/i);
      expect((error as Error).name).toBe("SitePreviewPathError");
    }
  });
});
