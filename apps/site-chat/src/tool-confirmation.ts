/** Visitor confirmation is a live transport directive, never a transcript/history event. */
export interface ToolConfirmation {
  readonly kind: 'tool_confirmation'; readonly challengeId: string; readonly title: string; readonly summary: string;
}

/** Keep field bounds explicit without folding four decisions into the directive parser. */
function boundedText({ value, max }: { value: unknown; max: number }, _options = {}): boolean {
  return typeof value === 'string' && value.length <= max;
}

/** Narrow only the server directive channel. Model text and tool output never call this parser. */
export function parseToolConfirmation({ value }: { value: unknown }, _options = {}): ToolConfirmation | null {
  if (!value || typeof value !== 'object') return null;
  const directive = value as Record<string, unknown>;
  if (directive.kind !== 'tool_confirmation') return null;
  if (typeof directive.challengeId !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(directive.challengeId)) return null;
  if (!boundedText({ value: directive.title, max: 200 })) return null;
  if (!boundedText({ value: directive.summary, max: 240 })) return null;
  return directive as unknown as ToolConfirmation;
}

/** Only UI click handlers call this relative, same-origin route. No automatic retry of approvals.
 * Failure leaves the held execution to refuse/expire. @complexity One bounded HTTP request.
 */
export async function confirmSiteAssistantTool({ challengeId, allow }: { challengeId: string; allow: boolean }, { fetch: send = globalThis.fetch }: { fetch?: typeof fetch } = {}): Promise<boolean> {
  try {
    const response = await send('/api/site-assistant/confirm', { method: 'POST', mode: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, allow }), signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch { return false; }
}
