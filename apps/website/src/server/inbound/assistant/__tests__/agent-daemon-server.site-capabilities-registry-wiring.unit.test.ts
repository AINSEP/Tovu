import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createAssistantByokModule } from "#src/server/runtime/composition/modules/assistant-byok";
import { ALL_CHAT_DELETE_TOOLS } from "#src/assistant/permanent-delete-tool-gate";
import { daemonSource, daemonInitializer } from "./helpers/daemon-source.js";

type Capabilities = { sections: { tools: { status: string; data: { total: number; domains: { tools: { id: string }[] }[] } } } };

/** The server's single live registry now owns capability reporting and per-call delete policy. */
test("site capabilities read the server registry while the daemon carries only its descriptor view", () => {
  assert.equal(daemonInitializer("visibleRegistry").getText(daemonSource), "siteTools.registry");
  const code = daemonSource.statements.map(statement => statement.getText(daemonSource)).join("\n");
  assert.equal(code.includes("buildAssistantToolRegistrations"), false);
});

test("the server's actual catalog reader exposes a late tool and applies the daemon caller's delete grant", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const owner = { id: await deps.ownerPrincipalId };
  const { toolSurface } = createAssistantByokModule(deps);
  await toolSurface.ready;
  toolSurface.registry.register({ descriptor: { id: "audit_distinctive_late_tool", description: "Distinctive late registration" },
    policy: { authorize: () => "allow" }, handler: async () => ({}) });
  const call = { principal: owner, run: { id: "audit-run" }, toolId: "site_describe_capabilities", input: { sections: ["tools"] } };
  const result = await toolSurface.executor.execute(call);
  assert.equal(result.status, "completed");
  const tools = (result.output as Capabilities).sections.tools;
  assert.equal(tools.status, "ok");
  const ids = tools.data.domains.flatMap(domain => domain.tools.map(tool => tool.id));
  assert.ok(ids.includes("audit_distinctive_late_tool"));
  assert.deepEqual([...ids].sort(), toolSurface.registry.list({}).map(tool => tool.id).sort());
  for (const toolId of ALL_CHAT_DELETE_TOOLS.allowedToolIds) assert.equal(ids.includes(toolId), false, `${toolId} stays hidden without a fresh grant`);
  const ownerResult = await toolSurface.daemonCalls.executor.execute(call);
  assert.equal(ownerResult.status, "completed");
  const ownerIds = (ownerResult.output as Capabilities).sections.tools.data.domains.flatMap(domain => domain.tools.map(tool => tool.id));
  for (const toolId of ALL_CHAT_DELETE_TOOLS.allowedToolIds) assert.ok(ownerIds.includes(toolId), `${toolId} is visible in the authenticated owner's call`);
});
