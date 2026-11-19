import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor, type ToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";
import { delegatedToolErrorDisclosure } from "#src/assistant/tool-recovery-preset";
import { createContentReadFamilyPort } from "#src/assistant/tool-family-port";
import { daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";
import { reportRouteInternalError } from "@jini-ai/http-kit";

/** The host's own `delegatedToolRouteDeps` expression, evaluated from the scope source, mounted on the real
 * daemon route: an agent that calls the bare `content_read` is told the cards to call, on both gateways, and
 * nothing runs. Only the executor/principal recorders and the registry are test doubles. */
function fixture({ withFamilies = true }: { withFamilies?: boolean } = {}) {
  const registry: ToolRegistry = createToolRegistry({});
  for (const id of ["content_read.menu", "content_read.page"]) {
    registry.register({ descriptor: { id, readOnly: true }, policy: { authorize: () => "allow" }, handler: async () => id });
  }
  const inner = createToolExecutor({ registry });
  const executorCalls: unknown[] = [];
  const toolExecutor: ToolExecutor = { ...inner, execute: request => { executorCalls.push(request); return inner.execute(request); } };
  const principalCalls: unknown[] = [];
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const deps = evaluateDaemonExpression<DelegatedToolsHttpDeps>(daemonInitializer("delegatedToolRouteDeps"), {
    lifecycle, toolExecutor, delegatedToolErrorDisclosure, publishJobRecoveryMessage: () => "",
    resolvePrincipal: (call: unknown) => { principalCalls.push(call); return { id: "editor" }; },
    siteTools: { registry, ...(withFamilies ? { families: createContentReadFamilyPort({ registry }) } : {}) },
  });
  return { deps, lifecycle, executorCalls, principalCalls };
}

async function bareCall(host: ReturnType<typeof fixture>, { toolId, requireReadOnly }: { toolId: string; requireReadOnly: boolean }) {
  const { run } = await host.lifecycle.start({ contextRef: "ctx-1" });
  return delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId, input: { resource: "menu" }, ...(requireReadOnly ? { requireReadOnly: true } : {}) }, deps: { ...host.deps, reportInternalError: reportRouteInternalError } });
}

for (const requireReadOnly of [true, false]) {
  const gateway = requireReadOnly ? "read-only gateway" : "unconstrained gateway";

  test(`${gateway}: the bare content_read names its cards and the selector, and nothing runs`, async () => {
    const host = fixture();
    const result = await bareCall(host, { toolId: "content_read", requireReadOnly });
    assert.deepEqual(result, { ok: false, error: {
      code: "UNKNOWN_TOOL",
      message: "\"content_read\" is a group of tools, not one tool. Call one of: content_read.menu, content_read.page.",
      details: { family: { id: "content_read", members: ["content_read.menu", "content_read.page"],
        selector: { keys: ["resource", "type", "entity", "kind"], byValue: { menu: "content_read.menu", page: "content_read.page" } } } },
    } });
    assert.deepEqual(host.principalCalls, []);
    assert.deepEqual(host.executorCalls, []);
  });

  test(`${gateway}: without a family port the bare content_read gets the plain unknown-tool sentence`, async () => {
    const host = fixture({ withFamilies: false });
    const result = await bareCall(host, { toolId: "content_read", requireReadOnly });
    assert.deepEqual(result, { ok: false, error: { code: "UNKNOWN_TOOL",
      message: "There is no tool named \"content_read\". Closest names: content_read.menu, content_read.page. Find tools with search_tools." } });
    assert.deepEqual(host.executorCalls, []);
  });

  test(`${gateway}: another unknown id is not a group`, async () => {
    const host = fixture();
    const result = await bareCall(host, { toolId: "content_reed", requireReadOnly });
    assert.deepEqual(result, { ok: false, error: { code: "UNKNOWN_TOOL", message: "There is no tool named \"content_reed\". Find tools with search_tools." } });
  });
}
