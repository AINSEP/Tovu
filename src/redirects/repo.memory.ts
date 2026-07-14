/**
 * @file In-memory `RedirectRepoPort` adapter (rule-of-two adapter #1,
 * ADR-006). Test/dev double — no persistence beyond process lifetime.
 *
 * Also satisfies `RedirectDbHandle` (`ports.internal.ts`) directly — `save()`
 * is implemented as the same two-step write (`insertRedirect` then
 * `insertRevision`) that `redirects.ts`/`capture.ts` call independently via
 * `insertRedirectAndRevision`; both paths converge on identical storage
 * semantics without this file importing `ports.internal.ts`'s function value
 * (only its `RedirectDbHandle` type, structurally satisfied here).
 */
import type { RedirectDbHandle } from "./ports.internal";
import type { RedirectRepoPort } from "./ports";
import { RedirectNotFoundError } from "./types";
import type { ListRedirectsFilter, RedirectRecord, RedirectRevision } from "./types";

function compareTieBreak(a: RedirectRecord, b: RedirectRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aRecency = a.updatedAt || a.createdAt;
  const bRecency = b.updatedAt || b.createdAt;
  if (aRecency !== bRecency) return aRecency > bRecency ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class InMemoryRedirectRepo implements RedirectRepoPort, RedirectDbHandle {
  private readonly records = new Map<string, RedirectRecord>();
  private readonly revisionsByRedirectId = new Map<string, RedirectRevision[]>();

  constructor(seed: RedirectRecord[] = []) {
    for (const record of seed) this.records.set(record.id, { ...record });
  }

  private all(workspaceId: string): RedirectRecord[] {
    return [...this.records.values()].filter((r) => r.workspaceId === workspaceId);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<RedirectRecord | null> {
    const record = this.records.get(required.id);
    return record && record.workspaceId === required.workspaceId ? { ...record } : null;
  }

  async lookupExact(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = this.all(required.workspaceId).filter(
      (r) =>
        r.status === "active" &&
        r.matchType === "exact" &&
        r.fromPattern === required.path &&
        (!required.includeOverrideOnly || r.override)
    );
    candidates.sort(compareTieBreak);
    return candidates[0] ? { ...candidates[0] } : null;
  }

  async lookupLongestPrefix(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = this.all(required.workspaceId).filter((r) => {
      if (r.status !== "active" || r.matchType !== "prefix") return false;
      if (required.includeOverrideOnly && !r.override) return false;
      const pattern = r.fromPattern;
      if (required.path === pattern) return true;
      return required.path.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`);
    });
    candidates.sort((a, b) => b.fromPattern.length - a.fromPattern.length || compareTieBreak(a, b));
    return candidates[0] ? { ...candidates[0] } : null;
  }

  async listDynamic(required: {
    workspaceId: string;
    includeOverrideOnly: boolean;
    limit: number;
  }): Promise<RedirectRecord[]> {
    const candidates = this.all(required.workspaceId).filter(
      (r) => r.status === "active" && r.matchType === "wildcard" && (!required.includeOverrideOnly || r.override)
    );
    candidates.sort((a, b) => b.fromPattern.length - a.fromPattern.length || compareTieBreak(a, b));
    return candidates.slice(0, required.limit).map((r) => ({ ...r }));
  }

  async list(filter: ListRedirectsFilter): Promise<RedirectRecord[]> {
    return this.all(filter.workspaceId)
      .filter((r) => filter.status === undefined || r.status === filter.status)
      .filter((r) => filter.source === undefined || r.source === filter.source)
      .filter((r) => filter.matchType === undefined || r.matchType === filter.matchType)
      .map((r) => ({ ...r }));
  }

  async findByFromPattern(required: {
    workspaceId: string;
    fromPattern: string;
  }): Promise<RedirectRecord | null> {
    const candidates = this.all(required.workspaceId).filter(
      (r) => r.status === "active" && r.fromPattern === required.fromPattern
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) => (a.matchType === "exact" ? 0 : 1) - (b.matchType === "exact" ? 0 : 1) || (a.id < b.id ? -1 : 1)
    );
    return { ...candidates[0] };
  }

  async save(required: { record: RedirectRecord; revision: RedirectRevision }): Promise<void> {
    this.insertRedirect(required.record);
    this.insertRevision(required.revision);
  }

  async tombstone(required: {
    workspaceId: string;
    id: string;
    revision: RedirectRevision;
  }): Promise<void> {
    const existing = this.records.get(required.id);
    if (!existing || existing.workspaceId !== required.workspaceId) {
      throw new RedirectNotFoundError(`redirect '${required.id}' was not found`);
    }
    this.insertRedirect(required.revision.state);
    this.insertRevision(required.revision);
  }

  // -------------------------------------------------------------------
  // RedirectDbHandle (used by redirects.ts/capture.ts via ports.internal.ts)
  // -------------------------------------------------------------------

  insertRedirect(record: RedirectRecord): void {
    this.records.set(record.id, { ...record });
  }

  insertRevision(revision: RedirectRevision): void {
    const list = this.revisionsByRedirectId.get(revision.redirectId) ?? [];
    list.push({ ...revision });
    this.revisionsByRedirectId.set(revision.redirectId, list);
  }

  /** Test-only helper: the append-only revision ledger for one redirect, in seq order. */
  listRevisionsForTests(redirectId: string): RedirectRevision[] {
    return [...(this.revisionsByRedirectId.get(redirectId) ?? [])].sort((a, b) => a.seq - b.seq);
  }
}
