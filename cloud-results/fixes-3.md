# fixes-3 / item 1: `fix/link-jini-desktop` (link-jini coverage of apps/desktop and any later app)

Base: `origin/refactor/terra` = `232764af` (Tovu), Jini `65d73b0d`. Node 24.22.3 (nodejs.org tarball), pnpm 10.33.2 (corepack).

## Finding that changes the premise

On this base `development/scripts/jini-links.mjs` already lists `apps/desktop` in its hard-coded consumer list, and `link-jini.mjs` already
links it (`apps/desktop: link agent-runtime ... (was installed-copy)`, 18 packages). The `desktop-p0` report's "does not link apps/desktop" does not
reproduce here. The real remaining defect is the **hard-coded list**: any app added later is silently left on registry `@jini-ai` copies, which is
exactly the failure that report describes. So this change replaces the list with discovery (the repo root plus every `apps/<name>` that has a
`package.json` with a direct `@jini-ai/*` dependency) and adds the first test of the script itself (the only prior test only asked `jiniConsumers()` for desktop and is not in `npm test`).

## Done

- `development/scripts/__tests__/link-jini.test.mjs` (new, wired into `test` and `test:ci` in root `package.json`): copies the real `link-jini.mjs`/`jini-links.mjs` into a throwaway repo layout and runs them as a subprocess against a fake Jini packages dir. Asserts root, admin, site-chat, **desktop (registry copy replaced)** and a later-added app are linked, an app with no `@jini-ai` dep is untouched, `--dry-run` writes nothing, a second run changes 0 links.
- `development/scripts/jini-links.mjs`: `consumerDirs({ root })` discovers apps; `jiniConsumers({ root }, _optional = {})` takes the root as a required arg. Callers `link-jini.mjs`, `unlink-jini.mjs`, `dev-sites-home.test.mjs` repointed. Header comments updated. No shell, no forwarder.
- Red first: before the fix the new test failed with `ENOENT ... apps/later-app/node_modules/@jini-ai/platform` (later-app not linked). After the fix: green. Mutation: excluding `desktop` in `consumerDirs` turns the test red (`AssertionError: apps/desktop -> core`), restored -> green.

## Gates (exact command, cwd, result)

| command | result |
|---|---|
| `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (base, repo root) | 73 links changed, desktop included |
| `cd apps/desktop && npm run gates` on the **unmodified base** after link-jini | 6/6 PASS (tree-quiet, tests, typecheck, coverage, complexity, js-backslide), `check-gates: OK` |
| `node --test development/scripts/__tests__/link-jini.test.mjs development/scripts/__tests__/dev-sites-home.test.mjs` | 8 pass, 0 fail |
| `JINI_PACKAGES_DIR=... node development/scripts/link-jini.mjs` on the branch | `0 link(s) changed` (idempotent), same consumers: ., admin, desktop, site-chat |
| `cd apps/desktop && npm run gates` on the **branch** after link-jini | 6/6 PASS, `check-gates: OK` |
| `npx eslint` on the 5 changed scripts/tests | clean |
| `npm run check:hooks` | ok |
| `npm run check:size` base vs branch | 17 "Worsened" lines on both (pre-existing base-red, e.g. composition/deps.ts); no new line, none in changed files |

Not run: full `npm test` (only changed files tested, per the owner rule).

## Left / next

Nothing for this item. Note for the owner: `unlink-jini.mjs` runs `npm install` per consumer and was only dry-run here (`73 link(s) would be removed`).
The `desktop-p0` report's claim should be corrected: the gap there was likely a stale checkout of the script, not this base.
