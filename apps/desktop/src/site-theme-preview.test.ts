import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteThemePreviewSubscriptions, openSiteThemePreviewStream } from './site-theme-preview.ts';

test('one stream per running watched site, live target on restart, and stale callbacks cannot cross lifecycles', () => {
  const targets = new Map<string, { port: number; workspaceId: string; partition: string; lifecycle: object }>();
  const target = (port: number) => ({ port, workspaceId: 'ws', partition: `partition-${port}`, lifecycle: {} });
  targets.set('/a', target(4100)); targets.set('/b', target(4200));
  const opened: { siteDir: string; port: number; closed: boolean; onFrame: (frame: { revision: string; path?: string }) => void }[] = [];
  const delivered: unknown[] = [];
  const manager = createSiteThemePreviewSubscriptions({ ports: {
    current: ({ siteDir }) => targets.get(siteDir),
    open: ({ siteDir, target, onFrame }) => {
      const stream = { siteDir, port: target.port, onFrame, closed: false }; opened.push(stream);
      return () => { stream.closed = true; };
    },
  } });
  const a = manager.watch({ siteDir: '/a', listener: (frame) => delivered.push(['a', frame]) });
  const a2 = manager.watch({ siteDir: '/a', listener: (frame) => delivered.push(['a2', frame]) });
  const b = manager.watch({ siteDir: '/b', listener: (frame) => delivered.push(['b', frame]) });
  assert.equal(opened.length, 2);
  opened[0]!.onFrame({ revision: 'one', path: '/about' });
  opened[0]!.onFrame({ revision: 'one', path: '/about' });
  assert.deepEqual(delivered, [['a', { siteDir: '/a', revision: 'one', path: '/about' }], ['a2', { siteDir: '/a', revision: 'one', path: '/about' }]]);
  a(); assert.equal(opened[0]!.closed, false);
  manager.stop({ siteDir: '/a' }); targets.delete('/a');
  opened[0]!.onFrame({ revision: 'late' }); assert.equal(delivered.length, 2);
  targets.set('/a', target(4300)); manager.sync({ siteDir: '/a' });
  assert.equal(opened[2]!.port, 4300);
  opened[2]!.onFrame({ revision: 'restart' }); assert.equal(delivered.length, 3);
  a2(); assert.equal(opened[2]!.closed, true);
  b(); assert.equal(opened[1]!.closed, true);
  manager.dispose();
});

test('a stopped site opens no stream; a throwing opener cannot fail a tab and may retry next lifecycle', () => {
  let running = false, opens = 0;
  const manager = createSiteThemePreviewSubscriptions({ ports: {
    current: () => running ? { port: 4000, workspaceId: 'ws', partition: 'own', lifecycle: {} } : undefined,
    open: () => { opens++; throw new Error('unavailable'); },
  } });
  const off = manager.watch({ siteDir: '/a', listener: () => assert.fail('no frames') });
  assert.equal(opens, 0);
  running = true; assert.doesNotThrow(() => manager.sync({ siteDir: '/a' }));
  assert.equal(opens, 1); off(); manager.dispose();
});

test('stream uses injected authenticated fetch, passes the live revision on reconnect, and rejects malformed frames', () => {
  const events = new Map<string, (event: { data: string }) => void>();
  const received: unknown[] = [], calls: unknown[] = [];
  let revision: string | undefined, closed = false;
  let fetchStream!: (url: string, init: unknown) => Promise<unknown>;
  const dispose = openSiteThemePreviewStream({
    target: { port: 4100, workspaceId: 'own ws', partition: 'own', lifecycle: {} },
    getRevision: () => revision,
    onFrame: (frame) => received.push(frame),
    fetch: async (url, init) => { calls.push([url, init]); return {} as never; },
  }, {
    open: (url, options) => {
      assert.equal(url, 'http://127.0.0.1:4100/api/admin/v1/workspaces/own%20ws/settings/events?themePreview=1');
      fetchStream = options.fetch as never;
      return { addEventListener: (name, listener) => { events.set(name, listener); }, close: () => { closed = true; } };
    },
  });
  void fetchStream('ignored', {}); revision = 'saved'; void fetchStream('ignored', {});
  assert.equal(new URL(String((calls[1] as unknown[])[0])).searchParams.get('themeRevision'), 'saved');
  for (const data of ['bad json', '{}', '{"revision":7}', '{"revision":"bad space"}']) events.get('theme-preview-refresh')!({ data });
  events.get('theme-preview-refresh')!({ data: '{"revision":"valid","path":"/about"}' });
  assert.deepEqual(received, [{ revision: 'valid', path: '/about' }]);
  dispose(); assert.equal(closed, true);
  events.get('theme-preview-refresh')!({ data: '{"revision":"late"}' });
  assert.equal(received.length, 1);
});
