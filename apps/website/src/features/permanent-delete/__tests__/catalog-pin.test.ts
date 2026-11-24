import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PERMANENT_DELETE_SPECS, permanentDeleteAgentToolCatalog } from "../tool-registrations.js";
import type { PermanentDeleteToolId } from "@jini-ai/cms/trash/permanent/agent-tools";

/** Pins the model-facing permanent-delete catalog byte-for-byte, so moving or re-binding it cannot drift the wording. */
const PINNED_SHA256 = "c702b9e25ab3ac7d1fbbb7a097be4c1177e93e9d13dd11f5d96b85e5f1370cd7";

const EXPECTED = [
  ["trash_empty", "content.read"],
  ["trash_purge_item", "content.read"],
  ["media_purge_asset", "media.delete.force"],
  ["comments_purge_comment", "comments.delete.force"],
  ["identity_user_delete", "user.manage"],
  ["external_mcp_delete", "admin.integrations.manage"],
  ["custom_credential_delete", "custom-credentials.write"],
  ["deployment_delete_provider_credential", "system.publish"],
  ["source_control_delete_credential", "source-control.credentials.write"],
] as const;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** Type-level pin: the tool id stays a literal union, not `string`. */
const ID_UNION_IS_LITERAL: Equal<PermanentDeleteToolId, (typeof EXPECTED)[number][0]> = true;

test("permanent-delete catalog: ids, permissions and order are pinned", () => {
  assert.equal(ID_UNION_IS_LITERAL, true);
  assert.deepEqual(PERMANENT_DELETE_SPECS.map((s) => [s.name, s.permission]), EXPECTED.map(([n, p]) => [n, p]));
  assert.deepEqual(permanentDeleteAgentToolCatalog.map((t) => [t.name, t.authorization.permission]), EXPECTED.map(([n, p]) => [n, p]));
});

test("permanent-delete catalog: custom credential guidance names the host read tool", () => {
  const spec = PERMANENT_DELETE_SPECS.find((s) => s.name === "custom_credential_delete");
  assert.equal(spec?.guidance, "Use the saved id from content_read.custom_credential. Removes only the saved credential; it does not revoke the key at the provider or change the assistant's own model credential.");
  const tool = permanentDeleteAgentToolCatalog.find((t) => t.name === "custom_credential_delete");
  assert.ok(tool?.description.includes("Use the saved id from content_read.custom_credential. "));
});

test("permanent-delete catalog: specs and catalog are byte-identical to the pinned output", () => {
  const digest = createHash("sha256").update(JSON.stringify({ specs: PERMANENT_DELETE_SPECS, catalog: permanentDeleteAgentToolCatalog })).digest("hex");
  assert.equal(digest, PINNED_SHA256);
});
