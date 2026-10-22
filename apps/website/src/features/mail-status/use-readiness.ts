/**
 * @file **What uses email** (email phase 4): one readiness row per use of the site's mail, built
 * from the checks each owning feature already runs, never a second copy of them.
 *
 * | Use | Owner checks reused |
 * |---|---|
 * | Sign-in links | the members sender (`mailSenderIdentity`, as `members/write-service.ts` resolves it), Jini's purpose gate on the interactive lane |
 * | Confirmations | Newsletter's `evaluateLaunchGate` test-send subset (origin, production mailer) that `confirmation.ts` needs, the sender, the interactive gate |
 * | Form notifications | Forms' definitions (`notify.enabled` + recipients, as `@jini-ai/cms/forms`' subscriber reads them), the sender, the notification-lane gate |
 * | Newsletter | `evaluateLaunchGate` in full, the sender, the notification-lane gate |
 *
 * The purpose gate is asked through `platform/mail/purpose-gate-probe.ts`, so the production
 * `durableOutboxReady` gate is surfaced as a blocker exactly as it decides, and is not changed here.
 *
 * State per row: blocked > not_configured > disabled > ready, every reason kept. A check that
 * throws makes only its own row `unknown`. Evidence (the last observed outcome, from the activity
 * projection) is separate: a ready row with a bounced last send is both, and a failed evidence read
 * leaves the state standing with `evidence: null`.
 */
import { SenderIdentityNotConfiguredError, type MailSenderIdentityPort } from "@jini-ai/platform/mail";
import type { FormDefinitionRepoPort } from "@jini-ai/cms/forms";
import { isMailDeliveryAvailable, type MailerPort } from "../../platform/mail/index.js";
import type { MailPurposeGateProbe } from "../../platform/mail/purpose-gate-probe.js";
import { evaluateLaunchGate, type LaunchGateDeps, type LaunchGatePrecondition } from "../newsletter/launch-gate.js";
import type { MailActivityOutcome, MailActivityRepo, MailActivityUse } from "../mail/activity.repo.js";

export type MailUseState = "ready" | "blocked" | "disabled" | "not_configured" | "unknown";
export type MailUseId = "sign_in" | "newsletter_confirmation" | "form_notifications" | "newsletter";

export interface MailUseRow {
  use: MailUseId;
  label: string;
  /** Jini's send lane: interactive sends bypass the durable-outbox gate, notifications do not. */
  sendLane: "interactive" | "notification";
  /** The delivery lane (suppression scope, provider capacity). */
  mailLane: "transactional" | "bulk";
  state: MailUseState;
  /** Stable codes, in check order (e.g. `sender_not_configured`, `durable_outbox_not_ready`). */
  reasons: string[];
  /** The From this use would send with now; null when unresolved. */
  sender: string | null;
  /** The feature that owns this use's own settings (its admin screen links from here). */
  owner: "members" | "newsletter" | "forms";
  /** Configured form count, form notifications only. */
  formsConfigured?: number;
  evidence: { outcome: MailActivityOutcome; at: string } | null;
}

export interface MailUseReadinessReport {
  checkedAt: string;
  uses: MailUseRow[];
}

export interface MailUseReadinessDeps {
  workspaceId: string;
  mailer: MailerPort;
  mailSenderIdentity?: MailSenderIdentityPort;
  /** The live gate's probe; absent, gated rows report `purpose_gate_unavailable` as unknown. */
  mailPurposeGate?: MailPurposeGateProbe;
  formDefinitionRepo?: Pick<FormDefinitionRepoPort, "list">;
  /** Present only when Newsletter is installed; absent, its two rows are omitted. */
  newsletterLaunchGate?: LaunchGateDeps;
  mailActivity?: Pick<MailActivityRepo, "list">;
  nowIso?: () => string;
}

type Finding = { state: Exclude<MailUseState, "ready" | "unknown">; reason: string };
type Check = { findings: Finding[]; sender: string | null; formsConfigured?: number };
type UseSpec = Pick<MailUseRow, "use" | "label" | "sendLane" | "mailLane" | "owner"> & { activityUse: MailActivityUse };

