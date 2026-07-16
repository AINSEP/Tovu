import { ForbiddenError } from "../../core/commands/command";
import { validateHierarchyAssignment } from "./validation-chain";

/**
 * @file SPEC-018 C-201-C-206 — the taxonomy write-service's ordinary (non-gated) mutations
 * (ADR-044).
 *
 * Purpose:
 * The single write chokepoint for `taxonomies`/`terms`/`entry_terms` (ADR-022 discipline, applied
 * to this domain): `authorize()` first (REQ-17, fail-closed) -> validate -> write + revision +
 * watermark + outbox, all attributed to the same mutation. `assignTerms` is the one deliberate
 * exception (INV-05): term-assignment membership is explicitly narrowed out of ADR-022 §4a's
 * general revisioning rule (ADR-044 "entry_terms revisioning" fold) — high-churn relational
 * state whose historical audit trail is judged low-value, the same disclosed-loss basis
 * `redirect_hits`/`asset_renditions` already use.
 *
 * `mergeTerm` (SPEC-018 C-207, ADR-044's one gated mutation) is deliberately NOT here — it lives
 * in the sibling `merge-term.ts`, isolated because it alone touches `core/gated-mutations`.
 *
 * Known scope gap (disclosed, not a silent omission): `assignTerms` does not itself invoke
 * `validation-chain.ts`'s `validateContentJoin` (the allow-list/workspace/lens chain) — that
 * chain requires resolving the target content row's own workspace/kind, which needs a content
 * repo port this slice's certified test suite (`write-service.unit.test.ts`) never supplies or
 * exercises through `assignTerms` itself (`validateContentJoin`'s own branches are certified
 * directly, as a pure function, in `validation-chain.unit.test.ts`). Wiring the full chain into
 * `assignTerms` is deferred to whichever future session builds the real content-repo-backed route
 * layer this domain's `posts`/`entries` soft-reference ultimately resolves against.
 *
 * How it relates to the project:
 * Mirrors `src/features/settings/write-service.ts`'s chokepoint shape (authorize -> validate ->
 * same-tx write + revision) and the required-input-object convention `src/features/post/post.ts`
 * establishes.
 */

/** Local, structurally-compatible authorize gate — no `workspaceId` is threaded through this
 * slice's certified write-service tests (every function signature they exercise omits it), so
 * this type intentionally does not require one, unlike `core/commands/command.ts`'s `AuthorizeFn`.
 * A future route/wiring layer that has real workspace context can still satisfy this shape. */
export type AuthorizeFn = (params: {
  principalId: string;
  permission: string;
}) => Promise<{ allowed: boolean; reason: string }>;

export interface Taxonomy {
  id: string;
  name: string;
  hierarchical: boolean;
  status: string;
  updatedAt: string;
  version: number;
}

export interface Term {
  id: string;
  taxonomyId: string;
  parentId: string | null;
  name: string;
  status: string;
  updatedAt: string;
  version: number;
}

export interface TaxonomyRepoPort {
  findById(id: string): Promise<{ id: string; hierarchical: boolean; allowList?: string[] } | null>;
  insert(row: Taxonomy): Promise<unknown>;
}

export interface TermRepoPort {
  findById(id: string): Promise<{ id: string; taxonomyId: string; name?: string } | null>;
  insert(row: Term): Promise<unknown>;
  update(row: Term): Promise<unknown>;
}

export interface EntryTermRepoPort {
  upsert(row: { contentType: string; contentId: string; termId: string; addedAt: string }): Promise<unknown>;
}

export interface TaxonomyRevisionRow {
  taxonomyId: string;
  op: "create" | "rename" | "reparent" | "deprecate";
  previousState: Record<string, unknown> | null;
  actorId: string;
  recordedAt: string;
}

export interface TaxonomyRevisionRepoPort {
  insert(row: TaxonomyRevisionRow): Promise<unknown>;
}

export interface ClockPort {
  nowIso(): string;
}

export interface IdGeneratorPort {
  newId(): string;
}

