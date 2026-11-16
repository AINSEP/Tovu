# website/features/plugin-runtime — PARTIAL: 1 READY slice, 3 re-kinded to STAY, 4 triaged (W1 #22). Written 2026-11-16 (group E) from Tovu `b28d38c6` / Jini `b7666092`.
Skeletons: `make-sheet.py website/features/plugin-runtime --kind all` (move 5 files, split 3, delete 2). KIND-SUSPECT fired for both DELETE rows; both confirmed wrong (below).
untangle_overlap: rows naming plugin-runtime files — `C3.repoint.tsv:406,483` (`tool-registrations.ts`), `C3.repoint.tsv:482` (`capability-tool-registrations.ts`), `C8.repoint.tsv:141` and `C11.repoint.tsv:157-161` (tests/fixtures under `plugin-runtime/__tests__/`). **None touches a file of MV-plugin-runtime-1** (all under `built-ins/content-analyzer/`), so MV-plugin-runtime-1 may run now. Any later slice that edits `tool-registrations.ts`, `capability-tool-registrations.ts` or those tests: after wave B.

## Slices and per-file verdicts
| id / file | lines | verdict | status |
|---|---|---|---|
| MV-plugin-runtime-1: `built-ins/content-analyzer/analyze-content.ts` + `summary.ts` | 283 + 66 | MOVE to NEW `@jini-ai/cms/seo/content-analysis` (universal); Tovu keeps a 1-function binding that passes its `toSlug` | READY now (below) |
| `built-ins/content-analyzer/tiptap-blocks.ts` | 128 | re-kind MOVE -> **STAY**: its own header and analyze-content's say the editor adapter stays with the plugin wiring and only the scorer + summary travel; it is the plugin's TipTap knowledge, not SEO. Repointed (type import) inside MV-1. Avoids owner decision 3 entirely. | done by MV-1 (import line only) |
| `plugin-export.ts` | 18 | re-kind MOVE -> **STAY (binding)**: Jini already made this a host port, `PluginSdkBinding.readDefinedPlugin` (packages/plugins/src/host/ports.ts:38); the `{ default: { definition: { setup } } }` shape is the Tovu SDK's ABI (`definePlugin` from `@tovu/sdk`), so Tovu's implementation of the port is the binding. Nothing to move. Follow-up (chore, not this wave): its header names Jini file paths; fine to leave. | no slice |
| `invocation-core-deps.ts` | 52 | DELETE -> **STAY (binding)**: binds `@tovu/sdk`'s `HOOK_CONTENT_ENTRY_BEFORE_SAVE` into Jini's `createPluginInvocationBinding`; SDK-specific value. KIND-SUSPECT right. | no slice |
| `install.ts` | 23 | MIXED -> **STAY**: an env adapter (`TOVU_DESKTOP_OWNER_PID`, `TOVU_PLUGIN_LOCAL_INSTALL`, `ELECTRON_RUN_AS_NODE`, `NODE_ENV`) over Jini's existing `createPluginSourcePolicy`; the generic half is already in Jini. | no slice |
| DD-plugin-runtime-1: `declarative-content-types.ts` | 89 | DELETE -> **DEDUPE/binding**: 4 wrappers inject Tovu `SYSTEM_CONTENT_TYPES` into Jini plugins-host rules (keep), plus re-exports + 3 type aliases of Jini names (drop, repoint importers; COMMON 19). KIND-SUSPECT right. | NOT FILLED (Sonnet tier, ~40k; census of the re-exported names needed) |
| DD-plugin-runtime-2: `agent-tools.ts` | 299 | MIXED -> **DEDUPE type-narrowing + STAY catalog**: re-declares `AgentToolSideEffect`/`AgentToolActorClassRule`/`AgentToolDefinition` that `@jini-ai/core` exports (packages/core/src/index.ts:47); the catalog data (tool names, permissions, product wording) stays. | NOT FILLED (Sonnet tier, ~40k) |
| SP-plugin-runtime-1: `install-source.ts` | 62 | SPLIT: request parsing + size-bounded archive reader -> `@jini-ai/plugins/host/tools` next to `PluginInstallToolsRequired.parseRequest`; Tovu keeps `CHAT_ATTACHMENT_REF_PATTERN`, the attachment reader and the "32 MiB" copy. | NOT FILLED (Sonnet+review, ~60k) |
| MV-plugin-runtime-2: `sdk-resolver.ts` | 124 | MOVE with a Tovu binding: the `module.register()` hook + once-per-process guard -> `@jini-ai/plugins/host/node`; Tovu keeps `resolveDefaultSdkModulePath` (its `createRequire(import.meta.url)` must resolve from Tovu's own `node_modules`, so it can never move) and passes `sdkModulePath`. Also deletes the boot re-export shell `server/runtime/boot/plugin-sdk-resolver.ts` (COMMON 19) and repoints `src/index.ts:25`, 2 e2e support files, 3 boot tests, a path literal in `export-command-plugin-sdk-resolver.integration.test.ts:48` and the module-mock path in `serve-command-wiring.unit.test.ts:233`. Security-labelled (CIC U-002): two spawn-based integration tests load the module by URL. | NOT FILLED: Opus sheet (~80k). Not an owner decision. |

---------------------------------------------------------------------------------------------------
## Slice MV-plugin-runtime-1 (template T-MOVE) — content analysis into `@jini-ai/cms/seo/content-analysis`
Decisions: a NEW universal subpath (not the `./seo` barrel) because `plugin.ts` runs inside the Tier-2 plugin worker and must not load the rest of `cms/seo`. Two Jini files under one folder with an `index.ts`, so both files copy nearly verbatim. Tovu's slug rule (`toSlug`, `@sindresorhus/slugify`, renderer-identical anchors) becomes a REQUIRED `slugify` field of `AnalyzeContentRequired`; Tovu keeps `analyzeContent` as a binding with today's signature, so its 43 test call sites and `plugin.ts:43` are untouched. `summarizeReport(report)` gains `_options = {}` (COMMON 10; `report` is already the required object), no caller change.
```
id: MV-plugin-runtime-1
feature: website/features/plugin-runtime
precondition: -
tovu_files:
  - apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts | blob e652280b12158f4186d67d1ce9ec0eafe1f7f631 | keep-reduced (binding, full text below)
  - apps/website/src/features/plugin-runtime/built-ins/content-analyzer/summary.ts | blob e21f0db5db3810ca1564a294a39f73ad4ff09d5d | delete
  - apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts | blob 00227007945116eb269391232396b14b7e252ea2 | importer edit only
  - apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts | blob 83c38ee75499c524f7735c908c52119bf22b0c23 | importer edit only
tovu_tests:
  - .../content-analyzer/__tests__/unit/analyze-content.unit.test.ts | blob 444f495e9b33f33134ff4054f939488d5320f5ae | keep-repointed (exercises the binding with the real slug rule: transliterated anchors, rendered-ids test at :329)
  - .../content-analyzer/__tests__/unit/summary.unit.test.ts | blob a4c2febf8d4482f1143b80b25970cbc6775193a6 | keep-repointed
  - .../content-analyzer/__tests__/unit/plugin.unit.test.ts | blob 1fab854739c095849b433c02d801c2bc7eb2ae84 | keep-repointed
  - .../content-analyzer/__tests__/unit/tiptap-blocks.unit.test.ts | blob c5cd4a5db483aab9026afa0b381c34ec9c99740b | no edit
  - .../content-analyzer/__tests__/unit/index.unit.test.ts | blob f090c860395b05e90b59e46393fb7aa76fcb2a0d | no edit
  - apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts | no edit (skeleton listed it for sdk-resolver, not this slice)
  (`...` = apps/website/src/features/plugin-runtime/built-ins)
jini_target: cms ./seo/content-analysis packages/cms/src/seo/content-analysis/{analyze-content.ts,summary.ts,index.ts}
jini_guards:
  - packages/cms/src/seo/content-analysis must not exist (directory); .changeset/cms-seo-content-analysis.md must not exist
  - packages/cms/package.json blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b
  - rg -n "analyzeContent|summarizeReport|countSyllables|ContentAnalysisReport" packages/cms/src -> prints nothing
symbol_map:
  - analyzeContent -> @jini-ai/cms/seo/content-analysis analyzeContent (required gains `slugify`)
  - countSyllables, summarizeReport, types CheckId, CheckStatus, ContentCheck, HeadingLevel, TocEntry, ReadabilityBand, ContentAnalysisReport, ContentBlock, AnalyzeContentRequired, AnalyzeContentOptional -> same names, same specifier
values_injected:
  - Tovu `toSlug` (`#src/platform/html/slug`, transliterating, renderer-identical) -> required.slugify (Tovu binding passes `toSlug`)
leaf_import_rewrites:
  - 'import { toSlug } from "#src/platform/html/slug";' (line 1 of analyze-content.ts) -> deleted
  - summary.ts 'import type { CheckId, ContentAnalysisReport, ContentCheck } from "./analyze-content.js";' -> unchanged (already a relative leaf)
```
### Jini files (Jini commit)
1. NEW `packages/cms/src/seo/content-analysis/analyze-content.ts` = Tovu analyze-content.ts byte for byte, then these edits, each OLD occurring exactly once:
   - delete line 1 `import { toSlug } from "#src/platform/html/slug";`
   - OLD ` * @file \`analyzeContent\` — the generic, pure SEO / readability scorer behind the \`content-analyzer\`` + newline + ` * built-in (AW-7 Tier 2).`
     NEW ` * @file \`analyzeContent\` — a generic, pure SEO / readability scorer for one piece of content.`
   - OLD the 5 lines from ` * No I/O, no globals, no clock. Heading slugs share the renderer's platform helper. It is shaped to` through ` * so only this file (and \`./summary.ts\`) travel.`
     NEW (2 lines):
     ` * No I/O, no globals, no clock. Heading anchors come from the host's required \`slugify\`, so they`
     ` * match the ids its renderer emits. An editor adapter (document tree -> \`ContentBlock[]\`) stays with the host.`
   - OLD `  blocks: readonly ContentBlock[];` + newline + `}` (inside `AnalyzeContentRequired`, the first occurrence of that 2-line text)
     NEW `  blocks: readonly ContentBlock[];` / `  /** Text -> URL slug; pass the renderer's own rule so TOC anchors match the heading ids it emits. */` / `  slugify: (args: { text: string }) => string;` / `}`
   - OLD ` * @param required - \`title\` (the page's H1) and the body as a flat \`ContentBlock[]\`.`
     NEW ` * @param required - \`title\` (the page's H1), the body as a flat \`ContentBlock[]\`, and \`slugify\` for TOC anchors.`
   - OLD `  const { title, blocks } = required;` NEW `  const { title, blocks, slugify } = required;`
   - OLD `    toc: buildToc({ headings }),` NEW `    toc: buildToc({ headings, slugify }),`
   - OLD ` * Uses the renderer's slug function so transliteration and empty headings match emitted ids.`
     NEW ` * Uses the host's slug function so transliteration and empty headings match the ids its renderer emits.`
   - OLD `function buildToc({ headings }: { headings: ReadonlyArray<{ level: HeadingLevel; text: string }> }, _optional = {}): TocEntry[] {`
     NEW `function buildToc({ headings, slugify }: { headings: ReadonlyArray<{ level: HeadingLevel; text: string }>; slugify: AnalyzeContentRequired["slugify"] }, _optional = {}): TocEntry[] {`
   - OLD `    const base = toSlug({ text });` NEW `    const base = slugify({ text });`
   Nothing else changes.
2. NEW `packages/cms/src/seo/content-analysis/summary.ts` = Tovu summary.ts byte for byte, then:
   - OLD ` * paragraph (the \`content-analyzer\` built-in's \`ext.content-analyzer.summary\` field, AW-7 Tier 2).`
     NEW ` * paragraph, e.g. for an agent that answers "analyze this page" by reading it back.`
   - OLD the 2 lines ` * Pure, no Tovu imports beyond the sibling scorer's types — travels with \`./analyze-content.ts\` to` + ` * \`@jini-ai/visibility/seo\` later. English only by design: a UI localizes from the report's check`
     NEW the 2 lines ` * Pure; imports only the sibling scorer's types. English only by design: a UI localizes from the` + ` * report's check`
     (the following line ` * \`params\`, not from this string.` stays as is)
   - OLD `export function summarizeReport(report: ContentAnalysisReport): string {` NEW `export function summarizeReport(report: ContentAnalysisReport, _options = {}): string {`
   (The "Purpose:" paragraph says "The agent answers…" — neutral; keep.)
3. NEW `packages/cms/src/seo/content-analysis/index.ts`, exactly:
   ```ts
   /** Pure SEO / readability scoring of one piece of content and its model-facing summary. Universal, no I/O. */
   export * from "./analyze-content.js";
   export { summarizeReport } from "./summary.js";
   ```
4. Entry (package.json + README):
   - exports: after the exact 5 lines
     `    "./seo": {` / `      "types": "./dist/seo/index.d.ts",` / `      "import": "./dist/seo/index.js",` / `      "default": "./dist/seo/index.js"` / `    },`
     insert `    "./seo/content-analysis": {` / `      "types": "./dist/seo/content-analysis/index.d.ts",` / `      "import": "./dist/seo/content-analysis/index.js",` / `      "default": "./dist/seo/content-analysis/index.js"` / `    },`
   - jini.entries: after `      "./seo": "universal",` insert `      "./seo/content-analysis": "universal",`
   - optional peers: none (no npm import).
   - README: before the line `## Port inventory` insert:
     `` `@jini-ai/cms/seo/content-analysis` (universal, pure): `analyzeContent` scores title + content blocks (checks, readability, TOC with a host-supplied `slugify`) and `summarizeReport` renders the report as one English paragraph. `` followed by one blank line.
5. NEW `packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts`, exactly:
   ```ts
   import { expect, test } from "vitest";
   import { analyzeContent, summarizeReport, type ContentBlock } from "../index.js";

   /** A deliberately plain slug rule: the scorer must use whatever the host passes. */
   const slugify = ({ text }: { text: string }): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
   const prose = (words: number): ContentBlock => ({ kind: "text", text: `${Array.from({ length: words }, () => "cat").join(" ")}.` });

   test("TOC anchors come from the injected slugify, de-duplicated, empty ones omitted", () => {
     const report = analyzeContent({
       title: "A title that is long enough to pass the check",
       blocks: [{ kind: "heading", level: 2, text: "Getting Started" }, { kind: "heading", level: 2, text: "Getting Started" }, { kind: "heading", level: 2, text: "!!!" }, prose(10)],
       slugify,
     });
     expect(report.toc.map((row) => row.anchor)).toEqual(["getting-started", "getting-started-2"]);
   });

   test("an empty body scores zero words and the summary says so in English", () => {
     const report = analyzeContent({ title: "Short", blocks: [], slugify });
     expect(report).toMatchObject({ v: 1, wordCount: 0 });
     expect(summarizeReport(report)).toMatch(/^Content score \d+\/100\./);
   });
   ```
6. Changeset `.changeset/cms-seo-content-analysis.md`:
   `---` / `"@jini-ai/cms": minor` / `---` / `` / `` Add `@jini-ai/cms/seo/content-analysis`: pure SEO/readability scoring (`analyzeContent`, host-supplied `slugify`) and `summarizeReport`. ``
7. Rule checks on the 4 new Jini files: COMMON 2 regex prints nothing; `rg -n "AW-7|content-analyzer|visibility/seo|todos\.md|toSlug" packages/cms/src/seo/content-analysis` prints nothing (else STOP: a header line was not rewritten); no `node:` import; only relative imports.
   jini_msg: "feat(cms): seo/content-analysis — content scoring with an injected slugify"

### Tovu (Tovu commit)
```
tovu_reduced: apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts becomes exactly:
  /**
   * @file The `content-analyzer` built-in's binding of `analyzeContent` (`@jini-ai/cms/seo/content-analysis`)
   * to the renderer's slug rule (AW-7 Tier 2): TOC anchors use `toSlug`, so transliterated headings
   * match the ids the site renderer emits. The TipTap adapter lives in `./tiptap-blocks.ts` and the
   * plugin wiring in `./plugin.ts`.
   */
  import { analyzeContent as analyzeWithSlugify, type AnalyzeContentOptional, type AnalyzeContentRequired, type ContentAnalysisReport } from "@jini-ai/cms/seo/content-analysis";
  import { toSlug } from "#src/platform/html/slug";

  /** Scores one piece of content with the renderer's slug rule; see `analyzeContent` in Jini. */
  export function analyzeContent(required: Omit<AnalyzeContentRequired, "slugify">, optional: AnalyzeContentOptional = {}): ContentAnalysisReport {
    return analyzeWithSlugify({ ...required, slugify: toSlug }, optional);
  }
why_moves: the original header's "Counting rules" and "Purpose" paragraphs move with the code (neutral); the Tovu-specific why (AW-7 Tier 2, renderer anchors, where the TipTap adapter lives) is in the binding header above.
importer_edits (each OLD exactly once):
  - .../content-analyzer/summary.ts: git rm -q
  - .../content-analyzer/plugin.ts: 'import { summarizeReport } from "./summary.js";' -> 'import { summarizeReport } from "@jini-ai/cms/seo/content-analysis";'   (line 18 `import { analyzeContent } from "./analyze-content.js";` stays: the binding)
  - .../content-analyzer/tiptap-blocks.ts: 'import type { ContentBlock, HeadingLevel } from "./analyze-content.js";' -> 'import type { ContentBlock, HeadingLevel } from "@jini-ai/cms/seo/content-analysis";'
  - .../__tests__/unit/analyze-content.unit.test.ts: the 8-line block from 'import {' + '  analyzeContent,' through '} from "../../analyze-content.js";' ->
      import { analyzeContent } from "../../analyze-content.js";
      import { countSyllables, type CheckId, type ContentAnalysisReport, type ContentBlock, type ContentCheck } from "@jini-ai/cms/seo/content-analysis";
  - .../__tests__/unit/summary.unit.test.ts: 'import { analyzeContent, type ContentBlock } from "../../analyze-content.js";' + newline + 'import { summarizeReport } from "../../summary.js";' ->
      'import { analyzeContent } from "../../analyze-content.js";' + newline + 'import { summarizeReport, type ContentBlock } from "@jini-ai/cms/seo/content-analysis";'
  - .../__tests__/unit/plugin.unit.test.ts: 'import { summarizeReport } from "../../summary.js";' -> 'import { summarizeReport } from "@jini-ai/cms/seo/content-analysis";'
census:
  cmd: rg -n --no-heading -e "analyze-content" -e "content-analyzer/summary" -e "\"\./summary\.js\"" -e "\"\.\./\.\./summary\.js\"" apps development --glob '!**/node_modules/**'
  allowed (before): [.../content-analyzer/plugin.ts:18, .../content-analyzer/plugin.ts:19, .../content-analyzer/summary.ts:16, .../content-analyzer/tiptap-blocks.ts:26, .../__tests__/unit/analyze-content.unit.test.ts:11, .../__tests__/unit/plugin.unit.test.ts:6, .../__tests__/unit/plugin.unit.test.ts:8, .../__tests__/unit/summary.unit.test.ts:4, .../__tests__/unit/summary.unit.test.ts:5, plus comment mentions of `./analyze-content.ts` inside content-analyzer/*.ts headers]
  A `"./summary.js"` hit OUTSIDE built-ins/content-analyzer is another module: ignore. After: no hit names summary.js inside content-analyzer; analyze-content.js only from plugin.ts:18 and the 3 tests.
baselines: development/scripts/hardwiring-debt.json:181 names plugin.ts line 16 (the `@tovu/sdk` import) — that line is untouched; no edit.
tovu_msg: "refactor(plugin-runtime): content scoring from @jini-ai/cms/seo/content-analysis" | body "Tovu keeps analyzeContent as a binding to its renderer slug rule; the TipTap adapter and plugin wiring stay."
extra_stops:
  - plugin.ts runs in the Tier-2 worker: if `rg -n "allow|permission|--experimental-permission|allowedSpecifiers" apps/website/src/server/runtime/plugin-tier2/worker.ts` shows an import allowlist that would refuse `@jini-ai/cms/*`, STOP (report it; the cloud run's plugin.unit/integration tests are the proof otherwise).
  - `analyzeContent` in Jini exceeds 50 lines or complexity 10 after the edit (it does not today: the slugify destructure adds 0 branches) -> STOP.
```
RED/GREEN: none (no behaviour change). Cloud run owes: cms vitest (new test), cms typecheck + subpath isolation; Tovu content-analyzer unit tests (anchors through the binding), plugin-tier2 integration if present.
