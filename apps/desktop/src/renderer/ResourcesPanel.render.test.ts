import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsDialogShell } from '@jini-ai/ui';
import type { ResourcesSnapshot } from '../contracts/resources.js';
import type { SiteRecord } from '../contracts/project.js';
import { installDom, settle } from './dom-hook-harness.js';
import { ResourcesMonitor, ResourcesChip, ResourceSiteFigure, ResourcesPanel, memoryText, resourceWarnings, resourceGroups } from './ResourcesPanel.js';
import { useSitePower } from './use-site-power.hooks.js';
import { useResources, type ResourcesPorts } from './use-resources.hooks.js';
import { createDesktopResources } from '../desktop-resources.ts';
import type { ProcessUsage } from '@jini-ai/platform/process';

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
  assert.equal(memoryText({ bytes: 0 }), '~0 MB');
  assert.equal(memoryText({ bytes: null }), 'Memory unavailable');
  assert.equal(memoryText({ bytes: 1_500_000_000 }), '~1.5 GB');
  assert.equal(memoryText({ bytes: 1_100_000_000 }), '~1.1 GB');
  assert.equal(memoryText({ bytes: 559_000_000 }), '~0.6 GB');
  assert.equal(resourceWarnings({ metrics }), 'High memory use · Sustained high CPU use');
  assert.equal(resourceWarnings({ metrics: null }), '');
});

test('Job M formats the owner\'s 0.55 GB footprint as ~0.6 GB', () => {
  assert.equal(memoryText({ bytes: 550_000_000 }), '~0.6 GB');
  assert.equal(memoryText({ bytes: 78_000_000 }), '~78 MB');
});

test('M2 labels footprint, committed, RSS and mixed fallback in memory copy', () => {
  assert.equal(memoryText({ bytes: 550_000_000, memoryMetric: 'physical-footprint' }), '~0.6 GB');
  assert.equal(memoryText({ bytes: 550_000_000, memoryMetric: 'committed' }), '~0.6 GB approx.');
  assert.equal(memoryText({ bytes: 550_000_000, memoryMetric: 'rss' }), '~0.6 GB approx.');
  assert.equal(memoryText({ bytes: 550_000_000, memoryMetric: 'mixed-rss' }), '~0.6 GB approx.');
  assert.equal(memoryText({ bytes: null, memoryMetric: 'physical-footprint' }), 'Memory unavailable');
});

test('M2 shows provenance on toolbar, tooltip, site card, panel totals and individual process rows', (t) => {
  const footprint = { ...metrics, rssBytes: 550_000_000, memoryMetric: 'physical-footprint' as const, memoryWarning: false, cpuWarning: false };
  const snapshot = { ...SNAPSHOT, total: { ...footprint, memoryMetric: 'mixed-rss' as const }, app: { ...footprint, siteId: null, processes: [] },
    sites: [{ ...footprint, siteId: SITE.id, processes: [{ ...SNAPSHOT.sites[0]!.processes[0]!, rssBytes: 78_000_000, memoryMetric: 'rss' as const }] }] };
  const usePower: typeof useSitePower = () => useSitePower(() => {}, { getBridge: () => ({}) as never });
  const Panel: typeof ResourcesPanel = props => createElement(ResourcesPanel, { ...props, usePower, Shell, useTrap() {} });
  const { host } = mount(t, createElement(ResourcesMonitor, {
    projects: [SITE], onSiteUpdated() {}, useReadings: () => snapshot, Panel,
    children: createElement(React.Fragment, null, createElement(ResourcesChip), createElement(ResourceSiteFigure, { project: SITE })),
  }));
  const chip = host.querySelector<HTMLButtonElement>('.resources-chip')!;
  assert.equal(chip.textContent, '~0.6 GB approx.');
  assert.equal(chip.getAttribute('data-tooltip'), 'Memory used by Tovu and running sites: ~0.6 GB approx.');
  assert.equal(host.querySelector('.card__resources')!.textContent, '~0.6 GB');
  act(() => chip.click());
  assert.match(host.querySelector('.resources-total')!.textContent!, /^Total: ~0\.6 GB approx\./);
  assert.deepEqual([...host.querySelectorAll('tbody .resources-table__group td.num:first-of-type')].map(cell => cell.textContent), ['~0.6 GB', '~0.6 GB']);
  assert.equal(host.querySelector('tbody:last-child tr:nth-child(2) td:nth-child(3)')!.textContent, '~78 MB approx.');
});

