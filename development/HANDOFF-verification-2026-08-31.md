# Handoff — verification backlog, 2026-08-31

From session `tovu-4a`. Everything below is **built and committed but NOT confirmed working in a
real browser or against real data**. The job is to verify each one, and fix what does not hold up.

Nine commits landed tonight: `c083dc36`, `9fe26647`, `82427b43` (Jini), `486e9626`, `65121ab1`,
`597eddcf`, `3cce7d0b`, `458cc535` (Jini), `2aaca610`.

## Ground rules

- **Scoped test runs only — never a bare `npm test`.** `apps/admin`: `npx vitest run <path>` from
  `apps/admin`. `apps/website`/root: `node --import tsx --test --experimental-test-module-mocks "<glob>"`.
  Jini packages: `npx vitest run <path>` from the package dir.
- Dev server is RUNNING (API :3000, admin :5173, sqlite `sites/tovu-com/content.db`). The owner is
  watching :5173. **Ask before restarting or killing anything.**
- Complexity ceiling is **9**. Every bug fix ships a regression test that fails first.
- Jini's `dist/` is gitignored with no hot-reload; a source edit there needs a rebuild, and
  `apps/admin`'s Vite dep cache can still serve a stale copy after.
- The owner's standing preference: **do the work in subagents**, not inline.

## 1. Codex tool access — HIGHEST VALUE, partially verified

`458cc535` added a `'codex-toml'` MCP injection strategy so Codex-backed runs finally receive
Tovu's tools (previously it had NONE and fell back to Bash for everything). Unit-tested and the
daemon was restarted, but **never confirmed that a real Codex run actually calls a Tovu tool.**

A session-`tovu-4a` subagent (`contact-form-test`) was mid-run on exactly this via the headless
probe (`agent-run-probe.mjs`) and may not have reported. Re-run it if not.

The test: ask the assistant *"put a contact form in the /contact page at the bottom, I want to test
that it actually works on the front end if I fill it out"* and assess FOUR things separately:
1. Did a tool catalog reach the agent at all?
2. Which tools did it call, in order — `forms_*`, or Bash again?
3. Is the RESULT right? A form that renders but POSTs nowhere is the same failure in a nicer
   costume. Tovu has a real path: `POST /forms/:slug/submit`, a `contact-form` widget resolver, and
   registered `forms_*` tools.
4. Did it edit `content/themes/static/**` via Bash again? Those files are destroyed by
   `tovu upgrade`, which was half the original complaint.

"Tools delivered but it still chose Bash" is a DIFFERENT and important finding from "no tools
arrived" — that would mean the documented selection/ranking problem is now the live issue. Do not
blur them.

## 2. Slug-addressable embed markers — UNCOMMITTED, needs an owner decision first

Working tree has 8 modified files implementing `{"type":"widget","slug":"contact-form"}` as an
alternative to the UUID form. Not committed because of an open conflict:

**The owner asked for `{"type":"form","slug":"..."}`. The agent shipped `type:"widget"` instead**,
because `type:"form"` was deliberately REMOVED on 2026-08-10 and `features/theme/validation/markup.ts:79`
actively errors on it today ("'form' was removed 2026-08-10 — embed a contact-form widget instead").

**RESOLVED 2026-08-31 — the owner chose to KEEP `type:"widget"`.** Do not reinstate `"form"` and do
not add an alias for it; `markup.ts` and `KNOWN_EMBED_TYPES` stay as they are. The UUID was the real
complaint and the slug fixes it. This work is unblocked for commit.

Verify once decided: slug resolves, UUID still resolves, unknown slug degrades to placeholder.

**Disclosed gap — owner chose 2026-08-31 to SHIP it and close it later** (blast radius is one
widget, and it is owner-protected): a slug-only marker is INVISIBLE to `entry_refs`/safe-delete's
where-used check — `extractHtmlEntryRefs` is deliberately I/O-free and cannot turn a slug into a
UUID. You could delete a widget a page is actively using. Pinned by a regression test rather than
silently shipped. Closing it needs either widening that function's contract or normalizing slug to
id at Pages' write time.

Also scoped out: `post`/`content` are DB-ready for the same treatment; `media` has NO slug column
and would need a real migration.

## 3. Widget slug generation auto-suffixes — owner wants this changed

Widget slugs get random hex appended on collision: two widgets titled "Contact Us" became
`contact-us-ad733823` and `contact-us-1af789d3`. That defeats the memorability the slug feature
exists for. Owner: *"people should be able to just rename it however they please."*

