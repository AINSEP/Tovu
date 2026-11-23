/** EXTRACT-S5 H1a: one canonical class per error. The external-mcp store no longer forwards the error classes (w3 FIX 12); importers take them from `@jini-ai/mcp/federation/hosted`. */
import assert from "node:assert/strict";
import test from "node:test";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import { ExternalMcpValidationError as AccessShimValidationError } from "@jini-ai/mcp/federation/hosted";
import { ExternalMcpSecretStoreUnconfiguredError as StoreUnconfigured } from "@jini-ai/mcp/federation/hosted";
import { classifyAgentPluginMcpError, isAgentPluginSignInRefusal } from "../../../agent-plugins/mcp-host-bindings.js";
import type { AgentPluginMcpProjections } from "@jini-ai/agent-plugins/connect";

/** Same name and shape, different class: must NOT be treated as canonical. */
class LookalikeValidationError extends Error {
  readonly field = "allowedToolNames";
  constructor(message: string) { super(message); this.name = "ExternalMcpValidationError"; }
}

test("every compatibility export is the same class object as the public entry", () => {
  assert.equal(AccessShimValidationError, hosted.ExternalMcpValidationError);
  const projections: AgentPluginMcpProjections = hosted.hostedMcpProjections;
  assert.equal(projections.validateToolNames, hosted.validateExternalMcpToolNames);
});

test("a validation error thrown by the canonical projection keeps instanceof, name and field through the shims", () => {
  const error = (() => { try { hosted.hostedMcpProjections.validateToolNames({ names: ["no spaces allowed"], field: "writeAllowedToolNames" }); } catch (e) { return e; } return undefined; })();
  assert.ok(error instanceof AccessShimValidationError);
  assert.ok(error instanceof Error);
  assert.equal((error as Error).name, "ExternalMcpValidationError");
  assert.equal((error as InstanceType<typeof AccessShimValidationError>).field, "writeAllowedToolNames");
  assert.equal(Object.hasOwn(error as object, "code"), false, "the baseline class carries no code; none was added");
  assert.equal(classifyAgentPluginMcpError({ error }), "validation");
  assert.equal(isAgentPluginSignInRefusal({ error }), true);
});

test("the unconfigured error keeps identity and classifies as unconfigured", () => {
  const error = new hosted.ExternalMcpSecretStoreUnconfiguredError("no site key for second-host");
  assert.ok(error instanceof StoreUnconfigured);
  assert.equal(error.name, "ExternalMcpSecretStoreUnconfiguredError");
  assert.equal(classifyAgentPluginMcpError({ error }), "unconfigured");
  assert.equal(isAgentPluginSignInRefusal({ error }), false);
});

test("a same-named lookalike is neither classified nor treated as a sign-in refusal", () => {
  const error = new LookalikeValidationError("lookalike");
  assert.equal(classifyAgentPluginMcpError({ error }), "other");
  assert.equal(isAgentPluginSignInRefusal({ error }), false);
});
