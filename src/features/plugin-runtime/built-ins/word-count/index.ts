/**
 * @file `word-count` — the bundled dogfood plugin (SPEC-005 REQ-09; RT-005 pinned tokenization;
 * AC-01/AC-16).
 *
 * Purpose:
 * Proves the artifact → load → capability → hook → `ext` → gateway loop end to end. Ships
 * **built into the runtime** (ADR Decision item 4) — an in-code manifest-equivalent object, no
 * `.tovu-plugin` tarball, no packaged-file integrity hash (compiled-in code is definitionally not
 * tampered) — but still passes through the exact same `validateManifest()`/`loadPlugin()` path a
 * site-installed plugin does (one validator, two surfaces).
 *
 * REQ-09's pinned tokenization algorithm (RT-005, confirmed applied per the ADR's Planning
 * Preflight Evidence): concatenate all `text`-node string values in `bodyJson` (depth-first) with
 * single spaces, trim, split on `/\s+/`, count non-empty tokens.
 *
 * Architectural role:
 * TDD-certified stub (implementation outline, built-ins/word-count). `countWords`'s body
 * intentionally throws until the Programmer stage implements it against
 * `__tests__/unit/word-count.unit.test.ts`. Do not implement ahead of that suite being reviewed —
 * this file exists so the test suite compiles and fails red, not green.
 */
import type { BuiltInPluginSource } from "../../discovery";
import type { PluginManifest } from "../../manifest";

/** The built-in's in-code manifest-equivalent (ADR Decision item 4). */
export const WORD_COUNT_MANIFEST: PluginManifest = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  sdkRange: "^1.0.0",
  engine: 1,
  tier: "tier-3", // v1's in-process ESM loader is exactly ADR-024's Tier-3 (feature.spec.md REQ-01 revision note).
  capabilities: ["content.read", "content.extend", "hooks.attach"],
  hooks: ["content.entry.beforeSave"],
  fields: [{ path: "ext.word-count.count", type: "integer", queryable: false }],
  integrity: {}, // built-in — no packaged files to hash (ADR Decision item 4).
};

export const WORD_COUNT_BUILT_IN: BuiltInPluginSource = { manifest: WORD_COUNT_MANIFEST };

/**
 * REQ-09's pinned algorithm: walk `bodyJson` depth-first collecting every `text`-node string
 * value (TipTap-shaped document tree: `{ type, text?, content?: [...] }`), join with single
 * spaces, trim, split on `/\s+/`, count non-empty tokens. Pure — no I/O.
 *
 * @param bodyJson - The entry's TipTap-shaped document (`ContentEntryDraft.bodyJson`).
 * @returns The non-empty whitespace-delimited token count of every text node's concatenated value.
 * @complexity O(n) over the document's total node count.
 */
export function countWords(_bodyJson: unknown): number {
  throw new Error(
    "countWords: not implemented — TDD-certified stub (SPEC-005 REQ-09, RT-005). " +
      "See src/features/plugin-runtime/built-ins/word-count/__tests__/unit/word-count.unit.test.ts for the certified contract."
  );
}
