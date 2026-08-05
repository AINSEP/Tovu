# SPEC-047 — Pages vibecoding: Tovu product wiring over `@jini-ai/vibecoding`

Status: **DRAFT (v1) — awaiting owner review**
Author: Spec Agent, 2026-08-04
Builds on: `ADS-memory/reports/recon/pages-vibecoding-decisions.md` (D-1..D-13, D-REV-1..4, OQ-1..6),
`ADS-memory/reports/recon/2026-08-03-vibecoding-in-jini-inventory.md`,
`ADS-memory/reports/recon/2026-08-03-vibecoding-apply-tier.md`, constitution v1.0.0

---

## 1. Intent

Pages become AI-generated, bespoke HTML+CSS with live, region-scoped editing. Posts are unaffected
— they stay Tiptap/ProseMirror JSON, full stop (D-1, not revisited here).

**This spec is Tovu product wiring, not engine design.** The edit loop, undo/redo, the `EditTarget`
port, and the tagged-region HTML target are already built and tested in Jini
(`@jini-ai/vibecoding`, `./core` + `./html`). This document does not re-specify them. Where Tovu
must supply something the engine injects as a port, this spec specifies *Tovu's implementation of
that port* — a `HtmlDocumentStore` over the Pages row, a permission gate, a rate limit, a prompt.

One piece the engine deliberately does **not** supply — an `HtmlRegionParser` — has no
implementation anywhere yet, in either repo. §3 resolves where it lives; building it is Jini work
this spec names as a **blocking prerequisite**, not a Tovu deliverable.

### What already exists (do not rebuild)

| piece | where | state |
|---|---|---|
| Edit loop (`applyEdit`/`applyEdits`/`correctionsFor`) | `@jini-ai/vibecoding/core` (`apply.ts`) | Built, tested. Validate-then-commit, per-part outcomes, never swallows a write failure. |
| `EditTarget` port | `@jini-ai/vibecoding/core` (`target.ts`) | Built. `listParts`/`readPart`/`replacePart`/`snapshot`/`restore`/`validate`. |
| Undo/redo | `@jini-ai/vibecoding/core` (`history.ts`) | Built, tested. `createEditHistory` — transaction grouping, undo/redo stacks, snapshot-as-undoable-restore. |
| Tagged-region HTML target | `@jini-ai/vibecoding/html` (`regions.ts`) | Built, tested. `createHtmlRegionTarget` — byte-preserving splice, allowlist-cannot-self-extend guard, `data-agent-element` addressing. |
| Region addressing convention | `@jini-ai/agentic` `element-handles.ts` | Built. Allowlist grammar, `region` role already defined — see D-5 correction below. |
| Sandboxed HTML preview | `@jini-ai/renderers-react` `SrcDocSandbox.tsx` | Built, tested. `allow-scripts allow-popups …`, `allow-same-origin` absence pinned by regression test. |
| Theme design tokens | `src/features/theme/theme.ts:85` `ThemeTokens` | Built. `Record<string, string>`, loaded from `themes/*/tokens.json`, emitted into `:root`. Verified present at this line 2026-08-04. |
| Admin tool-calling infra (21 domains, 124 wired tools) | `src/assistant/tool-registrations.ts`, `tool-registration-kit.ts`, `@jini-ai/daemon`'s `ToolExecutor` | Built. Executed through the same daemon path `agent-daemon-server.ts` already runs for the admin assistant. |
| Durable tool-execution audit | `src/assistant/tool-executor-audit.ts` | Built. Decorates `ToolExecutor`, records every attempt including denials, survives restart. |
| Rate-limit primitive (fixed-window, sweep-on-write eviction) | `src/server/middleware/rate-limit.ts` | Built (SPEC-006 REQ-14, SPEC-046 REQ-8). `SITE_ASSISTANT_PER_IP` is the most recent profile added. |
| Content-addressed asset storage | `assetBlobs` table, `src/db/schema.ts:1075` | Built (ADR-027 §2). sha256-keyed, immutable-cacheable. |
| Reference-integrity index for embeds | `entry_refs`, `src/core/entry-refs/types.ts` | Built (SPEC-043). `widget-embed` is already a source kind; Contact Form's `formDefinitionId` is a live `config-field` example. |
| Theme-as-data rendering | `src/server/http/site/render.ts:23` | Built. "No theme code executes — the theme is data." Verified present at this line. |
| Permission-gated authoring precedent | `THEME_WRITE_PERMISSION = "theme.edit"`, `src/features/theme/agent-tools.ts:100` | Built. New permission, `admin`-only in the built-in seed, distinct from a lower-risk sibling permission — the shape §7 follows. |

