# Cull of r62t-blocked sheets (over-engineering judge)

Input: `o-r62t-blocked/r62t-blocked.md`. Bases: Tovu `776ce6d0f` (merge-6, clone `c-r62t-blocked`), Jini `d3e78b387` (merge-6, `ro-m6-jini`). Spot-checked: the eight XD5 leaves exist without `exports`/`jini.entries` keys, and their consumers are on `tv-xd5-{render,publish}`. Tovu's versioned-media and rendition-guard files match Jini's apart from imports and pad types. `./media` exports all three symbols. The cover-image, token-alias, chat-preview and L15 anchors match. B07's `sourceOpener` is at `site-key-recovery.ts:173`. Neither a57 half was ever committed. a57 corrected 11-20: no reporter option.

ThemePreviewReloadControl is owned by `ua-jini`/`tv-ua`. The share-archive and EXDEV decisions belong to other sheets. Framework-dictated signatures are exempt in every brief.

**Counts (72 rows):** KEEP 5 · CUT-TO 8 · DROP 9 · NEEDS-DECISION 0 · CLOUD 14 (7 in the approved run, 7 add-ons) · STILL-BLOCKED 27 · OWNED-ELSEWHERE 9 groups.

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| X1–X8 manifest entries (Jini) | CUT-TO | See cut text. |
| K-04b-J cover projection (Jini) | KEEP | Add a changeset. |
| K-04b-T (Tovu) | CUT-TO | Repoint imports only. Base after `tv-rsh`, which edits the deleted file. |
| T-TH-01-J token aliases (Jini) | CUT-TO | Drop the host path from the moved comment. Add a changeset. |
| T-TH-01-T (Tovu) | CUT-TO | Also fix 4 stale comment references. |
| L08-preview-J (Jini) | KEEP | Add a changeset (`./media` API addition). |
| L08-preview-T (Tovu) | KEEP | — |
| S7a-T versioned media (Tovu) | KEEP | Jini half is on merge-6. Launchable now. |
| L08-types (Tovu) | KEEP | Launchable now, after S7a-T in the same job. |
| L15-entries (Tovu) | CUT-TO | Drop the new public-entry test. |
| L15-members (Tovu) | CUT-TO | Drop the new mapper test. L12's link-service `members` port is on merge-6. |
| a57-J (Jini) | CUT-TO | Owner 11-20 (corrected): a57 WITHOUT the reporter option (flagged as over-engineering 11-19). No Jini source, test or changeset edit; COMMIT-PLAN entry only. |
| a57-T admin shell helpers (Tovu admin) | CUT-TO | Sheet as written, minus the option: adopt Jini's existing `createReactRootErrorHandlers`. Draft. Chrome look owed. |
| S7a Jini; T-TH-01 font/link/asset-path; L08 form-maintenance/export; a13 S1e+S2.2; Size 06 P2; B07 | DROP | Agree RETIRE (6 rows). |
| C9c step 4 | DROP | Keep `kitNeeds` (public host contract, consumed by tests and PORT.md). |
| a12 S3 | DROP | Keep the 20-line desktop naming policy. |
| D03 slice 3 | DROP | Report destination/naming stays with the Tovu command. D04 discovery stays separate. |
| B05 newsletter | STILL-BLOCKED | Owner park DT1. |
| S7b media SQL | CLOUD (add-on) | No lock change, but the three-dialect proof needs a test loop. After S7a-T combines. |
| a65 / R8a 4–5 / R8b 6–8 | CLOUD | Approved run. |
| R8 step 9 | CLOUD | Approved run. |
| R11a | CLOUD | Approved run. |
| R11b-1 steps 1, 3–4 | CLOUD | Approved run. |
| R11b-2 step 2 | CLOUD | Manifest/debt deletion right after R11b-1, same run. |
| R11b-3 | CLOUD | Approved run. |
| R12c drift guard | CLOUD (add-on) | Not R8–R11. Needs approval. |
| R12d / OD-5 | CLOUD (add-on) | Not R8–R11. Needs approval. |
| G-STALE-DEPS row 1 | CLOUD (add-on) | No consumer inventory (owner 11-15: no external users); delete entry, peer, peer meta, lock row. |
| S3a/b | CLOUD (add-on) | `kysely` optional peer in user-management. Needs approval. |
| S6b | CLOUD (add-on) | Serialize with R11b-3. Needs approval. |
| Desktop 0 remainder / D0c v5 | CLOUD (add-on) | Needs the `next` snapshot from the approved run. |
| Desktop 2 | CLOUD (add-on) | Packaged SQLite plus archive smoke. Also waits on Desktop 1 (`r62t-resheet`). |
| L08 cache wiring | STILL-BLOCKED | Sheet refresh (constructor/fixture inventory). |
| L14 publish bag | STILL-BLOCKED | Compiler-in-loop sheet after tv-xd5-publish, tv-rs-e/split, tv-tq. |
| L15 rows 4–8 | STILL-BLOCKED | Publication binding sheet. Row 8 waits on K-04b-T. |
| B02, B03, B04 | STILL-BLOCKED | B01 J (`rsh-jini`), then row 140 after L14. |
| B09 S2/S3 | STILL-BLOCKED | Row-57 keyring-refusal parity sheet. |
| R10b-1/2 | STILL-BLOCKED | Refresh after the cloud run's R8b + R11a. |
| R13d, Batch 28 | STILL-BLOCKED | Follow R8b/R10b/R11. |
| U1a/b, U2b/U2c-2/3, U3a/b | STILL-BLOCKED | S3a/b (cloud add-on) plus A07 seams. |
| a16 | STILL-BLOCKED | Recensus platform fs owners. |
| Error E3–E7, E8–E11 | STILL-BLOCKED | Coordinator disclosure contract (ER-6/ER-D12); E8 also redaction. |
| Run-finalizer C | STILL-BLOCKED | Chat redaction (B1 held on `r62t-redact`). |
| Run-finalizer F1/F2, F3/F4 | STILL-BLOCKED | C9/C10 refresh. F3 needs an end-marker design; F4 is behind B1 (redaction). |
| a09 S1–S3, R4/C-CHAT-DEPS, G-TESTS T0, RF B1 | STILL-BLOCKED | Chat redaction (`r62t-redact` simple redesign). |
| L7a | STILL-BLOCKED | Chat redaction, and owner parked L (general desktop chat). |
| Env remainder (J1 presets, T0–T9, J2–J7, ex-env*) | STILL-BLOCKED | Hold lifted, no current sheet; `ex-env4` left a partial unlanded tree (A stopped, S/R not started). Needs a 6.2 re-sheet on merge-6 (code to Codex, package/lock to cloud). |
| ex-err-jini | STILL-BLOCKED | Explicit dispatch hold (no owner change). |
| AG-UI, ACP, routing, T-PO-02, a49 S1, a59 S2, A66, a10, B01 J, optional loaders, G-TESTS-0, lost-updates, P0.4/7/8, Size 02 5–7, S6c, A06/A51/A50, Desktop 1, fn50/c6fix, ThemePreviewReloadControl | OWNED-ELSEWHERE | Counted as 9 groups. |

