/** F9 (Stryker L15 tovu-server 86.3 %): the boot-token redaction must remove the WHOLE token line
 * (a one-char match would leak the rest), each CLI line regex is anchored per side, and the spawned
 * environment drops inherited relocation/render capabilities (site-scoped ones only with a site). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCliEnv, parseBootLine, parseBootToken, parseCliErrorLine, redactBootToken } from './tovu-server.ts';

test('redactBootToken removes the entire token line (LF or CRLF, empty token too) and keeps the rest', () => {
  // Built at runtime so the repo's gitleaks scan never sees a secret-shaped literal in source.
  const secret = ['b00tT0ken', 'SECRET-1234567890'].join('');
  for (const [input, expected] of [
    [`tovu serve: bootToken=${secret}\nnext line`, 'next line'],
    [`before\ntovu serve: bootToken=${secret}\r\nafter`, 'before\nafter'],
    ['tovu serve: bootToken=\nafter', 'after'],
    [`tovu serve: bootToken=${secret}`, ''],
  ] as const) {
    const out = redactBootToken(input);
    assert.equal(out, expected, JSON.stringify(input));
    assert.equal(out.includes('SECRET'), false);
  }
  assert.equal(redactBootToken('x'.repeat(3000)).length, 2000);
});

test('parseBootToken reads only a whole line: no prefix, no trailing text', () => {
  assert.equal(parseBootToken('starting\ntovu serve: bootToken=abc123\nready'), 'abc123');
  for (const text of ['xtovu serve: bootToken=abc', 'tovu serve: bootToken=abc extra', 'tovu serve: bootToken=', 'nothing']) assert.equal(parseBootToken(text), null, text);
});

test('parseBootLine reads only a whole boot line', () => {
  const line = 'tovu serve: dir=/sites/a b port=4100 schemaVersion=7 workspaceId=ws_1';
  assert.deepEqual(parseBootLine(`log\n${line}\nmore`), { dir: '/sites/a b', port: 4100, schemaVersion: 7, workspaceId: 'ws_1' });
  for (const text of [`> ${line}`, `${line} trailing`, 'tovu serve: dir=/a port=x schemaVersion=1 workspaceId=w']) assert.equal(parseBootLine(text), null, text);
});

test('parseCliErrorLine reads only a line that starts with "tovu: <code>: "', () => {
  assert.deepEqual(parseCliErrorLine('noise\ntovu: SITE_LOCKED: another process holds it\n'), { code: 'SITE_LOCKED', message: 'another process holds it' });
  for (const text of ['error tovu: CODE: msg', 'tovu:CODE: msg', 'tovu: CODE msg']) assert.equal(parseCliErrorLine(text), null, text);
});

test('buildCliEnv drops inherited relocation and render capabilities, and the site-scoped ones only with a site', () => {
  const base = { PATH: '/bin', TOVU_PLUGINS_DIR: '/p', TOVU_SKILLS_DIR: '/s', TOVU_AGENT_PLUGINS_DIR: '/a', JINI_DESKTOP_RENDER_URL: 'http://x', JINI_DESKTOP_RENDER_TOKEN: 'tok', TOVU_SITE_DIR: '/old', TOVU_AGENT_CWD: '/cwd',
    PORT: '1', TOVU_CONTENT_DB: '/db', TOVU_DB: '/db2', TOVU_ADMIN_PASSWORD: 'inherited-half' };
  const warnings: string[] = [];
  const withSite = buildCliEnv({ baseEnv: base, siteDir: '/sites/new' }, { warn: (m) => warnings.push(m) });
  const { TOVU_ADMIN_PASSWORD: password, ...rest } = withSite;
  assert.deepEqual(rest, { PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', TOVU_SITE_DIR: '/sites/new', TOVU_ADMIN_USER: 'admin' });
  assert.match(password!, /^[0-9a-f]{64}$/, 'a fresh pair: the inherited password half is never reused');
  assert.notEqual(buildCliEnv({ baseEnv: base, siteDir: '/sites/new' }, { warn: () => {} }).TOVU_ADMIN_PASSWORD, password);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /dropped inherited TOVU_PLUGINS_DIR, TOVU_SKILLS_DIR, TOVU_AGENT_PLUGINS_DIR, JINI_DESKTOP_RENDER_URL, JINI_DESKTOP_RENDER_TOKEN, TOVU_SITE_DIR, TOVU_AGENT_CWD;/);
  const noSite = buildCliEnv({ baseEnv: base }, { warn: () => {} });
  assert.deepEqual([noSite.TOVU_SITE_DIR, noSite.TOVU_AGENT_CWD, noSite.JINI_DESKTOP_RENDER_TOKEN, noSite.ELECTRON_RUN_AS_NODE], ['/old', '/cwd', undefined, '1']);
  const quiet: string[] = [];
  buildCliEnv({ baseEnv: { PATH: '/bin' } }, { warn: (m) => quiet.push(m) });
  assert.deepEqual(quiet, []);
  assert.equal(base.TOVU_PLUGINS_DIR, '/p', 'the caller env is never mutated');
});
