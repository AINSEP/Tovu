/**
 * @file `site-port.rules.ts` asserted directly: when a site has an address, and the card's status
 * title and detail line. Rendered surfaces that use these rules are tested from their real modules:
 * the card in `SiteGrid.status-title.render.test.ts`, the stopped panel in
 * `app/SiteStartPanel.render.test.ts`, and a stopped tab's url in
 * `use-site-workspace.hooks.stopped-url.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { siteCardStatus, sitePortPresentation } from './site-port.rules.js';
import { STATUS_LABEL } from './site-status.js';

// REGRESSION: fails if sitePortPresentation accepts port 0 or an absent port as running.
test('zero, absent and invalid ports have no address or port number', () => {
  for (const port of [0, undefined, null, -1, NaN, Infinity, 4100.5, 65536]) {
    assert.deepEqual(sitePortPresentation({ port }), {
      running: false, portLabel: '', origin: '', statusDescription: 'Stopped.',
    });
  }
});

// PARITY: a running site's real loopback port remains visible, including the valid bounds.
test('running sites retain their port, origin and lifecycle copy', () => {
  for (const port of [1, 4100, 65535]) {
    assert.deepEqual(sitePortPresentation({ port, status: 'running' }), {
      running: true, portLabel: String(port), origin: `http://127.0.0.1:${port}`,
      statusDescription: `Running on port ${port}.`,
    });
  }
});

// REGRESSION: fails if sitePortPresentation ignores the lifecycle status when a stale port exists.
test('non-running lifecycle states never advertise a stale port', () => {
  for (const status of ['provisioning', 'starting', 'stopping', 'stopped', 'failed', 'blocked'] as const) {
    const connection = sitePortPresentation({ port: 4100, status });
    assert.equal(connection.running, false);
    assert.equal(connection.portLabel, '');
    assert.equal(connection.origin, '');
    assert.equal(connection.statusDescription, `${STATUS_LABEL[status]}.`);
  }
});

test('siteCardStatus names the running app in the title and drops its detail line', () => {
  const running = sitePortPresentation({ port: 3000, status: 'running' });
  assert.deepEqual(siteCardStatus({ project: { runningApp: 'Web', statusDetail: 'Running in Web (port 3000)' }, connection: running }), {
    title: 'Running in Web at http://localhost:3000', detail: null,
  });
  const starting = sitePortPresentation({ port: 0, status: 'starting' });
  assert.deepEqual(siteCardStatus({ project: { runningApp: 'Web', statusDetail: 'Running in Web (starting)' }, connection: starting }), {
    title: 'Starting.', detail: null,
  });
  // A stopped site's last exit is the one detail that stays visible.
  const stopped = sitePortPresentation({ port: 0, status: 'stopped' });
  assert.deepEqual(siteCardStatus({ project: { statusDetail: "The site's server exited (code 1)." }, connection: stopped }), {
    title: 'Stopped.', detail: "The site's server exited (code 1).",
  });
  assert.deepEqual(siteCardStatus({ project: {}, connection: stopped }), { title: 'Stopped.', detail: null });
});
