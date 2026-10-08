/**
 * @file `content-analyzer` — the bundled Tier-2 sample plugin: SEO / readability analysis on save
 * (AW-7 Tier 2; ADR-024 §3/§4).
 *
 * Purpose:
 * Scores every post/page on `content.entry.beforeSave` (title length, meta description length,
 * image alt text, heading order, body H1s, content length, subheadings; Flesch readability, reading
 * time, table of contents) and stores the result in six `ext.content-analyzer.*` fields the admin
 * editor card and the agent read back.
 *
 * Why tier-2: its code is pure computation with no fs/network need, so it is the first plugin that
 * runs ONLY through the plugin ABI over a worker/RPC boundary — the server process never imports
 * `./plugin.ts`; `importModule` below refuses, and the Tier-2 host loads `entryPath` in a worker
 * instead. Why built-in: `routes/plugins/install.ts` refuses any sideloaded manifest that is not
 * tier-3, so a tier-2 plugin can only ship compiled in (disabled until the owner enables it). Like
 * word-count it still passes through the same `validateManifest()`/`loadPlugin()` path a
 * site-installed plugin does (one validator, two surfaces) — integrity is `{}` because compiled-in
 * code is definitionally not tampered (ADR Decision item 4).
 *
 * Architectural role:
 * Manifest + runtime source only. The pure scorer (`./analyze-content.ts`), its TipTap adapter
 * (`./tiptap-blocks.ts`), the summary writer (`./summary.ts`) and the worker entry (`./plugin.ts`)
 * hold all logic.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuiltInPluginSource } from "@jini-ai/plugins/host/node";
import type { PluginManifest } from "@jini-ai/plugins/host";

/** The built-in's in-code manifest-equivalent (ADR Decision item 4). Field descriptions become the
 * agent's `search_tools` text, so each names the words an owner would actually ask with. */
export const CONTENT_ANALYZER_MANIFEST: PluginManifest = {
  id: "content-analyzer",
  name: "Content Analyzer",
  version: "1.0.0",
  sdkRange: "^0.1.0 || ^0.2.0",
  engine: 1,
  tier: "tier-2", // ADR-024 §3/§4: sandboxed code, run only over the worker/RPC plugin ABI.
  capabilities: ["content.read", "content.extend", "hooks.attach"],
  hooks: ["content.entry.beforeSave"],
  fields: [
    {
      path: "ext.content-analyzer.score",
      type: "integer",
      queryable: false,
      description:
        "Analyze this post's SEO: overall content score 0-100 from title length, meta description length, image alt text, heading order, a single H1, word count and subheadings — recomputed every time the post is saved while this plugin is enabled.",
    },
    {
      path: "ext.content-analyzer.wordCount",
      type: "integer",
      queryable: false,
      description: "Word count of the post's body text (headings excluded), measured by the SEO content analyzer on every save.",
    },
    {
      path: "ext.content-analyzer.readingTimeMinutes",
      type: "integer",
      queryable: false,
      description: "Estimated reading time in minutes (word count / 200, rounded up) for this post, from the SEO content analyzer.",
    },
    {
      path: "ext.content-analyzer.readability",
      type: "number",
      queryable: false,
      description:
        "Readability of this post: Flesch reading ease 0-100 (higher is easier to read), from the SEO content analyzer.",
    },
    {
      path: "ext.content-analyzer.summary",
      type: "string",
      queryable: false,
      description:
        "Plain-English SEO and readability summary of this post — score, word count, reading time, readability, and what to fix (title, meta description, headings, alt text) — use it to analyze this page for the owner.",
    },
    {
      path: "ext.content-analyzer.report",
      type: "string",
      queryable: false,
      description:
        "Full content analysis report as JSON: every SEO check with its numbers, readability grade, reading time, and a table of contents of the post's headings with anchors.",
    },
  ],
  integrity: {}, // built-in — no packaged files to hash (ADR Decision item 4).
};

export const CONTENT_ANALYZER_BUILT_IN: BuiltInPluginSource = { manifest: CONTENT_ANALYZER_MANIFEST };

const SOURCE_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(SOURCE_FILE);

/** Load metadata consumed by the server composition root. `entryPath` is the worker entry module
 * next to this file — `plugin.ts` under `tsx`, `plugin.js` in the compiled `dist/` twin — taken from
 * this module's own extension so both layouts resolve without a build-mode flag. */
export const CONTENT_ANALYZER_RUNTIME_SOURCE = {
  manifest: CONTENT_ANALYZER_MANIFEST,
  source: "built-in" as const,
  entryPath: path.join(SOURCE_DIR, `plugin${path.extname(SOURCE_FILE)}`),
  // Tier-2 code runs only inside the Tier-2 host's worker; the host injects its own seam that
  // loads `entryPath` there. Reaching this default means something tried to import it in-process.
  importModule: (): Promise<never> => Promise.reject(new Error("tier-2 plugin code never runs in the server process")),
  // Shown read-only by the admin Plugins screen's package-files viewer: this folder under `tsx`,
  // its compiled `dist/` twin in a production build.
  sourceDir: SOURCE_DIR,
};
