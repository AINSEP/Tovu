import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsDialogShell } from '@jini-ai/ui';
import type { ResourcesSnapshot } from '../contracts/resources.js';
import type { SiteRecord } from '../contracts/project.js';
import { installDom, settle } from './dom-hook-harness.js';
import { ResourcesMonitor, ResourcesChip, ResourceSiteFigure, ResourcesPanel, memoryText, resourceWarnings, resourceRows } from './ResourcesPanel.js';
import { useSitePower } from './use-site-power.hooks.js';

Object.assign(globalThis, { React });
installDom();
const SITE = { id: '/sites/a', displayName: 'Bakery', status: 'running' } as SiteRecord;
const metrics = { rssBytes: 1_500_000_000, cpuPercent: 81, memoryWarning: true, cpuWarning: true };
const SNAPSHOT: ResourcesSnapshot = {
  status: 'available', sampledAt: 1, pollIntervalMs: 5_000, totalMemoryBytes: 8_000_000_000, approximate: true,
  total: metrics, app: { ...metrics, siteId: null, processes: [] },
  sites: [{ ...metrics, siteId: SITE.id, processes: [{ pid: 42, ppid: 1, name: 'node', role: 'site-server', rssBytes: 1_500_000_000, cpuPercent: null, cpuWarning: false }] }],
};

function mount(t: { after: (fn: () => void) => void }, element: React.ReactNode) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  const render = (next: React.ReactNode) => act(() => root.render(next));
  render(element);
  return { host, render };
}

// The real shell's focus/Escape lifecycle is tested by Jini; this port avoids a second React copy.
const Shell: typeof SettingsDialogShell = ({ tabs, onClose }) => createElement('section', { role: 'dialog' },
  tabs.map((tab) => createElement('div', { key: tab.id }, tab.panel)),
  createElement('button', { onClick: onClose }, 'Close'));

test('one snapshot drives the chip and site figure, warnings and panel-open cadence request', () => {
  assert.equal(memoryText({ bytes: 0 }), 'about 0 MB');
  assert.equal(memoryText({ bytes: null }), 'Memory unavailable');
  assert.equal(memoryText({ bytes: 1_500_000_000 }), 'about 1.5 GB');
  assert.equal(resourceWarnings({ metrics }), 'High memory use · Sustained high CPU use');
  assert.equal(resourceWarnings({ metrics: null }), '');
});

test('chip is a focusable dialog trigger; all readers share data and close restores collapsed cadence', (t) => {
  const requests: boolean[] = [];
  const Panel: typeof ResourcesPanel = ({ snapshot, onClose }) => createElement('section', { role: 'dialog' },
    memoryText({ bytes: snapshot?.total.rssBytes }), createElement('button', { onClick: onClose }, 'Close'));
  const { host } = mount(t, createElement(ResourcesMonitor, {
    projects: [SITE], onSiteUpdated() {}, Panel,
    useReadings: ({ panelOpen }) => { requests.push(panelOpen); return SNAPSHOT; },
    children: createElement(React.Fragment, null, createElement(ResourcesChip), createElement(ResourceSiteFigure, { project: SITE })),
  }));
  const chip = host.querySelector<HTMLButtonElement>('.resources-chip')!;
  assert.equal(chip.textContent, 'Memory: about 1.5 GB · High memory use · Sustained high CPU use');
  assert.equal(host.querySelector('.card__resources')!.textContent, 'about 1.5 GB · High memory use · Sustained high CPU use');
  assert.equal(chip.getAttribute('aria-haspopup'), 'dialog');
  chip.focus(); assert.equal(document.activeElement, chip);
  act(() => chip.click());
  assert.equal(chip.getAttribute('aria-expanded'), 'true');
  assert.equal(requests.at(-1), true);
  act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click());
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(chip.getAttribute('aria-expanded'), 'false');
  assert.equal(requests.at(-1), false);
});

test('rows join by identity, exclude external/stopped sites and withdraw stale process rows', () => {
  const duplicateName = { ...SITE, id: '/sites/b' };
  const projects = [SITE, duplicateName, { ...SITE, id: '/external', externalUrl: 'http://localhost:4000' }, { ...SITE, id: '/stopped', status: 'stopped' as const }];
  const rows = resourceRows({ projects, snapshot: SNAPSHOT, statusOf: (site) => site.status });
  assert.deepEqual(rows.map((row) => row.id), [SITE.id, duplicateName.id, 'tovu-app']);
  assert.equal(rows[0]!.metaLine, 'about 1.5 GB · CPU 81% of one core · High memory use · Sustained high CPU use');
  assert.equal(rows[0]!.detailLine, 'Site server: node (PID 42), about 1.5 GB · CPU unavailable');
  assert.equal(rows[1]!.metaLine, 'Memory unavailable · CPU unavailable');
  assert.deepEqual(rows[2]!.actions, []);
  const unavailable = resourceRows({ projects: [SITE], snapshot: { ...SNAPSHOT, status: 'unavailable' }, statusOf: (site) => site.status });
  assert.equal(unavailable[0]!.detailLine, '');
  assert.equal(unavailable[0]!.metaLine, 'Memory unavailable · CPU unavailable');
  assert.equal(unavailable[0]!.actions[0]!.label, 'Stop');
});

test('panel Stop reaches the existing stop API once, applies main record and shows a rejection', async (t) => {
  const calls: string[] = [];
  const updates: SiteRecord[] = [];
  let finish!: (record: SiteRecord) => void;
  let fail = false;
  const bridge = {
    startSite: async () => { assert.fail('resource panel cannot start a site'); },
    stopSite: (id: string) => { calls.push(id); return fail ? Promise.reject(new Error('Stop failed.')) : new Promise<SiteRecord>((resolve) => { finish = resolve; }); },
  };
  const usePower: typeof useSitePower = (onUpdated) => useSitePower(onUpdated, { getBridge: () => bridge });
  const { host } = mount(t, createElement(ResourcesPanel, {
    projects: [SITE], snapshot: SNAPSHOT, onSiteUpdated: (record) => updates.push(record), onClose() {}, usePower, Shell, useTrap() {},
  }));
  const stop = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Stop')!;
  act(() => { stop().click(); }); await settle();
  const busy = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Stopping…')!;
  assert.equal(busy.disabled, true);
  act(() => busy.click()); assert.deepEqual(calls, [SITE.id]);
  await act(async () => { finish({ ...SITE, status: 'stopped' }); }); await settle();
  assert.equal(updates[0]!.status, 'stopped');
  fail = true; act(() => stop().click()); await settle();
  assert.equal(host.querySelector('[role="alert"]')!.textContent, 'Stop failed.');
});

test('unavailable snapshot shows unavailable chip/cards, and stopped cards hide the previous figure', (t) => {
  const { host } = mount(t, createElement(ResourcesMonitor, {
    projects: [SITE], onSiteUpdated() {}, useReadings: () => ({ ...SNAPSHOT, status: 'unavailable' }),
    children: createElement(React.Fragment, null, createElement(ResourcesChip),
      createElement(ResourceSiteFigure, { project: SITE }), createElement(ResourceSiteFigure, { project: { ...SITE, status: 'stopped' } })),
  }));
  assert.equal(host.querySelector('.resources-chip')!.textContent, 'Memory: Unavailable');
  assert.equal(host.querySelectorAll('.card__resources').length, 1);
  assert.equal(host.querySelector('.card__resources')!.textContent, 'Memory unavailable');
});
