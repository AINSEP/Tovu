/**
 * @file The ONE test-send operation behind `mail_send_test` and
 * `POST /api/admin/v1/workspaces/:workspaceId/system/mail-test-send` (email design, phase 3:
 * "shared callable test operation + HTTP adapter; optional chosen recipient").
 *
 * The message goes through the site's normal mailer, so suppression, test mode, the provider's own
 * rate limit and the send ledger all still apply; this file adds only what a deliberate,
 * person-triggered test needs on top: a validated recipient (the operator's own address by
 * default), a small token bucket plus duplicate-click guard, and a truthful outcome. A result says
 * what is KNOWN at send time (accepted by the provider, captured locally, redirected by test mode,
 * or failed); it never says "delivered", because only later provider feedback could.
 */
import { ToolInputError } from "@jini-ai/core";
import type { UserRepoPort } from "@jini-ai/user-management";
import type { MailTestModeSetting } from "../settings/mail-provider.js";
import { isMailDeliveryAvailable, mailSenderIdentityFor, type MailerPort, type MailSenderIdentityPort } from "../../platform/mail/index.js";

/** Placeholder From for a non-delivering mailer; a real provider gets the site's configured sender. */
const TEST_FALLBACK_SENDER = { email: "no-reply@mail.local", name: "Tovu" } as const;

/** A local limiter refusal: `duplicate` is a second click inside the guard window. */
export type MailTestSendRefusal = { ok: false; reason: "duplicate" | "rate_limited"; retryAfterMs: number };

/** Deliberate test sends per site; separate from (and in front of) the provider's own bucket. */
export interface MailTestSendLimiter {
  tryTake(required: { principalId: string; to: string }): { ok: true } | MailTestSendRefusal;
}

/** Ports the operation reads; the field names match `RouteDeps`, so a route can pass its deps through. */
export interface MailTestSendDeps {
  workspaceId: string;
  mailer: MailerPort;
  /** The operator's account, for the default recipient. */
  userRepo?: Pick<UserRepoPort, "findByPrincipalId">;
  /** The site's system-mail From (`platform/mail/sender-identity.ts`). */
  mailSenderIdentity?: MailSenderIdentityPort;
  /** Shared by the route and the tool (one per site, `deps.ts`); absent (hermetic roots), only the
   *  provider's own limits apply. */
  mailTestSendLimiter?: MailTestSendLimiter;
  /** Fresh `core.mail.testMode`, so a redirect is reported as one. Absent: treated as off. */
  mailTestMode?: () => Promise<MailTestModeSetting>;
}

/** Where the message is meant to go, frozen before any approval card or send. */
export interface MailTestSendPlan {
  to: string;
  /** True when the caller chose the recipient; false for the operator's own address. */
  chosen: boolean;
  driver: string;
  /** Set when test mode will rewrite the recipient. */
  redirectTo?: string;
  /** True when test mode keeps the message locally instead of sending it. */
  capture?: boolean;
}

interface Common { to: string; from: string; driver: string; at: string }
export type MailTestSendResult =
  /** The provider accepted the message for delivery; delivery itself is not yet known. */
  | Common & { outcome: "accepted"; providerMessageId: string }
  /** Nothing left this machine: kept by test-mode capture or printed by the local console driver. */
  | Common & { outcome: "captured"; where: "capture" | "console"; providerMessageId: string }
  /** Test mode sent it to another address instead of `to`. */
  | Common & { outcome: "redirected"; redirectedTo: string; providerMessageId: string }
  /** Refused or failed; the code and message are the mailer's caller-safe ones. */
  | Common & { outcome: "failed"; errorCode: string; message: string; retryable: boolean; retryAfterMs?: number };

const MAX_ADDRESS = 254;
// One mailbox, no display name, no list: anything else is refused rather than guessed at.
const ADDRESS = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]+$/;

/**
 * A chosen recipient, or a caller error. Only one plain address is accepted.
 * @complexity O(address length).
 */
