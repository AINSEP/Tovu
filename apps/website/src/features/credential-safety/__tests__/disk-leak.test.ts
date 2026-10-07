import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Boolean byte comparisons avoid ever printing credential bytes in assertion diagnostics.
const includesCanary = (bytes: Buffer, canary: string) => ['utf8', 'utf16le'].some(encoding => bytes.includes(Buffer.from(canary, encoding as BufferEncoding))) || bytes.includes(Buffer.from(Buffer.from(canary).toString('base64'))) || bytes.includes(Buffer.from(Buffer.from(canary).toString('hex')));

test('real raw PUT seals the canary: content.db, its WAL and the temp site server log contain no credential bytes', { timeout: 60000 }, async t => {
  const site = mkdtempSync(join(tmpdir(), 'tovu-credential-site-'));
  const canary = 'c3_disk_canary_Q7pR8sT9uV0wX1yZ2aB3_a9F2';
  const fixture = join(site, 'input.fixture.json');
  writeFileSync(fixture, JSON.stringify({ accessToken: canary }));
  assert.equal(includesCanary(readFileSync(fixture), canary), true, 'positive control: the input fixture contains the canary');
  const database = join(site, 'content.db'); const log = join(site, 'server.log'); const fd = openSync(log, 'w');
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./disk-server.fixture.ts', import.meta.url)), database], { stdio: ['ignore', fd, fd, 'ipc'], env: { ...process.env } });
  closeSync(fd);
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close'); child.kill('SIGTERM');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 10000);
      try { await closed; } finally { clearTimeout(deadline); }
    }
    rmSync(site, { recursive: true, force: true });
  });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message as { url: string }),
    once(child, 'exit').then(() => { throw new Error('fixture server exited before readiness; inspect queued server setup'); }),
    new Promise<never>((_, reject) => { const deadline = setTimeout(() => reject(new Error('fixture server readiness timed out')), 20000); deadline.unref(); }),
  ]);
  const endpoint = `${ready.url}/api/admin/v1/workspaces/credential-safety/mcp-servers/fixture`;
  const body = { transport: 'streamable_http', authMode: 'static_env', enabled: true, command: '', args: '', url: 'https://example.test/mcp', allowedToolNames: '', accessToken: canary };
  const put = async (accessToken: string | undefined) => fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, accessToken }) });
  assert.equal((await put(undefined)).status, 400, 'CREATE requires the token');
  const saved = await put(canary); assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.deepEqual(savedBody.server.accessTokenHint, { length: canary.length, last4: 'a9F2' });
  assert.equal(includesCanary(Buffer.from(JSON.stringify(savedBody)), canary), false, 'the saved response has no full credential');
  assert.equal((await put('')).status, 200, 'blank UPDATE keeps the token');
  const blank = await put('   '); assert.equal(blank.status, 400);
  assert.equal((await blank.json()).error, 'Enter a token. Spaces alone are not a token.');
  const oversized = await put('x'.repeat(8193)); assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).error, 'The token exceeds the 8192-character limit. Copy only the token.');
  const unsafe = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, url: `https://example.test/mcp?token=${canary}` }) });
  assert.equal(unsafe.status, 400); const unsafeBody = await unsafe.json();
  assert.equal(unsafeBody.error, 'Put credentials in the secret field, not in this field.');
  assert.equal(includesCanary(Buffer.from(JSON.stringify(unsafeBody)), canary), false, 'bad URL error must not echo the URL');
  const probe = await fetch(`${endpoint}/probe`, { method: 'POST' });
  assert.equal(probe.status, 401);
  assert.deepEqual(await probe.json(), { error: 'The server rejected this token.', code: 'MCP_AUTH_REJECTED' });
  const listed = await fetch(endpoint.slice(0, endpoint.lastIndexOf('/'))); const listedBody = await listed.json();
  assert.deepEqual(listedBody.servers[0].accessTokenHint, { length: canary.length, last4: 'a9F2' });
  assert.equal(includesCanary(Buffer.from(JSON.stringify(listedBody)), canary), false, 'GET never exposes the full secret');
  // Scan while SQLite is open: closing it may checkpoint/remove the WAL and hide a leak there.
  for (const file of [database, `${database}-wal`, log]) {
    assert.equal(existsSync(file), true, 'each real on-disk artifact must exist');
    assert.equal(includesCanary(readFileSync(file), canary), false, 'on-disk credential canary must be absent');
  }
  const planted = join(site, 'planted.control');
  writeFileSync(planted, Buffer.concat([readFileSync(`${database}-wal`), Buffer.from(canary)]));
  assert.equal(includesCanary(readFileSync(planted), canary), true, 'positive control: the same scan detects a planted copy');
});
