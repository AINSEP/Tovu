# Session handoff — 2026-08-05 (afternoon)

**Branch:** `refactor/jini-admin-extraction` (both Tovu and Jini)
**Model:** Claude Opus 5 (1M context) as Coordinator; 8 Sonnet 5 subagents
**Baseline:** `26b70a9` — the first thing this session did was commit the previous
session's 365 uncommitted files.

> A parallel session by the owner committed Local CLI model-picker work
> (`5e322f1`, `95fb79a`, `7c42dc8`, `77cebc2`, `52cb2c2`, `33b0bea`, `76865b7`,
> plus docs) interleaved with these commits. Those are **not** from this session.

---

## 1. Committed and done

### Tovu
| Commit | What |
|---|---|
| `26b70a9` | Baseline — previous session's Pages/embeds work, 365 files |
| `b50820d` | ChatFab can be dropped onto the assistant dock and stay there |
| `e67f839` | Tabbed placeholder screens: Payments, Deployment, new Authentication |
| `782407d` | Live-agent E2E: menu + widget embeds render on public Pages |
| `493fca0` | Red-checks for those assertions + empirical proof theme regions are inert |
| `14e4b71` | Placeholder tab screens get Settings' card and header order |

### Jini
| Commit | What |
|---|---|
| `7510f1eb` | `soonPreviewable` — a `soon` nav item can be a real link and keep its badge |

---

## 2. Uncommitted work, and why it was held

Two coherent bundles. **Neither is broken; both are mid-flight.**

### Bundle A — Taxonomy: visual fix + delete, front to back

Held because the **backend was mid-fix when stopped**. The admin now calls
`DELETE /api/admin/v1/taxonomy/…`, so committing the UI alone would bake in a
call to a route that is not yet atomic.

**Frontend — done, green, mutation-proven (132/132):**
- `apps/admin/src/features/taxonomy/Taxonomy.tsx` — CSS convergence + delete UI
- `apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts`,
  `hooks/use-new-term-form.hooks.ts` — collapsed-by-default create forms,
  `confirmDeleteTerm` / `confirmDeleteTaxonomy`
- `apps/admin/src/features/taxonomy/rules.ts` — `describeDeleteBlocked`
- `apps/admin/src/lib/api.ts` — `deleteTerm` / `deleteTaxonomy`
- `apps/admin/src/features/workspace/Workspace.tsx` — chip-grid swap only
- `apps/admin/src/styles.css` — taxonomy-scoped overrides
- 4 test files + `development/e2e/admin-visual-parity.spec.ts`,
  `development/playwright.visual-parity.config.ts`
- Screenshots: `ADS-memory/reports/visual-parity-taxonomy-workspace/{before,after}/`

**Backend — built, 16 tests green, but INCOMPLETE:**
- Tovu: `src/features/taxonomy/repo.sqlite.ts`, `write-service.ts`,
  `src/server/routes/admin/taxonomy/delete-{term,taxonomy}.ts` (new),
  `src/server/modules/taxonomy.ts`, `src/server/routes/types.ts`, 2 test files
