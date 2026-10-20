/**
 * @file The one Google HTTP client of the Google Workspace plugin: every Sheets and Drive call (chat
 * tools, admin actions, form delivery) goes through `createGoogleClient(...).request(...)`.
 *
 * Exists so the rules that keep a person's data and sign-in safe live in one place:
 * - the access token is fetched from the host immediately before each attempt and is never
 *   returned, logged or put in an error;
 * - the host's limiter is asked first (one instance budget and one per-connection budget);
 * - a failure becomes a safe {@link GoogleWorkspaceError} (code, `retryable`, `retryAfterMs`,
 *   `outcome`, next action); Google's message text is dropped because it can echo sheet contents;
 * - only retryable failures are retried, with jittered backoff that honours Retry-After, and a
 *   non-idempotent write whose outcome is unknown is never replayed.
 * Redirects, HTTPS-only and response-size bounds are enforced by the host's guarded HTTP capability.
 */
import { GoogleWorkspaceError, backoffMs, capRetryAfterMs, classifyFailure, shouldRetryInline } from './request-policy.mjs';

const INVALID_JSON = Symbol('invalid-json');

/** Host connection refusals (Jini api-connections codes) → the plugin's safe codes. */
const HOST_TOKEN_CODES = new Map([
  ['reconnect-required', 'reconnect-required'], ['not-connected', 'not-connected'], ['connection-not-found', 'not-connected'],
  ['revocation-pending', 'not-connected'], ['account-changed', 'account-changed'],
  // The host's per-connection budget refused the token read: nothing was sent, so it is a quota wait.
  ['rate-limited', 'quota-delay'],
]);

/** The host's wait, through the same cap as Google's Retry-After; dropped when unusable. @complexity O(1). */
function hostRetryAfter(cause) {
  const retryAfterMs = capRetryAfterMs({ ms: cause?.retryAfterMs });
  return retryAfterMs === undefined ? {} : { retryAfterMs };
}

/**
 * A fresh access token from the host, read right before the request that uses it. A host refusal
 * becomes the matching safe error (`invalid_grant` surfaces here as `reconnect-required`, and
 * nothing undelivered is dropped); any other host error passes through unchanged, since host
 * errors never carry secrets.
 * @complexity O(1) plus the host's token read.
 */
export async function accessTokenFor(required, _optional = {}) {
  try {
    return await required.connections.getAccessToken({ connectionRef: required.connectionRef });
  } catch (cause) {
    const code = HOST_TOKEN_CODES.get(cause?.code);
    if (code) throw new GoogleWorkspaceError({ code }, { cause, ...hostRetryAfter(cause) });
    throw cause;
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return INVALID_JSON; }
}

/**
 * One caller-supplied value as one encoded URL path segment.
 * @throws {GoogleWorkspaceError} `invalid-input` for an empty, `.` or `..` segment: URL parsing
 *   resolves those as dot segments and would move the request to another endpoint.
 * @complexity O(n) characters.
 */
export function pathSegment(required, _optional = {}) {
  const { value } = required;
  if (typeof value !== 'string' || value === '' || value === '.' || value === '..') throw new GoogleWorkspaceError({ code: 'invalid-input' });
  return encodeURIComponent(value);
}

/** `url` plus query parameters; an array value repeats the key (Sheets `ranges=`). @complexity O(q). */
export function buildUrl(required, _optional = {}) {
  const url = new URL(required.url);
  for (const [name, value] of Object.entries(required.query ?? {})) {
    for (const item of [value].flat()) url.searchParams.append(name, String(item));
  }
  return url.href;
}

function requestInit(request, token, signal) {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const body = request.body === undefined ? {} : { body: JSON.stringify(request.body) };
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  return { method: request.method ?? 'GET', headers, ...body, ...(signal ? { signal } : {}) };
}

