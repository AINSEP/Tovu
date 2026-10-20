// Repo CLI adapter only; shared-runner extraction is recorded in the Jini survey.
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const isTest = args[0] === '--test';
if (isTest) args.shift();
const useDocker = args[0] === '--docker';
if (useDocker) args.shift();
// JSON is a YAML subset: no YAML parser/dependency is needed, including in CI.
// Semgrep has no rule-file include directive; expand the manifest into repeated -c.
const { configs } = JSON.parse(readFileSync(join(root, '.semgrep.yml'), 'utf8'));
const command = useDocker ? 'docker' : 'semgrep';
const prefix = useDocker ? [
  'run', '--rm', '--volume', `${root}:/src`, '--workdir', '/src',
  // The image runs as root while checkout belongs to the host runner UID.
  '--env', 'GIT_CONFIG_COUNT=1', '--env', 'GIT_CONFIG_KEY_0=safe.directory',
  '--env', 'GIT_CONFIG_VALUE_0=/src',
  process.env.SEMGREP_IMAGE, 'semgrep',
] : [];
if (useDocker && !process.env.SEMGREP_IMAGE?.match(/^semgrep\/semgrep(?::[\w.-]+)?@sha256:[a-f0-9]{64}$/)) {
  console.error('SEMGREP_IMAGE must name the official semgrep/semgrep image pinned by sha256 digest.');
  process.exit(2);
}
const semgrepArgs = isTest
  ? ['--test', '.semgrep', '--oss-only', '--metrics=off', '--disable-version-check', ...args]
  : ['scan', '--oss-only', '--metrics=off', '--disable-version-check', '--strict', '--json',
    ...configs.flatMap(config => ['--config', config]), '--exclude', '.semgrep/tests', ...args, '.'];
const temporary = mkdtempSync(join(tmpdir(), 'tovu-semgrep-'));
const reportPath = join(temporary, 'report.json');
try {
  const output = isTest ? null : openSync(reportPath, 'w');
  let result;
  try {
    result = spawnSync(command, [...prefix, ...semgrepArgs], {
      cwd: root, stdio: ['inherit', output ?? 'inherit', 'inherit'],
      env: { ...process.env, SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0' },
    });
  } finally {
    if (output !== null) closeSync(output);
  }
  if (result.error) {
    console.error(result.error.code === 'ENOENT' && !useDocker
      ? 'Semgrep is not installed. Install: brew install semgrep / pipx install semgrep (free CLI; no account).'
      : `Unable to start ${command}: ${result.error.message}`);
    process.exitCode = 127;
  } else {
    process.exitCode = result.status ?? 2;
    if (result.signal) console.error(`Semgrep terminated by ${result.signal}`);
    if (!isTest) {
      const raw = readFileSync(reportPath, 'utf8');
      try {
        const report = JSON.parse(raw);
        const counts = new Map();
        for (const finding of report.results ?? []) {
          const key = `${finding.extra.severity} ${finding.check_id}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        console.log(`Semgrep (report-only): ${report.results?.length ?? 0} findings; ${report.errors?.length ?? 0} scan errors`);
        for (const [rule, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
          console.log(`${rule}: ${count}`);
        }
        for (const error of report.errors ?? []) {
          console.error(`${error.type ?? 'scan error'}: ${error.message ?? 'see Semgrep stderr'}`);
        }
        if (report.errors?.length) process.exitCode ||= 2;
      } catch {
        console.error('Semgrep did not produce a valid JSON report; see stderr above.');
        process.exitCode ||= 2;
      }
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
