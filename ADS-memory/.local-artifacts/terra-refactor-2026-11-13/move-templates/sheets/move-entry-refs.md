# website/contracts/core/entry-refs — 3 slices (W1 #19). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra), group D. Replaces the NOT FILLED triage sheet.
Paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base. Run `scripts/census.py` from the Tovu root.

## Re-kinds and decisions (read first)
- `types.ts` + `ports.ts` (DEDUPE): exact twins of `@jini-ai/cms/widgets` `EntryRefRow` / `EntryRefsRepoPort` (`JINI packages/cms/src/widgets/ports.ts:106-124`; same members, same unions, Jini inlines the two unions). One slice, delete-and-repoint (COMMON 19); the two Tovu union names become local indexed-access aliases where used. The generic why in `types.ts` moves onto the Jini declaration (doc-only Jini commit, no changeset).
- `repo.memory.ts` DEDUPE-UNVERIFIED -> **MOVE**: Jini's twin is a TEST fixture (`cms/src/widgets/__tests__/support/host.fixture.ts:26`, not exported), not a shipped survivor. The Tovu class is a production adapter (`server/runtime/composition/app.ts:233`), so it moves to `@jini-ai/cms/widgets`. (Optional later Jini-only cleanup, NOT in this slice: point `host.fixture.ts` at the shipped class.)
- `extractor.ts` MOVE -> **SPLIT** (bodies move, Tovu keeps a 1-function binding): the file has a `console.warn` (COMMON 7). The Jini copy reports through an injected `report` option; Tovu keeps `extractHtmlEntryRefs` as a binding that passes `console.warn`, so the canary test that captures `console.warn` and every html caller see byte-identical output. Survey note "host supplies ref-key naming (`*TermId`, `*RefId`)": NOT taken — the suffix convention is the one Jini's own widget registry declares (`formDefinitionId`, `menuRef`, `categoryTermId` in `cms/src/widgets/registry.ts`), so it is generic and needs no port.
- Order: **DD-entry-refs-1, then MV-entry-refs-1, then SP-entry-refs-1.**
- untangle_overlap: C3.repoint.tsv rows on `features/widgets/deps.ts`, `features/publish-content/type-registry.ts`, `features/pages/html-document-store*.ts`, `server/routes/types.ts` (+C4/C6 rows there); C4 row on `server/runtime/composition/app.ts`. None names an entry-refs file. **All 3 slices: execute after wave B merge**; every file in that list is guarded by exact text, never blob. No feature file of entry-refs is in any TSV.
- blocked: no. Owner decisions: none. Tier: Sonnet (DD, MV), Sonnet + Opus review of the SP diff (console port).

