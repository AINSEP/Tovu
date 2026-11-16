id: MV-html-1   (template T-MOVE; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: move-html.gen.md)
feature: website/platform/html (only `style-values.ts` is in the backlog row; `escape.ts` and `slug.ts` in the same folder are NOT part of this sheet and stay)
kind_check: MOVE confirmed: pure allowlist/regex, 0 imports, no React/Express/env/console, no ports.
target_choice: `@jini-ai/cms`, NEW subpath `./html/style-values` (universal). Not `@jini-ai/core/text` (where the escapers live): that needs owner decision D2 ("pure helpers may go in core"), still open; the CLASSIFY row targets cms with no D2 flag. If the owner later confirms D2, moving the file from cms to core/text is a separate follow-up, not this sheet.
untangle_overlap: YES -> EXECUTE AFTER WAVE B MERGE. C8.repoint.tsv:146 edits another import line of `server/inbound/public-http/http/site/render.ts` (`@jini-ai/cms/forms` -> `@jini-ai/core/contracts/forms`); render.ts is guarded by TEXT. No row on style-values.ts, its test or packages/cms/package.json.
blocked: no
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

precondition: -
tovu_files:
  - apps/website/src/platform/html/style-values.ts | blob 0855e4431bd8dc96a664bdbdb6431530e988abb7 | delete
tovu_tests:
  - apps/website/src/platform/html/__tests__/style-values.test.ts | blob e2ed5e7004dd52302b33ced6fd9d52fa65107223 | move-to-jini
jini_target: cms ./html/style-values packages/cms/src/html/style-values.ts
jini_guards:
  - packages/cms/src/html/style-values.ts must not exist
  - packages/cms/src/html/__tests__/style-values.test.ts must not exist
  - packages/cms/package.json blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b
  - rg -n "safeTextAlign|safeAspectRatio" packages/cms/src -> prints nothing
symbol_map:
  - safeTextAlign -> @jini-ai/cms/html/style-values safeTextAlign (shape unchanged: already ({ value }, _optional = {}))
  - safeAspectRatio -> @jini-ai/cms/html/style-values safeAspectRatio (shape unchanged)
values_injected: - (no Tovu value in the bodies)
leaf_import_rewrites: - (the file imports nothing)
header_rewrite: |
  Replace the whole first `/** @file … */` block (Tovu lines 1-12) with:
  /**
   * @file Allowlists for the few author-supplied strings a renderer interpolates directly into a
   * `style="…"` attribute rather than into ordinary HTML text/attribute content. HTML escaping stops
   * an attribute breakout; it does not stop a value that stays inside the quotes from adding a
   * second CSS declaration, because such a value is ordinary text to an HTML escaper. The only sound
   * rule for a value that will be read as CSS is an allowlist of the exact CSS values the renderer
   * means to support, not a character-level escape.
   *
   * Pure functions over already-extracted strings; no I/O.
   */
  (Drops: "render.ts", "architecture-p2-plan-2026-09-24 §D", the concrete payload strings, "Platform library". The why (escaping is not a CSS sanitizer) is kept.)
other edits in the copy (exact, each once; they remove Tovu file names from doc comments; everything else verbatim):
  - "/** The `text-align` keywords render.ts's own align features (TipTap `textAlign` attrs, table-cell" -> "/** The `text-align` keywords a rich-text renderer's align features (`textAlign` attrs, table-cell"
  - " * Validate a `textAlign`-shaped value against the fixed set of keywords render.ts ever means to emit" -> " * Validate a `textAlign`-shaped value against the fixed set of keywords the renderer ever means to emit"
  - " * Validate an `aspect-ratio`-shaped value (render.ts's `mediaPlaceholder` `props.ratio`)." -> " * Validate an `aspect-ratio`-shaped value (for example a media placeholder's `ratio` prop)."
  - " * @example safeAspectRatio(\"1;background:url(//evil.example)\"); // => null" -> delete this line (the `"1/1;position:fixed"` example on the next line already shows the rejection)
  Then: `rg -n -i "render\.ts|tiptap|tovu|evil" packages/cms/src/html/style-values.ts` prints nothing.
