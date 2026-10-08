import { POLICY_CONFIRMATION_TOOL_IDS } from "../../contracts/headless/assistant-tool-approval-policy.js";
/**
 * @file Structural guard for `MCP_UI_REDEEMABLE_TOOL_IDS` (2026-09-24 unwired-sink sweep).
 *
 * A tool that opens a `SurfaceExchangeStore` exchange parks until the human's click arrives at
 * `POST /api/admin/v1/mcp-ui/tool-calls`, and that endpoint refuses every tool id not on the
 * allowlist. Five tools shipped with a working dialog whose every click 403'd, the latest at the time
 * being `publish_content_publish` (43b80a2ed) — since deleted along with the tool itself
 * (`ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S4) — because the
 * allowlist is maintained by hand in a different file from the tool. The per-id tests in
 * `mcp-ui-tool-calls.test.ts` only cover ids someone remembered to add. This test scans the source
 * for every `surfaceExchanges.open(...)` call instead, resolves its `toolId` constant, and requires
 * the id on the allowlist — and, conversely, requires every allowlisted id to be either an exchange
 * opener or a named carve-out.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

import { MCP_UI_REDEEMABLE_TOOL_IDS } from "../mcp-ui-tool-calls.js";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Exchanges whose answer arrives on the A2UI action route (`a2ui-actions-route.ts`), not the
 *  MCP-UI tool-calls endpoint, so they need no allowlist entry. */
const A2UI_EXCHANGE_TOOL_IDS = new Set(["assistant_render_ui", "assistant_demo_a2ui"]);

/** Permanent-delete handlers iterate a static catalog and pass a parameterised toolId to
 * requireHumanConfirm. Their real exchange/handler tests exercise every id, including bypasses. */
const PARAMETERISED_EXCHANGE_TOOL_IDS = new Set<string>([
  ...POLICY_CONFIRMATION_TOOL_IDS,
  // The host binds this synthetic ID through tool-recovery-preset.ts; Jini opens the exchange.
  "assistant_tool_failure_recovery",
  // Settings shares a confirmWrite adapter for the set/clear handlers; the behavioral tests
  // exercise both IDs with the real exchange store, including wrong-binding and typed answers.
  "assistant_ask_choice", "settings_set_value", "settings_clear_value",
  "trash_empty", "trash_purge_item", "media_purge_asset", "comments_purge_comment",
  "identity_user_delete", "external_mcp_delete", "custom_credential_delete",
  "deployment_delete_provider_credential", "source_control_delete_credential",
  // Newsletter's shared confirmation helper receives the ID from the tested caller.
  "newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign",
]);

