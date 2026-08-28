import assert from "node:assert/strict";
import test from "node:test";

import { CAPABILITY_INVENTORY, findCapabilityEntry } from "../../runtime/configuration/capability-inventory.js";

/**
 * @file SPEC-022 C-002 — the checked-in capability inventory (REQ-01, REQ-06, AC-01/02/11).
 *
 * The inventory is a typed TS module (OQ-01 resolution) so TypeScript itself enforces field
 * completeness; these tests assert the *content*, which the type system can't check.
 */

const REQUIRED_FIELDS = [
  "name",
  "ownerModule",
  "classification",
  "sourceOfTruth",
  "readinessDependencies",
  "startupCriticality",
  "securityDependencies",
  "restartTestOwner",
] as const;

test("AC-01: every inventory entry has all required fields populated (no blank/undefined)", () => {
  assert.ok(CAPABILITY_INVENTORY.length > 0, "inventory must not be empty");
  for (const entry of CAPABILITY_INVENTORY) {
    for (const field of REQUIRED_FIELDS) {
      const value = (entry as Record<string, unknown>)[field];
      assert.notEqual(value, undefined, `${entry.name}.${field} must not be undefined`);
      if (typeof value === "string") {
        assert.notEqual(value.trim(), "", `${entry.name}.${field} must not be blank`);
      }
    }
  }
});

test("AC-11/REQ-06: every capability named in ADR-046's Context as currently in-memory is classified", () => {
  const mustBeClassified = [
    "outbox",
    "change-sets",
    "members",
    "webhooks",
    "origin",
    "media",
    "analytics",
  ];
  for (const name of mustBeClassified) {
    const entry = findCapabilityEntry(name);
    assert.ok(entry, `capability "${name}" must have an inventory entry`);
    assert.ok(
      entry!.classification === "production" || entry!.classification === "local-only" || entry!.classification === "experimental",
      `capability "${name}" must have a valid classification, got ${entry?.classification}`
    );
  }
});

test("AC-02/EC-01: an entry with an ambiguous owner documents the ambiguity explicitly rather than guessing", () => {
  const ambiguous = CAPABILITY_INVENTORY.filter((e) => e.ownerAmbiguous === true);
  for (const entry of ambiguous) {
    assert.ok(
      entry.ownerModule.length > 0 && entry.ownerModule.toLowerCase() !== "unknown",
      `${entry.name}: ownerAmbiguous=true entries must still document a best-effort owner + note, not "unknown"`
    );
    assert.ok(entry.ambiguityNote && entry.ambiguityNote.length > 0, `${entry.name}: ownerAmbiguous=true requires an explicit ambiguityNote`);
  }
});

test("findCapabilityEntry returns undefined (not a thrown error) for an unknown capability name", () => {
  assert.equal(findCapabilityEntry("this-capability-does-not-exist"), undefined);
});

test("no duplicate capability names in the inventory", () => {
  const names = CAPABILITY_INVENTORY.map((e) => e.name);
  assert.equal(new Set(names).size, names.length, "inventory must not contain duplicate capability names");
});
