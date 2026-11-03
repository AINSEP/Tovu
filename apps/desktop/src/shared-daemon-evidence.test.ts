import assert from 'node:assert/strict';
import test from 'node:test';
import { fiveSitesExecuting } from '../../../development/e2e/desktop/_shared-daemon-evidence.ts';

const samples = Array.from({ length: 5 }, (_, index) => ({ origin: `http://127.0.0.1:${4200 + index}`, runId: `run-${index}`, childPid: 100 + index, state: 'running' }));
const processes = samples.map(run => ({ pid: run.childPid }));

test('five accepted replies that immediately fail cannot count as five chatting sites', () => {
  assert.equal(fiveSitesExecuting({ samples: samples.map(run => ({ ...run, state: 'failed' })), processes }), false);
  assert.equal(fiveSitesExecuting({ samples: samples.map(run => ({ ...run, childPid: 100 })), processes }), false);
  assert.equal(fiveSitesExecuting({ samples, processes: processes.slice(1) }), false);
  assert.equal(fiveSitesExecuting({ samples: samples.slice(1), processes }), false);
  assert.equal(fiveSitesExecuting({ samples: samples.map(run => ({ ...run, origin: samples[0]!.origin })), processes }), false);
  assert.equal(fiveSitesExecuting({ samples, processes }), true);
});
