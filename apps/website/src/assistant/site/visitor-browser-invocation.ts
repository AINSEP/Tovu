/**
 * P6-T3.T: puts one registry-delivered page action on the visitor's AG-UI `/chat` segment as a
 * standard tool call, so the page that asked is the page that acts.
 *
 * The model can request an effect but cannot deliver one: only the frontend-session registry mints
 * an invocation, after the reviewed page policy, and only a registry invocation reaches this
 * projection. Delivery alone is not permission either — the page must still `begin` the invocation
 * against its live binding before it acts, and its result is refused until it has.
 */
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';

/** The one AG-UI tool name a visitor page action travels under. Not a model tool name. */
export const VISITOR_PAGE_ACTION_TOOL_NAME = 'tovu.page_action';

/** The reviewed page capabilities; anything else the registry could carry is not a page action. */
const REVIEWED_PAGE_CAPABILITIES: ReadonlySet<string> = new Set(PAGE_CAPABILITIES.map(capability => capability.id));

/** The segment writer's one tool-call method: TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END. */
export interface VisitorBrowserToolCallWriter {
  toolCall(required: { toolCallId: string; toolCallName: string; args: string }, optional?: Record<string, never>): void;
}

/** The bounded projection the page driver already receives on the session stream, and nothing more (the delta adds only the begin correlator `runId`). */
interface VisitorBrowserAction { readonly invocationId: string; readonly capabilityId: string; readonly input: Record<string, unknown> }

function readRegistryInvocation({ invocation }: { invocation: unknown }): VisitorBrowserAction | null {
  if (!invocation || typeof invocation !== 'object') return null;
  const { invocationId, capabilityId, input } = invocation as Record<string, unknown>;
  if (typeof invocationId !== 'string' || invocationId.length === 0) return null;
  if (typeof capabilityId !== 'string' || !REVIEWED_PAGE_CAPABILITIES.has(capabilityId)) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return { invocationId, capabilityId, input: input as Record<string, unknown> };
}

/**
 * Writes one reviewed registry invocation as a browser tool call and answers whether it did. The
 * tool call id IS the registry invocation id: model tool ids correlate transcripts and are not
 * capabilities, so a provider `tool_use` (or anything not shaped as a registry invocation of a
 * reviewed page capability) is refused here rather than mirrored. Fields beyond the bounded
 * projection (provider calls, raw results, credentials) are dropped by construction.
 */
export function projectVisitorBrowserInvocation(
  { runId, invocation, writer }: { runId: string; invocation: unknown; writer: VisitorBrowserToolCallWriter },
  _optional = {},
): boolean {
  if (runId.length === 0) return false;
  const action = readRegistryInvocation({ invocation });
  if (!action) return false;
  // `runId` is the internal logical run the registry binding is keyed by. It is a correlator for
  // `begin`, not authority: begin is still owner- and bind-token-gated against the live binding.
  writer.toolCall({ toolCallId: action.invocationId, toolCallName: VISITOR_PAGE_ACTION_TOOL_NAME, args: JSON.stringify({ runId, ...action }) });
  return true;
}
