# Onlook Recon — Source-Mapping, Edit Model, and the `@jini-ai/vibecoding` Contract

**Date:** 2026-08-03
**Target:** `/Users/la/Programming/OSS-Repos/onlook` (freshly cloned, 128M, 1695 files excl. node_modules/.git)
**Scope:** recon only, no source modified, no new clones beyond what was already present.
**Indexes built this session:** Codebase Memory MCP (`mode: moderate`, project `Users-la-Programming-OSS-Repos-onlook`, 9,604 nodes / 22,806 edges); Graphify (`graphify update onlook`, 7,847 nodes / 14,739 edges / 570 communities, `graphify-out/` in the target repo). Both used for orientation; every load-bearing claim below is verified against real source with `file:line`, not taken from graph output alone.

**Status: COMPLETE.**

---

## Verdict (leads with Q1, then D-REV-4)

**Q1 answer:** Onlook maps a rendered DOM element back to source neither via a Babel/SWC build-plugin injecting metadata into compiled output, nor via React fiber introspection. It uses a **persistent, source-level JSX attribute**: a stable `data-oid` string is written directly into the actual `.tsx`/`.jsx` source files themselves (via a Babel AST transform, `addOidsToAst`, `packages/parser/src/ids.ts:127-180`) as a real, permanent, committed-to-git attribute on every JSX opening element. Because it's an ordinary JSX attribute, React renders it straight through to the live DOM node with zero extra machinery — a preload script running inside the preview iframe reads it back with a plain `node.getAttribute('data-oid')` (`apps/web/preload/script/helpers/ids.ts:15-17`). A second, session-only DOM attribute (`data-onlook-dom-id`, assigned lazily per rendered instance, not source-persisted) disambiguates multiple DOM copies of one source element — e.g. inside a `.map()` loop. Separately, an index file maps each `oid` to its file path, exact line/column range, enclosing component name, and literal source text (`packages/file-system/src/code-fs.ts:97-126`, `packages/parser/src/template-node/map.ts:164-208`).

**Does this change D-REV-4?** **Partially, and the shape of the change matters more than a yes/no.** Onlook genuinely does *not* have GrapesJS's specific failure mode — it never parses HTML into a constrained generic component tree that silently drops anything outside its vocabulary (D-2's core worry). It uses the file's own real language grammar (Babel's full TS+JSX AST), so nothing is silently discarded. But it is **not** "edits source, leaves everything else untouched" either: **every single file write, including ones that only add a missing `data-oid`, re-parses the whole file, mutates the AST, regenerates the whole file's code via `@babel/generator`, and re-formats the whole file with Prettier** (`packages/file-system/src/code-fs.ts:62-83`, read and traced in full). Untouched *code* is preserved at the AST/semantic level with high fidelity (Babel's own grammar, `retainLines`, comments, original-content hint), but untouched *formatting* is not guaranteed byte-identical — it gets re-run through Prettier every time. So: D-REV-4's underlying concern (silent structural data loss) genuinely does not apply to Onlook's approach; a narrower, milder version of it does (cosmetic reformatting churn on every touch, plus a permanent new attribute injected into every element of every JSX file the tool ever touches). Recommend treating this as new, real evidence that a real-language-AST-plus-formatter approach is a legitimate third option beside "keep the current two-action model" and "adopt GrapesJS" — worth its own follow-up spike, not an immediate reversal.

---

## The Source-Mapping Mechanism (Q1, full detail)

Traced end to end, `packages/parser/src/ids.ts` (`addOidsToAst`, read in full) and `packages/file-system/src/code-fs.ts` (`CodeFileSystem`, read in full):