### What does not exist yet (this spec's scope)

- `body_format` column, or any Pages/Posts body discriminator — confirmed absent (`grep` for
  `body_format`/`bodyFormat` across `src/` returns nothing).
- `@jini-ai/vibecoding` in Tovu's dependency tree at all — confirmed absent from `package.json`
  (ten `@jini-ai/*` deps present, none of them this one).
- Any HTML parser dependency, anywhere — confirmed absent from `node_modules` and every
  `package.json` in both Tovu and Jini.
- A Pages generation permission, endpoint, or rate-limit profile.

---

## 2. Scope boundary

**In scope:** the Tovu-side wiring that turns the engine's generic loop into a working Pages
feature — schema, storage adapter, permission, rate limit, prompt construction, preview, tool
registration, sequencing.

**Out of scope, explicitly:**
- Any change to `@jini-ai/vibecoding/core` or `/html` — they are complete for this feature's needs.
- Posts. D-1 is settled; nothing here touches `posts.body_json` when `kind: "post"`.
- The entire sandbox/VM tier, non-`file`-shaped actions (shell/start/build), an LLM-driven
  file-selection subsystem, in-memory global session state — none of these apply to a single-document
  model and none are ported (decision log, "Deliberately NOT ported").
- OQ-2 (vision self-check) and OQ-6 (import-an-existing-design) — post-v1 stretch slices.
- Full multi-protocol BYOK generation — see §5, OQ-1 resolution.

---

## 3. Prerequisite (Jini, blocking) — `HtmlRegionParser` implementation

`packages/vibecoding/src/html/regions.ts` defines the port and injects it; no implementation exists
in either repo. `createHtmlRegionTarget` cannot run without one. **This spec cannot ship without
it, but it is not Tovu code** — per the ownership rule, a generic HTML-parsing adapter has no
Tovu-specific content and belongs in Jini.

### Decision — parse5, in a new `@jini-ai/vibecoding/html/node` entry

**Evaluated:**

| candidate | verdict | why |
|---|---|---|
| **parse5** | **Recommended** | Spec-compliant WHATWG HTML parser (the same one jsdom uses). Never throws on malformed input — degrades via the standard's own error-recovery rules, which is exactly the honesty `checkWellFormed?`'s doc comment asks for ("omit the method entirely if the parser cannot distinguish a malformed document from a recovered one" — parse5 genuinely cannot always tell, and should say so by returning best-effort locations rather than throwing). `sourceCodeLocationInfo: true` reports `startOffset`/`endOffset` per node, including start/end tags — directly satisfies `ParsedRegion.innerStart`/`innerEnd`. |
| node-html-parser | Rejected for v1 | Faster, more lenient, but not spec-compliant — its recovery behavior on malformed markup is not held to the WHATWG algorithm, and this module's own doc is explicit that "an incorrect offset corrupts the document silently." Byte-preserving splice is the one place this project cannot trade correctness for speed. |
| `DOMParser` | Rejected as primary, plausible second adapter | Browser-only global. The package is `"runtime": "universal"` and the authoritative write path is server-side (a DB row), so `DOMParser` cannot be the implementation editing actually commits through. Worth naming as the rule-of-two second adapter for this port (client-side, non-authoritative parsing — e.g. a future visual-editing tab) rather than discarding it. |

**Where it lives:** `@jini-ai/vibecoding/html/node` — Node-only runtime, parse5 as its one new
dependency. The package's own README already earmarks `./node` as "planned and deliberately not
present yet" for filesystem targets; a parse5-backed HTML adapter is the same kind of addition,
consistent with the existing universal/Node split (`./core` and `./html` stay dependency-free;
Node-specific and browser-specific adapters get their own entries). Tovu then supplies only
`HtmlDocumentStore` (§4) — genuinely Tovu-specific, since it reads/writes the Pages row.

