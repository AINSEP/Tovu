# COMMON rules for every notes-second-app sheet

Each sheet is ONE Sonnet run. It inherits everything here. Read `../DESIGN.md` §2, §5, §7 first.

## Setup (before reading any source)

```sh
# Jini checkout must be a directory named exactly `Jini`; Tovu (if needed) is its sibling.
cd Jini && git fetch origin && git checkout -B <branch named in the sheet> origin/<BASE>
pnpm install && pnpm -r build
```

`<BASE>` = `integ/merge-final-2026-11-16` if it exists, else the newest of `integ/merge-b-2026-11-16` /
`integ/merge-a-2026-11-16` that contains the sheet's prerequisites. Say which in the report.
Record a **green baseline on the unmodified tree** for the packages the sheet names (typecheck + tests) and paste
the summary lines in the report. A red baseline is reported, not fixed, unless the sheet says so.

## Working rules

1. Run the sheet's **Inventory** commands first and compare with the sheet's "expected". A mismatch that changes
   a file list, an export name or a signature is a STOP (report the difference; do not improvise).
2. Tests first: write the listed test, see it **fail for the stated reason**, then implement. A new test that
   passes on first run is rewritten.
3. One commit per step; each step compiles and passes alone. Commit, then verify, then commit fixes
   (`wip:` is fine). `git pull --rebase` before every push; never force-push. Push every 5–10 minutes.
4. Owner limits inside every file you touch or create: functions <= 50 lines, cyclomatic complexity <= 10,
   file <= 500 lines, exported functions `(required, optional = {})`, explicit return types, no lazy
   `import()`, no `vi.mock` of a `@jini-ai/*` module, fakes implement the real interface.
5. No behaviour change outside the sheet's file list. Out-of-list edits needed to compile are listed in the report.
6. Never edit: `pnpm-lock.yaml` by hand (let `pnpm install` write it and commit it), `scripts/*-debt.json`,
   `scripts/injection-*.json`, any file in Tovu unless the sheet names it.
7. No text, path or identifier from Tovu in Jini. `rg -ni "tovu" <files you touched>` must be empty.

## Gates (run those that apply; paste real output)

| Scope | Command |
|---|---|
| Example server | `cd examples/notes-app && pnpm typecheck && node --test 'src/**/*.test.ts' && node scripts/smoke.ts` |
| Example web | `cd examples/notes-web && pnpm typecheck && pnpm test && pnpm build` |
| Example desktop | `cd examples/notes-desktop && pnpm typecheck && pnpm test && pnpm build` |
| Touched Jini package | `npm --prefix packages/<pkg> run typecheck && npm --prefix packages/<pkg> run test` (never a root `npx vitest`) |
| Jini repo gates (G/D sheets) | `pnpm guard && pnpm check:cross-package && pnpm api:check && node scripts/check-size.mjs && node scripts/check-complexity.mjs` |
| Tovu link check (G sheets) | in Tovu on `refactor/terra` (or merge-final): `npm install && npx tsc -p tsconfig.json --noEmit` with `../Jini` at your SHA |

`pnpm api:check` or `check:cross-package` failing only because of an **intended** new export listed in the
sheet is reported with the diff; add the changeset the sheet names. Any other failure is fixed or reported.

## STOP conditions (stop, push what is committed, report)

- A prerequisite branch/export named in the sheet is missing.
- The inventory differs from "expected" in a way rule 1 describes.
- A step would need a file another lane owns (the sheet lists them) or a `package.json` `exports` edit the
  sheet marks coordinator-only.
- A security test in the sheet cannot be made to fail by the named mutation.
- You are about to copy more than 10 lines from one existing file into another instead of moving or importing.

## Report (last message)

Branch, every pushed SHA, base ref + SHA, baseline result, per-step result, gate output summary, test count
before/after for each touched package, out-of-list edits, what was not verified, and for G sheets the deletion
ledger (file, lines removed, why deletable).
