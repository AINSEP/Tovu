# Session handoff — tovu-a3 (2026-09-20, evening)

> **Update 2026-09-21:** work continued the next morning and was then handed to peer session tovu-91 (`ADS-memory/.local-artifacts/handoffs/2026-09-21-tovu-a3-to-tovu-91.md`). The current open list is the bottom of the `## tovu-a3 lane` in `ADS-memory/.local-artifacts/owner-worklist.md`; this file's "Open work" section is superseded by it.

Took over tovu-8a's unclaimed terra admin-review work, then its whole scope. By the end this session owned all of `apps/admin`, `apps/admin/src/lib`, `apps/website` server code and `apps/desktop`. tovu-8a is closed; its own handoff is `ADS-memory/reports/2026-09-20-session-handoff-tovu-8a.md`.

Stopped because the owner is near their weekly usage limit. Every agent was told to commit, hand off and stop. Nothing is left uncommitted.

## Where everything lives
- Plans, one per slice: `ADS-memory/.local-artifacts/terra-admin-review-2026-09-20/plan-{content,content2,access,platform,misc,components,server,serialize}.md`
- Coordinator's condensed report per plan: `report-plan-*.md` beside them
- **Review queue, with what to check hardest per commit:** `terra-admin-review-2026-09-20/REVIEW-QUEUE.md`
- **Pending browser checks:** `terra-admin-review-2026-09-20/VISUAL-BACKLOG.md` (annotated CHECKED / not reached)
- Rules every writer was held to: `terra-admin-review-2026-09-20/WRITER-RULES.md`
- Directory ownership history: `terra-admin-review-2026-09-20/OWNERSHIP-tovu-f6.md`
- Per-agent handoffs: `ADS-memory/.local-artifacts/handoffs/2026-09-20-a3-*.md`
- Owner worklist lane: `ADS-memory/.local-artifacts/owner-worklist.md`, `## tovu-a3 lane`

## What shipped (~45 commits)
**Data loss and destructive-action fixes**
- BYOK credential writes serialized so a migration can no longer wipe a just-saved key: `a4f004d24`, plus `a69918572` `f77a242a5` `da7e95765` `fba1b971d` `013d2a610`
- Widget "Delete permanently" now goes through a confirm modal (`7b95b13ba`), and form-submission delete too (`84b5ae860`) — both live-verified to BLOCK the delete, not just render a dialog
- Roles: removing a permission asks first (`1c6f087cb`); the panel no longer repaints another policy's rows (`8ddea31c2`)
- Media publish import is a compare-and-set, so two editors cannot both win (`4c791ead7`); malformed base64 uploads refused (`a27f481f1`)
- Page save no longer strands the editor on a stale version (`94a505727`); collections Publish saves current edits first and refuses invalid JSON (`f78e034e8`)

**Races, one shared primitive instead of six copies**
- `useSerialWrites` (`81fd4ebdd`) + all six hand-written chains migrated: `e9d56869a` `3e53d85a7` `f8991098b` `e7d758247` `90107b48b` `526b0c17b`; themes activate `b15608ddef`; folder drop `2e52a493a`
- Row-lock scoping: posts `26fbe22c5`, pages `f4f2fe899`, plugins `d55e1b65b`; menus one Save at a time `4ad614755`; posts Save/Publish disabled in flight `87abc07c7`
- Paging: forms `45f58ea16`, comments `c51d43854`; plugins reload no longer blanks the screen `3b16b07d5` (+`96c4885a1`); database drift banner `f20f325e6`; redirects keep your input `4115a92da`; sites gate forgets the last user `ee41741dd` (+`9c5fa177f`)

**Accessibility** — TabBar + Access Tokens filter `a35ce9f12` `b0a83067e`, the real bug reviewers found `5c1252a8d`, page editor `3da7686cc`, theme explorer `c2db40f35`, focus traps: collections `2505afb04`, sitemap `44f792e53`, plugins dialogs `f5642681c`

**i18n** — shared-components dictionary now 43 keys × 21 locales: `b858d9cfa` `31bb4aa73` `a3c7e75bc` `69ff01e34` (+`203d24761`); access-control errors `8de3acf13`; Composio prompt `e19495e1a`; widget title `969fbe884` (+`2796e0f6d`)

**Tests and types** — 7 stale tests fixed `1a74d4e00` `c8c80c240` `aa8eab92c` `98fe29ea8` `1a1fb61e6` `df4bf6b34` (incl. a comment-stripper bug hiding a boundary offender); typecheck back to 0 `5fb6f3a91` `0f5977975`; assertions that tolerated half a bug `d011cc10b`; a coverage hole `abcd836a3`

## Open work, in priority order
1. **Finish the review.** Only 8 commits have had Opus review; `a3-review-2` was mid-review of 6 more when it stopped. See REVIEW-QUEUE.md. `1c6f087cb`'s failing-test evidence was reasoned, not captured — re-prove it.
2. **Browser checks not reached:** `5c1252a8d` `c2db40f35` `1c6f087cb` `44f792e53` `4115a92da`, the whole BYOK panel, and platform's four items. See VISUAL-BACKLOG.md.
3. **Rebuild the `:3000` admin bundle** — owner approved, deliberately not done while writers were editing. It serves a STALE bundle and showed pre-fix behaviour for a committed fix; verify only on `:5173`.
4. Plan leftovers: misc A1/A2/F6/F7/D1; components batch C, D1 and D2 items 4-8 (EmbedInsertControl is fully designed in `handoffs/2026-09-20-a3-write-i18n-4.md`); access C7/C8; platform commits 2/5/6; content C (A1/A2/A3); server contract-test coverage and a whole-project tsc; content2 widget-list read race and the widgets/forms/taxonomy shared-dict fallback.
5. `PostEditor.tsx` needs the same keyboard fix — apply `3da7686cc` verbatim now that the file is quiet.
6. `PAGE_EDITOR_DICT` has no 21-locale parity test; every other dictionary has one.
7. SPEC-043 REQ-05 says a widget update is config-only, but the UI sends the title. Spec amendment, no code change.

## Owner decisions waiting (in the worklist as ASK LATER)
Sitemap-off semantics; Login screen language; server-side refusal of self-stripping `role.manage`; two-tab credential and active-site races needing server conflict checks; Jini media metadata writes still unconditional; deferring Payments placeholder translation; widgets spec conflict; agents still cannot rename a widget via `widgets_update_instance`; Security page English-only; one-click Disconnect/Clear; remote-tool write-grant confirmation; newsletter raw DELETE exception; `restorePostForward`'s unbounded ledger read; making page Publish one atomic server write.

## Process notes that cost time today
- Three agents stalled by waiting on a backgrounded test run; briefs now forbid it. The admin typecheck exceeds the 120s Bash default and needs `timeout: 600000`.
- The Playwright browser is machine-wide. tovu-8a's agents held it for two hours and blocked four of mine. Every visual brief now closes it.
- Four writers wrote the fix before the test and had to reconstruct RED. Reviewers re-proved those.
- Translation work is context-expensive: ~20 keys × 21 locales consumes a whole agent. Scope those to 2-3 items.
- A visual "failure" was a stub keyed `core.language.locale`; settings rows are keyed bare (`locale`).
- A real Gemini key is stored on this install. Look, never click, in credential panels.