**Constitution check (Article I, Library-First):** complies — parse5 is maintained, widely adopted
(jsdom's own dependency), and no custom implementation is proposed in its place.

**Constitution check (Article IV, rule-of-two):** the port already has a documented rationale for
injection (universal runtime) independent of rule-of-two, but a single parse5 adapter alone is a
single-adapter port. The `DOMParser` browser adapter above is the named near-term second
implementation; record it in the ADR's rule-of-two plan rather than building it now.

`checkWellFormed?` should be implemented using parse5's own parse errors surfaced through
`onParseError`, phrased for the model per the port's contract (e.g. "unclosed `<section>` — the
document no longer parses").

**REQ-1 (Jini, prerequisite):** Ship `@jini-ai/vibecoding/html/node` exporting an
`HtmlRegionParser` implementation backed by parse5 with `sourceCodeLocationInfo: true`, including a
`checkWellFormed?` built from parse5's parse-error stream. Blocks every Tovu REQ below that touches
`createHtmlRegionTarget`.

---

## 4. `HtmlDocumentStore` over the Pages row + `body_format` (D-2)

### REQ-2 — Additive schema change, never a destructive migration

Add to `src/db/schema.ts`'s `posts` table:

- `body_format: text("body_format").notNull().default("doc")` — additive; every existing row
  (including every existing Post) backfills to `"doc"` via the column default, with no data
  migration script needed. Matches D-2's Ghost precedent (co-resident columns, never a rewrite).
- `body_html: text("body_html")` — nullable, additive.
- Loosen `body_json`'s existing `.notNull()` to nullable. This is the one non-purely-additive change
  in this migration: it widens an existing constraint (a Page in `"html"` format has no reason to
  carry a dummy empty JSON doc) rather than narrowing one, so it is backward-compatible with every
  existing row, but call it out explicitly in the migration's own comment since it touches a
  pre-existing `NOT NULL`.
- A `CHECK` constraint (Drizzle custom SQL, matching the FTS precedent at
  `drizzle/0022_posts_fts_search_index.sql` for hand-written SQL objects Drizzle's builder can't
  express) enforcing exactly one body column populated per format:
  `(body_format = 'doc' AND body_json IS NOT NULL AND body_html IS NULL) OR (body_format = 'html' AND body_html IS NOT NULL AND body_json IS NULL)`.

Posts are locked to `body_format: "doc"` at the write-service layer (the same chokepoint that
already enforces `kind`), never `"html"`. Pages default to `"html"`; the decision log preserves a
`"doc"` escape hatch for Pages that don't need bespoke HTML (D-2) — v1 may defer that combination if
it adds scope; flag as `[NEEDS CLARIFICATION: does a "doc"-format Page ship in v1, or is that
deferred until format-conversion (an explicit, warned, one-way action per D-2) is speced]` — this is
a scope call the owner should make, not one this spec should assume.

### REQ-3 — The Tiptap/HTML trap is prevented structurally

D-2's trap: Tiptap silently discards markup outside its node vocabulary and saves the loss with no
error. "Never offer an `html`-format document a Tiptap tab" must not be a convention a future PR can
forget.

**Mechanism:** the admin-facing post-read API returns a **discriminated union**, not a single loose
type —

```ts
type PostResponse =
  | { format: "doc"; bodyJson: JsonObject; bodyHtml: null }
  | { format: "html"; bodyHtml: string; bodyJson: null };
```

The Tiptap editor component's props require a non-null `bodyJson: JsonObject` at the TypeScript
type level. Constructing its props from a `{ format: "html" }` response is a **compile error**, not
a runtime branch a refactor can quietly delete — the same category of protection the CHECK
constraint above gives the database. The admin route that resolves which editor mounts
(Tiptap vs. the new HTML/region editor, §6) switches on `format` and TypeScript's exhaustiveness
checking (a `never` case) catches a third format value at compile time if one is ever added.

**Constitution check (Article II):** a certified test asserting a `{format:"html"}` row cannot type-check
into Tiptap's props (or, if that's not directly testable, an integration test asserting the admin
route never renders the Tiptap component for an html-format row) must exist before this ships.

### REQ-4 — `HtmlDocumentStore` implementation

```ts
class PagesHtmlDocumentStore implements HtmlDocumentStore {
  constructor(private readonly postId: UUID, private readonly deps: PostRepoDeps) {}
  async read(): Promise<string> { /* SELECT body_html WHERE id = postId AND body_format = 'html' */ }
  async write(html: string): Promise<void> { /* UPDATE body_html, bump version, WHERE ... */ }
}
```

