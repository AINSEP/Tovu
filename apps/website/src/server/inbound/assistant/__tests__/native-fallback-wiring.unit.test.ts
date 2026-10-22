import { assistantCliPermissions, ASSISTANT_CLI_CAPABILITIES } from "#src/contracts/headless/assistant-subagents-policy";
import { getAgentDef } from "@jini-ai/agent-runtime";
import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { captureDaemonRun, daemonInitializer, evaluateDaemonExpression } from './helpers/daemon-source.js';
import { buildBaseSystemOverlay, buildAssistantSubagentsOverlay } from '../assistant-system-overlay.js';
import { TOOLS_FIRST_RULE } from '#src/contracts/core/assistant-native-fallbacks';
import type { RunProtocolEvent } from '@jini-ai/protocol';
import type { ToolAttemptEvent } from '@jini-ai/daemon/tool-audit';
import { buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";

test('real local-owner dispatch grants Bash/edit while retaining security denies and audit subscription', async () => {
  let subscribed = false;
  const input = await captureDaemonRun({ prompt: 'Compile it' }, {
    bindings: { routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), workspaceId: 'w', siteBinding: { dir: '/site' }, toolAttemptAuditSink: { append: async () => {} } } },
    lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => { subscribed = true; return { kind: 'ok', unsubscribe() {} }; } },
  });
  assert.equal(input.nativeToolAccess, true);
  assert.equal(input.disallowedTools?.includes('Bash'), false);
  assert.equal(input.disallowedTools?.includes('Edit'), false);
  assert.equal(input.disallowedTools?.includes('Read(//**/.tovu/**)'), true);
  assert.equal(input.disallowedTools?.includes('CronCreate'), false);
  assert.equal(subscribed, true);
});

test('A7: the actual owner launch subscription records a Bash event with production secret redaction', async () => {
  const rows: { event: ToolAttemptEvent; detail: string }[] = [];
  const secret = 'Sw0rdFish!'.repeat(2);
  await captureDaemonRun({ prompt: 'Download the file' }, {
    bindings: { routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), workspaceId: 'w', siteBinding: { dir: '/site' },
      toolAttemptAuditSink: { append: async (event: ToolAttemptEvent, optional: { detail?: string }) => { rows.push({ event, detail: optional.detail ?? '' }); } },
    } },
    lifecycle: {
      waitForTerminal: () => new Promise(() => {}),
      stream: async ({ onEvent }: { onEvent(event: RunProtocolEvent): void }) => {
        onEvent({ runId: 'daemon-test-run', eventId: 'daemon-test-run:1', opaqueCursor: '1', ts: 1000,
          protocolVersion: 1, durability: 'durable', kind: 'agent',
          payload: { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: `curl password=${secret}` } },
        } as RunProtocolEvent);
        return { kind: 'ok', unsubscribe() {} };
      },
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.event.workspaceId, 'w');
  assert.equal(rows[0]!.event.principalId, 'daemon-test-principal');
  assert.equal(JSON.stringify(rows).includes(secret), false);
  assert.deepEqual({ ...JSON.parse(rows[0]!.detail), id: 'generated' }, {
    id: 'generated', at: '1970-01-01T00:00:01.000Z', site: '/site', chatId: 'daemon-test-run', runId: 'daemon-test-run',
    provider: 'claude', toolUsed: 'Bash', summary: 'curl password=[REDACTED:labeled_secret]', type: 'tool_gap', gapLine: null,
  });
});

test('non-owner and hosted owner launches explicitly lock native tools', async () => {
  const nonOwner = await captureDaemonRun({ prompt: 'Hello' });
  assert.equal(nonOwner.nativeToolAccess, false);
  assert.equal(nonOwner.disallowedTools?.includes('Bash'), true);
  const hosted = await captureDaemonRun({ prompt: 'Hello' }, { bindings: {
    routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), siteBinding: { dir: '/site' } },
    process: { env: { TOVU_RUNTIME_MODE: 'production', TOVU_AGENT_NATIVE_FALLBACKS: '1' }, cwd: () => '/site' },
    // Skip the independent collector in this policy-only fixture.
    createToolGapCollector: () => ({ observe() {} }),
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: 'ok' }) } });
  assert.equal(hosted.nativeToolAccess, false);
  assert.equal(hosted.disallowedTools?.includes('Write'), true);
});

test('prompt and runtime share the per-run grant across concurrent contexts', async () => {
  const native = new AsyncLocalStorage<boolean>();
  const augmenter = evaluateDaemonExpression<{ systemOverlay(input: { agentId: string }): string }>(daemonInitializer('assistantPromptAugmenter'), {
    buildBaseSystemOverlay, buildAssistantSubagentsOverlay, assistantNativeToolsContext: native,
    assistantSubagentsContext: new AsyncLocalStorage<boolean>(), bashProhibitionEnabled: false,
    customInstructionsCache: { readOverlay: () => null },
    buildAssistantRuntimeGuidance, assistantRuntimeGuidanceContext: new AsyncLocalStorage(),
  });
  await Promise.all([true, false].map(enabled => native.run(enabled, async () => {
    await Promise.resolve();
    const overlay = augmenter.systemOverlay({ agentId: 'claude' });
    assert.equal(overlay.includes(TOOLS_FIRST_RULE), enabled);
    assert.equal(overlay.includes('Bash is unavailable'), !enabled);
  })));
});

