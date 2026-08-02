# Pages Vibecoding — Locked Decisions & Evidence

**Date:** 2026-08-01
**Stage:** pre-spec (M0 problem framing complete, M1 not started)
**Owner:** Coordinator (Review Mode), with CodeBase Analyzer recon
**Feature:** Posts stay formulaic; Pages become AI-generated bespoke HTML+CSS with live editing.

## Provenance

Two recon reports, both built on Codebase Memory MCP + Graphify indexes, all claims `file:line` cited:

- `ADS-memory/reports/recon/bolt-diy-analysis.md` — bolt.diy (Bolt.new clone), incl. "Addendum: prevention vs. reversal"
- `ADS-memory/reports/recon/open-lovable-analysis.md` — open-lovable (Lovable clone)

Human input: bolt.diy judged noticeably better than open-lovable in hands-on use. The recon found structural reasons for that (D-REV-2, T-3).

Cross-CMS storage precedent checked directly in source, not from memory:
- WordPress: one `wp_posts` table, `post_type varchar(20) default 'post'` (`schema.php:180`), body in `post_content longtext` (`schema.php:164`).
- Ghost: one `posts` table, `type` constrained to `'post' | 'page'`; body columns `mobiledoc` (legacy) + `lexical` (current) + `html` (rendered cache) + `plaintext` (derived), all co-resident.

---

## Locked decisions

### D-1 — Posts stay structured-only; no HTML escape hatch
Posts remain Tiptap/ProseMirror JSON in `posts.body_json`. No raw-HTML editing path.

**Why:** keeps posts queryable, FTS-indexable, summarizable, and safely AI-editable through the existing structured tools. An escape hatch would reintroduce the lossy-conversion trap (D-2 rationale) into the one content type that doesn't need it.

### D-2 — Pages get a SECOND body format; additive column, never a migration
Add a format discriminator (working name `body_format`: `"doc" | "html"`). Posts locked to `"doc"`. Pages default `"html"`, may be `"doc"`.

**Why additive:** Ghost's precedent — when they changed editors they added `lexical` alongside `mobiledoc` and let rows carry either. Both columns still co-exist in their schema today. Destructive format migration is the failure mode to avoid.

**Why a real discriminator:** today `kind` (`post`|`page`) only selects which admin list shows the row — "`kind` only changes which admin list surfaces a row and how it's created" (`src/features/post/post.ts:9`). Storage is identical. Format needs to be explicit, not implied by `kind`.

**The trap this prevents:** Tiptap only understands a fixed node vocabulary. HTML → Tiptap silently discards anything outside it — a hand-built two-column layout becomes plain paragraphs, with no error, and saves. Therefore an `html`-format document must NEVER be offered a Tiptap tab. Format conversion is an explicit, warned, one-way action only.

### D-3 — Generated pages inherit theme TOKENS, not theme LAYOUT
The generation prompt is given the active theme's design tokens as literal values. Generated CSS references them with literal fallbacks: `var(--accent, #64a19d)`.

**Why:** open-lovable's single best idea per its analyst — its default mode *describes* style in prose and produces generic "AI slop" Tailwind; its opt-in mode injects literal brand values (colors/fonts/spacing/button styles) and produces something that matches the brand. Generalized lesson: **hand the model numbers, not adjectives.**

**Why it's nearly free here:** Tovu already has this. `themes/*/tokens.json`, loaded at `src/features/theme/theme.ts:85` — "Design tokens: CSS custom-property name → value (emitted into `:root`)". Real content (`themes/grayscale/tokens.json`): `--accent: #64a19d`, `--ink: #212529`, `--font-body: 'Nunito', …`, `--radius: 4px`, `--maxw: 75rem`.

**Why `var()` with a literal fallback:** the page follows theme switches, degrades gracefully on a theme missing that token, and still exports self-contained. Solves brand coherence across N generated pages without freezing them.

*Status: decided by Coordinator on evidence; user had not objected as of writing. Cheap to revisit before M1 exit.*

### D-4 — Preview is served from an origin DISTINCT from the admin
Not the admin's origin. Separate subdomain or port.

**Why:** bolt.diy's preview iframe sets `allow-scripts` + `allow-same-origin` together (`Preview.tsx:992`) — normally a sandbox-defeating combination. It is safe *for them* only because WebContainer previews resolve to a throwaway subdomain, so "same origin" is not bolt.diy's real origin. Tovu inverts this: previewing generated pages inside the admin, on the admin origin, with those flags means any AI-authored `<script>` can read the admin session and act as the operator. Given D-12 permits inline script, this is live, not theoretical.

