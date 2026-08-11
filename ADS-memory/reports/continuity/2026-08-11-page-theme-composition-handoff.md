# Handoff: page/theme composition model — decision pending, plus a completed marker migration

Generated: 2026-08-11
Source: Claude Code (Opus 5, 1M context), Coordinator. Tovu repo, branch `refactor/jini-admin-extraction`.
Target: next session, same machine.
**Nothing has been pushed.** 18 commits landed locally (`ffb54fd..4fced61`).

---

## Next-Agent Prompt

Read this whole file before replying. Then read, in order:
1. `development/docs/architecture/embed-marker-migration.md` — the marker contract.
2. `development/docs/architecture/embed-type-inventory.md` — why `form` was removed, why `menu` stayed.
3. `ADS-memory/reports/peer-review/2026-08-11-codex-copy-vs-inheritance-review.md` — **the decision this session ended on.**
4. `ADS-memory/reports/peer-review/2026-08-11-codex-page-theme-composition-review.md` — the round-1 review it supersedes in part.

**The owner's stated position at end of session, verbatim:**

> "I want to do this simple for now. And then as we build up, we're gonna see some problems. I think we're just trying to over optimize right now."

**Read that as a constraint on you, not a preference.** Two independent peer reviews produced a long list of correct-but-elaborate recommendations (three-way fork-point snapshots, typed regions, render-origin manifests, theme inventories, versioned composition). The owner has explicitly deferred all of it. Do not arrive with a plan to build the elaborate version. The decision to make is small; everything else is recorded here so it can be *revisited when a real problem appears*, not built preemptively.

---

## THE OPEN DECISION — read this first

### Where it stands

The session built **single-level theme inheritance** (`4fced61`), then the owner proposed replacing it with something simpler, and an independent peer review agreed with the owner.

**Current state on disk: inheritance is built, committed, working, and 9/9 tested. The decision to replace it has NOT been executed.** Do not assume either direction has been actioned.

### The owner's proposal (verbatim intent)

> Copy a theme you like, wholesale, into a new self-contained theme. Tag the copy with which base theme it came from. Edit the copy freely. No parent at runtime, no fallthrough, no merge, no tombstones.

Lineage is **metadata, not runtime resolution** — it exists so a future tool *could* offer "your base changed, here's the diff." Git fork-and-cherry-pick, not WordPress child themes.

### Codex `gpt-5.6-sol` (high effort) verdict — the latest opinion, reproduced

Full text: `ADS-memory/reports/peer-review/2026-08-11-codex-copy-vs-inheritance-review.md`. The load-bearing parts:

**Verdict: yes, full copy is the better default for this system. Remove runtime inheritance.**

**Correction 1 — rename the field.** Do not keep calling it `parent`:
> "Rename it to `lineage` or `derivedFrom`; reusing `parent` invites future developers to infer resolution semantics that no longer exist."

**Correction 2 — the win is narrower than claimed.** The Coordinator claimed copying "deletes the entire semantic-update-conflict class." It does not. Platform-level changes (marker contract, parser behavior, sanitization rules, asset-loading order) still break every theme, copied or not. The earned claim is:
> "Runtime base-to-derived semantic coupling is deleted. Upstream integration becomes optional, explicit, and reviewable."

**Strongest case against copying** (it does not win at this scale, but record it):
- Security, accessibility, browser-compat and responsive fixes become fleet-wide patch campaigns.
- Similar copies diverge, so one upstream fix may need several different adaptations.
- Testing grows per copy; shared ancestry stops implying shared behavior.
- "A single operator is precisely the person most likely to forget which copies need a fix; being the upstream maintainer does not mean having perfect update awareness."
- AI visibility improves but is not complete — themes still depend on shared parser/registry/schema contracts.

