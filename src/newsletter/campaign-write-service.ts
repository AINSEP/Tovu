/**
 * @file `campaign-write-service.ts` — THE campaign write chokepoint (ADR-PIPE-011 C-009/C-010/C-011,
 * REQ-01/06/09, INV-01).
 *
 * The ONLY writer of `newsletter_campaigns`/`newsletter_campaign_revisions` — repo write methods
 * (`saveCampaignRow`/`appendRevision`) must never be called from outside this file (Code Review
 * enforces this as a file-boundary check, mirrors `SettingsWriteService`'s identical convention).
 * Calls `campaign.ts`'s `transitionCampaignStatus` before every status-affecting write; campaign +
 * revision write in the SAME transaction (INV-01: a campaign row must never exist without a
 * same-tx revision row).
 */
import type { UUID } from "../core/ports";
import { transitionCampaignStatus, type CampaignActorTier } from "./campaign";
import {
  NewsletterCampaignNotEditableError,
  NewsletterCampaignNotFoundError,
  NewsletterConflictError,
  NewsletterListNotFoundError,
  NewsletterValidationError,
} from "./errors";
import type { NewsletterCampaignRepoPort, NewsletterListRepoPort } from "./ports";
import type { CampaignCounters, CampaignRecord } from "./types";

const SUBJECT_MIN = 1;
const SUBJECT_MAX = 998;
const PREHEADER_MAX = 300;

export interface CampaignWriteServiceDeps {
  campaignRepo: NewsletterCampaignRepoPort;
  listRepo: NewsletterListRepoPort;
  clock: { nowIso(): string };
  ids: { newId(): string };
}

const ZERO_COUNTERS: CampaignCounters = {
  recipients: 0,
  delivered: 0,
  failed: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
};

function validateFields(fields: { subject: string; preheader?: string | null }): void {
  if (fields.subject.length < SUBJECT_MIN || fields.subject.length > SUBJECT_MAX) {
    throw new NewsletterValidationError(
      `subject must be between ${SUBJECT_MIN} and ${SUBJECT_MAX} characters`,
      "subject",
      "length"
    );
  }
  if (fields.preheader != null && fields.preheader.length > PREHEADER_MAX) {
    throw new NewsletterValidationError(`preheader must be at most ${PREHEADER_MAX} characters`, "preheader", "length");
  }
}

async function requireEditableListId(deps: CampaignWriteServiceDeps, workspaceId: UUID, listId: UUID): Promise<void> {
  const list = await deps.listRepo.findById({ workspaceId, id: listId });
  if (!list) throw new NewsletterListNotFoundError(`list ${listId} was not found`);
}

async function writeRevision(
  deps: CampaignWriteServiceDeps,
  campaign: CampaignRecord,
  actorId: UUID
): Promise<void> {
  const priorRevisions = await deps.campaignRepo.listRevisions({ workspaceId: campaign.workspaceId, campaignId: campaign.id });
  const seq = priorRevisions.length > 0 ? Math.max(...priorRevisions.map((r) => r.seq)) + 1 : 1;
  await deps.campaignRepo.saveCampaignRow(campaign);
  await deps.campaignRepo.appendRevision({
    campaignId: campaign.id,
    workspaceId: campaign.workspaceId,
    seq,
    state: campaign,
    actorId,
    recordedAt: deps.clock.nowIso(),
  });
}

/**
 * C-009 — create or edit a campaign's editorial fields (REQ-01/06/09). Never touches `status`
 * directly (no `status` field accepted — matches `UPDATE_CAMPAIGN`'s body schema, which does not
 * accept a status field at all per behavior.spec.md §1.1).
 *
 * @complexity O(1) DB round trips (bounded revision-listing to compute the next `seq`).
 * @overallScore 100
 */