**Do not copy bolt.diy's sandbox attribute string.** Re-derive from Tovu's actual origin topology.

### D-5 — Stable element IDs assigned at generation time
Generated markup carries stable per-region identifiers (working name `data-tovu-id`).

**Why — this is the keystone.** It is the only way to get bolt.diy-grade scope discipline in a single-document model (see D-6), and it simultaneously enables: click-an-element-and-prompt-about-only-it; per-edit cost/latency proportional to the region rather than the page; and the rendered-element → source-region mapping any future visual editor needs.

**Retrofit cost is high** — pages generated without IDs can't be region-edited later. Must land in the first spec.

### D-6 — TWO edit actions: replace-document AND edit-region
A full-document-replace action for "rebuild this page," and a region-scoped edit action targeting a `data-tovu-id` for everything after.

**Why (this reverses an earlier call — see D-REV-1):** bolt.diy's scope discipline comes from **per-file addressability**, not from diffing and not from prompt severity. Its ActionRunner only writes a file the model has explicitly named in an action (`action-runner.ts:311-339`); an unaddressed file is structurally untouchable rather than merely instructed-against. Context optimization further caps the visible file set at 5.

**Why it doesn't transfer for free:** that mechanism constrains *which of N files*. Tovu collapsed N to 1 — there is nothing to sub-select. We would inherit bolt.diy's calm prompt without the mechanism that earns it. Tovu's real failure mode is **within-document** scope creep ("make the button blue" → hero restructured), which no bolt.diy variant addresses because their files stay small. The only mechanism in either codebase that targets this axis is open-lovable's Morph Fast Apply constrained-snippet format (its analyst independently ranked it a real architectural win, medium-high port cost).

### D-7 — Snapshot per turn + rewind is the dependable safety net
Full-document snapshot per AI turn; rewind to any prior turn.

**Why cheap here:** bolt.diy snapshots a whole file tree; a Tovu page is one document.

**Critical caveat — do not substitute a Stop button for this.** bolt.diy's stream-and-stop-early UI is wired to a visible Stop button (`Chat.client.tsx:221-228`) but `workbenchStore.abortAllActions()` is an empty stub carrying `// TODO: what do we wanna do and how do we wanna recover from this?` (`workbench.ts:460-462`). Clicking Stop halts new tokens and does nothing about already-dispatched writes. Rewind-to-snapshot, by contrast, is fully built with no TODOs. **Streaming buys perceived speed, not safety.** Cancellation needs its own logic if we want it to mean anything.

### D-8 — Hand-edits reconciled through the model's own grammar, bidirectionally
When a user edits by hand, wrap the change in the same action grammar the model emits and prepend it to the next turn (`Chat.client.tsx:511-531`, `getModifiedFiles` → `filesToArtifacts`).

**Why:** one grammar in both directions, no separate reconciliation layer. Directly resolves the "hand-edits and AI edits clobber each other" problem.

### D-9 — Error handling is a button, not an autonomous repair loop
A dismissable "ask the AI to fix this" control that quotes the error into a new turn (bolt.diy `ChatAlert.tsx`).

**Why:** bolt.diy's deliberately-simple version works. open-lovable built the ambitious version and **most of it is dead code** — `HMRErrorDetector.tsx`, the whole exported API of `build-validator.ts`, and three dedicated API routes (`report-vite-error`, `monitor-vite-logs`, `check-vite-errors`) have zero callers repo-wide. Their "we handle build errors" story is largely unwired; a plausible contributor to the hands-on quality gap.

### D-10 — Use existing tool-calling infrastructure, not a bespoke text format
Route generation through Tovu's existing tool layer (`src/assistant/tool-registrations.ts`, `tool-catalog-query.ts`, `tool-executor-audit.ts`, `tool-registration-kit.ts`).

**Why:** open-lovable invented its `<file path="…">` pseudo-XML because of an in-code claim that "Neither Groq nor Anthropic models support tool/function calling in this context" (`route.ts:1310`) — stale. The cost of that choice is visible: the parsing logic is independently reimplemented in at least two files with drifting fallback heuristics — reactive patching rather than a designed contract.

**Take the technique, not the grammar:** bolt.diy's resumable streaming parser (`app/lib/runtime/message-parser.ts`) is a *streaming-correctness* mechanism — a cursor-keyed scanner that resumes from a saved position each call, so partial content renders before the closing tag lands. Its calling convention matters as much as the parser: the caller passes the message's full accumulated text every render (`useMessageParser.ts:70`) and the parser's own position pointer dedupes. It has **no opinion on scope** — it parses a 1-file and a 50-file response identically. Apply the cursor technique to streamed structured-output deltas.

