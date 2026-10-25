import assert from "node:assert/strict";
import test from "node:test";
import type { ToolRegistration } from "@jini-ai/core";
import {
  approvalClassAsks,
  directPageAction,
  toolApprovalPolicyFor,
  withExtensionApprovalPolicy,
} from "../assistant-tool-approval-policy.js";

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

// L11 Stryker: the DIRECT_PAGE_HANDLES set (→ []), the `capabilityId !== 'page.click'` branch and the
// unknown-capability throw survived. Pin the reviewed handle set exactly and both branches.
const REVIEWED_DIRECT_PAGE_HANDLES = [
  "plugins-install-advanced", "plugins-install-folder", "plugins-install-folder-upload",
  "plugins-install-zip", "plugins-install-replace", "plugins-install-preview",
  "plugins-install-cancel", "plugins-install-confirm",
  "agent-plugin-add-choose", "agent-plugin-add-choose-folder", "agent-plugin-add-replace",
  "agent-plugin-add-install", "agent-plugin-add-url", "agent-plugin-add-from-url",
  "skills-add-github-url", "skills-add-github", "skills-add-files", "skills-add-folder",
  "skills-install-cancel", "skills-install-confirm",
];

test("every reviewed plugin-add page handle clicks directly", () => {
  for (const handle of REVIEWED_DIRECT_PAGE_HANDLES) assert.equal(directPageAction({ capabilityId: "page.click", input: { handle } }), true, handle);
});

test("look-alike and destructive page handles still ask", () => {
  for (const handle of ["plugins-install-confirm ", "Plugins-install-confirm", "plugins-install", "plugins-uninstall-confirm",
    "skills-delete-confirm", "agent-plugin-remove", "", "plugins-install-confirm\n"]) {
    assert.equal(directPageAction({ capabilityId: "page.click", input: { handle } }), false, JSON.stringify(handle));
  }
});

test("a non-click capability follows its own confirmation, ignoring any handle in the input", () => {
  assert.equal(directPageAction({ capabilityId: "content_post_search", input: {} }), true);
  assert.equal(directPageAction({ capabilityId: "content_post_search", input: { handle: "skills-delete-confirm" } }), true);
  assert.equal(directPageAction({ capabilityId: "content_post_delete", input: { handle: "plugins-install-confirm" } }), false);
  assert.equal(directPageAction({ capabilityId: "settings_set_value", input: {} }), false, "plan confirmation is not direct");
});

test("an unclassified capability, including an inherited property name, throws naming it", () => {
  for (const capabilityId of ["no_such_tool", "toString", "__proto__", "", "PAGE.CLICK"]) {
    assert.throws(() => directPageAction({ capabilityId, input: { handle: "plugins-install-confirm" } }), { message: `${capabilityId} has no approval classification` });
  }
});

test("only read, edit and trash run directly; every other or unknown class asks", () => {
  for (const actionClass of ["read", "edit", "trash"]) assert.equal(approvalClassAsks({ class: actionClass }), false, actionClass);
  for (const actionClass of ["delete", "restore-over-existing", "publish", "replace-secret", "escalation", "", "READ", "toString"]) {
    assert.equal(approvalClassAsks({ class: actionClass }), true, actionClass);
  }
});

test("an unknown extension family is refused naming the registration", () => {
  assert.throws(() => withExtensionApprovalPolicy({ registration: registration("opaque-x"), family: "toString" as never }), { message: "opaque-x has no approval classification" });
  assert.throws(() => withExtensionApprovalPolicy({ registration: registration("opaque-y"), family: "agent-plugin-admin" as never }), { message: "opaque-y has no approval classification" });
});

test("every extension family is pinned by value", async () => {
  const { EXTENSION_TOOL_APPROVAL_POLICY } = await import("../assistant-tool-approval-policy.js");
  assert.deepEqual(EXTENSION_TOOL_APPROVAL_POLICY, {
    "installed-guidance": { class: "read", confirmation: "direct" },
    "plugin-capability-result": { class: "read", confirmation: "direct" },
    "plugin-memory-read": { class: "read", confirmation: "direct" },
    "plugin-memory-write": { class: "edit", confirmation: "direct" },
    "agent-plugin-read": { class: "read", confirmation: "direct" },
    "agent-plugin-write": { class: "publish", confirmation: "policy" },
    "agent-plugin-destructive": { class: "delete", confirmation: "policy" },
  });
});

test("a descriptor with no metadata and no native row fails closed", () => {
  assert.throws(() => toolApprovalPolicyFor({ registration: registration("opaque-unclassified") }), { message: "opaque-unclassified has no approval classification" });
});
