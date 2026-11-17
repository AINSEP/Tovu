# Sheets: the one contract every executor follows (revision 2)

One sheet = one Sonnet run = one sheet branch per repo. Read the `../DESIGN.md` sections the sheet names first.
This file and the sheet are **one contract**. If they disagree, stop and report; do not pick one.

## 1. Setup (before reading source)

1. Checkouts side by side, named exactly `Jini` and `Tovu`. Both on the **same-named** integration branch:
   `integ/merge-final-2026-11-16` if it exists in both repos, else `integ/merge-a-2026-11-16` in both.
   Never mix `merge-a` in one repo with `merge-b` in the other. Record both SHAs in the report.
   (`merge-b` lacks `packages/core/src/errors/reporter.ts`; S8 and S9 cannot run on it.)
2. Jini: `pnpm install && pnpm -r build`.
3. Tovu (only when the sheet has a Tovu part): `npm ci`, then link the local Jini build:
   `JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini` and check
   `JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini -- --dry-run` reports nothing left to do.
   Tovu's `package.json` pins `@jini-ai/*` to registry versions (`^0.7.0`); without the link Tovu does not see new Jini code.
   Never run `npm run build` while linked (`check-no-linked-jini` refuses, by design). Never edit Tovu's `@jini-ai/*`
   version ranges or the lockfile: that is the release step **REL** in `../INDEX.md` §3, not part of any sheet.
   After every Jini change that Tovu reads: `pnpm --filter @jini-ai/<pkg> build` again.
4. Drift check against the plan's base (generated table, 49 files):
   ```bash
   tail -n +2 tool-call-fixes/sheets/BLOBS.tsv | while IFS=$'\t' read repo path blob sheets; do
     [ "$(git -C ../$repo rev-parse HEAD:$path 2>/dev/null)" = "$blob" ] || echo "DRIFT $repo $path ($sheets)"; done
   ```
   A `DRIFT` line for a file your sheet names means: re-run the sheet's inventory step and re-find every symbol with
   the sheet's `rg` lines. A symbol with **zero** hits is a STOP (§4.2).
5. Green baseline on the unmodified tree, recorded in the report with test counts:
   Jini `pnpm guard && pnpm typecheck && npm --prefix packages/<pkg> run test` for each package the sheet names.
   Tovu `npm run typecheck && npm run check:size && npm run check:complexity` and the named test files (use the exact
   runner line of the `test` script in `package.json`, with the file path in place of the glob).
   A red baseline is a STOP: report it; do not start.

## 2. Order inside every sheet

