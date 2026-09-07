# 2026-09-06 — ADR Index reconciliation + theme naming drift

CodeBase Analyzer(Execution). Persona: `AI-Dev-Shop/agents/codebase-analyzer/skills.md` (loaded).

## Item 1 — ADR-INDEX.md fixes (DONE, commit `b357e70c`)

**Claim 1 (7 ADRs missing): PARTIALLY HELD.** Verified by reading every named ADR file directly.

| ADR | Verdict | Reason |
|---|---|---|
| 053 | **Correctly absent** | File header: "DRAFT — not accepted... **Do not add to ADR-INDEX.md until a human accepts it.**" Still DRAFT. |
| 055 | **Correctly absent** | Same self-imposed hold, verbatim. Still DRAFT. |
| 056 | **Correctly absent** | Same self-imposed hold, verbatim. Still DRAFT. |
| 057 | **Correctly absent** | Same self-imposed hold, verbatim (amended 2026-08-20, but status line unchanged: DRAFT — not accepted). |
| 059 | **Genuinely missing — added** | Accepted 2026-08-18, no hold-back instruction. |
| 063 | **Genuinely missing — added** | PROPOSED 2026-08-31, no hold-back instruction; matches the existing convention of indexing PROPOSED ADRs (048/058/060/062 already are). |
| 064 | **Genuinely missing — added** | PROPOSED 2026-08-31, no hold-back instruction. |

So the "index omits ADR-059" half of the claim was correct and material (an Accepted, live decision was invisible). The blanket "seven ADRs are missing" framing was not — four of the seven are missing *on purpose*, by their own explicit instruction, and adding them would have misrepresented unaccepted drafts as indexed decisions. Added a footnote to the index (right after the header) documenting this so the gap doesn't get "fixed" again by someone who hasn't read all four files.

**Claim 2 (ADR-047 stuck below Accepted while its code is live): HELD, with a correction to the framing.** The index text at the old line 54 already said exactly what is true — "Debate cleared... owes `/audit-work` before ACCEPTED" — so there was no *wrong* text to fix. The real defect is that the index gave no visibility into *why* that gap still matters: the widgets implementation is real and current (`apps/website/src/features/widgets/`, 19 files: `agent-tools.ts`, `write-service.ts`, `resolver-service.ts`, `region-area-service.ts`, etc. — commits from 2026-08-28 through 2026-09-05, including a fix as recent as `4c825f6a`), and its only `/audit-work` run (`ADS-memory/reports/external-audit/runs/20260721T171409Z-adr047-widgets-external-audit-report.md`) is a **FAIL**: agy 6.0/10 (floor 8.5), blocking gate FAIL on two findings (`FINDING-WIDGETS-002` no `widgets.read` accessor; `FINDING-WIDGETS-003` `trashWidgetInstance`/`purgeWidgetInstance` skip `entry_refs` retraction). No re-audit has run since, despite ~6 weeks of further commits that may or may not have addressed those two findings. I did not invent an acceptance and did not check whether the two findings are now fixed (out of scope for a report-only pointer, and touching `apps/website/src/features/widgets/*` risks colliding with whichever agent owns that code right now). Added this as an explicit note on the ADR-047 row, kept status un-changed (not Accepted), and named it as an owner decision (re-run `/audit-work`, or explicitly accept the residual risk).

**Commit:** `b357e70c` — "docs(architecture): reconcile ADR-INDEX with three missing ADRs and the ADR-047 audit-gap". Only file touched: `ADS-memory/reports/architecture/ADR-INDEX.md`.

---

## Item 2 — theme naming drift (investigation only — COMPLETE, no files changed)

**Overall verdict: the raw filename divergence is real, but the "silent breakage on reinstall" framing does not hold.** Two of the claim's premises are false (checked directly, not inferred): `sites/` is not gitignored (hasn't been since 2026-08-31), and the resolver does not naively "expect" only the new names — it carries a deliberate, dated, well-documented compatibility shim built the same week as the rename, specifically for this situation.

### 1. Exact filename inventory per location

