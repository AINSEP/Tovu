/**
 * @file Fault injection for `loadDeclaredApiConnections`: if the descriptor parser ever throws
 * something that is not an Error, the connection is still dropped with a log-safe refusal (never
 * the thrown value's text). Jini's parser throws `ApiConnectionError` today, so this needs a module
 * mock; it lives in its own file so the mock never reaches another suite.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mock, test } from "node:test";

import * as realApiConnections from "@jini-ai/integrations/api-connections";

import { loadPluginContributionsFromSource } from "../../agent-plugins/lifecycle.js";

test("load: a non-Error thrown by the descriptor parser drops the connection with a generic, log-safe reason", async (t) => {
  const mocked = mock.module("@jini-ai/integrations/api-connections", {
    namedExports: { ...realApiConnections, parseApiConnectionDescriptor: () => { throw "provider text that must not be logged"; } },
  });
  t.after(() => mocked.restore());
  const { loadDeclaredApiConnections } = await import("../contribution.js");
  const packageRoot = path.join(import.meta.dirname, "fixtures", "acme-office");
  const loaded = await loadDeclaredApiConnections({
    workspaceId: "ws-1",
    loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot }, definition: input.definition }),
  });
  assert.deepEqual(loaded, { connections: [], refusals: ["API connection 'account' from 'acme-office' was not loaded: invalid descriptor"] });
});
