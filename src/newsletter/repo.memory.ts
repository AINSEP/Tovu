/**
 * @file In-memory adapters for all 6 Newsletter repo ports (ADR-PIPE-011 File Map).
 *
 * One class per port, matching `src/members/repo.memory.ts`'s convention: `private rows: X[];
 * constructor(initialRows: X[] = []) { this.rows = [...initialRows]; }`, then plain array
 * find/filter/push-or-replace methods. Rule-of-two adapter #1 (`repo.sqlite.ts` is #2).
 */
import type {
  AudienceSnapshotRow,
  CampaignRecord,
  CampaignRevision,
  ConfirmationTokenRecord,
  NewsletterListRow,
  SendRow,
  SubscriptionRow,
} from "./types";
import type {
  NewsletterAudienceSnapshotRepoPort,
  NewsletterCampaignRepoPort,
  NewsletterConfirmationTokenRepoPort,
  NewsletterListRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
} from "./ports";

const DEFAULT_LIST_LIMIT = 100;

export class InMemoryNewsletterCampaignRepo implements NewsletterCampaignRepoPort {
  private campaigns: CampaignRecord[];
  private revisions: CampaignRevision[];

  constructor(initial: { campaigns?: CampaignRecord[]; revisions?: CampaignRevision[] } = {}) {
    this.campaigns = [...(initial.campaigns ?? [])];
    this.revisions = [...(initial.revisions ?? [])];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<CampaignRecord | null> {
    return (
      this.campaigns.find((c) => c.workspaceId === required.workspaceId && c.id === required.id) ?? null
    );
  }

  async list(required: { workspaceId: string; afterId?: string; limit?: number }): Promise<CampaignRecord[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    let rows = this.campaigns.filter((c) => c.workspaceId === required.workspaceId);
    rows = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    if (required.afterId) {
      const idx = rows.findIndex((c) => c.id === required.afterId);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }
    return rows.slice(0, limit);
  }

  async saveCampaignRow(campaign: CampaignRecord): Promise<void> {
    const idx = this.campaigns.findIndex((c) => c.workspaceId === campaign.workspaceId && c.id === campaign.id);
    if (idx >= 0) this.campaigns[idx] = campaign;
    else this.campaigns.push(campaign);
  }

  async appendRevision(revision: CampaignRevision): Promise<void> {
    this.revisions.push(revision);
  }

  async listRevisions(required: { workspaceId: string; campaignId: string }): Promise<CampaignRevision[]> {
    return this.revisions
      .filter((r) => r.workspaceId === required.workspaceId && r.campaignId === required.campaignId)
      .sort((a, b) => a.seq - b.seq);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // In-process, single-threaded: mutations are already atomic — no-op, mirrors
    // `InMemorySettingsRepo.transaction`. A forced mid-transaction failure test (AC-08) therefore
    // proves the SQLite adapter's real transaction, not this one — see `repo.contract.test.ts`.
    return fn();
  }
}

export class InMemoryNewsletterListRepo implements NewsletterListRepoPort {
  private rows: NewsletterListRow[];

  constructor(initialRows: NewsletterListRow[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<NewsletterListRow | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.id === required.id) ?? null;
  }

  async findDefault(required: { workspaceId: string }): Promise<NewsletterListRow | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.isDefault) ?? null;
  }

  async list(required: { workspaceId: string }): Promise<NewsletterListRow[]> {
    return this.rows.filter((r) => r.workspaceId === required.workspaceId);
  }

  async save(row: NewsletterListRow): Promise<void> {
    const idx = this.rows.findIndex((r) => r.workspaceId === row.workspaceId && r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }
}

export class InMemoryNewsletterSubscriptionRepo implements NewsletterSubscriptionRepoPort {
  private rows: SubscriptionRow[];

  constructor(initialRows: SubscriptionRow[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<SubscriptionRow | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.id === required.id) ?? null;
  }

  async findBySubscriberAndList(required: {
    workspaceId: string;
    listId: string;
    subscriberId: string;
  }): Promise<SubscriptionRow | null> {
    return (
      this.rows.find(
        (r) =>
          r.workspaceId === required.workspaceId &&
          r.listId === required.listId &&
          r.subscriberId === required.subscriberId
      ) ?? null
    );
  }

  async list(required: {
    workspaceId: string;
    listId: string;
    afterId?: string;
    limit?: number;
  }): Promise<SubscriptionRow[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    let rows = this.rows
      .filter((r) => r.workspaceId === required.workspaceId && r.listId === required.listId)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    if (required.afterId) {
      const idx = rows.findIndex((r) => r.id === required.afterId);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }
    return rows.slice(0, limit);
  }