Wanted: authors can set a slug freely; duplicates are rejected so the author picks another, rather
than silently uniquified. The unique index is `entries_workspace_type_slug_unique` on
`(workspaceId, type, slug)`, so the constraint already exists — this is about the generation path
and the admin UI surfacing a rename.

Note: `29721c44-a811-444f-b7b5-e61a9918a3a9` was manually renamed to slug `contact-form` by direct
SQL. That is real data the owner wants kept.

## 4. Form fields table min-width — NOT visually verified

`597eddcf` fixed the fields table clipping with the assistant dock open (`table-layout: fixed` +
percentage widths meant the table could never overflow `.table-scroll`, so there was nothing to
scroll). Fixed with `min-width: 720px`.

**No automated test is possible** — `apps/admin/vitest.config.ts` sets `css: false`, so jsdom
applies no real CSS. Needs one manual check at `/admin/forms/contact-us` with the dock open.

## 5. Visitor site-chat widget — verified by curl, not by a human

`2aaca610` fixed the public assistant not rendering on static-tier themes (they bypass
`pageShell()` entirely — a FOURTH render path beyond the three this repo documents as diverging).
`curl :3000` confirms the mount div, script, and 200s on both assets. **Nobody has confirmed the
widget actually opens and talks to the daemon in a browser.**

Known disclosed gap: the themed 404 and the "template not configured" diagnostic page still do not
inject it, deliberately, matching this file's existing `extraHead` convention.

## 6. Attachment upload E2E — passing, but the CI story is missing

`c083dc36` removed the composer's `attachmentAccept` filter (any file type now attaches; the 20 MB
per-file / 50 MB batch / 200 MB store caps are the only gate) and stopped the daemon dropping
non-image attachments before the agent was told about them.

`npm run test:e2e:attachment-picker` covers 14 file kinds and passes (5/5, ~45s).
**But `.github/workflows/` has ONE workflow and NO Playwright/e2e job at all**, so none of this runs
on push. Wiring that is real, unstarted work.

## 7. Dead-test sweep — UNOWNED, and the reason it matters

Two admin test files were silently running ZERO tests: their `@jini-ai/chat/react` mock omitted
`MCP_UI_EXT_EVENT_NAME`, which the component reads at import time, so the file threw on import and
reported as ONE file-level error while the run's headline `Tests` count still looked healthy. Both
are fixed. **The general case was never swept.**

The tell: `Test Files N failed` alongside a passing `Tests` total. Worth a full-suite pass looking
for that shape, because it is invisible in a green-looking summary.

## 8. Adversarial coverage of the confirmation flow — a real hole

`development/e2e/surface-abuse.spec.ts` has 19 tests across 4 skipped groups. They are correctly
skipped: ADR-055 replaced the mint-token-then-redeem confirmation flow with a live `emitSurface`
human-in-the-loop exchange, so every one of them attacks a token that no longer exists.

**Consequence: the CURRENT confirmation flow has no adversarial coverage at all.** That is new test
work against the live-agent-mediated flow, and a priority call for the owner.

## 9. Remaining UI backlog

`development/ui-fixes-backlog.md` items 3 and 4 are still open. Item 3 is cosmetic (a popover
scrollbar shift, in Jini, needs a rebuild). Item 4 is not a fix at all — the External MCP agent-tool
domain is fully built but wired into no registry anywhere, and needs a ship-it-or-delete-it decision
from the owner.

## 10. Antigravity still has no tools

Deliberately left unwired with evidence in `antigravity.ts`'s own comment — live probes ruled out
every candidate (no per-run config flag, no `CODEX_HOME`-equivalent in the binary's strings, and a
seeded workspace `.agents/mcp_config.json` is invisible to both `agy mcp list` and a real headless
run). The only real mechanism is a global config with no relocation path. Ten other CLIs
(aider, amp, copilot, cursor-agent, deepseek, grok-build, pi, qoder, qwen) are also unwired, each
with a documented reason. `deepseek` is the cheapest remaining candidate: `DEEPSEEK_MCP_CONFIG=<path>`
is an explicit run-scoped env override needing only a small new strategy.

---

# Corrections and additions (from tovu-fb, verified by tovu-4a)

## Owner decisions — both RESOLVED, item 2 is unblocked

- **`type:"form"` vs `type:"widget"`: owner chose KEEP `type:"widget"`.** Do not reinstate `"form"`,
  no alias. `markup.ts` and `KNOWN_EMBED_TYPES` stay untouched.
- **The `entry_refs`/safe-delete slug gap: owner chose to SHIP it** and close it later. Blast radius
  is one owner-protected widget.

