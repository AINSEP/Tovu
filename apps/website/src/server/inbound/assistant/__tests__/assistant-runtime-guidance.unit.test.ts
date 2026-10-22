import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";

import {
  CLAUDE_IN_CHROME_ALLOWED_TOOLS,
  CLAUDE_IN_CHROME_GUIDANCE,
  PREFER_SUBAGENTS_GUIDANCE,
  SHORT_REPLY_GUIDANCE,
  DETAILED_REPLY_GUIDANCE,
  buildReplyLengthGuidance,
  buildClaudeInChromeRunOptions,
  resolveClaudeInChromeEffective,
  buildAssistantRuntimeGuidance,
  buildPreferSubagentsGuidance,
  createAssistantChromeProbe,
  resolveAssistantRuntimeLaunch,
  resolvePreferSubagentsEffective,
} from "../assistant-runtime-guidance.js";

test("the delegation guidance is the owner's exact text", () => {
  assert.equal(PREFER_SUBAGENTS_GUIDANCE,
    "Delegate multi-step or output-heavy work (building or porting a theme, screenshot/visual checks, large reads or many-file edits) " +
    "to a subagent and keep only its summary in the main chat. Do small single calls directly; do not spawn a subagent for a one-step task.");
});

test("delegation is effective only when the setting, the runtime and the run's capability all allow it", () => {
  for (const preferSubagents of [true, false]) for (const runtimeSupportsSubagents of [true, false]) for (const subagentsEnabled of [true, false]) {
    assert.equal(resolvePreferSubagentsEffective({ preferSubagents, runtimeSupportsSubagents, subagentsEnabled }),
      preferSubagents && runtimeSupportsSubagents && subagentsEnabled);
  }
});

test("guidance text: the exact sentence when effective, empty otherwise", () => {
  assert.equal(buildPreferSubagentsGuidance({ effective: true }), PREFER_SUBAGENTS_GUIDANCE);
  assert.equal(buildPreferSubagentsGuidance({ effective: false }), "");
});

test("the overlay block appends a trailing space per sentence and is empty when nothing applies", () => {
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: true, claudeInChrome: false, replyLength: "normal" } }), `${PREFER_SUBAGENTS_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: false, claudeInChrome: true, replyLength: "normal" } }), `${CLAUDE_IN_CHROME_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: true, claudeInChrome: true, replyLength: "normal" } }), `${PREFER_SUBAGENTS_GUIDANCE} ${CLAUDE_IN_CHROME_GUIDANCE} `);
  assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents: false, claudeInChrome: false, replyLength: "normal" } }), "");
  assert.equal(buildAssistantRuntimeGuidance({ input: undefined }), "");
});

test("the Claude in Chrome guidance is the owner's exact text", () => {
  assert.equal(CLAUDE_IN_CHROME_GUIDANCE,
    "Claude in Chrome is available: prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools.");
});

test("Claude in Chrome is effective only for the owner, with the setting ON, on a supporting runtime", () => {
  for (const useClaudeInChrome of [true, false]) for (const runtimeSupportsChrome of [true, false]) for (const isOwner of [true, false]) {
    assert.equal(resolveClaudeInChromeEffective({ useClaudeInChrome, runtimeSupportsChrome, isOwner }), useClaudeInChrome && runtimeSupportsChrome && isOwner);
  }
});

test("run options: --chrome + the whole server allowed when effective, explicit OFF otherwise, nothing for other runtimes", () => {
  assert.deepEqual(CLAUDE_IN_CHROME_ALLOWED_TOOLS, ["mcp__claude-in-chrome", "mcp__claude-in-chrome__*"]);
  assert.ok(Object.isFrozen(CLAUDE_IN_CHROME_ALLOWED_TOOLS));
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: true, effective: true }), { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS });
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: true, effective: false }), { chromeIntegration: false });
  assert.deepEqual(buildClaudeInChromeRunOptions({ runtimeSupportsChrome: false, effective: false }), {});
});

function deps(values: Record<string, unknown>) {
  return {
    settingsRepo: new InMemorySettingsRepo(),
    getEffective: (async (_d: unknown, input: { key: string }) => (input.key in values ? { value: values[input.key], sourceLayer: "user", defVersion: 1 } : null)) as unknown as typeof getEffective,
    settingsReady: Promise.resolve(),
    workspaceId: "ws",
  };
}

