import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeEachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { createToolGapReader } from '../tool-gaps.repo.js';
import { SqlToolAttemptAuditSink } from '../repo.js';
import { createToolGapCollector, TOOL_GAP_AUDIT_ID, type ToolGapEntry } from '@jini-ai/daemon/tool-audit';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor, createRunLifecycle, createInMemoryEventLog } from '@jini-ai/daemon';
import type { RunProtocolEvent } from '@jini-ai/protocol';
import type { Express, Request, Response } from 'express';
import { buildToolGapsRegistrations } from '../../../assistant/tool-gaps-tool.js';
import { registerAdminToolGapsRoute } from '../../../server/inbound/admin-http/routes/system/tool-gaps.js';
import { redactSecretShapes } from '../../../contracts/core/secret-redaction.js';

/** The existing audit table on SQLite/PGlite: latest revision, scoped reads and no catalog noise. */
describeEachDialect('tool gap audit read', { tables: ['agent_tool_attempts'], make: kernel => kernel }, makeKernel => {
  test('A7: a real Bash event is redacted before storage and returned by the tool and Observability endpoint', async () => {
    const kernel = makeKernel();
    const secret = 'Sw0rdFish!'.repeat(2);
    const collector = createToolGapCollector({
      sink: new SqlToolAttemptAuditSink(kernel), workspaceId: 'w', principalId: 'owner',
      site: 'site-a', chatId: 'chat-a', runId: 'r', provider: 'claude',
      redact: text => redactSecretShapes({ text }).text,
    }, {});
    collector.observe({ event: {
      runId: 'r', eventId: 'r:1', opaqueCursor: '1', ts: 1000, protocolVersion: 1,
      durability: 'durable', kind: 'agent',
      payload: { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: `curl password=${secret}` } },
    } as RunProtocolEvent });
    await collector.flush();

    const raw = await kernel.run(db => db.selectFrom('agent_tool_attempts').select('detail').execute());
    assert.equal(raw.length, 1);
    assert.equal(JSON.stringify(raw).includes(secret), false, 'secrets must never enter durable audit rows');
    assert.match(raw[0]!.detail!, /REDACTED/);
    const toolGaps = createToolGapReader({ kernel }, {});
    const entries = await toolGaps.list({ workspaceId: 'w', principalId: 'owner' }, {});
    assert.equal(entries.length, 1);
    assert.deepEqual({ ...entries[0], id: 'generated' }, {
      id: 'generated', at: '1970-01-01T00:00:01.000Z', site: 'site-a', chatId: 'chat-a', runId: 'r',
      provider: 'claude', toolUsed: 'Bash', summary: 'curl password=[REDACTED:labeled_secret]', type: 'tool_gap', gapLine: null,
    });
    const deps = { workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner'), toolGaps };
    const registry = createToolRegistry({});
    for (const registration of buildToolGapsRegistrations(deps, {})) registry.register(registration);
    const { run } = await createRunLifecycle({ eventLog: createInMemoryEventLog({}) }).start({ contextRef: 'audit-test' });
    const result = await createToolExecutor({ registry }).execute({ principal: { id: 'owner' }, run, toolId: 'tool_gaps_list', input: {} });
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.output, { entries });

    let handler!: (req: Request, res: Response) => Promise<void>;
    registerAdminToolGapsRoute({ get: (_path: string, callback: typeof handler) => { handler = callback; } } as unknown as Express, deps);
    let body: unknown;
    const res = { locals: { principal: { id: 'owner' } }, json(value: unknown) { body = value; return this; } };
    await handler({ params: { workspaceId: 'w' } } as unknown as Request, res as unknown as Response);
    assert.deepEqual(body, { entries });
  });

  test('keeps latest explanations and filters workspace, principal and non-gap events before limiting', async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel);
    const base = { executionId: null, workspaceId: 'w', principalId: 'owner', runId: 'r', toolId: TOOL_GAP_AUDIT_ID, phase: 'requested' as const, at: '2026-10-17T00:00:00Z' };
    const entry: ToolGapEntry = { id: 'gap-a', at: base.at, site: 'a', chatId: 'c', runId: 'r', provider: 'claude', toolUsed: 'Bash', summary: 'ls', type: 'tool_gap', gapLine: null };
    await sink.append({ ...base, attemptId: 'gap-a' }, { detail: JSON.stringify(entry) });
    await sink.append({ ...base, attemptId: 'gap-a' }, { detail: JSON.stringify({ ...entry, type: 'tool_gap', gapLine: 'Tool gap: list — no Tovu tool for it.' }) });
    for (const override of [{ workspaceId: 'other' }, { principalId: 'admin' }, { toolId: 'content_read' }]) {
      await sink.append({ ...base, ...override, attemptId: 'excluded' }, { detail: JSON.stringify({ ...entry, id: 'excluded' }) });
    }
    const entries = await createToolGapReader({ kernel }, {}).list({ workspaceId: 'w', principalId: 'owner' }, { limit: 1 });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.id, 'gap-a');
    assert.match(entries[0]?.gapLine ?? '', /Tool gap: list/);
    // A separately constructed reader sees the same durable row.
    assert.deepEqual(await createToolGapReader({ kernel }, {}).list({ workspaceId: 'w', principalId: 'owner' }, {}), entries);
  });

  test('skips rows whose detail is not a tool-gap entry, and clamps the limit to 1..200 (non-finite falls back to 100)', async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel);
    const base = { executionId: null, workspaceId: 'w', principalId: 'owner', runId: 'r', toolId: TOOL_GAP_AUDIT_ID, phase: 'requested' as const, at: '2026-10-17T00:00:00Z' };
    const entryFor = (id: string): ToolGapEntry => ({ id, at: base.at, site: 'a', chatId: 'c', runId: 'r', provider: 'claude', toolUsed: 'Bash', summary: id, type: 'tool_gap', gapLine: null });
    for (let i = 0; i < 3; i += 1) await sink.append({ ...base, attemptId: `gap-${i}` }, { detail: JSON.stringify(entryFor(`gap-${i}`)) });
    await sink.append({ ...base, attemptId: 'garbled' }, { detail: '{ not json' });
    await sink.append({ ...base, attemptId: 'wrong-shape' }, { detail: JSON.stringify({ hello: 'world' }) });
    // Reader and list both called with their optional arguments omitted: the defaults apply.
    const reader = createToolGapReader({ kernel });
    const scope = { workspaceId: 'w', principalId: 'owner' };

    const all = await reader.list(scope);
    assert.deepEqual(all.map(entry => entry.id), ['gap-2', 'gap-1', 'gap-0'], 'undecodable rows are dropped, newest first');
    assert.deepEqual((await reader.list(scope, { limit: Number.NaN })).map(entry => entry.id), ['gap-2', 'gap-1', 'gap-0']);
    assert.deepEqual((await reader.list(scope, { limit: Number.POSITIVE_INFINITY })).map(entry => entry.id), ['gap-2', 'gap-1', 'gap-0']);
    // Limit applies to rows before decoding: the two newest rows are the undecodable ones.
    assert.deepEqual(await reader.list(scope, { limit: 2.9 }), []);
    assert.deepEqual(await reader.list(scope, { limit: -5 }), [], 'below 1 clamps to one row (the newest, undecodable)');
    assert.deepEqual((await reader.list(scope, { limit: 3 })).map(entry => entry.id), ['gap-2']);
    assert.deepEqual((await reader.list(scope, { limit: 10_000 })).map(entry => entry.id), ['gap-2', 'gap-1', 'gap-0']);
  });
});
