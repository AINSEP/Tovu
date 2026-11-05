import assert from 'node:assert/strict';
import test from 'node:test';
import { STATUS_LABEL } from './renderer/site-status.ts';
import { sitePortPresentation } from './renderer/site-port.rules.ts';

test('Sleeping is distinct from Stopped and errors, and has no running address', () => {
  assert.equal(STATUS_LABEL.sleeping, 'Sleeping');
  assert.notEqual(STATUS_LABEL.sleeping, STATUS_LABEL.stopped);
  assert.notEqual(STATUS_LABEL.sleeping, STATUS_LABEL.failed);
  assert.deepEqual(sitePortPresentation({ status: 'sleeping', port: 4100 }), {
    running: false, portLabel: '', origin: '', statusDescription: 'Sleeping.',
  });
});