export function readTestRecipient(required: { value: unknown }): string | undefined {
  if (required.value === undefined) return undefined;
  const value = typeof required.value === "string" ? required.value.trim() : "";
  if (value.length === 0 || value.length > MAX_ADDRESS || !ADDRESS.test(value)) {
    throw new ToolInputError({ message: "to must be one email address, such as owner@example.com. Nothing was sent." });
  }
  return value;
}

/**
 * The signed-in operator's own address: the account email, else a username that is an address.
 * @throws {ToolInputError} When the account has no address and no recipient was chosen.
 */
async function operatorAddress(deps: MailTestSendDeps, principalId: string): Promise<string> {
  const user = await deps.userRepo?.findByPrincipalId({ workspaceId: deps.workspaceId, principalId });
  const address = [user?.email, user?.username].find((value) => typeof value === "string" && value.includes("@"));
  if (!address) throw new ToolInputError({ message: "Your account has no email address, so there is nowhere to send a test by default. Enter a recipient, or add an address to your user profile. Nothing was sent." });
  return address;
}

/**
 * Resolve the recipient and say where the message will really go. Sends nothing.
 * @param required.principalId - The operator; their account address is the default recipient.
 * @param required.to - An already validated chosen recipient ({@link readTestRecipient}).
 * @complexity One user lookup and one settings read.
 * @example await planMailTestSend({ principalId, to: "ops@example.com" }, deps)
 */
export async function planMailTestSend(required: { principalId: string; to?: string }, deps: MailTestSendDeps): Promise<MailTestSendPlan> {
  const to = required.to ?? await operatorAddress(deps, required.principalId);
  const mode = deps.mailTestMode ? await deps.mailTestMode() : { mode: "off" as const };
  return {
    to, chosen: required.to !== undefined, driver: deps.mailer.capabilities().driver,
    ...(mode.mode === "redirect" ? { redirectTo: mode.to } : {}), ...(mode.mode === "capture" ? { capture: true } : {}),
  };
}

const REFUSALS: Readonly<Record<MailTestSendRefusal["reason"], { errorCode: string; message: string }>> = {
  duplicate: { errorCode: "MAIL_TEST_DUPLICATE", message: "A test email to this address was just sent; wait a moment before sending another." },
  rate_limited: { errorCode: "MAIL_TEST_RATE_LIMITED", message: "Too many test emails were sent recently; try again later." },
};

/** What the mailer's answer means for this plan, most local explanation first. */
function outcomeOf(plan: MailTestSendPlan, providerMessageId: string, mailer: MailerPort): MailTestSendResult["outcome"] | "console" {
  if (providerMessageId.startsWith("captured:")) return "captured";
  if (!isMailDeliveryAvailable(mailer)) return "console";
  return plan.redirectTo === undefined ? "accepted" : "redirected";
}

function successResult(common: Common, plan: MailTestSendPlan, providerMessageId: string, mailer: MailerPort): MailTestSendResult {
  const outcome = outcomeOf(plan, providerMessageId, mailer);
  if (outcome === "captured" || outcome === "console") return { ...common, outcome: "captured", where: outcome === "console" ? "console" : "capture", providerMessageId };
  if (outcome === "redirected") return { ...common, outcome, redirectedTo: plan.redirectTo!, providerMessageId };
  return { ...common, outcome: "accepted", providerMessageId };
}

/**
 * Send one test email as planned and report what is known. Refusals (local limiter, suppression,
 * provider) come back as `outcome: "failed"` with their own code, never as a throw.
 * @param required.plan - From {@link planMailTestSend}; re-validated permissions are the caller's job.
 * @param required.ref - Stable id of this request (tool execution id or the route's request id): the
 *   idempotency key, so a retried request replays the ledger's answer instead of sending twice.
 * @param optional.now - Clock for the result timestamp; defaults to `Date.now`.
 * @complexity One limiter take and at most one delivery.
 * @example await runMailTestSend({ principalId, plan, ref: ctx.executionId }, deps)
 */
