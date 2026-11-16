# R-BARRELS — delete every Tovu re-export shell of Jini (wave C)

Owner rulings: (d) no re-export shells, no exceptions; (b) the `@tovu/sdk` re-exports of Jini go too (plugin authors import from Jini; `definePlugin` setup stays). Coordinator 2026-11-15 adds the two forwarders found that night: `apps/admin/src/lib/standing-draft-recovery-message.ts:8` (Jini, covered by the census) and `apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts:73` (Tovu to Tovu, passed to the census as `--forwarder`).

Tovu only. The 10 Jini `platform`→`core` re-exports are **R-BARRELS-J**, a separate lane, not this one.

## Files
- `sheets/R-BARRELS.repoint.tsv`: 2,225 applier rows (format as in `C10-shell.repoint.tsv`).
  - 1,782 importer rows (1,781 applied by the applier, 1 MANUAL) across 1,238 files. 1,110 of the rows are in test files. 48 rows carry a `rename`.
  - Then 443 DROP rows across 229 files: 369 Jini `export-from` rows, 63 Tovu-chain hops (`export { X } from './y'` where X is a Jini name), 10 `export * from '@jini-ai/…'` and 1 Tovu forwarder.
- `sheets/R-BARRELS.hand.tsv`: 139 hand edits the applier cannot make. Columns: `file line kind what do`.
- `scripts/rbarrels-census.cjs`: the census that produced both files. It is read-only and runs on plain trees.

### How the census works
1. It finds every Tovu export whose name leaves Tovu through a `@jini-ai/…` specifier. It follows Tovu-to-Tovu hops: relative paths, `#src/`, admin `@/` and the `@tovu/headless|theme-layout|publish-content-ui|assistant-run-events` aliases, and `@tovu/contracts/*` and `@tovu/sdk`.
2. Every Tovu import of such a name is repointed to the Jini specifier written at the last Tovu hop, which is the barrel author's own choice. When the barrel renamed the name (`export { A as B }`), the row renames it back (`B->A`) and its uses follow.
3. Each re-export element then becomes a DROP row. A barrel that also exports Tovu code loses only its Jini names.
4. Package dependencies were checked: every importer's own `package.json` already declares the Jini package. A missing dependency would show as `DEP:` in `note`, and none do.

### Census base and counts
The census ran on `git archive` snapshots of `integ/wave-b`: Tovu `de25bf7b7`, Jini `d8e4347f3`.

| | LANES estimate | Census |
|---|---|---|
| Re-export statements | 382 (git grep, single-line only, no chain hops) | 475 (474 non-test) |
| Barrel files | 211 | 256 (255 non-test) |

Breakdown of the 475 statements:

| Kind | Count |
|---|---|
| Jini `export-from` | 369 |
| Tovu-chain hops | 63 |
| `export *` | 10 |
| Local `export { X }` of an imported Jini binding (these are hand edits) | 33 |

## Order in wave C
R-BARRELS runs **LAST** in wave C, after C6, C11b, P-ZOD and C9b/c have merged. It touches about 1,430 Tovu files. Other lanes' TSV rows name barrel specifiers (for example `#src/features/settings`), and running first would make those rows stale. At dispatch, regenerate both files on the lane base (step 0). The census takes about 20 s.

## Steps

### 0. Regenerate the census (lane, scripted)
Run this on the lane base commit. `$U` = the untangle folder and `$S` = a scratch folder.

```
git -C <tovu> archive <base> -- ':(glob)**/*.ts' ':(glob)**/*.tsx' ':(glob)**/*.mts' ':(glob)**/package.json' ':(glob)**/tsconfig*.json' | tar -x -C $S/tovu
(same for Jini into $S/jini)
node $U/scripts/rbarrels-census.cjs $S/jini $S/tovu $S/out --forwarder apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts:73
```

Then:
- Copy `out/rows.tsv` to `R-BARRELS.repoint.tsv`. Keep the zoom-menu MANUAL edit described in step 4.
- Copy `out/hand.tsv` to `R-BARRELS.hand.tsv`.

**STOP** if the counts move by more than ±15 % from the numbers above (report the diff). If the forwarder at `plugin-prompt-prefix.ts` has moved off line 73, pass its new line.

### 1. Dry run, then apply (applier)
```
node $U/scripts/apply-repoint.mjs --tsv $U/sheets/R-BARRELS.repoint.tsv --repo-root jini=<jini> --repo-root tovu=<tovu> --phase all --dry-run
```
- **STOP** unless the summary reads `STALE 0, ERROR 0`. Report the stale rows. Do not hand-patch around them, and do not rerun the census on a dirty tree.
- If it is clean, run the same command without `--dry-run`. Commit by explicit paths: `git commit -F msg -- <paths>`.

### 2. Local `export { X }` hand edits (33, kind `local-export`)
Delete the listed names from the file's local `export { … }`. Delete the matching `import` too when the file no longer uses it.