## Exact cut text

### X — Jini manifest repairs (one sheet, eight rows)
"As the design's X1–X8 table, with these changes. **Tests:** in `packages/cms/src/__tests__/integration-package.contract.test.ts`, inside the first `it`, add five `expect(manifest.jini.entries['<key>']).toBe('<runtime>')` lines (X1–X4, X6). In `packages/devops/src/__tests__/integration.contract.test.ts`, add `'./backup/plan-store': 'backup/plan-store.node'` and `'./backup/push-jobs': 'backup/push-jobs'` to `subpaths`. **No new http-kit test file.** **Changesets:** `.changeset/cms-blocked-entries.md` (`"@jini-ai/cms": minor`, naming the five entries), `.changeset/http-kit-range-entry.md` (`"@jini-ai/http-kit": minor`, `./range`) and `.changeset/devops-backup-entries.md` (`"@jini-ai/devops": minor`, the two backup entries). Drop the share-archive and Chrome sentences (combine checks)."

### K-04b-J
"As written. Add `.changeset/cms-seo-cover-image.md` (`"@jini-ai/cms": minor`: `./seo/cover-image` node entry with the SEO cover projection). Keep the moved `_optional` pads verbatim."

### K-04b-T (draft)
"Delete `features/seo/cover-image.ts` and `features/seo/index.ts:26`. Repoint the 7 import lines in the design's table to `@jini-ai/cms/seo/cover-image`. **Test edits are those import lines only.** The mutation sentences are combine checks. Base: after `tv-ext-rs-c`, `tv-xd5-render`, `tv-rsh` (its T-PO-02-T edits `cover-image.ts:3,22`) and K-04b-J."

