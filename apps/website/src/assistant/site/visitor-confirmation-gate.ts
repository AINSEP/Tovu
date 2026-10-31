import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';
/** Policy/input binding for the visitor delegate; Jini remains the execution lifecycle owner. */
import { canonicalArgumentDigest } from "@jini-ai/core/records";
import { stripControlSequences } from "@jini-ai/core/text";
import type { ExecutionDelegate, ToolConfirmationRequest, ToolExecutor } from "@jini-ai/daemon";
import { resolveVisitorToolChoice } from "../../contracts/site-assistant/visitor-tools.js";
import type { VisitorExecutionPorts } from "./visitor-execution-ports.js";

/** A cancelled/revised held plan is refused without reporting an operational handler error. */
export class VisitorPlanRefused extends Error {
  constructor() { super("I can't help with that request here."); }
}

const CONFIRMATION_COPY: Readonly<Record<string, { title: string; summary: string; field?: string }>> = {
  search_published_entries: { title: "Allow search?", summary: "Search published entries", field: "query" },
  get_published_entry: { title: "Allow reading an entry?", summary: "Read a published entry", field: "slug" },
  list_categories: { title: "Allow listing categories?", summary: "List published categories." },
  'page.fill': { title: 'Allow filling this field?', summary: 'Fill the reviewed field on this page.' },
  'page.select_option': { title: 'Allow changing this selection?', summary: 'Change the reviewed selection on this page.' },
  'page.click': { title: 'Allow this action?', summary: 'Activate the reviewed control on this page.' },
  'page.navigate': { title: 'Allow navigation?', summary: 'Open a published public page.' },
  'page.scroll_to': { title: 'Allow scrolling?', summary: 'Scroll to public content.' },
  'page.highlight': { title: 'Allow highlighting?', summary: 'Highlight public content.' },
  site_guide: { title: "Allow reading the site guide?", summary: "Read the public site guide", field: "topic" },
};

/** Project only a declared string field into CMS-owned copy, never serialize the model's input.
 * Jini owns control stripping; this surface additionally removes bidi controls and links.
 * @complexity O(n) time/space in one input field; fields are capped at 120 and summaries at 240.
 */
function confirmationCopy({ request }: { request: ToolConfirmationRequest }, _options = {}) {
  const copy = CONFIRMATION_COPY[request.tool.id] ?? { title: "Allow this action?", summary: "Perform this site's reviewed action." };
  const input = request.input as Record<string, unknown> | null;
  const value = copy.field && input?.[copy.field];
  if (typeof value !== "string") return { title: copy.title, summary: copy.summary };
  const field = stripControlSequences({ text: value })
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/https?:\/\/\S+/gi, "[link]").slice(0, 120)
    .replace(/\b[\w-]+\.[a-z]{2,}\S*/gi, "[link]").slice(0, 120);
  return { title: copy.title, summary: `${copy.summary}: "${field}"`.slice(0, 240) };
}

/** Only Ask registrations enter this delegate. Each approval binds one immutable execution.
 * Re-read both after the click and immediately before the handler; changed-and-restored settings
 * still differ by value-row seq. IDs and argument digests never become model-facing results.
 * No values are retained in the challenge binding or audit. Input is detached before execution.
 * @complexity O(1) per execution plus bounded policy reads and input hashing; four calls per turn.
 */
export function createVisitorConfirmationGate({ ports, resume }: { ports: VisitorExecutionPorts; resume: ToolExecutor["resumeConfirmation"] }, _options = {}) {
  const approved = new Map<string, (required: { input: unknown }) => Promise<boolean>>();

  /** Disconnect already cancels Jini's pending confirmation. Never try to resurrect it.
   * Other cancellation paths may also settle it first; report a failed resume without rejecting.
   */
  function resumeSafely({ executionId, allow }: { executionId: string; allow: boolean }, _optional = {}): void {
    if (ports.signal?.aborted) return;
    try { resume({ executionId, decision: allow ? "confirm" : "deny" }); }
    catch (error) { ports.reportError(error); }
  }

  async function confirm({ request }: { request: ToolConfirmationRequest }, _optional = {}): Promise<void> {
    let allow = false;
    try {
      // MOVE: Ask needs an actual value-row revision. A value hash cannot detect changed-and-restored
      // policy; authorization refuses legacy/headless ports without this owner snapshot.
      const captured = await ports.readSnapshot!();
      if (!captured.policy || !ports.confirmation) return;
      const mode = resolveVisitorToolChoice({ policy: captured.policy, toolId: request.tool.id }).mode;
      const forced = ports.requiresConfirmation?.({ toolId: request.tool.id, input: request.input }) === true;
      if (mode === 'off' || (mode !== 'ask' && !forced)) return;
      // An object envelope keeps omitted arguments JSON-serializable without changing handler input.
      const inputDigest = await canonicalArgumentDigest({ args: { input: request.input } });
      const validate = async ({ input }: { input: unknown }, _optional = {}) => {
        const live = await ports.readSnapshot!();
        const publicationValid = !ports.publicationRevision || Boolean(readVisitorPagePublication({ revision: ports.publicationRevision, workspaceId: ports.workspaceId }));
        return !ports.signal?.aborted && publicationValid && live.policy !== null && live.revision === captured.revision && await canonicalArgumentDigest({ args: { input } }) === inputDigest;
      };
      allow = await ports.confirmation.request({
        binding: { runId: ports.runId, executionId: request.executionId, ip: ports.ip, owner: ports.owner },
        ...confirmationCopy({ request }),
        emit: ports.confirmation.emit, validate: () => validate({ input: request.input }), signal: ports.signal,
      });
      if (allow) approved.set(request.executionId, validate);
    } catch (error) { ports.reportError(error); }
    finally {
      resumeSafely({ executionId: request.executionId, allow });
    }
  }

  const delegate: ExecutionDelegate = { onConfirm(request) {
    // Bare void is Jini's documented resumable seam. The async policy read ensures the executor
    // parks before even a synchronous test/browser click can call resumeConfirmation.
    void confirm({ request });
  } };
  return { delegate,
    async assertApproved({ executionId, input }: { executionId: string; input: unknown }, _optional = {}) {
      const validate = approved.get(executionId);
      approved.delete(executionId);
      let valid = false;
      try { valid = Boolean(validate) && await validate!({ input }); }
      catch (error) { ports.reportError(error); }
      if (!valid || ports.signal?.aborted) throw new VisitorPlanRefused();
    },
    forget({ executionId }: { executionId: string }, _optional = {}) { approved.delete(executionId); },
  };
}
