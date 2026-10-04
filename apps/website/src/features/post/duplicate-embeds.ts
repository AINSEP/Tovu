import type { JsonObject } from "@jini-ai/core/primitives";

/**
 * @file `content_post_duplicate`'s widgetEmbed handling — see `tool-registrations.ts`'s own
 * `content_post_duplicate` handler doc, and `ADS-memory/reports/2026-09-07-page-tool-gap.md` §2, for
 * the full design rationale this file implements.
 *
 * A page's `bodyJson` can carry `widgetEmbed` nodes. `agent-tools.ts`'s own published
 * `TIPTAP_DOC_SCHEMA` documents a `widgetEmbed` node's `attrs` as carrying only `placementId` — but
 * the REAL node this codebase's write path (`widgets/embed-service.ts`'s `collectEmbeds`/
 * `widgetEmbedNode`) actually reads and writes carries BOTH `placementId` AND `widgetEntryId` in
 * `attrs` (confirmed by reading that file directly: `collectEmbeds` requires
 * `typeof node.attrs.widgetEntryId === "string"` to even recognize the node as an embed). That
 * published schema is model-facing documentation, not a runtime validator (`agent-tools.ts`'s own
 * header), so this mismatch is a pre-existing, separate discrepancy — noted here rather than fixed,
 * since `content_post_duplicate` never authors a `bodyJson` from scratch; it only ever copies one
 * this codebase already wrote.
 *
 * `placementId` is a per-document embed-SLOT identifier: it exists only so
 * `widgets_remove_embed`/`widgets_reorder_embeds` can address "this occurrence" within one host
 * document, and every real lookup combines it with that document's own entry id
 * (`embed-service.ts`'s `loadHostEntry` + `removeEmbedByPlacementId` — there is no placement table
 * keyed by `placementId` alone). `widgetEntryId` is the actual live reference to a reusable widget
 * INSTANCE, and referencing the same instance from multiple host documents at once is the intended,
 * supported shape of a widget — `widgets_get_instance`'s own "where-used" disclosure names multiple
 * simultaneous references as the normal case (the same footer widget embedded on every page).
 *
 * A byte-for-byte `bodyJson` copy therefore carries the source page's `placementId` values verbatim
 * onto the new row. Today's addressing (`hostEntryId` + `placementId` together) means that alone
 * cannot corrupt the source page's own document — but nothing in this codebase documents
 * `placementId` as scoped rather than globally unique, and a future caller assuming global
 * uniqueness is a reasonable mistake this duplicate should not manufacture two live examples of.
 * {@link copyBodyJsonWithFreshEmbedPlacements} removes the ambiguity at the one place it is free to
 * remove: every copied embed gets a FRESH `placementId` (minted the same way
 * `insertWidgetEmbed`/`reorderEmbedSlots` already mint one for every other embed mutation), while
 * `widgetEntryId` is carried over unchanged — reusing the same widget instance across the original
 * and the copy is the intended, documented behavior of a widget, not the trap this function exists
 * to close.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(root: unknown, newPlacementId: () => string): unknown {
  // An explicit stack, not recursion: a duplicated page's nesting depth is caller/import-controlled
  // and a 5000-deep body overflowed the call stack here (same class as f646ba397's GET-path
  // walkers). Each frame carries where its copied value goes; children are pushed in reverse so
  // the walk stays pre-order and `newPlacementId` is called in document order, exactly as the
  // recursive version did.
  let result: unknown;
  const stack: Array<{ node: unknown; place: (value: unknown) => void }> = [{ node: root, place: (value) => { result = value; } }];
  while (stack.length > 0) {
    const { node, place } = stack.pop()!;
    if (Array.isArray(node)) {
      const copy: unknown[] = new Array(node.length);
      place(copy);
      for (let i = node.length - 1; i >= 0; i--) stack.push({ node: node[i], place: (value) => { copy[i] = value; } });
      continue;
    }
    if (!isPlainObject(node)) {
      place(node);
      continue;
    }

    const source = node.type === "widgetEmbed" && isPlainObject(node.attrs) && typeof node.attrs.placementId === "string"
      ? { ...node, attrs: { ...node.attrs, placementId: newPlacementId() } }
      : node;
    const copy: Record<string, unknown> = {};
    place(copy);
    // Clone every field, including leaf text nodes, marks and nested attrs; walking only content
    // would leave the copy sharing mutable objects with its source.
    const entries = Object.entries(source);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i]!;
      stack.push({ node: value, place: (cloned) => { copy[key] = cloned; } });
    }
  }
  return result;
}

/**
 * Deep-clones a TipTap `bodyJson` document, minting a fresh `placementId` on every `widgetEmbed`
 * node it contains (see this file's header for why). Every other node, attribute, and mark is
 * copied unchanged — including a `widgetEmbed` node's `widgetEntryId`, which is deliberately carried
 * over rather than regenerated.
 *
 * A document with no `widgetEmbed` nodes at all (the common case) round-trips as a plain structural
 * clone with no minted ids spent.
 *
 * @complexity O(n) in the size of `bodyJson` — one iterative walk, no repeated work, no backtracking.
 */
export function copyBodyJsonWithFreshEmbedPlacements(bodyJson: JsonObject, newPlacementId: () => string): JsonObject {
  return walk(bodyJson, newPlacementId) as JsonObject;
}
