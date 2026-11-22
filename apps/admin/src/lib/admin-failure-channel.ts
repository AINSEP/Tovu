import { describeRequestFailure, formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import { createFailureChannel } from "@jini-ai/ui/panel-kit";
import { decodeApiError } from "@jini-ai/protocol";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { getAdminDraftIdentity } from "./admin-draft-identity";
import { JINI_CORE_VERSION, TOVU_ADMIN_VERSION } from "./app-version";

/** One retained incident for this admin instance; reset invalidates older in-flight requests. */
export const adminFailureChannel = createFailureChannel({}, {});

function record({ value }: { value: unknown }, _options = {}): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Pages are saved through the posts routes, whose wording says "post"; a caller that knows the row is a page swaps the word.
 * @complexity O(n) in the already-bounded text. */
function asPage({ text }: { text: string }, _options = {}): string {
  return text.replace(/\bpost(s?)\b/gi, (match, plural: string) => (match[0] === "P" ? "Page" : "page") + plural);
}

/** Accept only a formatter-shaped explanation from an authenticated response. Never stringify bodies.
 * @complexity O(1), fixed field checks; formatter bounds and redacts all displayed text.
 * @overallScore 98 — trusted server disclosure remains a boundary contract, tested with anonymous canaries.
 */
function approvedFailure({ value, entry }: { value: unknown; entry?: "page" }): UserFacingError | undefined {
  const candidate = record({ value });
  if (typeof candidate.message !== "string" || typeof candidate.action !== "string" || typeof candidate.step !== "string" || typeof candidate.cause !== "string") return undefined;
  const word = ({ text }: { text: string }, _options = {}) => (entry === "page" ? asPage({ text }) : text);
  return formatUserFacingError({ message: word({ text: candidate.message }), action: word({ text: candidate.action }), step: word({ text: candidate.step }), cause: candidate.cause }, {
    ...TOVU_ERROR_REDACTION_OPTIONS,
    errorId: typeof candidate.errorId === "string" ? candidate.errorId : undefined,
    time: typeof candidate.time === "string" ? candidate.time : undefined,
    appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : undefined,
    jiniVersion: typeof candidate.jiniVersion === "string" ? candidate.jiniVersion : undefined,
  });
}

/** Return approved server explanations only for signed-in, non-auth requests.
 * @complexity O(n) for n characters of bounded formatted text, via {@link approvedFailure}.
 */
function approvedResponseFailure(
  { details, authenticated, entry }: { details: Record<string, unknown>; authenticated: boolean; entry?: "page" },
  _options = {},
): UserFacingError | undefined {
  return authenticated ? approvedFailure({ value: details.failure, ...(entry ? { entry } : {}) }) : undefined;
}

/** Describe only the incident evidence actually returned by the request, never an inferred report.
 * @complexity O(1), no I/O. @overallScore 100 — fixed copy with directly tested reference/response cases.
 */
function incidentCause({ status, errorId }: { status: number; errorId?: string }): string {
  if (errorId) return "The error ID identifies the server report.";
  if (status === 0) return "No server response was received, so no server incident ID is available.";
  return "The server did not provide an incident ID for this response.";
}

/** Static route words and version segments stay; anything else (ids, slugs, tokens) becomes ":id".
 * Query strings and fragments never render. @complexity O(n) in the 2048-character bounded path. */
function redactedRoute({ path }: { path: string }, _options = {}): string {
  const clean = path.slice(0, 2048).split(/[?#]/, 1)[0] ?? "";
  return clean.split("/").slice(0, 32).map(segment => (segment === "" || /^(?:[a-z][a-z-]{0,39}|v\d{1,2})$/.test(segment) ? segment : ":id")).join("/");
}

/** A route missing from the vocabulary gets only the fallback wording; detect that by comparing with
 * the wording an empty route gets, so the shared describer stays the one owner of the fallback.
 * @complexity O(vocabulary operations) — one extra describe call. */
function isUnlistedRoute({ method, step }: { method?: string; step: string }, _options = {}): boolean {
  return describeRequestFailure({ method, route: "", vocabulary: ADMIN_FAILURE_VOCABULARY }).step === step;
}

/** The server's own small `{error, code}` refusal, in plain words; anything larger or differently
 * shaped is never stringified. The formatter still redacts and bounds the result.
 * @complexity O(1), fixed field checks. */
function serverReply({ body }: { body: unknown }, _options = {}): string | undefined {
  const reply = record({ value: body });
  const { error, code } = reply;
  if (Object.keys(reply).length > 4 || typeof error !== "string" || typeof code !== "string") return undefined;
  if (error.length > 300 || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return undefined;
  return `The server answered ${code}: ${error}.`;
}

/** Step and cause for one failed response. A route the vocabulary names keeps its approved wording;
 * any other route names its method and redacted path, plus the server's reply after sign-in.
 * @complexity O(path length) plus one fallback describe call. */
function failureEvidence(
  { body, path, method, status, step, errorId, authenticated }: {
    body: unknown; path: string; method?: string; status: number; step: string; errorId?: string; authenticated: boolean;
  },
  _options = {},
): { step: string; cause: string } {
  const unlisted = isUnlistedRoute({ method, step });
  const label = unlisted ? `${method?.toUpperCase() ?? "Request"} ${redactedRoute({ path })}` : step;
  const said = unlisted && authenticated ? serverReply({ body }) : undefined;
  return {
    step: status === 0 ? `${label} (no server response)` : `${label} (HTTP ${status})`,
    cause: said ? `${incidentCause({ status, errorId })} ${said}` : incidentCause({ status, errorId }),
  };
}

/** The server's codes for "the assistant's background service is not running right now". Boot
 * registers the agent daemon without spawning it, and an idle daemon parks; passive reads must not
 * wake it (W4-E2), so they answer one of these until the dock activates it or a message is sent.
 * `AGENT_DAEMON_KNOWN_FAILED` (a boot that really failed) is deliberately absent: that stays loud. */
const ASSISTANT_NOT_RUNNING_CODES: ReadonlySet<string> = new Set(["AGENT_DAEMON_PARKED", "AGENT_DAEMON_UNAVAILABLE"]);

/** Whether a final failed request belongs on the page-wide notice. Client errors stay with their
 * caller. A read answered "the assistant is not running yet" is a calm state its caller already shows
 * (the picker's "Connecting to the assistant…", External MCP's wait) and re-reads, not an incident;
 * the caller still receives the rejection. Writes refused the same way stay loud.
 * @complexity O(1). */
export function isPageWideFailure(
  { status, method, code }: { status: number; method: string; code?: string | undefined },
  _options = {},
): boolean {
  if (status !== 0 && status < 500) return false;
  const read = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";
  return !(read && status === 503 && code !== undefined && ASSISTANT_NOT_RUNNING_CODES.has(code));
}

/** Tovu's disclosure adapter: safe shared wording for legacy failures, approved details after sign-in.
 * Inputs are the final failed response and its captured session generation; no new I/O or retries.
 * @param options.basePath The API prefix the request was sent under, so an unlisted route is named in full.
 * @complexity O(path length + bounded formatted text); retains one incident in memory.
 * @overallScore 98 — the server owns approved explanation accuracy; legacy text renders only as a small,
 * redacted `{error, code}` reply from a signed-in request to a route the vocabulary does not name.
 */
export function publishAdminFailure(
  { body, path, method, status, generation, entry }: { body: unknown; path: string; method?: string; status: number; generation: number; entry?: "page" },
  { basePath = "" }: { basePath?: string } = {},
): void {
  const decoded = decodeApiError({ body });
  const details = record({ value: decoded.details });
  const envelope = record({ value: body });
  const reference = details.errorId ?? envelope.errorId ?? decoded.requestId;
  const errorId = typeof reference === "string" ? reference : undefined;
  const authenticated = getAdminDraftIdentity() !== null && !path.startsWith("/auth/");
  const approved = approvedResponseFailure({ details, authenticated, entry });
  const wording = describeRequestFailure({ method, route: entry === "page" ? path.replace(/\/posts\//, "/pages/") : path, vocabulary: ADMIN_FAILURE_VOCABULARY });
  const { step, cause } = failureEvidence({ body, path: `${basePath}${path}`, method, status, step: wording.step, errorId, authenticated });
  const failure = approved ?? formatUserFacingError({ ...wording, step, cause }, {
    ...TOVU_ERROR_REDACTION_OPTIONS, errorId, time: new Date().toISOString(),
    appVersion: `Tovu Admin ${TOVU_ADMIN_VERSION}`, jiniVersion: JINI_CORE_VERSION,
  });
  adminFailureChannel.publish({ failure, generation });
}

/** A browser refusing clipboard access (permission, unfocused page) is an expected refusal, not an
 * incident: show inline text only. Any other clipboard-path throw is a defect and is published.
 * @complexity O(1). */
export function isClipboardRefusal({ error }: { error: unknown }, _optional: Record<string, never> = {}): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "NotAllowedError";
}

/** The ONE way an admin action reports a failure that did not come from an API request (those are
 * published by `lib/api.ts` already — never publish them again). Shows the shared notice with the
 * plain explanation and a Copy details block: error ID, step, redacted cause, app + Jini version, time.
 * Never call it for an expected refusal (bad input, refused link, clipboard refusal): show inline text.
 * @param required.message - What failed, in plain words ("The menu embed code could not be copied.").
 * @param required.action - What the user can do next.
 * @param required.step - The step that failed, short ("Copy menu embed code").
 * @param required.cause - The caught value, unmodified; the formatter redacts it.
 * @param optional.generation - Capture `adminFailureChannel.getGeneration()` BEFORE an await so a
 *   session/site switch drops a stale report; defaults to the current generation.
 * @complexity Core redaction over the bounded cause; no I/O.
 */
export function publishLocalAdminFailure(
  { message, action, step, cause }: { message: string; action: string; step: string; cause: unknown },
  { generation = adminFailureChannel.getGeneration() }: { generation?: number } = {},
): void {
  const failure = formatUserFacingError({ message, action, step, cause }, {
    ...TOVU_ERROR_REDACTION_OPTIONS,
    errorId: crypto.randomUUID(),
    appVersion: `Tovu Admin ${TOVU_ADMIN_VERSION}`,
    jiniVersion: JINI_CORE_VERSION,
    time: new Date().toISOString(),
  });
  adminFailureChannel.publish({ failure, generation });
}