The 8 slug-marker files are cleared to commit. Hold only while another agent is editing `render.ts`
— committing under an active agent is the shared-tree hazard that already cost a reverted edit
tonight.

## Correction to what this doc implied about static rendering

`features/theme/static-render.ts` resolves **only** `content`, `menu`, and `partial` marker types.
**There is no `widget` resolution on the static path at all** (verified: `static-render.ts` handles
those three and nothing else).

This does not contradict the working `{"type":"widget","slug":"contact-form"}` embed — that resolves
through the **Pages `body_html`** path (`html-embeds.ts` -> `resolver-service.ts` ->
`renderHtmlPageBody`), not the static-theme path. But a widget marker authored into a static THEME
template will never resolve. This killed a logo-widget design outright on 2026-08-31.

## New trap, previously unflagged: relative image paths in static themes 404 silently

`static-asset-contract.ts`'s `rewriteAssetPaths` rewrites only `../css/` and `../js/`|`../scripts/`.
There is **no rewrite for `../assets/` or `../images/`**, and `findUnrewrittenAssetPaths` does not
scan for them either — so a relative `<img>` in a static theme 404s with nothing anywhere reporting
it. Live footgun for anyone adding images to a static theme.

## 11. Public form pipeline — FIXED and browser-verified, 2 bugs open

The two live contact-form bugs (unstyled form; submit landing on raw JSON) are fixed and
**independently verified in a browser** by a `qa-e2e` pass. Uncommitted, 5 files:
`render.ts`, `forms-submit.ts`, `pages.ts`, `render.test.ts` (115 pass), `forms-submit.test.ts` (13 pass).

**Verified PASS:** real Post/Redirect/Get (303), DB row delta exactly 1 with `data_json` matching
input, JSON contract unregressed (201/400/404), rate limiting (5/60s → 201,201,201,429,429,429 with
correct `retryAfterSeconds`), unknown-slug degrades sanely. **The JS-disabled path is genuine** —
plain `curl` on the redirect target returns the confirmation in the HTML, no script involved.

Root cause of the styling bug was NOT the static-tier/`pageShell()` bypass it was first attributed to:
a repo-wide grep showed **no theme has ever had CSS for `.widget-contact-form`/`.widget-form-field`**.
Fixed with a `:where(...)`-wrapped `<style>` block emitted by `renderWidgetContactForm` itself.
A latent bug was found alongside: that route had no `express.urlencoded()`, so a real JS-disabled POST
would have redirected correctly with **every field silently empty**.

**OPEN BUG A — `hidden` is a CSS no-op on the form.** After a successful submit the confirmation AND
the empty form both render, stacked. `:where(.widget-contact-form){display:flex}` is an AUTHOR-origin
rule, and author origin beats the user-agent `[hidden]{display:none}` regardless of `:where()`'s zero
specificity. Verified live: `getComputedStyle(form).display === "flex"` while
`hasAttribute('hidden') === true`. Any `.widget-*` rule setting `display` has the same hazard —
`.widget-contact-form-success` escapes only because its rule sets no `display`, which is luck, not
design. Fix must be a general `[hidden]` guard.

**OPEN BUG B — a validation redirect wipes every typed field**, not just the invalid one. Inherent to
303 PRG: the fresh GET cannot see the prior POST body. Do NOT fix by putting values in the query
string — names and emails would leak into browser history, server logs, and referrer headers. Use a
short-lived server-side flash keyed by cookie.

**Token gap (confirmed, 4 not 3):** `--danger`, `--danger-bg`, `--success-bg`, `--success-fg` exist in
NO theme's `tokens.json`, so all four fall back to hardcoded light-mode hexes — bright mint/pink cards
pasted onto a dark page. `--border`/`--surface`/`--accent` DO work. Do not fix by adding tokens to
`basic`: themes are COPIED, so the other seven would still lack them. Compose from the existing set.

**Not general yet, owner flagged it twice.** One route (`/forms/:slug/submit`) and one renderer taking
any `formDefinitionId` means every form works TODAY — but the styles, success/error slots and splice
anchor are all scoped to `contact-form` (`widget-contact-form-success`, `data-contact-form-slug`).
A second form-shaped widget inherits none of it. Queued: lift them into a shared form-render module
behind generic `.tovu-form`/`data-form-slug` hooks, keeping `.widget-contact-form` for theme overrides.

**Test data:** `form_submissions` holds ~10 rows, all agent/owner test submissions, traceable by name.
Not deleted — destructive, owner's call.
