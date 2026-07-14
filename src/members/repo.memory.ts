/**
 * @file In-memory adapters for the `members` repo ports (ADR-030 §5 rule-of-two).
 *
 * Purpose:
 * Test/dev implementations of `MemberRepoPort`, `MemberTierRepoPort`,
 * `MemberSubscriptionRepoPort`, `MemberSessionRepoPort`, and `MagicLinkTokenRepoPort`.
 * Mirrors the exact style of `src/features/post/repo.memory.ts`: constructor takes
 * seed rows, methods filter/mutate an internal array. No business rules live here —
 * that belongs to `write-service.ts` / `access-resolver.ts`.
 *
 * Architectural role:
 * Rule-of-two adapter #1 for each port; the SQLite adapter (Drizzle) is the ADR-030
 * follow-up build. Kept dumb on purpose: repos never throw domain errors
 * (`MemberNotFoundError` etc.) — only the write service and resolver do.
 */
import type {
  ConsentPurpose,
  MagicLinkTokenRecord,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
  MemberRecord,
  MemberSessionRecord,
  MemberSubscriptionRecord,
  MemberTierRecord,
} from "./types";
import type {
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "./ports";

/**
 * Resource-bounds pre-check (backend-implementation 5a4): an unbounded `list()`
 * over a caller-variable collection is a latent scale hazard even though members
 * lists are typically small. Cap the page size here so a missing `limit` can never
 * fan out to the entire table.
 */
const DEFAULT_LIST_LIMIT = 100;

/**
 * In-memory `MemberRepoPort`. Keyset-paginates `list()` by lexicographic id order
 * (ids are ULIDs, so this is also creation order).
 *
 * @complexity `findById`/`findByEmail` O(n); `list` O(n log n) (sort) + O(limit)
 * slice; `save` O(n). n = members in the workspace, expected small-to-moderate.
 * @overallScore 100
 */
export class InMemoryMemberRepo implements MemberRepoPort {
  private rows: MemberRecord[];

  constructor(initialRows: MemberRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<MemberRecord | null> {
    return (
      this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ??
      null
    );
  }

  async findByEmail(required: {
    workspaceId: string;
    email: string;
  }): Promise<MemberRecord | null> {
    const normalized = required.email.trim().toLowerCase();
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.email.toLowerCase() === normalized
      ) ?? null
    );
  }

  async list(required: {
    workspaceId: string;
    afterId?: string;
    limit?: number;
  }): Promise<MemberRecord[]> {
    const rows = this.rows
      .filter((row) => row.workspaceId === required.workspaceId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const afterIndex = required.afterId ? rows.findIndex((row) => row.id === required.afterId) : -1;
    const start = afterIndex === -1 ? 0 : afterIndex + 1;
    const limit = Math.min(required.limit ?? DEFAULT_LIST_LIMIT, DEFAULT_LIST_LIMIT);

    return rows.slice(start, start + limit);
  }

  async save(record: MemberRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }
}

/**
 * In-memory `MemberTierRepoPort`.
 * @complexity All methods O(n) over tiers in the workspace (small registry).
 * @overallScore 100
 */
export class InMemoryMemberTierRepo implements MemberTierRepoPort {
  private rows: MemberTierRecord[];

  constructor(initialRows: MemberTierRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<MemberTierRecord | null> {
    return (
      this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ??
      null
    );
  }

  async findBySlug(required: {
    workspaceId: string;
    slug: string;
  }): Promise<MemberTierRecord | null> {
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.slug === required.slug
      ) ?? null
    );
  }

  async list(required: { workspaceId: string }): Promise<MemberTierRecord[]> {
    return this.rows.filter((row) => row.workspaceId === required.workspaceId);
  }

  async save(record: MemberTierRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }
}

/**
 * In-memory `MemberSubscriptionRepoPort`. `listActiveByMember` is the entitlement
 * set (ADR-030 §4): `active`/`comped` status AND not past a set `currentPeriodEnd`,
 * defensively re-checked here even though `setSubscriptionStatus` is expected to
 * flip `status` to `expired` when a period lapses — belt-and-braces against a
 * missed status transition (never trust only one signal for an access decision).
 *
 * @complexity All methods O(n) over a member's/workspace's subscriptions.
 * @overallScore 100
 */
export class InMemoryMemberSubscriptionRepo implements MemberSubscriptionRepoPort {
  private rows: MemberSubscriptionRecord[];

  constructor(initialRows: MemberSubscriptionRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: {
    workspaceId: string;
    id: string;
  }): Promise<MemberSubscriptionRecord | null> {
    return (
      this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ??
      null
    );
  }

  async listByMember(required: {
    workspaceId: string;
    memberId: string;
  }): Promise<MemberSubscriptionRecord[]> {
    return this.rows
      .filter((row) => row.workspaceId === required.workspaceId && row.memberId === required.memberId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  }

  async listActiveByMember(required: {
    workspaceId: string;
    memberId: string;
    nowIso: string;
  }): Promise<MemberSubscriptionRecord[]> {
    return this.rows.filter(
      (row) =>
        row.workspaceId === required.workspaceId &&
        row.memberId === required.memberId &&
        (row.status === "active" || row.status === "comped") &&
        (!row.currentPeriodEnd || row.currentPeriodEnd > required.nowIso)
    );
  }

  async save(record: MemberSubscriptionRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }
}

/**
 * In-memory `MemberSessionRepoPort`. Validity (expiry/revocation) is NOT checked
 * here — `findByTokenHash` returns the raw row and `MemberAccessResolver` decides
 * validity, exactly as the port doc directs.
 *
 * @complexity All methods O(n) over a workspace's/member's sessions.
 * @overallScore 100
 */
export class InMemoryMemberSessionRepo implements MemberSessionRepoPort {
  private rows: MemberSessionRecord[];