  async listSubscribed(required: { workspaceId: string; listId: string }): Promise<SubscriptionRow[]> {
    return this.rows.filter(
      (r) => r.workspaceId === required.workspaceId && r.listId === required.listId && r.status === "subscribed"
    );
  }

  async save(row: SubscriptionRow): Promise<void> {
    const idx = this.rows.findIndex((r) => r.workspaceId === row.workspaceId && r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }

  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    this.rows = this.rows.filter((r) => !(r.workspaceId === required.workspaceId && r.id === required.id));
  }
}

export class InMemoryNewsletterAudienceSnapshotRepo implements NewsletterAudienceSnapshotRepoPort {
  private rows: AudienceSnapshotRow[];

  constructor(initialRows: AudienceSnapshotRow[] = []) {
    this.rows = [...initialRows];
  }

  async findByCampaignId(required: { workspaceId: string; campaignId: string }): Promise<AudienceSnapshotRow | null> {
    return (
      this.rows.find((r) => r.workspaceId === required.workspaceId && r.campaignId === required.campaignId) ?? null
    );
  }

  async findById(required: { workspaceId: string; id: string }): Promise<AudienceSnapshotRow | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.id === required.id) ?? null;
  }

  async save(row: AudienceSnapshotRow): Promise<void> {
    // INV-06: immutable after creation — `save` is create-only; a duplicate id is a caller bug.
    const exists = this.rows.some((r) => r.workspaceId === row.workspaceId && r.id === row.id);
    if (exists) throw new Error(`AudienceSnapshotRow ${row.id} already exists and is immutable (INV-06)`);
    this.rows.push(row);
  }
}

export class InMemoryNewsletterSendRepo implements NewsletterSendRepoPort {
  private rows: SendRow[];

  constructor(initialRows: SendRow[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<SendRow | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.id === required.id) ?? null;
  }

  async findByIdempotencyKey(required: { workspaceId: string; idempotencyKey: string }): Promise<SendRow | null> {
    return (
      this.rows.find(
        (r) => r.workspaceId === required.workspaceId && r.idempotencyKey === required.idempotencyKey
      ) ?? null
    );
  }

  async listByCampaign(required: {
    workspaceId: string;
    campaignId: string;
    afterId?: string;
    limit?: number;
  }): Promise<SendRow[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    let rows = this.rows
      .filter((r) => r.workspaceId === required.workspaceId && r.campaignId === required.campaignId)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    if (required.afterId) {
      const idx = rows.findIndex((r) => r.id === required.afterId);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }
    return rows.slice(0, limit);
  }

  async listPendingByAudienceSnapshot(required: {
    workspaceId: string;
    audienceSnapshotId: string;
    limit: number;
  }): Promise<SendRow[]> {
    return this.rows
      .filter(
        (r) =>
          r.workspaceId === required.workspaceId &&
          r.audienceSnapshotId === required.audienceSnapshotId &&
          r.status === "pending"
      )
      .slice(0, required.limit);
  }

  async countPendingByCampaign(required: { workspaceId: string; campaignId: string }): Promise<number> {
    return this.rows.filter(
      (r) => r.workspaceId === required.workspaceId && r.campaignId === required.campaignId && r.status === "pending"
    ).length;
  }

  async save(row: SendRow): Promise<void> {
    const idx = this.rows.findIndex((r) => r.workspaceId === row.workspaceId && r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }

  async saveBatch(rows: readonly SendRow[]): Promise<void> {
    for (const row of rows) await this.save(row);
  }
}

export class InMemoryNewsletterConfirmationTokenRepo implements NewsletterConfirmationTokenRepoPort {
  private rows: ConfirmationTokenRecord[];

  constructor(initialRows: ConfirmationTokenRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<ConfirmationTokenRecord | null> {
    return this.rows.find((r) => r.workspaceId === required.workspaceId && r.id === required.id) ?? null;
  }

  async findUnconsumedBySubscription(required: {
    workspaceId: string;
    subscriptionId: string;
  }): Promise<ConfirmationTokenRecord[]> {
    return this.rows.filter(
      (r) =>
        r.workspaceId === required.workspaceId &&
        r.subscriptionId === required.subscriptionId &&
        r.consumedAt === null
    );
  }

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<ConfirmationTokenRecord | null> {
    return (
      this.rows.find((r) => r.workspaceId === required.workspaceId && r.tokenHash === required.tokenHash) ?? null
    );
  }

  async save(row: ConfirmationTokenRecord): Promise<void> {
    const idx = this.rows.findIndex((r) => r.workspaceId === row.workspaceId && r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }
}
