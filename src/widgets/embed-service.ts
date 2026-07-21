/**
 * @file Server-side, versioned document-mutation command for `widgetEmbed` nodes (SPEC-043
 * REQ-44/45, ADR-047 Debate Fold-In Amendment 6).
 *
 * Purpose:
 * The second entry point into the SAME document-mutation contract the live TipTap editor's own
 * Save path uses — both ultimately write through `features/entries/write-service.ts`'s
 * `updateEntry` chokepoint, the same `expectedVersion` OCC guard, and the same revision machinery.
 * Usable with no browser editor session open (an AI agent, or a server-side script). Enforces
 * REQ-19/20's guardrails (no widget-in-widget recursion, per-document embed-count clamp) via
 * `embed-validation.ts`'s `validateWidgetEmbedMutation` — the ONE validator both this path and the
 * live editor's own chokepoint-side hook must call, so the two paths can never silently diverge
 * (INV-04).
 *
 * Closes a real, previously-disclosed gap this file's own domain depends on: `updateEntry` had no
 * parameter to change `bodyJson` after creation (only `createEntry` did) — fixed additively in
 * `features/entries/write-service.ts` as part of this same dispatch (see that file's `bodyJson`
 * doc comment) rather than worked around here.
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-007), landing in this later routes/UI/AI-tools
 * dispatch rather than the earlier domain-layer session, since it composes `updateEntry`'s new
 * `bodyJson` capability which did not exist yet at that time.
 */
import type { ClockPort, JsonValue, UUID } from "../core/ports";
import type { EntryRefsRepoPort } from "../core/entry-refs/ports";
import { extractEntryRefs } from "../core/entry-refs/extractor";
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { VersionConflictError } from "../features/entries/errors";
import type { EntryRecord } from "../features/entries/types";
import { updateEntry } from "../features/entries/write-service";
import type { EntryRepoPort, OutboxPort } from "../features/entries/write-service";
import { PRE_AUTHORIZED, requireWidgetPermission, type WidgetsAuthorizeFn } from "./authorize-helper";
import { withEntryLock } from "./concurrency";
import { validateWidgetEmbedMutation } from "./embed-validation";
import {
  WidgetEmbedGuardrailError,
  WidgetInstanceNotFoundError,
  WidgetVersionConflictError,
} from "./errors";
import type { WidgetEmbedNode } from "./types";

/** Matches the certified `embed-validation.unit.test.ts` suite's own value — no separate policy
 * config surface exists yet for this (OQ-level detail, same disclosure posture as OQ-01's resolver
 * timeout). */
const DEFAULT_MAX_EMBEDS_PER_DOCUMENT = 50;

export interface EmbedServiceDeps {
  entryRepo: EntryRepoPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  clock: ClockPort;
  ids: { newId: () => string };
  authorize: WidgetsAuthorizeFn;
  outbox: OutboxPort;
  /** REQ-20 — policy-bounded, not hardcoded; defaults to `DEFAULT_MAX_EMBEDS_PER_DOCUMENT`. */
  maxEmbedsPerDocument?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a TipTap-shaped `bodyJson` tree collecting every `widgetEmbed` node, in document order. */
function collectEmbeds(node: unknown, out: WidgetEmbedNode[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectEmbeds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (
    node.type === "widgetEmbed" &&
    isPlainObject(node.attrs) &&
    typeof node.attrs.placementId === "string" &&
    typeof node.attrs.widgetEntryId === "string"
  ) {
    out.push({ type: "widgetEmbed", placementId: node.attrs.placementId, widgetEntryId: node.attrs.widgetEntryId });
  }
  if (Array.isArray(node.content)) collectEmbeds(node.content, out);
}

function widgetEmbedNode(placementId: UUID, widgetEntryId: UUID): JsonValue {
  return { type: "widgetEmbed", attrs: { placementId, widgetEntryId } };
}

/** Appends one new `widgetEmbed` node to the end of the document's top-level `content` array — the
 * simplest well-defined "insert" position for a server-side/no-editor caller (an arbitrary cursor
 * position is a live-editor-only concept; REQ-44 requires the mutation exist, not that it target an
 * arbitrary offset). Falls back to a fresh empty doc if `bodyJson` isn't already a TipTap-shaped
 * doc node (e.g. a still-empty entry). */
function appendEmbed(bodyJson: unknown, placementId: UUID, widgetEntryId: UUID): JsonValue {
  const doc = isPlainObject(bodyJson) && bodyJson.type === "doc" ? bodyJson : { type: "doc", content: [] };
  const content = Array.isArray(doc.content) ? doc.content : [];
  return { ...doc, content: [...content, widgetEmbedNode(placementId, widgetEntryId)] };
}

/** Removes every `widgetEmbed` node matching `placementId`, at any depth, preserving every other
 * node's position — mirrors the tree-shape-preserving discipline `reorderEmbeds` below also uses. */
function removeEmbedByPlacementId(node: unknown, placementId: UUID): unknown {
  if (Array.isArray(node)) {
    return node
      .filter((child) => !(isPlainObject(child) && child.type === "widgetEmbed" && isPlainObject(child.attrs) && child.attrs.placementId === placementId))
      .map((child) => removeEmbedByPlacementId(child, placementId));
  }
  if (!isPlainObject(node)) return node;
  if (!Array.isArray(node.content)) return node;
  return { ...node, content: removeEmbedByPlacementId(node.content, placementId) };
}

/** Reassigns which widget occupies which EXISTING embed slot, in document order, per
 * `orderedWidgetEntryIds` — the document's shape (surrounding paragraphs/headings, slot count and
 * position) is unchanged; only each slot's `widgetEntryId` is swapped. `placementId`s move with
 * their new `widgetEntryId` (a fresh placement identity per REQ-44's "reorder" being a distinct
 * operation from "insert") so `entry_refs` re-extraction after the write reflects the new mapping
 * cleanly rather than aliasing stale target ids to a slot that no longer represents them. */
function reorderEmbedSlots(node: unknown, cursor: { index: number }, newIds: () => UUID, orderedWidgetEntryIds: readonly UUID[]): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => reorderEmbedSlots(child, cursor, newIds, orderedWidgetEntryIds));
  }
  if (!isPlainObject(node)) return node;
  if (node.type === "widgetEmbed" && isPlainObject(node.attrs)) {
    const widgetEntryId = orderedWidgetEntryIds[cursor.index];
    cursor.index += 1;
    return widgetEmbedNode(newIds(), widgetEntryId);
  }
  if (Array.isArray(node.content)) return { ...node, content: reorderEmbedSlots(node.content, cursor, newIds, orderedWidgetEntryIds) };
  return node;
}

