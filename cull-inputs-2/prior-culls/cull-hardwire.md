# Cull of r62t-hardwire

Input `o-r62t-hardwire/r62t-hardwire.md`. Bases: Tovu `c-r62t-hardwire` 776ce6d0f0, Jini `ro-m6-jini` d3e78b387. Read-only checks (`git grep -n -F`, file reads).

## Owner summary
1. Jini admin sidebar: a merge put back an old inline copy of the icon code, so the clean `SidebarIcon.tsx` (made by the hook-injection job) is unused. Fix = use it and delete the copy. That clears the 2 Sidebar hardwiring rows. No new code.
2. Tovu desktop: delete the old local folder-drop function and its test. Jini already has the same function and the same 10 test cases. Shrink the Tovu ledger by 14 stale rows. Label the 42 React visitor-chat rows with your 11-18 KEEP decision.
3. Everything else stays as it is: 53 Tovu + 73 Jini hardwiring rows and all 158 CSS-token rows are accepted as KEEP. **No new ports.**
4. One design claim was wrong. The log-safety row L43 is still live, so it is not deleted.

Counts: KEEP 2 / CUT-TO 2 / DROP 3 / NEEDS-DECISION 1 / BLOCKED 4. Round 2: 84 env-access rows, plus the 26 hardwiring and 24 log-safety rows the design marked HELD-ENV.

**Hardwiring rows dropped as not worth a port: 127.**
- Tovu: 53 of 67. That is T5, T11, T13–21 and T26–67.
- Jini: 74 of 104. That is H1–3, H6, H13, H15–18, H22, H24, H29–31, H33–34, H43, H46–93, H95–101 and H103–104.

Two Tovu sheets and one Jini sheet remain. Jini H45 and H102 are also recommended KEEP, but they stay in round 2 with env.

## Verdicts

