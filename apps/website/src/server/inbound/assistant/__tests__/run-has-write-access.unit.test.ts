import assert from 'node:assert/strict';
import test from 'node:test';
import { runHasWriteAccess, readOnlyAccessDisclosure, grantReadOnlyRunAccess } from '../run-has-write-access.js';

test('write, master and personal-MCP switches count as write access; web and subagents do not', () => {
  for (const key of ['enabled', 'shell', 'fileWrite', 'userMcp', 'userSettings', 'workflows', 'loginEnvironment']) {
    assert.equal(runHasWriteAccess({ keys: [key] }), true, key);
  }
  assert.equal(runHasWriteAccess({ keys: ['web', 'subagents'] }), false);
  assert.equal(runHasWriteAccess({ keys: ['web', 'fileWrite'] }), true);
});

test('an unknown consent key is treated as write access (fail safe)', () => {
  assert.equal(runHasWriteAccess({ keys: ['someFutureSwitch'] }), true);
});

test('an empty key list is not write access', () => {
  assert.equal(runHasWriteAccess({ keys: [] }), false);
});

test('the read-only key list is injectable', () => {
  assert.equal(runHasWriteAccess({ keys: ['web'] }, { readOnlyKeys: [] }), true);
});

test('the disclosure names the CLI, the switches it turned on and their reach', () => {
  const text = readOnlyAccessDisclosure({ name: 'Cli', keys: ['web'] });
  assert.match(text, /^Cli runs with Web fetch\/search on\./);
  assert.match(text, /can't run with it off/);
  assert.match(text, /Tovu and Jini tools, enabled plugin tools, and connected servers/);
  assert.match(text, /other chats on this site/);
});

// Mutations: always say "it"; drop the `?? key` fallback (an unlabelled key would print "undefined").
test('the disclosure lists several switches in order with a plural pronoun, naming an unlabelled key by its id', () => {
  const text = readOnlyAccessDisclosure({ name: 'Cli', keys: ['web', 'subagents', 'futureReadKey'] });
  assert.match(text, /^Cli runs with Web fetch\/search, Subagents\/Task, and futureReadKey on\. Cli can't run with them off, /);
});

test('the grant saves only the planned keys against the fresh revision, then discloses', async () => {
  const saved: unknown[] = []; const notices: string[] = [];
  const ok = await grantReadOnlyRunAccess({ name: 'Cli', agentId: 'cli', keys: ['web'],
    readFresh: async () => ({ allowed: true, revisionSeq: 4 }), isLive: async () => true,
    allow: async input => { saved.push(input); return true; }, disclose: async ({ detail }) => { notices.push(detail); } });
  assert.equal(ok, true);
  assert.deepEqual(saved, [{ agentId: 'cli', keys: ['web'], expectedRevisionSeq: 4 }]);
  assert.equal(notices.length, 1);
});

test('the grant refuses write keys, a blocked owner, a dead run and a stale save, without disclosing', async () => {
  const cases = [
    { keys: ['fileWrite'], allowed: true, live: true, save: true },
    { keys: ['web'], allowed: false, live: true, save: true },
    { keys: ['web'], allowed: true, live: false, save: true },
    { keys: ['web'], allowed: true, live: true, save: false },
  ];
  for (const c of cases) {
    const notices: string[] = [];
    const ok = await grantReadOnlyRunAccess({ name: 'Cli', agentId: 'cli', keys: c.keys,
      readFresh: async () => ({ allowed: c.allowed, revisionSeq: 1 }), isLive: async () => c.live,
      allow: async () => c.save, disclose: async ({ detail }) => { notices.push(detail); } });
    assert.equal(ok, false, JSON.stringify(c));
    assert.deepEqual(notices, []);
  }
});
