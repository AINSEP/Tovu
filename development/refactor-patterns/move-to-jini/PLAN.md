# Move Tovu code to Jini: small Terra lane + Opus backlog

Status: DESIGN ONLY (2026-11-13). Nothing executed. Tovu branch `design-d1` (clone `/Users/la/Programming/tovu-terra-d1`); Jini clone `/Users/la/Programming/jini-terra-d1` (all packages 0.7.1, read for evidence only).

Why this shape (owner decision 2026-11-13): the previous 15-stage design (1,336 rows) failed two Codex reviews with the same class of problem: rows labelled mechanical that needed judgment, and growing bookkeeping (retry loop, ledger, successor map, disposition checks, split template) to manage them. That design is deleted; git history is its record (last commit before this one: `726600b66`). Now:

1. **Terra lane**: only rows where Jini already publishes a drop-in and the Tovu change is "repoint imports, delete the Tovu file". 40 rows.
2. **Opus backlog**: everything else, one line per feature, no stage machinery. 1,296 files.

## Files in this folder

| File | What it is |
|---|---|
| `terra-lane.tsv` | The 40 lane rows: Tovu path, git blob hash, Jini specifier(s), symbol map, evidence on both sides, importer count, comment handling, comment lines that name the file. |
| `terra-lane.importers.tsv` | 465 references to those 40 files (importer, line, kind, specifier as written). |
| `terra-lane.terra-prompt.md` | The one Terra job prompt. Literal per-row procedure; skip, never improvise. |
| `opus-backlog.md` | Owner rules, 10 cross-feature items, 18 excluded shims with reasons, 170 per-feature lines. |
| `opus-backlog.files.tsv` | The 1,296 backlog files: `path loc feature action pkg subpath was_stage survey_note`. |
| `feature-cycles.mjs` | Feature-level import-cycle measurement for `apps/<app>/src/features/*` (`--drop a->b` simulates a cut, `--max-scc/--max-pairs` ratchets). For backlog item 1. |
| `build-manifest.mjs` | Rebuilds the local, gitignored `manifest.tsv` from the 2026-11-11 extraction survey (`ADS-memory/.local-artifacts/extraction-survey/2026-11-11`). |

