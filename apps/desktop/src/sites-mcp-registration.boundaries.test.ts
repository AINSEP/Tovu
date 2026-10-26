/** F9 (Stryker L15 sites-mcp-registration 88.6 %): the operator's `enabled` read at the 2xx boundary
 * (199/200/299/300 — a non-2xx read must be "unknown" so nothing overwrites their choice), hostile
 * list bodies, the launcher exec-boundary guard per character, and the transient-path / durable-
 * launcher anchors. Fake `net`; temp files only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertShellQuotable, isTransientAppPath, launcherNamesDurableInstall, readSitesMcpEnabled } from './sites-mcp-registration.ts';

function net(status: number, bodyText?: string) {
  const urls: string[] = [];
  return {
    urls,
    request(options: { url: string }) {
      urls.push(options.url);
      const handlers: Record<string, (value?: unknown) => void> = {};
      return {
        setHeader: () => {}, write: () => {},
        on: (event: string, handler: (value?: unknown) => void) => { handlers[event] = handler; },
        end: () => handlers.response?.({ statusCode: status, on: (event: string, handler: (chunk?: string) => void) => {
          if (event === 'data' && bodyText !== undefined) handler(bodyText);
          if (event === 'end') handler();
        } }),
      };
    },
  };
}
const read = (status: number, body?: unknown, raw?: string) =>
  readSitesMcpEnabled({ net: net(status, raw ?? (body === undefined ? undefined : JSON.stringify(body))) as never, session: {}, adminUrl: 'http://127.0.0.1:4100', workspaceId: 'ws/1' });

test('only a 2xx list read is trusted: 199 and 300 are unknown (never "absent", which would overwrite the operator)', async () => {
  const servers = { servers: [] };
  assert.deepEqual(await read(200, servers), { state: 'absent' });
  assert.deepEqual(await read(299, servers), { state: 'absent' });
  assert.deepEqual(await read(199, servers), { state: 'unknown', reason: 'GET responded 199' });
  assert.deepEqual(await read(300, servers), { state: 'unknown', reason: 'GET responded 300' });
});

test('a 2xx list without a servers array (non-JSON, null, object) is unknown; null rows are skipped', async () => {
  const noArray = { state: 'unknown', reason: 'the external-MCP list response carried no servers array' };
  assert.deepEqual(await read(200, undefined, 'not json'), noArray);
  assert.deepEqual(await read(200, null), noArray);
  assert.deepEqual(await read(200, { servers: { 'tovu-desktop': {} } }), noArray);
  assert.deepEqual(await read(200, { servers: [null, { serverId: 'tovu-desktop', enabled: false }] }), { state: 'present', enabled: false });
});

test('only an explicit false disables: a missing or non-boolean enabled reads as enabled', async () => {
  for (const [enabled, expected] of [[false, false], [true, true], [undefined, true], ['false', true], [0, true]] as const) {
    assert.deepEqual(await read(200, { servers: [{ serverId: 'tovu-desktop', enabled }] }), { state: 'present', enabled: expected }, String(enabled));
  }
});

test('assertShellQuotable: a launcher value must be a non-empty string without quotes or line breaks', () => {
  assert.equal(assertShellQuotable('/Applications/Tovu.app/x', 'electronPath'), '/Applications/Tovu.app/x');
  for (const value of ['', 5, null, undefined]) assert.throws(() => assertShellQuotable(value, 'electronPath'), { message: 'projects-mcp-registration: electronPath must be a non-empty string.' });
  for (const value of ["/a'b", '/a\nb', '/a\rb', "'"]) assert.throws(() => assertShellQuotable(value, 'bridgePath'), { message: 'projects-mcp-registration: bridgePath contains a quote or newline and cannot be used in the launcher script.' }, JSON.stringify(value));
});

test('isTransientAppPath: AppTranslocation anywhere; a read-only volume only at the start of the path', () => {
  const asked: string[] = [];
  const readOnly = (root: string) => { asked.push(root); return true; };
  assert.equal(isTransientAppPath('/private/var/folders/x/AppTranslocation/ab/Tovu.app', { isReadOnlyVolume: readOnly }), true);
  assert.equal(isTransientAppPath('/Volumes/Tovu 1.2/Tovu.app/Contents/MacOS/Tovu', { isReadOnlyVolume: readOnly }), true);
  assert.deepEqual(asked, ['/Volumes/Tovu 1.2']);
  assert.equal(isTransientAppPath('/Users/x/Volumes/Disk/Tovu.app', { isReadOnlyVolume: readOnly }), false);
  assert.equal(isTransientAppPath('/Volumes/Disk/Tovu.app', { isReadOnlyVolume: () => false }), false);
  assert.deepEqual(asked, ['/Volumes/Tovu 1.2']);
});

test('launcherNamesDurableInstall: only a line STARTING with exec naming an existing, non-transient binary', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-launcher-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const binary = path.join(dir, 'Electron');
  fs.writeFileSync(binary, '');
  const launcher = path.join(dir, 'launcher.sh');
  const durable = (script: string, readOnly = false) => { fs.writeFileSync(launcher, script); return launcherNamesDurableInstall(launcher, () => readOnly); };
  assert.equal(durable(`#!/bin/sh\nexec '${binary}' --flag "$@"\n`), true);
  assert.equal(durable(`#!/bin/sh\necho x; exec '${binary}'\n`), false);
  assert.equal(durable(`#!/bin/sh\nexec '${path.join(dir, 'missing')}'\n`), false);
  assert.equal(durable('#!/bin/sh\necho unavailable\n'), false);
  assert.equal(launcherNamesDurableInstall(path.join(dir, 'none.sh'), () => false), false);
});