---------------------------------------------------------------------------------------------------
## Slice DD-entry-refs-1 (template T-DEDUPE, delete-and-repoint, 2 files)
```
id: DD-entry-refs-1
feature: website/contracts/core/entry-refs
tovu_files:
  - apps/website/src/contracts/core/entry-refs/types.ts | blob 41043733f2d6113d867de10955949bb34dddf671 | delete-and-repoint
  - apps/website/src/contracts/core/entry-refs/ports.ts | blob 6f2bc9231f7d09b85a539a7bac24991a290989ae | delete-and-repoint
jini_survivor: @jini-ai/cms/widgets EntryRefRow at packages/cms/src/widgets/ports.ts:107, EntryRefsRepoPort at :117 | blob e160b37082e6309c95e10707818d8a0669a1305d (re-exported by widgets/index.ts:8 `export * from "./ports.js";`)
behaviour_diff:
  - type EntryRefRow: Tovu 6 readonly fields, sourceKind via alias EntryRefSourceKind = "widget-area-placement" | "widget-embed" | "config-field" | "page-html-embed", targetKind via EntryRefTargetKind = "entry" | "term" | "asset" / Jini the same 6 readonly fields with the same unions inline / same
  - type EntryRefsRepoPort: Tovu findByTarget, findBySource, replaceForSource, removeBySource, rebuildForWorkspace (object args, same field types) / Jini the same 5 members, findByTarget's targetKind typed EntryRefRow["targetKind"] (= the same union) / same
  - names EntryRefSourceKind / EntryRefTargetKind: no Jini export / replaced by local aliases `type X = EntryRefRow["sourceKind" | "targetKind"]` in the files that use them
real_caller_check: apps/website/src/platform/db/repos/entry-refs-repo.ts implements EntryRefsRepoPort for SQLite and casts `row.source_kind as EntryRefSourceKind` (line 30) / `row.target_kind as EntryRefTargetKind` (line 32): the local aliases keep both casts identical.
binding: - (both files deleted)
jini_doc_commit (Jini commit 1, doc-only, no changeset): packages/cms/src/widgets/ports.ts | OLD (exact, 9 lines):
  /** Structural reference-index row: the host owns extraction and persistence. */
  export interface EntryRefRow {
    readonly workspaceId: UUID;
    readonly sourceEntryId: UUID;
    readonly sourceKind: "widget-area-placement" | "widget-embed" | "config-field" | "page-html-embed";
    readonly fieldPath: string;
    readonly targetKind: "entry" | "term" | "asset";
    readonly targetId: UUID;
  }
NEW:
  /**
   * One row of the derived reference index: the source content object refers to a target at `fieldPath`.
   * Rows are extracted and replaced in the same transaction as the source write, never by a follow-up job,
   * and the index can be rebuilt from live entries at any time. Safe-delete's where-used check reads it.
   * Structural: the host owns extraction and persistence.
   */
  export interface EntryRefRow {
    readonly workspaceId: UUID;
    readonly sourceEntryId: UUID;
    /**
     * Where the reference sits: `widget-area-placement` (a `widget_area` entry's `bodyJson.placements`),
     * `widget-embed` (a `widgetEmbed` node anywhere in a `bodyJson`), `config-field` (a ref-typed field in a
     * widget instance's `fields.ext.widget.*` config), `page-html-embed` (a `data-embed-type` marker in an
     * html-format page body: a plain HTML string written outside the entries write path, hence its own kind).
     */
    readonly sourceKind: "widget-area-placement" | "widget-embed" | "config-field" | "page-html-embed";
    /** JSON-path-shaped locator within the source (e.g. `bodyJson.placements[2]`, `fields.ext.widget.config.formDefinitionId`). */
    readonly fieldPath: string;
    /**
     * `entry` (a durable content object), `term` (a taxonomy term; narrower, soft coverage) or `asset`
     * (a media asset: a different storage domain from entries, so it gets its own kind rather than overloading `entry`).
     */
    readonly targetKind: "entry" | "term" | "asset";
    readonly targetId: UUID;
  }
  rule check: rg -n -i "tovu|site-chat|apps/(admin|website|desktop)" packages/cms/src/widgets/ports.ts -> nothing. jini_msg: "docs(cms): carry the entry-refs index rationale onto EntryRefRow"
why_moves:
  - types.ts "derived, rebuildable reference-integrity index ... populated at the single entries write chokepoint", the sourceKind and targetKind docs, the fieldPath doc, the INV-06 same-transaction rule -> Jini EntryRefRow (jini_doc_commit above, neutral)
  - types.ts history ("does not exist as running code before SPEC-043", "`src/navigation/resolver.ts`'s own comment", "placed under `core/`, not `widgets/`") -> dropped: history of the Tovu file, no live rule
  - ports.ts "Written to ONLY by `extractEntryRefs`, called from the single entries write chokepoint, same transaction ... never a second write path" -> apps/website/src/platform/db/repos/entry-refs-repo.ts, one line directly above its import of EntryRefsRepoPort:
      // EntryRefsRepoPort is written only by the entries write chokepoint's extraction, in the same transaction (ADR-022 §5, SPEC-043 REQ-29..32).
failing_test: - (types only)
importer_edits:                            # exact old -> new; quote style kept as written
  - apps/website/src/platform/db/repos/entry-refs-repo.ts (blob 42001fded69c60c6d0d548147d20829cc447120a):
      'import type { EntryRefsRepoPort } from "#src/contracts/core/entry-refs/ports";' -> 'import type { EntryRefRow, EntryRefsRepoPort } from "@jini-ai/cms/widgets";'   (with the why line above it)
      'import type { EntryRefRow, EntryRefSourceKind, EntryRefTargetKind } from "#src/contracts/core/entry-refs/types";' -> 'type EntryRefSourceKind = EntryRefRow["sourceKind"];\ntype EntryRefTargetKind = EntryRefRow["targetKind"];'
      (the two alias lines go where the import line was; if that leaves a `type` between two `import` statements and eslint reports `import/first` as an ERROR, move the two alias lines to just after the last import — the only allowed variation)
  - apps/website/src/platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts (blob 4f2f4a73f395a5d6b42968ae83cf5e5092205c5c): 'import type { EntryRefRow } from "#src/contracts/core/entry-refs/types";' -> 'import type { EntryRefRow } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/media/where-used.ts (blob e2796646cb4d2242e93230f8dcf573b3f2e01b33): the two lines
      "import type { EntryRefsRepoPort } from '#src/contracts/core/entry-refs/ports';" + "import type { EntryRefRow } from '#src/contracts/core/entry-refs/types';"
      -> one line "import type { EntryRefRow, EntryRefsRepoPort } from '@jini-ai/cms/widgets';"
  - apps/website/src/server/routes/types.ts (text-guarded): 'import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";' -> 'import type { EntryRefsRepoPort } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/publish-content/type-registry.ts (text-guarded): 'import type { EntryRefsRepoPort } from "#src/contracts/core/entry-refs/ports";' -> 'import type { EntryRefsRepoPort } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/pages/html-document-store.memory.ts (text-guarded): 'import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";' -> 'import type { EntryRefsRepoPort } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/pages/html-document-store.ts (text-guarded): same old -> new as the line above
  - apps/website/src/features/widgets/deps.ts (text-guarded): 'import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";' -> 'import type { EntryRefsRepoPort } from "@jini-ai/cms/widgets";'
  - apps/website/src/contracts/core/entry-refs/repo.memory.ts (blob d430739f820bad0f5cef6dd3004cb7e375f0e338): the two lines 'import type { EntryRefsRepoPort } from "./ports.js";' + 'import type { EntryRefRow, EntryRefTargetKind } from "./types.js";' -> 'import type { EntryRefRow, EntryRefsRepoPort } from "@jini-ai/cms/widgets";' and in the `findByTarget` signature 'targetKind: EntryRefTargetKind;' -> 'targetKind: EntryRefRow["targetKind"];' (exactly one occurrence)
  - apps/website/src/contracts/core/entry-refs/extractor.ts (blob 36fa39f0449d9b07172a0425a646196d88eec723): 'import type { EntryRefRow, EntryRefTargetKind } from "./types.js";' -> 'import type { EntryRefRow } from "@jini-ai/cms/widgets";\n\ntype EntryRefTargetKind = EntryRefRow["targetKind"];'
  - apps/website/src/contracts/core/entry-refs/__tests__/repo.contract.test.ts (blob dc0401fcb1e1e0acce9862b72873c36b44aa3e6b): 'import type { EntryRefsRepoPort } from "../ports.js";' + 'import type { EntryRefRow } from "../types.js";' -> one line 'import type { EntryRefRow, EntryRefsRepoPort } from "@jini-ai/cms/widgets";'
  - apps/website/src/contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts (blob 06604f10fc05e79af5bdcc6f46af777a48fa0d20): 'import type { EntryRefRow } from "../../types.js";' -> 'import type { EntryRefRow } from "@jini-ai/cms/widgets";'
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/contracts/core/entry-refs/types.ts -> before exactly 8 hits (entry-refs-repo.ts:7, entry-refs-repo.dialects.test.ts:6, where-used.ts:5, extractor.ts:23, repo.memory.ts:3, ports.ts:12, repo.contract.test.ts:8, extractor.integration.test.ts:5); ports.ts -> exactly 9 hits (routes/types.ts:148, entry-refs-repo.ts:6, where-used.ts:4, type-registry.ts:24, html-document-store.memory.ts:13, html-document-store.ts:12, widgets/deps.ts:35, repo.memory.ts:2, repo.contract.test.ts:7). After: 0 hits each. Also `rg -n "entry-refs/(types|ports)" apps development --glob '!**/node_modules/**'` -> nothing.
  `rg -n "EntryRefSourceKind|EntryRefTargetKind" apps --glob '!**/node_modules/**'` after: only the alias lines + uses in entry-refs-repo.ts and extractor.ts, plus the doc mention in html-entry-refs-consistency.integration.test.ts:14 (comment, stays).
baselines: rg -n -F "entry-refs/types" / -F "entry-refs/ports" over json/mjs/cjs/yml: no hit (checked; write-path-inventory names `src/platform/db/repos/entry-refs-repo.ts`, which stays).
bundle_check: -
jini_msg: "docs(cms): carry the entry-refs index rationale onto EntryRefRow" | tovu_msg: "refactor(entry-refs): use @jini-ai/cms/widgets EntryRefRow and EntryRefsRepoPort" | body "The two Tovu files were exact twins; the source/target kind names are local aliases of EntryRefRow fields."
Commit paths: Jini 1 (ports.ts). Tovu 13 (2 deleted + 11 edited).
```