1. **`CodeFileSystem.writeFile` is the one chokepoint every JSX/TSX write passes through** (`code-fs.ts:46-53`) — it overrides the base `FileSystem.writeFile` and, for any `.jsx?|tsx?` path, routes through `processJsxFile` before ever calling the real underlying write.
2. **`processJsxFile`** (`code-fs.ts:62-83`): parses the file into a Babel AST (`getAstFromContent`, real `@babel/standalone` parser with `typescript`+`jsx`+`decorators`+`classStaticBlock`+`dynamicImport`+`importMeta` plugins — `packages/parser/src/parse.ts:7-24`); if the file is the app's root layout, injects a `<script>` for the preview-side bridge (`injectPreloadScript`, `code-edit/layout.ts:6`, not traced further this pass); calls `addOidsToAst(ast, existingOids)` to ensure every JSX opening element carries a `data-oid` attribute, reusing IDs already recorded for that file and only minting new ones for elements that lack one; regenerates the whole file's source via `getContentFromAst` (`@babel/generator`, `parse.ts:47-62`, `retainLines: true`, `compact: false`, comments preserved, given the original content as a formatting hint); then runs the result through `formatContent` (Prettier, `packages/parser/src/prettier/index.ts`, not read in depth — name and call site confirm it, content not verified).
3. **`addOidsToAst`** (`ids.ts:127-180`): walks every `JSXOpeningElement` (skipping React fragments). An element with zero existing `data-oid` gets a fresh one (`createOid()`, not traced — presumed nanoid-family per the DOM-side `nanoid/non-secure` import elsewhere). An element with exactly one valid, non-conflicting oid keeps it. An element with a duplicate oid (already used elsewhere in this AST, or claimed by a *different* branch elsewhere in the project — `branchOidMap`) or multiple/invalid oid attributes gets all its oid attributes stripped and a single fresh one assigned. **This means the oid is not a hash of content or position — it's an arbitrary, stable, mutation-surviving identity minted once and preserved thereafter**, exactly the "stable per-region ID" property Tovu's own D-5 wants from `data-tovu-id`.
4. **The index** (`code-fs.ts:97-126`, `updateMetadataForFile`): after every write, the (now-formatted) file is re-parsed and walked again by `createTemplateNodeMap` (`packages/parser/src/template-node/map.ts:12-121`), which builds `Map<oid, TemplateNode>` — for every oid-bearing JSX element, records its enclosing component name (via a name stack pushed/popped across `FunctionDeclaration`/`ClassDeclaration`/`VariableDeclaration`), whether it sits inside a dynamic construct (`.map()`, a conditional, or a `&&`/`||` — `DynamicType`, `map.ts:123-144`), whether it's a "core" element (a component's root return value, or a literal `<body>` tag — `map.ts:146-162`), and its Babel-node source range. `getContentFromTemplateNode` (`map.ts:164-208`) then extracts the **exact source substring for that one element** by slicing the *original file text* by that range's line/column — not by reprinting the AST — so a *read* of one element's current code is a literal, formatting-exact string slice, even though a *write* to any element in that file regenerates the whole file.
5. **DOM side** (`apps/web/preload/script/helpers/{ids,dom}.ts`): the preload script reads `data-oid` straight off a real DOM node (`node.getAttribute('data-oid')`) and, separately, lazily stamps a session-only `data-onlook-dom-id` (`odid-<nanoid>`) the first time it needs to disambiguate one of several rendered instances of the same source element. `getHtmlElement(domId)` resolves back to a live node via `document.querySelector('[data-onlook-dom-id="..."]')` — a plain CSS attribute selector, not a fiber walk.

**Not verified this pass:** the exact contents of `createOid()`, `formatContent`/Prettier config, and `injectPreloadScript`'s actual script contents (what the bridge protocol between iframe and host app looks like beyond attribute reads) — flagged, not guessed at.

---

## Edit Model — Source vs. Reserialize (Q2)

**Definitive answer: parses and reserializes, but at the file level using the file's own real language grammar, and it does this on every write, not only on AI-driven "big" edits.**

