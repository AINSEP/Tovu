/**
 * @file `SiteStartPanel` (and the shared `Spinner`) rendered from their own modules with the real
 * `useSiteStart` over a fake `startSite`: the status or caller-supplied body, the boot wait, the
 * success hand-offs (`onSiteUpdated`, then `onStarted`), a failed start, and no Start for a
 * blocked site.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, installBridge, mount, settle, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SiteStartPanel } from './SiteStartPanel.js';
import { Spinner } from './Spinner.js';
import type { SiteRecord } from '../../contracts/project.js';

after(closeHost);

/** A `startSite` the test settles by hand, so the boot wait can be looked at while it lasts. */
function pendingStart() {
  const starts: { id: string; resolve: (record: SiteRecord) => void; reject: (error: Error) => void }[] = [];
  const startSite = (id: string) => new Promise<SiteRecord>((resolve, reject) => { starts.push({ id, resolve, reject }); });
  return { starts, startSite };
}

function renderPanel(t: TestContext, { project, body, withOnStarted = true }: { project: SiteRecord; body?: string; withOnStarted?: boolean }) {
  const { starts, startSite } = pendingStart();
  installBridge({ t, bridge: { startSite } });
  const events: string[] = [];
  const view = mount({ t, element: createElement(SiteStartPanel, {
    project, body,
    onStarted: withOnStarted ? () => { events.push('started'); } : undefined,
    onSiteUpdated: (record) => { events.push(`updated:${record.status}`); },
  }) });
  const button = () => view.container.querySelector('.workspace__idle button');
  return { ...view, starts, events, button };
}

test('Spinner: one decorative ring, hidden from assistive tech', (t) => {
  const view = mount({ t, element: createElement(Spinner) });
  assert.equal(view.container.innerHTML, '<span class="spinner" aria-hidden="true"></span>');
});

test('SiteStartPanel: a stopped site shows its name, its status sentence and an idle Start', (t) => {
  const view = renderPanel(t, { project: site('a') });
  assert.equal(view.container.querySelector('.empty__title')?.textContent, 'Site a');
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Stopped.');
  assert.equal(view.button()?.textContent, 'Start site');
  assert.equal(view.button()?.hasAttribute('disabled'), false);
  assert.equal(view.container.querySelector('.spinner'), null, 'no spinner beside an idle button');
  assert.equal(view.container.querySelector('.workspace__error'), null);
});

test('SiteStartPanel: Sleeping has neutral wording and Wake uses the normal start call', async t => {
  const view = renderPanel(t, { project: site('a', { status: 'sleeping' }) });
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Sleeping.');
  assert.equal(view.button()?.textContent, 'Wake site');
  assert.equal(view.container.querySelector('.workspace__error'), null);
  await view.click(view.button());
  assert.equal(view.starts[0]?.id, 'a');
  await act(async () => { view.starts[0]!.resolve(site('a', { status: 'running', port: 4200 })); });
  assert.deepEqual(view.events, ['updated:running', 'started']);
});

test('SiteStartPanel: a caller-supplied body replaces the status sentence', (t) => {
  const view = renderPanel(t, { project: site('a', { status: 'running', port: 4100 }), body: 'Site a is not answering.' });
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Site a is not answering.');
});

test('SiteStartPanel: Start shows the boot wait, then hands main\'s record on before calling onStarted', async (t) => {
  const view = renderPanel(t, { project: site('a') });
  await view.click(view.button());
  assert.equal(view.starts[0]?.id, 'a');
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Starting the server. This can take up to a minute.');
  assert.ok(view.container.querySelector('.workspace__idle > .spinner'));
  assert.equal(view.button()?.textContent, 'Starting…');
  assert.equal(view.button()?.hasAttribute('disabled'), true, 'one start at a time');
  await act(async () => { view.starts[0]!.resolve(site('a', { status: 'running', port: 4100 })); });
  await settle();
  assert.deepEqual(view.events, ['updated:running', 'started']);
  assert.equal(view.button()?.textContent, 'Start site');
});

test('SiteStartPanel: a successful start with no onStarted still applies the record', async (t) => {
  const view = renderPanel(t, { project: site('a'), withOnStarted: false });
  await view.click(view.button());
  await act(async () => { view.starts[0]!.resolve(site('a', { status: 'running', port: 4100 })); });
  await settle();
  assert.deepEqual(view.events, ['updated:running']);
});

test('SiteStartPanel: a failed start explains itself under the button and does not call onStarted', async (t) => {
  const view = renderPanel(t, { project: site('a') });
  await view.click(view.button());
  await act(async () => { view.starts[0]!.reject(new Error('port 4100 is taken')); });
  await settle();
  assert.match(view.container.querySelector('.workspace__error')?.textContent ?? '', /port 4100 is taken/);
  assert.deepEqual(view.events, []);
  assert.equal(view.button()?.hasAttribute('disabled'), false, 'the operator can try again');
});

test('SiteStartPanel: a blocked site offers no Start at all', (t) => {
  const view = renderPanel(t, { project: site('b', { status: 'blocked' }) });
  assert.equal(view.button(), null);
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Provider support required.');
});


test('B2 crash cap renders selectable redacted details beside manual Start', t => {
  const detail = 'Automatic restart has stopped. Try starting it again.\n\nRedacted details:\nExit code: 9\n[REDACTED]';
  const view = renderPanel(t, { project: site('a', { status: 'failed', statusDetail: detail }) });
  assert.equal(view.container.querySelector('pre')?.textContent, detail);
  assert.equal(view.button()?.textContent, 'Start site');
  assert.equal(view.starts.length, 0, 'a terminal error must wait for manual Start');
});

test('SiteStartPanel: only failed sites expose crash details', t => {
  for (const status of ['stopped', 'sleeping', 'starting'] as const) {
    const view = renderPanel(t, { project: site('a', { status, statusDetail: 'old crash details' }) });
    assert.equal(view.container.querySelector('pre'), null, status);
  }
  const view = renderPanel(t, { project: site('a', { status: 'failed', statusDetail: null }) });
  assert.equal(view.container.querySelector('pre'), null);
});

test('SiteStartPanel: a site another path is starting reads Starting, never Stopped, and cannot be started twice', (t) => {
  const view = renderPanel(t, { project: site('a', { status: 'starting' }) });
  assert.equal(view.container.querySelector('.empty__body')?.textContent, 'Starting the server. This can take up to a minute.');
  assert.equal(view.button()?.textContent, 'Starting…');
  assert.equal(view.button()?.hasAttribute('disabled'), true);
  assert.ok(view.container.querySelector('.spinner'));
});
