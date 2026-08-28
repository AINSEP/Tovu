import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file SPEC-022 W-003/W-004 — real call-site characterization (INV-06, AC-16/17).
 *
 * Rather than reconstructing `MembersWriteServiceDeps`/`RegisterFormNotifySubscriberDeps`
 * (both non-trivial fake-dependency graphs, and the exact public export shape of
 * `write-service.ts`'s sign-in-link flow is intentionally not re-derived here to avoid
 * asserting on an implementation detail this suite doesn't own), this test verifies the two
 * real call sites' actual send-options construction directly against source — the same
 * verification method Fable's second debate pass used to find the original defect
 * (`grep`-confirmed `purpose: "transactional"` at both `write-service.ts:183` and
 * `notify-subscriber.ts:78`). Post-fix, both must use the new discriminating field with the
 * CORRECT, DISTINCT lane value — this is a real regression guard on the actual defect, not a
 * synthetic stand-in for it.
 */

const MEMBERS_WRITE_SERVICE = fs.readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", "..", "features", "members", "write-service.ts"),
  "utf8"
);
const FORMS_NOTIFY_SUBSCRIBER = fs.readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", "..", "features", "forms", "notify-subscriber.ts"),
  "utf8"
);

test("AC-16 (pre-fix collision, historical regression guard): both call sites must NOT both still use bare purpose:\"transactional\" with no other discriminator", () => {
  // This is the exact pre-fix shape Fable verified in the ADR-046 debate. If both files still
  // contain this literal pattern with nothing else distinguishing them, REQ-09 has not shipped.
  const membersHasBareTransactional = /purpose:\s*["']transactional["']/.test(MEMBERS_WRITE_SERVICE);
  const formsHasBareTransactional = /purpose:\s*["']transactional["']/.test(FORMS_NOTIFY_SUBSCRIBER);

  // At least one of the two files must have moved off the bare, collision-prone shape once
  // REQ-09 ships (the discriminating field may supplement rather than replace `purpose`,
  // per the Implementation Outline's C-005 contract — "widened", not necessarily removed).
  assert.ok(
    !(membersHasBareTransactional && formsHasBareTransactional && !MEMBERS_WRITE_SERVICE.includes("lane") && !FORMS_NOTIFY_SUBSCRIBER.includes("lane")),
    "both members and forms still construct an indistinguishable send-options shape — REQ-09's vocabulary split has not been applied"
  );
});

test("AC-17: members' sign-in-link send resolves to the interactive lane", () => {
  assert.ok(
    /lane:\s*["']interactive["']/.test(MEMBERS_WRITE_SERVICE),
    "members/write-service.ts's mailer send must tag its send options with lane: \"interactive\" (or the Programmer-chosen equivalent discriminating field/value — update this test's regex to match if the exact field/value name differs from the Implementation Outline's placeholder)"
  );
});

test("AC-17: forms' notification send resolves to the notification lane", () => {
  assert.ok(
    /lane:\s*["']notification["']/.test(FORMS_NOTIFY_SUBSCRIBER),
    "forms/notify-subscriber.ts's mailer send must tag its send options with lane: \"notification\" (or the Programmer-chosen equivalent discriminating field/value)"
  );
});

test("INV-06 characterization: members' send call site still awaits deps.mailer.send(...) synchronously (no behavior change beyond the new field)", () => {
  assert.ok(
    /await\s+deps\.mailer\.send\(/.test(MEMBERS_WRITE_SERVICE),
    "the synchronous, result-unobserved send pattern (the interactive lane's defining characteristic, per the ADR-046 debate's finding) must be preserved, not replaced with queueing/deferral logic"
  );
});