---------------------------------------------------------------------------------------------------
## Slice MV-entry-refs-1 (template T-MOVE) — after DD-entry-refs-1
```
id: MV-entry-refs-1
feature: website/contracts/core/entry-refs
precondition: DD-entry-refs-1 landed: `rg -n '@jini-ai/cms/widgets' apps/website/src/contracts/core/entry-refs/repo.memory.ts` prints the import line. Else SKIP.
tovu_files:
  - apps/website/src/contracts/core/entry-refs/repo.memory.ts | blob: take after DD (only its 2 import lines + 1 signature line differ from d430739f) | delete
tovu_tests: - (no test of its own; repo.contract.test.ts does not import it)
jini_target: cms ./widgets packages/cms/src/widgets/entry-refs.memory.ts
jini_guards:
  - packages/cms/src/widgets/entry-refs.memory.ts must not exist
  - packages/cms/src/widgets/index.ts blob c427f2a29cd3429fac21181c89efc8f9c41ad392
  - rg -n "InMemoryEntryRefsRepo" packages/cms/src --glob '!**/__tests__/**' -> prints nothing (the test fixture's own class is allowed and untouched)
symbol_map:
  - InMemoryEntryRefsRepo -> @jini-ai/cms/widgets InMemoryEntryRefsRepo (class; methods already take one object arg each; unchanged)
values_injected: -
leaf_import_rewrites:
  - 'import type { EntryRefRow, EntryRefsRepoPort } from "@jini-ai/cms/widgets";' -> 'import type { EntryRefRow, EntryRefsRepoPort } from "./ports.js";'
header_rewrite: |
  replace the whole /** @file ... */ block (from "/**\n * @file In-memory `EntryRefsRepoPort` adapter" through " * Infrastructure adapter (in-memory). No feature logic.\n */") with:
  /**
   * @file In-memory `EntryRefsRepoPort` adapter for hermetic tests and dev composition: a plain collection
   * that replaces per source entry and validates nothing of its own (extraction does that).
   */
why_moves:
  - "ADR-006 rule-of-two ... `repo.sqlite.ts` is the other ... mirroring `navigation/repo.memory.ts`" -> Tovu, apps/website/src/platform/db/repos/entry-refs-repo.ts, appended to the why line DD added: " Its in-memory twin is `InMemoryEntryRefsRepo` from `@jini-ai/cms/widgets` (ADR-006 rule of two)."
deletions_in_copy: -
entry: -   (existing universal subpath ./widgets; no node import)
jini_index: packages/cms/src/widgets/index.ts: after 'export * from "./repo.memory.js";' insert 'export * from "./entry-refs.memory.js";'
census:
  cmd: python3 scripts/census.py {TOVU_CLONE} apps/website/src/contracts/core/entry-refs/repo.memory.ts
  allowed (22, each line is exactly `import { InMemoryEntryRefsRepo } from <Q><spec><Q>;`):
    apps/website/src/server/runtime/composition/app.ts:233 (text-guarded, C4) "#src/contracts/core/entry-refs/repo.memory"
    apps/website/src/server/__tests__/widgets-error-code-parity.test.ts:8, b07-widget-create-gaps.test.ts:6, b07-admin-read-gaps.test.ts:5 "../../contracts/core/entry-refs/repo.memory.js"
    apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/{region-bind:7,library:7,route-guards:8,update:7}.unit.test.ts "#src/contracts/core/entry-refs/repo.memory"
    apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts:8 '#src/contracts/core/entry-refs/repo.memory' (single quotes)
    apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts:7 "../../../contracts/core/entry-refs/repo.memory.js"
    apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts:4, html-document-store.sqlite.test.ts:12 "#src/contracts/core/entry-refs/repo.memory"
    apps/website/src/features/forms/__tests__/common-fields.test.ts:6 "../../../contracts/core/entry-refs/repo.memory.js"
    apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts:7 and __tests__/integration/{region-area-service:5, tool-registrations.plugin-hook-failed:10, embed-service:10, tool-registrations.shape-rejection:6, write-service:5, tool-registrations.handler-gaps:6, tool-registrations.region-gaps:6, tool-registrations.delegated-error-status:9} "#src/contracts/core/entry-refs/repo.memory"
importer_edits: in each of the 22 files above, the one census line -> `import { InMemoryEntryRefsRepo } from <Q>@jini-ai/cms/widgets<Q>;` (same quote character <Q> as the old line; nothing else on the line changes). If a file then has two import statements from "@jini-ai/cms/widgets" and eslint reports `import/no-duplicates` as an ERROR, merge into the existing statement (the only allowed variation).
test_edits: -
changeset: .changeset/cms-entry-refs-memory.md: '---\n"@jini-ai/cms": minor\n---\n\nAdd `InMemoryEntryRefsRepo` to `@jini-ai/cms/widgets`: an in-memory `EntryRefsRepoPort` for tests and dev composition.\n'
jini_msg: "feat(cms): InMemoryEntryRefsRepo in widgets" | body "Moved from a host; same five methods, no validation of its own."
tovu_msg: "refactor(entry-refs): InMemoryEntryRefsRepo from @jini-ai/cms/widgets" | body "22 importers repointed; the SQLite adapter stays in Tovu."
extra_stops: the census prints a line that is not exactly the one-name import above (e.g. a second imported name): STOP.
```
Copy check: Jini file = Tovu file (post-DD) with only the import line and the header block changed. Rule 2 rg must print nothing.

