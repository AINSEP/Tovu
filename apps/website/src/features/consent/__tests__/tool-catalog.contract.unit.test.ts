import assert from "node:assert/strict";
import test from "node:test";

import { consentAgentToolCatalog, consentDerivedRisk } from "../tool-registrations.js";

/**
 * @file Inline contract for the consent tool catalog (Stryker lane L14: 74.6 %, 30 declarative
 * survivors, AP5). Reads need `settings.read`; the two writes need `settings.workspace.write`, and
 * every input schema is closed. Descriptions are prose, so they are stripped before comparing.
 */

const PATH_ONLY = { type: "object", properties: { path: { type: "string" } }, additionalProperties: false };
const READ = { permission: "settings.read" };
const WRITE = { permission: "settings.workspace.write" };

test("consent catalog matches the inline contract, in order", () => {
  assert.deepEqual(consentAgentToolCatalog.map(({ description: _d, ...rest }) => JSON.parse(JSON.stringify(rest, (k, v) => (k === "description" ? undefined : v)))), [
    { name: "consent_get_readiness", sideEffects: "none", authorization: READ, inputSchema: PATH_ONLY },
    { name: "consent_explain_blocked", sideEffects: "none", authorization: READ, inputSchema: PATH_ONLY },
    { name: "consent_get_settings", sideEffects: "none", authorization: READ, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "consent_update_settings", sideEffects: "mutates-durable-state", authorization: WRITE, inputSchema: {
      type: "object", required: ["config", "expectedDraftId"],
      properties: { config: { type: "object" }, expectedDraftId: { type: ["string", "null"] } }, additionalProperties: false } },
    { name: "consent_publish_settings", sideEffects: "mutates-durable-state", authorization: WRITE, inputSchema: {
      type: "object", required: ["draftId", "expectedPublishedId"],
      properties: { draftId: { type: "string" }, expectedPublishedId: { type: ["string", "null"] } }, additionalProperties: false } },
  ]);
  for (const tool of consentAgentToolCatalog) assert.ok(tool.description.trim().length > 20, tool.name);
});

test("consent derived risk agrees with every tool's declared side effect", () => {
  assert.deepEqual([...consentDerivedRisk].sort(), consentAgentToolCatalog.map((t) => [t.name, t.sideEffects]).sort());
});