**Open verification (see OQ-1):** confirm the BYOK path normalizes tool calls the way the daemon path does. Tovu supports four protocols — `["anthropic", "openai", "azure", "google"]` (`src/server/routes/admin/assistant/list-models.ts:6`).

### D-11 — Rate-limit the generation endpoint from day one
**Why:** bolt.diy configures a limiter for `/api/llmcall` (10 req/min, `security.ts:12`) and **never applies it** — `api.chat.ts`, `api.llmcall.ts`, and `api.enhancer.ts` never call `withSecurity()`/`checkRateLimit()`. Only the OAuth/integration routes use it. The most expensive and most abusable endpoints are unprotected. Easy to reproduce by accident.

### D-12 — The Pages/Zana boundary is a CAPABILITY line, not a syntax line
Pages may contain inline `<script>` for presentation behavior. Pages have no build step, no npm, no server routes, and no data persistence. That absence — not a JavaScript ban — is what makes a Page not an app.

**Why:** a syntax ban is arbitrary and will be re-litigated the first time someone wants an accordion. A capability boundary is enforceable and explicable. It is also enforced at *generation* time via the prompt's closed-world description (the technique behind bolt.diy's `<system_constraints>`), not only at validation time.

**Authoring raw HTML is permission-gated.** Precedent already in the codebase: theme-source editing is deliberately excluded from the editor role because "authoring template/CSS source is a build-time-shaped capability whose failure mode is a broken [site]" (`src/identity/seed.ts:37-39`), and `media.upload_svg` is described as an "XSS-risk-gated capability" (`seed.ts:132`). Same class.

### D-13 — Shared page behavior becomes a widget; one-off behavior inlines
Repeated interactive behavior (carousel, accordion) is a widget, not per-page JS. Genuinely one-off behavior is inlined into that page.

**Why:** answers the "cache JS across pages" question one level up. A widget ships its JS once → browser caching is automatic, security review happens once instead of per page, bug fixes propagate, and it reinforces D-12 by giving the model a blessed component to reach for instead of inventing machinery.

**Mechanism already exists:** content-address the asset by sha256 and serve at a hash-bearing URL with `Cache-Control: public, max-age=31536000, immutable`. Changing the file yields a different URL, so there is no cache to invalidate. `asset_blobs` already works this way — "content-addressed by sha256, deduplicated within a workspace" (`src/infra/db/schema.ts:1073`).

**Dependency tracking already exists:** deleting a widget must not silently break pages. `entry_refs` already indexes `widgetEmbed` references inside `bodyJson` for exactly this (`src/core/entry-refs/types.ts:18-22`). Generated pages must register references the same way.

---

## Reversals and rejected options

Recording these because "considered and rejected X because Y" is what gets lost and re-litigated.

### D-REV-1 — "Don't build surgical editing" → REVERSED
**Originally argued:** bolt.diy built a diff system and abandoned it, therefore full-document rewrite plus cheap undo is sufficient.

**Why reversed:** the abandonment carries no signal (D-REV-2), and more importantly bolt.diy doesn't need within-file editing because it constrains at *file* granularity — a constraint Tovu structurally cannot use at N=1. See D-6.

### D-REV-2 — "bolt.diy deliberately retreated from diffs" → WITHDRAWN as unsupported
Git archaeology: `diff.ts` was introduced **and wired live** by commit `2cb3f09` "feat: submit file changes to the llm (#11)" (Dominic Elm, 2024-07-25), touching `Chat.client.tsx` and the legacy prompt (`prompts.ts`, +74 lines — which still carries diff-aware language at `prompts.ts:323`). A **different author** later added a parallel full-content path in `b98485d` "feat: make user made changes persistent after reload (#1387)" (Anirban Kar, 2025-02-27) **without removing or refactoring the old path**; that PR is framed around reload-persistence, not around replacing diffs. `git log -S` on `computeFileModifications` shows it was touched exactly once, ever.

**Conclusion: code drift by a second author, not a considered reversal.** No commit anywhere states a rationale. It is therefore evidence neither for nor against diffing. The causal reading is inference from code + timeline, explicitly flagged as such in the source report — do not cite it as a sourced fact.

### D-REV-3 — "The prompt-nagging hypothesis" → FALSIFIED as stated
**Hypothesis (from open-lovable recon):** heavy ALL-CAPS prompt nagging compensates for a weak edit mechanism; constrained formats permit calm prompts.

