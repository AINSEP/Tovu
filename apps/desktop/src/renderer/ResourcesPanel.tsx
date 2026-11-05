/** Tovu's resource display adapter over Jini's dialog/list and the existing site power owner. */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TabbedDialog, useFocusTrap } from '@jini-ai/ui';
import type { ResourceGroup, ResourceMetrics, ResourceProcess, ResourcesSnapshot } from '../contracts/resources.js';
import type { SiteRecord } from '../contracts/project.js';
import { useResources } from './use-resources.hooks.js';
import { useSitePower } from './use-site-power.hooks.js';
import { ToolIcon } from './tool-icons.js';

const ResourcesContext = createContext<{
  snapshot: ResourcesSnapshot | null;
  sites: ReadonlyMap<string | null, ResourceGroup>;
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

/** Decimal units match main's GB thresholds; unknown RSS is never formatted as zero. `unitGap` spaces
 * the unit for prose ("~559 MB"); compact chips and cells keep "~559MB". O(1). */
export function memoryText({ bytes }: { bytes: number | null | undefined }, { unitGap = '' } = {}): string {
  if (bytes == null) return 'Memory unavailable';
  return bytes >= 1_000_000_000 ? `~${(bytes / 1_000_000_000).toFixed(1)}${unitGap}GB` : `~${Math.round(bytes / 1_000_000)}${unitGap}MB`;
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

/** One table section: the Tovu app or a running site, its subtotal and its processes. */
export interface ResourceTableGroup {
  id: string;
  title: string;
  metrics?: ResourceMetrics;
  processes: readonly ResourceProcess[];
  /** Only owned site trees can Stop; the Tovu app has no Stop. */
  stop: { label: string; disabled: boolean } | null;
}

/** Tovu app first, then each running owned site. Project identity joins readings, never display names or PIDs.
 * @complexity O(s+p) time/space for s sites and p displayed processes; no per-row IPC.
 */
export function resourceGroups({ projects, snapshot, statusOf }: {
  projects: readonly SiteRecord[];
  snapshot: ResourcesSnapshot | null;
  statusOf: ReturnType<typeof useSitePower>['statusOf'];
}, _options = {}): ResourceTableGroup[] {
  const available = snapshot?.status === 'available' ? snapshot : null;
  const groups = new Map(available?.sites.map((group) => [group.siteId, group]));
  const sites = projects.filter((site) => !site.externalUrl && ['running', 'stopping'].includes(site.status)).map((site) => {
    const group = groups.get(site.id);
    const stopping = statusOf(site) === 'stopping';
    return { id: site.id, title: site.displayName, metrics: group, processes: group?.processes ?? [],
      stop: { label: stopping ? 'Stopping…' : 'Stop', disabled: stopping } };
  });
  return [{ id: 'tovu-app', title: 'Tovu app', metrics: available?.app, processes: available?.app.processes ?? [], stop: null }, ...sites];
}

/** Tree roles come from main's safe contract; a plain child needs no label. */
const ROLE_LABELS: Record<ResourceProcess['role'], string> = { 'site-server': 'Site server', daemon: 'Daemon', app: 'Main process', process: '' };

/** A dash for an unknown reading, spoken as "unavailable", never a zero. O(1). */
function Unknown(_input: Record<string, never>, _options = {}) {
  return <><span aria-hidden="true">—</span><span className="visually-hidden">unavailable</span></>;
}

/** Memory and CPU cells; CPU is a percent of one core (the note under the table says so). O(1). */
function MetricCells({ rssBytes, cpuPercent }: { rssBytes?: number | null; cpuPercent?: number | null }, _options = {}) {
  return <>
    <td className="num">{rssBytes == null ? <Unknown /> : memoryText({ bytes: rssBytes })}</td>
    <td className="num">{cpuPercent == null ? <Unknown /> : `${cpuPercent.toFixed(0)}%`}</td>
  </>;
}

/** One `<tbody>` per group: a heading row with the subtotal (and Stop), then its processes.
 * Executable basenames only, never command arguments. O(p) for the group's p processes. */
function ResourceGroupRows({ group, onStop }: { group: ResourceTableGroup; onStop: (id: string) => void }, _options = {}) {
  const warning = resourceWarnings({ metrics: group.metrics });
  return <tbody>
    <tr className="resources-table__group">
      <th scope="rowgroup" colSpan={2}>{group.title}{warning && <span className="resources-table__warning"> · {warning}</span>}</th>
      <MetricCells rssBytes={group.metrics?.rssBytes} cpuPercent={group.metrics?.cpuPercent} />
      <td className="resources-table__action">{group.stop && <button type="button" disabled={group.stop.disabled}
        onClick={() => onStop(group.id)}>{group.stop.label}</button>}</td>
    </tr>
    {group.processes.map((row) => <tr key={row.pid}>
      <td className="resources-table__process">{row.name}{ROLE_LABELS[row.role] && <span className="resources-table__role">{ROLE_LABELS[row.role]}</span>}</td>
      <td className="num">{row.pid}</td>
      <MetricCells rssBytes={row.rssBytes} cpuPercent={row.cpuPercent} />
      <td />
    </tr>)}
  </tbody>;
}

/** Process | PID | Memory | CPU, grouped by owner. O(s+p). */
function ResourcesTable({ groups, onStop }: { groups: readonly ResourceTableGroup[]; onStop: (id: string) => void }, _options = {}) {
  return <table className="resources-table">
    <caption className="visually-hidden">Memory and CPU by process</caption>
    <thead><tr>
      <th scope="col">Process</th><th scope="col" className="num">PID</th>
      <th scope="col" className="num">Memory</th><th scope="col" className="num">CPU</th>
      <th scope="col"><span className="visually-hidden">Actions</span></th>
    </tr></thead>
    {groups.map((group) => <ResourceGroupRows key={group.id} group={group} onStop={onStop} />)}
  </table>;
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
  const refreshKey = JSON.stringify(projects.map(project => [project.id, project.status, project.externalUrl]));
  const snapshot = useReadings({ panelOpen: open }, { refreshKey });
  const sites = useMemo(() => new Map(snapshot?.status === 'available' ? snapshot.sites.map((group) => [group.siteId, group]) : []), [snapshot]);
  return <ResourcesContext.Provider value={{ snapshot, sites, open, setOpen }}>
    {children}
    {open && <Panel projects={projects} snapshot={snapshot} onSiteUpdated={onSiteUpdated} onClose={() => setOpen(false)} />}
  </ResourcesContext.Provider>;
}

/** Unavailable total readings keep the chip's existing copy; warnings come from main. O(1). */
function resourceChipReading({ snapshot }: { snapshot: ResourcesSnapshot | null }, _options = {}) {
  const metrics = snapshot?.status === 'available' ? snapshot.total : null;
  const warning = resourceWarnings({ metrics });
  const known = metrics?.rssBytes != null;
  const label = known ? memoryText({ bytes: metrics.rssBytes }) : 'Unavailable';
  const tip = `Memory used by Tovu and running sites: ${known ? memoryText({ bytes: metrics.rssBytes }, { unitGap: ' ' }) : 'unavailable'}`;
  return { warning, label, tip };
}

/** Total chip next to Settings: a chip icon and the figure, the sentence in a Jini tooltip and the
 * accessible name. The native button supports Enter/Space. O(1), no effects. */
export function ResourcesChip(_input: Record<string, never>, _options = {}) {
  const monitor = useContext(ResourcesContext);
  if (!monitor) return null;
  const { warning, label, tip } = resourceChipReading({ snapshot: monitor.snapshot });
  return <button type="button" className={`resources-chip jini-tooltip${warning ? ' is-warning' : ''}`}
    data-tooltip={tip} data-tooltip-placement="bottom" aria-label={warning ? `${tip} · ${warning}` : tip}
    aria-haspopup="dialog" aria-expanded={monitor.open} onClick={() => monitor.setOpen(true)}>
    <ToolIcon kind="memory" />{label}{warning && <span> · {warning}</span>}
  </button>;
}

/** Site-card reading from the same snapshot as the total; stopped cards carry no stale figure.
 * External servers are outside this desktop's sampler, just as they are in the Resources panel. */
export function ResourceSiteFigure({ project }: { project: SiteRecord }, _options = {}) {
  const monitor = useContext(ResourcesContext);
  if (project.status !== 'running' || project.externalUrl) return null;
  const group = monitor?.sites.get(project.id);
  const warning = resourceWarnings({ metrics: group });
  return <p className={`card__resources${warning ? ' is-warning' : ''}`}>
    {memoryText({ bytes: group?.rssBytes })}{warning && <span> · {warning}</span>}
  </p>;
}

/** Jini's focus trap and dialog own keyboard containment, focus return and Escape. Stop delegates to the card's existing
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
  const groups = resourceGroups({ projects, snapshot, statusOf: power.statusOf });
  const byId = new Map(projects.map((site) => [site.id, site]));
  const errors = projects.map((site) => power.errorOf(site.id)).filter(Boolean).join(' · ');
  const onStop = (id: string) => {
    const site = byId.get(id);
    if (site && !site.externalUrl && site.status === 'running') void power.toggle(site);
  };
  return <div ref={containerRef}><Shell onClose={onClose} fullscreenEnabled={false} className="resources-dialog"
    dialogAriaLabelledBy="desktop-resources-title" tabs={[{ id: 'resources', label: 'Resources', title: 'Resources', panel: <>
      <p className="resources-total">Total: {metricsText({ metrics: snapshot?.status === 'available' ? snapshot.total : undefined })}</p>
      {errors && <p className="resources-error" role="alert">{errors}</p>}
      <ResourcesTable groups={groups} onStop={onStop} />
      <p className="resources-note">Memory totals are estimates and can include not-yet-freed memory. CPU uses one core as 100%.</p></>
    }]} /></div>;
}