- **Granularity of a write: whole file, always.** There is no code path found that patches only a byte range or only one AST node's printed text back into an otherwise-untouched file string. Every `writeFile` call for a JSX/TSX path re-parses the complete file, mutates the AST (oid injection at minimum; whatever edit operation was requested, layered on top — see `code-edit/*` below), regenerates the complete file via `@babel/generator`, and reformats the complete file via Prettier (`code-fs.ts:62-83`, cited above).
- **Granularity of a read is different and finer: an AST-node's exact source range.** `getContentFromTemplateNode` (`template-node/map.ts:164-208`) slices the *original* file text by the element's recorded `startTag`/`endTag` line:column range — confirmed by direct read, this is string slicing, not reprinting, so reading one element's current code returns exactly what's on disk for that byte range, no reformatting involved.
- **Does an edit preserve untouched formatting exactly? No, not byte-for-byte, and this is a real, evidenced qualification worth being precise about.** `getContentFromAst` is called with `retainLines: true`, `compact: false`, `comments: true`, and the *original* file content passed as a third argument (`parse.ts:47-62`) — all of which are known Babel-generator techniques to *minimize* diff noise relative to naive reprinting, but none of which guarantee byte-identical output for code the AST mutation didn't semantically touch. The write path's final step, unconditionally, is a full Prettier pass over the whole file (`formatContent`, `code-fs.ts:79`) — meaning even a file that was never touched by an AI edit, the moment it's merely *opened and re-saved* through this filesystem layer (e.g. purely to inject a missing oid), gets its whole-file formatting normalized to the project's Prettier config. This is a real, mechanical, unconditional step, not a hypothesis.
- **The actual JSX/AST edit operations** live in `packages/parser/src/code-edit/`: `text.ts` (`updateNodeTextContent` — read in full, mutates `JSXElement.children` in place, handling multi-line text via inserted `<br/>` nodes), plus `style.ts`, `insert.ts`, `remove.ts`, `move.ts`, `group.ts`, `layout.ts`, `transform.ts`, `image.ts`, `next-config.ts` (named but not all read in depth this pass — the pattern established by `text.ts` is "pure function mutates an in-memory Babel AST node"; none of them do their own file I/O, confirming `CodeFileSystem` is the single real chokepoint for all of them).

**Consequence for the D-REV-4 question, precisely stated:** GrapesJS's failure mode was *silent, structural, irrecoverable data loss* — content outside its node vocabulary vanishes with no error. Onlook's failure mode, if it has one, is *cosmetic, whole-file reformatting noise* — nothing is silently dropped (Babel's grammar covers the full language; nothing gets thrown away the way an HTML-tree-only editor would discard a `<script>` tag or an attribute it doesn't recognize), but a developer's exact original whitespace/line-wrapping choices in a file Onlook ever writes to are not guaranteed to survive untouched. These are meaningfully different classes of risk, and the second is far more tolerable for a tool whose whole premise is AI-generated/AI-mediated content in the first place.

---

## Element Addressing vs. `data-agent-*` (Q3)

Read `Jini/packages/agentic/src/element-handles.ts` in full for this comparison (not previously covered in the vibecoding decision log).

### They solve different problems and are not substitutes for each other

**`data-agent-*` (Jini) is a runtime interaction contract for an already-deployed, already-rendered page.** A page author publishes stable handles (`data-agent-element="submit-button"`) for the affordances an agent may act on — click, fill, read state — over a live, running application. It carries no source-mapping information at all: no file path, no line/column, no AST correlation. `resolveHandleSelector` (`element-handles.ts:60-68`) can only ever build exactly one selector shape, `[data-agent-element="<validated-handle>"]`, from a handle the caller does not invent — it must be one the page already published. The security property is explicit in the module doc: *"a caller names a handle the page already published; it never supplies a selector."* Handles are validated against a narrow allowlist regex (`HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`, max 128 chars, `element-handles.ts:38-41`) specifically so a handle "cannot break out of the attribute selector it is interpolated into" — an invalid handle throws (`resolveHandleSelector:61-66`), it never silently falls back to treating the string as a raw selector. It also carries rich runtime *state* (`AgentElementState`: text/value/checked/disabled/visible/options, with explicit "withheld" reasons for redacted fields) — a live interaction/observation contract, not an edit-time one.

