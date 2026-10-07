/** Execute main's actual wiring with injected Electron/session/lifecycle boundaries. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createSiteThemePreviewSubscriptions } from './site-theme-preview.ts';
import { sourceFunction } from './renderer/source-test-harness.ts';

const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function evaluate<T>(expression: string, deps: Record<string, unknown>): T {
  const js = ts.transpile(`const value = ${expression};`, { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), `${js}; return value;`)(...Object.values(deps)) as T;
}

test('main opens the real workspace stream with the site session and changes target after Stop/Restart', async () => {
  const declaration = sf.statements.filter(ts.isVariableStatement).flatMap((node) => [...node.declarationList.declarations]).find((node) => node.name.getText(sf) === 'siteThemePreviews');
  assert.ok(declaration?.initializer);
  const openSites = new Map<string, { server: { port: number; workspaceId: string } }>();
  const opens: { target: { port: number; workspaceId: string; partition: string }; close: () => void; fetch: (url: string, init: unknown) => unknown; onFrame: (frame: { revision: string }) => void }[] = [];
  const fetches: unknown[] = [], delivered: unknown[] = [];
  let closed = 0;
  const controller = evaluate<ReturnType<typeof createSiteThemePreviewSubscriptions>>(declaration.initializer.getText(sf), {
    createSiteThemePreviewSubscriptions, openSites, sitePartition: (siteDir: string) => `partition:${siteDir}`,
    session: { fromPartition: (partition: string) => ({ fetch: (url: string, init: unknown) => { fetches.push([partition, url, init]); return Promise.resolve({}); } }) },
    openSiteThemePreviewStream: (input: typeof opens[number]) => { opens.push(input); return () => { closed++; }; },
  });
  const off = controller.watch({ siteDir: '/a', listener: (frame) => delivered.push(frame) });
  let port = 4100;
  const open = sourceFunction(source, 'openSiteServer', {
    openSites, startSiteBackend: async () => ({ server: { port, workspaceId: 'own-workspace' } }),
    scheduleSitePreview: () => {}, siteThemePreviews: controller,
  });
  await open('/a', {});
  assert.equal(opens[0]!.target.port, 4100);
  assert.equal(opens[0]!.target.workspaceId, 'own-workspace');
  await opens[0]!.fetch('http://127.0.0.1:4100/events', { signal: 'sentinel' });
  assert.deepEqual(fetches, [['partition:/a', 'http://127.0.0.1:4100/events', { signal: 'sentinel', credentials: 'include' }]]);
  let cancelExpression: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'cancelPreviewCapture') cancelExpression = node.initializer.getText(sf);
    ts.forEachChild(node, visit);
  };
  visit(sf); assert.ok(cancelExpression);
  const cancel = evaluate<(input: { siteDir: string }, optional: {}) => void>(cancelExpression, { sitePreviewScheduler: { cancel: () => {} }, siteThemePreviews: controller });
  cancel({ siteDir: '/a' }, {}); openSites.delete('/a');
  opens[0]!.onFrame({ revision: 'late' }); assert.deepEqual(delivered, []);
  port = 4300; await open('/a', {});
  assert.equal(opens[1]!.target.port, 4300);
  opens[1]!.onFrame({ revision: 'fresh' }); assert.deepEqual(delivered, [{ siteDir: '/a', revision: 'fresh' }]);
  off(); assert.equal(closed, 2); controller.dispose();
});