Genuinely Tovu-specific (the DB, the workspace scoping, the version bump on write per the existing
`PostRecord.version` field) — this is the piece that stays in Tovu per the ownership rule.

---

## 5. Generation, tool wiring, and the OQ-1 resolution (D-10)

### REQ-5 — Route through the existing tool-calling infrastructure, on the daemon path

Register a new `pages-vibecoding` (or extend the existing `post`) domain in
`src/assistant/tool-registrations.ts`, following the 21-domain pattern already established. Its
handlers construct `createHtmlRegionTarget({ store: PagesHtmlDocumentStore, parser })` (REQ-1/REQ-4)
and drive it through `applyEdit`/`applyEdits`/`createEditHistory` (all engine code, unmodified) —
Tovu writes the tool-handler glue, not the loop.

**Two edit actions per D-6:**
- `pages.replace_document` — full rewrite of `body_html`, for "rebuild this page."
- `pages.edit_region` — `replacePart(handle, content)` through the region target, for everything
  after. Both route through `applyEdit`, so both get `validate` (REQ-1's parser +
  `createHtmlRegionTarget`'s own allowlist-cannot-self-extend guard) for free.

### REQ-6 — OQ-1 resolution: scope generation to the local-CLI daemon path, not BYOK, for v1

**Investigated directly, not deferred.** Verified by exhaustive grep across `src/` and `apps/`:

- `runAnthropicToolTurn`, `runOpenAiToolTurn`, `runAzureToolTurn` (Jini's three non-Google BYOK
  provider functions, `@jini-ai/agent-runtime`) have **zero call sites** anywhere in Tovu.
- `runGoogleToolTurn` has exactly **one** call site — `src/server/modules/site-assistant.ts`, the
  unrelated *public* visitor assistant (SPEC-046), which hardcodes Google, calls it in-process with
  a server-side key, and its own file header states this deliberately bypasses the BYOK/browser-key
  flow ("a key-leak if pointed at the public").
- The admin assistant's actual chat execution (`src/assistant/agent-daemon-server.ts`) has **no
  branch** on `core.execution.mode`/byok anywhere in it — it always runs the local-CLI daemon path,
  regardless of what the Execution-mode settings tab is set to.

**Conclusion:** BYOK today is settings-and-probe scaffolding (`detect-agents.ts`,
`test-connection.ts`, `list-models.ts`) with no live tool-calling consumer, for any protocol, in any
Tovu feature. This is consistent with a concurrently-tracked BYOK bug elsewhere in the codebase.
Whether "BYOK normalizes tool calls the same way the daemon path does" is therefore **not
answerable by observation** — there is nothing running to observe for three of the four protocols,
and the one live case (Google, site-assistant) is a different feature with a different execution
shape (in-process HTTP relay, not the daemon).

*What is verifiable and was verified:* all four engine provider files
(`anthropic-messages.ts`/`openai-chat.ts`/`azure-chat.ts`/`google-messages.ts`) independently define
a structurally identical `{ type: 'tool_use'; id: string; name: string; input: unknown }` event
variant, and the daemon/CLI path's `claude-stream.ts` emits a compatible (though more loosely typed:
`id`/`name: unknown`) `tool_use` event. This is convergence by convention across four
independently-maintained files, not one shared type — a drift risk worth naming, in the same
species as D-10's own open-lovable finding about duplicated parsers, but not something this spec can
fix without touching the engine.

**Resolution:** Pages generation in v1 runs exclusively through the admin's existing local-CLI
daemon path (`agent-daemon-server.ts`), the same infrastructure the admin assistant dock already
uses live today. This unblocks D-10 without requiring this spec to prove or build N-protocol BYOK
tool-call parity. **Named, explicit gap this spec does not own:** BYOK-mode Pages generation is
unsupported until BYOK execution is wired to a real tool-calling turn for *any* Tovu feature — that
is pre-existing platform work, not new debt this feature introduces. No `[NEEDS CLARIFICATION]`
marker; this is a scope decision with evidence, not an unresolved question.

### REQ-7 — Fix-it loop (D-9)

`correctionsFor(outcomes)` (engine, unmodified) surfaces rejections/failures with a model-facing
reason. Tovu's handler feeds these back as the next turn's tool-result content — no new mechanism,
just wiring the existing return value into the daemon's next-turn input.