**`data-oid` (Onlook) is a source-mapping contract for an editor, not an interaction contract for an agent.** It answers "which JSX source produced this rendered node," not "what may an agent do to this node." It carries no role/state vocabulary at all — no notion of "this is a button," no notion of "this field's current value," because that's not the job it does. Nothing about it validates or bounds the identifier before use *in every call site*: `getDomIdSelector(domId, escape=false)` (`apps/web/preload/script/helpers/dom.ts:7-13`) builds a template-literal attribute selector from `domId` and only escapes it via `CSS.escape` **if the caller explicitly opts in** (`escape` defaults to `false`) — there is no allowlist regex anywhere in the oid/domId code paths comparable to Jini's `HANDLE_PATTERN`, and no throw-on-invalid path. In practice this is likely low-risk because oids/domIds are minted by Onlook's own code (`createOid()`, `nanoid`), not attacker-controlled input reaching the selector — but it is a **structurally weaker guarantee** than Jini's: Jini makes an unsafe selector unconstructable by validating before use every time; Onlook makes safe construction *available* (`CSS.escape`) but not the default, and correctness depends on every caller remembering to opt in.

### The comparison that matters for `@jini-ai/vibecoding`

These are two different axes a real vibecoding-capable page will likely need **both** of, not a choice between them: `data-agent-*`-shaped addressing for "what can be interacted with, and what is its current state" (an agent operating a live page), and `data-oid`-shaped addressing for "what source produced this, so an edit can be applied and later reversed" (an agent/tool editing a page's definition). Tovu's own `data-tovu-id` (D-5) is closer in *purpose* to Onlook's `data-oid` — it exists to target a region for `replace`, not to describe an interactive affordance's live state — but it should borrow Jini's *validation discipline* (allowlist regex, throw-before-use, never an optional escape parameter) rather than Onlook's (a mintable-by-us-so-probably-fine identifier with an opt-in escape). Concretely: `data-tovu-id` values should be validated the same way `isValidElementHandle` validates a handle, before ever being interpolated into a selector or written back into markup, not merely escaped on request.

---

## Apply Tier and Undo/Snapshot Tier (Q4)

### The apply tier: a real discriminated `Action` union, richer than either bolt.diy or open-lovable's grammar

`packages/models/src/actions/action.ts` (read in full) defines `Action` as a 10-variant tagged union: `update-style`, `insert-element`, `remove-element`, `move-element`, `edit-text`, `group-elements`, `ungroup-elements`, `write-code`, `insert-image`, `remove-image`. Every variant addresses its target(s) via `ActionTarget[]` (carrying `domId`/`oid`, not read in full this pass), not a raw selector or a whole-file path. Two properties stand out relative to bolt.diy's single `file` action type and open-lovable's single `<file>` tag:

- **The action model is semantic, not textual.** `insert-element`/`remove-element` carry a full `ActionElement` (tag name, attributes, styles, text content, children — a real element description) plus an `ActionLocation` (where to insert/remove relative to siblings), not a snippet of source text to splice in. `update-style` carries `StyleActionTarget[]` (a set of CSS property changes), not a full replacement of anything. This means Onlook's model already has a real answer to the "region-scoped edit that isn't a whole-document/whole-file replace" problem D-6 is solving for Tovu from scratch — worth studying `ActionTarget`/`ActionLocation`/`StyleActionTarget` in a follow-up pass before finalizing Tovu's own edit-region action shape.
- **`edit-text` is explicitly diff-shaped and self-reversible**: `EditTextAction` carries both `originalContent` and `newContent` (`action.ts:54-59`) — the action itself is enough to invert without consulting any external snapshot.

### The AI-facing write path uses the same "Fast Apply" pattern the prior open-lovable report flagged — independently chosen, twice

`packages/ai/src/apply/client.ts` (read in full, 135 lines): the primary LLM emits an instruction + a small update snippet; a **separate, specialized model** merges it into the full original code — exactly open-lovable's Morph pattern, except Onlook wires **two** interchangeable providers, `FastApplyProvider.MORPH` (`applyCodeChangeWithMorph`, `api.morphllm.com`, model `morph-v3-large`) and `FastApplyProvider.RELACE` (`applyCodeChangeWithRelace`, `instantapply.endpoint.relace.run`), both taking the identical `(originalCode, updateSnippet, instruction)` shape. This is independent, converging evidence (two unrelated OSS projects both reaching for a specialized third-party "apply" model rather than trusting the primary model to do a clean surgical edit itself) that the Fast Apply pattern is a real, validated industry technique, not an open-lovable idiosyncrasy — strengthens the prior report's TAKE #4 recommendation rather than adding anything new to the contract question. Did not verify whether Onlook has a full-file-regeneration fallback when neither `MORPH_API_KEY` nor `RELACE_API_KEY` is set (open-lovable's equivalent silently degrades, per the prior report) — flagged unverified.

### The undo tier is genuinely two separate mechanisms, not one — this is the most important new structural finding for the contract

**Tier 1 — an in-memory command-pattern undo/redo stack over `Action`, for visual-editor interactions.** `apps/web/client/src/components/store/editor/history/index.ts` (`HistoryManager`, read in full): a classic `undoStack`/`redoStack` of `Action` objects, with explicit **transaction batching** (`startTransaction`/`commitTransaction`, so a drag gesture or a multi-field style edit collapses into one undo step) and real **redo**, not just rewind-forward-through-history. `undo()` pops the stack and calls `undoAction(action)` (in `history/helpers.ts`, not read this pass — presumed to invert each action variant, trivial for `edit-text` given it already carries `originalContent`); `push()` calls `this.editorEngine.code.write(action)` to actually apply the action (into the AST/file, per Q2) before it's recorded. **bolt.diy has no equivalent at all** — it has forward-in-time rewind-to-a-prior-chat-message, and no true redo, and nothing at the single-interaction grain (an in-place style tweak in bolt.diy isn't a separately undoable step; the whole file gets rewritten and the only rollback is the whole-turn snapshot).

