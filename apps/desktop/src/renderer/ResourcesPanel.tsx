import { createResourceStop } from './ResourcesPanel.hooks.js';
/** Tovu's resource display adapter over Jini's dialog/list and the existing site power owner. */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TabbedDialog, useFocusTrap } from '@jini-ai/ui';
import { ResourceTable, type ResourceTableFormat, type ResourceTableGroup, type ResourceTableLabels } from '@jini-ai/ui/resource-monitor';
import type { MemoryMetric, ResourceProcess } from '@jini-ai/core/contracts/site/contracts-resources';
import type { ResourceMetrics, ResourcesSnapshot } from '../contracts/resources.js';
import type { SiteRecord } from '../contracts/project.js';
import { useResources } from './use-resources.hooks.js';
import { useSitePower } from './use-site-power.hooks.js';
import { ToolIcon } from './tool-icons.js';

type ResourceGroup = ResourcesSnapshot['app'];

const ResourcesContext = createContext<{
  snapshot: ResourcesSnapshot | null;
  sites: ReadonlyMap<string | null, ResourceGroup>;
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

/** Decimal units match main's GB thresholds; unknown memory is never formatted as zero.
 * Readings from 0.1 GB use approximate tenths; smaller process rows retain MB precision. O(1).
 * @example memoryText({ bytes: 550_000_000 }) // "~0.6 GB"
 */
export function memoryText({ bytes, memoryMetric }: { bytes: number | null | undefined; memoryMetric?: MemoryMetric }, _options = {}): string {
  if (bytes == null) return 'Memory unavailable';
  const amount = bytes >= 100_000_000 ? `~${(bytes / 1_000_000_000).toFixed(1)} GB` : `~${Math.round(bytes / 1_000_000)} MB`;
  return memoryMetric && memoryMetric !== 'physical-footprint' && memoryMetric !== 'private-working-set' ? `${amount} approx.` : amount;
}

/** Main owns warning thresholds and sustained CPU history. This adapter only supplies copy. O(1). */
export function resourceWarnings({ metrics }: { metrics?: ResourceMetrics | null }, _options = {}): string {
  return [metrics?.memoryWarning ? 'High memory use' : '', metrics?.cpuWarning ? 'Sustained high CPU use' : ''].filter(Boolean).join(' · ');
}

/** Null CPU is an unmeasured interval, distinct from a measured idle process. O(1). */
function metricsText({ metrics }: { metrics?: ResourceMetrics }, _options = {}) {
  const cpu = metrics?.cpuPercent == null ? 'CPU unavailable' : `CPU ${metrics.cpuPercent.toFixed(0)}% of one core`;
  return [memoryText({ bytes: metrics?.rssBytes, memoryMetric: metrics?.memoryMetric }), cpu, resourceWarnings({ metrics })].filter(Boolean).join(' · ');
}

/** Tovu app first, then each running owned site. Project identity joins readings, never display names or PIDs.
 * @complexity O(s+p) time/space for s sites and p displayed processes; no per-row IPC.
 */
export function resourceGroups({ projects, snapshot, statusOf }: {
  projects: readonly SiteRecord[];
  snapshot: ResourcesSnapshot | null;
  statusOf: ReturnType<typeof useSitePower>['statusOf'];
}, _options = {}): ResourceTableGroup<ResourceMetrics, ResourceProcess>[] {
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

/** This app's words for `@jini-ai/ui/resource-monitor`'s table; "unavailable" is what a dash is spoken as. */
const TABLE_LABELS: ResourceTableLabels = { caption: 'Memory and CPU by process', process: 'Process', pid: 'PID', memory: 'Memory', cpu: 'CPU', actions: 'Actions', unavailable: 'unavailable' };

/** Figures and warnings for the table; CPU is a percent of one core (the note under the table says so). */
const TABLE_FORMAT: ResourceTableFormat<ResourceMetrics, ResourceProcess> = {
  memory: ({ bytes, reading }) => memoryText({ bytes, memoryMetric: reading.memoryMetric }),
  cpu: ({ percent }) => `${percent.toFixed(0)}%`,
  warning: ({ metrics }) => resourceWarnings({ metrics }),
  role: ({ role }) => ROLE_LABELS[role],
};

/** `app.css`'s `.visually-hidden` keeps the caption and the "unavailable" words for screen readers only. */
const TABLE_CLASSES = { visuallyHidden: 'visually-hidden' };

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
}) {
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
  const label = known ? memoryText({ bytes: metrics.rssBytes, memoryMetric: metrics.memoryMetric }) : 'Unavailable';
  const tip = `Memory used by Tovu and running sites: ${known ? label : 'unavailable'}`;
  return { warning, label, tip };
}

/** Total chip next to Settings: a chip icon and the figure, the sentence in a Jini tooltip and the
 * accessible name. The native button supports Enter/Space. O(1), no effects. */
export function ResourcesChip() {
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
export function ResourceSiteFigure({ project }: { project: SiteRecord }) {
  const monitor = useContext(ResourcesContext);
  if (project.status !== 'running' || project.externalUrl) return null;
  const group = monitor?.sites.get(project.id);
  const warning = resourceWarnings({ metrics: group });
  return <p className={`card__resources${warning ? ' is-warning' : ''}`}>
    {memoryText({ bytes: group?.rssBytes, memoryMetric: group?.memoryMetric })}{warning && <span> · {warning}</span>}
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTrap({ containerRef });
  // The shared trap captures the opener first; then enter this panel on its first action.
  useEffect(() => { containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  const power = usePower({}, { onSiteUpdated });
  const groups = resourceGroups({ projects, snapshot, statusOf: power.statusOf });
  const errors = projects.map((site) => power.errorOf({ id: site.id })).filter(Boolean).join(' · ');
  const onStop = createResourceStop({ projects, power });
  return <div ref={containerRef}><Shell onClose={onClose} fullscreenEnabled={false} className="resources-dialog"
    dialogAriaLabelledBy="desktop-resources-title" tabs={[{ id: 'resources', label: 'Resources', title: 'Resources', panel: <>
      <p className="resources-total">Total: {metricsText({ metrics: snapshot?.status === 'available' ? snapshot.total : undefined })}</p>
      {errors && <p className="resources-error" role="alert">{errors}</p>}
      <ResourceTable groups={groups} onStop={onStop} labels={TABLE_LABELS} format={TABLE_FORMAT} classNames={TABLE_CLASSES} />
      <p className="resources-note">Memory totals are estimates and can include not-yet-freed memory. CPU uses one core as 100%.</p></>
    }]} /></div>;
}
