/**
 * @file The one activity operation (email phase 4) behind `mail_list_activity`/`mail_get_activity`
 * and `GET system/mail-activity[/:activityId]`: input parsing, the two-tier access rule, masking,
 * opaque ids and cursors over `features/mail/activity.repo.ts`.
 *
 * Access: `mail.activity.read` sees full recipients, ids and message ids; a holder of only the Email
 * page's status permission (`admin.forms.manage`) sees the same outcomes with masked recipients and
 * no id, so they can read the health of sending without learning who was mailed. A recipient filter
 * is a lookup by address, so it needs full access too. Neither tier ever sees a body, subject or
 * sign-in link: the ledger stores none.
 *
 * Cursors carry only a timestamp and a skip count, never a key or an address, so a masked page's
 * cursor discloses nothing its rows did not.
 */
import { ToolInputError } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  MAIL_ACTIVITY_OUTCOMES, MAIL_ACTIVITY_USES, type MailActivityFilter, type MailActivityPosition, type MailActivityRecord, type MailActivityRepo, type MailFeedbackRecord,
} from "../mail/activity.repo.js";
import { MAIL_ACTIVITY_READ_PERMISSION, MAIL_STATUS_PERMISSION } from "./permissions.js";

export const DEFAULT_MAIL_ACTIVITY_LIMIT = 25;
export const MAX_MAIL_ACTIVITY_LIMIT = 100;

export type MailActivityAccess = "full" | "masked";

export interface MailActivityDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  /** Absent in hermetic roots: every read refuses with {@link MailActivityUnavailableError}. */
  mailActivity?: MailActivityRepo;
}

export interface MailActivityQuery {
  limit: number;
  before?: MailActivityPosition;
  filter: MailActivityFilter;
}