### T-TH-01-J
"As written, except in the moved file comment replace `The page-writing contract (\`features/pages/agent-tools.ts\`) now names the real tokens;` with `A host's page-writing contract should name the real tokens;`. Add `.changeset/cms-theme-token-aliases.md` (`"@jini-ai/cms": minor`, `./themes/token-aliases`)."

### T-TH-01-T (draft)
"As written. Also, in the comments at `contracts/core/page-html.ts:78`, `features/theme/static-render.ts:31–32`, `server/inbound/public-http/http/site/render/document-shell.ts:23` and `features/theme/static-portability-index.ts:101`, replace the file name `token-aliases.ts` (with its path where one is given) with `@jini-ai/cms/themes/token-aliases`. Change nothing else in those comments. No new tests: the two render cases stay as they are."

### L08-preview-J
"As written (`MEDIA_CHAT_PREVIEW_MAX_EDGE_PX` loses `export`). Add `.changeset/cms-media-chat-preview.md` (`"@jini-ai/cms": minor`, `withChatPreview` on `./media`)."

### L15-entries
"Do the three bullets exactly. **Do not add `public-entry.unit.test.ts`.** The boundary check and the existing callers are the pins. No other edits."

### L15-members
"Do the move exactly as written (keep the field-by-field `MembersWriteServiceSourceDeps` restatement; importing `MembersToolDeps` would point back at `tool-registrations.ts`). Move the comment and body verbatim, keeping `_optional`. **Do not add `build-members-write-service-deps.test.ts`.** Members route and tool tests are the pins. Drop the L12 wait: the L12 `members` port is on merge-6."

### a57-J / a57-T (owner 11-20: NO reporter option)
"**a57-J:** no edit to `packages/admin` (no `react-root-errors.ts` change, no test, no changeset). Write only one COMMIT-PLAN.md entry: `a57-J: no Jini edit. Tovu adopts createReactRootErrorHandlers as is. Behaviour difference: if the host reporter throws, Jini still sends telemetry (in finally); Tovu's old handler skipped telemetry. Tovu's reporter is console.error.`
**a57-T:** the `j-xd-a57/xd-a57.md` §4 Tovu sheet (A = `apps/admin/src`) with these changes. In `A/main.tsx` and `A/lib/__tests__/browser-telemetry.unit.test.tsx:71`, call `createReactRootErrorHandlers({ telemetry, report: ({ error }) => console.error(error) })` with **no second argument**. Delete only the test's "no telemetry when the reporter throws" expectation (the assertion pinning the old order); keep every other assertion. Record the same behaviour difference in COMMIT-PLAN.md. Delete the `apps/admin/src/lib/browser-telemetry.ts` `catch-reads-error` row from `development/scripts/error-gate-debt.json`. Chrome look (sidebar titles, Sites truncation, restart) goes to combine."

## Jobs

