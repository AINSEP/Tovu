# COMMON: rules every desktop-extraction sheet inherits (read first, then your sheet)

Planning only; nothing here was built, typechecked or run. Written 2026-11-17 (UTC). **Revised 2026-11-17 (round 2)**
after the Codex judge review; re-checked on Tovu `integ/merge-b-2026-11-16` @ `450ac748` (the held desktop patch is
now committed there, so `apps/desktop` on merge-b is the desktop-args form) and `integ/merge-a` @ `e801e9ae`; Jini
merge-b @ `9c982fd9`. A sheet and this file are one contract: where they disagree, STOP and report both lines.

## 1. Base (what the counts were measured on)

No pushed branch held the whole desktop state when this plan was written, so a **local reading tree** was assembled and never pushed:

| Part | Source |
|---|---|
| Tovu, everything except `apps/desktop` | `integ/merge-b-2026-11-16` @ `dd70b057` |
| Tovu `apps/desktop` | `integ/merge-a-2026-11-16` @ `f354cfbd` (holds `fix/desktop-waveb`) **plus** `cloud-results/merge-b-desktop.patch` from merge-b (holds `refactor/desktop-args` and the security dependency bumps), applied with `git apply --3way` |
| Jini | `integ/merge-b-2026-11-16` @ `674a19ea` (merge-a @ `96aade8c` differs in `desktop-host` only by the same `electron/app-version.ts`) |

The patch conflicts with merge-a in **13 files** (11 tests, `src/main/index.ts`, `src/main/updates/desktop-updater.ts`); for those 13 the merge-a side was read. `integ/merge-final-2026-11-16` did not exist.

**Your base (call it BASE)** is the Tovu branch that contains merge-a, merge-b **and** the desktop patch with those 13 conflicts resolved (INDEX prerequisite P0), and the matching Jini merge branch. If BASE does not exist yet: **STOP**, report, do nothing.

## 2. First commands (before reading source)

```
# Jini (checkout must be named exactly `Jini`, beside Tovu)
cd ../Jini && pnpm install --config.prefer-workspace-packages=true && pnpm -r build
# Tovu
cd ../Tovu && npm ci && npm --prefix packages/contracts run build && npm ci --prefix apps/desktop
cd apps/desktop && npm run build && npm run typecheck && npm test      # record as the baseline
```
A red baseline is **reported, not fixed**. Record both repo SHAs. Then run your sheet's **Inventory** block and compare with the sheet's numbers; a difference of more than the stated tolerance, or a file the sheet does not name: **STOP** and report.

## 3. STOP conditions (each has the command that detects it; `B` = your starting SHA)

