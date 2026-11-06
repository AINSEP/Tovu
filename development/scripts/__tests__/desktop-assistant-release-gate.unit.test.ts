import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8')) as any;

test('release and release-branch pushes require the packaged two-site gate', () => {
  assert.deepEqual(workflow.on.push.branches, ['release/*']);
  assert.deepEqual(workflow.on.push.tags, ['desktop-v*']);
  const gate = workflow.jobs['assistant-gate'];
  assert.equal(gate['runs-on'], 'macos-15');
  assert.ok(gate['timeout-minutes'] <= 20, 'gate must have a finite CI budget');
  const commands = gate.steps.map((step: any) => step.run ?? '').join('\n');
  assert.match(commands, /electron-builder --mac --arm64 --dir --publish never/);
  assert.match(commands, /e2e:desktop:app.*two-sites-assistant\.desktop\.ts.*shared-agent-daemon\.desktop\.ts/);
  assert.match(commands, /quality:site-identity/);
  assert.ok(workflow.jobs.build.needs.includes('assistant-gate'), 'release builds must wait for the packaged gate');
  assert.ok(workflow.jobs.release.needs.includes('assistant-gate'), 'draft release creation must wait for the packaged gate');
  assert.match(workflow.jobs.release.if, /refs\/tags\/desktop-v/);
  assert.ok(!gate['continue-on-error'], 'gate failures must block release');
});

test('manual dispatch from main with a desktop tag runs the gate and every release job', () => {
  for (const job of ['assistant-gate', 'gates', 'build', 'store-identity', 'release']) {
    assert.match(workflow.jobs[job].if, /github.event_name == 'workflow_dispatch' && startsWith\(inputs.tag, 'desktop-v'\)/);
  }
});

test('the autonomous release chain stops at a draft without adding a prerelease or Latest promotion gate', () => {
  const commands = workflow.jobs.release.steps.map((step: any) => step.run ?? '').join('\n');
  assert.match(commands, /gh release create .*--draft/);
  assert.doesNotMatch(commands, /--prerelease|--latest=false|gh release edit/);
});
