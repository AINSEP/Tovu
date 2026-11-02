import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

for (const helper of ['import', 'peer', 'asset']) {
  test(`${helper} fixture releases its resources despite a teardown failure`, async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, TEARDOWN_HELPER: helper };
    delete env.NODE_TEST_CONTEXT;
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--test', '--test-timeout=120000',
      fileURLToPath(new URL('./resource-teardown.fixture.ts', import.meta.url))], { env, timeout: 120_000 })
      .then(output => ({ ...output, code: 0 }), error => ({ stdout: String(error.stdout), stderr: String(error.stderr), code: error.code }));
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stdout, /injected teardown failure/);
    assert.match(result.stdout, helper === 'asset' ? /work aborted: true/ : /database closed: true/);
    if (helper === 'peer') assert.match(result.stdout, /folder removed: true/);
  });
}