**Threshold for revisiting** (this is the trigger to watch for, given the owner's "we'll see problems as we build"):
> "If fixes routinely need hand-application to three or more copies, or the installation accumulates roughly twenty live variants, revisit versioned composition."

**The third model, considered and set aside:** immutable versioned composition — a theme importing versioned chrome/token packages with a lockfile, nothing changing until an explicit upgrade. Failure mode: "package-management gravity: version proliferation, compatibility matrices, awkward CSS/DOM boundaries, upgrade tooling." Its own conclusion: "For seven static themes, it is probably more machinery than value."

**On whether the lineage tag is a comforting fiction** — the sharpest answer it gave:
> "The lineage is not fiction if you preserve the baseline and present selective three-way changes. Without the baseline, it mostly is."

A bare source-theme name is decorative. A useful record needs an **immutable fork-point snapshot** (hashes prove identity but cannot produce a diff), enabling three-way comparison: fork-point→upstream and fork-point→copy, classifying each file as upstream-only / copy-only / changed-both / renamed-deleted. A two-way current-vs-current diff becomes noise fast. Also record imported *and rejected* upstream change ids so the same proposal is not re-offered.

**Month-six pain under copy specifically:**
- Nobody knows which copies still contain a known bad footer, script, or a11y defect.
- "Copied from `basic`" becomes misleading after heavy edits.
- Copy-of-copy makes lineage a graph, not one pointer.
- Diffs go noisy after renames/splits/reformatting; binary assets barely merge.
- Platform contract migrations must touch every independent theme.
- AI reinvents the same fix slightly differently in each copy.
- Tests and screenshots needed per live copy.
- Operators will want "apply this fix to selected themes" — i.e. fleet patching.

> "The essential supporting feature is therefore not inheritance; it is a theme inventory showing lineage, fork age, compatibility status, outstanding upstream changes, and known patches."

**Priority shift it recommended:**
- **Dedicated `content` marker — MORE urgent, do first.** Every independent layout needs an unambiguous shell/content contract.
- Typed regions — slightly more urgent (replace implicit DOM conventions with explicit structure; better for AI editing and validation).
- Render-origin manifest — less necessary for parent/child provenance (all files are locally owned now), but still necessary for finished-page editing: knowing whether an edit targets page content, a site-wide footer, a partial, a token, or platform behavior.

**Its concrete recommendation, verbatim:**
> "Delete runtime merge/fallthrough logic, replace `parent` with a structured `lineage` object, preserve an immutable fork-point snapshot, add the dedicated `content` marker immediately, and treat upgrade comparison as optional three-way patch review. That is a coherent fork model rather than inheritance with its runtime behavior switched off."

### Reconciling that with "keep it simple for now"

These are in tension and the next session must not silently resolve it. The minimal reading consistent with both:

- Delete the merge logic (simplification — removes code).
- Rename `parent` → `lineage`/`derivedFrom` (cheap, prevents a future misreading).
- Add the `content` marker (small, and both reviews call it the highest-value next step).
- **Defer** the fork-point snapshot, three-way diff tooling, theme inventory, typed regions, and render-origin manifest until a real problem appears.

The cost of deferring the snapshot is specific and should be stated to the owner: **a copy made before snapshots exist can never be three-way-diffed later.** The fork point is unrecoverable after the fact. If copies are going to be made in the interim, capturing the baseline is cheap now and impossible retroactively. That is the one deferral with an asymmetric cost — everything else can be added later at the same price.

---

## The page/theme model that IS settled

Reached over several rounds with the owner; not in dispute.

**The problem it solves** (owner, verbatim): *"if they're allowed to just create whatever they want, they have to have the responsibility of actually putting in the right stuff. But that's gonna be hard for somebody who doesn't know about HTML, JS — what if they forget the sidebar?"*

**The model:**
- The **theme owns a shell** — nav, footer, sidebar, `<head>` — with a hole in it.
- The **page owns only what goes in the hole.** Never the frame.
- Therefore an author **cannot forget the sidebar**, because it was never theirs; it arrives from the theme on every render.
- Therefore **nothing is ever merged**: page bytes and theme bytes never overlap. No diffing, no rebase, no provenance needed for the page/theme boundary.
- **Styling inherits via CSS + design tokens, not copied markup.** A page looks like the theme because it renders inside the theme's stylesheet. Markup inheritance was never required for style inheritance — this is the insight that unlocked the whole thing.
- `bodyFormat: "html"` stays as the explicit escape hatch: full control, full responsibility, the exception rather than the default.

**Round-1 Codex recommended a naming split that was never actioned:** distinguish `html-fragment` (author owns HTML *inside* a region, chrome remains) from `standalone-html` (author owns the whole document). Calling both "HTML pages" will create confused expectations. Cheap, not done.

**Round-1 also recommended evolving from shell + one content hole → chrome + typed regions**, because a single hole inside `<article>` will not survive a landing page or full-width hero. Deferred by the owner's simplicity constraint, but this is the most likely first real limitation.

---

## What was built and verified this session

### Phase 1 — the marker migration, finished (contract item 1 CLOSED)

The prior session moved 184 markers across 93 theme files onto `data-embed-config` but rewired only one of four consumers. **The site was rendering incorrectly at HEAD.** All four consumers are now on the shared parser `src/core/embeds/marker.ts`, and **no live TypeScript reads a retired attribute.**

- `26447df` — **three real bugs on the post-template path.** (a) `resolvePostTemplate` tested for the literal string `data-embed-id="{{post}}"`, which no theme file contained any more, so *every* post fell through to the "Template not configured" diagnostic page at HTTP 200. (b) `html-embeds.ts` rewired off its own regex. (c) The important one: sharing a permissive parser let the page-embed stage *see* theme `partial`/`menu` markers for the first time, and its unknown-type policy substituted the REQ-28 placeholder over them — **deleting the nav, docs menu, and footer of every templated post**. Fixed by `isPageEmbedType` in `resolver-service.ts`: a type with no registered resolver is left exactly as authored, because a LATER stage owns it. `/theme-authoring` went 5247 → 9112 bytes, 3 placeholders → 0.
- `f9bb95b` — entry-refs extractor onto the shared parser. This is the safe-delete integrity path: a reference it cannot parse is reported "unused" and the delete proceeds against a page still embedding the target. That skip was **silent**; it now warns loudly naming the entry and the consequence.
- `fdca1ac` — four operator-facing log lines named retired attributes.
- `275f357` — both entry-refs integration suites migrated. The consistency suite's premise (policing two deliberately-separate regexes for drift) was obsolete; rewritten to pin what is still true, plus a new case that an unparseable marker is dropped by BOTH sides — the asymmetry that would matter, since a page rendering an embed the index has no row for is exactly the state safe-delete must never be in.
- `5436508` — **stored Page bodies were never migrated.** The sweep covered theme files on disk; Page bodies live in `posts.body_html` in `infra/content.db`. `glassmorphic-landing`'s contact form had silently stopped rendering. Migration script is committed, dry-run by default, prints reversal SQL, refuses to write a body the parser rejects, idempotent.
- `47af7b2` — **`form` removed as an embed type** (owner's decision). It was sugar over `contact-form`: `resolveFormTypeEmbeds` built a synthetic never-persisted widget instance and routed it through the same resolver. `menu` deliberately KEPT — the owner wants it working in both static and templated tiers.
- `4f54950` + `83bb623` — `npm run check:embed-marker-drift`. Fails on any retired attribute in real attribute position (HTML comments blanked first, so prose about the old vocabulary can't trip it), on any unparseable `data-embed-config`, and on legacy `activeAttr`. Scans 121 theme files + stored Page bodies.
- `65d011a` — `basic/build-preview.mjs` was silently resolving nothing. **Only one such script exists repo-wide**, not one per theme (the migration doc implied otherwise).
- `c207be7`, `66cf2c0` — stale prose and comments corrected.
- `bd7f97a` — `ThemeSlotDescriptor.activeAttr?: string` → `honorsCurrentPage?: boolean`, **additively**: `parseSlots` still accepts a legacy `activeAttr` string for out-of-tree themes. All 6 in-repo `theme.json` migrated, so the legacy arm is dead code in-tree from day one.

### Phase 2 — identity

- `964884f` + `6cdc463` — **admin lookup resolves SLUG first, id second** (owner's explicit instruction). The read-only internal-id field was removed from the post and menu editors. The menu one mattered most: a menu id is minted per-install by `idGen.newId()`, so pasting it into a shipped theme provably cannot work — which is what `ffc0f44` exists to fix.
  - **Correction on the record:** the original doc comment claimed "an id and a slug never collide (ids are opaque UUIDs)." Six rows carry seed literal ids (`post-home`, `post-about`, `post-themes`, `post-plugins`, `post-plugin-api`, `post-self-hosting`). BUT a direct check (`SELECT ... JOIN posts b ON a.id = b.slug`) returns **0** — no id equals any slug. The Coordinator initially wrote that collision up as an observed hazard; the owner caught it. Both the original claim and the overcorrection are recorded in the code comment so the next person re-checks rather than inheriting either.

### Phase 3 — permissions

- `ee7af59` — `PUT /pages/:id/html` had **no permission check at all** (its own header admitted it). Now gated on `content.write`, matching the agent-tool path. Tests certify the REFUSAL, proven by deleting the gate and watching 4/4 go red.
  - **Deliberately NOT `pages.edit_html`** (SPEC-047 REQ-9). `authorize()` matches literal `policy_permissions` rows and never consults the permission catalog; a query of `infra/content.db` returns ZERO rows spelling `pages.edit_html`. Gating on it would leave only `owner` able to edit Page HTML — a functional regression dressed as a security fix. **The seed lives in a separate repo**: `@jini-ai/cms` → `/Users/la/Programming/Jini/packages/cms`, which has the owner's own uncommitted work on its branch. Also needs a `migrateDeprecatedPermissionGrants()`-style retroactive clause, since `seedIdentity` early-returns once an owner exists. **Owner has NOT authorized editing the Jini repo.**

### Phase 4 — theme inheritance (the thing now under review)

- `4fced61` — single-level inheritance via `theme.json`'s `parent`. Per-key fallthrough for pages/partials/tokens/templates/slots; `css` APPENDED parent-then-child; chains rejected; `tokens.json`/`index.html` requirements re-checked against the MERGED theme (validating them against the child alone made a correct two-file child load `invalid`).
- `src/themes/static/basic-child/` — **two files**, a 9-line manifest and a marker-only layout.
- `development/docs/architecture/embed-type-inventory.md` (`fe25a88`) — the decision record the owner asked for.

**Known gap in what was built, from round-1 Codex:** no deletion semantics. The merge is spread-and-`??`, so absence means "inherit" and a child cannot *remove* an inherited page or token. Needs tombstones — or becomes moot if inheritance is deleted.

---

## Test state — all green

| suite | tests |
|---|---|
| `src/core/embeds/__tests__/marker.canary.test.ts` | 9 |
| `src/core/entry-refs/__tests__/extractor-marker.canary.test.ts` | 8 |
| `src/features/theme/__tests__/theme-pages-render.canary.test.ts` | 35 |
| `src/features/theme/__tests__/post-template-render.canary.test.ts` | 6 |
| `src/features/theme/__tests__/theme-inheritance.test.ts` | 9 |

`npx tsc --noEmit` clean. `npm run check:embed-marker-drift` clean. New code within 9/9 cyclomatic/cognitive.

**Run them scoped, never a full suite:** `node --import tsx --test <path>`.

### ⚠️ TWO TEST FILES ARE POISONED — DO NOT RUN THEM

- **`src/features/theme/__tests__/static-render.test.ts` HANGS.** Synchronous, CPU-bound, 100% of a core until killed; `--test-timeout` cannot interrupt it because the event loop is blocked. A zombie ran 34 minutes this session. **The owner pulled agents off this file twice.** Do not debug it.
- **`src/features/theme/__tests__/post-template-resolution.test.ts`** has a pre-existing failure, reproduced against clean HEAD.

Both author the retired vocabulary, and `static-render.test.ts` additionally tests a *transitional* design (both spellings coexisting, plus deprecation warnings) that the no-back-compat decision removed. **Assessment: these test a design that no longer exists and should be DELETED, not migrated.** Their real coverage now lives in the 67 canaries. The Coordinator did not delete them because that is the owner's call. **Raise it early next session.**

---

## LIVE STATE — changes made to the owner's running system

These are not in git. Revert commands included.

1. **Active theme switched to `basic-child`.** The site currently renders through the child theme.
   ```bash
   sqlite3 infra/content.db "UPDATE presentation_settings SET active_theme_id='basic' WHERE workspace_id='workspace-local';"
   ```
2. **Page `our-story` created** (id `page-shell-demo`, `kind=page`, `bodyFormat=doc`, `template_choice=page-shell.html`). Live at `http://localhost:3000/our-story` — 200, nav + footer inherited from `basic`, content injected, zero unresolved markers. **This is the working demonstration of the whole model.**
   ```bash
   sqlite3 infra/content.db "DELETE FROM posts WHERE id='page-shell-demo';"
   ```
3. **Page `glassmorphic-landing` deleted at the owner's instruction** — soft-deleted (`deleted_at` set), NOT purged. Row backed up (see below). Its `entry_refs` were removed. `/glassmorphic-landing` now 404s.
   ```bash
   sqlite3 infra/content.db "UPDATE posts SET deleted_at=NULL WHERE slug='glassmorphic-landing';"
   ```
   **Deliberately NOT deleted:** the `contact-us` form definition (`6eb1ec19-…`, live at `/forms/contact-us/submit`, may hold submissions) and the now-orphaned `contact-form` widget instance (`29721c44-…`, predates the page). The owner was told and did not ask for them.
4. **`glassmorphic-landing` was migrated onto the marker spine before deletion** — its contact form had been silently broken and was fixed, then the page was deleted. Both happened; not contradictory.

**Backup of the deleted row:** `<scratchpad>/glassmorphic-backup.sql` — **this is in the harness scratchpad and will NOT survive.** If the row matters, copy it somewhere durable before the scratchpad is cleaned.

Dev servers: site on **:3000** (hot-reloads), admin on **:5173**. **Do not kill either** — they are the owner's.

---

## Other open items

- **Admin has no UI for any of this.** No template picker for Pages, no fork-a-theme action. `template_choice` was set directly in the database. The picker EXISTS but is only rendered in `PostEditor`, not the Pages editor.
- **Terms of Service renders as `<title>Blog post — Basic</title>`.** Doc Pages fall into the post-template branch and silently take the theme's FIRST declared template. The route branch tests `bodyFormat === "doc"` with **no `kind === "post"` check**, despite a comment directly above claiming "this is deliberately scoped to Posts only." Not fixed; the owner was told twice and did not direct it.
- **Post-list widget** the owner asked for (title, date, summary/first-4-lines) — not built.
- **`pages.edit_html`** — blocked on the cross-repo Jini seed. Not authorized.
- **`{"type":"content"}` marker** — not built. The `basic-child` demo reuses `{"type":"post","id":"{{post}}"}`. **Both peer reviews call this the highest-value next step.**
- **Categories/tags are fully built and entirely unused** — `terms` 0 rows, `entry_terms` 0 rows, one taxonomy literally named `dummy`. Only consumer is `recent-entries`'s `categoryTermId`. Term targets are SOFT refs with no safe-delete guarantee. Nothing depends on them; they can be ignored or deleted at zero cost.
- **Branch rename / push** — open across five handoffs now. Nothing has ever been pushed.

---

## Process notes that cost real time this session

- **Subagents do not receive messages mid-flight.** The owner stated this flatly. A brief saying "message me before you touch X and wait" **deadlocked an agent** until it was killed. Put EVERYTHING in the spawn prompt; ask for reasoning as OUTPUT in the final report, never as a gate. If there are two tasks, put both in one spawn prompt — a follow-up sent after the agent starts will not arrive.
- **Never `SendMessage` an agent after `TaskStop`** — it resumes it from its transcript, and you get two agents on the same files.
- **A late report can arrive from an already-killed agent.** One did; it contained the entire cross-repo permission finding. Read it, do not reply to it.
- Codex dispatch: use the `<<PEER_DISPATCH>>` + stdin pattern. `gpt-5.6-sol` with `model_reasoning_effort="high"` verified working on `codex-cli 0.147.0`, Intel macOS. Smoke-test the exact model/effort pair first. **A failed dispatch still exits 0** — parse JSONL event types for `error`/`turn.failed`. Codex will read `AGENTS.md` on its own initiative even when told not to.
- Heredoc commit messages via the Bash tool corrupted twice (stray `EOF`/`)` appended). Write the message to a file and use `git commit -F`.
- **The Coordinator over-claimed twice, in the same shape**, and the owner caught it once: stating a real but narrow win one size too large ("nothing to merge, ever"; "copying deletes the semantic-update-conflict class"). Both were corrected on the record. Watch for it.

---

## Handoff Contract

- **Inputs used:** live `git log ffb54fd..HEAD`, direct `sqlite3` queries against `infra/content.db`, per-suite scoped test runs with real counts, `npx tsc --noEmit`, `npm run check:embed-marker-drift`, live `curl` against :3000, two Codex `gpt-5.6-sol` peer reviews (both saved under `ADS-memory/reports/peer-review/`), and four subagent reports each independently re-verified rather than taken at face value.
- **Output summary:** lets a fresh session make the copy-vs-inheritance decision from a written record, with the peer review's reasoning intact and the owner's simplicity constraint stated as binding.
- **Risks:** inheritance is built and may be deleted, so do not build on it before the decision; two test files are poisoned and one hangs hard; the live DB and active theme were changed and the only backup of a deleted row is in a non-durable scratchpad; a fork-point baseline not captured now is unrecoverable later.
- **Suggested next assignee:** Claude Code, same repo and machine.
