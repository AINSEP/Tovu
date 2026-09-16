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