### 3. Empty files (26, kind `empty-file`)
These files held only Jini re-exports. After steps 1–2, if a file keeps nothing but imports and comments, `git rm` it. Example: `contracts/core/{path-containment,upload-limits,external-mcp-*}.ts`.

The `remaining references` column lists who referenced the file before step 1. After step 1, `git grep` for the file's specifier must find nothing.

**STOP** if a leftover reference is a side-effect import or a `vi.mock` of it.

### 4. Alias forwarders (29, kind `alias-forwarder`)
These are `export type A = JiniB;` or `export const A = JiniB;`. Delete each alias. Uses in the file and in the listed importers take `JiniB` from its Jini specifier: rename `A` to `JiniB`, or keep a local `import { JiniB as A }` only where `JiniB` clashes with a local name.

`apps/desktop/src/zoom-menu.ts`:
- Delete line 23 (`export type ZoomCommandDirection = ZoomDirection;`).
- Replace the `./contracts/zoom.ts` import with `import type { ZoomCommandDirection } from "@jini-ai/desktop-host/electron/usability"` and rename the `ZoomDirection` uses. This is the TSV's MANUAL row.

Domain-named aliases (`TemplateNode = JsonValue`, `JsonLd = JsonObject`, `ADMIN_BASE`, `MEDIA_IMPORT_MAX_BYTES`, …) are forwarders too under ruling (d). Do not keep them.

### 5. Dynamic and namespace imports (41 + 10)
For each item, take the listed Jini names from the Jini specifier the hand row names. Examples:
- `const { createEntry } = await import('…/entries/index.js')` becomes an import of `@jini-ai/cms/entries`.
- `T.ExternalMcpAccessSnapshot` becomes a direct `import type`.

Nine dynamic-import items say "could not be determined". Read those by hand.

The census found **no** `vi.mock` factory that supplies a Jini name through a barrel. Recheck any `vi.mock` of a deleted file (step 3).

### 6. Shim-pin tests and the sdk
- Some tests pin that an old path still exports a moved name, for example `features/external-mcp/__tests__/h3/moved-shims.test.ts` and `h1a/hosted-mcp-type-pins.test.ts`. Delete those assertions, and delete the test file when nothing else is left in it. **Never restore a re-export to make a test pass.**
- `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts:109`: the compiled source string imports `PluginProviderContribution, PluginRouteContribution, PluginToolContribution, PluginWidgetContribution` from `../../index.js`. Change it to import them from `@jini-ai/plugins/host`. The sdk already depends on `@jini-ai/plugins`.
- In `packages/sdk/src/index.ts`, line 132 (the `export type {…} from '@jini-ai/plugins/host'`) is the DROP row. Line 133's `import type` stays because `PluginSdk` uses those types.
- Update the sdk README or the ADR-005 note if it lists those names as sdk exports.

### 7. Leftovers
- Delete imports that the DROPs or hand edits left unused, using eslint on the changed files only.
- Keep every "why" comment that sat above a deleted line by moving it to the importer or deleting it with the line. Rewrite headers that say "re-exported for compatibility".

## STOP rules
- Any STALE or ERROR in step 1, or count drift above 15 % in step 0.
- A file outside Tovu would change. This lane edits no Jini files.
- A rename would clash with a local name in a way you cannot settle with a single `as`.
- The fix seems to need a new or restored re-export, forwarder or alias (owner: no exceptions).
- A row touches `apps/website/src/platform/db/migrations/[0-9]*.ts`. The census at `de25bf7b7` has none. If one appears, the C3t source-digest map (`migrations/source-digests.ts`) must be recomputed, so report it first.
- You near 250k context: commit by paths, hand off, stop.

## Checks (lane)
1. Run the step-0 census on the result tree (`node rbarrels-census.cjs <jini> <tovu> <out>`). It must print 0 re-export statements, 0 importer rows and 0 hand items, apart from any item the coordinator signed off in writing.
2. Rerun the applier dry run on the result. Every row must be `already` or `manual`, with `STALE 0`.
3. `git grep -nE "^export (type )?(\*|\{)[^;]*from ['\"]@jini-ai/" -- '*.ts' '*.tsx' ':!ADS-memory'` must print nothing. Multi-line exports are covered by check 1.
4. No local full tsc or full suites (owner rules). Typecheck the touched Tovu projects (website, admin, desktop, site-chat, packages/sdk, packages/contracts) and run the changed tests in the wave-C cloud gate. Run no tests locally, and leave no test processes running.

## Estimate
Sonnet (sonnet-xhigh), about 185k in total. Split it into two sequential agents on the same branch:
- **R-BARRELS-a** (steps 0–3 and 6, about 90k): applier pass, local exports, empty files, sdk.
- **R-BARRELS-b** (steps 4, 5 and 7, about 95k): 29 alias forwarders, 51 dynamic/namespace items, unused-import cleanup.

The applier passes are scripted and cost little. Most of the cost is the 139 hand items and the typecheck follow-up after the cloud gate.