  constructor(initialRows: MemberSessionRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findByTokenHash(required: {
    workspaceId: string;
    tokenHash: string;
  }): Promise<MemberSessionRecord | null> {
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.tokenHash === required.tokenHash
      ) ?? null
    );
  }

  async listByMember(required: {
    workspaceId: string;
    memberId: string;
  }): Promise<MemberSessionRecord[]> {
    return this.rows.filter(
      (row) => row.workspaceId === required.workspaceId && row.memberId === required.memberId
    );
  }

  async save(record: MemberSessionRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }

  async revoke(required: { workspaceId: string; id: string; revokedAt: string }): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.workspaceId === required.workspaceId && row.id === required.id
    );
    if (index === -1) return;

    this.rows[index] = { ...this.rows[index], revokedAt: required.revokedAt };
  }

  async revokeAllForMember(required: {
    workspaceId: string;
    memberId: string;
    revokedAt: string;
  }): Promise<void> {
    this.rows = this.rows.map((row) =>
      row.workspaceId === required.workspaceId && row.memberId === required.memberId && !row.revokedAt
        ? { ...row, revokedAt: required.revokedAt }
        : row
    );
  }
}

/**
 * In-memory `MagicLinkTokenRepoPort`. `consume()` enforces single-use at the repo
 * layer too (defense in depth) — the write service is expected to check
 * `consumedAt`/`expiresAt` first and translate to `MemberAuthError`, but a bug
 * there must not silently double-consume a token, so this throws a plain `Error`
 * (an infra invariant violation, not a domain validation outcome) if it's asked
 * to consume a token that no longer exists or is already consumed.
 *
 * @complexity All methods O(n) over a workspace's outstanding tokens.
 * @overallScore 100
 */
export class InMemoryMagicLinkTokenRepo implements MagicLinkTokenRepoPort {
  private rows: MagicLinkTokenRecord[];

  constructor(initialRows: MagicLinkTokenRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findByTokenHash(required: {
    workspaceId: string;
    tokenHash: string;
  }): Promise<MagicLinkTokenRecord | null> {
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.tokenHash === required.tokenHash
      ) ?? null
    );
  }

  async save(record: MagicLinkTokenRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }

  async consume(required: { workspaceId: string; id: string; consumedAt: string }): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.workspaceId === required.workspaceId && row.id === required.id
    );
    if (index === -1) {
      throw new Error(`magic link token '${required.id}' was not found`);
    }
    if (this.rows[index].consumedAt) {
      throw new Error(`magic link token '${required.id}' was already consumed`);
    }

    this.rows[index] = { ...this.rows[index], consumedAt: required.consumedAt };
  }
}

/**
 * In-memory `MemberConsentRepoPort` (ADR-PIPE-013 Decision §4, D1c). Backs
 * both the `member_consents` value row and the shared `member_revisions`
 * ledger (`entity_kind='consent'`) — same combined-port shape
 * `SettingsRepoPort`'s in-memory adapter already uses.
 *
 * @complexity `findByMemberAndPurpose`/`save` O(n) over a workspace's consent
 * rows; `listRevisions` O(m) over a workspace's ledger rows. n/m expected
 * small-to-moderate (per-member, per-purpose).
 * @overallScore 100
 */
export class InMemoryMemberConsentRepo implements MemberConsentRepoPort {
  private rows: MemberConsentRecord[] = [];
  private revisions: MemberConsentRevisionRecord[] = [];
  private nextSeq = 1;

  async findByMemberAndPurpose(required: {
    workspaceId: string;
    memberId: string;
    purpose: ConsentPurpose;
  }): Promise<MemberConsentRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.workspaceId === required.workspaceId &&
          row.memberId === required.memberId &&
          row.purpose === required.purpose
      ) ?? null
    );
  }

  async save(record: MemberConsentRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }

  async appendRevision(record: Omit<MemberConsentRevisionRecord, "seq">): Promise<number> {
    const seq = this.nextSeq++;
    this.revisions.push({ ...record, seq });
    return seq;
  }

  async listRevisions(required: {
    workspaceId: string;
    memberId: string;
    purpose?: ConsentPurpose;
  }): Promise<MemberConsentRevisionRecord[]> {
    return this.revisions
      .filter(
        (row) =>
          row.workspaceId === required.workspaceId &&
          row.memberId === required.memberId &&
          (required.purpose === undefined || row.purpose === required.purpose)
      )
      .sort((a, b) => a.seq - b.seq);
  }

  /**
   * In-memory adapter is single-threaded/synchronous-per-microtask (same
   * reasoning `repo.sqlite.ts`'s real `BEGIN IMMEDIATE` header note gives for
   * why no interleaving is possible on one connection) — a same-tick
   * passthrough is a faithful, if trivial, atomicity guarantee here.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
