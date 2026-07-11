/**
 * @file Newsletter — port contracts (INTERFACES & TYPES ONLY; no adapter logic).
 *
 * Draft ADR-034 (PROPOSED). One seam is declared here; `MailerPort` is imported, not declared:
 *
 *  1. `MailerPort` — imported from the shared `../mail` core primitive (ADR-037). Round-3 audit
 *     fold (TM-admin-sweep-001): the shape previously declared locally here predated ADR-037 and
 *     didn't match its frozen contract (`originPluginId` vs `sourceContext`, optional `sendBatch`
 *     vs the mandatory façade). Newsletter now imports the one shape every mail consumer shares.
 *
 *     IMPORTANT (ADR-024 §3): the Newsletter *plugin* never holds a live `MailerPort` object. The
 *     plugin submits send intent as data (through the outbox/command spine); **core** injects and
 *     calls the `MailerPort`. The port lives in core's DI graph, not across the plugin ABI.
 *
 *  2. `SubscriberDirectoryPort` — the **Members seam** (Members is designed in parallel; NOT here).
 *     Newsletter depends on this read seam to resolve a subscriber's address/consent at audience
 *     materialization; Members owns the implementation. Round-3 audit fold: this is a
 *     **single-evaluator typed dependency**, not an ADR-006 port — an in-memory test double does
 *     not count as Members' "second adapter" (ADR-037 amendment 6 precedent). Promote to a real
 *     port only if a second genuine directory adapter (e.g. an external ESP sync) is ever built.
 *
 * Grounding imports (typecheck against real code): `../core/ports`, `../mail`.
 */
import type { UUID } from "../core/ports";

export type { MailerPort } from "../mail";

/* ------------------------------------------------------------------------------------------------
 * SubscriberDirectoryPort — the Members seam (READ-only; Members owns the write side)
 * ------------------------------------------------------------------------------------------------ */

/** The subset of a Members-owned subscriber that Newsletter needs at send time. */
export interface SubscriberContact {
  subscriberId: UUID;
  workspaceId: UUID;
  email: string;
  /** Members-owned consent/lifecycle flag; a `false` here suppresses regardless of subscription. */
  emailDeliverable: boolean;
}

/**
 * Read port into Members. Newsletter NEVER writes subscriber identity/consent through this — it
 * only resolves contact info to freeze into the audience snapshot. Composite `(workspaceId, id)`
 * scoping (ADR-021 §4) is honoured by every method taking `workspaceId` explicitly (ADR-007).
 *
 * Single-evaluator typed dependency, NOT an ADR-006 port (Round-3 audit fold; round-2 re-audit
 * finding Codex-R2-001 caught this same misrepresentation surviving here after the ADR text was
 * fixed). `InMemorySubscriberDirectory` is a test double / interim implementation only — it does
 * NOT count as a second production adapter (ADR-037 amendment 6 precedent). Promote to a real
 * ADR-006 port only if a second genuine directory adapter (e.g. an external ESP sync) is built;
 * until then this stays `MembersSubscriberDirectory` (interim double) — see ADR-034 OPEN-1.
 */
export interface SubscriberDirectoryPort {
  getContact(required: {
    workspaceId: UUID;
    subscriberId: UUID;
  }): Promise<SubscriberContact | null>;
  getContacts(required: {
    workspaceId: UUID;
    subscriberIds: readonly UUID[];
  }): Promise<readonly SubscriberContact[]>;
}

/* ------------------------------------------------------------------------------------------------
 * Send-pipeline job payload (ADR-009 outbox spine) — serializable job the worker claims
 * ------------------------------------------------------------------------------------------------ */

/** The unit of work the outbox worker claims to drive one batch of a campaign's fan-out. */
export interface SendBatchJob {
  workspaceId: UUID;
  campaignId: UUID;
  audienceSnapshotId: UUID;
  /** The slice of `p_newsletter__sends` rows (by id) this job attempts. */
  sendIds: readonly UUID[];
}
