import { inspect } from "node:util";

/** Visitor error policy: diagnostic detail belongs in the operator log, never in public replies. */
export interface SiteAssistantPublicError {
  readonly message: string;
  readonly code: string;
  readonly errorId: string;
}

export interface SiteAssistantErrorLogEntry {
  readonly errorId: string;
  readonly code: string;
  readonly diagnostic: string;
}

export type SiteAssistantErrorReporter = (
  required: { code: string; diagnostic: unknown },
  options?: { exactSecrets?: readonly string[] },
) => SiteAssistantPublicError;

const PUBLIC_MESSAGES: Readonly<Record<string, string>> = {
  RATE_LIMIT_EXCEEDED: "Too many messages. Please wait before trying again.",
  TOO_LARGE: "Your message is too long. Please shorten it and try again.",
  PAYLOAD_TOO_LARGE: "Your message and chat history are too long. Please shorten them and try again.",
  VALIDATION: "Please enter a message and try again.",
};
const DEFAULT_PUBLIC_MESSAGE = "The assistant couldn't answer right now. Please try again.";

/** Codes the visitor's own request causes (assistant off, bad or oversized input, rate limit). */
const VISITOR_CAUSED_CODES: ReadonlySet<string> = new Set(["ASSISTANT_DISABLED", "VALIDATION", "TOO_LARGE", "PAYLOAD_TOO_LARGE", "RATE_LIMIT_EXCEEDED"]);

/**
 * The error a logged entry becomes for an error tracker, or undefined when the visitor caused it
 * (those are answers, not incidents). Built from the entry's already-redacted diagnostic only: its
 * first line is the message, the whole text the stack.
 * @complexity O(n) in diagnostic length.
 */
export function siteAssistantIncident({ entry }: { entry: SiteAssistantErrorLogEntry }): Error | undefined {
  if (VISITOR_CAUSED_CODES.has(entry.code)) return undefined;
  const incident = new Error(entry.diagnostic.split("\n", 1)[0] || entry.code);
  incident.name = "SiteAssistantError";
  incident.stack = entry.diagnostic;
  return incident;
}

/** Preserve the whole diagnostic/stack for operators; non-Error throws remain diagnosable.
 * @complexity O(n) in diagnostic size; no I/O. */
function diagnosticText({ diagnostic }: { diagnostic: unknown }, _options = {}): string {
  if (diagnostic instanceof Error) return diagnostic.stack ?? diagnostic.message;
  if (typeof diagnostic === "string") return diagnostic;
  // Native inspection preserves circular/non-Error throws without executing custom serializers.
  return inspect(diagnostic, { depth: null, maxArrayLength: null, maxStringLength: null, customInspect: false, getters: false });
}

/**
 * One reporter pairs a fixed public message with the complete redacted operator diagnostic.
 * Inject ids, logging and the existing Jini redactor; callers may supply the resolved credential
 * as an exact secret, even when a provider echoes a key that has no recognizable secret shape.
 * @complexity O(n) in diagnostic text, dominated by the injected redactor; one log effect per error.
 */
export function createSiteAssistantErrorReporter(
  deps: {
    ids: { newId(): string };
    log: (entry: SiteAssistantErrorLogEntry) => void;
    redact: (required: { input: string }, options: { exactSecrets?: readonly string[] }) => string;
  },
  _options = {},
): SiteAssistantErrorReporter {
  return ({ code, diagnostic }, options = {}) => {
    const errorId = deps.ids.newId();
    deps.log({ errorId, code, diagnostic: deps.redact({ input: diagnosticText({ diagnostic }) }, options) });
    const text = Object.hasOwn(PUBLIC_MESSAGES, code) ? PUBLIC_MESSAGES[code]! : DEFAULT_PUBLIC_MESSAGE;
    return { code, errorId, message: text + " (error " + errorId + ")" };
  };
}