const RANK: readonly MailUseState[] = ["blocked", "not_configured", "disabled"];
const SENDER_FALLBACK = { email: "no-reply@site.local" };

const SPECS: Record<MailUseId, UseSpec> = {
  sign_in: { use: "sign_in", label: "Sign-in links", sendLane: "interactive", mailLane: "transactional", owner: "members", activityUse: "sign_in" },
  newsletter_confirmation: { use: "newsletter_confirmation", label: "Subscription confirmations", sendLane: "interactive", mailLane: "transactional", owner: "newsletter", activityUse: "newsletter_confirmation" },
  form_notifications: { use: "form_notifications", label: "Form notifications", sendLane: "notification", mailLane: "transactional", owner: "forms", activityUse: "form_notification" },
  newsletter: { use: "newsletter", label: "Newsletter", sendLane: "notification", mailLane: "bulk", owner: "newsletter", activityUse: "newsletter" },
};

/** Newsletter's own precondition codes; a switched-off sending setting is Disabled, not Blocked. */
const LAUNCH_GATE_STATE: Record<LaunchGatePrecondition, Finding["state"]> = {
  sending_enabled_false: "disabled",
  consent_capability_unbound: "blocked",
  origin_not_verified: "blocked",
  mailer_adapter_not_production: "not_configured",
};

async function senderFinding(deps: MailUseReadinessDeps): Promise<{ sender: string | null; findings: Finding[] }> {
  if (!deps.mailSenderIdentity) return { sender: null, findings: [] };
  try {
    return { sender: (await deps.mailSenderIdentity.resolve({ workspaceId: deps.workspaceId, fallback: SENDER_FALLBACK })).email, findings: [] };
  } catch (err) {
    if (err instanceof SenderIdentityNotConfiguredError) return { sender: null, findings: [{ state: "blocked", reason: "sender_not_configured" }] };
    throw err;
  }
}

async function gateFinding(deps: MailUseReadinessDeps, spec: UseSpec): Promise<Finding[]> {
  if (!deps.mailPurposeGate) throw new Error("purpose_gate_unavailable");
  return (await deps.mailPurposeGate({ capabilityName: spec.owner, lane: spec.sendLane })) ? [] : [{ state: "blocked", reason: "durable_outbox_not_ready" }];
}

/** Delivery, sender and gate: what every use shares, in that order. */
async function sharedFindings(deps: MailUseReadinessDeps, spec: UseSpec): Promise<Check> {
  const delivery: Finding[] = isMailDeliveryAvailable(deps.mailer) ? [] : [{ state: "not_configured", reason: "mail_delivery_unavailable" }];
  const sender = await senderFinding(deps);
  return { findings: [...delivery, ...sender.findings, ...(await gateFinding(deps, spec))], sender: sender.sender };
}

async function launchGateFindings(gate: LaunchGateDeps, workspaceId: string, isTestSend: boolean): Promise<Finding[]> {
  const result = await evaluateLaunchGate({ deps: gate, workspaceId, isTestSend });
  // The shared delivery check already reports a console/memory mailer.
  return result.unmetPreconditions.filter((code) => code !== "mailer_adapter_not_production").map((code) => ({ state: LAUNCH_GATE_STATE[code], reason: code }));
}

const CHECKS: Record<MailUseId, (deps: MailUseReadinessDeps) => Promise<Check>> = {
  sign_in: (deps) => sharedFindings(deps, SPECS.sign_in),
  newsletter_confirmation: async (deps) => {
    const own = await launchGateFindings(deps.newsletterLaunchGate as LaunchGateDeps, deps.workspaceId, true);
    const shared = await sharedFindings(deps, SPECS.newsletter_confirmation);
    return { ...shared, findings: [...own, ...shared.findings] };
  },
  form_notifications: async (deps) => {
    if (!deps.formDefinitionRepo) throw new Error("forms_unavailable");
    const forms = await deps.formDefinitionRepo.list({ workspaceId: deps.workspaceId });
    const formsConfigured = forms.filter((form) => form.notify.enabled && form.notify.recipients.length > 0).length;
    if (formsConfigured === 0) return { findings: [{ state: "not_configured", reason: "no_form_notifications" }], sender: null, formsConfigured };
    return { ...(await sharedFindings(deps, SPECS.form_notifications)), formsConfigured };
  },
  newsletter: async (deps) => {
    const own = await launchGateFindings(deps.newsletterLaunchGate as LaunchGateDeps, deps.workspaceId, false);
    const shared = await sharedFindings(deps, SPECS.newsletter);
    return { ...shared, findings: [...own, ...shared.findings] };
  },
};

