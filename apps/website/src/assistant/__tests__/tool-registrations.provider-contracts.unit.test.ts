import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import type { AssistantToolRegistryDeps } from "../tool-registrations.js";
import type { RouteDeps } from "../../server/routes/types.js";

type ProviderFields = "providerConfig" | "reapplyProvider" | "projectKeys" | "providerAppliesAt";

// Pick must compile: the catalog's contributor callbacks receive AssistantToolRegistryDeps.
// The HTTP composition root's existing ports must satisfy that same narrow contract.
function providerPorts(required: Pick<RouteDeps, ProviderFields>, _optional = {}): Pick<AssistantToolRegistryDeps, ProviderFields> {
  return required;
}

test("the assistant registry declares the provider ports consumed by the tool catalog", () => {
  // Node's tsx runner erases types: also pin this type-only repair at runtime without booting tools.
  const source = ts.createSourceFile("tool-registrations.ts",
    readFileSync(new URL("../tool-registrations.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const registry = source.statements.find(statement => ts.isTypeAliasDeclaration(statement)
    && statement.name.text === "AssistantToolRegistryDeps");
  assert.ok(registry);
  const declaredFields = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node)) declaredFields.add(node.name.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(registry);
  for (const field of ["providerConfig", "reapplyProvider", "projectKeys", "providerAppliesAt"]) {
    assert.ok(declaredFields.has(field), `AssistantToolRegistryDeps must declare ${field}`);
  }
  const ports = {
    reapplyProvider: async () => "now" as const,
    providerAppliesAt: () => "restart" as const,
  } satisfies Pick<RouteDeps, ProviderFields>;
  const declared = providerPorts(ports);
  assert.equal(declared.reapplyProvider, ports.reapplyProvider);
  assert.equal(declared.providerAppliesAt?.({ pluginId: "provider-under-test" }), "restart");
});