test('Job M displays the same 0.55 GB memory reading on the toolbar and the site card', (t) => {
  const footprint = { ...metrics, rssBytes: 550_000_000, memoryWarning: false, cpuWarning: false };
  const snapshot = { ...SNAPSHOT, total: footprint, sites: [{ ...footprint, siteId: SITE.id, processes: [] }] };
  const { host } = mount(t, createElement(ResourcesMonitor, {
    projects: [SITE], onSiteUpdated() {}, useReadings: () => snapshot,
    children: createElement(React.Fragment, null, createElement(ResourcesChip), createElement(ResourceSiteFigure, { project: SITE })),
  }));
  assert.equal(host.querySelector('.resources-chip')!.textContent, '~0.6 GB');
  assert.equal(host.querySelector('.card__resources')!.textContent, '~0.6 GB');
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
  assert.equal(chip.textContent, '~1.5 GB · High memory use · Sustained high CPU use');
  assert.ok(chip.querySelector('svg[aria-hidden="true"]'), 'a memory-chip icon replaces the word "Memory:"');
  assert.equal(chip.getAttribute('data-tooltip'), 'Memory used by Tovu and running sites: ~1.5 GB');
  assert.equal(chip.getAttribute('aria-label'), 'Memory used by Tovu and running sites: ~1.5 GB · High memory use · Sustained high CPU use');
  assert.ok(chip.classList.contains('jini-tooltip'));
  assert.equal(host.querySelector('.card__resources')!.textContent, '~1.5 GB · High memory use · Sustained high CPU use');
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

test('groups join by identity: Tovu app first, external/stopped sites excluded, stale process rows withdrawn', () => {
  const duplicateName = { ...SITE, id: '/sites/b' };
  const projects = [SITE, duplicateName, { ...SITE, id: '/external', externalUrl: 'http://localhost:4000' }, { ...SITE, id: '/stopped', status: 'stopped' as const }];
  const groups = resourceGroups({ projects, snapshot: SNAPSHOT, statusOf: (site) => site.status });
  assert.deepEqual(groups.map((group) => group.id), ['tovu-app', SITE.id, duplicateName.id]);
  assert.equal(groups[0]!.stop, null);
  assert.deepEqual(groups[1]!.processes.map((row) => row.pid), [42]);
  assert.equal(groups[2]!.metrics, undefined);
  assert.deepEqual(groups[2]!.processes, []);
  const unavailable = resourceGroups({ projects: [SITE], snapshot: { ...SNAPSHOT, status: 'unavailable' }, statusOf: (site) => site.status });
  assert.deepEqual(unavailable[1]!.processes, []);
  assert.deepEqual(unavailable[1]!.stop, { label: 'Stop', disabled: false });
});

test('panel is a Process | PID | Memory | CPU table with a subtotal row per group and right-aligned numbers', (t) => {
  const snapshot: ResourcesSnapshot = { ...SNAPSHOT,
    total: { ...metrics, rssBytes: 1_722_000_000, cpuPercent: 3 },
    app: { siteId: null, rssBytes: 222_000_000, cpuPercent: 3, memoryWarning: false, cpuWarning: false, processes: [
      { pid: 23743, ppid: 1, name: 'Tovu', role: 'app', rssBytes: 110_000_000, cpuPercent: 2, cpuWarning: false },
      { pid: 23745, ppid: 23743, name: 'Tovu Helper', role: 'process', rssBytes: 112_000_000, cpuPercent: 1, cpuWarning: false }] } };
  const { host } = mount(t, createElement(ResourcesPanel, {
    projects: [SITE], snapshot, onSiteUpdated() {}, onClose() {}, usePower: () => useSitePower(() => {}, { getBridge: () => ({}) as never }), Shell, useTrap() {},
  }));
  const table = host.querySelector('table.resources-table')!;
  assert.deepEqual([...table.querySelectorAll('thead th')].map((th) => th.textContent), ['Process', 'PID', 'Memory', 'CPU', 'Actions']);
  const text = (row: Element) => [...row.children].map((cell) => cell.textContent);
  const bodies = [...table.querySelectorAll('tbody')];
  assert.deepEqual(bodies.map((body) => text(body.rows[0]!)), [
    ['Tovu app', '~0.2 GB', '3%', ''],
    ['Bakery · High memory use · Sustained high CPU use', '~1.5 GB', '81%', 'Stop'],
  ]);
  assert.deepEqual([...bodies[0]!.rows].slice(1).map(text), [
    ['TovuMain process', '23743', '~0.1 GB', '2%', ''], ['Tovu Helper', '23745', '~0.1 GB', '1%', '']]);
  // An unmeasured CPU is a dash spoken as "unavailable", never 0%.
  assert.deepEqual(text(bodies[1]!.rows[1]!), ['nodeSite server', '42', '~1.5 GB', '—unavailable', '']);
  assert.equal(bodies[0]!.rows[0]!.querySelector('th')!.getAttribute('scope'), 'rowgroup');
  assert.ok([...table.querySelectorAll('tbody td.num')].length >= 6);
  assert.equal(host.querySelector('.resources-total')!.textContent, 'Total: ~1.7 GB · CPU 3% of one core · High memory use · Sustained high CPU use');
  assert.match(host.querySelector('.resources-note')!.textContent!, /^Memory totals are estimates/);
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
    projects: [SITE], onSiteUpdated() {}, useReadings: (): ResourcesSnapshot => ({ ...SNAPSHOT, status: 'unavailable' }),
    children: createElement(React.Fragment, null, createElement(ResourcesChip),
      createElement(ResourceSiteFigure, { project: SITE }), createElement(ResourceSiteFigure, { project: { ...SITE, status: 'stopped' } })),
  }));
  assert.equal(host.querySelector('.resources-chip')!.textContent, 'Unavailable');
  assert.equal(host.querySelector('.resources-chip')!.getAttribute('data-tooltip'), 'Memory used by Tovu and running sites: unavailable');
  assert.equal(host.querySelectorAll('.card__resources').length, 1);
  assert.equal(host.querySelector('.card__resources')!.textContent, 'Memory unavailable');
});