export async function saveCampaign(required: {
  deps: CampaignWriteServiceDeps;
  input: {
    workspaceId: UUID;
    id?: UUID;
    actorId: UUID;
    expectedVersion?: number;
    fields: {
      subject: string;
      preheader?: string | null;
      fromName: string;
      fromEmail: string;
      replyTo: string;
      listId: UUID;
    };
  };
}): Promise<{ campaign: CampaignRecord; revisionSeq: number }> {
  const { deps, input } = required;
  validateFields(input.fields);
  await requireEditableListId(deps, input.workspaceId, input.fields.listId);

  return deps.campaignRepo.transaction(async () => {
    const now = deps.clock.nowIso();
    let campaign: CampaignRecord;

    if (input.id) {
      const existing = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.id });
      if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${input.id} was not found`);
      if (existing.status !== "draft") {
        throw new NewsletterCampaignNotEditableError(
          `campaign is '${existing.status}' and cannot be edited`,
          existing.status,
          "update"
        );
      }
      if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
        throw new NewsletterConflictError(
          "campaign was modified concurrently (EC-06)",
          "campaign",
          existing.id,
          input.expectedVersion,
          existing.version
        );
      }
      campaign = {
        ...existing,
        subject: input.fields.subject,
        preheader: input.fields.preheader ?? null,
        fromName: input.fields.fromName,
        fromEmail: input.fields.fromEmail,
        replyTo: input.fields.replyTo,
        listId: input.fields.listId,
        version: existing.version + 1,
        updatedAt: now,
      };
    } else {
      campaign = {
        id: deps.ids.newId(),
        workspaceId: input.workspaceId,
        status: "draft",
        subject: input.fields.subject,
        preheader: input.fields.preheader ?? null,
        fromName: input.fields.fromName,
        fromEmail: input.fields.fromEmail,
        replyTo: input.fields.replyTo,
        listId: input.fields.listId,
        scheduledAt: null,
        sendStartedAt: null,
        audienceSnapshotId: null,
        counters: ZERO_COUNTERS,
        version: 1,
        createdByPrincipal: input.actorId,
        createdAt: now,
        updatedAt: now,
      };
    }

    await writeRevision(deps, campaign, input.actorId);
    const revisions = await deps.campaignRepo.listRevisions({ workspaceId: campaign.workspaceId, campaignId: campaign.id });
    return { campaign, revisionSeq: Math.max(...revisions.map((r) => r.seq)) };
  });
}

async function transitionAndWrite(
  deps: CampaignWriteServiceDeps,
  required: { workspaceId: UUID; id: UUID; actorId: UUID; to: CampaignRecord["status"]; actorTier: CampaignActorTier }
): Promise<CampaignRecord> {
  return deps.campaignRepo.transaction(async () => {
    const existing = await deps.campaignRepo.findById({ workspaceId: required.workspaceId, id: required.id });
    if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${required.id} was not found`);

    const decision = transitionCampaignStatus({ from: existing.status, to: required.to, actorTier: required.actorTier });
    if (!decision.allowed) {
      throw new NewsletterCampaignNotEditableError(decision.reason, existing.status, `transition-to-${required.to}`);
    }

    const campaign: CampaignRecord = { ...existing, status: required.to, updatedAt: deps.clock.nowIso() };
    await writeRevision(deps, campaign, required.actorId);
    return campaign;
  });
}

/** C-010 — cancel a campaign (`admin.newsletter.campaign.compose` tier). */
export async function cancelCampaign(required: {
  deps: CampaignWriteServiceDeps;
  input: { workspaceId: UUID; id: UUID; actorId: UUID };
}): Promise<{ campaign: CampaignRecord }> {
  const campaign = await transitionAndWrite(required.deps, { ...required.input, to: "canceled", actorTier: "compose" });
  return { campaign };
}

/** C-011 — schedule a draft campaign (`admin.newsletter.campaign.schedule` tier). */
export async function scheduleCampaign(required: {
  deps: CampaignWriteServiceDeps;
  input: { workspaceId: UUID; id: UUID; actorId: UUID; scheduledAt: string };
}): Promise<{ campaign: CampaignRecord }> {
  const { deps, input } = required;
  const campaign = await deps.campaignRepo.transaction(async () => {
    const existing = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.id });
    if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${input.id} was not found`);

    await requireEditableListId(deps, input.workspaceId, existing.listId);

    const decision = transitionCampaignStatus({ from: existing.status, to: "scheduled", actorTier: "schedule" });
    if (!decision.allowed) {
      throw new NewsletterCampaignNotEditableError(decision.reason, existing.status, "schedule");
    }

    const updated: CampaignRecord = {
      ...existing,
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      updatedAt: deps.clock.nowIso(),
    };
    await writeRevision(deps, updated, input.actorId);
    return updated;
  });
  return { campaign };
}
