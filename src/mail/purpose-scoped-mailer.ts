/**
 * @file SPEC-022 C-005 / CIC U-001 — the purpose-scoped mailer seam gate (REQ-09/REQ-10,
 * INV-05, EC-04).
 *
 * CIC-designated security-critical unit (`critical-internal-constraints.md` U-001). Binding
 * constraints this file must satisfy:
 * - U-001-B1: classify via an explicit ALLOWLIST of known-interactive values, never a denylist
 *   of known-notification values — an unrecognized value is notification-lane by construction.
 * - U-001-B3: in `local` mode, lane resolution still runs (for observability) but never refuses.
 * - U-001-ORD1: `mode` is resolved once by the caller and passed in already-cached — this
 *   decorator never re-reads `process.env` per send.
 *
 * Decorator over the existing `MailerPort` (Article IV) — not a new port.
 */
import type { MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail } from "./ports";
import type { RuntimeMode } from "../server/runtime-mode";

export interface WrapMailerWithPurposeGateOptions {
  inner: MailerPort;
  /** Already-resolved (C-001), not re-read here per U-001-ORD1. */
  mode: RuntimeMode;
  /** Whether a durable outbox path is registered and ready for the given capability. */
  durableOutboxReady: (capabilityName: string) => boolean;
}

type MailerLane = "interactive" | "notification";

/**
 * U-001-B1: allowlist, not a denylist — only the literal `"interactive"` value proceeds
 * ungated. Everything else (undefined, `"notification"`, or any value that bypassed the type
 * system via a cast) resolves to the restrictive lane.
 */
function resolveLane(options: MailerSendOptions): MailerLane {
  return options.lane === "interactive" ? "interactive" : "notification";
}

function refusalError(capabilityName: string): Error {
  return new Error(
    `MAILER_SEND_REFUSED_NO_DURABLE_PATH: notification-lane mailer send refused for capability "${capabilityName}" — no durable outbox path registered`
  );
}

export function wrapMailerWithPurposeGate(options: WrapMailerWithPurposeGateOptions): MailerPort {
  const { inner, mode, durableOutboxReady } = options;

  function checkGate(sendOptions: MailerSendOptions): void {
    if (mode !== "production") return; // U-001-B3 — local mode never refuses.
    const lane = resolveLane(sendOptions);
    if (lane !== "notification") return;
    const capabilityName = sendOptions.sourceContext?.module ?? "unknown";
    if (!durableOutboxReady(capabilityName)) {
      throw refusalError(capabilityName);
    }
  }

  return {
    capabilities: () => inner.capabilities(),
    async send(message: OutboundEmail, sendOptions: MailerSendOptions): Promise<MailerSendResult> {
      checkGate(sendOptions);
      return inner.send(message, sendOptions);
    },
    async sendBatch(
      messages: readonly OutboundEmail[],
      sendOptions: MailerSendOptions
    ): Promise<readonly MailerSendResult[]> {
      checkGate(sendOptions);
      return inner.sendBatch(messages, sendOptions);
    },
  };
}
