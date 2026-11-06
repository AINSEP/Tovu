import type { FrontendSessionBridge } from "@jini-ai/chat/react";

/** Dock-open pre-warm and first send share the authenticated API demand path.
 * Refusals throw the server's public reason so chat can show the cause and recovery action.
 */
export async function activateAssistantDaemon(
  { signal }: { signal?: AbortSignal } = {}, { request = fetch }: { request?: typeof fetch } = {},
): Promise<void> {
  const deadline = AbortSignal.timeout(35_000);
  const response = await request("/api/frontend-sessions/activate", {
    method: "POST", credentials: "same-origin", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  }).catch((error: unknown) => {
    signal?.throwIfAborted();
    const detail = error instanceof Error ? error.name : 'request failed';
    throw new Error(`The assistant could not reach its page service. Retry your message; if it keeps failing, restart the site. Details: POST /api/frontend-sessions/activate; ${detail}`);
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: unknown; code?: unknown; detail?: unknown } | undefined;
    throw new Error(activationRefusalMessage({ status: response.status, body }));
  }
}

/** Format only the server's public refusal fields; empty/malformed payloads retain HTTP recovery guidance. */
function activationRefusalMessage({ status, body }: { status: number; body: { error?: unknown; code?: unknown; detail?: unknown } | undefined }): string {
  const reason = typeof body?.error === "string" && body.error.trim() ? body.error
    : `The assistant service returned HTTP ${status}. Restart the site or the app.`;
  const details = [body?.code, body?.detail].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return details.length ? `${reason}\nDetails: HTTP ${status}; ${details.join('; ')}` : reason;
}

/** Wake through the authenticated API, then ensure a current page attachment.
 * @returns The current token, or undefined on surfaces with no page bridge.
 * @param options.onActivationSettled - Optional notification on activation success or failure,
 * before waiting for page attachment, so host startup feedback ends at the activation boundary.
 * @throws On activation failure, cancellation or a bridge that does not attach within 5s after ready.
 * @complexity O(1), one activation and one bounded attachment wait.
 */
export async function prepareAssistantPageBinding(
  { bridge, signal }: { bridge?: Pick<FrontendSessionBridge, "rebind" | "bindToken"> | null; signal?: AbortSignal },
  { activate = activateAssistantDaemon, onActivationSettled }: {
    activate?: typeof activateAssistantDaemon;
    onActivationSettled?: () => void;
  } = {},
): Promise<string | undefined> {
  try { await activate({ signal }, {}); }
  finally { onActivationSettled?.(); }
  signal?.throwIfAborted();
  if (!bridge) return undefined;
  const deadline = AbortSignal.timeout(5_000);
  const waitSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  waitSignal.throwIfAborted();
  await bridge.rebind({ signal: waitSignal }, {}).catch(() => {
    signal?.throwIfAborted();
    throw new Error('The assistant could not attach to this page. Reload this admin page, then retry your message. Details: page attachment did not finish after service activation.');
  });
  signal?.throwIfAborted();
  const token = bridge.bindToken();
  if (!token) throw new Error("The assistant page is not attached. Reload this admin page, then retry your message. Details: no page binding token after attachment.");
  return token;
}
