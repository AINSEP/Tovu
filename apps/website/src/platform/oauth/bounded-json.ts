import { OAuthError } from "./errors.js";

/**
 * @file The byte-bounded JSON body reader every outbound call in `src/platform/oauth/` shares.
 *
 * It exists because the same twenty lines had already been written twice — once in
 * `token-endpoint.ts` and once in `device-code.ts` — and discovery plus dynamic registration would
 * have made four copies of a loop whose whole job is to be paranoid correctly. A reader that is
 * subtly different in one of four places is a reader that is wrong in one of four places.
 *
 * The paranoia is not decorative. Every caller here is reading a body from a third party over a
 * connection this process opened on an operator's behalf:
 *
 * - `response.json()` will buffer whatever arrives. A hostile or broken endpoint can stream until
 *   the process dies, and none of these documents is legitimately large.
 * - The cap has to be enforced MID-STREAM rather than from `Content-Length`, because a chunked
 *   response has no such header and a lying one has a wrong one.
 * - A body that is not a JSON *object* — an array, a bare string, HTML from a captive portal — is a
 *   malformed response rather than something to coerce.
 *
 * The messages are supplied by the caller rather than built here, because each subject has its own
 * operator-facing sentence and those strings are pinned by tests. This module owns the mechanism;
 * the caller owns what it is talking about.
 */

/** Generous for any of these documents, small enough that a hostile stream cannot exhaust memory. */
export const MAX_OAUTH_RESPONSE_BYTES = 64 * 1024;

/**
 * The four exact strings one subject needs. Supplied per call site so an operator reading a failure
 * is told which endpoint misbehaved, not merely that "an endpoint" did.
 */
export interface BoundedJsonMessages {
  /** Full sentence for a body past the cap. */
  readonly overflowMessage: string;
  readonly overflowOperatorAction: string;
  /** Full sentence for a body that is not a JSON object. */
  readonly notJsonMessage: string;
  readonly notJsonOperatorAction: string;
}

/**
 * Reads at most `maxBytes` of a response body as UTF-8, aborting the stream past that.
 *
 * @param response - The response whose body to read. A body-less response reads as `""`.
 * @param messages - Only `overflowMessage`/`overflowOperatorAction` are used here.
 * @param maxBytes - Defaults to {@link MAX_OAUTH_RESPONSE_BYTES}.
 * @throws {OAuthError} `OAUTH_MALFORMED_RESPONSE` when the body exceeds the cap.
 * @complexity O(n) in bytes read, hard-capped at `maxBytes`.
 */
export async function readBoundedOAuthText(
  response: Response,
  messages: Pick<BoundedJsonMessages, "overflowMessage" | "overflowOperatorAction">,
  maxBytes: number = MAX_OAUTH_RESPONSE_BYTES,
): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OAuthError("OAUTH_MALFORMED_RESPONSE", messages.overflowMessage, {
          operatorAction: messages.overflowOperatorAction,
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    // The stream is abandoned deliberately on the overflow path; cancelling releases the socket
    // instead of leaving the remote free to keep sending into a reader nobody is draining.
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parses a JSON *object* out of text, refusing anything else.
 *
 * @returns The parsed object, still fully untrusted — every member is `unknown` to the caller.
 * @throws {OAuthError} `OAUTH_MALFORMED_RESPONSE` on unparseable text, `null`, an array, or a scalar.
 * @complexity O(n) in the text length.
 */
export function parseOAuthJsonObject(
  text: string,
  messages: Pick<BoundedJsonMessages, "notJsonMessage" | "notJsonOperatorAction">,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (cause) {
    throw new OAuthError("OAUTH_MALFORMED_RESPONSE", messages.notJsonMessage, {
      operatorAction: messages.notJsonOperatorAction,
      cause,
    });
  }
}

/**
 * The two steps together: read the body under the cap, then parse it as a JSON object.
 *
 * @throws {OAuthError} `OAUTH_MALFORMED_RESPONSE`.
 * @complexity O(n) in bytes read, hard-capped at `maxBytes`.
 */
export async function readBoundedOAuthJson(
  response: Response,
  messages: BoundedJsonMessages,
  maxBytes: number = MAX_OAUTH_RESPONSE_BYTES,
): Promise<Record<string, unknown>> {
  return parseOAuthJsonObject(await readBoundedOAuthText(response, messages, maxBytes), messages);
}

/** RFC 8414 / RFC 7591 / RFC 6749 all publish string arrays; anything else in the slot is dropped
 *  rather than coerced, because a half-parsed capability list is worse than an empty one.
 *  @complexity O(n) in the array length. */
export function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : [];
}

/** A non-empty string member, or `null`. @complexity O(1). */
export function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
