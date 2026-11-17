# COMMON: rules every desktop-extraction sheet inherits (read first, then your sheet)

Planning only; nothing here was built, typechecked or run. Written 2026-11-17 (UTC).

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
| S1 | Red commit, "fixed forward" | per commit: Jini `pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test`; Tovu `cd apps/desktop && npm run typecheck && npm test`. Any failure not in the baseline: fix **before** committing, or stop. |
| S2 | Custom hook imported, not injected | `git diff B..HEAD -- '*.tsx' \| rg -n "^\+import .*\buse[A-Z]\w*.* from ['\"](?!react['\"])" -P` → every hit must be a **type** import or the default value of a prop; the component body calls the prop. Includes `useT`, `useAdminLocale`, kit hooks. |
| S3 | Lazy import of a declared dependency | `git diff B..HEAD \| rg -n "^\+.*(await import\(\|[^.\w]import\(['\"]\|loadOptionalPeer\|createRequire\()"`. A missing module is fixed by **declaring the dependency** in `package.json`, never by deferring the import. `electron-updater` stays a static import. |
| S4 | Re-export shell left at the old path | `git diff B..HEAD \| rg -n "^\+\s*export (\*\|(type )?\{[^}]*\}) from"`. The old file is **deleted** and every importer repointed in the same commit. |
| S5 | `vi.mock` / `mock.module` of another package's file | `git diff B..HEAD \| rg -n "^\+.*(vi\.mock\|mock\.module)\(['\"](@jini-ai/\|@tovu/\|(\.\./)+website/)"`. Tests pass a fake that implements the port type. |
| S6 | Why-comments dropped in a move | before: `rg -c "^\s*(//\|/?\*)" <old file>`; after: same on the new file(s). Report both numbers; a drop needs a line-by-line reason. |
| S7 | Stale counts | the sheet's Inventory block (section 2). |
| S8 | Test weakened or deleted | report `# tests` / `# pass` before and after (desktop `npm test` prints both; Jini vitest prints `Tests N passed`). A moved test moves with its file; none is dropped. `git diff B..HEAD \| rg -n "^\+.*(\.skip\(\|\.todo\(\|toBeDefined\(\)\|istanbul ignore\|c8 ignore)"` |
| S9 | Limits broken inside a new or grown file | functions <= 50 lines, complexity <= 10, file <= 500: Tovu `cd apps/desktop && npm run gates` (complexity gate) and repo `development/scripts/size-debt.json` ratchet; Jini `pnpm guard`. No new debt entry; a moved file's old debt key is **deleted** in the same commit. |
| S10 | Package rule broken | Jini: `rg -n "from ['\"]@jini-ai/(?!core\|protocol)" -P packages/<pkg>/src` shows nothing new (React entries may also import `@jini-ai/ui-kit/react`). No `express`/`fastify`/`hono` import in any Jini domain package. No new package directory under `packages/`. |
| S11 | Pre-push gate bypassed | never `--no-verify`. If the desktop hook cannot run here (no Electron binary), push the Jini branch, save the Tovu desktop commits as `cloud-results/desktop-extraction/<sheet>.patch` on a docs-only branch, and say so first in the report. |
| S12 | Export-map entry that does not build | for every `exports` key you add: `node -e "import('@jini-ai/<pkg>/<entry>').then(m=>console.log(Object.keys(m).length))"` from a host that depends on it, in the commit that adds the key. Add the same key to `jini.entries` with its runtime; `pnpm guard` must pass. |

## 4. Rules in force (acceptance criteria)

- Dependencies arrive through **typed ports** as arguments. Exported functions take `(required, optional = {})`.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. `desktop-host` has **no** `electron` dependency: Electron objects are passed in as structurally typed ports (as `speech/speech-ipc.ts` does).
- No new `desktop-*` package. Homes: `desktop-host` subpaths, `sidecar`, `platform/fs`, `ui`, `chat`, `diagnostics`, `devops/packaging/electron`.
- New entry files are real modules (the `sidecar` pattern: `"./supervisor" -> supervision/supervisor.js`), not barrels.
- **Windows is a target.** Any process, path or signal code needs a Windows branch and a test that runs with `platform: 'win32'` injected. No `ps`, no POSIX-only signal as the only path.
- Errors: plain words for the user plus a details field; typed errors at module boundaries; no `catch {}`.
- Security text in commits, sheets and reports: **class and location only** (the repositories are public).
- Port bindings are checked for **behaviour**: argument order, object versus positional, which object a field sits in. Each sheet names the binding lines and the test that fails when an argument is dropped.

## 5. Cross-repo pairs and git

- A step that changes something Tovu calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against (link with Tovu's `development/scripts/link-jini.mjs`; unlink before any packaging step: `npm run release:inputs` in `apps/desktop` must pass).
- Branches: Jini `desktop-x/<sheet>`, Tovu `desktop-x/<sheet>`. Commit by explicit paths. `git pull --rebase` before every push; never force-push; push after every step (commit, then verify, then commit fixes: but S1 still holds for what you push as "done").
- Coordinator-only files (report the exact lines; do not edit): Jini `pnpm-lock.yaml`, `packages/core/package.json`, `scripts/injection-*.json`; Tovu `apps/desktop/package-lock.json` (run `npm install` and report if it changes), `development/scripts/size-debt.json` (you may **delete** keys for files you removed; nothing else).
- Shared with other programmes (check `git log -5 -- <file>` at start; if it moved since BASE, re-run Inventory): `apps/desktop/src/desktop-agent.ts` (daemon R7 and R8), `apps/desktop/src/main/index.ts` (every D sheet adds or removes wiring lines here; one sheet at a time), `apps/desktop/electron-builder.yml`, `packages/sidecar/src/supervision/supervisor-node.ts` and `json-file.ts` (xpkg R11b).

## 6. Proof levels (named per sheet in INDEX section 5)

| Level | What it means | Who can run it |
|---|---|---|
| T | typecheck + unit tests + `npm run gates` | any run |
| P | packaged proof: `npm run stage` then `node scripts/verify-staged-closure.ts`, then the `build` job of `.github/workflows/desktop-release.yml` on macOS **and** Windows (`verify-package`, `smoke-native`, `smoke-bridge`) | needs a machine with Electron; CI or owner |
| E | a look at the running Electron app (screenshots at 2x, light and dark) for the screens the sheet lists | owner machine or a run with a display |

A sheet marked P or E is **not done** at T. Its report says "T passed; P/E pending" and lists the exact screens or smokes still owed.

## 7. Report (last commit of every run)

`cloud-results/desktop-extraction/<sheet>.md`: DONE / PARTIAL / STOPPED; both SHAs and branches; each step done or skipped with the reason; Inventory differences; test counts before/after; comment-line counts before/after; each S1 to S12 command with its output; lines moved (old file, new file, count); debt keys deleted; coordinator lines; what the sheet got wrong; proof level reached.