export interface MailActivityItem {
  /** Opaque; present only with full access. Pass to `mail_get_activity`. */
  id?: string;
  recipient: string;
  use: MailActivityRecord["use"];
  outcome: MailActivityRecord["outcome"];
  lane: MailActivityRecord["lane"];
  providerId: string;
  providerMessageId?: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailActivityPage {
  access: MailActivityAccess;
  items: MailActivityItem[];
  nextCursor: string | null;
  /** First page with no rows: nothing was ever recorded, or nothing matches the filters. */
  empty: "none_recorded" | "no_matches" | null;
}

/** The permission refusal both adapters translate (403 / the model-facing forbidden rule). */
export class MailActivityForbiddenError extends Error {
  readonly permission: string;
  constructor(required: { permission: string; message: string }) {
    super(required.message);
    this.name = "MailActivityForbiddenError";
    this.permission = required.permission;
  }
}

export class MailActivityUnavailableError extends Error {
  constructor() {
    super("Email activity is unavailable on this server.");
    this.name = "MailActivityUnavailableError";
  }
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
function decode(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

/** `a***@example.com`: enough to tell two addresses apart at a glance, not to recover one. */
export function maskRecipient({ address }: { address: string }): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

function oneOf<T extends string>(required: { value: unknown; allowed: readonly T[]; field: string }): T | undefined {
  if (required.value === undefined || required.value === "") return undefined;
  if (typeof required.value === "string" && (required.allowed as readonly string[]).includes(required.value)) return required.value as T;
  throw new ToolInputError({ message: `${required.field} must be one of ${required.allowed.join(", ")}.` });
}

function readLimit(value: unknown): number {
  if (value === undefined || value === "") return DEFAULT_MAIL_ACTIVITY_LIMIT;
  const limit = typeof value === "string" ? Number(value) : value;
  if (typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= MAX_MAIL_ACTIVITY_LIMIT) return limit;
  throw new ToolInputError({ message: `limit must be a whole number from 1 to ${MAX_MAIL_ACTIVITY_LIMIT}.` });
}

function readCursor(value: unknown): MailActivityPosition | undefined {
  if (value === undefined || value === "") return undefined;
  const decoded = typeof value === "string" ? (decode(value) as { c?: unknown; s?: unknown } | undefined) : undefined;
  if (decoded && typeof decoded.c === "string" && Number.isInteger(decoded.s) && (decoded.s as number) >= 0) return { createdAt: decoded.c, skip: decoded.s as number };
  throw new ToolInputError({ message: "cursor is not a nextCursor this server returned." });
}

function readRecipient(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "string" && value.length <= 254 && value.includes("@")) return value.trim().toLowerCase();
  throw new ToolInputError({ message: "recipient must be one email address." });
}

/**
 * Parses list input from a tool's arguments or a route's query string (same field names).
 * @throws {ToolInputError} For any malformed field; nothing is read.
 */
export function readMailActivityQuery({ input }: { input: Record<string, unknown> }): MailActivityQuery {
  const outcome = oneOf({ value: input.outcome, allowed: MAIL_ACTIVITY_OUTCOMES, field: "outcome" });
  const use = oneOf({ value: input.use, allowed: MAIL_ACTIVITY_USES, field: "use" });
  const recipient = readRecipient(input.recipient);
  const before = readCursor(input.cursor);
  return {
    limit: readLimit(input.limit),
    ...(before ? { before } : {}),
    filter: { ...(outcome ? { outcome } : {}), ...(use ? { use } : {}), ...(recipient ? { recipient } : {}) },
  };
}

/**
 * Full with `mail.activity.read`, masked with only `admin.forms.manage`, else refused.
 * @throws {MailActivityForbiddenError} Holding neither (or, with `requireFull`, lacking the first).
 */
export async function resolveMailActivityAccess(
  required: { deps: Pick<MailActivityDeps, "authorize" | "workspaceId">; principalId: string },
  optional: { requireFull?: boolean } = {},
): Promise<MailActivityAccess> {
  const ask = (permission: string) => required.deps.authorize({ principalId: required.principalId, permission, workspaceId: required.deps.workspaceId, entityType: "mail" });
  if ((await ask(MAIL_ACTIVITY_READ_PERMISSION)).allowed) return "full";
  if (!optional.requireFull && (await ask(MAIL_STATUS_PERMISSION)).allowed) return "masked";
  const permission = optional.requireFull ? MAIL_ACTIVITY_READ_PERMISSION : `${MAIL_ACTIVITY_READ_PERMISSION} or ${MAIL_STATUS_PERMISSION}`;
  throw new MailActivityForbiddenError({ permission, message: `principal '${required.principalId}' is not authorized for '${permission}'` });
}

function toItem(record: MailActivityRecord, access: MailActivityAccess): MailActivityItem {
  const base = { use: record.use, outcome: record.outcome, lane: record.lane, providerId: record.providerId, errorCode: record.errorCode, createdAt: record.createdAt, updatedAt: record.updatedAt };
  if (access === "masked") return { recipient: maskRecipient({ address: record.recipient }), ...base };
  return { id: encode([record.idempotencyKey, record.recipient]), recipient: record.recipient, providerMessageId: record.providerMessageId, ...base };
}

/** The next keyset position: the page's last timestamp, skipping every row already shown at it. */
function nextPosition(page: MailActivityRecord[], before: MailActivityPosition | undefined): MailActivityPosition {
  const last = (page.at(-1) as MailActivityRecord).createdAt;
  const shownAtLast = page.filter((row) => row.createdAt === last).length;
  return { createdAt: last, skip: shownAtLast + (before?.createdAt === last ? before.skip : 0) };
}

function repo(deps: MailActivityDeps): MailActivityRepo {
  if (!deps.mailActivity) throw new MailActivityUnavailableError();
  return deps.mailActivity;
}

/**
 * One page, newest first. Reads `limit + 1` rows to know whether a next page exists.
 * @throws {MailActivityForbiddenError} Without access, or a recipient filter without full access.
 * @complexity One ledger page read.
 * @example listMailActivity({ principalId, query: readMailActivityQuery({ input: {} }) }, deps)
 */
export async function listMailActivity(required: { principalId: string; query: MailActivityQuery }, deps: MailActivityDeps): Promise<MailActivityPage> {
  const { query } = required;
  const access = await resolveMailActivityAccess({ deps, principalId: required.principalId }, { requireFull: query.filter.recipient !== undefined });
  const rows = await repo(deps).list({ workspaceId: deps.workspaceId, limit: query.limit + 1 }, { ...query.filter, ...(query.before ? { before: query.before } : {}) });
  const page = rows.slice(0, query.limit);
  const filtered = Object.keys(query.filter).length > 0;
  const next = rows.length > query.limit ? nextPosition(page, query.before) : undefined;
  return {
    access,
    items: page.map((row) => toItem(row, access)),
    nextCursor: next ? encode({ c: next.createdAt, s: next.skip }) : null,
    empty: page.length > 0 || query.before ? null : filtered ? "no_matches" : "none_recorded",
  };
}

/** Parses an activity id from `mail_list_activity`. @throws {ToolInputError} When it is not one. */
export function readMailActivityId({ value }: { value: unknown }): { idempotencyKey: string; recipient: string } {
  const decoded = typeof value === "string" && value !== "" ? decode(value) : undefined;
  if (Array.isArray(decoded) && decoded.length === 2 && decoded.every((part) => typeof part === "string")) return { idempotencyKey: decoded[0], recipient: decoded[1] };
  throw new ToolInputError({ message: "activityId must be an id from mail_list_activity." });
}

export interface MailActivityDetail {
  activity: MailActivityItem;
  /** Provider feedback for this message, oldest first; empty means none received yet, not delivered. */
  feedback: MailFeedbackRecord[];
}

/**
 * One send with its feedback timeline. Full access only.
 * @returns `null` when no such send exists in this workspace.
 * @complexity One ledger row and one feedback read.
 */
export async function getMailActivity(required: { principalId: string; activityId: { idempotencyKey: string; recipient: string } }, deps: MailActivityDeps): Promise<MailActivityDetail | null> {
  await resolveMailActivityAccess({ deps, principalId: required.principalId }, { requireFull: true });
  const found = await repo(deps).get({ workspaceId: deps.workspaceId, ...required.activityId });
  return found ? { activity: toItem(found.record, "full"), feedback: found.feedback } : null;
}
