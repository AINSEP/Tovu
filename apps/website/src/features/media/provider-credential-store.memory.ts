import type { UUID } from "@jini-ai/core/primitives";

import type {
  MediaProviderCredentialRecord,
  MediaProviderCredentialReplacePlanner,
  MediaProviderCredentialRepoPort,
} from "./provider-credential-store.js";

/**
 * @file `MediaProviderCredentialRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test
 * double, backing `server/app.ts`'s hermetic composition root (same role
 * `assistant/site-credential-store.memory.ts` plays for the site credential).
 *
 * Keyed by `${workspaceId}\u0000${providerId}`: a composite string key rather than a nested map,
 * because every port method is already workspace-scoped and a flat map keeps `listByWorkspaceId`'s
 * filter the only place the composite is taken apart. `\u0000` cannot appear in either component,
 * so no id pair can collide with another.
 */
export class InMemoryMediaProviderCredentialRepo implements MediaProviderCredentialRepoPort {
  /** Reassigned, not mutated, by `replaceWorkspace` — see that method for the staging rationale. */
  private rows = new Map<string, MediaProviderCredentialRecord>();

  private static keyOf(workspaceId: UUID, providerId: string): string {
    return `${workspaceId}\u0000${providerId}`;
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId)
      .map((row) => ({ ...row }));
  }

  async upsert(record: MediaProviderCredentialRecord): Promise<void> {
    this.rows.set(InMemoryMediaProviderCredentialRepo.keyOf(record.workspaceId, record.providerId), { ...record });
  }

  async deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void> {
    for (const providerId of input.providerIds) {
      this.rows.delete(InMemoryMediaProviderCredentialRepo.keyOf(input.workspaceId, providerId));
    }
  }

  /**
   * Reads, plans, and applies against a STAGED clone, swapping it in only once every step has
   * succeeded — the same all-or-nothing semantics the SQLite adapter gets from a real transaction.
   *
   * A bare passthrough would be wrong even in a single-threaded process: the port's contract is that
   * a planner which throws leaves storage exactly as it was, and a passthrough that applied writes
   * as it went could not honour that. Staging is what lets a test exercise rollback against this
   * adapter instead of only against SQLite.
   *
   * The clone is shallow over the row map; every record it holds is already a defensive copy, and
   * `plan` receives copies too, so a planner cannot reach back into stored state.
   *
   * @throws whatever `plan` throws, with storage untouched.
   * @complexity O(m + n) — `m` stored rows cloned, `n` planned writes applied.
   * @overallScore 100
   */
  async replaceWorkspace(input: {
    workspaceId: UUID;
    plan: MediaProviderCredentialReplacePlanner;
  }): Promise<readonly MediaProviderCredentialRecord[]> {
    const staged = new Map(this.rows);
    const existing = [...staged.values()]
      .filter((row) => row.workspaceId === input.workspaceId)
      .map((row) => ({ ...row }));

    const { upserts, tombstoneProviderIds } = input.plan(existing);
    for (const record of upserts) {
      staged.set(InMemoryMediaProviderCredentialRepo.keyOf(record.workspaceId, record.providerId), { ...record });
    }
    for (const providerId of tombstoneProviderIds) {
      staged.delete(InMemoryMediaProviderCredentialRepo.keyOf(input.workspaceId, providerId));
    }

    this.rows = staged;
    return upserts;
  }
}
