import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '../../../..');

function fixture(t: TestContext, scripts: string[]) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(file: string, value: string) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  }
  write('package.json', '{"type":"module"}');
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const script of scripts) write(`development/scripts/${script}`, fs.readFileSync(path.join(REPO, 'development/scripts', script), 'utf8'));
  return {
    root, write,
    run(script: string, args: string[] = [], preload?: string) {
      return spawnSync(process.execPath, [
        '--import', 'tsx', ...(preload ? ['--import', path.join(root, preload)] : []),
        path.join(root, 'development/scripts', script), ...args,
      ], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, TSX_TSCONFIG_PATH: '' } });
    },
  };
}

// Behavioral CLI fixtures: production parsers and orchestration run unchanged; only effect owners
// are replaced. Replacing balanced interpolation with a regex or dropping bridge refusal must fail.
test('admin route CLI resolves nested placeholders and reports the unmatched concrete URL', t => {
  const f = fixture(t, ['check-admin-api-routes.ts', 'lib/admin-route-walk.ts']);
  f.write('apps/website/src/server/runtime/composition/app.js', `
    export const createRouteDeps = () => ({});
    export const createApp = () => ({ _router: { stack: [{
      match: url => url === '/api/admin/v1/workspaces/workspace-local/items/x1/approve',
      route: { methods: { get: true } }, handle: {}
    }] } });
  `);
  f.write('apps/admin/src/lib/api.ts', [
    'function base(id): string { return `/workspaces/${WORKSPACE_ID}/items/${id}`; }',
    'request(`${base(id)}/${action}${query ? "?q=" + ({ nested: true }).nested : ""}`);',
    'request("/missing\\\"quote");',
  ].join('\n'));
  const result = f.run('check-admin-api-routes.ts');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /checked 2 admin request\(\) calls/);
  assert.match(result.stdout, /no-route\tGET \/api\/admin\/v1\/missing/);
  assert.doesNotMatch(result.stdout, /no-route.*items/);
});

test('activation CLI lists explicit provenance and writes the enable decision through its owner', t => {
  const f = fixture(t, ['agent-plugin-activation.ts']);
  const dir = 'apps/website/src/features/agent-plugins/';
  f.write(`${dir}activation-effects.js`, `
    export const agentPluginActivations = {
      readAgentPluginActivations: async ({ workspaceRoot }) => {
        if (workspaceRoot !== 'tenant-root') throw Error('wrong tenant');
        return { plugins: { mail: { origin: 'bundled', updatedBy: 'operator', updatedAt: '2026-10-01' } } };
      },
      isAgentPluginActive: ({ pluginId }) => pluginId === 'mail',
      setAgentPluginActivation: async input => {
        if (input.workspaceRoot !== 'tenant-root' || input.pluginId !== 'mail' || input.enabled !== true) throw Error('wrong activation');
        console.log('decision persisted');
      }
    };
  `);
  f.write(`${dir}layout.js`, `export const resolveAgentPluginLayout = () => ({ forWorkspace: id => {
    if (id !== 'tenant') throw Error('wrong workspace'); return { root: 'tenant-root' };
  } });`);
  f.write(`${dir}lifecycle.js`, `export const listInstalledPlugins = async root => {
    if (root !== 'tenant-root') throw Error('wrong root');
    return [{ pluginId: 'mail', archiveDigest: '123456789012abcdef' }];
  };`);
  const listed = f.run('agent-plugin-activation.ts', ['list', '--workspace', 'tenant']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /ACTIVE  .*mail.*\[123456789012\].*bundled, set by operator at 2026-10-01/);
  const enabled = f.run('agent-plugin-activation.ts', ['enable', '--workspace', 'tenant', 'mail']);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.match(enabled.stdout, /decision persisted\nAgent Plugin 'mail' is now ACTIVE for workspace tenant/);
});

