/** Tovu's site-policy management owner. Page and assistant use the same permission, merge and CAS. */
import { ForbiddenError, type SetValueRequired } from "@jini-ai/core/settings";
import { parseVisitorToolPolicy, resolveVisitorToolChoice, VisitorToolPolicyValidationError, VISITOR_TOOLS_PERMISSION, VISITOR_TOOL_CALLS_PER_TURN, VISITOR_TOOL_DEFAULT_LIMITS, type VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";
import type { PreparedVisitorToolsChange, VisitorToolDescriptor, VisitorToolsManagementPort, VisitorToolsView } from "../../contracts/site-assistant/visitor-tools-management.js";
import { parseVisitorToolsConfigure, visitorToolsNeedsApproval } from "./visitor-tools-configure.js";
import { readVisitorToolsSnapshot, VisitorToolsRevisionConflictError, writeVisitorTools } from "./visitor-tools-write.js";

export interface VisitorToolsServiceDeps {
  readonly workspaceId: string;
  readonly settings: SetValueRequired["deps"];
  readonly ready: Promise<void>;
  /** Only the visitor eligibility owner supplies this; never pass the admin registry/catalog. */
  readonly listCatalog: (required: Record<string, never>, optional?: Record<string, never>) => Promise<readonly VisitorToolDescriptor[]>;
}

/** Reject oversized/ambiguous source catalogs before policy merging. @complexity O(t), t ≤ 128. */
async function readCatalog({ deps }: { deps: VisitorToolsServiceDeps }, _options = {}) {
  const catalog = await deps.listCatalog({});
  if (catalog.length > 128) throw new Error("Visitor catalog exceeds its supported bound.");
  const ids = new Set<string>();
  for (const tool of catalog) {
    if (tool.id === "site" || !/^[a-z][a-z0-9_]{0,127}$/.test(tool.id) || ids.has(tool.id)) throw new Error("Invalid visitor catalog identity.");
    ids.add(tool.id);
  }
  return structuredClone(catalog);
}

/** Keep removed configured entries visible, but unavailable; stored settings cannot grant eligibility.
 * @complexity O(t + c) for bounded policy and source catalog; no per-tool I/O.
 */
function view({ policy, revisionSeq, catalog }: { policy: VisitorToolPolicy | null; revisionSeq: number; catalog: readonly VisitorToolDescriptor[] }, _options = {}): VisitorToolsView {
  const ids = new Set(catalog.map(tool => tool.id));
  const missing: VisitorToolDescriptor[] = Object.keys(policy?.tools ?? {}).filter(id => !ids.has(id)).map(id => ({
    id, source: "unavailable", sourceRevision: "unavailable", title: id, description: "Configured tool is not currently declared visitor-eligible.",
    effect: "write", availability: { available: false, reason: "Source is unavailable or has no reviewed visitor declaration." },
  }));
  return { revisionSeq, defaults: VISITOR_TOOL_DEFAULT_LIMITS, callsPerTurn: VISITOR_TOOL_CALLS_PER_TURN,
    ...(policy === null ? { policyState: "invalid" as const } : {}),
    tools: [...catalog, ...missing].map(tool => ({ ...tool, ...(policy === null
      ? { mode: "off" as const, limits: VISITOR_TOOL_DEFAULT_LIMITS }
      : resolveVisitorToolChoice({ policy, toolId: tool.id })) })) };
}

/** Fresh auth gates both reads and writes, including a revocation while a card is open. */
async function authorize({ deps, callerPrincipalId }: { deps: VisitorToolsServiceDeps; callerPrincipalId: string }, _options = {}) {
  await deps.ready;
  const result = await deps.settings.authorize({ principalId: callerPrincipalId, workspaceId: deps.workspaceId, permission: VISITOR_TOOLS_PERMISSION, entityType: "visitor-tools" });
  if (!result.allowed) throw new ForbiddenError("visitor-tools.manage is required.");
}

/** Invalid storage has one explicit repair: discard it and save Off, through the normal CAS ledger.
 * MOVE: Never restore upgrade defaults or trust partially parsed/future policies during recovery.
 * The settings ledger records the actor and complete repaired policy; no out-of-band DB surgery.
 * @complexity O(c) for at most 128 catalog tools, including an empty catalog.
 */
function prepareRepair({ snapshot, catalog, input }: {
  snapshot: Awaited<ReturnType<typeof readVisitorToolsSnapshot>>; catalog: readonly VisitorToolDescriptor[]; input: ReturnType<typeof parseVisitorToolsConfigure>;
}, _options = {}): PreparedVisitorToolsChange {
  if (input.toolId !== "site" || input.mode !== "off" || input.limits !== undefined) {
    throw new VisitorToolPolicyValidationError("Stored visitor-tools policy is unreadable; turn all tools Off to reset it.");
  }
  const changes = view({ ...snapshot, catalog }).tools.map(tool => ({
    tool, previous: { mode: tool.mode, limits: tool.limits }, next: { mode: "off" as const, limits: VISITOR_TOOL_DEFAULT_LIMITS },
  }));
  return { revisionSeq: snapshot.revisionSeq, catalog, changes, requiresApproval: false,
    policy: parseVisitorToolPolicy({ value: { version: 1, tools: Object.fromEntries(changes.map(change => [change.tool.id, change.next])) } }) };
}

/** Reclaim unavailable Off entries only when the bounded policy would otherwise overflow.
 * Active unavailable entries stay visible; refusal names them so the owner can turn them Off.
 * @complexity O(t + c), at most 256 merged entries, no per-tool I/O.
 */
function mergedPolicy({ policy, changes, catalog }: {
  policy: VisitorToolPolicy; changes: PreparedVisitorToolsChange["changes"]; catalog: readonly VisitorToolDescriptor[];
}, _options = {}): VisitorToolPolicy {
  let entries = Object.entries({ ...policy.tools, ...Object.fromEntries(changes.map(change => [change.tool.id, change.next])) });
  if (entries.length > 128) {
    const ids = new Set(catalog.map(tool => tool.id));
    entries = entries.filter(([id, choice]) => ids.has(id) || choice.mode !== "off");
    if (entries.length > 128) {
      const unavailable = entries.filter(([id]) => !ids.has(id)).map(([id]) => id);
      throw new VisitorToolPolicyValidationError(`Too many visitor tools. Turn unavailable entries Off first: ${unavailable.join(", ")}.`);
    }
  }
  return parseVisitorToolPolicy({ value: { version: 1, tools: Object.fromEntries(entries) } });
}

/** Merge one target or all current eligible tools; unavailable entries can only be switched Off.
 * @complexity O(t) bounded tools, no I/O. No partial policy writes on invalid batches.
 */
function prepareChanges({ snapshot, catalog, input }: {
  snapshot: Awaited<ReturnType<typeof readVisitorToolsSnapshot>>; catalog: readonly VisitorToolDescriptor[]; input: ReturnType<typeof parseVisitorToolsConfigure>;
}, _options = {}): PreparedVisitorToolsChange {
  if (snapshot.policy === null) return prepareRepair({ snapshot, catalog, input });
  const current = view({ ...snapshot, catalog });
  const targets = current.tools.filter(tool => input.toolId === "site" ? tool.availability.available : tool.id === input.toolId);
  if (!targets.length) throw new VisitorToolPolicyValidationError("Tool is unavailable. List visitor tools and choose a current id.");
  const changes = targets.map(tool => {
    if (!tool.availability.available && input.mode !== "off") throw new VisitorToolPolicyValidationError("An unavailable tool can only be switched Off.");
    const previous = { mode: tool.mode, limits: tool.limits };
    return { tool, previous, next: { mode: input.mode ?? previous.mode, limits: { ...previous.limits, ...input.limits } } };
  });
  return { revisionSeq: snapshot.revisionSeq, catalog, changes,
    policy: mergedPolicy({ policy: snapshot.policy, changes, catalog }),
    requiresApproval: changes.some(change => visitorToolsNeedsApproval(change)) };
}

/** Create one management service over the existing settings owner; no transport or plugin lifecycle.
 * @throws ForbiddenError, VisitorToolPolicyValidationError, VisitorToolsRevisionConflictError; storage failures propagate.
 * @complexity O(t + c) per operation (both ≤ 128), one settings snapshot and one transaction on apply.
 * @example createVisitorToolsManagement({ deps: {workspaceId, settings, ready, listCatalog} });
 */
export function createVisitorToolsManagement({ deps }: { deps: VisitorToolsServiceDeps }, _options = {}): VisitorToolsManagementPort {
  return {
    async list({ callerPrincipalId }, _optional = {}) {
      await authorize({ deps, callerPrincipalId });
      const snapshot = await readVisitorToolsSnapshot({ repo: deps.settings.repo, workspaceId: deps.workspaceId });
      return view({ ...snapshot, catalog: await readCatalog({ deps }) });
    },
    async prepare({ callerPrincipalId, input: raw }, _optional = {}) {
      await authorize({ deps, callerPrincipalId });
      const input = parseVisitorToolsConfigure({ value: raw });
      const snapshot = await readVisitorToolsSnapshot({ repo: deps.settings.repo, workspaceId: deps.workspaceId });
      if (snapshot.revisionSeq !== input.expectedRevisionSeq) throw new VisitorToolsRevisionConflictError("Visitor tools changed. List them again before retrying.");
      return prepareChanges({ snapshot, input, catalog: await readCatalog({ deps }) });
    },
    async apply({ callerPrincipalId, prepared }, _optional = {}) {
      await authorize({ deps, callerPrincipalId });
      const catalog = await readCatalog({ deps });
      if (JSON.stringify(catalog) !== JSON.stringify(prepared.catalog)) throw new VisitorToolsRevisionConflictError("Visitor tool sources changed. List them again and review the new targets.");
      const saved = await writeVisitorTools({ deps: deps.settings, workspaceId: deps.workspaceId, callerPrincipalId, value: prepared.policy }, { expectedRevisionSeq: prepared.revisionSeq });
      return view({ policy: parseVisitorToolPolicy({ value: saved.value }), revisionSeq: saved.revisionSeq, catalog });
    },
  };
}