function stateOf(findings: Finding[]): MailUseState {
  return RANK.find((state) => findings.some((finding) => finding.state === state)) ?? "ready";
}

async function evidenceFor(deps: MailUseReadinessDeps, spec: UseSpec): Promise<MailUseRow["evidence"]> {
  if (!deps.mailActivity) return null;
  try {
    const [last] = await deps.mailActivity.list({ workspaceId: deps.workspaceId, limit: 1 }, { use: spec.activityUse });
    return last ? { outcome: last.outcome, at: last.updatedAt } : null;
  } catch {
    return null;
  }
}

async function rowFor(deps: MailUseReadinessDeps, use: MailUseId): Promise<MailUseRow> {
  const spec = SPECS[use];
  const base = { use, label: spec.label, sendLane: spec.sendLane, mailLane: spec.mailLane, owner: spec.owner };
  const evidence = await evidenceFor(deps, spec);
  try {
    const check = await CHECKS[use](deps);
    return { ...base, state: stateOf(check.findings), reasons: check.findings.map((finding) => finding.reason), sender: check.sender,
      ...(check.formsConfigured === undefined ? {} : { formsConfigured: check.formsConfigured }), evidence };
  } catch (err) {
    // Only this row is unknown; a known reason code is kept, anything else is a generic check failure.
    const reason = err instanceof Error && /^[a-z_]+$/.test(err.message) ? err.message : "check_failed";
    return { ...base, state: "unknown", reasons: [reason], sender: null, evidence };
  }
}

/**
 * Every use this site has, each checked independently and concurrently.
 * @complexity One owner check and one evidence read per use (at most four).
 * @example await readMailUseReadiness(deps)
 */
export async function readMailUseReadiness(deps: MailUseReadinessDeps): Promise<MailUseReadinessReport> {
  const uses: MailUseId[] = deps.newsletterLaunchGate ? ["sign_in", "newsletter_confirmation", "form_notifications", "newsletter"] : ["sign_in", "form_notifications"];
  return { checkedAt: (deps.nowIso ?? (() => new Date().toISOString()))(), uses: await Promise.all(uses.map((use) => rowFor(deps, use))) };
}

/** The host fields readiness reads; Newsletter's are optional so a root without it omits its rows. */
export type MailUseReadinessHostDeps = Omit<MailUseReadinessDeps, "newsletterLaunchGate"> & {
  originRegistry?: LaunchGateDeps["originRegistry"];
  newsletterCampaignRepo?: unknown;
  membersConsentCapability?: LaunchGateDeps["consentCapability"];
  newsletterSendingEnabled?: LaunchGateDeps["isSendingEnabled"];
};

/**
 * Readiness deps from route/tool deps. Newsletter's launch-gate inputs map exactly as
 * `features/newsletter/tool-registrations.ts`'s `toNewsletterSendPipelineDeps` maps them (an absent
 * sending setting is the fail-closed `false`), so this reads the same gate the send path evaluates.
 * @complexity O(1).
 */
export function mailUseReadinessDepsFrom(deps: MailUseReadinessHostDeps): MailUseReadinessDeps {
  const { originRegistry, newsletterCampaignRepo, membersConsentCapability, newsletterSendingEnabled, ...rest } = deps;
  if (newsletterCampaignRepo === undefined || originRegistry === undefined) return rest;
  return { ...rest, newsletterLaunchGate: { isSendingEnabled: newsletterSendingEnabled ?? (async () => false), consentCapability: membersConsentCapability ?? null, originRegistry, mailer: deps.mailer } };
}
