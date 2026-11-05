import assert from 'node:assert/strict';
import test from 'node:test';
import { openChatDb } from '#src/platform/db/sqlite/chat-db';
import { createChatRunLedger } from '#src/assistant/persistence/run-ledger';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import { createAssistantRunFinalizer, type RunDaemonClient } from '../runtime/composition/modules/assistant-run-finalizer.js';

test('a recovery launch rejection survives storage reload and the daemon replay', async () => {
  const db = openChatDb(':memory:');
  const ledger = createChatRunLedger({ store: db });
  const history = createChatStoreFactory(db)({ kind: 'user', workspaceId: 'ws', userId: 'admin' });
  const now = 1_790_000_000_000;
  await history.create({ id: 'chat' });
  const accepted = (await ledger.durable!.accept({ principalId: 'admin', workspaceId: 'ws',
    conversationId: 'chat', messageId: 'answer', runId: 'old', now,
    request: { agentId: 'opencode', contextRef: JSON.stringify({ prompt: 'Continue', conversationId: 'chat', assistantMessageId: 'answer' }) },
  }, {}))!;
  await ledger.checkpoint({ ...accepted, content: 'Saved answer', events: [{ kind: 'text', text: 'Saved answer' }] });
  let deliver!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { deliver = resolve; });
  let launches = 0;
  const daemon: RunDaemonClient = {
    runStatus: async () => 200,
    cancel: async () => {},
    launch: async () => { launches++; throw new Error('connection reset; Bearer private-value'); },
    openEvents: async () => response,
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => now + 20_000,
    scheduler: { schedule: () => () => {} },
  }, {});
  try {
    assert.equal(await finalizer.recover({ messageId: 'answer', trigger: 'attempt-failed' }, {}), 'continued');
    const reloaded = await ledger.durable!.load({ messageId: 'answer' }, {});
    assert.ok(reloaded);
    const diagnostic = reloaded.message.events?.find(event => event.kind === 'status' && event.code === 'run_launch_unconfirmed');
    assert.ok(diagnostic);
    assert.match(JSON.stringify(diagnostic), /recovery launch/);
    assert.match(JSON.stringify(diagnostic), /connection reset/);
    assert.ok(!JSON.stringify(diagnostic).includes('private-value'));
    deliver(new Response(`event: end\ndata: ${JSON.stringify({ runId: reloaded.runId, kind: 'end', payload: { status: 'succeeded', code: 0 } })}\n\n`));
    await finalizer.idle();
    const saved = await ledger.durable!.load({ messageId: 'answer' }, {});
    assert.ok(saved?.message.events?.some(event => JSON.stringify(event) === JSON.stringify(diagnostic)));
    assert.equal(saved?.message.content.includes('Saved answer'), true);
    assert.equal(launches, 1);
  } finally {
    deliver(new Response(''));
    await finalizer.idle();
    db.close();
  }
});
