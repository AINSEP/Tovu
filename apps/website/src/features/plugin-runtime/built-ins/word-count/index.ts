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
 * Implemented (tasks.md T019) against the certified suite in
 * `__tests__/unit/word-count.unit.test.ts`, which pins the tokenization algorithm exactly.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuiltInPluginSource } from "../../discovery.js";
import type { PluginManifest } from "../../manifest.js";
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

/** The built-in's in-code manifest-equivalent (ADR Decision item 4). */
export const WORD_COUNT_MANIFEST: PluginManifest = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  sdkRange: "^0.1.0",
  engine: 1,
  tier: "tier-3", // v1's in-process ESM loader is exactly ADR-024's Tier-3 (feature.spec.md REQ-01 revision note).
  capabilities: ["content.read", "content.extend", "hooks.attach"],
  hooks: ["content.entry.beforeSave"],
  fields: [
    {
      path: "ext.word-count.count",
      type: "integer",
      queryable: false,
      description:
        "This post's word count and estimated reading time — computed and stored automatically every time the post is saved while this plugin is enabled.",
    },
  ],
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
export function countWords(bodyJson: unknown): number {
  const texts: string[] = [];

  // Depth-first walk. Every node's own `text` is collected before its `content` children are
  // visited, so the collected order is document order. Non-object nodes, nodes without `text`,
  // and nodes without `content` are all simply skipped — never an error (RT-005: an image node
  // contributes nothing rather than throwing).
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;

    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const { text, content } = node as { text?: unknown; content?: unknown };
    if (typeof text === "string") texts.push(text);
    if (Array.isArray(content)) {
      for (const child of content) visit(child);
    }
  };

  visit(bodyJson);

  // RT-005's literal wording: join EVERY collected text-node value with single spaces (not only
  // the ones separated by a block boundary), trim, split on `/\s+/`, count non-empty tokens.
  const joined = texts.join(" ").trim();
  if (joined === "") return 0;
  return joined.split(/\s+/).filter((token) => token !== "").length;
}

/** The executable half of the bundled artifact. Registration occurs only inside `setup()` so the
 * end-to-end enable test proves `loadPlugin()` reached BR-01 step (4), not merely that the module
 * happened to be statically imported by the server bundle. */
export const WORD_COUNT_PLUGIN = definePlugin({
  setup(sdk) {
    sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async (entry) => ({ count: countWords(entry.bodyJson) }));
  },
});

/** Load metadata consumed by the server composition root. The built-in has no on-disk artifact,
 * so its dynamic-import seam returns the already-bundled module namespace after the loader's
 * integrity/sdkRange gates have run. */
export const WORD_COUNT_RUNTIME_SOURCE = {
  manifest: WORD_COUNT_MANIFEST,
  source: "built-in" as const,
  entryPath: "built-in:word-count",
  importModule: async () => ({ default: WORD_COUNT_PLUGIN }),
  // Shown read-only by the admin Plugins screen's package-files viewer: this folder under `tsx`,
  // its compiled `dist/` twin in a production build.
  sourceDir: path.dirname(fileURLToPath(import.meta.url)),
};
