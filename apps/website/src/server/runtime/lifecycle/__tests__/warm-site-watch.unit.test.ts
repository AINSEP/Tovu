import { createRequire } from 'node:module';
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createLocalSiteProcessPort } from '../local-site-process.js';

test('a warm source site reloads server edits through tsx watch and keeps one management host', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'warm-site-watch-'));
  const siteDir = path.join(root, 'sites/alpha');
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(path.join(siteDir, 'config.json'), JSON.stringify({ name: 'alpha' }));
  writeFileSync(path.join(siteDir, '.site-meta.json'), JSON.stringify({ siteId: 'warm-watch-alpha', templateId: 'blank',
    templateVersion: '1', schemaTag: 'test', schemaVersion: 0, createdAt: '2026-11-03' }));
  const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough() });
  const host = createLocalSiteProcessPort({ switcherBase: root }, {
    env: { TOVU_SITES_HOME: path.join(root, 'sites'), TOVU_DISABLE_DEV_TLS: '1', TOVU_DEV_WARM_SITES: '1',
      // development/scripts/dev.mjs supplies the tsx watcher CLI; the shipped server never resolves it.
      TOVU_DEV_TSX_CLI: createRequire(import.meta.url).resolve('tsx/cli'),
      TOVU_DEV_WARM_CONTROL_URL: 'http://localhost:3000', TOVU_DEV_WARM_CONTROL_WORKSPACE: 'owner', TOVU_ADMIN_DIST: '/prebuilt' },
    processOptions: { spawn: ({ args, options }) => {
      assert.ok(args.includes('watch'), 'server dependencies must be watched, not imported just once');
      assert.equal(options.env?.TOVU_LOCAL_SITE_WATCH, '1');
      assert.equal(options.env?.TOVU_DEV_WARM_CONTROL_URL, 'http://localhost:3000');
      assert.equal(options.env?.TOVU_DEV_WARM_CONTROL_WORKSPACE, 'owner');
      assert.equal(options.env?.TOVU_ENABLE_SITE_SWITCHER, '1');
      return child as unknown as ChildProcess;
    } },
  });
  t.after(async () => { child.stdout.end(); child.stderr.end(); await host.dispose!(); rmSync(root, { recursive: true, force: true }); });
  await host.launch({ name: 'alpha', port: 3101, daemonPort: 3102 });
});