**Falsified by a clean control.** bolt.diy ships three prompt variants (`prompt-library.ts:30-45`) using an *identical* always-full-file-rewrite mechanism. Its default (`new-prompt.ts`, 305 lines) contains exactly **one** plain scope bullet with zero threat framing — "Only include new/modified files" (`new-prompt.ts:173`) — and zero instances of VIOLATION/FAILURE/ABSOLUTE/WITHOUT EXCEPTION anywhere. Its non-default "optimized" variant (`optimized.ts`, 563 lines) wraps the same rule in "# CRITICAL RULES - NEVER IGNORE" … "ONLY alter files that require changes - DO NOT touch unaffected files" (`:255`) … "CRITICAL: These rules are ABSOLUTE and MUST be followed WITHOUT EXCEPTION in EVERY response" (`:285`). Mechanism held constant, tone varies wildly.

Nuance worth keeping: overall shouting-word density is comparable across all three variants (~1 per 9–11 lines) — bolt.diy still shouts, but about *content* rules (no binary files, Pexels-not-Unsplash, Supabase destructive-op bans), not about scope.

**What actually predicts calm:** per-file addressability, per D-6.

### D-REV-4 — Craft.js / GrapesJS as the page builder → REJECTED for the model, RE-ADMITTED narrowly for the visual editor
Initially rejected: both assume the browser owns rendering, whereas Tovu's rendering authority is server-side `src/server/http/site/render.ts` over theme-as-data ("No theme code executes — the theme is data"). Adopting either as the document model means two renderers that drift.

**Narrow re-admission:** once Pages are deliberately raw HTML (D-2), GrapesJS becomes a legitimate *candidate* for the eventual visual-editing tab specifically, since parsing HTML into an editable tree and re-serializing is the hard part it does well. Caveat if pursued: it re-serializes, so it will not preserve AI output byte-for-byte — requires an explicit "once touched visually, the visual editor's serialization is authoritative" rule.

### Deliberately NOT ported
- **Entire sandbox/VM tier** — WebContainer (bolt.diy); E2B/Vercel, npm install, Vite dev server, iframe proxying (open-lovable). This is the bulk of open-lovable's codebase and none of it applies to a no-build single-document model.
- **Non-`file` action types** — shell/start/build/supabase.
- **LLM-driven file-selection / context-optimization subsystem** — solves a many-files problem that does not exist at N=1.
- **In-memory global session state** (open-lovable) — Tovu has a real DB.
- **Mobile/Electron/deploy-integration/MCP machinery** (bolt.diy).

---

## Open questions

- **OQ-1 — BYOK tool-call normalization.** Does the BYOK execution path normalize tool calls the same way the daemon path does, across all four supported protocols? Blocks D-10. Resolve before M1 exit.
- **OQ-2 — Vision self-check slice.** Neither reference implementation uses a vision model anywhere. open-lovable *fetches a screenshot and never sends it to the LLM* — confirmed by grep, it reaches React state and the UI only, never the generation request body. Rendering the generated page, screenshotting it, and feeding it back ("the hero text overlaps the image — fix it") is straightforward with the models Tovu already supports and would be a genuine differentiator. Scope as a stretch slice, not v1.
- **OQ-3 — Header/footer/nav inheritance.** A bespoke page still needs real site chrome. If the model invents its own nav per page, the site is broken. Interacts with D-3 (tokens) and the existing navigation module.
- **OQ-4 — Real forms/newsletter/media on generated pages.** A generated `<form>` that posts nowhere silently loses leads. Tovu has forms, newsletter and media modules; generated pages need to reach them, plausibly via D-13 widgets.
- **OQ-5 — Reusable sections.** Without them, page 12 is a copy-paste of page 3 and a logo change is 12 hand-edits.
- **OQ-6 — Import-an-existing-design.** open-lovable's scrape-to-clone is weaker than its framing: default mode dumps Firecrawl markdown into the prompt via `JSON.stringify` with no structure. The good tier is a separate opt-in "Brand Extension Mode" pulling structured brand JSON from a newer Firecrawl endpoint — but it explicitly does not clone layout or content, only "steals the look." If pursued, that is the tier to model, and Tovu needs its own extraction (Firecrawl's `branding` v2 API is paid — do not take a dependency).

---

## Sequencing

1. Separate-origin preview (D-4) — security-critical, prerequisite for everything
2. Second body format (D-2) + stable element IDs (D-5)
3. Streaming generation with token injection (D-3, D-10)
4. Snapshot + rewind (D-7)
5. Region-scoped edit action (D-6)
6. Hand-edit reconciliation (D-8), fix-it button (D-9)
7. Later: visual editing tab, import-an-existing-design (OQ-6), vision self-check (OQ-2)

Per §14.2 of `docs/architecture/tovu-architecture.md`: no code before M1 (spec) and M2 (ADR). This document is M0 output.