export async function runMailTestSend(
  required: { principalId: string; plan: MailTestSendPlan; ref: string },
  deps: MailTestSendDeps,
  optional: { now?: () => number } = {},
): Promise<MailTestSendResult> {
  const { plan } = required;
  const at = () => new Date((optional.now ?? Date.now)()).toISOString();
  const senderIdentity = mailSenderIdentityFor({ mailer: deps.mailer }, deps.mailSenderIdentity ? { senderIdentity: deps.mailSenderIdentity } : {});
  const from = await senderIdentity.resolve({ workspaceId: deps.workspaceId, fallback: TEST_FALLBACK_SENDER });
  const base = { to: plan.to, from: from.email, driver: plan.driver };
  const taken = deps.mailTestSendLimiter?.tryTake({ principalId: required.principalId, to: plan.to.toLowerCase() }) ?? { ok: true as const };
  if (!taken.ok) return { ...base, at: at(), outcome: "failed", ...REFUSALS[taken.reason], retryable: true, retryAfterMs: taken.retryAfterMs };
  const result = await deps.mailer.send(
    { workspaceId: deps.workspaceId, to: { email: plan.to }, from, subject: "Test email from your site", text: "This is a test email sent at your request. If you can read it, your site can deliver email." },
    // The operator is waiting on this message: transactional, interactive lane.
    { idempotencyKey: `mail:test:${required.ref}`, workspaceId: deps.workspaceId, sourceContext: { module: "mail", ref: required.ref }, purpose: "transactional", lane: "interactive" },
  );
  const common = { ...base, at: at() };
  if (result.ok) return successResult(common, plan, result.providerMessageId, deps.mailer);
  return { ...common, outcome: "failed", errorCode: result.errorCode, message: result.message, retryable: result.retryable, ...(result.retryAfterMs === undefined ? {} : { retryAfterMs: result.retryAfterMs }) };
}

/** Defaults: 5 deliberate tests in a burst, one more every 12 minutes; a second click within 15 s is a duplicate. */
export const TEST_SEND_BURST = 5;
export const TEST_SEND_REFILL_MS = 12 * 60_000;
export const TEST_SEND_DUPLICATE_MS = 15_000;

/**
 * One site-wide token bucket plus a per-(operator, recipient) duplicate-click guard, in memory.
 * In memory is enough here: it protects inboxes and the provider quota from repeated clicks, and
 * the send ledger's idempotency key already covers a replayed request.
 * @param optional.now - Clock in ms; defaults to `Date.now`.
 * @complexity O(1) amortized per take; the duplicate map keeps only entries inside the window.
 * @example createMailTestSendLimiter({}, { now: () => 0 }).tryTake({ principalId: "p", to: "a@b.co" })
 */
export function createMailTestSendLimiter(
  _required: Record<string, never> = {},
  optional: { now?: () => number; burst?: number; refillMs?: number; duplicateMs?: number } = {},
): MailTestSendLimiter {
  const now = optional.now ?? Date.now;
  const burst = optional.burst ?? TEST_SEND_BURST;
  const refillMs = optional.refillMs ?? TEST_SEND_REFILL_MS;
  const duplicateMs = optional.duplicateMs ?? TEST_SEND_DUPLICATE_MS;
  let tokens = burst;
  let updatedAt = now();
  const lastByKey = new Map<string, number>();
  return {
    tryTake: ({ principalId, to }) => {
      const at = now();
      for (const [key, last] of lastByKey) if (at - last >= duplicateMs) lastByKey.delete(key);
      const key = `${principalId}\u0000${to}`;
      const last = lastByKey.get(key);
      if (last !== undefined) return { ok: false, reason: "duplicate", retryAfterMs: duplicateMs - (at - last) };
      tokens = Math.min(burst, tokens + (at - updatedAt) / refillMs);
      updatedAt = at;
      if (tokens < 1) return { ok: false, reason: "rate_limited", retryAfterMs: Math.ceil((1 - tokens) * refillMs) };
      tokens -= 1;
      lastByKey.set(key, at);
      return { ok: true };
    },
  };
}