| Item | Verdict | Reason |
|---|---|---|
| J-A Sidebar SVG parser/allowlist | **CUT-TO J-HW1** | The design rewrites the inline parser and keeps a "previous module-cache rationale" comment. The clean twin already exists. `SidebarIcon.tsx:10` has `ReadonlySet`, and `:80` makes a per-call `new DOMParser()`. Commit `07fe77481` added `import { Icon } from './SidebarIcon.js'` and deleted the inline copy. Later hooks-b merges (`a88cddc6f`/`c21c65f78`) restored the copy, and `git grep SidebarIcon` now finds no importer. Restore the import and delete the copy. No new comment. |
| J-L Jini ledger | **CUT-TO (folded into J-HW1)** | Delete only H4 and H5. **Do not delete L43.** `collect-page-evidence.ts:203` contains `report({… skip(path, "browser-unavailable", reason) …})`. `report` is a `TEXT_SINK` (`check-log-safety.mjs:86`), and `reason` matches `ERROR_NAME` (`:72`). The `error-helper` selector (`:114`) therefore still counts 1, and deleting the row would turn the gate red. |
| T-D12 desktop folder-drop | **CUT-TO T-HW1** | The design repoints the 10 test calls to Jini and copies a runner-history header into the test. Jini `packages/ui/src/__tests__/features/folder-path-drop/rules.test.ts:49–127` already has all 10 cases, with identical titles. Jini `rules.ts:8–10` carries the Electron `getPathForFile` why-comment. Delete both Tovu files. Do not repoint them, and do not carry the header. The only importer of `folder-drop.ts` is its own test. Production already imports `@jini-ai/ui/core` (`import-drop.ts:5`, `use-workspace-chat-pane.hooks.ts:33`). |
| T-L Tovu ledger + HW7 reason | **KEEP → T-HW2** | 14 deletions (T1–4, T6–10, T12, T22–25). I spot-checked T22: `webmcp/generated/annotated-actions-script.ts` is missing. T23–24: `active-site.ts:4` imports from Jini. T7–10: `live-electron.ts` adapter. The 42 identical `reason` edits are data only, and they stop future rounds from re-sheeting HW7. |
| RETIRE·KEEP / DONE-STALE dispositions (Tovu, Jini HW, all 158 L7, L2, L7–11, L13–15, L20–21, L23, L27–29, L42, L44) | **KEEP** | No sheet. Option (i) for L7 is correct: a `--jini-` prefix alone grants no exemption, so moving the list would change nothing. |
| T13–14 shell-staleness | **DROP** (was NEEDS-DECISION) | The design itself recommends preserving Tovu behaviour, and owner rule "behaviour identical" already decides that. Rows stay as KEEP. No owner question is needed, and the Desktop F1/F2 paragraph does not apply. |
| H6 `setAcpModelProbe` removal | **DROP** | The setter is the test seam for 14 Jini suites (`detection`, `ports`, `native-runtime`, `integration-contracts`, and 10 `defs/__tests__/*`). Removing it rewrites all of them and breaks a published export, all to clear 1 row. Keep the row. |
| L43 deletion | **DROP** | The row is live (see J-L). The executor adds a KEEP reason instead (J-HW1 step 4). |
| H94 watchdog `trackRun*` | **CUT-TO J-HW2 (owner YES 11-20)** | Delete the unused public stuck-run watchdog from `@jini-ai/ui` (no Tovu or Jini production caller; only its own test and the barrel). |
| H21 `daemon/http/xai.ts:160` provider origin | **BLOCKED** | Waiting on a provider-package destination for vendor code (owner rule: no vendor code in core). This belongs with the provider extraction, not here. |
| L1 SeoQuery typed error | **BLOCKED** | Waiting on a joint query/overlay sheet that keeps typed copy and precedence. |
| L17 ACP error prose | **BLOCKED** | Waiting on `r62t-acp` and `r62t-redact`. |
| CSS E (Tovu adoption) | **BLOCKED** | Waiting on a Jini release that carries `27faa0f40` (in merge-6; Jini chat/ui are at 0.7.1, Tovu lock has chat 0.7.0) and the Tovu lock bump. On adoption, the only edit is in `apps/site-chat/src/vanilla-theme.css:14`: replace `font-family: var(--font-ui);` with `--jini-chat-font-body: var(--font-ui);`, then run the looks the design lists. It rides with the regular Jini bump job and needs no separate cloud job. |
| Env-access E1–84 and all HELD-ENV HW/log rows | **round 2** | Owner 11-20 lifted the hold. Re-sheet these in round 2; nothing is judged here. |

## Exact cut text

### J-HW1: Sidebar uses SidebarIcon; Jini ledger (Jini, merge-6)
1. `packages/admin/src/react/components/Sidebar.tsx`: add `import { Icon } from './SidebarIcon.js';` after the `use-sidebar-rail` import. Delete the whole inline icon block, from the `ICON_ALLOWED_TAGS` doc comment (≈:125) through the end of `function Icon` (≈:226). That covers `ICON_ALLOWED_TAGS`, `ICON_ALLOWED_ATTRS`, `sanitizeIconNode`, the `iconMarkupParser` comment and `let`, `parseIconMarkup` and `Icon`. Remove the now-unused `createElement` and `type ReactElement` from the react import. `useMemo` stays because `:320` uses it. Call sites `:501,:531` stay unchanged.
2. Leave `SidebarIcon.tsx` untouched.
3. `scripts/hardwiring-debt.json`: delete the two `HW3-module-state` rows for `packages/admin/src/react/components/Sidebar.tsx` (fingerprints `ba969abe…` and `a98d492b…`).
4. `scripts/log-safety-debt.json`: on the `collect-page-evidence.ts` / `error-helper` / `value: 1` row, add `"reason": "KEEP: the flagged identifier is the policy-redacted browser-unavailable reason passed to skip() inside report(), not a caught value."` Leave the value unchanged.
5. Tests: no new tests. The existing witnesses are `AdminShell.markup.test.tsx:40` (safe shapes) and `:53` (parsererror). For the combine mutation, remove `'path'` from `SidebarIcon.tsx`'s allowlist to turn :40 red. No changeset, because nothing exported changes. Chrome look: admin nav icons.
6. STOP if `Sidebar.tsx` uses any deleted name outside the block, or if `SidebarIcon.tsx`'s `Icon` signature differs from `(props: { markup: string })`.

