import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createSiteRouteDeps, defaultContentDbPath, siteDir } from "../../../apps/website/src/server/runtime/composition/deps.js";
import { createServingApp } from "../../../apps/website/src/server/runtime/composition/serving-app.js";
import { buildBootModules } from "../../../apps/website/src/server/runtime/boot/bootstrap.js";
import { awaitSiteBootReadiness } from "../../../apps/website/src/server/runtime/boot/site-boot-readiness.js";
import { agentDaemonWanted } from "../../../apps/website/src/server/runtime/boot/agent-daemon-wanted.js";
import { runBootLifecycle } from "../../../apps/website/src/server/runtime/lifecycle/boot-lifecycle.js";
import { setReadinessSnapshot } from "../../../apps/website/src/server/runtime/lifecycle/readiness-state.js";
import { ensureAgentDaemonPortResolved } from "../../../apps/website/src/server/runtime/lifecycle/agent-daemon-port.js";
import { registerPluginSdkResolver } from "../../../apps/website/src/server/runtime/boot/plugin-sdk-resolver.js";
import { ensureAgentDaemonToken } from "../../../apps/website/src/assistant/index.js";
import { startAssistantDaemon } from "../../../apps/website/src/server/inbound/assistant/index.js";

/**
 * @file Harness-only API composition for the site-import journey: `index.ts`'s SQLite boot order
 * (token -> plugin SDK resolver -> listener -> composition -> boot modules -> daemon port -> serving
 * app -> daemon after readiness), with ONE difference — `outboundTestOrigins` names the offline
 * fixture site, so `web_fetch_page` and `media_import_from_url` may reach exactly that loopback
 * origin (`apps/website/src/platform/http/test-origin-allowlist.ts`). The list arrives as an argument
 * from `start-journey-site.mjs`'s `api-site-import` target, which reads it from the harness-written
 * boot manifest; no product code reads it from env. The journey's BYOK turns run tools in THIS
 * process; the spawned daemon (separate process, stock clients) is started only for parity.
 */
export async function startSiteImportApi(
  { port, outboundTestOrigins }: { port: number; outboundTestOrigins: readonly string[] },
  _optional = {},
): Promise<void> {
  assert.ok(outboundTestOrigins.length > 0, "the site-import API exists only to name a fixture origin");
  ensureAgentDaemonToken({}, {});
  registerPluginSdkResolver();
  let handler: import("node:http").RequestListener = (_req, res) => { res.writeHead(503, { "Retry-After": "1" }); res.end("Server is starting"); };
  const server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const deps = await createSiteRouteDeps(defaultContentDbPath(), { outboundTestOrigins });
  const boot = await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath }));
  setReadinessSnapshot(boot);
  assert.ok(boot.ok, "site-import API: a critical boot module failed");
  await ensureAgentDaemonPortResolved();
  const { app } = createServingApp(deps);
  handler = app;
  console.log(`site-import journey API on http://127.0.0.1:${port}; fixture origins: ${outboundTestOrigins.join(", ")}`);
  await awaitSiteBootReadiness({ deps });
  if (await agentDaemonWanted(deps)) startAssistantDaemon({ workspaceId: deps.workspaceId, siteDir: siteDir() }, { registerProcessSignalHandlers: true });
}
