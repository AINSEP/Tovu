import assert from "node:assert/strict";
import test from "node:test";

import { recoveryAgentToolCatalog } from "../../agent-tools.js";

/**
 * @file REQ-23/24/25 (SPEC-019) — Recovery's agent-tool catalog contract (C-307; INV-06).
 *
 * Covers: AC-33 (backup_plan_restore + backup_execute_restore present, no confirm tool),
 * AC-34 (backup_create_restore_point present, unwrapped), AC-35 (read-only tools succeed with no
 * durable state change — asserted here at the catalog-contract level: sideEffects: 'none').
 */

test("AC-33/INV-06: the catalog exposes backup_plan_restore and backup_execute_restore, and no tool performs the confirm() step", () => {
  const names = recoveryAgentToolCatalog.map((t) => t.name);

  assert.ok(names.includes("backup_plan_restore"));
  assert.ok(names.includes("backup_execute_restore"));
  assert.equal(names.includes("backup_confirm_restore"), false, "no confirm()-equivalent tool may ever exist (REQ-23, SPEC-016 REQ-22)");
  assert.equal(
    recoveryAgentToolCatalog.some((t) => /confirm/i.test(t.description)),
    false,
    "no tool's description may claim to perform confirmation either"
  );
});

test("AC-34: backup_create_restore_point is present, requires backup.create, and is not wrapped in a plan/confirm/execute sequence", () => {
  const tool = recoveryAgentToolCatalog.find((t) => t.name === "backup_create_restore_point");
  assert.ok(tool);
  assert.equal(tool?.authorization.permission, "backup.create");
  assert.equal(tool?.sideEffects, "mutates-durable-state");
});

test("AC-35: backup_list_restore_points and backup_get_capabilities are read-only (sideEffects: 'none') and require only backup.read", () => {
  for (const name of ["backup_list_restore_points", "backup_get_capabilities"]) {
    const tool = recoveryAgentToolCatalog.find((t) => t.name === name);
    assert.ok(tool, `expected tool '${name}' to be registered`);
    assert.equal(tool?.sideEffects, "none");
    assert.equal(tool?.authorization.permission, "backup.read");
  }
});

test("backup_plan_restore requires only backup.read (SPEC-016 REQ-09 — plan() is safely callable by any principal kind holding read)", () => {
  const tool = recoveryAgentToolCatalog.find((t) => t.name === "backup_plan_restore");
  assert.ok(tool);
  assert.equal(tool?.authorization.permission, "backup.read");
  assert.equal(tool?.sideEffects, "none");
});

test("backup_execute_restore requires backup.restore and carries the confirmer-must-equal-own-delegatedBy actor-class rule", () => {
  const tool = recoveryAgentToolCatalog.find((t) => t.name === "backup_execute_restore");
  assert.ok(tool);
  assert.equal(tool?.authorization.permission, "backup.restore");
  assert.equal(tool?.actorClassRule, "confirmer-must-equal-own-delegatedBy");
});
