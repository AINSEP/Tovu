/** Tovu's resource display adapter over Jini's dialog/list and the existing site power owner. */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ResourceRowListView, TabbedDialog, useFocusTrap, type ResourceRowItem } from '@jini-ai/ui';
import type { ResourceGroup, ResourceMetrics, ResourcesSnapshot } from '../contracts/resources.js';
import type { SiteRecord } from '../contracts/project.js';
import { useResources } from './use-resources.hooks.js';
import { useSitePower } from './use-site-power.hooks.js';

const ResourcesContext = createContext<{
  snapshot: ResourcesSnapshot | null;
  sites: ReadonlyMap<string | null, ResourceGroup>;
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

/** Decimal units match main's GB thresholds; unknown RSS is never formatted as zero. O(1). */
export function memoryText({ bytes }: { bytes: number | null | undefined }, _options = {}): string {
  if (bytes == null) return 'Memory unavailable';
  return bytes >= 1_000_000_000 ? `about ${(bytes / 1_000_000_000).toFixed(1)} GB` : `about ${Math.round(bytes / 1_000_000)} MB`;
}

/** Main owns warning thresholds and sustained CPU history. This adapter only supplies copy. O(1). */
export function resourceWarnings({ metrics }: { metrics?: ResourceMetrics | null }, _options = {}): string {
  return [metrics?.memoryWarning ? 'High memory use' : '', metrics?.cpuWarning ? 'Sustained high CPU use' : ''].filter(Boolean).join(' · ');
}

/** Null CPU is an unmeasured interval, distinct from a measured idle process. O(1). */
function metricsText({ metrics }: { metrics?: ResourceMetrics }, _options = {}) {
  const cpu = metrics?.cpuPercent == null ? 'CPU unavailable' : `CPU ${metrics.cpuPercent.toFixed(0)}% of one core`;
  return [memoryText({ bytes: metrics?.rssBytes }), cpu, resourceWarnings({ metrics })].filter(Boolean).join(' · ');
}

/** Only owned site trees can Stop. Project identity joins readings, never display names or PIDs.
 * @complexity O(s+p) time/space for s sites and p displayed processes; no per-row IPC.
 */
export function resourceRows({ projects, snapshot, statusOf }: {
  projects: readonly SiteRecord[];
  snapshot: ResourcesSnapshot | null;
  statusOf: ReturnType<typeof useSitePower>['statusOf'];
}, _options = {}): ResourceRowItem[] {
  const available = snapshot?.status === 'available' ? snapshot : null;
  const groups = new Map(available?.sites.map((group) => [group.siteId, group]));
  const rows: ResourceRowItem[] = projects.filter((site) => !site.externalUrl && ['running', 'stopping'].includes(site.status)).map((site) => {
    const group = groups.get(site.id);
    const stopping = statusOf(site) === 'stopping';
    return {
      id: site.id, title: site.displayName, metaLine: metricsText({ metrics: group }),
      detailLine: processText({ group }),
      actions: [{ kind: 'stop', label: stopping ? 'Stopping…' : 'Stop', disabled: stopping }],
    };
  });
  rows.push({ id: 'tovu-app', title: 'Tovu app', metaLine: metricsText({ metrics: available?.app }),
    detailLine: processText({ group: available?.app }), actions: [] });
  return rows;
}

/** Executable basenames and tree roles come from main's safe contract, never command arguments.
 * @complexity O(p) time/space for the group's p processes.
 */
function processText({ group }: { group?: ResourceGroup }, _options = {}): string {
  return group?.processes.map((row) => {
    const role = { 'site-server': 'Site server', daemon: 'Daemon', app: 'Tovu app', process: 'Process' }[row.role];
    return `${role}: ${row.name} (PID ${row.pid}), ${metricsText({ metrics: { ...row, memoryWarning: false } })}`;
  }).join('; ') ?? '';
}

/** One poller for the chip, cards and panel. Reuses React context instead of polling each card.
 * @example <ResourcesMonitor projects={projects} onSiteUpdated={applySiteRecord}>{children}</ResourcesMonitor>
 * @complexity O(s) indexing per snapshot for s sampled sites; children do O(1) site lookups.
 */
export function ResourcesMonitor({ projects, onSiteUpdated, children, useReadings = useResources, Panel = ResourcesPanel }: {
  projects: readonly SiteRecord[];
  onSiteUpdated: (record: SiteRecord) => void;
  children: ReactNode;
  useReadings?: typeof useResources;
  /** Panel seam keeps tests on this app's React when linked packages carry a second copy. */
  Panel?: typeof ResourcesPanel;
}, _options = {}) {
  const [open, setOpen] = useState(false);
  const snapshot = useReadings({ panelOpen: open });
  const sites = useMemo(() => new Map(snapshot?.status === 'available' ? snapshot.sites.map((group) => [group.siteId, group]) : []), [snapshot]);
  return <ResourcesContext.Provider value={{ snapshot, sites, open, setOpen }}>
    {children}
    {open && <Panel projects={projects} snapshot={snapshot} onSiteUpdated={onSiteUpdated} onClose={() => setOpen(false)} />}
  </ResourcesContext.Provider>;
}

/** Total chip next to Settings; the native button supports Enter/Space. O(1), no effects. */
export function ResourcesChip(_input: Record<string, never>, _options = {}) {
  const monitor = useContext(ResourcesContext);
  if (!monitor) return null;
  const metrics = monitor.snapshot?.status === 'available' ? monitor.snapshot.total : null;
  const warning = resourceWarnings({ metrics });
  const label = metrics?.rssBytes == null ? 'Unavailable' : memoryText({ bytes: metrics.rssBytes });
  return <button type="button" className={`resources-chip${warning ? ' is-warning' : ''}`}
    aria-haspopup="dialog" aria-expanded={monitor.open} onClick={() => monitor.setOpen(true)}
    title={warning || 'View memory and CPU use'}>
    Memory: {label}{warning && <span> · {warning}</span>}
  </button>;
}

/** Site-card reading from the same snapshot as the total; stopped cards carry no stale figure. */
export function ResourceSiteFigure({ project }: { project: SiteRecord }, _options = {}) {
  const monitor = useContext(ResourcesContext);
  if (project.status !== 'running') return null;
  const group = monitor?.sites.get(project.id);
  const warning = resourceWarnings({ metrics: group });
  return <p className={`card__resources${warning ? ' is-warning' : ''}`}>
    {memoryText({ bytes: group?.rssBytes })}{warning && <span> · {warning}</span>}
  </p>;
}

/** Jini's focus trap, dialog and list own keyboard containment, focus return, Escape and rows. Stop delegates to the card's existing
 * power hook, which serializes presses, reports failures and applies main's refreshed record.
 * @complexity O(s+p) row construction; Stop is one existing IPC call, never a PID action.
 */
export function ResourcesPanel({ projects, snapshot, onSiteUpdated, onClose,
  usePower = useSitePower, Shell = TabbedDialog, useTrap = useFocusTrap,
}: {
  projects: readonly SiteRecord[];
  snapshot: ResourcesSnapshot | null;
  onSiteUpdated: (record: SiteRecord) => void;
  onClose: () => void;
  usePower?: typeof useSitePower;
  Shell?: typeof TabbedDialog;
  useTrap?: typeof useFocusTrap;
}, _options = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTrap({ containerRef });
  // The shared trap captures the opener first; then enter this panel on its first action.
  useEffect(() => { containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  const power = usePower(onSiteUpdated);
  const rows = resourceRows({ projects, snapshot, statusOf: power.statusOf });
  const byId = new Map(projects.map((site) => [site.id, site]));
  const errors = projects.map((site) => power.errorOf(site.id)).filter(Boolean).join(' · ');
  return <div ref={containerRef}><Shell onClose={onClose} fullscreenEnabled={false} className="resources-dialog"
    dialogAriaLabelledBy="desktop-resources-title" tabs={[{ id: 'resources', label: 'Resources', title: 'Resources', panel: <>
      <p className="resources-total">Total: {metricsText({ metrics: snapshot?.status === 'available' ? snapshot.total : undefined })}</p>
      <ResourceRowListView title="Memory and CPU" lede="Memory totals are approximate: shared pages may be counted more than once. CPU uses one core as 100%."
        metrics={[]} metricsAriaLabel="Resource totals" loading={false} error={null}
        actionError={errors || null} sectionLabel="Running sites and Tovu app" loadingLabel="Reading resources…"
        emptyTitle="No resources" emptyBody="Start a site to see its resource use."
        rows={rows} isRowBusy={(id) => byId.has(id) && power.statusOf(byId.get(id)!) === 'stopping'}
        statusLabel={(status) => status} canExpandHistory={false} expandedRowId={null}
        historyLoadingRowId={null} historyByRowId={{}} showHistoryLabel="" hideHistoryLabel=""
        historyTitleLabel="" historyLoadingLabel="" historyEmptyLabel="" onToggleExpand={() => {}}
        onRowAction={(id, kind) => {
          const site = byId.get(id);
          if (kind === 'stop' && site && !site.externalUrl && site.status === 'running') void power.toggle(site);
        }} /></>
    }]} /></div>;
}
