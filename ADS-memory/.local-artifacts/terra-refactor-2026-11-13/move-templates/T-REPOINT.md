# T-REPOINT: Tovu re-export/copy of a published Jini export -> repoint importers, delete the file

Template for kind REPOINT (KINDS.md §1). Worked examples: d1 `terra-lane.terra-prompt.md` (`/Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/`) and W0 `sheets/repoint-observability.md` (Tovu `54dac1ff3`, 54 importers). Executor: script or Sonnet 5.5 high. Many rows fit in ONE job (cap 40 EDITED FILES across all rows: one row with 54 importers is 54 edits, not one row); each row is independent and skips alone.

## Sheet (one block per row)
```
id: {ID}                                   # RP-<feature-slug>-<n>
tovu_file: {path} | blob {sha}
non_reexport_statements: {N}               # from the filler; must be 0 (else this is not a REPOINT)
symbol_map:                                # every exported name -> the published Jini specifier
  - {name} -> {@jini-ai/pkg/subpath | @jini-ai/pkg (barrel)}   # cite packages/{pkg}/package.json:{line}, or the barrel file:line
jini_why: {"pointer only" | "already on Jini declaration: {jini file:line}" | "MOVE: {comment first words} -> {jini file}, above {declaration}" | "drop: Tovu-specific, already at {tovu file:line}"}
importers:                                 # = output of the census command in step 1; any difference = SKIP
  - {path}:{line} | {static | reexport | dynamic | import-type} | "{specifier as written}"
comment_refs:                              # only comment lines that give a LIVE path to tovu_file
  - {path}:{line} | "{old}" -> "{new}"
baselines:                                 # every hit of the baseline search in step 4; or -
  - {path}: remove "{entry}"
```

## Steps
0. Branch rule; blob check of `tovu_file`.
1. Census: run `python3 scripts/census.py {TOVU_CLONE} {tovu_file}`. It resolves every quoted `./`, `../`, `#src/` (= `apps/website/src/`), `@/` (= `apps/admin/src/`) specifier in `apps content development` (minus node_modules) against the file (extension-less, `.js`, `.ts`, `.tsx`, folder `index.ts`) plus path literals of the file. Its output must equal `importers`; else SKIP the row. An `rg` for the folder or file name is not a census (it misses `../../index.js` style imports and matches substrings).
2. SKIP the row if any importer: uses `import * as`/`import type * as` on it, mocks it (`vi.mock`, `mock.module`), reads it as text, or enumerates its exports; or if a test checks the file exists.
3. `jini_why` decides the header rationale of the shim:
   - (a) the idea is already on the Jini declaration: `pointer only` / `already on Jini declaration`, nothing moves;
   - (b) it is generic and absent in Jini: `MOVE`. Jini commit first, doc-only, moving the comment onto the Jini declaration (no changeset: doc-only). Tovu text rule applies to the moved words;
   - (c) it is Tovu-specific and already sits at the Tovu binding (composition, provider wiring): `drop`, citing where it sits.
   Tovu-specific text with no home in Tovu = STOP.
4. Rewrite importers mechanically: when every name of an import maps to ONE specifier, replace only the specifier string on each census line (for a multi-line import, the `} from "…"` line). Do not merge with an existing import of the same Jini specifier (no lint rule requires it). When names map to different specifiers, split the import into one per specifier, keeping `type` modifiers and import order lint-clean. Then apply `comment_refs`. Then baselines: run `rg -n -F "{repo-relative path of tovu_file}" --glob '*.json' --glob '*.mjs' --glob '*.cjs' --glob '*.yml' --glob '*.yaml' --glob '!**/node_modules/**' .` in the Tovu clone; every hit must be listed under `baselines` (apply them), else SKIP.
5. `git rm -q -- {tovu_file}`. Re-run the census: zero hits.
6. eslint every edited `.ts/.tsx`. One Tovu commit for all DONE rows of the job: `refactor(<area>): import <names> from Jini directly` with every path, the deleted file included.

## comment_refs scope
Only comment lines that give a live path to the deleted file (`platform/observability/index.ts`, `see ../foo.ts`). Comments naming the folder or feature conceptually, or describing history ("its one entry was platform/observability/index.ts"), stay unchanged and are not listed.

## STOP / SKIP specific to REPOINT
- A name is missing from the Jini `exports` surface (or from the cited barrel), or needs an `as` rename the sheet does not state.
- The Tovu file has any non-comment statement besides re-exports (then it is a DEDUPE, not a REPOINT), unless the sheet says "exact copy, body-identical to {jini file}" and cites it.
- A baseline hit the sheet does not list.

## Expected afterwards
Typecheck of the touched apps in the batched cloud run; `check-architecture` may only lose edges; any gate whose baseline row was removed (for example `no-vendor-in-core.boundary.test.ts` for `vendor-exceptions.json`) is named in the report.