export interface WriteServiceDeps {
  authorize: AuthorizeFn;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  taxonomies: TaxonomyRepoPort;
  terms: TermRepoPort;
  entryTerms: EntryTermRepoPort;
  revisions: TaxonomyRevisionRepoPort;
  /** `core/gated-mutations.stampWatermark`-shaped, injected — same-transaction stamp per mutation. */
  stampWatermark: (tx?: unknown) => void;
  outbox: { enqueue: (event: unknown) => Promise<void> };
}

export class TaxonomyRecordNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxonomyRecordNotFoundError";
  }
}

export class TermRecordNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TermRecordNotFoundError";
  }
}

/** ADR-044 permissions section: `admin.taxonomy.manage` (ADR-021 flat-string convention). REQ-17
 * — must run before any other side effect of every write-service export in this file. */
async function authorizeTaxonomyManage(deps: WriteServiceDeps, principalId: string): Promise<void> {
  const result = await deps.authorize({ principalId, permission: "admin.taxonomy.manage" });
  if (!result.allowed) {
    throw new ForbiddenError(
      `principal '${principalId}' is not authorized for 'admin.taxonomy.manage' (${result.reason})`,
      "admin.taxonomy.manage",
      result.reason
    );
  }
}

export interface CreateTaxonomyRequired {
  deps: WriteServiceDeps;
  principalId: string;
  name: string;
  hierarchical: boolean;
}

/** AC-01/AC-26: creates a taxonomy row (hierarchical=true -> "category"-shaped, false ->
 * "tag"-shaped — same shared table per ADR-044 §1). Ordinary mutation, no plan()/confirmation
 * ceremony. */
export async function createTaxonomy(
  required: CreateTaxonomyRequired,
  _optional: Record<string, never> = {}
): Promise<Taxonomy> {
  const { deps, principalId, name, hierarchical } = required;
  await authorizeTaxonomyManage(deps, principalId);

  const now = deps.clock.nowIso();
  const taxonomy: Taxonomy = {
    id: deps.idGen.newId(),
    name,
    hierarchical,
    status: "active",
    updatedAt: now,
    version: 1,
  };

  await deps.taxonomies.insert(taxonomy);
  await deps.revisions.insert({
    taxonomyId: taxonomy.id,
    op: "create",
    previousState: null,
    actorId: principalId,
    recordedAt: now,
  });
  deps.stampWatermark();
  await deps.outbox.enqueue({ name: "taxonomy.created", taxonomyId: taxonomy.id, actorId: principalId, occurredAt: now });

  return taxonomy;
}

export interface CreateTermRequired {
  deps: WriteServiceDeps;
  principalId: string;
  taxonomyId: string;
  name: string;
  parentId?: string | null;
}

/** AC-03/AC-13/EC-04 — validates `parentId` via `validateHierarchyAssignment` before writing. A
 * freshly-created term has no descendants yet, so it structurally cannot be a cycle source; the
 * cycle check is therefore always a no-op (`() => false`) here, unlike a reparent of an existing
 * term (not yet built — no certified test in this slice exercises it). */
export async function createTerm(
  required: CreateTermRequired,
  _optional: Record<string, never> = {}
): Promise<Term> {
  const { deps, principalId, taxonomyId, name, parentId } = required;
  await authorizeTaxonomyManage(deps, principalId);

  const taxonomy = await deps.taxonomies.findById(taxonomyId);
  if (!taxonomy) {
    throw new TaxonomyRecordNotFoundError(`taxonomy '${taxonomyId}' was not found`);
  }

  const candidateParentId = parentId ?? null;
  let resolvedParent: { id: string; taxonomyId: string } | null | "not-applicable" = "not-applicable";
  if (candidateParentId !== null) {
    const parentTerm = await deps.terms.findById(candidateParentId);
    resolvedParent = parentTerm ? { id: parentTerm.id, taxonomyId: parentTerm.taxonomyId } : null;
  }

  validateHierarchyAssignment({
    childTaxonomyId: taxonomyId,
    taxonomyIsHierarchical: taxonomy.hierarchical,
    candidateParentId,
    resolvedParent,
    wouldCreateCycle: () => false,
    termId: "__new__",
  });

  const now = deps.clock.nowIso();
  const term: Term = {
    id: deps.idGen.newId(),
    taxonomyId,
    parentId: candidateParentId,
    name,
    status: "active",
    updatedAt: now,
    version: 1,
  };

  await deps.terms.insert(term);
  await deps.revisions.insert({ taxonomyId, op: "create", previousState: null, actorId: principalId, recordedAt: now });
  deps.stampWatermark();
  await deps.outbox.enqueue({ name: "taxonomy.term_created", termId: term.id, actorId: principalId, occurredAt: now });

  return term;
}

