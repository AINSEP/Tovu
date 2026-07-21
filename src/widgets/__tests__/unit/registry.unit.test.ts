import assert from "node:assert/strict";
import test from "node:test";

import { WIDGET_TYPE_REGISTRATIONS, getWidgetTypeRegistration } from "../../registry";

/**
 * @file C-002 the v1 widget-type registry — SPEC-043 REQ-07/08/09/10.
 * Unlike the other test files in this suite, `registry.ts` is real, working
 * data (not a stub) — these tests are expected to be GREEN, proving the
 * registration/behavior split (ADR-047 Debate Fold-In Amendment 3) holds at
 * the data layer before any resolver behavior is implemented.
 */

test("REQ-09: registers exactly the five v1 widget types", () => {
  const keys = WIDGET_TYPE_REGISTRATIONS.map((r) => r.typeKey).sort();
  assert.deepEqual(keys, ["contact-form", "menu", "recent-entries", "social-links", "text"]);
});

test("REQ-10: static-capability types (text, social-links) declare no resolverId", () => {
  const text = getWidgetTypeRegistration("text");
  const socialLinks = getWidgetTypeRegistration("social-links");
  assert.equal(text?.capability, "static");
  assert.equal(text?.resolverId, undefined);
  assert.equal(socialLinks?.capability, "static");
  assert.equal(socialLinks?.resolverId, undefined);
});

test("REQ-08: every dynamic (non-static) type's resolverId is a plain string, never a function or module reference", () => {
  const dynamic = WIDGET_TYPE_REGISTRATIONS.filter((r) => r.capability !== "static");
  assert.ok(dynamic.length > 0, "expected at least one dynamic type");
  for (const registration of dynamic) {
    assert.equal(typeof registration.resolverId, "string");
    assert.ok(registration.resolverId!.length > 0);
  }
});

test("REQ-25: recent-entries declares a maxItems clamp at the registration level (defense in depth with the orchestrator's own enforcement)", () => {
  const recentEntries = getWidgetTypeRegistration("recent-entries");
  assert.equal(recentEntries?.clamps.maxItems, 20);
});

test("REQ-03: getWidgetTypeRegistration returns undefined for an unregistered type key", () => {
  // @ts-expect-error — deliberately passing an unregistered key to prove the runtime behavior,
  // not just the type system, rejects it.
  const result = getWidgetTypeRegistration("carousel");
  assert.equal(result, undefined);
});

test("Amendment 3: registration data contains zero executable behavior — every configSchema is JSON-serializable", () => {
  for (const registration of WIDGET_TYPE_REGISTRATIONS) {
    // A registration record must survive a JSON round-trip unchanged in shape — proof it carries
    // no function, closure, or non-serializable value anywhere in its declared schema.
    const roundTripped = JSON.parse(JSON.stringify(registration.configSchema));
    assert.deepEqual(roundTripped, registration.configSchema);
  }
});