| # | Mistake a build run already made | Command (run before every push; must print nothing unless stated) |
|---|---|---|
| S1 | Red commit, "fixed forward" | Work in progress goes to `wip/desktop-x/<sheet>` (push every 5-10 min, red allowed, never merged). The lane branch `desktop-x/<sheet>` gets a step only after its gate passes, and every lane commit is proven green alone before the push: `git rebase --exec '<gate>' B`, gate = Jini `pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test`; Tovu `npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop test`. A failure not in the baseline stops the rebase: fix on wip, rebuild the lane commit. |
| S2 | Custom hook imported, not injected | For every `.ts`/`.tsx` file you created, moved or edited (`git diff --name-only B..HEAD -- '*.ts' '*.tsx'`): `rg -n -U "import\s+(type\s+)?\{[^}]*\buse[A-Z]\w*[^}]*\}\s+from\s+['\"](?!react['\"])" -P <file>` (multiline-safe, whole file, not only added lines), then for each imported hook name `rg -n "\b<useName>\(" <file>`: a **call** of the imported name inside a component or hook body is a violation; the only allowed use is as the default value of a prop/option. Jini also: `node scripts/check-hook-injection.mjs` with no new key. Includes `useT`, `useAdminLocale`, kit hooks. |
| S3 | Lazy import of a declared dependency | `git diff B..HEAD \| rg -n "^\+.*(await import\(\|[^.\w]import\(['\"]\|loadOptionalPeer\|createRequire\()"`. A missing module is fixed by **declaring the dependency** in `package.json`, never by deferring the import. `electron-updater` stays a static import. Existing lazy sites are not exempt: `rg -n "await import\(|[^.\w]import\(['\"]" apps/desktop/src apps/desktop/bin -g '!*.test.*'` (8 at planning) is the list sheet **D0e** removes (INDEX); a run that **moves** a file containing one stops unless its sheet names that site. |
| S4 | Re-export shell left at the old path | `git diff B..HEAD \| rg -n "^\+\s*export (\*\|(type )?\{[^}]*\}) from"`. The old file is **deleted** and every importer repointed in the same commit. |
| S5 | `vi.mock` / `mock.module` of another package's file | `git diff B..HEAD \| rg -n "^\+.*(vi\.mock\|mock\.module)\(['\"](@jini-ai/\|@tovu/\|(\.\./)+website/)"`. Tests pass a fake that implements the port type. |
| S6 | Why-comments dropped in a move | by content, not count: `diff <(git show B:<old file> \| rg "^\s*(//\|/?\*)" \| sed 's/^\s*//' \| sort) <(rg -I "^\s*(//\|/?\*)" <new file(s)> \| sed 's/^\s*//' \| sort)`; every printed line needs a reason in the report. |
| S7 | Stale counts | the sheet's Inventory block (section 2). |
| S8 | Test weakened or deleted | report `# tests` / `# pass` before and after (desktop `npm test` prints both; Jini vitest prints `Tests N passed`). A moved test moves with its file; none is dropped. `git diff B..HEAD \| rg -n "^\+.*(\.skip\(\|\.todo\(\|toBeDefined\(\)\|istanbul ignore\|c8 ignore)"` |
| S9 | Limits broken inside a new or grown file | functions <= 50 lines, complexity <= 10, file <= 500. Tovu: `npm --prefix apps/desktop run gates` and `npm run check:size && npm run check:complexity` at the repo root (ratchets in `development/scripts/size-debt.json`, `src-complexity-debt.json`). Jini: **`pnpm check:size && pnpm check:complexity`** (`package.json:27-28`); `pnpm guard` checks boundaries and neutrality only, not size. No new debt entry (`git diff B..HEAD -- '*debt*.json' \| rg "^\+" \| rg -v "^\+\+\+"` prints nothing); a moved file's old debt key is **deleted** in the same commit. A function that is over a limit **before** the move is split in its own commit first (the sheet names them). |
| S10 | Package rule broken | Jini: `rg -n "from ['\"]@jini-ai/(?!core\|protocol)" -P packages/<pkg>/src` shows nothing new. Approved exceptions, applied before planning (lesson 27; owner rules in the round-2 brief): React entries may import `@jini-ai/ui-kit/react` (option C); host presets `server`/`cli`; `sqlite`/`infra` frozen. No `express`/`fastify`/`hono` import in any Jini domain package. The only new package directory allowed is the owner-approved **`packages/node-adapters`** (`@jini-ai/node-adapters`: Node fs/lock/process bindings); no `desktop-*` package. |
| S11 | Pre-push gate bypassed | never `--no-verify`. If the desktop hook cannot run here (no Electron binary), push the Jini branch, save the Tovu desktop commits as `cloud-results/desktop-extraction/<sheet>.patch` on a docs-only branch, and say so first in the report. |
| S12 | Export-map entry that does not build | for every `exports` key you add: `node -e "import('@jini-ai/<pkg>/<entry>').then(m=>console.log(Object.keys(m).length))"` from a host that depends on it, in the commit that adds the key. Add the same key to `jini.entries` with its runtime; `pnpm guard` must pass. |

## 4. Rules in force (acceptance criteria)