/** Allowlisted without opening an exchange — see `mcp-ui-tool-calls.ts` for each justification. */
const NON_EXCHANGE_CARVE_OUTS = new Set(["content_post_search"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

interface ExchangeScan {
  /** Resolved tool ids, one per `surfaceExchanges.open(...)` call with a named constant. */
  readonly toolIds: ReadonlySet<string>;
  /** `file: CONSTANT` for every call whose `toolId` could not be resolved to a string literal. */
  readonly unresolved: readonly string[];
}

// These exact dynamic expressions are adapters for handlers tested through real exchanges.
// New unresolved expressions fail closed, including in these same files.
const DYNAMIC_BINDINGS = new Map<string, ReadonlySet<string>>([
  ["contracts/core/human-confirm.ts", new Set(["toolId", "description"])],
  ["assistant/external-mcp-call-confirmation.ts", new Set(["actionConfirmSpec(spec, context.approvalRequest)"])],
  ["assistant/tool-approval-policy.ts", new Set(["toolId", "description"])],
  ["assistant/ask-choice-tool.ts", new Set(["toolId"])],
  ["features/settings/tool-registrations.ts", new Set(["toolId"])],
  ["features/identity/tool-registrations.ts", new Set(["registration.descriptor.id"])],
  ["features/permanent-delete/tool-registrations.ts", new Set(["toolId", "spec.name"])],
  ["features/database-transfer/tool-registrations.ts", new Set(["binding", "describeTransferApproval({ plan })"])],
]);

function scanExchangeTexts(texts: readonly { file: string; text: string }[]): ExchangeScan {
  const sources = texts.map(({ file, text }) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  const constants = new Map<string, ts.Expression>();
  const walk = (node: ts.Node, visit: (node: ts.Node) => void) => {
    visit(node);
    ts.forEachChild(node, (child) => walk(child, visit));
  };
  for (const source of sources) walk(source, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
  });
  const unparen = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? unparen(node.expression) : node;
  const resolve = (node: ts.Expression, seen = new Set<string>()): string | undefined => {
    node = unparen(node);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const value = constants.get(node.text);
      if (value) return resolve(value, new Set([...seen, node.text]));
    }
    return undefined;
  };
  const property = (node: ts.Expression | undefined, name: string): ts.Expression | undefined => {
    if (!node || !ts.isObjectLiteralExpression(unparen(node))) return undefined;
    for (const prop of (unparen(node) as ts.ObjectLiteralExpression).properties) {
      if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) && prop.name.text === name) {
        if (ts.isPropertyAssignment(prop)) return prop.initializer;
        if (ts.isShorthandPropertyAssignment(prop)) return prop.name;
      }
    }
    return undefined;
  };
  const toolIds = new Set<string>();
  const unresolved: string[] = [];
  for (const source of sources) {
    const relative = path.relative(SRC_ROOT, source.fileName);
    const record = (spec: ts.Expression | undefined, node: ts.Node) => {
      const value = property(spec, "toolId") ?? spec;
      const id = value && resolve(value);
      if (id) toolIds.add(id);
      else if (!value || !DYNAMIC_BINDINGS.get(relative)?.has(value.getText(source))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        unresolved.push(`${relative}:${line}: ${value?.getText(source) ?? "missing argument"}`);
      } else {
        // The host adapters delegate these registered IDs to Jini rather than declaring a literal binding.
        if (relative === "assistant/ask-choice-tool.ts") toolIds.add("assistant_ask_choice");
        if (relative === "features/database-transfer/tool-registrations.ts") {
          toolIds.add("database_transfer_set_destination");
          toolIds.add("database_transfer_run");
        }
      }
    };
    walk(source, (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "open") {
          // SecretSealer.open is the other .open API in this tree; its payload is not a binding.
          // The AES-GCM host adapter forwards its typed input unchanged. Exempt only that exact
          // delegation, not other unresolved calls in the file or a receiver named "sealer".
          const isSealerDelegation = relative === "features/webhooks/secret-sealer.aesgcm.ts"
            && node.getText(source) === "this.sealer.open(input, optional)";
          if (!isSealerDelegation && !property(node.arguments[0], "sealed")) record(property(node.arguments[0], "binding") ?? node.arguments[0], node);
        } else if (ts.isIdentifier(callee) && callee.text === "requireHumanConfirm") {
          record(property(node.arguments[0], "spec") ?? node.arguments[2], node);
        } else if (ts.isIdentifier(callee) && callee.text === "defineSecretCardTool") {
          // Jini opens the exchange for this spec; enumerate its binding rather than exempting it.
          record(node.arguments[0], node);
        }
      }
      // approvalToolHandler moved the host dialog facts to `describe`; Jini opens the exchange.
      // Inspect its inline object contract just like the existing plan handler's `dialog` contract.
      const isApprovalDescription = ts.isPropertyAssignment(node) && node.name.getText(source) === "describe"
        && ts.isObjectLiteralExpression(node.parent) && ts.isCallExpression(node.parent.parent)
        && ts.isIdentifier(node.parent.parent.expression) && node.parent.parent.expression.text === "approvalToolHandler"
        && ts.isArrowFunction(node.initializer) && !ts.isBlock(node.initializer.body)
        && ts.isObjectLiteralExpression(unparen(node.initializer.body));
      if (ts.isPropertyAssignment(node) && (node.name.getText(source) === "dialog" || isApprovalDescription) && ts.isArrowFunction(node.initializer)) {
        const body = node.initializer.body;
        if (ts.isBlock(body)) {
          const returned = body.statements.find(ts.isReturnStatement);
          record(returned?.expression, node);
        } else record(body, node);
      }
    });
  }
  return { toolIds, unresolved };
}

function scanExchangeOpeners(files: readonly string[]): ExchangeScan {
  return scanExchangeTexts(files.map((file) => ({ file, text: readFileSync(file, "utf8") })));
}

