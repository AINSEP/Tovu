# P7 · Gate debt and release (short)

**Bases:** Tovu `41e948ee4`, Jini `6b8e0d48a`. Sources: `cloud-results/combine-12-tovu.md` (Gates, OWED-LOCAL, decisions 1, 5), `inputs/combine-12-jini.md` (gates, decisions 1–3, 8–9), `inputs/combine-11-tovu.md` (gates, decision 5). Release, tag, publish and push-to-release steps are **owner-gated: listed here, not planned for execution.**
**Owner rules:** as in P1. Size: 500-line files are not a blocker (owner); functions 50/80; complexity ≤ 10; never delete why-comments; owner 11-21: repair size debt in place when the function does not grow and stays ≤ 80, else split first.

## Current gate debt (verified from the reports)
| Gate | Repo | Rows | Source |
|---|---|---|---|
| size | Tovu | Worsened: `A/features/pages/PageEditor.tsx` file 1015 (was 1002), `PageEditor` 221 (220), `PageEditorPane` 128 (125), `A/features/pages/hooks/use-page-editor.hooks.ts` `usePageEditor` 384 (380), `A/features/posts/hooks/use-post-editor.hooks.ts` `usePostEditor` 410 (400) | combine-12 (tv-bugs3b) |
| error gate (WARN) | Tovu | new `catch-reads-error` `W/features/agent-plugins/bundled-id-upgrade.ts` ×5, `W/features/agent-plugins/lifecycle.ts` ×1; worse `use-page-editor.hooks.ts` 2→3 | combine-12 |
| architecture | Tovu | NEW cross-feature edge `site-backup/push-content.ts → source-control/provider-module.ts` (318→319); propagation ratchet 3.26→3.27 (hard metric already failing, C074) | combine-12 (bugs3a B8a) |
| boundaries | Tovu | + `no-circular backup-service.ts → push-content.ts → backup-service.ts` (111→112 warnings) | combine-12 |
| why-comments | Tovu | 80 open (+ `bundled-tovu-theme-package.unit.test.ts:196–197 [3ee47e16609e]`, + combine-11's `share-service.ts:126–131`, `site-search.ts:64–67` — C028) | combine-11/12 |
| complexity | Jini | `refusalError 11` (→ P4-J1), `readConfirmationResume 11` (→ P6-J1), `handleRpcError 12`, `ErrorNotice 11` (BASE-RED) | combine-12 Jini |
| why-comments | Jini | lost: `core/src/errors/reporter.ts:26 [5f57b7820e73]`, `agent-plugins/…/load-supporting-files.unit.test.ts:49 [03c2746c1aa4]`, `kuinetic/__tests__/bundled-package.test.mjs:40-41 [f96a225503a3]`; combine-11 `admin/…/test-runner.ts:10-11 [8559987223a2]` | combine-12 Jini decision 3 |
| error gate | Jini | 24 New + 1 Worse (BASE-RED), 28 improved, `--update` refused | combine-12 Jini decision 9 |
| test script | Tovu | `development/scripts/__tests__/site-plugin-directories.test.mjs` stale import `pluginsInstallDir` (combine-12 decision 5) | |

## Steps

### P7-T1 · Tovu · editor size + error-gate rows (~2 h)
Split, do not grow: extract `PageVersionConflictBanner` + `PageExternalChangeBanner` from `PageEditor.tsx` (`:386–503`) into `A/features/pages/PageEditorBanners.tsx` (also takes P1-T4's handle edit if not landed); extract the post-save recheck/conflict block of `usePageEditor` and `usePostEditor` into `use-editor-save-recheck.hooks.ts` shared helpers **injected as props** (CI hooks gate). Fix the 3 error-gate rows in `use-page-editor.hooks.ts` and the 6 in `bundled-id-upgrade.ts`/`lifecycle.ts` by binding the caught value and passing it as `cause` / redacted diagnostic (the gate's own rule).
Tests first: existing editor suites stay green (record counts before/after — honest-testing rule); add `catch keeps the cause` cases for the two plugin files. Gate check: `check:size` rows gone, `check:errors -- --strict` rows gone, `check:hooks` ok. Mutation: drop a `cause` → new case red.

### P7-T2 · Tovu · backup cycle and cross-feature edge (~1 h)
Break `backup-service.ts ↔ push-content.ts`: move the shared type/helper both import into `site-backup/push-types.ts`; route `push-content.ts`'s provider use through the existing `source-control` public entry (port injected by `backup-service`), removing the new cross-feature edge. Tests: existing site-backup suites green; `check:boundaries` 112→111; `check:architecture` edges 319→318.

### P7-T3 · Tovu · why-comments and stale script test (~0.5 h)
Restore the deleted luvira-trial why-comment in `bundled-tovu-theme-package.unit.test.ts:196–197` (owner: never delete why-comments); close C028's two blocks by restoring their comment text next to the moved code. Delete `site-plugin-directories.test.mjs` **only if** nothing imports it and it is outside every test glob (verified by combine-12) — else repoint the import (recommend repoint: one line, `pluginsInstallDir` now lives in `W/server/runtime/composition/site-paths.ts`; check before editing).

### P7-J1 · Jini · why-comment rows + guard advisory (~0.5 h)
Add the three combine-12 rows and `test-runner.ts:10-11` to the why-comments debt list with a one-line reason each (the comments described code that no longer exists — the rule forbids deleting live why-comments, not recording obsolete ones). Do not touch the 24+1 error-gate BASE-RED rows here (owned by the J-RATCHET refresh; out of scope).

### P7-J2 · Jini · release candidate (owner-gated; listed, not executed)
Carry: `integ/merge-12-2026-11-22` + `codex/jx-chatlinks` + the P1/P2/P3/P4/P6 Jini steps as they land. Needs: the core changeset (P4-J1), changesets for each additive/removal step, `pnpm api:check` green, `pnpm guard`, `guard:plugins:*`. Release itself = owner action (tag → publish `@jini-ai/*` `0.7.3-next.3` or next). Then the Tovu pin bump + `npm ci` in all 4 roots (combine job). **Known blocker for the Tovu desktop release gate:** the last two failed `Desktop Release` runs (#73 `44870881753`, #72 `44854399881`, branch `release/lockfile-1120`, 11-21) both failed in the `assistant-gate` job at `npm` install with `ERESOLVE … tovu-site-chat … @jini-ai/agentic@^0.7.3-next.1 … conflicting peer @jini-ai/protocol` — before any build or notarization. That lockfile was regenerated later (C019 `47dd8b157`); the next release run must start from a tree where `apps/site-chat` resolves the same `@jini-ai/*` prerelease as the root.

### P7-R · Desktop notarization and packaged checks (owner-gated)
- Notarization: the last two failed runs did **not** reach notarization (above). The last successful real release is run #65 (`42948229766`, `release/desktop-v0.1.31`, 11-11). B278 ("Mac notarization 403: Apple agreement expired") is an owner action at developer.apple.com — **check it is accepted before re-running.** Re-run = `workflow_dispatch` of `desktop-release.yml` on a new `release/desktop-v0.1.32` branch (owner).
- Packaged desktop checks (Electron, owner's Mac): first run, Sites Home, start/stop site, admin chat (Claude/Codex/agy), updater, P3 routines once landed.

### P7-L · OWED-LOCAL checks (owner's localhost, Opus + Chrome)
1. Recharts approvals in Chrome and packaged Electron (combine-11 carry).
2. tv-bugs3b editors: post TipTap replaced on mount; Preview YouTube link; assistant edit → focus recheck → banner Load latest / Replace their version / Keep editing.
3. tv-seed-upgrade on a **real 0.7.2 site** (desktop + server): `tovu/cloudflare`, `tovu/calendly` → `jini/<id>`, settings/data/memory kept, backup under `.bundled-id-upgrade/<id>/<digest>`, no seed conflict next boot; `npm run dev` once for `waitForHttpOk`. Collect the old digests here for P2's multi-revision question.
4. B1: kill the agent daemon mid-reply → "The assistant’s response was interrupted. Send your request again."
5. jx-chatlinks (after local merge): own-site links navigate in place with ↗; other sites open a new tab.
6. tv-howto2 live: "add a contact form", "migrate this site", "redesign from this URL".

### P7-C · Coverage last (plan only; runs after every other plan lands — owner: "coverage last")
Per package/app: 100% lines/branches per file, or an explained exception row (genuinely unreachable branch refactored away with a comment naming what guarantees it). Load `.claude/skills/honest-testing/SKILL.md` in every dispatch; record the test count before/after; banned: widened excludes, lowered thresholds, `ignore` comments, softened assertions, deleted branches. Order: Jini `core`, `protocol`, `chat`, `agent-plugins`, `daemon` → Tovu `W/features/*` by risk (forms, pages, site-backup, agent-plugins) → admin → desktop. One implementer per package, ≤ 2 h each; a 10% test-quality sample by a second Opus pass (P10-G13).

## Combine-12 Tovu decisions 1–3, 5 (owner, recommendations — also in P10)
1. Gate debt: **refactor** (P7-T1…T3) rather than baseline, except Jini BASE-RED error rows.
2. howto2 wording changes to the owner-approved ui-ux-design text and the screenshot width gate: **keep howto2's** "Save requested site work…" and "report only widths actually checked" — they match the owner's 11-21 decisions (save site work with tools; screenshot tool has 3 presets).
3. tv-bugs3b product choices (clean editor's post-save recheck loads the newer row and clears a conflict; stale-basis notice hides while a save conflict shows): **confirm** — both avoid two banners and never discard typed text.
5. `site-plugin-directories.test.mjs`: **repoint** (P7-T3).

## Dependencies / estimate
P7-T1 after P1-T4 (or absorbs it). P7-T2, P7-T3, P7-J1 any time, parallel. P7-J2 after the Jini steps of P1–P4/P6. ~4 h implementer work + owner-gated release/notarization + OWED-LOCAL session (~2 h owner + Opus).