async function extractAndStoreEmbedRefs(deps: EmbedServiceDeps, workspaceId: string, entry: EntryRecord): Promise<void> {
  const refs = extractEntryRefs({
    workspaceId,
    sourceEntryId: entry.id,
    sourceEntryType: entry.type,
    bodyJson: entry.bodyJson,
    fieldsExt: {},
  });
  await deps.entryRefsRepo.replaceForSource({ workspaceId, sourceEntryId: entry.id, refs });
}

async function loadHostEntry(deps: EmbedServiceDeps, workspaceId: UUID, hostEntryId: UUID): Promise<EntryRecord> {
  const entry = await deps.entryRepo.findById({ workspaceId, id: hostEntryId });
  if (!entry) throw new WidgetInstanceNotFoundError(`host entry '${hostEntryId}' was not found`);
  return entry;
}

/** REQ-19/20: validates the resulting embed set BEFORE writing — the same guardrail the live
 * editor's own chokepoint-side hook must call (INV-04), never bypassable from this path. */
function assertGuardrails(deps: EmbedServiceDeps, hostEntryType: string, resultingBodyJson: unknown): void {
  const resultingEmbeds: WidgetEmbedNode[] = [];
  collectEmbeds(resultingBodyJson, resultingEmbeds);
  const result = validateWidgetEmbedMutation({
    hostEntryType,
    resultingEmbeds,
    maxEmbedsPerDocument: deps.maxEmbedsPerDocument ?? DEFAULT_MAX_EMBEDS_PER_DOCUMENT,
  });
  if (!result.valid) {
    throw new WidgetEmbedGuardrailError(
      `widgetEmbed mutation on host entry rejected: ${result.reason} (REQ-19/20)`,
      result.reason
    );
  }
}

async function writeHostBody(
  deps: EmbedServiceDeps,
  workspaceId: UUID,
  actor: { principalId: UUID },
  current: EntryRecord,
  baseVersion: number,
  nextBodyJson: unknown
): Promise<EntryRecord> {
  const result = await updateEntry({
    deps: {
      entryRepo: deps.entryRepo,
      contentTypeRepo: deps.contentTypeRepo,
      clock: deps.clock,
      authorize: PRE_AUTHORIZED,
      outbox: deps.outbox,
      onWritten: (entry) => extractAndStoreEmbedRefs(deps, workspaceId, entry),
    },
    input: {
      actorId: actor.principalId,
      workspaceId,
      id: current.id,
      bodyJson: nextBodyJson,
      expectedVersion: baseVersion,
    },
  });
  if (!result.ok) {
    if (result.error instanceof VersionConflictError) {
      const latest = await deps.entryRepo.findById({ workspaceId, id: current.id });
      throw new WidgetVersionConflictError(result.error.message, latest?.version ?? current.version);
    }
    throw result.error;
  }
  return result.value.entry;
}

