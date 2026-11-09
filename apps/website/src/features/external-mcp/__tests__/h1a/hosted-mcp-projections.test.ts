/** EXTRACT-S5 H1a: all six projection outputs and the admission-revision bytes equal the c3801c833 baseline,
 *  through the Tovu shims, the public `@jini-ai/mcp/federation/hosted` entry and the host binding object. */
import assert from "node:assert/strict";
import test from "node:test";
import { hostedMcpProjections } from "@jini-ai/mcp/federation/hosted";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import { externalMcpAccessSnapshot, externalMcpAdmissionRevision, readExternalMcpToolGrants, validateExternalMcpToolNames } from "../../../../contracts/core/external-mcp-access.js";
import { externalMcpRecordHasStaticAccessToken, resolveExternalMcpOAuthStatus } from "../../../../contracts/core/external-mcp-auth.js";
import { agentPluginMcpProjections } from "../../../agent-plugins/mcp-host-bindings.js";
import { BASELINE, computeProjections } from "./fixtures/projection-baseline.js";

const shims = { accessSnapshot: externalMcpAccessSnapshot, admissionRevision: externalMcpAdmissionRevision, readToolGrants: readExternalMcpToolGrants,
  validateToolNames: validateExternalMcpToolNames, oauthStatus: resolveExternalMcpOAuthStatus, hasStaticAccessToken: externalMcpRecordHasStaticAccessToken };

test("Tovu shims reproduce every baseline projection output and revision byte", () => {
  assert.deepEqual(computeProjections(shims), BASELINE);
});

test("hostedMcpProjections from the public entry reproduces the same baseline", () => {
  assert.deepEqual(computeProjections(hostedMcpProjections), BASELINE);
});

test("the shims, the entry object and the existing host binding are the same six function identities", () => {
  const keys = ["accessSnapshot", "admissionRevision", "readToolGrants", "validateToolNames", "oauthStatus", "hasStaticAccessToken"] as const;
  assert.deepEqual(Object.keys(hostedMcpProjections).sort(), [...keys].sort());
  for (const key of keys) {
    assert.equal(hostedMcpProjections[key], shims[key], key);
    assert.equal(agentPluginMcpProjections[key], hostedMcpProjections[key], key);
  }
  assert.equal(hosted.externalMcpAdmissionRevision, externalMcpAdmissionRevision);
});
