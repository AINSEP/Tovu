import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';
/** Visitor policy, publication check and copy for Jini's bound confirmation gate. */
import { stripControlSequences } from "@jini-ai/core/text";
import type { ToolConfirmationRequest, ToolExecutor } from "@jini-ai/daemon";
import { createBoundConfirmationGate } from "@jini-ai/daemon/surface-exchanges";
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

type VisitorSnapshot = Awaited<ReturnType<NonNullable<VisitorExecutionPorts["readSnapshot"]>>>;

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

/** Only Ask registrations (or forced confirmations) prompt; everything else resumes denied.
 * Authorization refuses legacy/headless ports without the owner's value-row snapshot. */
function decideVisitorConfirmation(
  { ports, request, snapshot }: { ports: VisitorExecutionPorts; request: ToolConfirmationRequest; snapshot: VisitorSnapshot },
  _options = {},
): "ask" | "deny" {
  if (!snapshot.policy || !ports.confirmation) return "deny";
  const mode = resolveVisitorToolChoice({ policy: snapshot.policy, toolId: request.tool.id }).mode;
  const forced = ports.requiresConfirmation?.({ toolId: request.tool.id, input: request.input }) === true;
  return mode === 'off' || (mode !== 'ask' && !forced) ? "deny" : "ask";
}

/** The bound gate lives in `@jini-ai/daemon/surface-exchanges` (`createBoundConfirmationGate`). Tovu binds
 * the visitor policy, the value-row revision (a value hash cannot detect changed-and-restored settings),
 * the page publication check, the IP/owner binding and the copy. Four calls per turn.
 */
export function createVisitorConfirmationGate({ ports, resume }: { ports: VisitorExecutionPorts; resume: ToolExecutor["resumeConfirmation"] }, _options = {}) {
  const gate = createBoundConfirmationGate<VisitorSnapshot>({ resume, crypto: globalThis.crypto, ports: {
    readSnapshot: () => ports.readSnapshot!(),
    decide: ({ request, snapshot }) => decideVisitorConfirmation({ ports, request, snapshot }),
    isCurrent: ({ captured, live }) => {
      const publicationValid = !ports.publicationRevision || Boolean(readVisitorPagePublication({ revision: ports.publicationRevision, workspaceId: ports.workspaceId }));
      return publicationValid && live.policy !== null && live.revision === captured.revision;
    },
    requestApproval: ({ request, validate }) => ports.confirmation!.request({
      binding: { runId: ports.runId, executionId: request.executionId, ip: ports.ip, owner: ports.owner },
      ...confirmationCopy({ request }),
      emit: ports.confirmation!.emit, validate, signal: ports.signal,
    }),
    reportError: ({ error }) => ports.reportError({ error }),
    signal: ports.signal,
  } });
  return { delegate: gate.delegate,
    async assertApproved({ executionId, input }: { executionId: string; input: unknown }, _optional = {}) {
      if (!await gate.isApproved({ executionId, input })) throw new VisitorPlanRefused();
    },
    forget({ executionId }: { executionId: string }, _optional = {}) { gate.forget({ executionId }); },
  };
}
