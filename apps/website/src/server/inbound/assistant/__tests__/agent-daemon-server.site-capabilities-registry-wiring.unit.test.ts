import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { listToolCatalogEntries } from "#src/assistant/tool-catalog-query";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/**
 * @file Wiring proof that the agent daemon hands `site_describe_capabilities` a reader over its OWN
 * live `ToolRegistry` — the same `registry` its `search_tools`/`describe_tool` routes snapshot.
 *
 * Reads the SOURCE rather than importing the file, for the reason every sibling
 * `agent-daemon-server.*-wiring.unit.test.ts` gives: importing it opens a real database and binds a
 * port. Without this wiring the tool still registers and still runs; its `tools` section just reports
 * `unavailable`/`not-wired` on every call, which no other test would notice. The BYOK composition
 * root's half is `assistant/__tests__/byok-tool-surface.site-capabilities.test.ts`.
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

describe("site_describe_capabilities registry wiring in the agent daemon", () => {
  test("imports listToolCatalogEntries through the assistant daemon port", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*\blistToolCatalogEntries\b[^}]*\}\s*from\s*["']#src\/assistant\/agent-daemon-port["']/,
      "agent-daemon-server.ts must import listToolCatalogEntries from #src/assistant/agent-daemon-port",
    );
  });

  test("buildAssistantToolRegistrations receives listCatalogTools bound to the daemon's own registry", () => {
    const anchor = DAEMON_ENTRY_SOURCE.indexOf("const assistantRegistrations = buildAssistantToolRegistrations(");
    assert.ok(anchor > -1, "this test's own anchor (the assistantRegistrations call) must still exist verbatim");
    const close = DAEMON_ENTRY_SOURCE.indexOf("\n);", anchor);
    assert.ok(close > anchor, "this test's own anchor (the call's closing paren on its own line) must still exist verbatim");
    const callBody = DAEMON_ENTRY_SOURCE.slice(anchor, close);

    assert.match(
      callBody,
      /listCatalogTools\s*:\s*\(\)\s*=>\s*listToolCatalogEntries\(registry\)/,
      "the daemon must pass listCatalogTools: () => listToolCatalogEntries(registry) — without it site_describe_capabilities reports tools 'not-wired'",
    );

    const registryDeclaration = DAEMON_ENTRY_SOURCE.indexOf("const registry = createToolRegistry();");
    assert.ok(
      registryDeclaration > -1 && registryDeclaration < anchor,
      "the registry the reader closes over must be the daemon's one module-scope registry, declared before the call",
    );
  });
});

test("the daemon's actual catalog reader exposes a tool registered after composition", async () => {
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const ownerId = await routeDeps.ownerPrincipalId;
  const registry = createToolRegistry();
  const registrations = evaluateDaemonExpression<ReturnType<typeof buildAssistantToolRegistrations>>(
    daemonInitializer("assistantRegistrations"),
    { routeDeps, registry, listToolCatalogEntries, buildAssistantToolRegistrations,
      magicLinkPerEmailLimiter: {}, surfaceExchanges: createSurfaceExchangeStore() },
  );
  for (const registration of registrations) registry.register(registration);
  registry.register({
    descriptor: { id: "audit_distinctive_late_tool", description: "Distinctive late registration" },
    policy: { authorize: () => "allow" }, handler: async () => ({}),
  });
  const registration = registrations.find((entry) => entry.descriptor.id === "site_describe_capabilities");
  assert.ok(registration);
  const result = await registration.handler({
    executionId: "audit-capabilities", principal: { id: ownerId }, run: { id: "audit-run" },
    input: { sections: ["tools"] }, signal: new AbortController().signal,
  }) as { sections: { tools: { status: string; data: { total: number; domains: Array<{ tools: Array<{ id: string }> }> } } } };
  const tools = result.sections.tools;
  assert.equal(tools.status, "ok");
  const ids = tools.data.domains.flatMap((domain) => domain.tools.map((tool) => tool.id));
  assert.ok(ids.includes("audit_distinctive_late_tool"));
  assert.deepEqual([...ids].sort(), registry.list().map((tool) => tool.id).sort());
});