- **`bl-jini`** (Jini, launch now, base merge-6 `d3e78b387`): X → K-04b-J → T-TH-01-J → L08-preview-J → a57-J. Combine conflicts: the `cms/package.json` hunks with `tq-jini2`/`rsh-jini` and `media/index.ts` with `dh-jini`.
- **`tv-bl`** (Tovu, launch now, base merge-6 `776ce6d0f`): S7a-T → L08-types → L15-entries → L15-members. Combine conflicts: import lines in `routes/types.ts`, `media-rendition.ts`, `memory-trash.ts`.
- **Draft `j-tv-bl-DRAFT.md`** (after bl-jini lands): K-04b-T, T-TH-01-T, L08-preview-T, plus a57-T. They run after combine of tv-xd5-render/publish, tv-ext-rs-c, tv-tq and tv-rsh.

## CLOUD RUN SCOPE (one Opus cloud run; paste-ready)

**Approved (R8–R11 + cms publish).**

*Jini first*
1. Base: Jini merge-6 plus combined `tq-jini2`, `dh-jini`, `rsh-jini`, `ua-jini`, `bl-jini`. Run `pnpm install` once, then `pnpm build` and `pnpm guard`. Run `bl-jini`'s COMMIT-PLAN tests and mutations.
2. Packed-entry proof: `npm pack` cms, http-kit, devops and admin. In a temp consumer, import every new entry: cms `./presentation/html`, `./presentation/page-head`, `./forms/result-query`, `./forms/result-flash`, `./themes/preview/refresh`, `./seo/cover-image`, `./themes/token-aliases`; http-kit `./range`; devops `./backup/plan-store`, `./backup/push-jobs`. Check `.d.ts` output; regenerate API-report rows.
3. R8a steps 4–5, R8b steps 6–8 (a65): rebase the `cloud-results/daemon-r8-2` series per `untangle/daemon/R8-RUNTIME.md` (`origin/plan/xpkg-lane-sheets-2026-11-16`) onto the current split-jini platform layout. Reconcile the daemon / agent-runtime / node / preset declarations and regenerate `pnpm-lock.yaml`.
4. R8 step 9: drop daemon's runtime `@jini-ai/agent-runtime` dep and its injection-debt rows, then re-lock. Drop `@jini-ai/platform` only if no import remains.
5. R11a: rebase `R11a-prepared.patch` (`R11-platform-consumers.md`). Move native effects from agent-plugins to node-adapters, declare `@jini-ai/node-adapters` at the host readers, prove the preset and Tovu plugin-runtime bindings, then re-lock.
6. R11b-1 steps 1, 3–4: Node-adapter lock/writer/process bindings for mcp (`owned-json-install.ts:3`) and sidecar (`json-file.ts:13`, `supervisor-node.ts:6,8`).
7. R11b-2 step 2: remove the remaining MCP platform manifest entries and debt rows, then re-lock.
8. R11b-3: bind guarded clients for integrations (`dispatch/{node,outbound}.ts`, `saved-requests/execute.ts`) in presets and Tovu. Update the optional platform peer, the lock and the edge debt.
9. Full Jini suite and guard. Run `changeset version` and publish a `next` snapshot of every changed package.

*Tovu second*
10. Base: Tovu merge-6. Merge (retry) `tv-xd5-render` and `tv-xd5-publish`, then `tv-ext-rs-c`, `tv-rs-e`, `tv-split`, `tv-tq`, `tv-dh` and `tv-bl`. Bump `@jini-ai/*` to the snapshot and run `npm install` (root plus `apps/desktop`) to regenerate the lockfiles.
11. Run targeted tests for the changed files, plus `check:boundaries`, `check:architecture` and `worker-import-graph.test.ts`. Run the mutation checks that the COMMIT-PLAN files name.
12. Packaged desktop: install from the archive and boot (`a0dbfebe3` lesson).
13. Chrome checks: page head and form feedback, byte-range media serving, theme preview refresh, backup plan/push, public rendition and replace-file freshness.

**Add-ons (need an estimate and owner OK):** G-STALE-DEPS row 1 (~10 min); S6b after step 8; S3a/b; S7b dialect proof; R12c/R12d; D0c v5 on the step-9 snapshot; Desktop 2. Env has no cloud step until re-sheeted.
