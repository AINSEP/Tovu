import assert from "node:assert/strict";
import test from "node:test";
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { askThenReport, createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import { buildExternalMcpSaveForm } from "@jini-ai/mcp/external/save-form";

/**
 * @file The engine round trip for the external MCP save form: the form (owned by
 * `@jini-ai/mcp/external/save-form`) rendered through this host's secret-card engine binding.
 */

test("buildExternalMcpSaveForm: the engine routes submit and cancel to the same exchange", async () => {
  for (const isUpdate of [false, true]) {
    for (const authMode of [undefined, "oauth"]) {
      const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
      const card = defineSecretCardTool({
        toolId: "external_mcp_save", prepare: async () => ({}),
        form: () => buildExternalMcpSaveForm({ save: { id: "srv-1", transport: "streamable_http", authMode }, isUpdate, appName: "tovu-external-mcp-save" }),
        save: async () => { assert.fail("cancel must never save"); },
        outcome: () => undefined, result: ({ run }) => run.status,
      }, { uriHost: "tovu" });
      let html = "";
      let exchangeId = "";
      const result = await card.handler({ surfaceExchanges, askThenReport })({
        executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: {}, signal: new AbortController().signal,
      }, { emitSurface: async emission => {
        const { resource } = emission.payload as { resource: { resource: { uri: string; text: string } } };
        html = resource.resource.text;
        const match = html.match(/__exchangeId"\s*:\s*"([^"]+)"/);
        assert.ok(match);
        exchangeId = match[1]!;
        assert.equal(resource.resource.uri, `ui://tovu/secret-card/external_mcp_save/${exchangeId}`);
        surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: { __dismissed: true } }, { toolId: "external_mcp_save" });
      } });
      assert.equal(result, "cancelled");
      assert.equal(surfaceExchanges.size(), 0);
      const variable = (name: string) => {
        const match = html.match(new RegExp(`var ${name} = (.+);`));
        assert.ok(match, `${name} must be present in the rendered form`);
        return JSON.parse(match[1]!);
      };
      assert.equal(variable("TOOL"), "external_mcp_save");
      // Destination/auth values live in prepared state; submit carries only the exchange identity.
      assert.deepEqual(variable("BASE_PARAMS"), { __exchangeId: exchangeId });
      assert.deepEqual(variable("CANCEL"), { toolName: "external_mcp_save", params: { __exchangeId: exchangeId, __dismissed: true } });
    }
  }
});
