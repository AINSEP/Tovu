/** The only Tovu management writer for visitor-tool policy, shared by page and chat. */
import type { JsonValue } from "@jini-ai/core/primitives";
import { resolveDefinitionRaw, type SetValueRequired, type SettingsRepoPort } from "@jini-ai/core/settings";
import { parseVisitorToolPolicy, VisitorToolPolicyValidationError, VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING, type VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";
import { set } from "./site-title-write.js";

/** A stale page/chat snapshot; refetch rather than replaying a publication approval. */
export class VisitorToolsRevisionConflictError extends Error {}

/** Read storage without interpreting the policy so invalid/future values remain repairable.
 * @throws Error when boot has not registered the policy. @complexity O(1) ledger reads.
 */
async function readStoredVisitorTools({ repo, workspaceId }: {
  repo: SettingsRepoPort; workspaceId: string;
}, _options = {}) {
  const definition = await resolveDefinitionRaw({ repo }, { ...VISITOR_TOOLS_SETTING, workspaceId });
  if (!definition) throw new Error("Visitor-tools policy definition is unavailable.");
  const row = await repo.getWorkspaceValue({ workspaceId, settingId: definition.settingId });
  return { value: row?.state === "set" ? row.valueJson : definition.defaultValue, revisionSeq: row?.seq ?? 0 };
}

/** Compare the value row's revision without parsing; unset is zero, cleared retains its seq.
 * Storage/definition failures propagate. @complexity O(1) reads.
 * @example readVisitorToolsRevision({ repo, workspaceId });
 */
export async function readVisitorToolsRevision(required: { repo: SettingsRepoPort; workspaceId: string }, _options = {}): Promise<number> {
  return (await readStoredVisitorTools(required)).revisionSeq;
}

/** A null policy is unreadable server state, never the permissive upgrade defaults.
 * Only policy validation degrades to null; storage/definition failures propagate.
 * @complexity O(t) parsing for t ≤ 128 tools; one storage snapshot.
 * @example readVisitorToolsSnapshot({ repo, workspaceId });
 */
export async function readVisitorToolsSnapshot(required: { repo: SettingsRepoPort; workspaceId: string }, _options = {}): Promise<{ policy: VisitorToolPolicy | null; revisionSeq: number }> {
  const { value, revisionSeq } = await readStoredVisitorTools(required);
  try { return { policy: parseVisitorToolPolicy({ value }), revisionSeq }; }
  catch (error) {
    if (!(error instanceof VisitorToolPolicyValidationError)) throw error;
    return { policy: null, revisionSeq };
  }
}

/** Normalize only the memory adapter's overlapping-transaction refusal to the CAS reload contract.
 * MOVE: Until J1 publishes typed adapter conflicts, a losing memory page/chat write must be 409.
 * Storage failures retain their original type/message. @complexity One existing transaction.
 */
async function revisionTransaction<T>({ repo, run }: { repo: SettingsRepoPort; run: () => Promise<T> }, _options = {}): Promise<T> {
  try { return await repo.transaction(run); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("InMemorySettingsRepo.transaction is not reentrant,")) {
      throw new VisitorToolsRevisionConflictError("Visitor tools changed. List them again before retrying.");
    }
    throw error;
  }
}

/** J1 SWAP POINT: replace this adapter with published settings set(required, {expectedRevisionSeq}).
 * MOVE: Like form-delivery/comments, compare at saveWorkspaceValue AFTER appendRevision takes the
 * ledger lock, inside set's transaction. Comparing before the lock loses concurrent Postgres edits.
 * A conflict rolls back both value and revision. Other repo methods retain their original receiver.
 * F7: J1 must compare the VALUE ROW seq (unset = 0; cleared retains seq), never the ledger maximum
 * or a per-setting counter. Keep post-lock/rollback tests; the two-connection Postgres race belongs
 * in J1's adapter suite. Remove the temporary memory conflict normalization when J1 owns it.
 * F8: Unknown route faults retain the sibling put-settings 500 contract; a future shared reporter
 * should report them there without leaking storage details or treating them as invalid policies.
 * F9: Future visitor-source adapters must assign source themselves. Never trust a plugin-supplied
 * "builtin" classification: builtin reads bypass the publication card. Catalog comparison binds it.
 * @complexity One additional snapshot read; no parallel persistence owner.
 * @example guardVisitorToolsRevision({repo, workspaceId, expectedRevisionSeq});
 */
export function guardVisitorToolsRevision({ repo, workspaceId, expectedRevisionSeq }: {
  repo: SettingsRepoPort; workspaceId: string; expectedRevisionSeq: number;
}, _options = {}): SettingsRepoPort {
  return new Proxy(repo, { get(target, key) {
    if (key === "transaction") return (run: () => Promise<unknown>) => revisionTransaction({ repo: target, run });
    if (key === "saveWorkspaceValue") return async (record: Parameters<SettingsRepoPort["saveWorkspaceValue"]>[0]) => {
      const revisionSeq = await readVisitorToolsRevision({ repo: target, workspaceId });
      if (revisionSeq !== expectedRevisionSeq) throw new VisitorToolsRevisionConflictError("Visitor tools changed. List them again before retrying.");
      await target.saveWorkspaceValue(record);
    };
    const member: unknown = Reflect.get(target, key, target);
    return typeof member === "function" ? member.bind(target) : member;
  } });
}

/** Validate, then write with the dedicated permission and optional transaction-locked revision check.
 * @throws VisitorToolsRevisionConflictError for a stale revision; settings authorization errors propagate.
 * @complexity O(t) validation (t ≤ 128), plus one existing settings transaction.
 * @example writeVisitorTools({ deps, workspaceId, callerPrincipalId, value });
 */
export async function writeVisitorTools(required: {
  deps: SetValueRequired["deps"]; workspaceId: string; callerPrincipalId: string; value: unknown;
}, optional: { expectedRevisionSeq?: number } = {}): Promise<{ value: JsonValue; revisionSeq: number }> {
  const policy = parseVisitorToolPolicy({ value: required.value });
  const deps = optional.expectedRevisionSeq === undefined ? required.deps : { ...required.deps,
    repo: guardVisitorToolsRevision({ repo: required.deps.repo, workspaceId: required.workspaceId, expectedRevisionSeq: optional.expectedRevisionSeq }),
  };
  return set({ deps, input: {
    ...VISITOR_TOOLS_SETTING, scope: "workspace", workspaceId: required.workspaceId,
    authWorkspaceId: required.workspaceId, callerPrincipalId: required.callerPrincipalId,
    requiredPermissionOverride: VISITOR_TOOLS_PERMISSION, value: policy as unknown as JsonValue,
  } });
}