Deleted (history only): `stage-01..16` prompts and file lists, `stage-lists.mjs` (routing, retry, disposition check), `write-prompts.py`, `prompt-blocks.py`, `move-table.py` (MOVE/SPLIT generators), `ledger.tsv`, `successors.tsv`, `stages-landed.txt`, `jini-cycles.py` (its completeness gap was review finding d1r-10; Jini's own dependency-cruiser covers the backlog).

## 1. Terra lane: what qualifies

A row is in the lane only if ALL hold, checked on both sides:
- Jini publishes the same names (same name, or one explicit `as` rename; none of the 40 needs a rename) from a subpath listed in that package's `package.json` `exports` (line cited per row).
- Same argument shape, return shape and behaviour. For 39 rows this holds by construction: the Tovu file is a pure re-export (`export {...} from "@jini-ai/..."`, `export * from`, `export type *`), so importers already run Jini's code. Row L40 (`platform/db/keyset-cursor.ts`) is a real copy: body and comments are identical to `packages/cms/src/core/keyset-cursor.ts`; Jini adds a trailing optional argument no caller passes.
- Every reference to the file is a plain specifier string (static import/re-export, dynamic `await import("...")` destructuring, or `import("...").Type`) whose rewrite needs no other change: no namespace import, no module mock, no test that reads the file or checks its export surface, no baseline file that lists it.
- Its why-comment is either a pointer ("lives in Jini"), or the Jini file already carries the rationale (phrase-checked, file cited), or (L32 only) a one-line Tovu note pasted above the import in a named file.

Rows by origin: 39 of the old stage-01 shim rows (survey `T0:JINI-SHIM` or `DELETE`) and 1 old stage-02 DEDUPE row.

How rows were found (read-only, reproducible): every manifest file whose non-comment content is only `export ... from "@jini-ai/..."` statements (57 files); importers by resolving every quoted `./`, `../`, `#src/` (= `apps/website/src/`), `@/` (= `apps/admin/src/`) string in the repo (minus `node_modules`, `ADS-memory`, `AI-Dev-Shop`) against the file (extension-less, `.js`, `.ts`, `.tsx`, folder `index.ts`); Jini names resolved from the export entry through re-exports to the declaring file. 18 of the 57 failed one of the checks above and went to the backlog with the reason (`opus-backlog.md`, "Excluded shims").

Execution:
- One Terra run with `terra-lane.terra-prompt.md`, in the Tovu checkout the coordinator names. It edits importers and comment lines, deletes the 40 files with `rm`, runs no tests/tsc/builds/installs, never commits, and reports DONE/SKIPPED per row plus every changed path.
- Drift guard: step 1 compares `git hash-object` with the `blob` column; step 2 recomputes the importer set and skips the row if it differs from `terra-lane.importers.tsv`.
- After the run the coordinator commits the listed paths; targeted checks for the touched files go in the batched cloud run (typecheck of `apps/website` and `apps/admin`; tests of the edited test files). No Jini change, no release, no version bump.
- Expected gate effects: `check-architecture` only loses cross-feature edges (it fails on additions only); no lane file is listed in the write-path or coverage-integrity baselines.

## 2. Opus backlog

`opus-backlog.md` is the work list. Shape:
- Owner rules every item follows (object args, complexity 9/9 admin and 10/10 elsewhere, functions <= 50 lines, no `console` in Jini, why-comments move, failing test first, additive Jini, leaf own-package imports).
- 10 cross-feature items first: the import-cycle cuts (C1-C5, 18 type back edges, 3 admin edges, 2 Jini module cycles), the desktop navigation adapter, `console-tee` (injected target + redaction ports), `section-collector` (D2 + report port), the keyed serializer (reuse Jini `createKeyedLock`, `packages/cms/src/media/transform-lock.ts:33`), `auto-update-controller`, positional public APIs, `node:test` context tests, Express-bound rows (`{ app: Server }` contract first), and the 15 old stage-02 rows.
- 18 excluded shims with the one blocker each; six become lane rows once their why-comment is moved onto the Jini declaration.
- 170 feature lines: files/lines, label counts, target Jini packages, why it needs judgment, dependencies (cycle cuts for the 24 SCC features; MOVE-AFTER preconditions), owner gate (D2 for core rows).

Opus takes one feature at a time, re-reads the code (survey labels are from Tovu c369798/a9c1184), and commits that feature alone. No ledger: the commit removes or rewrites the feature's backlog line, and `git log` is the record.

Backlog totals (non-test files; survey label): MIXED 474, MOVE-AFTER 271, MOVE 199, DELETE 148, DEDUPE 91, DELETE-AFTER-PARITY 50, DEDUPE-AFTER-HARDENING 33, DEDUPE-UNVERIFIED 17, JINI-SHIM with a blocker 13. 1,296 files, 233.6k lines. 67 files name `@jini-ai/core` (D2).

## 3. Owner decisions (defaults apply until answered)

- D1 Prereleases: may the refactor publish `0.8.0-refactor.N` under a `refactor` npm dist-tag? Default: NO, Tovu stays on `link:jini`, one coordinated publish at the end. The Terra lane needs no Jini change, so D1 does not affect it.
- D2 Runtime helpers in `@jini-ai/core` outside `contracts/`: allowed? Default: WAIT. Rows and symbols naming core runtime stay where they are; no executor picks another package.
- D3 `commit-site` home: default YES, it moves from source-control to site-backup (cycle cut C5).

## 4. Facts a reviewer should check

- Tovu imports `@jini-ai/*` at `^0.7.0`; the installed packages (0.7.0) already export every lane name (the shims compile against them today; L40's names are in `node_modules/@jini-ai/cms/dist/core/index.d.ts`).
- `@jini-ai/db/recovery/<name>` rows resolve through the `"./recovery/*"` wildcard export (`packages/db/package.json:117`) to `packages/db/src/recovery/<name>.ts`.
- L38's types come through `packages/platform/src/mail/index.ts:5` -> `engine-contracts.ts:1` -> `@jini-ai/core/contracts/mail`.
- Importers outside `apps/`: 21 plugin-overlay tests under `content/agent-plugin-overlays/` import L09 by relative path; repointing them to `@jini-ai/agent-plugins/connect` resolves from the root `node_modules`.
