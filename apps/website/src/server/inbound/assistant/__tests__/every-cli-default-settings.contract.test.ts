/** Every registered CLI gets a launch decision from the actual fresh-install settings.
 * Consent is planned before launch; a named refusal is no longer an accepted outcome.
 * Live isolation proof is deliberately separate from this deterministic contract.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_DEFS } from "@jini-ai/agent-runtime";
import { LOCAL_HOST_DEFAULT_PERMISSIONS, planRun } from "@jini-ai/agent-runtime/native-tool-policy";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from "@jini-ai/core/settings";
import { ensureExecutionSettingDefinitions } from "#src/assistant/execution-mode-settings";
import { readAssistantCliPermissions } from "#src/assistant/subagent-settings";
import { assistantCliPermissions, resolveAssistantCliPermissions } from "#src/contracts/core/assistant-native-fallbacks";
import { patchCliPermissionLayer } from "#src/assistant/cli-permission-layer";

async function readFreshInstall() {
  let id = 0;
  const deps = { settingsRepo: new InMemorySettingsRepo(), clock: { nowMs: () => 0 },
    ids: { newId: () => `mcp-default-${++id}` }, ensureSettingDefinitions,
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "boot" });
  return readAssistantCliPermissions({ ...deps, getEffective, settingsReady: Promise.resolve(),
    workspaceId: "mcp-contract-site", principalId: "owner" });
}

/** One stored owner snapshot, read through the real parser with a fake effective-setting port. */
function readStored(value: Record<string, unknown>) {
  return readAssistantCliPermissions({ settingsRepo: {} as never, settingsReady: Promise.resolve(), workspaceId: "site", principalId: "owner",
    getEffective: async () => ({ value: value as never, sourceLayer: "user", defVersion: 1 }) });
}
const ALL_ON = assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } });
// A record saved before 2026-11-10 by the master switch: userMcp false was the default, not a choice.
const LEGACY_SITE = { enabled: true, capabilities: { ...ALL_ON.capabilities, userMcp: false } };
const PERSONAL_MCP_DEFS = ["claude", "codex", "antigravity"].map(id => AGENT_DEFS.find(def => def.id === id)!);

/** The launch decision for one CLI under the owner's effective settings. */
function plan(settings: Awaited<ReturnType<typeof readFreshInstall>>, def: (typeof AGENT_DEFS)[number]) {
  const effective = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: def.id });
  return planRun({ def, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities },
    host: { installed: true, auth: "unknown" } });
}

test("host-defaults.fixture.contract: Tovu defaults are the shared Jini host contract with personal MCP on (owner 2026-11-10)", async () => {
  assert.deepEqual(await readFreshInstall(), { ...LOCAL_HOST_DEFAULT_PERMISSIONS,
    capabilities: { ...LOCAL_HOST_DEFAULT_PERMISSIONS.capabilities, userMcp: true } });
});

test("a fresh local owner and an existing site with no explicit choice run Claude Code, Codex and Antigravity without asking", async () => {
  for (const [name, settings] of [["fresh", await readFreshInstall()], ["existing", await readStored(LEGACY_SITE)]] as const) {
    for (const def of PERSONAL_MCP_DEFS) assert.equal(plan(settings, def).verdict, "RUN", `${name} ${def.id}`);
  }
});

test("an owner who turned personal MCP off in settings still gets ASK", async () => {
  const siteOff = patchCliPermissionLayer({ raw: {}, defaults: assistantCliPermissions({ enabled: true, capabilities: { userMcp: false } }) });
  for (const def of PERSONAL_MCP_DEFS) {
    const agentOff = patchCliPermissionLayer({ raw: LEGACY_SITE, defaults: ALL_ON, agentId: def.id, capabilities: { userMcp: false } });
    for (const settings of [await readStored(siteOff), await readStored(agentOff)]) {
      const result = plan(settings, def);
      assert.equal(result.verdict, "ASK", def.id);
      assert.ok(result.verdict === "ASK" && result.keys.includes("userMcp"), def.id);
    }
  }
});

test("all 28 registered CLIs get RUN, ASK or SETUP before launch under actual default settings", async t => {
  const settings = await readFreshInstall();
  assert.equal(AGENT_DEFS.length, 28, "Review new CLI definitions against the consent contract");
  for (const def of AGENT_DEFS) {
    const effective = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: def.id });
    assert.equal(effective.capabilities.userMcp, true);
    const result = plan(settings, def);
    assert.ok(["RUN", "ASK", "SETUP"].includes(result.verdict), def.id);
    if (result.verdict === "ASK") assert.ok(!result.keys.includes("userMcp"), def.id);
    if (def.id === "antigravity") assert.equal(result.verdict, "RUN");
    t.diagnostic(`${def.id}: ${result.verdict}`);
  }
});

test("host restrictions override per-agent grants and never offer Allow", async () => {
  const settings = await readFreshInstall();
  settings.byAgent = { antigravity: { enabled: true, capabilities: { userMcp: true } } };
  const def = AGENT_DEFS.find(def => def.id === "antigravity")!;
  for (const [isOwner, env, locked] of [[false, {}, "not_owner"], [true, { TOVU_HOSTED: "1" }, "hosted"]] as const) {
    const effective = resolveAssistantCliPermissions({ isOwner, env, settings, agentId: def.id });
    assert.ok(Object.values(effective.capabilities).every(value => value === false));
    assert.equal(planRun({ def, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities },
      host: { installed: true, auth: "unknown", locked } }).verdict, "SETUP");
  }
});