export interface RenameTermRequired {
  deps: WriteServiceDeps;
  principalId: string;
  termId: string;
  newName: string;
}

/** AC-15/AC-19/AC-25/REQ-12/REQ-17 — same-tx rename + revision (carrying the pre-rename state) +
 * watermark + outbox. `authorize()` runs before the term lookup, so a denied caller produces zero
 * side effects of any kind. */
export async function renameTerm(
  required: RenameTermRequired,
  _optional: Record<string, never> = {}
): Promise<Term> {
  const { deps, principalId, termId, newName } = required;
  await authorizeTaxonomyManage(deps, principalId);

  const current = await deps.terms.findById(termId);
  if (!current) {
    throw new TermRecordNotFoundError(`term '${termId}' was not found`);
  }

  const now = deps.clock.nowIso();
  const updated: Term = {
    id: current.id,
    taxonomyId: current.taxonomyId,
    parentId: (current as { parentId?: string | null }).parentId ?? null,
    name: newName,
    status: (current as { status?: string }).status ?? "active",
    updatedAt: now,
    version: ((current as { version?: number }).version ?? 1) + 1,
  };

  await deps.terms.update(updated);
  await deps.revisions.insert({
    taxonomyId: current.taxonomyId,
    op: "rename",
    previousState: { name: current.name },
    actorId: principalId,
    recordedAt: now,
  });
  deps.stampWatermark();
  await deps.outbox.enqueue({ name: "taxonomy.term_renamed", termId, actorId: principalId, occurredAt: now });

  return updated;
}

export interface AssignTermsRequired {
  deps: WriteServiceDeps;
  principalId: string;
  contentType: string;
  contentId: string;
  termIds: string[];
}

/** AC-17/AC-20/INV-05/REQ-13/REQ-14 — upserts every `entry_terms` row (idempotent on-conflict per
 * `entry_terms_unique`, EC-09), then stamps the watermark and enqueues the outbox event exactly
 * ONCE per call regardless of `termIds.length` — never once per term. Never produces a
 * `taxonomy_revisions` row (see this file's header for the disclosed narrowing this implements). */
export async function assignTerms(
  required: AssignTermsRequired,
  _optional: Record<string, never> = {}
): Promise<void> {
  const { deps, principalId, contentType, contentId, termIds } = required;
  await authorizeTaxonomyManage(deps, principalId);

  const now = deps.clock.nowIso();
  for (const termId of termIds) {
    await deps.entryTerms.upsert({ contentType, contentId, termId, addedAt: now });
  }

  deps.stampWatermark();
  await deps.outbox.enqueue({
    name: "taxonomy.terms_assigned",
    contentType,
    contentId,
    termIds,
    actorId: principalId,
    occurredAt: now,
  });
}

export interface EntryTermsCleanupPort {
  deleteByContent(params: { workspaceId: string; contentType: string; contentId: string }): Promise<number>;
}

export interface OnContentDeletedRequired {
  event: { workspaceId: string; contentType: string; contentId: string };
  entryTerms: EntryTermsCleanupPort;
}

/** SPEC-018 C-206/W-203/REQ-18/REQ-19/INV-07 — content-deletion event subscriber. Best-effort
 * (a missed event leaves an orphaned `entry_terms` row that is inert on read, per ADR-044's
 * Failure modes; a periodic/boot reconciliation sweep — modeled by re-invoking this same
 * function for the orphan — is the backstop, never a hard failure). A no-op for content with no
 * assigned terms, never an error. */
export async function onContentDeleted(
  required: OnContentDeletedRequired,
  _optional: Record<string, never> = {}
): Promise<void> {
  const { event, entryTerms } = required;
  await entryTerms.deleteByContent({
    workspaceId: event.workspaceId,
    contentType: event.contentType,
    contentId: event.contentId,
  });
}