1. Inventory step (the sheet's `rg` lines). Paste the lists in the report.
2. Characterization test: passes on the unmodified tree, pins today's behaviour. Gate (§3), commit, push.
3. Red-first test: write it, run it, see it **fail for the reason the sheet names**, paste the failure in the report.
   Do **not** commit it alone.
4. Smallest change that makes it pass. If the characterization test pinned behaviour that now changes, change that
   assertion in the same commit. Gate (§3), commit test + change together, push.
5. Repeat 3 and 4 per numbered change. Every commit on the sheet branch passes the gate by itself.

Work that is not green yet is never lost and never on the sheet branch: push it to `wip/<sheet-id>` (same repo) as
often as you like. The sheet branch receives only gated commits. This is how "push every 5 to 10 minutes" and
"every commit green" both hold. `git pull --rebase` before each push. Never force-push.

## 3. The gate (run before every commit on the sheet branch)

```bash
# Jini
pnpm guard && pnpm typecheck && for p in <packages the sheet names>; do npm --prefix packages/$p run test || exit 1; done
# Tovu (linked)
npm run typecheck && npm run check:size && npm run check:complexity && <the sheet's test files>
# both repos: the diff checks of §4.3 to §4.9 print nothing
```

## 4. Stop and report instead of guessing. Each stop has the command that detects it.

`BASE` = the integration SHA you started from. `D="git diff $BASE...HEAD"`.

| # | Stop when | Command (must hold) |
|---|---|---|
| 4.1 | the gate fails and you cannot fix it inside the sheet's scope | §3 exit code is 0 |
| 4.2 | a cited symbol is gone or already changed | each sheet's `rg -n "<symbol>" <path>` line has at least one hit |
| 4.3 | a declared dependency is imported lazily | `$D -- '*.ts' '*.tsx' \| grep -nE '^\+.*(await import\(\|[^.]require\()'` prints nothing |
| 4.4 | a test mocks a module instead of faking an interface | `$D \| grep -nE '^\+.*(vi\.mock\|vi\.doMock\|jest\.mock\|mock\.module)\('` prints nothing |
| 4.5 | a lint or type escape is added | `$D \| grep -nE '^\+.*(eslint-disable\|@ts-ignore\|@ts-expect-error\|@ts-nocheck\|istanbul ignore\|v8 ignore)'` prints nothing |
| 4.6 | a barrel or re-export shell is added | `$D -- '*.ts' \| grep -nE '^\+\s*export (\*\|\{[^}]*\}) from '` prints nothing |
| 4.7 | UI code or a hook call is touched (no sheet here has UI) | `$D --name-only \| grep -E '\.tsx$'` prints nothing. If a sheet ever needs a component: every custom hook (including `useT`, `useAdminLocale`) is a prop defaulted to the real hook with a fake-hook output test, and that is a STOP to ask first |
| 4.8 | a why-comment is lost | `$D \| grep -E '^-\s*(//\|/?\*)' \| sed -E 's/^-\s*//' \| sort -u > /tmp/c.del; $D \| grep -E '^\+\s*(//\|/?\*)' \| sed -E 's/^\+\s*//' \| sort -u > /tmp/c.add; comm -23 /tmp/c.del /tmp/c.add` : every printed line is in the report with its reason (code it explained was deleted, or behaviour changed and the comment was rewritten). An unexplained line is a STOP |
| 4.9 | a new cross-package symbol has no public entry | for each new file another package imports: its `exports["./<entry>"]` and `jini.entries["./<entry>"]` are in the **same commit**, and `(cd packages/<consumer> && node --input-type=module -e "await import('@jini-ai/<pkg>/<entry>')")` exits 0 after `pnpm -r build`. A `universal` entry file prints nothing for `grep -n "from 'node:" <file>` |
| 4.10 | a needed owner decision is open | `grep -nE "^\| OD-<n> .*\| DECIDED: " tool-call-fixes/INDEX.md` has a hit for every decision in the sheet's header |
| 4.11 | a prerequisite sheet or lane has not landed | the sheet's "Landed check" line (an `rg` for a symbol the prerequisite creates) has a hit |
| 4.12 | a security gate would move or run in a different order than `../DESIGN.md` M1 | the sheet's gate-order test passes, and removing each named gate in a scratch edit makes a named test fail (prove once, restore, paste the failures) |
| 4.13 | the red-first test passes without a change | step 2.3 output; report "already fixed", do not invent work |
| 4.14 | a measured fact contradicts the design | the sheet's measured value (for example `pinnedFit`) against the number the sheet states |
| 4.15 | a test is skipped, weakened or deleted, or coverage settings change | test counts per touched file before and after are in the report; a lower count needs a written reason; `$D \| grep -nE '^\+.*\.(skip\|only\|todo)\('` prints nothing |

## 5. Owner rules (acceptance criteria in every sheet)

- Functions ≤ 50 lines, complexity ≤ 10, files ≤ 500 lines, checked **inside each new or edited function**. A file
  already over 500 (for example `core/src/registration-kit.ts`, 593) gets a sibling file, never more lines.
- Exported functions take `(required, optional = {})`. Clock, ids, scheduler, fetch, logger and reporters come in as
  typed ports from the host; tests pass fakes of those interfaces.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. No Tovu or vendor tool names and no web
  framework (Express) in new Jini code. Express middleware lives in Tovu.
- Errors: plain words, exact text asserted with `assert.equal` / `toBe`. Never a status or a code alone. Never mask a
  tool id, an input name or a slug the vocabulary rules allow. Never print a secret. Never swallow: every catch
  either answers the caller or reports through the injected reporter.
- Text from a server that was **not** written for the caller (HTML error pages, non-JSON bodies, exception text) is
  never shown to the model. Fixed words plus a recorded reference instead (`../DESIGN.md` M5).
- No silent behaviour change: every changed model-facing sentence is listed old → new in the report.
- No schema change, no delete of user data, no new CSS, no new i18n string is needed by any sheet. If one seems
  needed, stop.
- Tools first: nothing here adds a reason for an in-app agent to use Bash.

## 6. Report (end of run)

Branches and base SHAs (both repos), every pushed SHA, files changed, test counts before/after, each pasted red
failure, the §4.8 comment list, new Jini exports Tovu now consumes (for **REL**), changed sentences old → new,
anything not verified.