**Tier 2 — git-commit-per-checkpoint, for chat/AI-turn-level recovery.** `MessageCheckpointType.GIT` (`packages/models/src/chat/message/checkpoint.ts`, read in full): a `GitMessageCheckpoint` is just `{oid: <git commit sha>, branchId}`. `packages/git/src/git.ts` (read for its exported surface) is a real git wrapper: `init`/`add`/`addAll`/`commit`/`checkout`/`branch`/`log`/`getCommits`/`getCurrentCommit`/`getCurrentBranch`. `restoreCheckpoint` (`apps/web/client/src/components/store/editor/git/utils.ts`, read in full) is the actual rewind operation, and it is **non-destructive by construction**: before restoring, it first creates a *new* "backup" commit of whatever the current state is (`BACKUP_COMMIT_MESSAGE = 'Save before restoring backup'`), **then** checks out the target commit (`gitManager.restoreToCommit(checkpoint.oid)`) — so rewinding never loses work, it just adds another commit and moves the working tree, matching the sequenced pattern `git checkout` on a clean repo would give you. It is explicitly branch-aware (falls back to the active branch for legacy checkpoints missing a `branchId`; a `multi-branch-revert-modal.tsx` component exists, not read this pass, implying restore can need to reconcile more than one branch at once).

**Why the two-tier split matters for the contract, precisely:** the git-based tier is real, working, and *more filesystem-coupled than bolt.diy's own snapshot mechanism, not less* — a git commit is fundamentally a tree of blobs, so this checkpoint model generalizes *worse* to a non-file-tree "parts" model (a `data-tovu-id`-tagged region) than bolt.diy's plain `Record<path, content>` snapshot type does, unless a document-region host is willing to fake a shadow git repo purely for undo bookkeeping — a real, avoidable complexity cost. The in-memory `Action`-stack tier, by contrast, generalizes cleanly: nothing about `HistoryManager` depends on git, files, or a sandbox VM — it is push/pop over self-describing, individually-invertible action objects, and would work identically over `replace(id, content)` calls against document regions. **This reinforces the four-verb contract's `snapshot-all` as the right *coarse* safety net (matching bolt.diy's own design, not Onlook's git-coupled one), while suggesting a genuinely new, additive idea neither prior report surfaced: a thin, in-memory undo/redo stack over individual `replace` calls, sitting above `snapshot-all` rather than replacing it** — giving Tovu real redo and per-edit undo granularity (undo just the last region edit, not the whole turn) essentially for free, since `replace` calls are already self-describing (old content is knowable before the call, new content is the call's own argument).