---

## 6. Generation prompt — theme tokens, not adjectives (D-3)

### REQ-8 — Literal token injection

Verified: `ThemeTokens` (`Record<string, string>`) is loaded at `src/features/theme/theme.ts:85`
from `themes/*/tokens.json`, still present as cited, unchanged since the decision log was written.

The generation system prompt is built with the active theme's resolved tokens interpolated as
literal values (`--accent: #64a19d`, `--font-body: 'Nunito', …`), and the instruction to the model is
to reference them via `var(--accent, #64a19d)` — CSS custom property with a literal fallback, never
a bare hex value and never the bare `var(--accent)` with no fallback. This is cheap: the token
loader is a straight read, and Tovu already emits these into `:root` for every themed page, so the
same values just get handed to the prompt builder too.

**Owner check, not a settled fact:** the decision log's own status line for D-3 reads "decided by
Coordinator on evidence; user had not objected as of writing... cheap to revisit before M1 exit."
This spec is M1. Surfacing per the brief's instruction: **`[NEEDS CLARIFICATION: D-3's
var()-with-literal-fallback approach has not been confirmed by the owner — confirm before Software
Architect dispatch, or explicitly ratify D-3 as-is]`.**

---

## 7. Permission gate (D-12) and rate limit (D-11)

### REQ-9 — New permission, `admin`-only in the built-in seed

**Correction to the decision log's citation.** D-12 cites `media.upload_svg` as an "XSS-risk-gated
capability" at `src/identity/seed.ts:132`. Neither exists: `src/identity/seed.ts` is not a real path
(the actual file at that location is content-seeding, `src/server/seed.ts`, unrelated), and grepping
every permission string in the codebase turns up only a generic `media.upload` (no SVG-specific
variant) — see `src/server/routes/admin/media/upload.ts`.

**The real, verified precedent is `THEME_WRITE_PERMISSION`:**

> `src/features/theme/agent-tools.ts:100` — `"theme.edit"` is "A NEW permission rather than a reuse
> of `theme.set`... Editing a theme's source files is a different capability with a different worst
> case (a template that fails validation takes that theme's pages to the fallback body until fixed),
> so it gets its own string and is granted to `admin` but not `editor` in the built-in seed."

Follow the same shape exactly: a new permission, `pages.edit_html`, distinct from whatever governs
ordinary Page/Post editing (the existing `post`-domain write permission, unaffected). Granted to
`admin` only in the built-in seed, not `editor` — same worst-case reasoning as `theme.edit`: a
malformed or malicious generated page is a broken-artifact risk, structurally the same class as a
broken theme, not the same class as a normal content edit.

**Constitution check (Article VI):** the standing v1 no-auth exception for local-dev-only endpoints
applies the same way it does for every other SPEC-001…006 route; this spec's endpoints must record
the same Article VI EXCEPTION line and are gated by `pages.edit_html` per-action authz once
permissions apply, matching the existing pattern.

### REQ-10 — Rate-limit the generation endpoint from day one (D-11)

Reuse `src/server/middleware/rate-limit.ts`'s existing primitive — do not invent a new limiter.
Unlike `SITE_ASSISTANT_PER_IP` (anonymous, per-IP), Pages generation is an **authenticated admin**
endpoint, so the natural key is the principal or workspace, not client IP — a compromised or
careless admin session is the threat this profile bounds, not an anonymous flood. Add a new profile,
e.g. `PAGES_GENERATION_PER_PRINCIPAL`, isolated in `rate-limit.ts` the same way every other profile
is (a one-line change to loosen later), and reuse the already-shipped sweep-on-write eviction (SPEC-046
REQ-8) rather than re-deriving it — that fix exists specifically because an unbounded key space is a
real memory-exhaustion path, and a per-principal key space, while smaller than per-IP, is not
exempt from the same reasoning if a workspace has many admins.

---

## 8. Preview (D-4, narrowed) — resolved for v1

### REQ-11 — Opaque-origin `srcdoc`, not a real separate-origin URL

Confirmed via direct read of `@jini-ai/renderers-react`'s `SrcDocSandbox.tsx:49` and its regression
test (`SrcDocSandbox.test.tsx:11-12`): the component already ships
`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` with `allow-same-origin`'s
absence asserted, not incidental. An opaque origin fully defeats the admin-session-theft threat D-4
was written against (`allow-scripts` + `allow-same-origin` together, the bolt.diy pattern D-4 warns
against) — storage/cookie access is denied by the same-origin policy regardless of whether the
document is a `data:`/`srcdoc` origin or a real one.

**What a real separate-origin URL would still buy, and why it's deferred:** a shareable, navigable
link that survives a page reload. Not needed in v1 — preview here is an authoring-time tool for an
operator mid-edit, not a distributable artifact. Once a page is published, the published URL already
is the shareable link.

**Consequence — resolving OQ-3 for free.** Tovu's rendering architecture already answers
OQ-3 (bespoke site chrome): per `src/server/http/site/render.ts:23`, "No theme code executes — the
theme is data," and pages render through the active theme's template. Generated `body_html` is
**inner content only** — the AI never generates `<html>`/`<head>`/nav/footer; the theme template
still owns those, the same way it does for every existing Post/Page. The preview therefore renders
the *combined* result (theme template + candidate `body_html`) through the same rendering call the
public site itself uses, fed into `SrcDocSandbox`'s `srcdoc`. This means:

- OQ-3 is **resolved in-v1**, not deferred: a bespoke page cannot invent its own nav, because the
  model is never given the vocabulary to — it only ever authors what sits inside the theme's content
  slot.
- D-4 stops being a sequencing prerequisite (see §9) — it's a reuse of an already-tested component,
  foldable into the same step as streaming generation rather than gating everything before it.

---

## 9. OQ-4 — forms/newsletter/media on generated pages: deferred, with a v1 guardrail

A generated `<form>` that posts nowhere silently loses leads (the decision log's own framing). D-13
names the mechanism — shared behavior becomes a widget — and it already exists as running code:
`entry_refs` (SPEC-043) already indexes `widget-embed` references, and Contact Form's
`formDefinitionId` is cited as a live `config-field` example.

**Decision: deferred past v1 for full custom form actions, with a generation-time guardrail now.**
The generation prompt's closed-world description (same technique D-12 already uses for the
Pages/Zana capability boundary) excludes raw `<form action="...">` elements from the model's
vocabulary outright — the same "constrain at generation time, not only at validation time"
principle D-12 states. Any lead-capture or actionable-form need in v1 is satisfied by directing the
model to embed the existing Contact Form widget (already a `widget-embed` per `entry_refs`), not by
inventing markup. True custom form endpoints on generated pages are out of scope for this spec.

**OQ-5 (reusable sections)** is not addressed by this spec either — flagging its absence rather than
silently dropping it: without it, page N is a copy-paste of page 3, which D-13's widget mechanism
also plausibly solves, but scoping that is future work, not this spec's.

---

## 10. Snapshot/undo persistence — a decision this spec must make that the engine leaves open

`createEditHistory` (engine) keeps its undo/redo stacks **in memory**, scoped to the object it
wraps. The engine's own doc is explicit that `snapshot`/`restore` is data-only and that anything
beyond that is host-decided. Tovu must decide: does undo/redo need to survive a server restart, or
only a single editing session?

**Recommendation:** in-memory only, keyed per active page-editing session (page id + admin
session), not persisted to the DB. Reasons: (1) matches the existing precedent that other
per-session assistant state in this codebase (the site assistant's SSE run state) is explicitly not
persisted server-side; (2) `EditHistoryOptions.limit` (default 50) already bounds memory per active
session; (3) persisting undo stacks would mean storing full before/after content pairs durably,
which is a meaningfully bigger and unasked-for feature (a content history/versioning system) that
D-7's own "snapshot per turn is the dependable safety net" framing does not require — the snapshot
*document itself*, not the undo stack, is what needs to survive. **This is a recommendation, not a
verified fact about product intent — flag for owner confirmation alongside D-3 rather than treating
as fully settled.**

---

## 11. Explicit non-goals

- No sandbox/VM tier (no WebContainer/E2B-equivalent — Tovu Pages is a single document, no build
  step, no npm).
- No shell/start/build action types — the engine has none and this spec adds none.
- No LLM-driven file-selection/context-optimization subsystem (solves a many-files problem that
  doesn't exist at N=1 document).
- No in-memory global session state beyond the per-editing-session undo stack in §10.
- OQ-2 (vision self-check) and OQ-6 (import-an-existing-design) — post-v1.
- OQ-5 (reusable sections) — not addressed, flagged as future work.
- Full custom `<form>` actions on generated pages (§9) — deferred.
- BYOK-mode generation across all four protocols (§5, REQ-6) — deferred until BYOK execution is
  wired to any real tool-calling turn in Tovu, which is pre-existing platform work.
- A real separate-origin preview URL (§8) — deferred; srcdoc covers v1's threat model.
- `@jini-ai/vibecoding/core` or `/html` changes — complete as-is.

---

## 12. Sequencing

Supersedes the decision log's original 7-step sequencing, given the D-4/OQ-3 resolution above
(separate-origin preview is no longer a prerequisite):

1. **Jini prerequisite:** `HtmlRegionParser` (parse5, `@jini-ai/vibecoding/html/node`) — REQ-1.
   Blocking; nothing below can integration-test without it.
2. **Schema + store:** `body_format`/`body_html` additive migration, structural Tiptap-exclusion,
   `PagesHtmlDocumentStore` — REQ-2/3/4.
3. **Region addressing:** confirm `data-agent-element`/`region` role reuse end-to-end against a real
   generated document (D-5, corrected per the Jini inventory — not re-litigated here).
4. **Generation + preview together:** streaming generation with token injection (REQ-8) and the
   `SrcDocSandbox` preview (REQ-11) land in the same slice — preview has no separate-origin
   prerequisite to wait on anymore, and there is nothing to preview before generation exists.
5. **Edit actions + tool wiring:** `pages.replace_document`/`pages.edit_region` through the daemon
   path (REQ-5/6/7).
6. **Undo/redo:** `createEditHistory` wired per-session (§10).
7. **Permission + rate limit:** `pages.edit_html`, `PAGES_GENERATION_PER_PRINCIPAL` (REQ-9/10) — land
   alongside step 2, not last; an unpermissioned, unlimited generation endpoint should not exist even
   transiently during development.
8. Later: visual editing tab (D-REV-4's re-admitted GrapesJS/Onlook-class candidate), reusable
   sections (OQ-5), import-an-existing-design (OQ-6), vision self-check (OQ-2).

---

## 13. Acceptance criteria (draft — TDD Agent to formalize per Article II)

1. A Post (`kind: "post"`) can never carry `body_format: "html"` — enforced at the write-service
   layer and by the DB CHECK constraint; a direct-write attempt is rejected at both layers
   (integration test at the write-service boundary per Article V).
2. An `html`-format Page's admin read response cannot type-check into the Tiptap editor's props
   (REQ-3) — compile-time or integration-level proof, not a runtime `if`.
3. `pages.edit_region` targeting a handle not currently listed by `listParts()` is rejected with a
   model-facing reason, never silently applied.
4. A candidate region edit that would add, remove, or duplicate a `data-agent-element` handle is
   rejected (engine behavior — integration test confirms Tovu's wiring doesn't bypass it).
5. A malformed HTML candidate (unbalanced tag) is rejected by `checkWellFormed?` before it reaches
   `body_html`, with a reason fed back as the next turn's correction.
6. Generated CSS references theme tokens via `var(--x, <literal>)`, never a bare literal, verified
   against at least two different themes' token sets (confirms the fallback actually degrades).
7. The preview iframe's `sandbox` attribute exactly matches `SrcDocSandbox`'s existing tested string;
   `allow-same-origin` is absent (assert, don't eyeball — mirrors SPEC-046's browser-verification
   standard).
8. A non-`admin` principal (e.g. `editor`) is refused `pages.edit_html` server-side.
9. Generation requests beyond `PAGES_GENERATION_PER_PRINCIPAL`'s budget receive a 429 before touching
   the model provider.
10. Undo reverts the most recent transaction's parts to their prior content; redo re-applies it;
    both bypass `validate` per the engine's own documented behavior (no new Tovu-side check
    reintroduces validation on rewind).
11. A raw `<form action="...">` in a generation candidate is refused/stripped per the §9 guardrail
    (exact enforcement point — prompt-only vs. also validated — needs Architect-level design; this
    AC records the requirement, not the mechanism).

---

## 14. Open questions carried forward

- `[NEEDS CLARIFICATION]` — D-3's token-injection approach needs explicit owner confirmation before
  Software Architect dispatch (§6).
- `[NEEDS CLARIFICATION]` — whether a `"doc"`-format Page ships in v1 or is deferred until
  format-conversion is speced (§4, REQ-2).
- Not a clarification marker, but flagged for owner sign-off: §10's in-memory-only undo/redo
  recommendation.
- OQ-5 (reusable sections) is named but not resolved — future work, not blocking.

---

## 15. Concerns (Spec Agent — pushback per dispatch instructions)

1. **Two decision-log citations do not survive contact with the code**, both documented with
   corrected evidence above: `media.upload_svg`/`src/identity/seed.ts:132` (§7) and the schema path
   `src/infra/db/schema.ts` (real path is `src/db/schema.ts`; the *line number* 1073 for
   `assetBlobs` is correct once the path is corrected, so that one citation is a stale prefix, not a
   wrong fact). Recommend a spot-check pass over the decision log's remaining `file:line` citations
   before Software Architect treats them as ground truth — this spec did not re-verify every one, only
   the ones load-bearing for its own five priority items plus these two encountered along the way.
2. **REQ-2's schema change loosens a pre-existing `NOT NULL` constraint** (`body_json`). This is
   backward-compatible (widening, not narrowing) but is not purely additive in the strictest sense
   the brief's "additive column, never a destructive migration" framing implies — flagging so
   Software Architect treats it as a reviewed decision, not an oversight.
3. **§10 (undo persistence) has no locked decision anywhere in the source material** — it's a real
   gap in the decision log the recon reports didn't surface (both are engine-focused; neither asks
   "does Tovu need this to survive a restart"). The recommendation given is reasoned but not
   evidenced by any existing Tovu precedent for *this specific feature*; treat it as the most
   likely place this spec is wrong.

---

## 16. Handoff contract

- **Inputs used:** `ADS-memory/reports/recon/pages-vibecoding-decisions.md`,
  `2026-08-03-vibecoding-in-jini-inventory.md`, `2026-08-03-vibecoding-apply-tier.md`,
  `ADS-memory/governance/constitution.md`, `ADS-memory/specs/046-site-assistant-page-actions/spec.md`
  (shape precedent); direct reads of `Jini/packages/vibecoding/{README.md,src/core/*,src/html/regions.ts,package.json}`
  and `Jini/packages/agent-runtime/src/{claude-stream.ts,providers/*,index.ts}`; direct reads of
  Tovu's `src/db/schema.ts`, `src/features/theme/theme.ts`, `src/features/theme/agent-tools.ts`,
  `src/server/middleware/rate-limit.ts`, `src/server/modules/site-assistant.ts`,
  `src/assistant/{agent-daemon-server.ts,tool-registrations.ts,tool-executor-audit.ts}`,
  `src/server/routes/admin/assistant/{list-models.ts,execution-deps.ts}`,
  `src/assistant/execution-mode-settings.ts`, `src/server/http/site/render.ts`,
  `src/core/entry-refs/types.ts`; exhaustive grep sweeps for `body_format`, HTML-parser
  dependencies, and every `run<Protocol>ToolTurn` call site.
- **Output summary:** Tovu-side wiring spec over the already-built `@jini-ai/vibecoding` engine —
  schema/store (§4), tool/daemon wiring with the OQ-1 BYOK scope decision (§5), theming (§6),
  permission/rate-limit (§7), preview with the OQ-3 resolution folded in (§8), OQ-4 guardrail (§9),
  undo persistence recommendation (§10), non-goals (§11), superseding sequencing (§12). One blocking
  Jini prerequisite named (§3, `HtmlRegionParser`).
- **Risks:** the `HtmlRegionParser` prerequisite is cross-repo — this spec cannot itself unblock it;
  Software Architect/Coordinator needs to confirm who picks up the Jini-side work and when, since
  nothing in §4 onward can integration-test without it. REQ-6's BYOK scoping is a real product
  narrowing (v1 Pages generation only works in local-CLI execution mode) that the owner may want
  called out prominently, not buried in an REQ. §10 is the least evidenced recommendation in this
  document (see Concerns #3).
- **Suggested next assignee:** Red-Team, per the Spec Agent's own workflow (spec → Red-Team →
  Coordinator Planning Preflight → Software Architect). Flag the `HtmlRegionParser` cross-repo
  dependency to the Coordinator explicitly before Architect dispatch.
