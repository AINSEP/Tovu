DONE

# fix-fnd-kit — rv-g FIX run (resume), 2026-11-23

Review: Tovu `origin/plan/whats-left-1122:reviews/rv-g-fnd-kit.md`.
Branches: Jini `codex/ex5-fnd-kit-jini`, Tovu `codex/ex5-fnd-kit-tovu`. No force-push; every commit
went on top after `git pull --rebase`.

## Per item

| FIX | status | commits |
|---|---|---|
| 1 logger / nav split / error-gate | fixed. Earlier run: Jini `6bd475bc`, Tovu `5988fb232`. This run: Jini `f7fd63c9` (guard), Jini `c03c3cd1` (browser-stream error-gate warning). | see below |
| 2 URL/workspace policy in Tovu | fixed earlier: Jini `c54d9e24`, Tovu `f46ad2f7d` (verified in git log) | — |
| 3 inject Core implementations | fixed earlier: Jini `6bd475bc`, Tovu `5988fb232` | — |
| 4 hook/selector injection | fixed earlier: Jini `d8782022`, Tovu `97a033e11` | — |
| 5 Select pass-throughs, args rule | fixed earlier: Jini `0045495c`, Tovu `26a573f10` (verified in git log) | — |
| 6 typesVersions, changesets | fixed earlier: Jini `ad4b2d02` (verified in git log) | — |
| 7 selection-echo test + mutation evidence | fixed: Jini `4aa88759`, Tovu `43b8d52d3` | |
| 8 locale overlay | no change needed: the ex2 version of `i18n-common.ts` is kept as the dispatch requires. It builds rows from Tovu's locales, so a locale Jini adds is ignored rather than throwing. ex2's test `exposes Tovu's locales in Tovu's order, ignoring extra or reordered Jini locales` pins this. It still throws when a *Tovu* locale is missing from Jini, which is ex2's approved guard. | — |
| ex2 duplication (K4-i18n-common.T, A-K2-0a.T, rv-g FIX 2 config) | already resolved, no commit needed. This branch now starts from ex2's tip `d6590fc72` (merge-base). `apps/admin/src/lib/i18n-common.ts` and `apps/admin/src/lib/admin-http/config.ts` are byte-identical to ex2's tip. `apps/admin/src/integrations/jini-kits.ts` keeps every ex2 line and adds only the later A-K2-0b/B5 bindings. Commit `284f95502` cannot be found in this clone or on any remote branch. | — |

### FIX 1 follow-ups found this run
- On the branch tip, `pnpm guard` **failed**: `HW3-module-state` at `packages/admin/src/shell/lib/shell-failure-log.ts:15`, the logger binding FIX 1 added. Jini `f7fd63c9` adds one reviewed debt entry next to the buses' existing HW3 entries; the logger binding joins their follow-up to make the state instance-owned. I did not keep the `--write-baseline` output, because it wipes the reasons on every other entry.
- browser-stream `catch-reads-error` warning: the lock `.catch` now sends the refusal to `reportShellFailure` (the host logger handles redaction). Our own abort still logs nothing. The message avoids the generic-failure wording.
- The stale Tovu entry in `development/scripts/error-gate-debt.json` is gone; it has no `browser-stream` match.
- **Residual (WARN mode, does not fail the build):** the error gate still lists `[catch-reads-error] shell-failure-log.ts (1)`. That is the deliberate `catch {}` around a logger that itself throws, and nothing safer is left to report to. I left it as a named exception.

## Mutations (named, red, then restored)
- M1 FIX 7, `local-cli-selection-echo.ts:45`: changed `===` to `!==` on the reasoning comparison. **3/7 fail**: "same agent, model and effort", "only the resolved effort differs", and "effort-only fill-in". After revert, 7/7 pass.
- M2a folder-zip injection, `use-folder-upload.hooks.ts:28`: changed `instanceof FolderZipError` (the injected class) to `instanceof Error`. **Fails** "reports an unexpected handoff failure and releases the picker". After revert, 8/8 pass.
- M2b folder-zip injection: the call to the injected `zipFolderFiles` ignored `maxBytes`. **Fails** "maps refusals to the page's keys: empty, over the page's limit, too many files". After revert, 8/8 pass.
- M3a external-refresh kit binding, `use-external-entry-refresh.hooks.ts:157`: bypassed the check-path `isCurrent` on the kit-bound `useSettlementGeneration`. **Fails** "drops an earlier check that settles after a later one" and "drops a check that settles after unmount". After revert, 24/24 pass.
- M3b same seam at `:122` (load path). **Fails** "a superseded Load latest click neither ends the in-flight state nor runs the deferred check early". After revert, 24/24 pass.
- M4 browser-stream: replaced `reportShellFailure(` with a no-op. **Fails** the lock-refusal case. After revert, 30/30 pass. The test was written first and was red before the fix.

## Tests / gates
- Jini: `pnpm install --frozen-lockfile` ok. `pnpm -r build` exit 0. `pnpm typecheck` exit 0. `pnpm guard` ok after `f7fd63c9` (failed before it, see above). `@jini-ai/admin` full vitest: 292 files, 3483 tests passed (before the browser-stream change). After it, `src/shell`: 40 files, 387 tests passed. Admin `tsc --noEmit` exit 0 after rebuild.
- Tovu, linked to this Jini via `npm run link:jini`: `apps/admin` `tsc --noEmit` exit 0. Root/website `tsc -p tsconfig.json --noEmit` exit 0. Vitest (`--maxWorkers=2`) on `local-cli-selection-echo.unit.test.ts` + `i18n-common.unit.test.ts`: 20/20 passed.
- Known pre-existing failure (ignored, as instructed): `src/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx`, 3 failing / 12 passing (the three "reports an error…"/"renders nothing…" cases).

## Wiring
The touched feature folders (Jini `shell/components/AssistantDock`, `shell/lib`; Tovu `components/AssistantDock`) have no existing INFO.md/README, so no `## Wiring` section was added.

## FILES MOVED
- Test cases moved: the no-inventory case from Tovu `apps/admin/src/components/AssistantDock/__tests__/local-cli-selection-echo.unit.test.ts` now lives in the new Jini `packages/admin/src/shell/components/AssistantDock/__tests__/local-cli-selection-echo.unit.test.ts`, which also adds resolver-independent decision cases. No production files moved.