---

## What to Lift / What to Skip (Q5)

**Lift:**
1. **The `Action`-stack undo/redo pattern (`HistoryManager`), as a genuinely new addition to the `@jini-ai/vibecoding` contract discussion** — not covered by bolt.diy or open-lovable, and it composes cleanly with the accepted four-verb contract: a thin command stack over `replace` calls, independent of `snapshot-all`, giving per-edit undo/redo without any file-tree or git coupling. Port difficulty: low — the pattern is transport/storage-agnostic; only the specific `undoAction`/`transformRedoAction` inversion rules (not read this pass) are action-type-specific and would need Tovu-side equivalents for whatever action types Tovu ends up with.
2. **The two-tier undo split itself as a design principle**, even where Tovu doesn't literally copy Onlook's mechanisms: fine-grained, immediately-reversible per-edit undo for interactive/visual edits, plus a coarser, less-frequent full-snapshot safety net for AI-turn-level recovery — these are different frequencies and different failure modes (a bad drag vs. a bad AI generation) and probably deserve different mechanisms, not one snapshot system stretched to cover both.
3. **The oid-stability discipline in `addOidsToAst`** (reuse an existing ID if valid and non-conflicting; only mint new IDs for what's missing; detect and repair duplicate/invalid IDs rather than silently living with them) — directly reusable guidance for whatever assigns/maintains `data-tovu-id`s across regenerations of a Tovu page.
4. **The `EditTextAction`-style self-describing reversible action shape** (carry `originalContent` alongside `newContent`) as the concrete shape for a Tovu `edit-region` action's own undo support, independent of any whole-document snapshot.

**Skip — deliberately, with reasons:**
1. **The whole-file Babel-parse/mutate/regenerate/Prettier-reformat pipeline itself.** It's a legitimate, well-evidenced *approach* for a multi-file React app builder where "the source" already means "a tree of `.tsx` files," but Tovu's Pages are one HTML+CSS document with no JS toolchain, no Babel-parseable JSX, and (per D-2) an explicit design decision to keep AI-generated HTML raw rather than round-tripping it through any framework's component model. Nothing here transfers as *code*; only the *shape of the lesson* (real-language-grammar parse/mutate/print beats generic-tree reserialization) transfers, and Tovu doesn't have an equivalent "real grammar" advantage available the way a JS/TSX-based tool does — HTML's own grammar is exactly what GrapesJS already uses, which is what D-REV-4 was weighing in the first place.
2. **The git-commit-per-checkpoint mechanism.** Real, working, well-designed for a project that's already a file tree Onlook is willing to `git init` — but adopting it for Tovu would mean introducing a git dependency and a shadow-repo-per-page (or per-site) purely for undo bookkeeping, which is more machinery than a `Record<data-tovu-id, string>` snapshot needs. Skip the mechanism; the "always commit-forward before restoring, never destructively discard" *principle* is worth keeping regardless of storage engine.
3. **The Morph/Relace Fast Apply dependency itself** (as opposed to the pattern) — same reasoning as the prior open-lovable report's TAKE #4: worth prototyping with a second call to the *same* LLM before taking an external paid-API dependency.
4. **`data-agent-*`-vs-`data-oid` conflation** — do not merge these into one attribute/convention. They answer different questions (interact vs. edit-target) and Tovu will plausibly want both eventually (an agent operating a *published* Tovu page's live affordances, separately from an editor targeting a page's *source* region) — keep them as two conventions, not one overloaded one.

---

## What It Gets Wrong (Q6)

1. **Every JSX/TSX file Onlook ever writes through gets permanently mutated with `data-oid` attributes on every element, and every write reformats the whole file via Prettier — both are unconditional, not opt-in.** This is a real, concrete product tradeoff visible directly in the write pipeline (`code-fs.ts:62-83`): a developer who opens their own hand-written component in an Onlook-managed project will find it permanently carries new, tool-specific attributes on every element the first time *anything* in that file is saved through this layer, and any formatting style that differs from the project's Prettier config gets silently normalized at the same time. Neither is hidden or subtle in the code — both are simply unconditional side effects of the one `writeFile` chokepoint, worth flagging as a real cost of the approach rather than a bug, but one to design around deliberately if Tovu ever considers something similar for a "raw HTML" editing surface (D-12) where an operator's own hand-written markup might pass through the same pipeline as AI-generated markup.
2. **Selector construction from an oid/domId defaults to unescaped** (`getDomIdSelector(domId, escape=false)`, `dom.ts:7-13`) — a real, if likely low-severity-in-practice, structural weakness relative to Jini's validate-or-throw pattern (Q3). Nothing found forces a caller to opt into `CSS.escape`; a future code path that ever derives a domId/oid from anything other than Onlook's own `nanoid`/`createOid()` generators (e.g. if oids were ever accepted from an imported/pasted document, or from a third-party plugin) would inherit this gap silently.
3. **The two undo tiers are not visibly reconciled with each other in what was read this pass** — `HistoryManager`'s per-action undo stack and the git-based checkpoint system both exist, but nothing traced this session shows them coordinating (e.g., does undoing past a git checkpoint's boundary make sense? does a git restore clear or invalidate the in-memory undo stack, which would now reference actions that no longer describe the restored file state?). Flagged as a real open question about the actual codebase, not a confirmed bug — I did not trace far enough (e.g. `history/helpers.ts`, the chat-turn-to-checkpoint wiring) to confirm either a real inconsistency or a real reconciliation exists. Worth a targeted follow-up before assuming the two-tier idea (Q5 lift #2) is risk-free to adopt wholesale; Tovu's own version should decide this interaction deliberately rather than discover it as a bug later, the way this recon could not fully rule out here.

---

## Confidence and What I Could Not Verify

**High confidence (read directly, quoted or closely paraphrased above):** the `CodeFileSystem.writeFile`/`processJsxFile` chokepoint and its whole-file parse/mutate/regenerate/format pipeline; `addOidsToAst`'s ID-stability logic; `createTemplateNodeMap`/`getContentFromTemplateNode`'s line:column-range string-slice read mechanism; the DOM-side `data-oid`/`data-onlook-dom-id` read/assign functions; the `Action` discriminated union; `HistoryManager`'s undo/redo stack; the git-wrapper's exported surface and `restoreCheckpoint`'s commit-before-restore sequencing; the Fast Apply client's two-provider shape; `data-agent-*`'s validation and selector-construction code in Jini.

**Medium confidence:**
- `createOid()`'s actual implementation was not read (only its call sites and the DOM-side `nanoid/non-secure` sibling import) — assumed to be a nanoid-family generator, not confirmed.
- `formatContent`/`packages/parser/src/prettier/index.ts` was not read — confirmed to be called at the right point in the pipeline by name and import, but its actual Prettier configuration/behavior is not verified.
- `injectPreloadScript`'s actual injected script contents, and the full iframe↔host bridge protocol beyond the plain attribute reads shown, were not read — the *existence* and *call site* of the preload-script injection is confirmed, its full contents are not.
- `undoAction`/`transformRedoAction` (the actual per-action-type inversion logic in `history/helpers.ts`) were not read — their existence and call sites are confirmed, their correctness/completeness per action type is not.

**Not sampled / explicitly out of scope this pass:**
- `packages/code-provider` (135 nodes per the graph) — the sandbox/dev-environment abstraction, analogous to bolt.diy's WebContainer or open-lovable's E2B/Vercel providers — not traced, since neither prior report's LEAVE list nor this task's questions asked for it, and Tovu has no sandbox-execution need per the decision log.
- `packages/models/src/actions/target.ts` and `location.ts` (the precise shape of `ActionTarget`/`ActionLocation`) — named and referenced above but not read in full; a real follow-up before designing Tovu's own region-edit action shape should read these.
- Onlook's actual chat/tool-calling wiring in `apps/web/client/src/app/api/chat/route.ts` and `packages/ai/src/agents` — not traced; this recon focused on the apply/undo/addressing tiers per the task brief, not the generation-loop/prompt architecture already well-covered for bolt.diy/open-lovable by the prior reports.
- Whether Onlook has a full-file-regeneration fallback when no Fast Apply provider key is configured — not verified either way.

No additional repository clone was needed; everything traced was already present in `/Users/la/Programming/OSS-Repos/onlook` and `/Users/la/Programming/Jini`.

---

## Apply Tier and Undo/Snapshot Tier (Q4)

*(in progress)*

---

## What to Lift / What to Skip (Q5)

*(in progress)*

---

## What It Gets Wrong (Q6)

*(in progress)*

---

## Confidence and What I Could Not Verify

*(the analyst's own confidence section was not completed before it went idle — the coordinator
verification below covers the load-bearing claims instead)*

---

## Coordinator verification pass — 2026-08-03

### CONFIRMED, and stronger than reported — every JSX write is regenerated and reformatted

`packages/file-system/src/code-fs.ts:46-83` reads exactly as described. `writeFile` routes any JSX
file through `processJsxFile`, which parses to an AST, injects oids, regenerates via
`getContentFromAst`, and then calls `formatContent`.

**One detail the report understates.** When parsing *fails*, the `else` branch logs
`"Failed to parse ${path}, skipping OID injection but will still format"` — and control still falls
through to `formatContent`. So even an unparseable file gets reformatted on write. The
"semantic fidelity, not byte fidelity" conclusion is therefore firmer than stated: there is no path
through this chokepoint that preserves an author's original bytes.

### CONFIRMED — the selector-escaping weakness, and Jini's design is genuinely stronger

`apps/web/preload/script/helpers/dom.ts:7-13`: `getDomIdSelector(domId, escape = false)`
interpolates `domId` straight into `[data-onlook-dom-id="${domId}"]` and returns it unescaped by
default; escaping is opt-in.

Contrast `Jini/packages/agentic/src/element-handles.ts`, where `resolveHandleSelector` **throws** on
an invalid handle and explicitly never falls back to treating input as a raw selector, over a
character class narrow enough that a handle cannot contain a quote, bracket, backslash or
whitespace. Onlook's exposure is probably low in practice because oids are self-generated rather
than caller-supplied — but "the input happens to be trustworthy today" is a weaker property than
"the function cannot emit an unsafe selector." **Keep Jini's discipline.**

### Verdict on D-REV-4 — accepted as written, no reversal

The report's framing is right and the nuance is the point: Onlook avoids GrapesJS's *silent data
loss* (a full TS+JSX grammar drops nothing outside a fixed vocabulary), but it is not
byte-preserving either. The risk class moves from **severe** (silent loss) to **mild** (cosmetic
reformatting churn, plus a permanent `data-oid` attribute on every element).

Recorded as a **third option** — "real-language AST + real formatter" — worth a spike, not an
immediate reversal of D-6's two-action model.

### The most valuable find — two undo tiers, and only one of them generalizes

Onlook has an in-memory command-pattern `HistoryManager` with **real undo *and* redo** plus
transaction batching, over a 10-variant `Action` union — bolt.diy has nothing comparable, and no
redo at all. Separately it keeps git-commit checkpoints (`MessageCheckpointType.GIT`), which always
commit current state before restoring, so restore is never destructive.

The git tier is *more* file-tree-coupled than bolt.diy's snapshot and generalizes worse to a
document-region host. The in-memory tier generalizes cleanly.

**Design implication for `@jini-ai/vibecoding`, accepted:** layer a thin operation-level undo/redo
stack over individual `replace` calls, **on top of — not instead of —** the accepted `snapshot-all`.
The two answer different questions: `snapshot`/`restore` is coarse per-turn rewind; an operation
stack is fine-grained within a turn, and is what makes redo possible at all. The stack needs only
`readPart` before each replace to record a before/after pair, so it stays target-agnostic and adds
no verb to `EditTarget`.

Also worth borrowing: the never-destructive-restore property. Capturing current state before
restoring means a rewind can itself be undone.
