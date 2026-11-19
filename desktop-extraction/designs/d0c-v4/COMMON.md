# d0c-v4 COMMON (read first; every sheet inherits it)

Design: `../D0c-REVISION-4.md` (option C: no `@tovu/host-shared`; Q2-a: product telemetry stays bundled). Sheets: `J1`-`J4` (Jini), `T1`-`T7` (Tovu), `T8`, `T9` (outlines, copied unchanged from v3, not executable).

Product rules in force: no re-export shells (an old path is deleted, never forwarded); DI/ports; exported functions `(required, optional = {})`; functions <= 50 lines, complexity <= 10, files <= 500 lines; no new bespoke script; a sheet does exactly its list (no over-engineering).

## 1. Base, branches, roles
- Tovu start: `origin/integ/merge-3-2026-11-18` **2d82735a6** (or the successor the coordinator names). Jini start: `origin/integ/merge-3-2026-11-18` **d37821a46**.
- One sheet = one branch `desktop-x/d0c-v4-<sheet>` in the sheet's repo, from the start SHA. `P` = the start SHA (the parent of the sheet's first commit). Never `git revert dd639c1fd` (the reverted host-shared merge); the reverted commits `e17f1a7d`, `8e4f68f1`, `26c8df0c`, `09669849` are reading material only.
- **Executor** (Codex): makes the sheet's edits and commits them. It runs **no gate, no test, no typecheck**. The only commands it runs are `git`, `git grep`/`rg` (for the sheet's STOP checks) and, where a sheet says so, `npx npm@11.12.1 install --package-lock-only --ignore-scripts` (Tovu). It does not touch `api-baseline/` (generating it needs a full build). It never edits a lockfile by hand. Commits end with the trailer the coordinator gives. On any STOP condition it commits nothing further and reports the condition with the command output.
- **Verifier** (an Opus cloud test-and-fix run): runs section 3 on `P` and on the candidate `C`, may fix what the gate shows (a fix stays inside the sheet's file list, plus the debt files named in the sheet), and reports. For a J sheet the verifier also runs `pnpm api:update` on the built `C` and commits the result before the gate's `pnpm api:check`; that commit may change only the sheet's own `api-baseline/jini-ai__<pkg>.json` (anything else is a STOP). Only the verifier says PASS.

## 2. Verifier setup, build and link order (per commit checked: once for `P`, once for `C`)
Node 24. Jini first, then Tovu, then the link, then the Tovu workspace builds:
1. Jini, in a checkout at `<jini>`: check out the Jini commit the sheet names under "Jini for verification" (a J sheet: the commit under test; a T sheet: the named J branch tip, or the Jini start SHA when the sheet needs none). `pnpm install --frozen-lockfile && pnpm -r build`.
2. Tovu, at the commit under test: `npm ci --ignore-scripts`, `npm ci --ignore-scripts --prefix apps/desktop`, `npm ci --ignore-scripts --prefix apps/admin`. (`npm ci` deletes `node_modules`, so steps 3-4 run again for every commit checked.)
3. Link: `JINI_PACKAGES_DIR=<jini>/packages node development/scripts/link-jini.mjs`. This is the **only** linking step: it links every direct `@jini-ai/*` dependency declared in the root and in each `apps/*/package.json` (including one a sheet just added, which `npm ci` may not have installed) and replaces any registry copy installed transitively (`development/scripts/link-jini.mjs:61-98`, `jini-links.mjs`). No hand `ln`.
4. `npm --prefix packages/contracts run build && npm --prefix packages/sdk run build` (needed because `--ignore-scripts` skips `prepare`).
`npm run build` refuses a linked Jini by design (`check-no-linked-jini.mjs`); nothing below runs it.

## 3. Gate (verifier only)
Run every command of the sheet's repo once on `P` and once on `C` (each after section 2), from the repo root, saving each command's exit status and full output (`P-<n>.log`, `C-<n>.log`).

Tovu:
1. `npm run typecheck`
2. `npm run typecheck:tests`
3. `npm run check:architecture`
4. `npm run check:size`
5. `npm run check:complexity`
6. `npm run check:hooks`
7. `npm run check:errors`
8. `npm run check:why-comments -- --base P` (on `P` this compares `P` with itself)
9. `cd apps/desktop && npm run gates`
10. each of the sheet's **named tests**, one command per file: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <file>`; a desktop file: `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test <file>`; a `packages/contracts` file: `node --import tsx --test <file>`
11. `node apps/desktop/scripts/stage-website-shared.ts` (compare the printed module list with the sheet's expected list; then delete `apps/desktop/staging/`)

Jini:
1. `pnpm -r build`
2. `pnpm guard`
3. `pnpm api:check`
4. `pnpm check:size`
5. `pnpm check:complexity`
6. `pnpm check:hooks`
7. `pnpm check:errors`
8. `pnpm check:why-comments -- --base P`
9. each named package: `npm --prefix packages/<pkg> run test`

**PASS** for `C` = for every command, (a) its exit status on `C` is 0, or equals its non-zero status on `P`; **and** (b) `C`'s output has no error line that `P`'s output lacks (failing test name, `error TS…` line, rule/metric line, file:line finding). The verifier decides (b) by reading a plain `diff P-<n>.log C-<n>.log`, ignoring timings, durations and temp paths. Plus: the sheet's new characterization tests pass on `C`; a test (or case) the sheet marks "green on `P`" is also run on `P` by copying only that test file (or appending only that case) onto `P`'s checkout, and must pass there; and each sheet's **red check** (the named one-line mutation) turns that test red, then is reverted.
**UNPROVEN** (never PASS) when any command cannot run to completion on `P` or `C` (install failure, missing tool, timeout): report the command and its output.
**Review items** (verifier reads `git diff P C`, no script): every added or changed function <= 50 lines and complexity <= 10; no added `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `c8 ignore`, `istanbul ignore`, `.skip(`, `.todo(`, `only:`; no deleted or weakened assertion outside the sheet's allowed edits; no lockfile line changed except by the sheet's named `npm install --package-lock-only`; every `@jini-ai/*` or `zod` runtime import the desktop gains is declared in `apps/desktop/package.json` (the sheet names it).
What T proof does **not** cover: archive resolution (`app.asar`, `Resources/website`), electron-builder placement and the release workflow. That is P (section 5), owed.

## 4. Allowed test edits (anything else is a STOP)
(a) import specifiers of moved names, pointed at the new owner's **public** subpath; (b) a `t.mock.module(...)`/`module(...)` whose target moved to a Jini public subpath: the specifier becomes that subpath and the stub object becomes `{ ...await import("<subpath>"), <stubbed name>: <same stub> }`; mocked names and assertions unchanged; (c) comment-only lines naming the old path; (d) the edits a sheet lists by line; (e) why-comment debt: the **verifier** adds one entry per block that `check:why-comments` reports lost **and** the sheet lists as moved/reworded, to `development/why-comments-debt.json` (Tovu) or `scripts/why-comments-debt.json` (Jini), reason naming the commit and the file that now carries the rationale (the combine-3-fix pattern); a reported block the sheet does not list is a STOP. A moved test keeps its names and assertions byte for byte except import lines.

## 5. Proof levels
T = section 3 PASS for every commit of the sheet. P = packaged: `npm --prefix apps/desktop run stage`, `electron-builder`, `node --experimental-import-meta-resolve apps/desktop/scripts/verify-staged-closure.ts --asar <archive>`, the release workflow on macOS and Windows. P for T1, T2, T4, T7 is owed until a Jini release contains the matching J sheet and both consumer manifests are bumped to it (a cold release install resolves `@jini-ai/*` from the registry: `.github/workflows/desktop-release.yml:156-159`). No sheet in T1-T7 edits the `stage` script, `stage-website-shared.ts`, `electron-builder.yml` or the verifier.

## 6. Landing rule for Jini-dependent T sheets (T1, T2, T4, T7)
T is proven on a linked Jini. The T commit lands on the integration branch only with (or after) a commit that raises the named `@jini-ai/*` range to the first published release containing the J sheet, in **every** Tovu manifest that declares it (the sheet lists them), followed by `npx npm@11.12.1 install --package-lock-only --ignore-scripts` in each directory whose manifest changed. Jini release inventory per J sheet: `api-baseline/jini-ai__<pkg>.json` (by `pnpm api:update`) and one `.changeset/<slug>.md` (`"@jini-ai/<pkg>": minor`); versions are bumped by the changesets release, never by hand.

## 7. Report (`cloud-results/d0c-v4-<sheet>.md` on the sheet branch, last commit)
Executor: `P`, every pushed SHA, STOP checks run and their output. Verifier: per command the exit status on `P` and `C` and the new error lines (or "none"); each red check (mutation, failing test name, reverted); staging list; review items; fixes made; UNPROVEN items; P owed.