const base = { principalId: "p", agentId: "claude", subagentsEnabled: true, isOwner: true };
/** A CLI whose `--help` probe found `--chrome`, so Jini really emits the flag. */
const probed = { probeChrome: async () => true };

test("launch: defaults on Claude Code for the owner — delegation guidance on, Chrome on (owner default 2026-10-22)", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}) }, probed),
    { guidance: { preferSubagents: true, claudeInChrome: true, replyLength: "normal" }, runOptions: { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } });
});

test("launch: the Chrome default still yields --no-chrome for a non-owner, and an explicit OFF wins for the owner", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}), isOwner: false }, probed),
    { guidance: { preferSubagents: true, claudeInChrome: false, replyLength: "normal" }, runOptions: { chromeIntegration: false } });
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: false }) }, probed),
    { guidance: { preferSubagents: true, claudeInChrome: false, replyLength: "normal" }, runOptions: { chromeIntegration: false } });
});

test("launch: a runtime without native subagents, a denied Task/Agent or an OFF setting disables delegation", async () => {
  assert.deepEqual((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}), agentId: "codex" })),
    { guidance: { preferSubagents: false, claudeInChrome: false, replyLength: "normal" }, runOptions: {} });
  assert.equal((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({}), subagentsEnabled: false })).guidance.preferSubagents, false);
  assert.equal((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ preferSubagents: false }) })).guidance.preferSubagents, false);
});

test("launch: Chrome ON for the owner on Claude Code passes --chrome and allows the server", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }) }, probed),
    { guidance: { preferSubagents: true, claudeInChrome: true, replyLength: "normal" }, runOptions: { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } });
});

test("launch: Chrome ON stays off for a non-owner and is omitted for a runtime without support", async () => {
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), isOwner: false }, probed),
    { guidance: { preferSubagents: true, claudeInChrome: false, replyLength: "normal" }, runOptions: { chromeIntegration: false } });
  assert.deepEqual((await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), agentId: "codex" })).runOptions, {});
});

test("launch: the host's own def lookup decides runtime support", async () => {
  const seen: string[] = [];
  const getDef = ({ id }: { id: string }) => { seen.push(id); return id === "host-cli" ? { supportsSubagents: true, supportsChromeIntegration: true } : null; };
  assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), agentId: "host-cli" }, { getDef, ...probed }),
    { guidance: { preferSubagents: true, claudeInChrome: true, replyLength: "normal" }, runOptions: { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } });
  assert.deepEqual(seen, ["host-cli", "host-cli"]);
});

test("launch: a declared-but-unprobed or probe-rejected CLI gets no Chrome guidance, no Chrome tools and no flag", async () => {
  const asked: string[] = [];
  const rejected = { probeChrome: async ({ agentId }: { agentId: string }) => { asked.push(agentId); return false; } };
  for (const optional of [{}, rejected]) {
    assert.deepEqual(await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }) }, optional),
      { guidance: { preferSubagents: true, claudeInChrome: false, replyLength: "normal" }, runOptions: {} });
  }
  assert.deepEqual(asked, ["claude"]);
});

test("launch: a runtime that does not declare Chrome support is never probed", async () => {
  let probes = 0;
  const launch = await resolveAssistantRuntimeLaunch({ ...base, deps: deps({ useClaudeInChrome: true }), agentId: "codex" }, { probeChrome: async () => { probes += 1; return true; } });
  assert.deepEqual(launch.runOptions, {});
  assert.equal(probes, 0);
});

function probeDeps(overrides: Partial<Parameters<typeof createAssistantChromeProbe>[0]> = {}) {
  const calls: unknown[] = [];
  const def = { id: "claude", env: { ENABLE_TOOL_SEARCH: "false", PATH: "/def" } } as unknown as NonNullable<ReturnType<Parameters<typeof createAssistantChromeProbe>[0]["getDef"]>>;
  const capabilities = new Map<string, Record<string, boolean>>();
  return { calls, def, capabilities, deps: {
    getDef: ({ id }: { id: string }) => (id === "claude" ? def : null),
    resolveAgentLaunch: () => ({ launchPath: "/bin/claude" }),
    ensureAgentCapabilities: async (input: unknown) => { calls.push(input); capabilities.set("claude", { chrome: true }); },
    capabilities,
    env: { PATH: "/host" },
    ...overrides,
  } };
}