test('one fresh owner setting controls all native tools, configuration and the parity grant', async () => {
  for (const enabled of [false, true]) {
    let reads = 0;
    const input = await captureDaemonRun({ prompt: 'Delegate to Codex' }, { bindings: {
      routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), workspaceId: 'w', siteBinding: { dir: '/site' }, toolAttemptAuditSink: { append: async () => {} } },
      readAssistantCliPermissions: async () => { reads++; return assistantCliPermissions({ enabled }); },
    }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: 'ok' }) } });
    assert.equal(reads, 1);
    assert.equal(input.cliParity, enabled);
    assert.equal(input.nativeToolAccess, enabled);
    for (const tool of ['Bash', 'Edit', 'Write', 'Task', 'Agent', 'Workflow', 'CronCreate', 'RemoteTrigger']) {
      assert.equal(input.disallowedTools?.includes(tool), !enabled, tool);
    }
    assert.equal(input.settingSources === undefined, enabled);
    assert.equal(input.settings === undefined, enabled);
    assert.equal(input.env?.PATH, enabled ? '/test/login-shell' : undefined);
  }
});

test('non-owner and production/hosted paths never consult the owner setting or login environment', async () => {
  for (const policy of [
    { ownerPrincipalId: 'someone-else', env: {} },
    { ownerPrincipalId: 'daemon-test-principal', env: { TOVU_RUNTIME_MODE: 'production' } },
    { ownerPrincipalId: 'daemon-test-principal', env: { FLY_APP_NAME: 'hosted' } },
  ]) {
    const input = await captureDaemonRun({ prompt: 'Use Bash, Task and MCP', nativeToolAccess: true, cliParity: true }, { bindings: {
      routeDeps: { ownerPrincipalId: Promise.resolve(policy.ownerPrincipalId), workspaceId: 'w', siteBinding: { dir: '/site' }, toolAttemptAuditSink: { append: async () => {} } },
      process: { env: { ...policy.env, TOVU_AGENT_FULL_CLI_ACCESS: '1', TOVU_AGENT_NATIVE_FALLBACKS: '1' }, cwd: () => '/site' },
      readAssistantCliPermissions: async () => { throw new Error('locked principal must not read full access'); },
      readLoginShellEnvironment: async () => { throw new Error('locked principal must not read login environment'); },
    }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: 'ok' }) } });
    assert.equal(input.cliParity, false);
    assert.equal(input.nativeToolAccess, false);
    assert.deepEqual(input.nativeCapabilities, { shell: false, fileWrite: false, userMcp: false,
      subagents: false, userSettings: false, web: false, workflows: false, loginEnvironment: false });
    assert.ok(getAgentDef({ id: 'claude' })!.buildArgs({ prompt: input.prompt, imagePaths: [] }, { options: input }).includes('--strict-mcp-config'));
    assert.deepEqual(input.settingSources, []);
    for (const tool of ['Bash', 'Edit', 'Write', 'Task', 'Agent', 'Workflow']) assert.ok(input.disallowedTools?.includes(tool), tool);
    assert.equal(input.env, undefined);
  }
});

test('the real launch snapshot carries each independent OFF choice into Claude argv or configuration', async () => {
  const def = getAgentDef({ id: 'claude' })!;
  const deniedTool: Record<string, string> = { shell: 'Bash', fileWrite: 'Edit', subagents: 'Agent', web: 'WebSearch', workflows: 'Workflow' };
  for (const { key } of ASSISTANT_CLI_CAPABILITIES) {
    const settings = assistantCliPermissions({ enabled: true, capabilities: { [key]: false } });
    const input = await captureDaemonRun({ prompt: 'Test tool gaps' }, { bindings: {
      routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), workspaceId: 'w', siteBinding: { dir: '/site' }, toolAttemptAuditSink: { append: async () => {} } },
      readAssistantCliPermissions: async () => settings,
    }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: 'ok' }) } });
    assert.equal(input.nativeCapabilities?.[key], false);
    assert.deepEqual(input.nativeCapabilities, settings.capabilities, 'one OFF must preserve every unrelated ON');
    assert.equal(input.env?.PATH, key === 'loginEnvironment' ? undefined : '/test/login-shell');
    assert.equal(input.settingSources === undefined, key !== 'userSettings');
    const args = def.buildArgs({ prompt: input.prompt, imagePaths: [] }, { options: input });
    if (deniedTool[key]) assert.ok(args.includes(deniedTool[key]), key);
    if (key === 'userMcp') assert.ok(args.includes('--strict-mcp-config'));
    if (key === 'userSettings') {
      assert.ok(args.includes('--disable-slash-commands'));
      assert.deepEqual(input.settingSources, []);
    }
    if (key === 'loginEnvironment') assert.equal(input.env, undefined);
  }
});