- Jini: `packages/cms/src/taxonomy/{write-service,repo.memory,index}.ts` + tests
  (**authoritative copy** — Tovu's is a pure re-export; `dist/` was rebuilt)

**⚠️ WHAT IS STILL MISSING — do this before committing Bundle A:**
1. **Atomicity.** `deleteTaxonomy` removes the container and N member terms with
   **no transaction**. A partial failure leaves orphan rows nothing references and
   no UI can reach. The schema has **no foreign keys**, so nothing prevents it.
2. **TOCTOU.** The guard reads `assignedCount` / `countChildren` and *then*
   deletes. Content assigned in the gap gets destroyed with a `200` returned.
   The guard read must be inside the same transaction as the delete.
3. **Orphaned `taxonomy_revisions`.** `op` was widened to include `"delete"`, but
   pre-existing revision rows for a deleted taxonomy/term are left parentless.
   Cascade or document. Also grep for other tables referencing taxonomy/term ids
   — there are no FKs to surface them.
4. **Mutation-prove workspace scoping inside the guard queries** (not just the
   delete). A count that reads zero from the wrong tenant would greenlight
   destroying something in use elsewhere. No happy-path test catches this.

The agent had found the fix path before it was stopped: **`ContentDbTransaction`
and `stampWatermarkTx` already exist** and are imported in `repo.sqlite.ts`, so
this is reusing an established pattern, not introducing transactions from scratch.

### Bundle B — Media / embeds

**Partially built, and the contract changed underneath it** (see §3). What exists:
- `src/media/bootstrap.ts` + test — registers a core transform at boot
- `src/server/http/site/render.ts` — `mediaTransformVersions` map (keyed by
  transform *name*, resolved once per render) + `MAX_MEDIA_REF_ID_LENGTH` /
  `PLAUSIBLE_MEDIA_REF_ID_PATTERN` path-safety validation
- `apps/admin/src/lib/media-image-extension.tsx` — TipTap node holding
  `{assetId, transformName}`
- `apps/admin/src/components/MediaPickerDialog.tsx` — library picker
- `src/server/deps.ts`, `src/server/routes/site/pages.ts`,
  `apps/admin/src/features/posts/*` — partially wired
- `src/server/__tests__/routes/media-site-serving.test.ts`

**All of it survives the contract change.** The generic scanner was *not* built.

---

## 3. DECIDED: the generic embed contract

The owner reviewed the design and chose this. It replaces the per-kind
attributes (`data-widget-embed`, `data-form-embed`, and the `data-media-embed`
that was about to be added).

**Why:** there are **two independent scanners** that must stay in sync —
`src/widgets/html-embeds.ts` and `src/core/entry-refs/extractor.ts` (whose own
comment admits it is "duplicated here"). Every new bespoke attribute doubles that
burden, and a drifted pair means the dependency index silently disagrees with the
renderer.

### The shape (for `"html"`-format Pages' `body_html`)

```html
<div data-embed-type="widget" data-embed-id="{instanceId}"></div>
<div data-embed-type="form"   data-embed-id="{formId}"></div>
<div data-embed-type="media"  data-embed-id="{assetId}" data-embed-variant="thumb"></div>
```

### Rules, all settled

1. `data-embed-type` is the discriminator: `widget` | `form` | `media`.
2. `data-embed-id` is authoritative whenever present and resolvable.
3. `data-embed-name` is an optional authoring convenience, used **only** when the
   id is absent or unresolvable. **Best match: exactly one match resolves; zero
   or more than one degrades to the placeholder, never a guess.** On a successful
   name resolution, **normalize** by writing the resolved id back, so stored
   content converges on ids and survives a rename. Keep the name for legibility.
4. `data-embed-variant` carries media's `transformName`. Other types ignore it.
   Chosen over encoding in the id (`"assetId:thumb"` is stringly-typed and breaks
   on ids containing `:`) and over a JSON blob (escaping hazard; the AI would have
   to emit valid escaped JSON inside an HTML attribute).
5. **Audio, video and image are NOT separate types.** All one `media` asset
   differing by stored mime; the resolver dispatches on mime to emit
   `<img>`/`<video>`/`<audio>`. Making the author pick at write time breaks
   silently when an asset is replaced with a different format.
6. **Genericity belongs in the scanner, not the renderer.** One scanner over
   `[data-embed-type]`, a registry mapping type → resolver, and **each resolver
   validates its own payload and does its own escaping.** A generic renderer
   would be a security hole — the reason `render.ts` discards `src` today is that
   different sources carry different trust levels.
7. Unknown `data-embed-type` degrades to the existing placeholder. Never raw.
8. **No backward-compatible aliases** — owner chose strictness over compat code.
   `data-widget-embed` / `data-form-embed` are removed, not aliased.
   **Exactly one live row carries them: `posts.slug = 'glassmorphic-landing'`.**
   Write a real migration (ADR-041 infrastructure, `src/db/`) rather than
   hand-editing, but the local blast radius is one page. Verify it still renders.
9. `MAX_HTML_EMBEDS_PER_PAGE = 50` and the id-length bound stay.

### Scope boundary
This governs **`body_html`** (html-format Pages). **Posts use TipTap `bodyJson`**,
where refs live as node attrs `{assetId, transformName}` per ADR-027 — that stays.
Both paths must share the same `/m/` URL contract and the same registered transform.
Legacy `src`-only TipTap nodes **must keep degrading to the placeholder** — the
owner has real content, and emitting an authenticated or external URL on public
HTML would be a security regression.

---

## 4. Product gaps found — all verified empirically, not inferred

1. **Public media 404s for every asset.** `/m/{assetId}/{transform}.v{n}/…`
   requires a row in `transform_registry`; the table is empty and
   `registerTransform` has **zero callers outside tests** across both repos —
   including plugins, migrations, seeds, and agent tools. Confirmed by real HTTP
   request. A rendition already exists on disk for the sole asset and is
   permanently unservable, because the resolver checks the transform definition
   before it ever looks for the rendition.
2. **`render.ts` discards `attrs.src` unconditionally** for TipTap image nodes,
   rendering an aspect-ratio placeholder. Deliberate: no value `src` can hold
   today (data: URL, external URL, or the *authenticated* admin preview route
   `Media.tsx` uses) is safe on public unauthenticated HTML.
3. **Widgets and menus cannot be placed in Posts.** `widgets_insert_embed`
   resolves `hostEntryId` against the generic `entries` table; Posts/Pages live in
   `posts`. A real post id 404s (`WIDGETS_INSTANCE_NOT_FOUND`) — reproduced
   directly over HTTP, independent of any model run. The code discloses this
   itself at `src/server/routes/site/pages.ts:104-111`.
4. **Theme regions are inert.** None of the 8 shipped `theme.json` files declares
   a `regions` field, so `resolvePageWidgets` never iterates anything, on any
   route, on any theme. Proven empirically: a widget bound to both `header` and
   `footer` renders on neither the home page nor a published post. Committed as a
   trip-wire test.
5. **`menus_assign_location` is a dead tool.** It writes a binding with **zero
   consumers** in any site route. The assistant can call it, get a success, and
   nothing happens.
6. **The taxonomy schema has no foreign keys.** `taxonomies`, `terms`,
   `entry_terms`, `taxonomy_revisions` are plain columns. Every safety property
   must be written by hand.
7. **No delete API existed** for taxonomies or terms — seven routes (create,
   rename, assign, merge, list, deps) and nothing that deletes.

---

## 5. Other decisions

- **ChatFab:** `pinnedByUser`, true only after a real drag-and-drop, gates the
  dock-avoidance clamp. The untouched default still avoids the composer send
  button (a real Playwright-caught bug); a deliberate drop is respected, including
  onto the dock. The **viewport clamp is never gated** — that's what stops a FAB
  being stranded off-screen. Legacy stored positions migrate as `pinnedByUser:
  false`, so an existing dragged position gets clamped once until re-dragged.
  Accepted trade-off: an explicit drop on the send button will cover it.
- **Taxonomy delete = guarded hard delete, not a merge-style ceremony.** Merge
  earns plan/confirm/execute because it *migrates* data; deleting an unassigned
  taxonomy destroys nothing recoverable. A second guard was added beyond the
  original spec: refuse when a term still has **children**, which would otherwise
  be orphaned.
- **Delete is deliberately NOT exposed as an AI agent tool.** A destructive tool
  needs its own risk-classification/confirmation decision.
- **Workspaces: no defect found, left untouched.** Checked pixel-for-pixel against
  `Roles.tsx` and `Recovery.tsx`; before/after screenshots are identical files.
  The owner's complaint appears to be dominantly about Taxonomy. **Still worth
  re-asking with a specific target.**
- **`soon` rows:** opt-in `soonPreviewable` in the Jini package rather than
  changing the default, so every existing `soon` item behaves exactly as before.

---

## 6. OPEN QUESTION for the owner

**Should widget/menu embedding be built into Posts?** It is not a bug — it was
never built (see gap #3). Building it means a host-resolution path into the embed
service plus a render branch, touching `render.ts`.

Given Pages were deliberately made the AI-authorable composition surface,
**"Pages compose, Posts stay prose"** may be the coherent answer rather than a gap
to close. Owner has not decided.

---

## 7. Traps measured this session — do not rediscover

1. **`mutation-sweep.mjs` has four blind spots.** It only mutates `if` statements
   and `??` fallbacks, so **a guard written as an `&&` expression slips past
   silently** (the ChatFab fix was exactly this — `const avoidDock = dockOpen &&
   !persisted.pinnedByUser` — and had to be verified by hand). It **refuses to run
   on a file with uncommitted changes** (needs a clean restore baseline). It
   **cannot target the Jini repo** — it hardcodes `apps/admin` for runner choice
   and diffs against Tovu's git root. And it has **no operator for array
   reordering**. Use revert → confirm-red → restore by hand in those cases.
2. **`SendMessage` silently fails to deliver, and a send RESUMES a stopped
   agent.** At least five messages returned success and never arrived. Worse: a
   resend to an agent killed via `TaskStop` revived it from its transcript, so two
   agents worked the same files concurrently. Number messages and require
   paraphrased acks; if you kill an agent, do not message it again.
3. **Spreading a test-double object snapshots its getters.** `{ ...baseDeps(), … }`
   disconnected a `watermarkStamps` getter from its closure and left an assertion
   **spuriously green**. `Object.assign(baseDeps(), {…})` does not.
4. **`settings-ui-section--page-flow` suppresses the shell's header AND flattens
   its card.** Correct for `AiAssistant.tsx`, which renders its own `.page-header`
   above the shell; wrong anywhere without one. Copy-pasting it is how the
   placeholder tab screens lost their card.
5. **`Taxonomy.tsx`'s header comment named the wrong file.** It claimed
   `Settings.tsx` as its structural reference, but `/admin/settings` routes to
   `SettingsUi.tsx` (`panels.tsx:525`) — `Settings.tsx` is the raw namespace/key
   debug ledger. Taxonomy inherited a debug tool's two-column grid (reserving a
   dead detail column with nothing selected), tighter padding, and **monospace
   term names**. This is the third confirmed case of a long, evidence-shaped
   comment in this repo encoding inference as observation.
6. **Nav ordering has no explicit `order` field.** `authentication` sits between
   Users and Roles purely by array position in `ADMIN_PANELS`; `buildNav`'s stable
   sort falls through to registration order. Now covered by an adjacency test.

---

## 8. Do this first, next session

1. **Finish Bundle A's backend** — atomicity + TOCTOU via the existing
   `ContentDbTransaction`, orphaned revisions, workspace-scoping mutation proof.
   Then commit taxonomy front-to-back as one change.
2. **Implement the §3 embed contract** — generic scanner + registry, collapse both
   existing scanners onto it, three resolvers, the `glassmorphic-landing`
   migration, then finish media in Posts and Pages. Verify against the **public**
   site, never the admin preview.
3. **Ask the owner** the §6 Posts question, and re-ask for a specific Workspaces
   complaint (§5) — screenshots are already at
   `ADS-memory/reports/visual-parity-taxonomy-workspace/`.
4. **Optional cleanup:** `Taxonomy.unit.test.tsx` has three overlapping `describe`
   blocks for delete, from two agents that ran concurrently. All pass. Left
   deliberately — deleting ~150 lines of passing tests while calling them
   duplicates is how a unique assertion disappears quietly.
