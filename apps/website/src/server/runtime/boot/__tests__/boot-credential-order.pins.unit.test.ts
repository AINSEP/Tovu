import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTUP_SECRET_KEYS } from '../../../../platform/secrets/startup-secrets.js';

/** Env-schema design §2.6, steps S0 and S3: two credential owners consume their names before any
 * config can be parsed. A config loader that "reads the environment once, first statement" would
 * miss both. These pins fail when the consumption moves later, stops scrubbing, or gains a second
 * reader. Subprocesses, because module evaluation order is invisible to a plain-map test. */
const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const websiteSrc = fileURLToPath(new URL('../../../../', import.meta.url));

function runModuleScript({ source, env }: { source: string; env: Record<string, string> }, _optional = {}) {
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout) as Record<string, unknown>;
}

/** The importer's first statement runs after every static import is evaluated, so what it sees
 * in `process.env` is what any "first statement" config parse would see. */
const OWNER_SIGNIN_PROBE = `import { bootLocalOwnerSignIn } from ${JSON.stringify(moduleUrl('../local-owner-signin.ts'))};
  process.stdout.write(JSON.stringify({
    signinInEnv: 'TOVU_DESKTOP_OWNER_SIGNIN' in process.env, pidInEnv: 'TOVU_DESKTOP_OWNER_PID' in process.env,
    enabled: bootLocalOwnerSignIn.enabled, sawDesktopLaunch: /TOVU_DESKTOP_OWNER_SIGNIN is disabled/.test(bootLocalOwnerSignIn.warning ?? ''),
    hasWarning: bootLocalOwnerSignIn.warning !== undefined }));`;

test('S0 pin: the owner sign-in keys are read and erased while the module is being imported', () => {
  // A launcher pid that is not this child's parent: the policy refuses, and its refusal text is
  // the proof that the two keys were read during evaluation (the environment no longer has them).
  const seen = runModuleScript({ source: OWNER_SIGNIN_PROBE, env: { NODE_ENV: 'production', TOVU_HOST: '127.0.0.1',
    TOVU_DESKTOP_OWNER_SIGNIN: 'a'.repeat(64), TOVU_DESKTOP_OWNER_PID: '1' } });
  assert.deepEqual(seen, { signinInEnv: false, pidInEnv: false, enabled: false, sawDesktopLaunch: true, hasWarning: true });
});

test('S0 pin: without the keys the same import captures a silent, disabled policy', () => {
  const seen = runModuleScript({ source: OWNER_SIGNIN_PROBE, env: { NODE_ENV: 'production', TOVU_HOST: '127.0.0.1' } });
  assert.deepEqual(seen, { signinInEnv: false, pidInEnv: false, enabled: false, sawDesktopLaunch: false, hasWarning: false });
});

function productionSources({ directory }: { directory: string }, _optional = {}): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const child = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources({ directory: child });
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [child] : [];
  });
}

test('S0 pin: the owner sign-in names appear in two product files (the credential owner, and the plugin policy that reads the launcher pid from an injected map)', () => {
  const mentions = productionSources({ directory: websiteSrc })
    .filter(file => /TOVU_DESKTOP_OWNER_(?:SIGNIN|PID)/.test(readFileSync(file, 'utf8')))
    .map(file => relative(websiteSrc, file).replaceAll('\\', '/')).sort();
  assert.deepEqual(mentions, ['features/plugin-runtime/install.ts', 'server/runtime/boot/local-owner-signin.ts']);
});

test('S3 pin: the startup-secret names are this exact list, in this order', () => {
  assert.deepEqual([...STARTUP_SECRET_KEYS], ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN',
    'TOVU_ADMIN_PASSWORD', 'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN']);
});

test('S3 pin: env-delivered startup secrets leave process.env, stay behind the accessor, and never reach a child or a foreign map', () => {
  const names = ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN', 'TOVU_ADMIN_PASSWORD',
    'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN'];
  const source = `import { spawnSync } from 'node:child_process';
    import { initializeStartupSecrets, startupSecretEnvironment } from ${JSON.stringify(moduleUrl('../../../../platform/secrets/startup-secrets.ts'))};
    const names = ${JSON.stringify(names)};
    const before = names.filter(name => name in process.env).length;
    const early = startupSecretEnvironment({ env: process.env });
    await initializeStartupSecrets();
    const viaAccessor = startupSecretEnvironment({ env: process.env });
    const foreign = startupSecretEnvironment({ env: { OTHER: 'x' } });
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(' + JSON.stringify(names) + '.filter(n => n in process.env)))'], { encoding: 'utf8' });
    process.stdout.write(JSON.stringify({ before, inEnvAfter: names.filter(name => name in process.env),
      earlyDelivered: names.filter(name => early[name] === 'fixture-' + name).length,
      delivered: names.filter(name => viaAccessor[name] === 'fixture-' + name).length,
      foreign: Object.keys(foreign), inheritedByChild: JSON.parse(child.stdout) }));`;
  const seen = runModuleScript({ source, env: Object.fromEntries(names.map(name => [name, `fixture-${name}`])) });
  // `earlyDelivered: 6` is only because the names are still in process.env before S3 runs; the
  // accessor adds nothing until then. After S3 the accessor is the only way to see them.
  assert.deepEqual(seen, { before: 6, inEnvAfter: [], earlyDelivered: 6, delivered: 6, foreign: ['OTHER'], inheritedByChild: [] });
});
