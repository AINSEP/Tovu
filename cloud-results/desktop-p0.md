# desktop-p0 (2026-11-17): the six desktop gates on merge-final

Branch `integ/desktop-p0-2026-11-17` (Tovu), cut from `origin/refactor/terra` = `232764af` (merge-final `f70017dc` + its report).
Jini checkout: `integ/desktop-p0-2026-11-17` cut from `origin/integ/merge-final-2026-11-16` = `65d73b0d`, no Jini change.

## Result

**No source change was needed.** All six desktop gates (tree-quiet, tests, typecheck, coverage, complexity, js-backslide) are green on the
unmodified merge-final tree **when `apps/desktop/node_modules/@jini-ai/*` resolve to the local Jini checkout** (the setup the owner's
pre-push hook and the earlier merge-final run used). Both INDEX traps are already clear. The red results below come from the container
install, not from the code.

## Setup (exact)

Node 24.11.1 (nodejs.org tarball, `~/.local/node24`), pnpm 10.33.2 via corepack. Jini: `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build` (exit 0).
Tovu: `npm ci` (root), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`, `npm run build` in `packages/contracts` and `packages/sdk`,
`cd apps/desktop && npm ci`. Note: `npm ci` run inside a `packages/*` directory is a workspace install and wipes the root `node_modules`; run it only at the root.
`link-jini.mjs` links root, `apps/admin` and `apps/site-chat` but **not `apps/desktop`**, so I symlinked `apps/desktop/node_modules/@jini-ai/<name>` to
`/home/user/Jini/packages/<name>` by hand (no repo footprint). The pre-push hook was not installed in this clone (`core.hooksPath` unset); I ran
`node development/scripts/prepare-desktop-hooks.mjs` (sets it to `apps/desktop/scripts/hooks`).

## Gates run

| # | command (cwd `apps/desktop`) | node_modules state | result |
|---|---|---|---|
| 1 | `npm run gates` -> `cloud-results/desktop-p0-before.txt` | registry `@jini-ai` 0.7.0 copies (the literal "unmodified" step) | 3 PASS (tree-quiet, complexity, js-backslide), 3 FAIL (tests, typecheck, coverage). Cause: published 0.7.0 lacks code merge-final needs (`ERR_PACKAGE_PATH_NOT_EXPORTED: ./contracts/runtime` in `@jini-ai/core`), the website also failed to resolve `@jini-ai/diagnostics` before root was reinstalled. |
| 2 | `npm run gates` -> `cloud-results/desktop-p0-before-jini-snapshot.txt` | `pnpm pack` tarballs of the 18 Jini packages unpacked over the registry copies (0.7.1) | 4 FAIL as below |
| 3 | `npm run gates` -> `cloud-results/desktop-p0-after.txt` (5m11s) | symlinks to the Jini checkout | **6/6 PASS**: tree-quiet, tests, typecheck, coverage, complexity, js-backslide. `check-gates: OK` |

Run 2 detail (a published-snapshot install, i.e. what CI / packaging will see once Jini 0.7.1 is published, OD-10), measured separately:
- typecheck: 207 errors, one cause: `apps/desktop/package-lock.json` resolves `kysely` 0.29.8 while the root lock has 0.29.6, so TypeScript sees two `Kysely` declarations
  (`Property '#private' ... refers to a different member`) in `apps/website/src/**` and `jini-kits.render.test.ts`. Verified: putting 0.29.6 in `apps/desktop/node_modules/kysely` gives 0 errors.
  Not fixed here (the six gates are green in the supported setup; it would change `apps/desktop/package-lock.json`). Suggested fix: pin `kysely` to 0.29.6 in desktop (`overrides`) and regenerate the lock.
- tests: 1 of 2301 fails: `jini-mcp-peers.test.ts` "the packaged desktop can load its shared agent daemon supervisor without the site payload" (`'0.7.0' !== '0.7.1'`): the lock pins sidecar 0.7.0 and the installed copy is 0.7.1. Goes away when the desktop lock moves to the published 0.7.1.
- coverage fails only because the test suite did.

## Traps (INDEX, P0)

1. `rg -n "import\(.electron-updater" apps/desktop/src` -> empty. `main/index.ts:110` is `import electronUpdater from "electron-updater";` (static).
2. `rg -n "isTrustedSender: \(raw\)" apps/desktop/src/main/index.ts` -> empty. Lines 839 and 848 use `({ senderUrl }) => isShellPage({ raw: senderUrl })`.

## Commits and push

- `b1caceb3` docs(cloud): the two baseline outputs.
- the commit holding this report and `desktop-p0-after.txt`.
The push touches no `apps/desktop` path, so `apps/desktop/scripts/hooks/pre-push` ("no apps/desktop changes in this push, skipping desktop gates") does not run the gates for it; the proof is run 3 above on identical `apps/desktop` content. No `--no-verify`.

## Left / next

Nothing red in the supported setup. P0 BASE exists: `refactor/terra` content (+ this report). Before packaged proof (P level): publish a Jini snapshot, move the desktop lock to it and fix the `kysely` pin above.