test("chrome probe: fills the runtime's capability gate for the launch path, then reads its chrome flag", async () => {
  const { calls, def, deps: probeDepsValue } = probeDeps();
  assert.equal(await createAssistantChromeProbe(probeDepsValue)({ agentId: "claude" }), true);
  assert.deepEqual(calls, [{ def, launchPath: "/bin/claude", env: { ENABLE_TOOL_SEARCH: "false", PATH: "/host" } }]);
});

test("chrome probe: a CLI whose --help lacks --chrome, or a probe that recorded nothing, reads false", async () => {
  const lacking = probeDeps();
  lacking.deps.ensureAgentCapabilities = async () => { lacking.capabilities.set("claude", { chrome: false }); };
  assert.equal(await createAssistantChromeProbe(lacking.deps)({ agentId: "claude" }), false);
  const empty = probeDeps({ ensureAgentCapabilities: async () => {} });
  assert.equal(await createAssistantChromeProbe(empty.deps)({ agentId: "claude" }), false);
});

test("chrome probe: unknown agent, unresolved binary and a def without env", async () => {
  const unknown = probeDeps();
  assert.equal(await createAssistantChromeProbe(unknown.deps)({ agentId: "nope" }), false);
  assert.deepEqual(unknown.calls, []);
  const missing = probeDeps({ resolveAgentLaunch: () => ({ launchPath: null }) });
  assert.equal(await createAssistantChromeProbe(missing.deps)({ agentId: "claude" }), false);
  assert.deepEqual(missing.calls, []);
  const bare = probeDeps();
  const bareDef = { id: "claude" } as typeof bare.def;
  bare.deps.getDef = () => bareDef;
  assert.equal(await createAssistantChromeProbe(bare.deps)({ agentId: "claude" }), true);
  assert.deepEqual(bare.calls, [{ def: bareDef, launchPath: "/bin/claude", env: { PATH: "/host" } }]);
});

test("chrome probe: a throwing launch resolver or probe fails closed", async () => {
  const resolver = probeDeps({ resolveAgentLaunch: () => { throw new Error("no PATH"); } });
  assert.equal(await createAssistantChromeProbe(resolver.deps)({ agentId: "claude" }), false);
  const probe = probeDeps({ ensureAgentCapabilities: async () => { throw new Error("spawn failed"); } });
  assert.equal(await createAssistantChromeProbe(probe.deps)({ agentId: "claude" }), false);
});

test("reply length contributes the exact instruction, or nothing for Normal and absent input", () => {
  assert.equal(SHORT_REPLY_GUIDANCE, "Lead with the result in 1–3 lines, then only decisions, approvals, failures or unverified items needing the person; retain the Tool gap line and anything flagged as needing the person, and omit step narration, recaps and change lists unless asked.");
  assert.equal(DETAILED_REPLY_GUIDANCE, "Explain the cause, what changed and where, what was checked and what was not.");
  assert.equal(buildReplyLengthGuidance({ replyLength: "short" }), SHORT_REPLY_GUIDANCE);
  assert.equal(buildReplyLengthGuidance({ replyLength: "detailed" }), DETAILED_REPLY_GUIDANCE);
  assert.equal(buildReplyLengthGuidance({ replyLength: "normal" }), "");
  assert.equal(buildReplyLengthGuidance({ replyLength: undefined }), "");
});

test("reply guidance appends once alongside the existing guidance without changing Normal's bytes", () => {
  for (const preferSubagents of [true, false]) for (const claudeInChrome of [true, false]) {
    const existing = [preferSubagents ? PREFER_SUBAGENTS_GUIDANCE : "", claudeInChrome ? CLAUDE_IN_CHROME_GUIDANCE : ""]
      .filter(Boolean).map(text => `${text} `).join("");
    assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents, claudeInChrome, replyLength: "normal" } }), existing);
    assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents, claudeInChrome, replyLength: "short" } }), `${existing}${SHORT_REPLY_GUIDANCE} `);
    assert.equal(buildAssistantRuntimeGuidance({ input: { preferSubagents, claudeInChrome, replyLength: "detailed" } }), `${existing}${DETAILED_REPLY_GUIDANCE} `);
  }
});

test("launch: reply length applies independently of runtime capabilities, with invalid values defaulting to Normal", async () => {
  for (const agentId of ["claude", "codex"]) for (const replyLength of ["short", "normal", "detailed", "invalid"]) {
    const launch = await resolveAssistantRuntimeLaunch({ ...base, agentId, subagentsEnabled: false, deps: deps({ replyLength }) });
    assert.equal(launch.guidance.replyLength, replyLength === "invalid" ? "normal" : replyLength);
  }
});
