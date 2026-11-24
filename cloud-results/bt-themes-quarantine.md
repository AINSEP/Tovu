DONE 73bce4ed3 15294b65

# bt-themes-quarantine — A452 "Held back on import" themes (2026-11-24, unattended cloud run)

- Owner decision: Tovu `origin/plan/whats-left-1122:plans/owner-decisions-1123-bugs-todos.md` (11-23, YES): "A452 'Held back on import' themes section with re-check + restore behind approval card (own lane)". Item text from `origin/codex/bugs-low-a-tovu:cloud-results/bugs-low-a.md` row A452.
- `AI-Dev-Shop/agents/programmer/skills.md` was read before any work (coordinator and both subagents confirmed it; red-first, root cause, named mutations, function-quality and pre-completion checks applied).
- Branches: Tovu `codex/bt-themes-quarantine-tovu` from `origin/integ/merge-16-2026-11-23` 0b2ec0d9e, merged again with its latest head c23c119b3 before the final push (merge 73bce4ed3). **Jini: not used** — no generic, theme-free helper was needed; Jini sha above is the unchanged merge-16 head that Tovu was linked against for the final gates (nothing pushed to `codex/bt-themes-quarantine-jini`).
- Setup: Node 24 (`/opt/node24`), Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` 0; Tovu `npm ci --ignore-scripts` (root, admin, desktop, site-chat) 0; `link-jini.mjs`; `packages/contracts` tsc 0, `packages/sdk` build 0.
- Method: coordinator + 2 disjoint subagents. Opus (high): server/feature/composition (security + data-move seam). Sonnet (high): admin UI. Both coded against a coordinator-written HTTP contract. No subagent committed; every diff reviewed by the coordinator. The coordinator added one hardening (forged marker, below) and two gate fixes.
- w3 avoidance: the theme routes registrar (`modules/content.ts`), `routes/content/deps.ts`, `import-restore.ts`, `site-import-backend.ts` and the route-table snapshot are on running `codex/w3-*` branches and were NOT edited. The routes have their own module (`modules/theme-held-back.ts`), mounted in `http-app/mount-core-content.ts`; the import-time marker is bound in `composition/site-portability.ts`.

## Results

item | status | commit | test
---|---|---|---
A452 server: list / re-check / restore routes (`GET /held-back-themes`, `POST …/check`, `POST …/restore`); re-check = import's own `inspectThemeManifests` + `liveThemeTrees` (now with plain-words reasons, import behaviour unchanged) + `loadTheme` valid + link/caps walk; restore = `theme.edit` + approved digest, exclusive claim + rename (never overwrites, never activates, deletes nothing), rescan + preview refresh | FIXED | 3939c588e, a573a1474 | `held-back-themes.unit.test.ts`, `held-back-route.test.ts`: "held-back list: names every quarantined theme tree and nothing else"; "held-back re-check refused on a still-bad manifest"; "held-back restore requires approval"; "held-back restore moves only that theme" (hashes every other held-back and live tree before/after); id grammar / link refusal / NAME_TAKEN
A452 fallback-to-default notice: import records the archive's chosen theme when it ended in quarantine (`.import-quarantine/held-back-choice.json`), GET returns `chosenThemeHeldBack` while it is still held back and the site still shows the fallback | FIXED | 3939c588e | "held-back notice shown when the site's chosen theme was held back"; "held-back marker writer: writes the marker only when the chosen theme ended in quarantine"
A452 hardening (coordinator): import copies unknown archive files into the quarantine verbatim, so an archive could ship its own marker and fake the notice; the writer now always clears it first | FIXED | 3939c588e | "held-back marker writer: a marker that arrived inside the imported archive is cleared when none is due" (red shown before the fix)
A452 admin: "Held back on import" section (loading, empty = not drawn, 403/404 = hidden, list error + Retry, checking, failed check with problem list, passed, name taken, restoring, refused, restored toast), Restore behind the `ConfirmDialog` approval card sending the checked digest, `.notice.warning` chosen-theme notice, 27 strings × 21 locales, mobile-first CSS in its own file | FIXED | a5f2f5273 (wip), 01805ac3c, a573a1474 | `held-back-themes.unit.test.tsx`: "held back on import: lists the held-back themes"; "…re-check refused on a still-bad manifest shows the problems and no Restore"; "…restore requires approval"; "…notice shown when the chosen theme was held back"; hook tests in `use-held-back-themes.hooks.unit.test.tsx`; `held-back-themes-i18n.unit.test.ts`
Route-table pin snapshot (+3 rows `held-back-themes` after `themes/:themeId`, later rows shift by 3) | AFTER-MERGE | — | `create-app-route-table.pin.test.ts` is already red on base (7 cases, unrelated rows); regenerate with `UPDATE_ROUTE_TABLE_PIN=1` after the w3 branches that touch the snapshot land
Visual check | UNVERIFIABLE-IN-CLOUD | — | coordinator real-browser pass: Themes screen at 375 px and desktop, light + dark: rows stack and buttons go full width under 600 px, long names wrap, no horizontal scroll; every state listed above; the approval card fits on mobile; Restore… disabled with the name-taken reason; restored card appears after the rescan; the warning notice names the chosen theme and the fallback's display name; "Loading held-back themes…" briefly shows under the grid on every visit (decide if too noisy)

Note: the wip commit a5f2f5273 captured one line mid-mutation (`check: null` missing in `refuse()`); 01805ac3c restores it.

## Mutations (each applied, run red, restored green)
Server: drop digest compare → "restore requires approval" red; drop link refusal → link test red; drop approval check → red; forget the marker regardless of theme → "restore moves only that theme" red; drop the still-on-fallback condition → notice test red; drop the archive-id grammar check → marker writer test red. One survivor: the catch-all "did not pass the import safety checks" line in `explainThemeTree`, which no current input can reach (guards future drift between import's checks and the explanations).
Admin: M1 restore without awaiting confirm, M2 digest not sent, M3 Restore on a failed check, M4 notice dropped, M5 notice not `.warning`, M6 empty list rendered, M7 403/404 not hidden, M8 stale check kept after a refusal, M9 wrong CHANGED_SINCE_CHECK copy, M10 no rescan after restore, M11 Restore enabled when the name is taken → all red.

## Gates (no new red vs base)
- Tovu `npm run typecheck`: 0. Base 0. After merging the latest merge-16 head it needed Jini merge-16 15294b65; with Jini rebuilt (`pnpm -r build` 0) and relinked it is 0.
- Admin `tsc --noEmit`: 0 (base 0).
- Admin vitest `src/features/themes`: 24 files, 843/843.
- Website node tests, changed files + importers (all site-backup import/share tests, site-saved-keys, import-database, duplicate-route, create-app pins, held-back tests): 313 tests, 304 pass, 9 fail.
  - The same 9 fail on a clean base worktree (303 tests / 294 pass / 9 fail).
  - The 9: 7× route-table pin, `import keeps starter radio and URL form markup active…` (Jini forms `fieldKinds` TypeError), `plugin schema failures keep kernel diagnostics private…`.
- `check:errors --list --files <changed>`: only the pre-existing `import-restore-placement.ts` catch (already in the debt list at 1).
- `check:hooks` ok. `check:complexity` ok (0 entries), after splitting `walkHeldBackTree` and making the held-back hook a defaulted prop.
- `check:why-comments`: exit 1 on base debt; no entry in a changed file.
- Jini: no change, so no Jini gates were needed.

## Open risks
- No end-to-end import test asserts the marker. The writer is unit-tested; the wrapper's two DB reads run through the existing import tests.
- A marker write failure after a successful restore fails the import. It is unlikely, because the folder was just written by import.
- There is a small window after the restore-time digest in which files could change. The live folder is claimed exclusively, so nothing is overwritten.
- The 21-locale translations are machine-written, not human-reviewed.
- The screen's rescan toast also appears after a restore.
- Not built (not in the owner call): an agent tool for the same restore. It is listed in `development/todos.md`.
- Tracking: A452 has no row in `development/open-bugs.md`. A ticked entry was added to `development/todos.md` with the open after-merge and browser items.