export interface InsertWidgetEmbedInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly hostEntryId: UUID;
  readonly baseVersion: number;
  readonly widgetEntryId: UUID;
}

export interface InsertWidgetEmbedRequired {
  deps: EmbedServiceDeps;
  input: InsertWidgetEmbedInput;
}

/** REQ-44/45: inserts a new `widgetEmbed` node referencing `widgetEntryId`, appended to the host
 * entry's body — one atomic, version-guarded write through the same chokepoint the live editor's
 * Save uses. Returns the newly-minted `placementId` so the caller (an agent tool, or the
 * server-side embed-mutation routes) can address this exact placement afterward. */
export async function insertWidgetEmbed(required: InsertWidgetEmbedRequired): Promise<{ entry: EntryRecord; placementId: UUID }> {
  const { deps, input } = required;
  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.place");

  return withEntryLock(`${input.workspaceId}::${input.hostEntryId}`, async () => {
    const current = await loadHostEntry(deps, input.workspaceId, input.hostEntryId);
    const placementId = deps.ids.newId();
    const nextBodyJson = appendEmbed(current.bodyJson, placementId, input.widgetEntryId);
    assertGuardrails(deps, current.type, nextBodyJson);
    const entry = await writeHostBody(deps, input.workspaceId, input.actor, current, input.baseVersion, nextBodyJson);
    return { entry, placementId };
  });
}

export interface RemoveWidgetEmbedInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly hostEntryId: UUID;
  readonly baseVersion: number;
  readonly placementId: UUID;
}

export interface RemoveWidgetEmbedRequired {
  deps: EmbedServiceDeps;
  input: RemoveWidgetEmbedInput;
}

/** REQ-44/45: removes the `widgetEmbed` node matching `placementId` from the host entry's body —
 * the placement itself is removed (the widget instance it referenced is untouched). */
export async function removeWidgetEmbed(required: RemoveWidgetEmbedRequired): Promise<{ entry: EntryRecord }> {
  const { deps, input } = required;
  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.place");

  return withEntryLock(`${input.workspaceId}::${input.hostEntryId}`, async () => {
    const current = await loadHostEntry(deps, input.workspaceId, input.hostEntryId);
    const nextBodyJson = removeEmbedByPlacementId(current.bodyJson, input.placementId);
    assertGuardrails(deps, current.type, nextBodyJson);
    const entry = await writeHostBody(deps, input.workspaceId, input.actor, current, input.baseVersion, nextBodyJson);
    return { entry };
  });
}

export interface ReorderWidgetEmbedsInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly hostEntryId: UUID;
  readonly baseVersion: number;
  /** The new widget-entry order, one id per EXISTING embed slot in the host's body, in document
   * order — must be the same length as the number of `widgetEmbed` nodes currently present. */
  readonly orderedWidgetEntryIds: readonly UUID[];
}

export interface ReorderWidgetEmbedsRequired {
  deps: EmbedServiceDeps;
  input: ReorderWidgetEmbedsInput;
}

export class WidgetEmbedReorderCountMismatchError extends Error {
  constructor(
    message: string,
    public readonly expectedCount: number,
    public readonly actualCount: number
  ) {
    super(message);
    this.name = "WidgetEmbedReorderCountMismatchError";
  }
}

/** REQ-44/45: reassigns which widget occupies which existing embed slot, in document order — the
 * document's own shape (slot count/position, surrounding content) is unchanged. Rejects a count
 * mismatch before writing anything (the caller must supply exactly one id per existing slot). */
export async function reorderWidgetEmbeds(required: ReorderWidgetEmbedsRequired): Promise<{ entry: EntryRecord }> {
  const { deps, input } = required;
  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.place");

  return withEntryLock(`${input.workspaceId}::${input.hostEntryId}`, async () => {
    const current = await loadHostEntry(deps, input.workspaceId, input.hostEntryId);

    const existing: WidgetEmbedNode[] = [];
    collectEmbeds(current.bodyJson, existing);
    if (existing.length !== input.orderedWidgetEntryIds.length) {
      throw new WidgetEmbedReorderCountMismatchError(
        `reorder must supply exactly one widgetEntryId per existing embed slot (${existing.length} present, ${input.orderedWidgetEntryIds.length} supplied)`,
        existing.length,
        input.orderedWidgetEntryIds.length
      );
    }

    const cursor = { index: 0 };
    const nextBodyJson = reorderEmbedSlots(current.bodyJson, cursor, () => deps.ids.newId(), input.orderedWidgetEntryIds);
    assertGuardrails(deps, current.type, nextBodyJson);
    const entry = await writeHostBody(deps, input.workspaceId, input.actor, current, input.baseVersion, nextBodyJson);
    return { entry };
  });
}