test('an externally served running card has no local-memory failure readout', (t) => {
  const { host } = mount(t, createElement(ResourcesMonitor, {
    projects: [SITE], onSiteUpdated() {}, useReadings: () => SNAPSHOT,
    children: createElement(React.Fragment, null, createElement(ResourcesChip),
      createElement(ResourceSiteFigure, { project: { ...SITE, externalUrl: 'http://localhost:4000/admin/' } })),
  }));
  assert.equal(host.querySelector('.resources-chip')!.textContent, '~1.5 GB · High memory use · Sustained high CPU use');
  assert.equal(host.querySelector('.card__resources'), null);
});

test('starting a site refreshes the real sampler, hook and card while the toolbar cache is still young', async (t) => {
  let at = 0, reads = 0;
  let sites: { id: string; pid: number }[] = [];
  let rows: ProcessUsage[] = [{ pid: 1, ppid: 0, name: 'Tovu', rssBytes: 100_000_000, cpuSeconds: 0 }];
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'darwin', now: () => at,
    totalMem: () => 8_000_000_000, openSites: () => sites,
    listUsage: async () => { reads++; return rows; },
    samplePrivateMemory: async () => ({ metric: 'unavailable', readings: [] }),
  });
  const ports: ResourcesPorts = {
    getBridge: () => ({ getResources: request => monitor.get(request) }),
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimer: () => 1, clearTimer() {},
  };
  const useReadings: typeof useResources = (request, options) => useResources(request, { ...options, ports });
  const element = (project: SiteRecord) => createElement(ResourcesMonitor, {
    projects: [project], onSiteUpdated() {}, useReadings,
    children: createElement(React.Fragment, null, createElement(ResourcesChip), createElement(ResourceSiteFigure, { project })),
  });
  const { host, render } = mount(t, element({ ...SITE, status: 'stopped' }));
  await settle();
  assert.equal(host.querySelector('.resources-chip')!.textContent, '~0.1 GB approx.');
  at += 5_000;
  sites = [{ id: SITE.id, pid: 10 }];
  rows = [...rows, { pid: 10, ppid: 1, name: 'node', rssBytes: 300_000_000, cpuSeconds: 0 }];
  render(element(SITE)); await settle();
  assert.equal(host.querySelector('.card__resources')!.textContent, '~0.3 GB approx.');
  assert.equal(host.querySelector('.resources-chip')!.textContent, '~0.4 GB approx.');
  assert.equal(reads, 2);
});
