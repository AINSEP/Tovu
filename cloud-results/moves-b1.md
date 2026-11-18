# moves-b1 (Tovu + Jini, branch `wave3/moves-b1`, base origin/refactor/terra = Tovu ada11733f / Jini 4c1892368)

Run: PARTIAL (context budget; wall clock was not the limit). Node 24.22.3, `npm ci` (root, apps/admin), Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (clean), `link-jini.mjs` against the local Jini, contracts + sdk built.
List: `origin/plan/moves-wait-b1-2026-11-17:moves-wait-b1/MOVES-NOW-1.md` (WAIT-B1). Sheets: best-of-each from the plan branches (plan/w1-sheets-a..f, plan/terra-2026-11-15).

## Base ratchets (unmodified origin/refactor/terra), recorded first
size exit 0, complexity exit 0, errors exit 0, hooks exit 0, **architecture exit 1 (red on base)**. Pass rule = no NEW line beyond base.

## DONE (one move per commit; tests pass alone)
| move | Jini | Tovu |
|---|---|---|
| delete-plugins (6 forwarders deleted, 28 call-shape folds, daemon-client import-graph guard now asserts no reachable file loads `@jini-ai/db/data-modules`; this is the "path_literals" row; site-paths.ts was a new importer, repointed) | - | b3661aa17 |
| delete-mail job 1 (SMTP wrapper + aliases) | - | f3bf77296 |
| delete-mail job 2 (mail-status keep-only) | - | 1b2827b7f |
| delete-mail job 3 (ports.ts delete-and-repoint, 4 stale write-path-inventory rows) | - | 875d107f0 |
| consent slice 1 (preview scale -> `@jini-ai/admin/consent/react`) | 973c07777 | 77efe0353 |
| DD-web-1 (web-page.ts reduced to binding) | - | 10421917b |
| why-comments: mail rationale kept on the barrel + 9 debt entries | - | 417411fb6 |
| DD-entry-refs-1 (types.ts/ports.ts -> `@jini-ai/cms/widgets`) | 30954d12c (EntryRefRow docs) | 3875b9f23 |
| MV-entry-refs-1 (InMemoryEntryRefsRepo -> `@jini-ai/cms/widgets`) | 7412f1dbd | 4b9d3620a |
| entry-refs port method docs onto Jini port + 11 why-comment debt entries | 06cc2bb48 | (the commit carrying this file) |

## DONE-ALREADY on refactor/terra (checked, nothing to do)
- repoint-commands: both shims gone, importers use `@jini-ai/cms/core/commands`.
- dedupe-site-guide: Tovu e559fad17.
- move-html: `safeTextAlign`/`safeAspectRatio` are in `@jini-ai/cms/html/style-values`; the remaining Tovu `platform/html/style-values.ts` holds other sanitizers (size-03 step 1), not this sheet's scope.
- ui-dashboard: `usePersistedDisclosure` exists in `@jini-ai/ui`, Tovu file is the reduced binding.
- SP-commands-1: `import-local.ts` uses `readStdinRequestLine` from `@jini-ai/cms`-sibling `@jini-ai/cli`.
- stay-error-mapping: Tovu 31ae47764.
- DL-web-1 (not on the list): html-document.ts already gone.

## STOPPED / not executed (with reason)
- ui-admin-themes slice 2: needs a design fill (per instructions).
- ui-admin-database slice 1: BLOCKED Q-WH (owner question).
- media-generation slice 3: sheet says "PARTIAL, not filled".
- split-events: sheet never written (handoff note only; needs a core-contract amendment decision).
- NOT STARTED, budget only (sheets are ready, none drifted that I saw): SP-entry-refs-1 (12 text edits + Opus review; do next, it is the cleanest follow-up of the entry-refs work), SP-web-1, split-email-templates, split-member-login (HD-1, MV-1), MV-kernel-2, ui-admin-sites slices (AllSitesTab/Sites/panel-kit index), split-services (110k est.).

## Drift found and handled (facts re-verified on the new base)
- delete-plugins: importer `composition/site-paths.ts:3` (`isInMemoryDbPath`) is new since the sheet; repointed the same way. The daemon-client test named `features/plugins/migration-recovery` by path, now guards the Jini specifier instead.
- DD-entry-refs-1: the importer `features/publish-content/type-registry.ts` is now `tovu-publish-ports.ts` (identical import line); `server/routes/types.ts:616` comment pointed at the deleted file, updated.
- MV-entry-refs-1: census was 34 lines instead of 22 (14 importers added by merged work, 3 of them `import type`, 2 relative test imports); all are the same one-name import, repointed in the same commit. Treat as a judgment call, flagged here.
- Why-comment gate: deleted-file comments that moved to Jini cannot be seen by the Tovu gate, so 20 entries are listed in `development/why-comments-debt.json`, each naming where the text lives (Jini SHAs above) or why it is obsolete.

## Gates (final tree, exact commands)
- Tovu `npm run typecheck`: exit 0 (c2 run, tree = HEAD 4b9d3620a).
- `check:size` exit 0, `check:complexity` exit 0, `check:errors` exit 0, `check:hooks` exit 0: no line beyond base.
- `check:architecture` exit 1 (red on base too): no new line kind; numbers improved vs base (API surface 851 -> 848, hub count 363 -> 359, propagation cost improved).
- `check:why-comments` (against origin/refactor/terra): ok after the debt entries (18 blocks, 18 allow-listed at last run; the final run is on the commit carrying this file).
- Tests (`node --test` via the repo's tsx loader, `--test-concurrency=2`): plugins + composition + daemon-client 135/135; mail platform+mail-status 182/182, boot mail 83/83, mail-status+route 122/122, platform/mail 33/33; web 59/59; entry-refs + repos + where-used + html-document-store 66/66; the 36 repointed entry-refs importer test files 370 pass 0 fail. Admin vitest `src/features/consent`: 115/115. Jini: `packages/admin` vitest `src/consent` 32/32 (new preview-scale test 2/2); `npm --prefix packages/cms run test` 4085/4085 (338 files); `pnpm guard` ok; cms + admin `tsc` clean; eslint clean on changed Jini files and on changed Tovu lines (only pre-existing max-lines/complexity debt shown).
- Jini changesets added: `admin-consent-preview-scale.md` (minor), `cms-entry-refs-memory.md` (minor); doc-only commits add none.
- Desktop pre-push hook: "no apps/desktop changes in this push - skipping desktop gates"; no `--no-verify` used.

## Overlaps with parallel runs
All edits are in website `platform/mail`, `features/plugins`, `features/web`, `contracts/core/entry-refs` + their importers, admin `features/consent`, `development/why-comments-debt.json` (shared append-only file: expect a trivial merge conflict with other runs, keep both sides), `development/scripts/write-path-inventory.baseline.json` (4 objects removed). `routes/types.ts`, `composition/deps.ts`, `composition/site-paths.ts` are one-line import edits (hot files).

## Next step
Run SP-entry-refs-1 (Jini 7412f1dbd already exports the in-memory repo; the sheet's J1-J12 apply to `packages/cms/src/widgets/entry-refs-extractor.ts`), then SP-web-1, then the ui-admin-sites slices.
