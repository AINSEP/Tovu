/** @file Region readers and browser bridges for cookie consent, contributed as DATA by active plugins in
 * {@link CONSENT_CONTRIBUTIONS_FILENAME} (schema 2: one open `contributions` list of `{ kind, id, … }`).
 * Core names no host. Only the configured ingress plugin may contribute trusted region readers: a
 * country header from anywhere else can be forged by the visitor. No ingress (Fly, Electron, a
 * static export) means no reader, and every visitor gets the strict banner with Reject.
 *
 * Trust: data-only (no plugin code runs) and loaded for ACTIVE plugins only, so switching a host
 * plugin off stops trusting its header. Kinds this file doesn't know are skipped, not refused. */
import { consentBridgeContribution, declaredScriptsContribution, parseConsentContributions as parseConsentFile } from '@jini-ai/cookie-consent/plugins';
import { REGION_SLOT } from '@jini-ai/cookie-consent/server';
import type { DeclaredScript, RawContribution, RegionResolver } from '@jini-ai/cookie-consent';
import type { LoadPluginContributions, PluginContributionDefinition } from '../agent-plugins/lifecycle.js';

/** The file a plugin ships at its root to contribute cookie-consent pieces. */
export const CONSENT_CONTRIBUTIONS_FILENAME = 'tovu-consent.json';

/** Parse one schema-2 file into region readers and browser bridge declarations. Pure. @complexity O(entries).
 * The rules live in `@jini-ai/cookie-consent/plugins`; this keeps the host's name and signature. */
export function parseConsentContributions({ raw }: { raw: string }, _optional = {}): { ok: true; descriptors: RawContribution[] } | { ok: false; reason: string } {
  return parseConsentFile({ raw });
}

type PluginRegion = { pluginId: string; entry: RawContribution };
const regionContribution: PluginContributionDefinition<RawContribution, PluginRegion> = {
  filename: CONSENT_CONTRIBUTIONS_FILENAME, contribution: 'cookie consent contributions', kind: 'data',
  parse: parseConsentContributions,
  load: ({ plugin, descriptor }) => descriptor.kind === 'declared-scripts'
    ? declaredScriptsContribution({ pluginId: plugin.pluginId, entry: descriptor }) : { pluginId: plugin.pluginId, entry: descriptor },
  onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : undefined,
};

/** Turn data entries into resolvers through the package's own trust boundary; refused entries drop.
 * `legacyHeader` absorbs the older TOVU_CONSENT_REGION_HEADER setting as one more header reader.
 * @complexity O(entries). */
export function toRegionResolvers({ entries }: { entries: readonly RawContribution[] }, { legacyHeader }: { legacyHeader?: string } = {}): RegionResolver[] {
  const readers = entries.filter(entry => entry.kind === 'region-resolver');
  const all = legacyHeader ? [...readers, { kind: 'region-resolver', id: 'configured-header', header: legacyHeader }] : readers;
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

/** Active plugins may supply a browser consent UI/bridge without becoming trusted region readers.
 * O(active plugin declarations); no browser module executes on the server. A load failure emits no bridge. */
export async function loadSiteConsentBridges(
  { workspaceId, loadContributions }: { workspaceId: string; loadContributions: LoadPluginContributions },
  _optional = {},
): Promise<RawContribution[]> {
  try {
    const load = await loadContributions({ workspaceId, definition: regionContribution }, { requireActive: true });
    return load.items.flatMap(({ entry }) => {
      const bridge = consentBridgeContribution({ entry });
      return bridge ? [bridge] : [];
    });
  } catch {
    console.error('[consent] browser bridges could not be loaded');
    return [];
  }
}


/** Declared assets come from active plugins only. Refusals remain data for readiness/admin diagnostics;
 * a failed load rejects, so the snapshot owner can keep its last good scripts.
 * O(declarations), no module execution or script-body/content reads. */
export async function loadSiteConsentScripts(
  { workspaceId, loadContributions }: { workspaceId: string; loadContributions: LoadPluginContributions },
  _optional = {},
): Promise<{ scripts: DeclaredScript[]; problems: readonly string[] }> {
  const loaded = await loadContributions({ workspaceId, definition: regionContribution }, { requireActive: true });
  return { scripts: loaded.items.flatMap(({ entry }) => entry.kind === 'declared-scripts' ? entry.scripts as DeclaredScript[] : []), problems: loaded.refusals };
}
