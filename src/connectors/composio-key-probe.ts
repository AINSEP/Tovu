/**
 * @file Verifies a Composio API key against Composio before it is persisted.
 *
 * ## Why this is a persist-time gate, when BYOK's equivalent is a separate route
 *
 * The repo's precedent for "check a key against its real provider" is
 * `routes/admin/assistant/test-connection.ts` + `list-models.ts`: standalone probe routes that
 * never persist, which the Execution-mode tab calls explicitly. Those are separate ROUTES for a
 * specific reason — a BYOK key is not stored on this server at all (ADR-028 §6; it lives in the
 * admin browser's own `localStorage`), so there is no persist step to hang a check on.
 *
 * Composio's project key IS stored server-side, in the sealed `composio_config` row, so the PUT is
 * the natural gate and a separate route would leave the "saved but never verified" state exactly
 * as it was. What carries over from that precedent is its MECHANICS, and those are followed here:
 * the outbound call is made by the server rather than the browser, the candidate key is used for
 * that one call and is not persisted unless it passes, and the provider's own error text is never
 * surfaced to the caller.
 *
 * ## What is deliberately NOT carried over
 *
 * `stored-credential-probe.ts`'s SSRF guard, because the threat it answers does not exist here.
 * That guard is needed because a BYOK probe sends a credential to a `baseUrl` supplied in the
 * REQUEST BODY. This probe's origin is not caller-controlled — it is Composio's fixed default, or
 * the operator's own `TOVU_COMPOSIO_BASE_URL`. Importing a guard against an absent threat would
 * read like a safety argument without being one.
 */

/** Composio's own default, mirrored from `ComposioConnectorProvider`'s `DEFAULT_COMPOSIO_BASE_URL`. */
const DEFAULT_COMPOSIO_BASE_URL = "https://backend.composio.dev";

/** One bounded probe. Short because a human is waiting on a form submit, not a background job. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * The cheapest authenticated read Composio exposes. `limit=1` because the response body is
 * discarded entirely — only the status code is consulted.
 */
const PROBE_PATH = "/api/v3.1/toolkits?limit=1";

export type ComposioKeyProbeResult =
  | { ok: true }
  /** Composio answered and refused the key. Actionable by the operator: the key is wrong. */
  | { ok: false; reason: "rejected" }
  /** Composio could not be reached or did not answer usefully. NOT the operator's fault. */
  | { ok: false; reason: "unreachable" };

export interface ComposioKeyProbeDeps {
  /** Injected by tests and by the e2e fake. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Composio's API origin. Defaults to Composio's own. */
  baseUrl?: string;
}

/**
 * Asks Composio whether a candidate key is usable.
 *
 * Distinguishes "Composio rejected this key" from "Composio could not be reached", because the two
 * demand different things of the operator and collapsing them would tell someone behind a flaky
 * network that their key is wrong. `401`/`403` are the former; a transport failure, timeout, or
 * `5xx` is the latter. Any other non-2xx is treated as unreachable rather than rejected — an
 * unexpected status is not evidence about the key.
 *
 * Never throws, and never returns Composio's response body or error text: the caller renders this
 * to an admin, and upstream error strings from an authenticated endpoint are exactly the kind of
 * thing that leaks request detail into a UI.
 *
 * @complexity O(1) — one bounded outbound request, response body discarded.
 * @overallScore 100
 */
export async function probeComposioApiKey(
  deps: ComposioKeyProbeDeps,
  input: { apiKey: string }
): Promise<ComposioKeyProbeResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const baseUrl = (deps.baseUrl ?? DEFAULT_COMPOSIO_BASE_URL).replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${PROBE_PATH}`, {
      method: "GET",
      headers: { accept: "application/json", "x-api-key": input.apiKey },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "rejected" };
  return { ok: false, reason: "unreachable" };
}
