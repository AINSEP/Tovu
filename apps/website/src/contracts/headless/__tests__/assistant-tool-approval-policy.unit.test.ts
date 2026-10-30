import assert from "node:assert/strict";
import test from "node:test";
import type { ToolRegistration } from "@jini-ai/core";
import { approvalClassAsks, directPageAction, toolApprovalPolicyFor, withExtensionApprovalPolicy } from "../../../assistant/assistant-tool-approval-policy.js";

function registration(id: string, metadata?: ToolRegistration["descriptor"]["metadata"]): ToolRegistration {
  return { descriptor: { id, inputSchema: { type: "object" }, ...(metadata === undefined ? {} : { metadata }) },
    handler: async () => ({}), policy: { authorize: () => "allow" } };
}

test("page clicks with missing or malformed handles require approval", () => {
  for (const input of [undefined, null, false, 0, "plugins-install-confirm", {}, { handle: 3 }, { handle: "unknown" }]) {
    assert.equal(directPageAction({ capabilityId: "page.click", input }, {}), false);
  }
});

test("a declared non-direct capability still requires approval", () => {
  assert.equal(directPageAction({ capabilityId: "publish_content_publish", input: {} }), false);
});

test("descriptor policy takes precedence over a native tool's default policy", () => {
  const approval = { class: "publish", confirmation: "policy" } as const;
  assert.deepEqual(toolApprovalPolicyFor({ registration: registration("page.fill", { approval }) }, {}), approval);
});

test("a metadata object without an approval falls back to native classification", () => {
  assert.deepEqual(toolApprovalPolicyFor({ registration: registration("page.fill", {}) }), {
    class: "edit", confirmation: "direct",
  });
});

test("an unclassified descriptor with metadata still fails closed", () => {
  assert.throws(() => toolApprovalPolicyFor({ registration: registration("toString", {}) }),
    { message: "toString has no approval classification" });
});

test("extension classification preserves unrelated metadata without mutating the registration", () => {
  const original = registration("opaque-result", { search: { keywords: "Kept" } });
  const classified = withExtensionApprovalPolicy({ registration: original, family: "plugin-capability-result" }, {});
  assert.deepEqual(classified.descriptor.metadata, { search: { keywords: "Kept" }, approval: { class: "read", confirmation: "direct" } });
  assert.deepEqual(original.descriptor.metadata, { search: { keywords: "Kept" } });
  assert.equal(classified.handler, original.handler);
  assert.equal(classified.policy, original.policy);
});

test("an extension descriptor with no metadata receives its family's classification", () => {
  const classified = withExtensionApprovalPolicy({ registration: registration("opaque-write"), family: "plugin-memory-write" });
  const policy = toolApprovalPolicyFor({ registration: classified });
  assert.deepEqual(policy, { class: "edit", confirmation: "direct" });
  assert.equal(approvalClassAsks({ class: policy.class }, {}), false);
});

// Executable Agent Plugin tools act on an external account: the declared effect only adds friction.
for (const [family, expected, asks] of [
  ["agent-plugin-read", { class: "read", confirmation: "direct" }, false],
  ["agent-plugin-write", { class: "publish", confirmation: "policy" }, true],
  ["agent-plugin-destructive", { class: "delete", confirmation: "policy" }, true],
] as const) {
  test(`an executable plugin tool in family ${family} is classified ${expected.class}/${expected.confirmation}`, () => {
    const policy = toolApprovalPolicyFor({ registration: withExtensionApprovalPolicy({ registration: registration("p_acme_office__tool"), family }) });
    assert.deepEqual(policy, expected);
    assert.equal(approvalClassAsks({ class: policy.class }, {}), asks);
  });
}
