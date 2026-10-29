/** @file Visitor-region readers for cookie consent, contributed as DATA by host plugins in
 * {@link CONSENT_CONTRIBUTIONS_FILENAME} (schema 2: one open `contributions` list of `{ kind, id, … }`).
 * Core names no host. Only the plugin that is this site's configured ingress may contribute: a
 * country header from anywhere else can be forged by the visitor. No ingress (Fly, Electron, a
 * static export) means no reader, and every visitor gets the strict banner with Reject.
 *
 * Trust: data-only (no plugin code runs) and loaded for ACTIVE plugins only, so switching a host
 * plugin off stops trusting its header. Kinds this file doesn't know are skipped, not refused. */
import { REGION_SLOT } from '@jini-ai/cookie-consent/server';
import type { RawContribution, RegionResolver } from '@jini-ai/cookie-consent';
import type { LoadPluginContributions, PluginContributionDefinition } from '../agent-plugins/lifecycle.js';

/** The file a plugin ships at its root to contribute cookie-consent pieces. */
export const CONSENT_CONTRIBUTIONS_FILENAME = 'tovu-consent.json';

/** Parse one schema-2 file into its region-reader entries. Pure. @complexity O(entries). */
export function parseConsentContributions({ raw }: { raw: string }, _optional = {}): { ok: true; descriptors: RawContribution[] } | { ok: false; reason: string } {
  let file: unknown;
  try { file = JSON.parse(raw); } catch { return { ok: false, reason: 'not JSON' }; }
  const { schemaVersion, contributions } = (file ?? {}) as { schemaVersion?: unknown; contributions?: unknown };
  if (schemaVersion !== 2 || !Array.isArray(contributions)) return { ok: false, reason: 'expected { "schemaVersion": 2, "contributions": [...] }' };
  const descriptors = contributions.filter((item): item is RawContribution =>
    Boolean(item) && typeof item === 'object' && typeof item.id === 'string' && item.kind === 'region-resolver');
  return { ok: true, descriptors };
}

type PluginRegion = { pluginId: string; entry: RawContribution };
const regionContribution: PluginContributionDefinition<RawContribution, PluginRegion> = {
  filename: CONSENT_CONTRIBUTIONS_FILENAME, contribution: 'cookie consent region readers', kind: 'data',
  parse: parseConsentContributions,
  load: ({ plugin, descriptor }) => ({ pluginId: plugin.pluginId, entry: descriptor }),
  onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : undefined,
};

/** Turn data entries into resolvers through the package's own trust boundary; refused entries drop.
 * `legacyHeader` absorbs the older TOVU_CONSENT_REGION_HEADER setting as one more header reader.
 * @complexity O(entries). */
export function toRegionResolvers({ entries }: { entries: readonly RawContribution[] }, { legacyHeader }: { legacyHeader?: string } = {}): RegionResolver[] {
  const all = legacyHeader ? [...entries, { kind: 'region-resolver', id: 'configured-header', header: legacyHeader }] : entries;
  return all.flatMap(contribution => {
    const accepted = REGION_SLOT.accept({ contribution });
    return typeof accepted === 'string' ? [] : [accepted];
  });
}

/** This site's region readers: the configured ingress plugin's entries (when active), then the legacy
 * header. A plugin fault leaves the site strict; it never fails a page. @complexity O(p) plugins. */
export async function loadSiteRegionResolvers(
  { workspaceId, loadContributions }: { workspaceId: string; loadContributions: LoadPluginContributions },
  { ingress, legacyHeader }: { ingress?: string; legacyHeader?: string } = {},
): Promise<RegionResolver[]> {
  let entries: RawContribution[] = [];
  if (ingress) {
    try {
      const load = await loadContributions({ workspaceId, definition: regionContribution }, { requireActive: true });
      entries = load.items.flatMap(item => (item.pluginId === ingress ? [item.entry] : []));
    } catch { console.error('[consent] region readers could not be loaded; visitors get the strict banner'); }
  }
  return toRegionResolvers({ entries }, { legacyHeader });
}
