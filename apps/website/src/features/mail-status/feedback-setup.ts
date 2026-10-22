/**
 * @file **Feedback setup** (email phase 5) behind `mail_get_feedback_setup` and
 * `GET system/mail-feedback`: for each active provider, whether it can report deliveries, bounces
 * and complaints, the webhook URL to paste into the provider, whether its signing secret is saved
 * (current and previous rotation slots, `features/mail/feedback-sources.ts`), and the newest
 * verified event.
 *
 * Presence only: the secret slots are read from the credential list by label, never decrypted, so
 * this read cannot leak or even touch a secret. "No events yet" (`no_events_yet`) is reported apart
 * from healthy ingestion (`receiving`), because a webhook nobody has called looks the same as a
 * broken one until the first event arrives.
 */
import type { OriginRegistryPort, VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import type { CustomCredentialSetRepoPort } from "../custom-credentials/index.js";
import { mailWebhookSecretLabels } from "../mail/feedback-sources.js";
import type { MailSuppressionAdminRepo } from "../mail/suppression-admin.repo.js";
import type { MailProviderConfiguration, MailProviderControl } from "../../platform/mail/mail-status.js";

export interface MailFeedbackSetupDeps {
  workspaceId: string;
  mailProviderControl?: Pick<MailProviderControl, "describe">;
  customCredentialSetRepo?: Pick<CustomCredentialSetRepoPort, "listByWorkspace">;
  originRegistry?: Pick<OriginRegistryPort, "canonicalOrigin">;
  mailSuppressionAdmin?: Pick<MailSuppressionAdminRepo, "lastFeedbackEvent">;
}

export interface MailWebhookSecretSlot {
  label: string;
  configured: boolean;
  updatedAt: string | null;
}

export interface MailFeedbackProviderSetup {
  providerId: string;
  label: string;
  lanes: readonly ("transactional" | "bulk")[];
  supported: boolean;
  /** `/hooks/mail/<providerId>` (`server/inbound/public-http/routes/mail-feedback.ts`). */
  webhookPath: string;
  /** Absolute, from the site's verified origin; null while the origin is unverified. */
  webhookUrl: string | null;
  signingSecret: { current: MailWebhookSecretSlot; previous: MailWebhookSecretSlot } | null;
  lastVerifiedEvent: { kind: "delivered" | "bounced" | "complained"; receivedAt: string } | null;
  state: "unsupported" | "secret_missing" | "no_events_yet" | "receiving";
}

export interface MailFeedbackSetupReport {
  /** False when this root cannot describe its providers; `providers` is then empty. */
  available: boolean;
  providers: MailFeedbackProviderSetup[];
}

/** Mirrors `features/newsletter/confirmation.ts`'s private `composeOriginUrl` (default ports elided). */
function originUrl(origin: VerifiedOrigin): string {
  const isDefaultPort = origin.port === undefined || (origin.scheme === "https" && origin.port === 443) || (origin.scheme === "http" && origin.port === 80);
  return `${origin.scheme}://${isDefaultPort ? origin.host : `${origin.host}:${origin.port}`}${origin.basePath ?? ""}`;
}

async function siteOrigin(deps: MailFeedbackSetupDeps): Promise<string | null> {
  if (!deps.originRegistry) return null;
  try {
    return originUrl(await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId }));
  } catch {
    return null;
  }
}

function slot(label: string, saved: Map<string, string>): MailWebhookSecretSlot {
  return { label, configured: saved.has(label), updatedAt: saved.get(label) ?? null };
}

function stateOf(setup: Pick<MailFeedbackProviderSetup, "supported" | "signingSecret" | "lastVerifiedEvent">): MailFeedbackProviderSetup["state"] {
  if (!setup.supported) return "unsupported";
  if (!setup.signingSecret?.current.configured && !setup.signingSecret?.previous.configured) return "secret_missing";
  return setup.lastVerifiedEvent ? "receiving" : "no_events_yet";
}

async function providerSetup(deps: MailFeedbackSetupDeps, provider: MailProviderConfiguration, context: { origin: string | null; saved: Map<string, string> }): Promise<MailFeedbackProviderSetup> {
  const supported = provider.capabilities.feedback;
  const webhookPath = `/hooks/mail/${encodeURIComponent(provider.id)}`;
  const [current, previous] = mailWebhookSecretLabels({ providerLabel: provider.label });
  const signingSecret = supported ? { current: slot(current, context.saved), previous: slot(previous, context.saved) } : null;
  const lastVerifiedEvent = supported && deps.mailSuppressionAdmin ? await deps.mailSuppressionAdmin.lastFeedbackEvent({ workspaceId: deps.workspaceId, providerId: provider.id }) : null;
  const setup = { providerId: provider.id, label: provider.label, lanes: provider.lanes, supported, webhookPath,
    webhookUrl: supported && context.origin ? `${context.origin}${webhookPath}` : null, signingSecret, lastVerifiedEvent };
  return { ...setup, state: stateOf(setup) };
}

/**
 * Feedback setup for every provider that currently sends for a lane.
 * @complexity One provider describe, one credential list, one origin read and one inbox probe per provider.
 * @example await readMailFeedbackSetup(deps)
 */
export async function readMailFeedbackSetup(deps: MailFeedbackSetupDeps): Promise<MailFeedbackSetupReport> {
  if (!deps.mailProviderControl?.describe) return { available: false, providers: [] };
  const report = await deps.mailProviderControl.describe();
  const active = report.providers.filter((provider) => provider.lanes.length > 0);
  const records = deps.customCredentialSetRepo ? await deps.customCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId }) : [];
  const saved = new Map(records.map((record) => [record.label, record.updatedAt] as const));
  const origin = await siteOrigin(deps);
  return { available: true, providers: await Promise.all(active.map((provider) => providerSetup(deps, provider, { origin, saved }))) };
}