/** A 2xx body as JSON (empty = null), or the failure a non-2xx or unreadable answer becomes. @complexity O(response). */
async function readResponse(response, kind) {
  const text = await response.text();
  const body = text === '' ? null : parseJson(text);
  if (response.ok && body !== INVALID_JSON) return { ok: true, value: body };
  if (response.ok) return { ok: false, error: new GoogleWorkspaceError({ code: 'unexpected-response', outcome: kind === 'read' ? 'not-applied' : 'unknown' }) };
  return { ok: false, error: classifyFailure({ kind, status: response.status, body: body === INVALID_JSON ? undefined : body, retryAfterHeader: response.headers.get('retry-after') }) };
}

/**
 * Creates the client over the host capabilities a module received.
 * @param {{ http: { fetch(target: { url: string }, init?: RequestInit): Promise<Response> }, connections: { getAccessToken(input: { connectionRef: string }): Promise<string> } }} required
 * @param {{ limiter?: { check(input: { key: string }): Promise<{ allowed: true } | { allowed: false, retryAfterSeconds: number }> }, sleep?: (ms: number) => Promise<void>, random?: () => number }} [optional]
 *   `limiter` is absent only during sign-in (the account read), which is not part of any budget.
 * @complexity O(attempts); each attempt is one limiter check, one token read and one request.
 */
export function createGoogleClient(required, optional = {}) {
  const { http, connections } = required;
  const { limiter } = optional;
  const sleep = optional.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  /** The first budget that refuses, as a retryable quota error; nothing when both allow. */
  async function quotaRefusal(connectionRef) {
    if (!limiter) return undefined;
    // The host keys every check by workspace and plugin; `instance` is this site's share of the
    // project budget and `connection:<ref>` the signed-in account's (QUOTA_BUDGETS documents both).
    for (const key of ['instance', `connection:${connectionRef}`]) {
      const verdict = await limiter.check({ key });
      if (!verdict.allowed) return new GoogleWorkspaceError({ code: 'quota-delay' }, { retryAfterMs: verdict.retryAfterSeconds * 1000 });
    }
    return undefined;
  }

  /**
   * The token, or the host budget's refusal as a failed attempt: that refusal happens before
   * anything is sent, so it follows the same backoff rules as the plugin's own limiter refusal.
   * Every other host refusal ends the call.
   */
  async function tokenOrRefusal(connectionRef) {
    try {
      return { token: await accessTokenFor({ connections, connectionRef }) };
    } catch (error) {
      if (error instanceof GoogleWorkspaceError && error.code === 'quota-delay') return { error };
      throw error;
    }
  }

  async function attemptOnce(request, signal) {
    const refusal = await quotaRefusal(request.connectionRef);
    if (refusal) return { ok: false, error: refusal };
    const { token, error } = await tokenOrRefusal(request.connectionRef);
    if (error) return { ok: false, error };
    let response;
    try {
      response = await http.fetch({ url: buildUrl(request) }, requestInit(request, token, signal));
    } catch (cause) {
      if (signal?.aborted) throw cause;
      return { ok: false, error: classifyFailure({ kind: request.kind, cause }) };
    }
    return readResponse(response, request.kind);
  }

  return {
    /**
     * One Google API call with the policy's retries. Resolves the parsed JSON body.
     * @param {{ connectionRef: string, url: string, method?: string, query?: Record<string, string | number | boolean | readonly (string | number)[]>, body?: unknown, kind: 'read' | 'idempotent-write' | 'write' }} request
     * @param {{ signal?: AbortSignal }} [options]
     */
    async request(request, options = {}) {
      for (let attempt = 0; ; attempt += 1) {
        const result = await attemptOnce(request, options.signal);
        if (result.ok) return result.value;
        const delayMs = backoffMs({ attempt, retryAfterMs: result.error.retryAfterMs }, optional.random ? { random: optional.random } : {});
        if (!shouldRetryInline({ error: result.error, attempt, delayMs })) throw result.error;
        await sleep(delayMs);
      }
    },
  };
}