why_moves:
  - Tovu render.ts already carries its own why at the call sites (`styleForAlign`/`mediaPlaceholder`) and render.test.ts:2710-2715; nothing else stays.
deletions_in_copy: - (no tracking pointers)
entry:
  exports_after: the block that ends the `"./widgets/date-label": { … }` entry (packages/cms/package.json lines 260-264); insert after its closing `},`:
      "./html/style-values": {
        "types": "./dist/html/style-values.d.ts",
        "import": "./dist/html/style-values.js",
        "default": "./dist/html/style-values.js"
      },
  runtime: universal -> in `jini.entries`, after the line `      "./widgets/date-label": "universal",` insert `      "./html/style-values": "universal",`
  optional_peers_text: -
  readme_append_after: "| `./widgets/html` | node | HTML scanning/substitution, fragment validation and plugin-export template resolution. |"  readme_text: "| `./html/style-values` | universal | CSS-value allowlists for author strings a renderer writes into a `style` attribute (`safeTextAlign`, `safeAspectRatio`). |"
census:
  cmd: python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/html/style-values.ts
  allowed: [apps/website/src/platform/html/__tests__/style-values.test.ts:4, apps/website/src/server/inbound/public-http/http/site/render.ts:49]
importer_edits:
  - apps/website/src/server/inbound/public-http/http/site/render.ts (TEXT-guarded, once): "import { safeAspectRatio, safeTextAlign } from \"#src/platform/html/style-values\";" -> "import { safeAspectRatio, safeTextAlign } from \"@jini-ai/cms/html/style-values\";"
  - comment: apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts | blob 6f9de764f38fe62bd526e511013393669d1df399 | "// (platform/html/style-values.ts) instead of escaping-and-emitting whatever a" -> "// (`@jini-ai/cms/html/style-values`) instead of escaping-and-emitting whatever a"
test_edits: |
  NEW packages/cms/src/html/__tests__/style-values.test.ts = Tovu test byte for byte, then:
    - "import test from \"node:test\";" -> "import { test } from \"vitest\";"
    - "import { safeAspectRatio, safeTextAlign } from \"../style-values.js\";" unchanged (same relative leaf path in Jini)
    - lines 6-8 comment: "// D1 (architecture-p2-plan-2026-09-24 §D1/D3) — CSS-injection allowlists for the two author-supplied" -> "// CSS allowlists for the two author-supplied"; "// values render.ts interpolates straight into a `style=\"…\"` attribute. escapeHtml alone cannot stop" -> "// values a renderer interpolates straight into a `style=\"…\"` attribute. HTML escaping alone cannot stop"; line 8 unchanged.
    `node:assert/strict` assertions stay byte-identical (vitest runs them). Then `rg -n -i "render\.ts|architecture-p2|tovu" <new test>` prints nothing; if any test NAME string contains "render.ts", replace "render.ts" with "the renderer" in that string only and record it.
changeset: NEW .changeset/cms-html-style-values.md: '---\n"@jini-ai/cms": minor\n---\n\nAdd `@jini-ai/cms/html/style-values` (`safeTextAlign`, `safeAspectRatio`): CSS-value allowlists for author strings written into a `style` attribute.\n'
jini_msg: "feat(cms): add html/style-values CSS allowlists" | body "Moved from a host renderer; pure, no I/O."
tovu_msg: "refactor(render): use @jini-ai/cms/html/style-values" | body "The style-attribute allowlists now live in Jini."
extra_stops: if `packages/cms/src/html/` already exists with other files, keep them and only add; if `rg -n '"./html' packages/cms/package.json` prints anything, STOP (subpath name taken).
Commits: Jini 5 paths (2 new files, package.json, README.md, changeset). Tovu 4 paths (deleted style-values.ts + its test, render.ts, render.test.ts comment).
Cloud run owes: Jini cms vitest style-values.test.ts + subpath-isolation.contract.test.ts + cms typecheck/build; Tovu typecheck + render.test.ts after linking (D1). No RED test.
est_executor_tokens: ~35k Sonnet
