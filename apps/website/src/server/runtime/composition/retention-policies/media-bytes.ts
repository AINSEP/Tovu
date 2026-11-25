import type { HostBlobGcJournalEntry, BlobPurgeReason } from "#src/platform/db/repos/blob-gc-journal";

/**
 * @file The `media-bytes` storage policy: a measure/report-only pass over files whose media rows are
 * gone (P11 ST-11b.T). It reads the blob GC journal and the pre-journal orphans, asks every owner of a
 * byte whether it still needs the file, and reports what could be freed. It has no sweep and no
 * unlink dependency at all: enabling removal is a separate owner-gated change (STOP 6), including the
 * OQ-11a decision on Trash TTL provenance.
 *
 * A file is "eligible" only when every probe is bound, every probe answered "not needed", and the
 * grace period (extended by any protected restore point that still holds it) has passed. Anything
 * else is kept, with the first reason found; an unbound or failing probe keeps it as `unknown`.
 */

export interface MediaBytesProbeInput { readonly workspaceId: string; readonly sha256: string; readonly storageKey: string }
type Probe = (input: MediaBytesProbeInput) => Promise<boolean>;
/** Each owner answers `true` when it still needs these bytes. An absent probe means "cannot tell". */
export interface MediaBytesProbes {
  readonly live?: Probe; readonly trashed?: Probe; readonly rendition?: Probe; readonly forms?: Probe; readonly transfer?: Probe;
  /** Age of the oldest PROTECTED restore point that still holds these bytes, or null when none does. */
  readonly recovery?: (input: MediaBytesProbeInput) => Promise<{ protectedRestorePointAgeMs: number | null }>;
}
const OWNER_PROBES = ["live", "trashed", "rendition", "forms", "transfer"] as const;
export type MediaBytesKeepReason = (typeof OWNER_PROBES)[number] | "recovery" | "grace" | "unknown";

export interface MediaBytesItem { readonly storageKey: string; readonly sha256: string; readonly reason: BlobPurgeReason | null; readonly bytes: number | null }
export interface MediaBytesReport {
  readonly eligible: { readonly manual: MediaBytesItem[]; readonly trashTtl: MediaBytesItem[] };
  readonly kept: Array<MediaBytesItem & { readonly why: MediaBytesKeepReason }>;
  readonly legacyOrphans: MediaBytesItem[];
}
export interface MediaBytesPolicyRequired {
  readonly gc: { readonly workspaceId: string; readonly graceMs: number; now(): number; listLegacyOrphans(input: { workspaceId: string }): Promise<Array<{ sha256: string; storageKey: string }>> };
  readonly journal: { list(input: { workspaceId: string }): Promise<HostBlobGcJournalEntry[]> };
  readonly probes: MediaBytesProbes;
  readonly stat: (storageKey: string) => Promise<{ size: number } | null>;
  readonly signal: AbortSignal;
}

async function answer<T>(probe: ((input: MediaBytesProbeInput) => Promise<T>) | undefined, input: MediaBytesProbeInput): Promise<T | "unknown"> {
  if (!probe) return "unknown";
  try { return await probe(input); } catch { return "unknown"; }
}

/** The first reason to keep a journaled file, or null when it is eligible. @complexity O(probes). */
async function keepReason(required: { entry: HostBlobGcJournalEntry; probes: MediaBytesProbes; graceMs: number; now: number }): Promise<MediaBytesKeepReason | null> {
  const { entry, probes, graceMs, now } = required;
  const input = { workspaceId: entry.workspaceId, sha256: entry.sha256, storageKey: entry.storageKey };
  for (const name of OWNER_PROBES) {
    const needed = await answer(probes[name], input);
    if (needed === "unknown") return "unknown";
    if (needed) return name;
  }
  const recovery = await answer(probes.recovery, input);
  if (recovery === "unknown") return "unknown";
  const journaledAt = Date.parse(entry.journaledAt);
  if (!Number.isFinite(journaledAt)) return "unknown";
  // DR-004: gc_grace = max(configured default, age of the oldest retained restore point).
  const grace = Math.max(graceMs, recovery.protectedRestorePointAgeMs ?? 0);
  return now - journaledAt < grace ? "grace" : null;
}

async function sizeOf(stat: MediaBytesPolicyRequired["stat"], storageKey: string): Promise<number | null> {
  try { return (await stat(storageKey))?.size ?? null; } catch { return null; }
}

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("The storage report stopped because the site is shutting down.");
}

/**
 * Build the report-only media policy.
 * @returns `{ id, kind, measure, report }` and deliberately no `sweep`.
 * @throws from `report`/`measure` when the journal or orphan read fails, or the signal aborts.
 * @complexity O(journal rows + orphans) probe and stat calls, one at a time.
 * @example createMediaBytesPolicy({ gc, journal, probes, stat, signal }, {}).measure()
 */
export function createMediaBytesPolicy(required: MediaBytesPolicyRequired, _optional: Record<string, never> = {}) {
  const { gc, journal, probes, stat, signal } = required;
  async function report(): Promise<MediaBytesReport> {
    const result: MediaBytesReport = { eligible: { manual: [], trashTtl: [] }, kept: [], legacyOrphans: [] };
    const now = gc.now();
    for (const entry of await journal.list({ workspaceId: gc.workspaceId })) {
      throwIfStopped(signal);
      const why = await keepReason({ entry, probes, graceMs: gc.graceMs, now });
      const item = { storageKey: entry.storageKey, sha256: entry.sha256, reason: entry.reason, bytes: await sizeOf(stat, entry.storageKey) };
      if (why !== null) result.kept.push({ ...item, why });
      else (entry.reason === "manual" ? result.eligible.manual : result.eligible.trashTtl).push(item);
    }
    for (const orphan of await gc.listLegacyOrphans({ workspaceId: gc.workspaceId })) {
      throwIfStopped(signal);
      result.legacyOrphans.push({ ...orphan, reason: null, bytes: await sizeOf(stat, orphan.storageKey) });
    }
    return result;
  }
  async function measure(): Promise<{ bytes: number | null; items: number }> {
    const { eligible } = await report();
    const items = [...eligible.manual, ...eligible.trashTtl];
    const bytes = items.some(item => item.bytes === null) ? null : items.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
    return { bytes, items: items.length };
  }
  return { id: "media-bytes", kind: "old-copy" as const, measure, report };
}
