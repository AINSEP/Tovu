/**
 * @file `confirmation.ts` — ISSUE_CONFIRMATION_TOKEN / CONSUME_CONFIRMATION_TOKEN chokepoint
 * (ADR-PIPE-011 C-014, REQ-11/12/13/32, INV-03).
 *
 * `consumeConfirmationToken` must NEVER flip `SubscriptionRow.status` to `subscribed` before
 * `MembersConsentCapability.confirm` reports `granted` — reversing this order breaks REQ-11/REQ-32's
 * "Members is the source of truth" guarantee (INV-03: Newsletter never writes a Members consent
 * record directly, it only supplies evidence and observes the result).
 */
import { createHash, randomBytes } from "node:crypto";

import type { UUID } from "@jini-ai/core/primitives";
import { mailSenderIdentityFor, type MailerPort, type MailSenderIdentityPort } from "../../platform/mail/index.js";
import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import type { VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import { NewsletterConfirmTokenInvalidError } from "./errors.js";
import type {
  MembersConsentCapability,
  NewsletterConfirmationTokenRepoPort,
  NewsletterSubscriptionRepoPort,
} from "./ports.js";
import type { ConfirmationTokenRecord, SubscriptionRow } from "./types.js";

/** behavior.spec.md §3 — confirmation-token TTL, fixed at 72 hours. */
export const CONFIRMATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

export interface ConfirmationDeps {
  tokenRepo: NewsletterConfirmationTokenRepoPort;
  subscriptionRepo: NewsletterSubscriptionRepoPort;
  mailer: MailerPort;
  /** `null` = unbound — see `launch-gate.ts`'s file header on why this must never be stubbed to succeed. */
  consentCapability: MembersConsentCapability | null;
  originRegistry: OriginRegistryPort;
  clock: { nowIso(): string };
  ids: { newId(): string };
  /** Resolves the confirmation email's From (`platform/mail/sender-identity.ts`); absent, the
   *  `no-reply@newsletter.local` placeholder is used only while `mailer` is non-delivering. */
  senderIdentity?: MailSenderIdentityPort;
}

/** Placeholder From for a non-delivering mailer; real providers get the site's configured sender. */
const NEWSLETTER_FALLBACK_SENDER = { email: "no-reply@newsletter.local", name: "Newsletter" } as const;

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");

/** Compose an absolute origin URL from a `VerifiedOrigin` — mirrors `redirects/phase-handler.ts`'s local `composeOriginUrl`. */
function composeOriginUrl(origin: VerifiedOrigin): string {
  const matchesSchemePort = (origin.scheme === "https" && origin.port === 443) || (origin.scheme === "http" && origin.port === 80);
  const isDefaultPort = origin.port === undefined || matchesSchemePort;
  const authority = isDefaultPort ? origin.host : `${origin.host}:${origin.port}`;
  return `${origin.scheme}://${authority}${origin.basePath ?? ""}`;
}

/**
 * Mint a new confirmation token, invalidating every prior unconsumed token for this subscription
 * first ("newest wins" — behavior.spec.md §2.1), then send the confirm email. Does NOT change
 * `SubscriptionRow.status` (stays `pending` until `consumeConfirmationToken` succeeds).
 *
 * @throws SenderIdentityNotConfiguredError When a delivering mailer is active and the site has no
 *   sender configured — before any token is written.
 */
export async function issueConfirmationToken(required: {
  deps: ConfirmationDeps;
  input: { workspaceId: UUID; subscriptionId: UUID; recipientEmail: string };
}): Promise<{ tokenId: UUID; expiresAt: string }> {
  const { deps, input } = required;
  const now = deps.clock.nowIso();
  // Resolved first: a missing sender refuses before any prior token is superseded, so the
  // subscriber's last working link survives a send that could never have gone out.
  const from = await mailSenderIdentityFor({ mailer: deps.mailer }, { senderIdentity: deps.senderIdentity })
    .resolve({ workspaceId: input.workspaceId, fallback: NEWSLETTER_FALLBACK_SENDER });

  // "Newest wins": mark every prior unconsumed token superseded (consumed) before minting the new one.
  const prior = await deps.tokenRepo.findUnconsumedBySubscription({
    workspaceId: input.workspaceId,
    subscriptionId: input.subscriptionId,
  });
  for (const token of prior) {
    await deps.tokenRepo.save({ ...token, consumedAt: now });
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const tokenId = deps.ids.newId();
  const expiresAt = new Date(Date.parse(now) + CONFIRMATION_TOKEN_TTL_MS).toISOString();

  const record: ConfirmationTokenRecord = {
    id: tokenId,
    workspaceId: input.workspaceId,
    subscriptionId: input.subscriptionId,
    tokenHash,
    purpose: "newsletter_subscription_confirm",
    createdAt: now,
    expiresAt,
    consumedAt: null,
  };
  await deps.tokenRepo.save(record);

  const origin = await deps.originRegistry.canonicalOrigin({ workspaceId: input.workspaceId });
  const confirmUrl = `${composeOriginUrl(origin)}/newsletter/confirm?token=${rawToken}`;

  await deps.mailer.send(
    {
      workspaceId: input.workspaceId,
      to: { email: input.recipientEmail },
      from,
      subject: "Confirm your subscription",
      text: `Please confirm your subscription: ${confirmUrl}`,
      html: `<p>Please confirm your subscription: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
    },
    {
      idempotencyKey: `newsletter:confirm-email:${tokenId}`,
      workspaceId: input.workspaceId,
      sourceContext: { module: "newsletter", ref: tokenId },
      // A double-opt-in confirmation is transactional mail the subscriber is waiting on right
      // now, sent synchronously like the members sign-in link — the interactive lane, not the
      // background-notification lane (SPEC-022 REQ-09; `members/write-service.ts`).
      purpose: "transactional",
      lane: "interactive",
    }
  );

  return { tokenId, expiresAt };
}

/**
 * Validate the raw token, then call `MembersConsentCapability.request`/`.confirm` — the local
 * `SubscriptionRow.status` flip to `subscribed` happens STRICTLY AFTER a `granted` response, never
 * before or regardless of it (INV-03, AC-15).
 */
export async function consumeConfirmationToken(required: {
  deps: ConfirmationDeps;
  input: { workspaceId: UUID; rawToken: string };
}): Promise<{ subscription: SubscriptionRow; changed: boolean; eventId: string }> {
  const { deps, input } = required;
  const tokenHash = hashToken(input.rawToken);
  const token = await deps.tokenRepo.findByTokenHash({ workspaceId: input.workspaceId, tokenHash });
  if (!token) throw new NewsletterConfirmTokenInvalidError("confirmation token was not found", "not_found");
  // EC-02: a second click on an already-consumed token is invalid, not a repeat success (unlike the
  // unsubscribe EC-03 carve-out — deliberately different semantics, see `unsubscribe.ts`).
  if (token.consumedAt !== null) {
    throw new NewsletterConfirmTokenInvalidError("confirmation token was already consumed", "already_consumed");
  }

  const now = deps.clock.nowIso();
  // Boundary rule: a token submitted at EXACTLY `expiresAt` is treated as expired (closed-below/open-above).
  if (Date.parse(now) >= Date.parse(token.expiresAt)) {
    throw new NewsletterConfirmTokenInvalidError("confirmation token has expired", "expired");
  }

  const subscription = await deps.subscriptionRepo.findById({ workspaceId: input.workspaceId, id: token.subscriptionId });
  if (!subscription) throw new NewsletterConfirmTokenInvalidError("subscription was not found", "not_found");

  if (!deps.consentCapability) {
    throw new Error(
      "MembersConsentCapability is unbound — Newsletter cannot confirm consent until Members ships a real binding (ADR-PIPE-011)"
    );
  }

  await deps.consentCapability.request({
    workspaceId: input.workspaceId,
    subscriberId: subscription.subscriberId,
    evidence: { consentTextRef: "newsletter-subscription-confirm-v1", source: subscription.source, confirmTokenId: token.id },
  });
  const confirmResult = await deps.consentCapability.confirm({
    workspaceId: input.workspaceId,
    subscriberId: subscription.subscriberId,
    confirmTokenId: token.id,
  });

  // The token is single-use regardless of the consent outcome — mark consumed either way.
  await deps.tokenRepo.save({ ...token, consumedAt: now });

  if (confirmResult.status !== "granted") {
    throw new NewsletterConfirmTokenInvalidError(`consent was not granted (status: ${confirmResult.status})`, "expired");
  }

  const updated: SubscriptionRow = {
    ...subscription,
    status: "subscribed",
    consentRevisionIdAtSubscribe: confirmResult.consentRevisionId,
    subscribedAt: now,
    updatedAt: now,
  };
  await deps.subscriptionRepo.save(updated);
  return { subscription: updated, changed: subscription.status !== "subscribed", eventId: `newsletter-subscribed:${token.id}` };
}
