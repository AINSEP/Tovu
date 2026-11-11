/** F9 (Stryker L15 agent-plugin-tokens 85.5 %, credentials): the plugin-id pattern per anchor and
 * length, the token count/length limits at limit and limit+1, null/undefined input, the created-tokens
 * line regex per anchor, the help-URL scheme anchor and the listing child's failure + scratch cleanup. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { assertTokensCanReachFolder, cleanCreateTokens, initTokenOptions, listTokenSignInPlugins, parseCreatedTokensLine,
  withCreatedTokens, type ListSpawnFn } from './agent-plugin-tokens.ts';

const SHAPE = { message: 'The access tokens for the new site were not in the expected shape. Nothing was created.' };

test('cleanCreateTokens: absent input is no tokens; values are trimmed and blank ones dropped', () => {
  assert.deepEqual(cleanCreateTokens(undefined), {});
  assert.deepEqual(cleanCreateTokens(null), {});
  assert.deepEqual(cleanCreateTokens({ github: '  tok  ', vercel: '   ', resend: '' }), { github: 'tok' });
});

test('cleanCreateTokens: at most 8 tokens of at most 4096 chars', () => {
  const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, 't']));
  assert.equal(Object.keys(cleanCreateTokens(eight)).length, 8);
  assert.throws(() => cleanCreateTokens({ ...eight, p8: 't' }), SHAPE);
  assert.equal(cleanCreateTokens({ github: 'x'.repeat(4096) }).github?.length, 4096);
  assert.throws(() => cleanCreateTokens({ github: 'x'.repeat(4097) }), SHAPE);
});

test('cleanCreateTokens: the plugin id is anchored lower-case [a-z0-9][a-z0-9-]{0,63}', () => {
  for (const id of ['a', '0', 'a-b', `a${'b'.repeat(63)}`]) assert.deepEqual(cleanCreateTokens({ [id]: 't' }), { [id]: 't' }, id);
  for (const id of ['', '-a', 'A', 'a_b', 'a.b', 'a\n', ' a', 'a ', `a${'b'.repeat(64)}`, '../x']) assert.throws(() => cleanCreateTokens({ [id]: 't' }), SHAPE, JSON.stringify(id));
});

test('cleanCreateTokens: wrong shapes are refused, never coerced', () => {
  for (const raw of [[], ['t'], 'github=t', 5, true, { github: 5 }, { github: null }, { github: ['t'] }, { ok: 't', bad: {} }]) {
    assert.throws(() => cleanCreateTokens(raw), SHAPE, JSON.stringify(raw));
  }
});

test('tokens may only be added to an empty folder; no tokens are always fine', () => {
  assert.doesNotThrow(() => assertTokensCanReachFolder({}, false));
  assert.doesNotThrow(() => assertTokensCanReachFolder({ github: 't' }, true));
  assert.throws(() => assertTokensCanReachFolder({ github: 't' }, false), /already holds a website/);
});

test('initTokenOptions passes tokens and captures init output only when there are tokens', () => {
  const sink = { output: '' };
  assert.deepEqual(initTokenOptions({}, sink), {});
  const options = initTokenOptions({ github: 't' }, sink);
  assert.deepEqual(options.agentPluginTokens, { github: 't' });
  options.onInitOutput?.('captured');
  assert.equal(sink.output, 'captured');
});

test('the created-tokens line is a whole line: status saved|failed, then lower-case ids', () => {
  assert.deepEqual(parseCreatedTokensLine('agent-plugin-tokens: saved github,vercel'), { status: 'saved', pluginIds: ['github', 'vercel'] });
  assert.deepEqual(parseCreatedTokensLine('init ok\nagent-plugin-tokens: failed resend\ndone'), { status: 'failed', pluginIds: ['resend'] });
  assert.deepEqual(parseCreatedTokensLine('agent-plugin-tokens: saved ,'), { status: 'saved', pluginIds: [] });
  for (const output of ['x agent-plugin-tokens: saved github', 'agent-plugin-tokens: saved github!', 'agent-plugin-tokens: saved Github',
    'agent-plugin-tokens: ok github', 'agent-plugin-tokens: saved', 'agent-plugin-tokens:  saved github', '']) {
    assert.equal(parseCreatedTokensLine(output), null, JSON.stringify(output));
  }
  const record = { id: 'site' };
  assert.equal(withCreatedTokens(record, 'nothing here'), record);
  assert.deepEqual(withCreatedTokens(record, 'agent-plugin-tokens: saved github'), { id: 'site', agentPluginTokens: { status: 'saved', pluginIds: ['github'] } });
});

function fakeSpawn({ code, stdout = '', stderr = '' }: { code: number; stdout?: string; stderr?: string }) {
  const seen: { env?: NodeJS.ProcessEnv }[] = [];
  const spawnFn: ListSpawnFn = (_command, _args, options) => {
    seen.push({ env: options.env });
    const out = new PassThrough(); const err = new PassThrough();
    const listeners: Record<string, (value: never) => void> = {};
    setImmediate(() => { out.end(stdout); err.end(stderr); setImmediate(() => listeners.exit?.(code as never)); });
    return { stdout: out, stderr: err, once(event: string, listener: (value: never) => void) { listeners[event] = listener; } } as never;
  };
  return { spawnFn, seen };
}
/** A test-owned repo root holding only what the spawn plan reads (package.json bin + the compiled CLI). */
function fakeRepoRoot(t: { after: (fn: () => void) => void }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-token-repo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ bin: { tovu: 'dist/src/cli/main.js' } }));
  fs.mkdirSync(path.join(root, 'dist', 'src', 'cli'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'src', 'cli', 'main.js'), '');
  return root;
}
const scratchDirs = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('tovu-token-sign-in-'));

test('listTokenSignInPlugins keeps only well-formed https plugins from the LAST JSON line, and removes its scratch site', async t => {
  const before = scratchDirs();
  const plugins = [
    { pluginId: 'github', displayName: 'GitHub', helpUrl: 'https://github.com/settings/tokens' },
    { pluginId: 'plain', displayName: 'Plain', helpUrl: 'http://insecure.example' },
    { pluginId: 'embedded', displayName: 'E', helpUrl: 'see https://x.example' },
    { pluginId: 'Bad', displayName: 'B', helpUrl: 'https://b.example' },
    { pluginId: 'noname', helpUrl: 'https://n.example' }, null,
  ];
  const { spawnFn } = fakeSpawn({ code: 0, stdout: `{"plugins":[]}\nlog line\n${JSON.stringify({ plugins })}\n` });
  assert.deepEqual(await listTokenSignInPlugins({ repoRoot: fakeRepoRoot(t), baseEnv: {}, spawnFn }), [{ pluginId: 'github', displayName: 'GitHub', helpUrl: 'https://github.com/settings/tokens' }]);
  assert.deepEqual(scratchDirs(), before);
});

test('listTokenSignInPlugins: a non-zero exit fails with the trimmed stderr, and still removes its scratch site', async t => {
  const before = scratchDirs();
  const { spawnFn } = fakeSpawn({ code: 2, stderr: '  boom  \n' });
  await assert.rejects(listTokenSignInPlugins({ repoRoot: fakeRepoRoot(t), baseEnv: {}, spawnFn }), { message: 'tovu agent-plugins token-sign-in failed: boom' });
  assert.deepEqual(scratchDirs(), before);
});