// F5.6: the scanner must see alternate receivers, literals, shorthand and reordered fields.
test("the parser enumerates alternate opener shapes and reports unresolved bindings", () => {
  const fixture = scanExchangeTexts([{ file: path.join(SRC_ROOT, "fixture.ts"), text: `
    const TOOL = "literal_tool";
    const toolId = "shorthand_tool";
    store.open({ binding: { principalId: "p", toolId: TOOL }, emit });
    anotherStore.open({ emit, binding: { principalId: "p", toolId: "inline_tool" } });
    store.open({ binding: { toolId, principalId: "p" }, emit });
    defineSecretCardTool({ toolId: "secret_tool", prepare, form, save });
    approvalToolHandler({ describe: () => ({ toolId: "approval_tool" }), prepare, run });
    approvalToolHandler({ describe: () => ({ toolId: unknownApprovalId }), prepare, run });
    store.open({ binding, emit });
    store.open({ binding: { principalId: "p", toolId: unknownId }, emit });
  ` }]);
  assert.deepEqual([...fixture.toolIds].sort(), ["approval_tool", "inline_tool", "literal_tool", "secret_tool", "shorthand_tool"]);
  assert.equal(fixture.unresolved.length, 3);
  assert.match(fixture.unresolved[0]!, /unknownApprovalId$/);
  assert.match(fixture.unresolved[1]!, /binding$/);
  assert.match(fixture.unresolved[2]!, /unknownId$/);
});

test("the federated card adapter permits only its reviewed dynamic spec expression", () => {
  const fixture = scanExchangeTexts([{ file: path.join(SRC_ROOT, "assistant/external-mcp-call-confirmation.ts"), text: `
    requireHumanConfirm({ ctx, surfaces, spec: actionConfirmSpec(spec, context.approvalRequest) });
    requireHumanConfirm({ ctx, surfaces, spec: actionConfirmSpec(otherSpec, context.approvalRequest) });
  ` }]);
  assert.deepEqual(fixture.unresolved, [
    "assistant/external-mcp-call-confirmation.ts:3: actionConfirmSpec(otherSpec, context.approvalRequest)",
  ]);
});

test("the sealer adapter exemption leaves other unresolved open calls visible", () => {
  const fixture = scanExchangeTexts([{ file: path.join(SRC_ROOT, "features/webhooks/secret-sealer.aesgcm.ts"), text: `
    this.sealer.open(input, optional);
    this.sealer.open(otherInput, optional);
    store.open({ binding, emit });
  ` }, { file: path.join(SRC_ROOT, "fixture.ts"), text: `
    this.sealer.open(input, optional);
  ` }]);
  assert.deepEqual(fixture.unresolved, [
    "features/webhooks/secret-sealer.aesgcm.ts:3: otherInput",
    "features/webhooks/secret-sealer.aesgcm.ts:4: binding",
    "fixture.ts:2: input",
  ]);
});

function missingFromAllowlist(openers: ReadonlySet<string>, allowlist: ReadonlySet<string>): string[] {
  return [...new Set([...openers, ...PARAMETERISED_EXCHANGE_TOOL_IDS])]
    .filter((id) => !A2UI_EXCHANGE_TOOL_IDS.has(id) && !allowlist.has(id))
    .sort();
}

const scan = scanExchangeOpeners(sourceFiles(SRC_ROOT));

test("every surfaceExchanges.open(...) call names a toolId constant this scan can resolve", () => {
  assert.deepEqual(scan.unresolved, []);
});

test("the scan finds the known exchange openers (guards against a scan that silently matches nothing)", () => {
  for (const id of [
    // Keep the sentinel on a live host opener while credential_save replaces the save tools.
    "webhooks_delete_subscription",
    "assistant_ask_choice",
    "credential_save",
    "external_mcp_save",
    "identity_user_create",
    "database_transfer_set_destination",
    "assistant_render_ui",
    // Through `humanConfirmedToolHandler`'s `dialog:` spec, not a direct call.
    "taxonomy_execute_merge_term",
    "database_execute_migrate_forward",
    "backup_execute_restore",
  ]) {
    assert.ok(scan.toolIds.has(id), `expected the scan to find '${id}'`);
  }
});

test("every tool that opens an MCP-UI exchange is on MCP_UI_REDEEMABLE_TOOL_IDS", () => {
  assert.deepEqual(missingFromAllowlist(scan.toolIds, MCP_UI_REDEEMABLE_TOOL_IDS), []);
});

test("the completeness check reports a tool whose allowlist entry is missing", () => {
  const withoutDelete = new Set([...MCP_UI_REDEEMABLE_TOOL_IDS].filter((id) => id !== "webhooks_delete_subscription"));
  assert.deepEqual(missingFromAllowlist(scan.toolIds, withoutDelete), ["webhooks_delete_subscription"]);
});

test("every allowlisted id opens an exchange or is a named carve-out", () => {
  const unexplained = [...MCP_UI_REDEEMABLE_TOOL_IDS]
    .filter((id) => !scan.toolIds.has(id) && !PARAMETERISED_EXCHANGE_TOOL_IDS.has(id) && !NON_EXCHANGE_CARVE_OUTS.has(id))
    .sort();
  assert.deepEqual(unexplained, []);
});
