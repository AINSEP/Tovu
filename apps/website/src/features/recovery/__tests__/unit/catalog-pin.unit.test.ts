import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { recoveryAgentToolCatalog } from "../../tool-registrations.js";

/** Pins the model-facing recovery catalog byte-for-byte, so moving or re-binding it cannot drift the wording. */
const PINNED_SHA256 = "c43f3dd6aabc998801a68b3566d48cd57796cd02b2668eaf7da26f66ba1432c6";

const EXPECTED = [
  ["backup_list_restore_points", "backup.read", "none"],
  ["backup_get_capabilities", "backup.read", "none"],
  ["backup_plan_restore", "backup.read", "none"],
  ["backup_execute_restore", "backup.restore", "mutates-durable-state"],
  ["backup_create_restore_point", "backup.create", "mutates-durable-state"],
  ["recovery_get_status", "backup.read", "none"],
  ["recovery_resolve_deep_link", "backup.read", "none"],
] as const;

test("recovery catalog: ids, permissions, side effects and order are pinned", () => {
  assert.deepEqual(recoveryAgentToolCatalog.map((t) => [t.name, t.authorization.permission, t.sideEffects]), EXPECTED.map((row) => [...row]));
});

test("recovery catalog: backup guidance names the host's backup tools, export path and restore-point read tools", () => {
  const capabilities = recoveryAgentToolCatalog.find((t) => t.name === "backup_get_capabilities");
  assert.equal(
    capabilities?.description,
    "Reports this site's restore-point cost class and mechanism kind. For private full-site repository backups, call source_control_get_capabilities to discover installed hosts (including disabled ones), then site_backup_plan → site_backup_push. Portable .tovu.zip exports are available under Admin → Sites → Export. Rendered static output commits are a separate publishing workflow.",
  );
  const plan = recoveryAgentToolCatalog.find((t) => t.name === "backup_plan_restore");
  const schema = plan?.inputSchema as { properties: { restorePointId: { description: string } } } | undefined;
  assert.equal(schema?.properties.restorePointId.description, "A restore point id, as returned by content_read.backup_restore_point or content_read.database_restore_point.");
});

test("recovery catalog: byte-identical to the pinned output", () => {
  const digest = createHash("sha256").update(JSON.stringify(recoveryAgentToolCatalog)).digest("hex");
  assert.equal(digest, PINNED_SHA256);
});