### J-HW2: delete the watchdog (Jini, merge-6, H94 APPROVED by owner 11-20)
1. Delete `packages/ui/src/features/observability/stuck-run.ts` and `__tests__/stuck-run.test.ts`.
2. In `observability/index.ts`, delete the export block at `:25–30` and the type export at `:31`.
3. In `install.ts`, delete the doc sentence at `:5–6` that names the watchdog.
4. In `packages/ui/docs/spec/api.spec.md:61`, remove the three `trackRun*` mentions and "The root also exposes the test reset helper."
5. Delete the `stuck-run.ts` row from `scripts/hardwiring-debt.json`.
6. Add the changeset `.changeset/ui-remove-stuck-run.md`: `@jini-ai/ui` minor, "Remove the unused stuck-run watchdog exports."
7. Do not edit `api-baseline/`; OPUS-CLOUD runs `pnpm api:update`.
8. STOP if `git grep -n -F 'trackRun' -- packages/` finds a non-test caller outside these files.

### T-HW1: delete the duplicate desktop folder-drop (Tovu, merge-6)
1. Delete `apps/desktop/src/renderer/folder-drop.ts` and `apps/desktop/src/renderer/folder-drop.test.ts`. Edit nothing else; the `coverage-floors.json` comments are dated history.
2. Tests: none new. Jini's `rules.test.ts` holds the same 10 cases.
3. The combine owner reruns the desktop coverage gate. One fully covered module leaves the renderer area, which had funcs floor 66 against 70.54% measured. Electron look: drop a Finder folder whose name has spaces, together with a loose file.
4. STOP if `git grep -n -F "folder-drop.js" -- apps/` shows any importer besides the deleted test.

### T-HW2: Tovu ledger shrink + HW7 KEEP label (Tovu, merge-6, after T-HW1)
1. Edit `development/scripts/hardwiring-debt.json` `violations`, matching each row on `(rule, file, fingerprint)`.
2. Delete these 14 rows:
   - the 4 HW5 rows for `Login.tsx`, `login-dependencies.hooks.ts`, `use-login.hooks.ts` and `roles-dependencies.hooks.ts`
   - the `SkillRow.tsx` HW5 row
   - the 4 HW2 rows for `verify-find-in-page.ts` and `verify-site-power.ts`
   - the `folder-drop.ts` HW5 row
   - the `webmcp/generated/annotated-actions-script.ts` row
   - the 2 `active-site.ts` rows
   - the `server/runtime/composition/plugin-runtime.ts` HW2 row
3. On every `HW7-public-react` row (42), set `reason` to `KEEP (owner 2026-11-18): React visitor chat remains a supported renderer.` Keep the keys, lines and count.
4. Do not run `--write-baseline`.
5. Witness: `development/scripts/__tests__/hardwiring-debt.test.mjs:9`. The combine owner runs it. If a row comes back as live, restore that one row.
6. STOP a deletion if its file or line is clearly still present at the stated symbol, for example an `export function` that duplicates a Jini name and has no Jini import.

## Run plan
- `j-hw-jini-DRAFT.md`: J-HW1 then J-HW2 (H94 approved), on base merge-6 d3e78b387. That is 2 sheets, so it needs batching.
- `j-tv-hw-DRAFT.md`: T-HW1, then T-HW2, on base merge-6 776ce6d0f0. That is 2 sheets, so it needs batching; the ledger sheet goes last in the combined job.
- No OPUS-CLOUD job from this design, except the `api:update` J-HW2 needs, and CSS E riding the next Jini bump.