| Location | Tracked? | Filenames present |
|---|---|---|
| `content/themes/static/basic/render/pages/` (the seed `tovu init` copies for **every new site**, per ADR-012) | Git-tracked, un-ignored | OLD only: `blog-post.html`, `blog-sidebar-template.html`, `blog.html`, `page-shell.html` (+ non-renamed pages) |
| `sites/tovu-com/themes/static/basic/render/pages/` (the **live** site) | Git-tracked as of 2026-08-31 (`.gitignore:42`: "sites/ is now TRACKED") | NEW only: `posts-default.html`, `posts-sidebar.html`, `pages-default.html`, `listing-default.html` (+ non-renamed pages) |
| `sites/tovu-com/themes/__original-themes__/static/basic/` (per-site "reset to original" catalog, `THEME_CATALOG_DIR`) | Git-tracked | OLD only, and older still — no `page-shell.html`/`pages-default.html` at all (pre-dates that file's introduction) |
| `content/themes/__original-themes__/static/basic/` (seed's own original-catalog) | Git-tracked | Same OLD-only, pre-`page-shell.html` set |

**A 4th rename ADR-065 never documents:** `blog.html` → `listing-default.html`. ADR-065's text only lists 3 renames (`blog-post.html`→`posts-default.html`, `blog-sidebar-template.html`→`posts-sidebar.html`, `page-shell.html`→`pages-default.html`). The live theme.json's `templates` array shows a 4th, undocumented one: `blog.html` was removed from `pages` and re-added to `templates` as `listing-default.html`. This is drift in the ADR itself, not just the filesystem — worth a follow-up correction to ADR-065 (not made here, out of scope: Item 2 is investigation-only).

### 2. What the resolver expects, on every render path that matters here

`basic` is a **static-tier** theme (`theme.json` `"tier": "static"`), so only the static-tier resolution path applies — the templated-tier preview machinery (`theme-page-preview.ts`, Liquid/Handlebars sandboxes) is for a different tier and never touches this theme's filenames.

For static tier, there is exactly **one** implementation of "`templateChoice` string → theme file," `resolveTemplate()` in `apps/website/src/features/theme/static-render.ts:794`, called from exactly one place, `apps/website/src/server/inbound/public-http/routes/site/pages.ts:780`. The export pipeline (`apps/website/src/platform/export/route-manifest.ts`) does not re-resolve templates itself — its own file header states it deliberately reuses "the SAME selection logic the real public routes render with... rather than re-deriving" it, precisely to prevent this kind of drift. So live serving and export do **not** diverge on this specific question; I could not find a third, independent template-filename resolver anywhere in the tree. (I could not fully rule out that "three render paths diverge" — a standing fact recorded elsewhere — refers to some other divergence entirely; I found no third resolver for *this* specific naming question, which is as far as this investigation needed to go.)

That one resolver already carries two deliberate, dated compatibility shims, both built the same week as the rename:

- `LEGACY_TEMPLATE_FILENAME_ALIASES` (`static-render.ts:730`): `{"blog-post": "posts-default", "blog-sidebar-template": "posts-sidebar", "page-shell": "pages-default"}`. Consulted only as a fallback inside `resolveAgainstTheme`, after a direct `theme.pages[id]` lookup misses. Its own doc states the exact intent: keep every row whose stored `templateChoice` still names an OLD filename "rendering byte-for-byte identically after the rename... AND on every one of the five other installed static themes that still ship the old names," and states explicitly this is a one-way, temporary shim, removable only once every installed static theme ships the new names AND no row still stores an old one.
- `STATIC_TIER_PAGE_SHELL_IDS = ["pages-default", "page-shell"]` (`static-render.ts:913`): the closed-vocabulary page-shell lookup (bypasses `templates` entirely, per ADR-065) tries both names in order, new first, for the same reason.

`seed.ts` (new-site creation) was updated in lockstep, not left to drift: it explicitly seeds a new site's Home page with `templateChoice: "page-shell.html"` — the OLD name — with an inline comment stating this is deliberate because the **seed theme** (`content/themes/static/basic`) itself was never renamed, so a freshly-seeded site's choice matches its own theme's real filename directly (no alias needed).

### 3. Verified against the live database — the risk is real, but it's the mechanism already built to handle it, not a hidden gap

Queried `sites/tovu-com/content.db`'s `posts` table directly:

```
blog-post.html                16 rows (13 post, 3 page)
blog-sidebar-template.html     5 rows (3 page, 2 post)
page-shell.html                6 rows (page)
                             --- = 27 OLD-named rows, matching the code comment's own "27 counted 2026-09-03" exactly
pages-default.html            33 rows (page)
listing-default.html           1 row  (page)
posts-default.html             1 row  (post)
index.html                     1 row  (page)
```

So both directions are live simultaneously on the same site today: 27 rows still reference OLD filenames the live theme no longer ships (handled by the alias — confirmed correct), and 35 rows already reference NEW filenames written since the rename (by the admin editor's picker, post-2026-09-03). The alias map only translates OLD→NEW, not the reverse — a stored NEW-named choice resolved against an OLD-named-only theme (e.g. if the site's active theme were ever switched, or the seed theme used for a fresh copy) would miss both the direct lookup and the alias, and fall through to `resolveTemplate`'s existing, pre-existing, and separately-documented graceful degrade: the theme's first-listed template, not an error and not a 500. This asymmetric-direction gap is real, but it is not new, not silent, and not specific to this rename — it is `resolveTemplate`'s own already-documented general property of `templateChoice` ("theme-relative but not theme-scoped... switching the active theme strands every explicit choice at once... falls back", same doc block, written before this investigation).

### 4. Would a reinstall actually break it?

**No, not in the form the claim described.** Checked directly:

- **"`sites/` is gitignored" is false.** `.gitignore:42`: "2026-08-31: sites/ is now TRACKED." `git ls-files sites/tovu-com/themes` returns 214 tracked files; `git check-ignore` on the renamed live files returns nothing (not ignored). A plain git-based reinstall (fresh clone / redeploy) reproduces the current renamed live state exactly — nothing is lost.
- **A fresh `tovu init`** still copies the un-renamed seed (`content/themes/static/basic`, old names) — by design, and `seed.ts` was already updated to seed matching old-named choices, so a brand-new site is internally consistent on day one.
- **The one place genuine staleness exists:** tovu-com's own per-site "reset to original" snapshot (`sites/tovu-com/themes/__original-themes__/static/basic/`) was never refreshed for the 2026-09-03 rename and doesn't even contain a `page-shell.html`/`pages-default.html` at all. Read the reset route (`server/inbound/admin-http/routes/themes/explore.ts`): reset for a non-compiled theme (basic has no `build` field) is **per-file only**, the file picker lists only files that currently exist in the **live** theme (so `blog-post.html` etc. don't even appear as resettable through the UI), and attempting to reset a file with no catalog counterpart returns an explicit `409 NOT_IN_ORIGINAL` rather than silently deleting anything. So this staleness is real but inert today — not a live break, and structurally guarded against becoming a silent one.

### 5. Recommended minimal safe fix (not executed — Item 2 is report-only)

1. Correct ADR-065's text to record the 4th rename (`blog.html` → `listing-default.html`) that actually shipped, so the ADR matches the code.
2. Decide, deliberately, what to do with tovu-com's stale `__original-themes__/static/basic` snapshot — either refresh it to match the renamed live theme, or add a one-line note that it is intentionally frozen pre-rename. Low urgency (§4's guard rails already prevent a silent bad outcome) but worth closing so "the original" stops quietly meaning two different things.
3. No urgent code change is needed on the resolver itself — both shims are correctly scoped, dated, and self-documenting about their own removal condition. If the owner wants the **seed** theme (`content/themes/static/basic`) to also adopt the new naming (so every future new site stops perpetuating the old convention forever), that is a separate, larger decision — it touches `seed.ts`'s current explicit choice and the seed theme's own `theme.json`, and is exactly the kind of "its own scoped job" the dispatch anticipated, not something to fold into this pass.
