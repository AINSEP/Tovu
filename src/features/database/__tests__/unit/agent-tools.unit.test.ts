import assert from "node:assert/strict";
import test from "node:test";

import { getDatabaseAgentToolCatalog } from "../../agent-tools.js";

/**
 * @file SPEC-017 C-110 / REQ-20–REQ-23 / AC-24 / AC-25 / AC-28 / AC-33 — the Database domain's
 * agent-tool catalog, instantiating SPEC-016 REQ-22's naming/callability convention.
 *
 * Assumed seam design:
 *
 * ```ts
 * export interface AgentToolDefinition {
 *   name: string; sideEffects: "none" | "mutates-durable-state" | "mints-token";
 *   authorization: { permission: string };
 *   actorClassRule?: "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";
 * }
 * export function getDatabaseAgentToolCatalog(required?: {}, optional?: {}): AgentToolDefinition[];
 * ```
 */

test("AC-24 / REQ-20: every read tool in the catalog requires only 'database.read'", () => {
  const catalog = getDatabaseAgentToolCatalog();
  const readTools = catalog.filter((t) => t.sideEffects === "none");

  assert.ok(readTools.length >= 5, "REQ-20 names five free-read tools");
  for (const tool of readTools) {
    assert.equal(tool.authorization.permission, "database.read");
  }
});

test("AC-25 / REQ-21: the catalog contains a plan tool and an execute tool, both agent-callable, and no confirm-equivalent tool", () => {
  const catalog = getDatabaseAgentToolCatalog();
  const names = catalog.map((t) => t.name);

  assert.ok(names.some((n) => /plan.*migrate.forward/i.test(n)), "a plan tool must exist");
  assert.ok(names.some((n) => /execute.*migrate.forward/i.test(n)), "an execute tool must exist");
  assert.ok(!names.some((n) => /confirm/i.test(n)), "no confirm-equivalent tool may ever exist in the catalog");
});

test("AC-33 / REQ-25: no tool in the catalog exposes the Tier-3 browser (tier3ReadRows/describeTables are never agent-callable)", () => {
  const catalog = getDatabaseAgentToolCatalog();
  const names = catalog.map((t) => t.name);

  assert.ok(!names.some((n) => /tier3|read_rows|describe_tables/i.test(n)), "the Tier-3 browser must never appear in the agent-tool catalog");
});

test("AC-28 / REQ-23: an agent seeking to trigger a restore only finds a guidance tool (database_get_restore_guidance), never a lever that executes a restore itself", () => {
  const catalog = getDatabaseAgentToolCatalog();
  const guidanceTool = catalog.find((t) => /restore.guidance/i.test(t.name));

  assert.ok(guidanceTool, "a guidance tool must exist for the rollback hand-off");
  assert.equal(guidanceTool?.sideEffects, "none", "the guidance tool must never itself mutate state or execute a restore");
});

test("the execute tool carries actorClassRule='confirmer-must-equal-own-delegatedBy' per SPEC-016 REQ-13/REQ-22", () => {
  const catalog = getDatabaseAgentToolCatalog();
  const executeTool = catalog.find((t) => /execute.*migrate.forward/i.test(t.name));

  assert.ok(executeTool);
  assert.equal(executeTool?.actorClassRule, "confirmer-must-equal-own-delegatedBy");
});