test('outbox CLI ignores comment/string decoys and distinguishes raw adapters from unresolved deps', t => {
  const f = fixture(t, ['check-outbox-bridge.ts']);
  f.write('source/example.ts', [
    '// createEntry({ deps: { outbox: raw } });',
    'const decoy = "createTerm({ deps: { outbox: raw } })";',
    'createEntry({ deps: { nested: { outbox: wrong }, outbox: toEntryOutbox(deps) } });',
    'function depsForTerm() { return { outbox: toTaxonomyOutbox(deps) }; }',
    'createTerm({ deps: depsForTerm() });',
    'publishEntry({ deps: { outbox: raw } });',
    'assignTerms({ deps: missingDeps() });',
  ].join('\n'));
  const result = f.run('check-outbox-bridge.ts', ['--dir', path.join(f.root, 'source')]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /1 OUTBOX_BRIDGE_SKIPPED finding/);
  assert.match(result.stderr, /example\.ts:6.*publishEntry.*outbox: raw/);
  assert.match(result.stderr, /1 UNRESOLVED finding/);
  assert.match(result.stderr, /example\.ts:7.*assignTerms.*missingDeps/);
});

test('registry drift CLI skips projects with no registry Jini dependencies', t => {
  const f = fixture(t, ['check-jini-registry-drift.mjs']);
  f.write('apps/admin/package.json', '{"type":"module"}');
  const result = f.run('check-jini-registry-drift.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/SKIP  no registry-resolved @jini-ai\/\* dependencies/g)?.length, 2);
  assert.match(result.stdout, /all pinned @jini-ai\/\* packages match/);
});

test('brand icon CLI keeps the letter and removes the disconnected frame from the simplified master', async t => {
  const { default: sharp } = await import('sharp');
  const f = fixture(t, ['build-brand-icons.mjs']);
  const logo = path.join(f.root, 'content/brand/logo/tovu-logo.png');
  fs.mkdirSync(path.dirname(logo), { recursive: true });
  // Keep gold artwork inside the safe tile crop; edges must measure the tile, not the frame.
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254">
    <rect width="1254" height="1254" fill="#000"/>
    <rect x="100" y="100" width="1054" height="1054" fill="#323232"/>
    <rect x="260" y="260" width="690" height="690" fill="none" stroke="#c89614" stroke-width="20"/>
    <rect x="550" y="450" width="100" height="300" fill="#c89614"/>
    <rect x="1000" y="1000" width="10" height="10" fill="#c89614"/>
  </svg>`)).png().toFile(logo);
  // iconutil is an external packager, outside the pixel-processing contract exercised here.
  f.write('iconutil-port.mjs', `import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
    cp.execFileSync = (command, args) => {
      if (command !== 'iconutil' || args[0] !== '-c' || args[1] !== 'icns') throw Error('unexpected command');
      return Buffer.alloc(0);
    }; syncBuiltinESMExports();`);
  const result = f.run('build-brand-icons.mjs', [], 'iconutil-port.mjs');
  assert.equal(result.status, 0, result.stderr);
  const full = await sharp(path.join(f.root, 'content/brand/icons/master/logo-1024.png')).raw().toBuffer({ resolveWithObject: true });
  const simple = await sharp(path.join(f.root, 'content/brand/icons/master/logo-simplified-1024.png')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(simple.info.width, 1024);
  assert.equal(simple.info.height, 1024);
  assert.equal(simple.info.channels, 4);
  const pixel = (data: Buffer, x: number, y: number) => [...data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
  assert.deepEqual(pixel(simple.data, 491, 491), [200, 150, 20, 255]);
  assert.deepEqual(pixel(full.data, 221, 491), [200, 150, 20, 255]);
  assert.deepEqual(pixel(simple.data, 221, 491), [50, 50, 50, 255]);
  assert.equal(pixel(simple.data, 0, 0)[3], 0);
});

test('trash backfill CLI opens dry runs read-only and reports absent domain tables', t => {
  const f = fixture(t, ['backfill-trashed-items.ts']);
  f.write('development/scripts/backfill-db-path.js', `export const resolveExistingDbPath = value => value;`);
  f.write('apps/website/src/features/trash/index.js', `export const TRASH_RETENTION_DAYS = 60;
    export const computePurgeAfter = () => '2026-12-27T00:00:00.000Z';`);
  f.write('apps/website/src/platform/db/sqlite/content-db.js', `
    export const openContentDb = () => { throw Error('dry run attempted write open'); };
    export const openContentDbReadOnly = () => ({ $client: { prepare: sql => {
      if (sql !== "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?") throw Error('unexpected query');
      return { get: () => undefined };
    } } });`);
  f.write('apps/website/src/platform/db/sqlite/db-ops.js', `export class SqliteDbOpsAdapter {
    constructor() { throw Error('dry run attempted restore capture'); }
  }`);
  const result = f.run('backfill-trashed-items.ts', ['--db', 'fixture.db']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/table not present in this database, skipped/g)?.length, 4);
  assert.match(result.stdout, /DRY RUN: 0 row\(s\) total\. Re-run with --apply to write/);
});

function openApiFixture(t: TestContext, script: string, operations: object[]) {
  const f = fixture(t, [script, 'lib/secret-patterns.ts']);
  f.write('development/scripts/lib/openapi-operations.js', `
    export const loadOpenApiOperations = () => ${JSON.stringify(operations)};
    export const buildUrl = op => op.urlTemplate;
  `);
  f.write('development/scripts/lib/tovu-test-server.js', `
    export const loginOwner = async () => 'owner-cookie';
    export const loginBarePrincipal = async () => 'bare-cookie';
    export const startTovuServer = async () => ({ baseUrl: 'https://fixture.invalid', routeDeps: {},
      close: async () => console.log('closed:' + JSON.stringify(globalThis.requests)) });
  `);
  return f;
}

test('OpenAPI contract CLI selects every applicable probe and closes after idempotency replays', t => {
  const op = { file: 'fixture.yaml', operationId: 'update_item', method: 'post', urlTemplate: '/fixture',
    pathParams: ['workspaceId', 'id'], statusCodes: ['401', '403', '404'], requiresAuth: true, requestBodyRequired: true };
  const f = openApiFixture(t, 'check-openapi-contract.ts', [op]);
  f.write('development/scripts/lib/openapi-contract-fixtures.js', `
    export const seedContractProbeForm = async () => 'seeded-form';
    export const buildContractProbeRequest = ({ probeType, headers }) => ({ probeType,
      expectedStatus: ({ AUTH_401: '401', PERM_403: '403', WORKSPACE_404: '404', RESOURCE_404: '404' })[probeType],
      url: '/probe/' + probeType, headers });
  `);
  f.write('fetch-port.mjs', `
    globalThis.requests = []; const seen = new Set();
    globalThis.fetch = async (url, init) => {
      globalThis.requests.push(url.replace('https://fixture.invalid', ''));
      if (url.includes('/probe/')) {
        const type = url.split('/').pop();
        const cookie = init.headers.cookie;
        if (type === 'AUTH_401' && cookie !== undefined) throw Error('unexpected auth');
        if (type === 'PERM_403' && cookie !== 'bare-cookie') throw Error('wrong principal');
        if (type.endsWith('404') && cookie !== 'owner-cookie') throw Error('wrong owner');
        return new Response('{}', { status: Number(type.split('_')[1]) });
      }
      if (init.method !== 'POST' || init.headers.cookie !== 'owner-cookie' || !init.headers['Idempotency-Key']) throw Error('invalid replay request');
      const status = seen.has(url) ? 409 : 201; seen.add(url); return new Response('{}', { status });
    };
  `);
  const result = f.run('check-openapi-contract.ts', [], 'fetch-port.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TOTAL: 7\/7 passed/);
  const closed = result.stdout.split('\n').find(line => line.startsWith('closed:'));
  assert.ok(closed);
  assert.deepEqual(JSON.parse(closed.slice(7)), [
    '/probe/AUTH_401', '/probe/PERM_403', '/probe/WORKSPACE_404', '/probe/RESOURCE_404',
    '/api/admin/v1/workspaces/workspace-local/posts', '/api/admin/v1/workspaces/workspace-local/posts',
    '/api/admin/v1/workspaces/workspace-local/pages', '/api/admin/v1/workspaces/workspace-local/pages',
    '/api/admin/v1/workspaces/workspace-local/forms', '/api/admin/v1/workspaces/workspace-local/forms',
  ]);
});

test('secret leak CLI preserves the canary pair during the sweep and fails on a leaked canary', t => {
  const base = { file: 'fixture.yaml', pathParams: ['workspaceId'], statusCodes: ['200'], requiresAuth: true,
    requestBodyRequired: true, successResponse: { status: '200', description: 'no secret material' } };
  const providers = '/api/admin/v1/workspaces/workspace-local/media/providers';
  const operations = [
    { ...base, method: 'put', operationId: 'replace_media_providers', urlTemplate: providers },
    { ...base, method: 'get', operationId: 'get_media_providers', urlTemplate: providers },
    { ...base, method: 'post', operationId: 'create_fixture', urlTemplate: '/fixture/create' },
  ];
  const f = openApiFixture(t, 'check-openapi-secret-leaks.ts', operations);
  f.write('fetch-port.mjs', `
    globalThis.requests = []; let secret;
    globalThis.fetch = async (url, init = {}) => {
      const pathname = new URL(url).pathname; globalThis.requests.push(pathname);
      if (init.headers.cookie !== 'owner-cookie') throw Error('missing auth');
      if (pathname === '${providers}' && init.method === 'PUT') {
        if (secret) throw Error('canary overwritten'); secret = JSON.parse(init.body).openai.apiKey;
        return new Response('{}');
      }
      if (pathname === '${providers}' && !init.method) return new Response(JSON.stringify({ leaked: secret }));
      if (pathname === '/fixture/create' && init.method === 'POST' && init.body === '{}') return new Response('{}');
      throw Error('unexpected request');
    };
  `);
  const result = f.run('check-openapi-secret-leaks.ts', [], 'fetch-port.mjs');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /LEAK: the injected canary secret appeared in 1 response\(s\)/);
  assert.match(result.stdout, /closed:\["\/api\/admin\/v1\/workspaces\/workspace-local\/media\/providers","\/api\/admin\/v1\/workspaces\/workspace-local\/media\/providers","\/fixture\/create"\]/);
});

test('coverage triage CLI includes complexity-only files absent from both coverage tiers', t => {
  const f = fixture(t, ['classify-coverage-gaps.ts']);
  f.write('development/scripts/route-coverage-lib.js', `
    export const LCOV_UNIT_PATH = 'unit'; export const LCOV_INTEGRATION_PATH = 'integration';
    export const loadRouteCoverage = () => [{ file: 'covered.ts', brf: 5 }];
  `);
  f.write('development/scripts/check-src-complexity-drift.js', `export const findViolations = () => [
    { file: 'untested.ts', rule: 'complexity', reason: 'too complex' }
  ];`);
  f.write('development/scripts/check-route-coverage-diff.js', `export const evaluateFileTiers = (file, unit, integration) => ({
    file, ok: Boolean(unit && integration), unit: { detail: unit ? 'covered' : 'missing' },
    integration: { detail: integration ? 'covered' : 'missing' }
  });`);
  const result = f.run('classify-coverage-gaps.ts');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 file\(s\) below tier threshold, 2 scanned/);
  assert.match(result.stdout, /ARCHITECTURE_DEBT \(1\)/);
  assert.match(result.stdout, /untested\.ts: unit missing, integration missing\n\s+\[complexity\] too complex/);
});

test('web dev CLI attaches to the selected running site and opens its admin URL', t => {
  const f = fixture(t, ['dev.mjs']);
  f.write('development/scripts/dev-sites-home.mjs', `export const devSitesHome = () => ({
    running: { app: 'desktop', port: 3123, scheme: 'https' }
  });`);
  f.write('development/scripts/dev-api-watch.mjs', 'export const apiWatchArgs = () => [];');
  f.write('development/scripts/prune-tsx-cache.mjs', 'export const pruneTsxCache = () => { throw Error("unexpected prune"); };');
  f.write('development/scripts/load-repo-root-env.mjs', 'export const loadRepoRootEnvFile = () => false;');
  f.write('development/scripts/local-dev-plugin-install.mjs', 'export const localDevPluginInstallEnv = () => ({});');
  f.write('development/scripts/port-listeners.mjs', 'export const listenersOn = () => { throw Error("unexpected preflight"); };');
  f.write('spawn-port.mjs', `import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    cp.spawn = (command, args) => {
      if (!['open', 'explorer.exe', 'xdg-open'].includes(command) || args.length !== 1 || args[0] !== 'https://localhost:3123/admin/') throw Error('wrong open');
      console.log('opened:' + args[0]); return new EventEmitter();
    }; syncBuiltinESMExports();`);
  const result = f.run('dev.mjs', [], 'spawn-port.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Running in desktop \(port 3123\)/);
  assert.match(result.stdout, /opened:https:\/\/localhost:3123\/admin\//);
});

test('desktop dev CLI builds preload before watching and forwards Electron flags on normal exit', t => {
  const f = fixture(t, ['dev-desktop.mjs']);
  f.write('development/scripts/free-port.mjs', 'export const pickFreePort = () => { throw Error("unexpected probe"); };');
  f.write('development/scripts/load-repo-root-env.mjs', 'export const loadRepoRootEnvFile = () => false;');
  f.write('development/scripts/local-dev-plugin-install.mjs', 'export const localDevPluginInstallEnv = () => ({});');
  f.write('development/scripts/port-listeners.mjs', 'export const listenersOn = () => [];');
  f.write('development/scripts/prune-tsx-cache.mjs', 'export const pruneTsxCache = async () => {};');
  f.write('spawn-port.mjs', `import cp from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module'; import { EventEmitter } from 'node:events';
    process.env.TOVU_DESKTOP_DISABLE_ADMIN_VITE = '1'; process.kill = () => true;
    cp.spawnSync = (command, args) => {
      if (command !== 'npm' || args.join(' ') !== 'run build:preload') throw Error('unexpected build');
      console.log('preload complete'); return { status: 0 };
    };
    cp.spawn = (command, args, options) => {
      if (command !== 'npm') throw Error('unexpected process');
      const child = Object.assign(new EventEmitter(), { pid: 99999999, exitCode: null, signalCode: null });
      console.log('spawn:' + args.join(' '));
      if (args[1] === 'watch:renderer') {
        const entry = path.join(options.cwd, 'dist/renderer/index.html'); fs.mkdirSync(path.dirname(entry), { recursive: true });
        fs.writeFileSync(entry, 'fresh renderer'); const fresh = new Date(Date.now() + 1000); fs.utimesSync(entry, fresh, fresh);
      } else if (args[1] === 'dev') setTimeout(() => child.emit('exit', 0, null), 0);
      else throw Error('unexpected npm script');
      return child;
    }; syncBuiltinESMExports();`);
  const result = f.run('dev-desktop.mjs', ['--remote-debugging-port=9234'], 'spawn-port.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preload complete[\s\S]*spawn:run watch:renderer[\s\S]*spawn:run dev -- --remote-debugging-port=9234/);
  assert.match(result.stdout, /electron exited \(code 0, signal none\)/);
});