---------------------------------------------------------------------------------------------------
## Slice SP-entry-refs-1 (template T-SPLIT) — after MV-entry-refs-1; Opus reviews the diff
```
id: SP-entry-refs-1
feature: website/contracts/core/entry-refs
tovu_files:
  - apps/website/src/contracts/core/entry-refs/extractor.ts | blob: take after DD (differs from 36fa39f0 only on the DD import lines)
split:
  - ExtractEntryRefsInput (interface) | MOVE -> packages/cms/src/widgets/entry-refs-extractor.ts
  - classifyRefFieldKey, collectWidgetEmbedRefs, collectWidgetEmbedNode, collectPlacementRefs, collectNamespaceConfigRefs, addMediaConfigRefs, collectConfigFieldRefs, collectWidgetConfigMedia (internal) | MOVE -> same file
  - extractEntryRefs | MOVE -> same file (shape: add `_optional: Record<string, never> = {}`)
  - MAX_HTML_PAGE_EMBED_REFS, MAX_HTML_EMBED_REF_ID_LENGTH, HTML_EMBED_TARGET_KINDS | MOVE
  - warnRejectedMarkers | MOVE, console.warn replaced by the injected `report`
  - extractHtmlEntryRefs | MOVE (Jini takes `optional.report`); Tovu keeps a same-named binding (STAY-WIRING) that passes console.warn
  - HtmlMarker, HtmlRefInput (types), collectHtmlGalleryRefs, collectHtmlSingleTargetRef | MOVE
  - EntryRefTargetKind (local alias added by DD) | MOVE (the Jini copy declares it from ./ports.js)
ports:
  - report?: (required: { message: string; sourceEntryId: UUID }) => void | Tovu binds `({ message, sourceEntryId }) => console.warn(message, { sourceEntryId })` in the reduced extractor.ts
      why: COMMON 7 (no console in Jini); the warning is the only signal that safe-delete's index is incomplete, so the Tovu binding keeps it on the server console exactly as today
shape_changes:
  - extractEntryRefs: (input) -> (input, _optional: Record<string, never> = {}) | callers unchanged (all pass one argument)
  - extractHtmlEntryRefs (Jini): (input, _optional: Record<string, never> = {}) -> (input, optional: { report?: EntryRefsReport } = {}) | Jini has no other caller; Tovu callers keep calling the Tovu binding, whose signature is unchanged
jini_code: |
  NEW packages/cms/src/widgets/entry-refs-extractor.ts = the Tovu extractor.ts (post-DD) byte for byte, then exactly these edits, in order:
  J1 'import { describeRejection, galleryMediaReferences, scanEmbedMarkers, type EmbedMarkerRejection } from "@jini-ai/cms/widgets/markers";'
     -> 'import { describeRejection, scanEmbedMarkers, type EmbedMarkerRejection } from "./markers/marker.js";\nimport { galleryMediaReferences } from "./markers/gallery.js";'
  J2 'import type { EntryRefRow } from "@jini-ai/cms/widgets";' -> 'import type { EntryRefRow } from "./ports.js";'   (the `type EntryRefTargetKind = EntryRefRow["targetKind"];` line DD added stays)
  J3 ' * entry-target references (REQ-31) — covers every v1 ref-typed field `Jini/packages/cms/src/widgets/registry.ts`' -> ' * entry-target references (REQ-31) — covers every v1 ref-typed field `registry.ts`'
  J4 ' * side effects. The caller (the entries write chokepoint composition in `Jini/packages/cms/src/widgets/write-service.ts`/' -> ' * side effects. The caller (the entries write chokepoint composition in `write-service.ts`/'
  J5 'export function extractEntryRefs(input: ExtractEntryRefsInput): readonly EntryRefRow[] {' -> 'export function extractEntryRefs(input: ExtractEntryRefsInput, _optional: Record<string, never> = {}): readonly EntryRefRow[] {'
  J6 "// written through `features/pages/html-document-store.sqlite.ts`'s `PagesHtmlDocumentStore`, a completely" -> "// written through the host's html page document store, a completely"
  J7 (2 occurrences, replace both) "`Jini/packages/cms/src/widgets/html/html-embeds.ts`'s" -> "`html/html-embeds.ts`'s"
  J8 ' * each hop; see `development/docs/architecture/embed-type-inventory.md`.' -> ' * each hop.'
  J9 ' * real `id` at WRITE time instead (`PagesHtmlDocumentStore.write()`, not this pass\'s scope). Until' -> ' * real `id` at WRITE time instead (the host page store\'s write, not this pass\'s scope). Until'
  J10 ' * rather than routine. Until it exists, this line is the only signal that an index is incomplete.\n */' -> ' * rather than routine. Until it exists, this report is the only signal that an index is incomplete;\n * the host decides where it goes (no `report`: nothing is reported).\n */\n/** Receives the UNINDEXED-reference warning of {@link extractHtmlEntryRefs}. */\nexport type EntryRefsReport = (required: { message: string; sourceEntryId: UUID }) => void;\n'
     (the doc block stays attached to warnRejectedMarkers: put the new type ABOVE that doc block instead if the anchor order reads wrong — i.e. final order is: EntryRefsReport doc + type, blank line, the original warnRejectedMarkers doc block with the J10 wording, the function)
  J11 the whole warnRejectedMarkers function (from 'function warnRejectedMarkers(rejected: readonly EmbedMarkerRejection[], sourceEntryId: UUID): void {' through its closing '}') ->
      function warnRejectedMarkers(rejected: readonly EmbedMarkerRejection[], sourceEntryId: UUID, report: EntryRefsReport | undefined): void {
        if (!report) return;
        for (const rejection of rejected) {
          report({
            message:
              `[entry-refs] extractHtmlEntryRefs: UNINDEXED reference — ${describeRejection({ rejection: rejection })}. ` +
              `Safe-delete cannot see it, so a target it references may be deleted as unused.`,
            sourceEntryId,
          });
        }
      }
  J12 '}, _optional: Record<string, never> = {}): readonly EntryRefRow[] {\n  const { markers, rejected } = scanEmbedMarkers({ html: input.html });\n  warnRejectedMarkers(rejected, input.sourceEntryId);'
      -> '}, optional: { report?: EntryRefsReport } = {}): readonly EntryRefRow[] {\n  const { markers, rejected } = scanEmbedMarkers({ html: input.html });\n  warnRejectedMarkers(rejected, input.sourceEntryId, optional.report);'
  Nothing else changes (names, order, every other why-comment incl. SPEC/REQ/ADR ids, which cms/widgets already carries).
  Jini ports.ts follow-up in the same Jini commit (exact, each once):
   - ' * Structural: the host owns extraction and persistence.' -> ' * `extractEntryRefs`/`extractHtmlEntryRefs` (`entry-refs-extractor.ts`) extract rows; the host persists them.'
   - '/** The one reference-index operation widgets performs; no extractor implementation is copied. */' -> '/** Persistence of the reference index; the host implements it (`InMemoryEntryRefsRepo` is the in-memory one). */'
jini_index: packages/cms/src/widgets/index.ts: after 'export * from "./entry-refs.memory.js";' (added by MV-entry-refs-1) insert 'export * from "./entry-refs-extractor.js";'
jini_guards:
  - packages/cms/src/widgets/entry-refs-extractor.ts must not exist
  - rg -n "extractEntryRefs|extractHtmlEntryRefs|EntryRefsReport|ExtractEntryRefsInput" packages/cms/src -> prints nothing
  - after J1-J12: rg -n "console\.|process\.env|@jini-ai/cms|Jini/packages|features/|development/|PagesHtmlDocumentStore" packages/cms/src/widgets/entry-refs-extractor.ts -> nothing; COMMON rule 2 rg -> nothing
tovu_reduced: |
  apps/website/src/contracts/core/entry-refs/extractor.ts: overwrite the whole file with exactly:
  /**
   * @file Tovu binding of `extractHtmlEntryRefs` (`@jini-ai/cms/widgets`): an UNINDEXED-reference warning goes to
   * the server console, where operators look for it. Html pages are written through
   * `features/pages/html-document-store.sqlite.ts`'s `PagesHtmlDocumentStore` (ADR-056 CIC-3), which calls this.
   * Forms definitions: safe-delete follows page -> widget -> form definition; see
   * `development/docs/architecture/embed-type-inventory.md`. `extractEntryRefs` is imported from Jini directly.
   */
  import type { UUID } from "@jini-ai/core/primitives";
  import { extractHtmlEntryRefs as extractJiniHtmlEntryRefs, type EntryRefRow } from "@jini-ai/cms/widgets";

  /** Same input and rows as Jini's; a rejected marker is warned on the console with its source entry id. */
  export function extractHtmlEntryRefs(input: {
    readonly workspaceId: UUID;
    readonly sourceEntryId: UUID;
    readonly html: string;
  }, _optional: Record<string, never> = {}): readonly EntryRefRow[] {
    return extractJiniHtmlEntryRefs(input, { report: ({ message, sourceEntryId }) => console.warn(message, { sourceEntryId }) });
  }
binding_edits: - (no composition file changes: html callers keep importing the Tovu binding)
importer_edits (extractEntryRefs only; quote style kept):
  - apps/website/src/features/publish-content/content-references.ts: 'import { extractEntryRefs } from "#src/contracts/core/entry-refs/extractor";' -> 'import { extractEntryRefs } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/widgets/deps.ts (text-guarded, C3): 'import { extractEntryRefs } from "../../contracts/core/entry-refs/extractor.js";' -> 'import { extractEntryRefs } from "@jini-ai/cms/widgets";'
  - apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts: "import { extractEntryRefs } from '#src/contracts/core/entry-refs/extractor';" -> "import { extractEntryRefs } from '@jini-ai/cms/widgets';"
  - apps/website/src/features/widgets/__tests__/integration/gallery-widget.integration.test.ts: "import { extractEntryRefs } from '#src/contracts/core/entry-refs/extractor';" -> "import { extractEntryRefs } from '@jini-ai/cms/widgets';"
  - apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts: "import { extractEntryRefs, extractHtmlEntryRefs } from '#src/contracts/core/entry-refs/extractor';" -> "import { extractEntryRefs } from '@jini-ai/cms/widgets';\nimport { extractHtmlEntryRefs } from '#src/contracts/core/entry-refs/extractor';"
  - apps/website/src/contracts/core/entry-refs/__tests__/extractor-l079.test.ts: "import { extractEntryRefs, extractHtmlEntryRefs } from '../extractor.js';" -> "import { extractEntryRefs } from '@jini-ai/cms/widgets';\nimport { extractHtmlEntryRefs } from '../extractor.js';"
  - apps/website/src/contracts/core/entry-refs/__tests__/form-reference-chain.unit.test.ts: 'import { extractEntryRefs, extractHtmlEntryRefs } from "../extractor.js";' -> 'import { extractEntryRefs } from "@jini-ai/cms/widgets";\nimport { extractHtmlEntryRefs } from "../extractor.js";'
  - apps/website/src/contracts/core/entry-refs/__tests__/extractor-marker.canary.test.ts: same old -> new as the line above
  - apps/website/src/contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts: 'import { extractEntryRefs, extractHtmlEntryRefs } from "../../extractor.js";' -> 'import { extractEntryRefs } from "@jini-ai/cms/widgets";\nimport { extractHtmlEntryRefs } from "../../extractor.js";'
  unchanged (import only extractHtmlEntryRefs, the Tovu binding): features/pages/html-document-store.ts:11, html-document-store.memory.ts:12, features/widgets/__tests__/integration/gallery.integration.test.ts:9, contracts/core/entry-refs/__tests__/integration/html-entry-refs-consistency.integration.test.ts:5, development/scripts/migrate-page-embed-markers.ts:59
tests_split:
  - every test stays in Tovu with only the import edits above (they call extractEntryRefs on Jini and extractHtmlEntryRefs through the binding; extractor-marker.canary.test.ts captures console.warn and asserts /UNINDEXED/ — the binding prints the identical string with the identical second argument). No Jini test file in this slice; owed later: a vitest twin of the canary that passes `report` (not here, so this slice stays a pure move).
changeset: .changeset/cms-entry-refs-extractor.md: '---\n"@jini-ai/cms": minor\n---\n\nAdd `extractEntryRefs` and `extractHtmlEntryRefs` (with an optional `report` for unindexed markers) to `@jini-ai/cms/widgets`.\n'
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/contracts/core/entry-refs/extractor.ts -> before exactly the 14 hits listed in importer_edits + unchanged; after: only the 5 unchanged lines + the 5 split `extractHtmlEntryRefs` lines.
jini_msg: "feat(cms): entry-refs extractors in widgets, with an injected report for unindexed markers" | tovu_msg: "refactor(entry-refs): extractors from @jini-ai/cms/widgets; Tovu binds the console warning" | body "Rows and the warning text are unchanged; Tovu keeps the html binding that prints it."
extra_stops: a moved function would exceed 50 lines or complexity 10 after J11/J12 (it should not: J11 adds one `if`): STOP. `rg -n "export (function|const|interface|type) " <extractor.ts post-DD>` prints a name not in `split`: SKIP.
```
Expected cloud run: Jini cms typecheck + `check-subpath-isolation` + gates; Tovu typecheck; entry-refs tests (5 files), widgets/media/pages/forms tests listed in the MV census, `entry-refs-repo.dialects.test.ts`. No RED test (no behaviour change; the warning text and destination are unchanged).
est_executor_tokens: DD ~40k, MV ~45k, SP ~60k (Sonnet) + ~15k Opus review of SP.
