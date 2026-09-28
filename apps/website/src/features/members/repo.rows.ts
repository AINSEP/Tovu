import type { Insertable, Selectable } from "kysely";

import type { JsonObject } from "@jini-ai/cms/core";
import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import { toBool } from "../../platform/db/kernel/index.js";
import type {
  ConsentEvidence,
  ConsentPurpose,
  ConsentStatus,
  MagicLinkTokenRecord,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
  MemberRecord,
  MemberSessionRecord,
  MemberStatus,
  MemberSubscriptionRecord,
  MemberSubscriptionSource,
  MemberSubscriptionStatus,
  MemberTierRecord,
  MemberTierStatus,
  MemberTierType,
} from "./types.js";

/**
 * @file Row mapping for the `members` tables, shared by every dialect: the columns are the generated
 * `ContentDatabase` types (snake_case, JSON as compact text, booleans via `toBool`). Neutral on
 * purpose — no repo, no driver.
 */

export type MemberRow = Selectable<ContentDatabase["members"]>;
export type MemberTierRow = Selectable<ContentDatabase["member_tiers"]>;
export type MemberSubscriptionRow = Selectable<ContentDatabase["member_subscriptions"]>;
export type MemberSessionRow = Selectable<ContentDatabase["member_sessions"]>;
export type MagicTokenRow = Selectable<ContentDatabase["member_magic_tokens"]>;
export type MemberConsentRow = Selectable<ContentDatabase["member_consents"]>;
export type MemberRevisionRow = Selectable<ContentDatabase["member_revisions"]>;

export function toMemberRecord(row: MemberRow): MemberRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    name: row.name ?? undefined,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    status: row.status as MemberStatus,
    note: row.note ?? undefined,
    fields: row.fields_json == null ? undefined : (JSON.parse(row.fields_json) as JsonObject),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

export function toMemberRow(record: MemberRecord): Insertable<ContentDatabase["members"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    email: record.email,
    name: record.name ?? null,
    email_verified_at: record.emailVerifiedAt ?? null,
    status: record.status,
    note: record.note ?? null,
    fields_json: record.fields == null ? null : JSON.stringify(record.fields),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

export function toMemberTierRecord(row: MemberTierRow): MemberTierRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    type: row.type as MemberTierType,
    status: row.status as MemberTierStatus,
    description: row.description ?? undefined,
    welcomePagePath: row.welcome_page_path ?? undefined,
    visibleInPortal: toBool(row.visible_in_portal) === true,
    monthlyPriceCents: row.monthly_price_cents == null ? undefined : Number(row.monthly_price_cents),
    yearlyPriceCents: row.yearly_price_cents == null ? undefined : Number(row.yearly_price_cents),
    currency: row.currency ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

export function toMemberTierRow(record: MemberTierRecord): Insertable<ContentDatabase["member_tiers"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    name: record.name,
    slug: record.slug,
    type: record.type,
    status: record.status,
    description: record.description ?? null,
    welcome_page_path: record.welcomePagePath ?? null,
    visible_in_portal: record.visibleInPortal ? 1 : 0,
    monthly_price_cents: record.monthlyPriceCents ?? null,
    yearly_price_cents: record.yearlyPriceCents ?? null,
    currency: record.currency ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

export function toMemberSubscriptionRecord(row: MemberSubscriptionRow): MemberSubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    tierId: row.tier_id,
    status: row.status as MemberSubscriptionStatus,
    source: row.source as MemberSubscriptionSource,
    externalRef: row.external_ref ?? undefined,
    startedAt: row.started_at,
    currentPeriodEnd: row.current_period_end ?? undefined,
    canceledAt: row.canceled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

export function toMemberSubscriptionRow(
  record: MemberSubscriptionRecord
): Insertable<ContentDatabase["member_subscriptions"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    member_id: record.memberId,
    tier_id: record.tierId,
    status: record.status,
    source: record.source,
    external_ref: record.externalRef ?? null,
    started_at: record.startedAt,
    current_period_end: record.currentPeriodEnd ?? null,
    canceled_at: record.canceledAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

export function toMemberSessionRecord(row: MemberSessionRow): MemberSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    userAgent: row.user_agent ?? undefined,
    ip: row.ip ?? undefined,
  };
}

export function toMemberSessionRow(record: MemberSessionRecord): Insertable<ContentDatabase["member_sessions"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    member_id: record.memberId,
    token_hash: record.tokenHash,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    revoked_at: record.revokedAt ?? null,
    last_seen_at: record.lastSeenAt ?? null,
    user_agent: record.userAgent ?? null,
    ip: record.ip ?? null,
  };
}

export function toMagicLinkTokenRecord(row: MagicTokenRow): MagicLinkTokenRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    tokenHash: row.token_hash,
    purpose: row.purpose as MagicLinkTokenRecord["purpose"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? undefined,
  };
}

export function toMagicLinkTokenRow(record: MagicLinkTokenRecord): Insertable<ContentDatabase["member_magic_tokens"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    member_id: record.memberId,
    token_hash: record.tokenHash,
    purpose: record.purpose,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    consumed_at: record.consumedAt ?? null,
  };
}

export function toMemberConsentRecord(row: MemberConsentRow): MemberConsentRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    purpose: row.purpose as ConsentPurpose,
    status: row.status as ConsentStatus,
    evidence: JSON.parse(row.evidence_json) as ConsentEvidence,
    grantedAt: row.granted_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

export function toMemberConsentRow(record: MemberConsentRecord): Insertable<ContentDatabase["member_consents"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    member_id: record.memberId,
    purpose: record.purpose,
    status: record.status,
    evidence_json: JSON.stringify(record.evidence),
    granted_at: record.grantedAt ?? null,
    revoked_at: record.revokedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

export function toMemberConsentRevisionRecord(row: MemberRevisionRow): MemberConsentRevisionRecord {
  return {
    seq: Number(row.seq),
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    consentId: row.entity_id,
    purpose: (row.purpose ?? "") as ConsentPurpose,
    op: row.op as MemberConsentRevisionRecord["op"],
    beforeJson: row.before_json == null ? null : (JSON.parse(row.before_json) as JsonObject),
    afterJson: row.after_json == null ? null : (JSON.parse(row.after_json) as JsonObject),
    originModule: row.origin_module ?? "",
    createdAt: row.created_at,
  };
}

/** The `member_revisions` row a consent revision appends (compact JSON snapshots). */
export function toConsentRevisionRow(
  record: Omit<MemberConsentRevisionRecord, "seq">
): Insertable<ContentDatabase["member_revisions"]> {
  return {
    entity_kind: "consent",
    entity_id: record.consentId,
    workspace_id: record.workspaceId,
    member_id: record.memberId,
    purpose: record.purpose,
    op: record.op,
    before_json: record.beforeJson == null ? null : JSON.stringify(record.beforeJson),
    after_json: record.afterJson == null ? null : JSON.stringify(record.afterJson),
    origin_module: record.originModule,
    created_at: record.createdAt,
  };
}
