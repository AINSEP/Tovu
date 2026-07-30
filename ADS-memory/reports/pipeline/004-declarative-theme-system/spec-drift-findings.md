# Spec-Drift Findings — Theme System (SPEC-004 / SPEC-002 / ADR-010)

Generated: 2026-07-07 (usability probe — seeded real content pages + drove the site across themes)
Source: Coordinator (inline), evidence-based against `src/` + `themes/` and the SPEC-004 package.

Surfaced while creating real content (site explainer pages + generic posts) and viewing
them across the three themes. Per the framework rule *"fix upstream intent, not downstream
drift,"* each finding is routed to its owning spec/stage rather than patched in code.

## Legend
- **Type** — *Spec stale* (code is right, spec text lags) · *Code unbuilt* (spec is right,
  not implemented) · *Both drift* · *Gap* (neither fully specced nor built).
- **Status** — what was done this pass.

| # | Finding | Type | Owner | Status |
|---|---------|------|-------|--------|
| C1 | Built-in theme ids are `tovu-official/column/signal`; spec said `paper/atlas/glassmorphic` (REQ-07, REQ-10, AC-01/09/11 + behavior/state/traceability/spec-dod). | Spec stale | SPEC-004 | **FIXED** this pass (ids + `tovu-official` fallback reconciled; re-hashed `a5289e06`). |
| C2 | `theme.json` ships a `fonts` array; REQ-02 allow-listed keys + rejects unknown keys → theme would be invalid. | Spec stale | SPEC-004 REQ-02 | **FIXED** this pass (added optional `fonts[]`; tied to REQ-06 as the sanctioned no-`@import` font path). |
| C3 | Required templates mismatch: REQ-01 requires `home.json`+`entry.json`; loader only requires `home.json`; themes ship `home.json`+`post.json` (no `entry.json`). Resolver falls `post→entry` but no theme has `entry.json`; no `page`/`not-found` handling. | Both drift | SPEC-004 REQ-01/03 vs impl | **RESOLVED** (2026-07-07) — Architect chose **(a)**: spec is right, code drifted. Renamed built-in `post.json`→`entry.json` in all three themes (entry = the base template); loader now requires `home`+`entry`; `post`/`page` remain optional overrides that fall through to `entry` (REQ-03/AC-07). Spec text unchanged (already correct); no re-hash. `page`/`not-found` templates still deferred (not in the spike's two routes). |
| C4 | No `kind` field → no post/page distinction. Visible symptom: explainer *pages* (`/about`, `/plugin-api`, `/self-hosting`) leak into the blog feed on list-style themes (`column`/`signal` home `entry-list` lists all 8 published entries). | Code unbuilt | SPEC-002 | **OPEN** — build `kind`; exclude `page` from post listings. |
| C5 | No content-create API. Only `GET`/`list`/`update` posts exist; new content must be hand-seeded in `src/server/seed.ts`. | Code unbuilt | SPEC-002 authoring | **OPEN** — build create/edit routes for entries. |
| C6 | No theme validation / CSS-sanitization pipeline (REQ-06). `theme.ts` does a shallow parse only; INV-01 CSS surface is unenforced (security-critical). | Code unbuilt | SPEC-004 REQ-06 | **OPEN** — top Architect item (build-vs-adopt a CSS parser, already flagged RT-005). |
| C7 | No inline `link` mark. `renderMarks` supports `bold/italic/code` only, so content cannot link to other pages; cross-page nav lives only in theme nav/footer. | Gap | SPEC-002/004 REQ-04 vocab | **RESOLVED** (2026-07-07) — added a `link` mark to `render.ts` (`renderMarks` + `safeHref`: allows `/…`, `#…`, `http(s)://`, `mailto:`; collapses `javascript:`/`data:`/non-string to `#`). Seed `link()` helper added; `how-themes-work` now cross-links to `how-plugins-work`/`plugin-api` in prose. 5 unit tests in `src/server/http/site/__tests__/render.test.ts`. **Residual:** list the `link` mark in the SPEC-002/004 REQ-04 doc-vocabulary on next spec touch (renderer leads the spec text — minor). |
| C8 | Content-page (`entry-content`) layout is not responsive on wide screens: `.wrap` centered at 75rem but `.prose` is `max-width:42rem` with no auto margins → article left-anchored, right half empty at ≥1600px. (This is the "doesn't respond when stretched" report.) | Theme polish | `themes/*` CSS | **OPEN** — captured in `TODO.md §4` with a visual-regression test; fix = center the entry column. |

## Notes / residual tidy (non-blocking)
- SPEC-004 Problem-Statement / "Why now" / Success-signal / Scope still use *porting* /
  *equivalent-to-old-CSS* framing (REQ-07 now states these are new themes, not ports).
  Cosmetic; tidy on the next spec touch — no id is misnamed.
- ADR-010 §1 already says interactivity comes from core/plugin components (not the theme);
  the `tovu-official` **home** template bakes marketing copy into the theme template
  (arrangement carrying content). Acceptable for a landing theme, but worth noting against
  the "content is data" thesis — that copy is not editable as content entries.

## Recommended sequencing
1. **C1/C2 — DONE** (spec reconciled to the shipped spike).
2. **C3 — DONE** (2026-07-07): entry.json base template hierarchy implemented; loader requires `home`+`entry`.
3. **C7 — DONE** (2026-07-07): inline `link` mark + href sanitization + tests; content can cross-link.
4. **C6** — the security-critical validation pipeline (now the top open Architect item). Strategic weight raised: the
   "install any theme from a stranger safely" claim is only *true* once C6's positive-allowlist CSS sanitizer exists.
   Build-vs-adopt a CSS parser (RT-005). Recommended next.
5. **C4/C5** — SPEC-002 implementation (`kind` field + content-create API); the biggest usability unlock. C4 also fixes
   the visible bug where explainer *pages* leak into list-theme blog feeds.
6. **C8** — content-page wide-screen centering (`themes/*` CSS), guarded by the visual-regression suite (TODO §2/§4).