- Dependencies arrive through **typed ports** as arguments. Exported functions take `(required, optional = {})`.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. `desktop-host` has **no** `electron` dependency: Electron objects are passed in as structurally typed ports (as `speech/speech-ipc.ts` does).
- No new `desktop-*` package. Node bindings of ports (process observation and signalling, file locks) go to the owner-approved new `@jini-ai/node-adapters`; a domain package declares the port and never imports it. Homes: `desktop-host` subpaths, `sidecar`, `platform/fs`, `ui`, `chat`, `diagnostics`, `devops/packaging/electron`.
- New entry files are real modules (the `sidecar` pattern: `"./supervisor" -> supervision/supervisor.js`), not barrels.
- **Windows is a target.** Any process, path or signal code needs a Windows branch and a test that runs with `platform: 'win32'` injected. No `ps`, no POSIX-only signal as the only path.
- Errors: plain words for the user plus a details field; typed errors at module boundaries; no `catch {}`.
- Security text in commits, sheets and reports: **class and location only** (the repositories are public).
- Port bindings are checked for **behaviour**: argument order, object versus positional, which object a field sits in. Each sheet names the binding lines and the test that fails when an argument is dropped.

## 5. Cross-repo pairs and git

- A step that changes something Tovu calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against (link with Tovu's `development/scripts/link-jini.mjs`).
- **Landing unit (round-1 judge finding 7).** A commit contains everything it needs to install and build: manifests, export-map and `jini.entries` keys, **and the lockfile produced by `pnpm install` / `npm install`** (never hand-edited, never left for a coordinator). After `git pull --rebase` re-run the install instead of merging a lockfile by hand.
- **Linked proof is T only.** `npm run release:inputs` (`apps/desktop/package.json:22`) refuses a linked Jini, and unlinking restores the *registry* packages, which do not contain a new export. So level P needs the Jini half **published**: the Jini lane is merged, a snapshot/prerelease version is published by the release owner (INDEX OD-10), and the Tovu commit pins that version in `apps/desktop/package.json` (and the root, if it declares it) with its lockfile. Until then the report says "T passed on linked Jini `<sha>`; P owed, waiting for published `<version>`" and the sheet is not done.
- Branches: `wip/desktop-x/<sheet>` and `desktop-x/<sheet>` in each repo (S1). Commit by explicit paths. `git pull --rebase` before every push; never force-push.
- `development/scripts/size-debt.json`: you may only **delete** keys for files you removed or brought under the limit.
- Shared with other programmes (check `git log -5 -- <file>` at start; if it moved since BASE, re-run Inventory): `apps/desktop/src/desktop-agent.ts` (daemon R7 and R8), `apps/desktop/src/main/index.ts` (every D sheet adds or removes wiring lines here; one sheet at a time), `apps/desktop/electron-builder.yml`, `packages/sidecar/src/supervision/supervisor-node.ts` and `json-file.ts` (xpkg R11b).

## 6. Proof levels (named per sheet in INDEX section 5)

| Level | What it means | Who can run it |
|---|---|---|
| T | typecheck + unit tests + `npm run gates` | any run |
| P | packaged proof, in this order, on an **unlinked** tree pinned to the published Jini version: (1) `npm --prefix apps/desktop run stage`; (2) package (`electron-builder`, as the `package` script does after `gates`, `build`, `stage`); (3) audit the **built archive**: `node scripts/verify-staged-closure.ts --asar <archive>` from `apps/desktop` — the script throws without `--asar` (`:32-34`) and reads the archive's sibling resource directories. `<archive>` = `app.asar` in the packaged app's resources directory: macOS `<out>/mac*/<App>.app/Contents/Resources/app.asar`, Windows `<out>/win-unpacked/resources/app.asar`, `<out>` = `directories.output` in `electron-builder.yml` (print the path you used); (4) the `build` job of `.github/workflows/desktop-release.yml` on macOS **and** Windows (`verify-package`, `smoke-native`, `smoke-bridge`). Every run that moves a module the packaged main process or child loads at runtime owes steps 1-3, not only D0c2. | needs a machine with Electron; CI or owner |
| E | a look at the running Electron app (screenshots at 2x, light and dark) for the screens the sheet lists | owner machine or a run with a display |

A sheet marked P or E is **not done** at T. Its report says "T passed; P/E pending" and lists the exact screens or smokes still owed.

## 7. Report (last commit of every run)

`cloud-results/desktop-extraction/<sheet>.md`: DONE / PARTIAL / STOPPED; both SHAs and branches; each step done or skipped with the reason; Inventory differences; test counts before/after; comment-line counts before/after; each S1 to S12 command with its output; lines moved (old file, new file, count); debt keys deleted; shared files edited (manifests, lockfiles); what the sheet got wrong; proof level reached.
