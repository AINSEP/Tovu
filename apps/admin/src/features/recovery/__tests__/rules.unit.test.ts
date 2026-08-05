import { describe, expect, it } from "vitest";

import { categoryLabel, isAssertiveRecoveryBanner, parseDeepLinkEnvelope } from "../rules";
import type { AdminDegradedBanner } from "../../../lib/api";

/**
 * @file Pure logic for `features/recovery` — `categoryLabel`, `isAssertiveRecoveryBanner`,
 * `parseDeepLinkEnvelope`. The last of these is deliberately NOT a nullable-returning function
 * (see `rules.ts`'s own doc comment) — `"null"` and `"0"` are valid JSON that parse to a falsy
 * value, so a nullable would conflate "JSON.parse threw" with "JSON.parse succeeded with a falsy
 * result". This file pins that distinction explicitly so a future "simplify to nullable" refactor
 * breaks a test instead of breaking silently.
 */

function banner(overrides: Partial<AdminDegradedBanner> = {}): AdminDegradedBanner {
  return { kind: "cost-unavailable", accessibleText: "text", actionKind: "none", ...overrides };
}

describe("categoryLabel", () => {
  it("maps posts_pages to its human label", () => {
    expect(categoryLabel("posts_pages")).toBe("posts/pages writes");
  });

  it("maps plugin_table to its human label", () => {
    expect(categoryLabel("plugin_table")).toBe("plugin-table rows");
  });

  it("falls back to '<category> writes' for an untaught category, rather than throwing or returning undefined", () => {
    expect(categoryLabel("taxonomy_terms")).toBe("taxonomy_terms writes");
  });

  it("falls back for an empty-string category too", () => {
    expect(categoryLabel("")).toBe(" writes");
  });
});

describe("isAssertiveRecoveryBanner", () => {
  it("is assertive for migration-interrupted", () => {
    expect(isAssertiveRecoveryBanner(banner({ kind: "migration-interrupted" }))).toBe(true);
  });

  it("is assertive for pending-migration", () => {
    expect(isAssertiveRecoveryBanner(banner({ kind: "pending-migration" }))).toBe(true);
  });

  it("is polite (not assertive) for operation-in-flight", () => {
    expect(isAssertiveRecoveryBanner(banner({ kind: "operation-in-flight" }))).toBe(false);
  });

  it("is polite (not assertive) for cost-unavailable", () => {
    expect(isAssertiveRecoveryBanner(banner({ kind: "cost-unavailable" }))).toBe(false);
  });

  it("is polite (not assertive) for watermark-baseline-unavailable", () => {
    expect(isAssertiveRecoveryBanner(banner({ kind: "watermark-baseline-unavailable" }))).toBe(false);
  });
});

describe("parseDeepLinkEnvelope", () => {
  it("returns ok:true with the parsed envelope for valid JSON", () => {
    const raw = JSON.stringify({ v: 1, correlationId: "c1", siteId: "s1", ledgerEventId: null, restorePointId: "rp1", drift: "none", intent: "view", issuedAt: "2026-08-01T00:00:00.000Z" });
    const result = parseDeepLinkEnvelope(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope).toEqual(JSON.parse(raw));
    }
  });

  it("returns ok:false for unparseable JSON (the only failure mode)", () => {
    expect(parseDeepLinkEnvelope("{not json")).toEqual({ ok: false });
  });

  it("returns ok:false for an empty string", () => {
    expect(parseDeepLinkEnvelope("")).toEqual({ ok: false });
  });

  // Landmine, deliberate and disclosed (rules.ts's own doc comment): `"null"` is valid JSON that
  // parses to a falsy value (`null`). A nullable-returning version of this function could not
  // distinguish "the stored envelope is the literal value null" from "JSON.parse threw" — both
  // would look like "no envelope". The discriminated ok:true/ok:false result keeps them apart:
  // JSON.parse succeeds here, so this MUST be ok:true, even though the parsed value itself is
  // falsy.
  it("LANDMINE: 'null' is valid JSON — returns ok:true with envelope:null, not ok:false", () => {
    const result = parseDeepLinkEnvelope("null");
    expect(result).toEqual({ ok: true, envelope: null });
  });

  // Same landmine, second falsy-but-valid case named explicitly in the doc comment.
  it("LANDMINE: '0' is valid JSON — returns ok:true with envelope:0, not ok:false", () => {
    const result = parseDeepLinkEnvelope("0");
    expect(result).toEqual({ ok: true, envelope: 0 });
  });

  it("LANDMINE: 'false' is valid JSON — returns ok:true with envelope:false, not ok:false", () => {
    const result = parseDeepLinkEnvelope("false");
    expect(result).toEqual({ ok: true, envelope: false });
  });
});
