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
import { resolveAssistantCliPermissions } from "#src/contracts/core/assistant-native-fallbacks";

async function readFreshInstall() {
  let id = 0;
  const deps = { settingsRepo: new InMemorySettingsRepo(), clock: { nowMs: () => 0 },
    ids: { newId: () => `mcp-default-${++id}` }, ensureSettingDefinitions,
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "boot" });
  return readAssistantCliPermissions({ ...deps, getEffective, settingsReady: Promise.resolve(),
    workspaceId: "mcp-contract-site", principalId: "owner" });
}

test("host-defaults.fixture.contract: actual Tovu defaults equal the shared Jini host contract", async () => {
  assert.deepEqual(await readFreshInstall(), LOCAL_HOST_DEFAULT_PERMISSIONS);
});

test("all 28 registered CLIs get RUN, ASK or SETUP before launch under actual default settings", async t => {
  const settings = await readFreshInstall();
  assert.equal(AGENT_DEFS.length, 28, "Review new CLI definitions against the consent contract");
  for (const def of AGENT_DEFS) {
    const effective = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: def.id });
    assert.equal(effective.capabilities.userMcp, false);
    const result = planRun({ def, policy: { nativeToolAccess: effective.enabled,
      nativeCapabilities: effective.capabilities }, host: { installed: true, auth: "unknown" } });
    assert.ok(["RUN", "ASK", "SETUP"].includes(result.verdict), def.id);
    if (result.verdict === "RUN") assert.equal(result.loadsOwn, false, def.id);
    if (result.verdict === "ASK") assert.ok(result.keys.includes("userMcp"), def.id);
    if (def.id === "antigravity") assert.deepEqual(result, { verdict: "ASK", keys: ["userMcp"] });
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
