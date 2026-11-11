# TOVU-LOCK — move Tovu onto published Jini 0.7.0

Branch `cloud/integ-1110`. Base `35c67e07` (RELEASE-PREP report on `eb737af8`).
Dependency commit: **`25ec2e96`** `chore(release): move Tovu onto published Jini 0.7.0`. It changes only package.json and lockfiles, 10 files. Pushed. The pre-push hook ran; `--no-verify` was not used.
Node v24.22.2, npm 11.19.1. Jini was not touched. Raw output: `cloud/reports/raw/tovu-lock/`.

**Result: the release gate is green against the published packages.** Typecheck, builds and the import smoke pass. The only test failures are 4 titles that already fail without this change. They are listed under PRIOR in `cloud/reports/integ-1110.md` §5 (details in §3).

## 1. Method (copied from `8d3fe13e`)

`8d3fe13e` (0.1.30) raised the `@jini-ai/*` ranges and the root `overrides` in package.json. It then refreshed the root, admin, desktop and site-chat lockfiles against the registry, without linking Jini. This job does the same.

There is one difference. A plain `npm install --package-lock-only` stopped with `ERESOLVE` in all four projects. The old lockfiles still held 0.6.x packages whose peer ranges are `^0.6.x`, and on 0.x a caret range does not include 0.7.0. For example, `@jini-ai/search@0.6.19` has a peerOptional on `agent-plugins@^0.6.10`, which conflicts with `agent-plugins@0.7.0` → `commerce@^0.7.0`. The fix:

1. Remove only the `node_modules/**/@jini-ai/*` entries from each lockfile (root 35, admin 17, desktop 18, site-chat 9).
2. Run `npm install --package-lock-only --ignore-scripts` again. Every other pin stays as it was.

All four runs then exited 0. `lock-*.txt` holds the final runs; the first ERESOLVE output was overwritten. `--force` and `--legacy-peer-deps` were not used.

## 2. Ranges changed

All 36 distinct `@jini-ai/*` names were checked with `npm view <pkg>@0.7.0 version`, and all are on npm (`npm-view-0.7.0.txt`). No retry was needed.

| File | Change |
|---|---|
| `package.json` | 34 deps `^0.6.19/22/23` → `^0.7.0`; `overrides`: key `@jini-ai/chat@^0.6.23` → `@jini-ai/chat@^0.7.0` (nested `ui`), `http-kit` → `daemon`/`agent-runtime`, `core`, `platform` → `^0.7.0`; `@jini-ai/db: "$@jini-ai/db"` unchanged (self-reference) |
| `apps/admin/package.json` | 14 deps + overrides `ui`, `core` → `^0.7.0` |
| `apps/desktop/package.json` | 15 deps + overrides `core` → `^0.7.0` (version already 0.1.31) |
| `apps/site-chat/package.json` | 4 deps + overrides `ui`, `core` → `^0.7.0` |
| `packages/contracts/package.json` | `analytics`, `diagnostics` `^0.6.17` → `^0.7.0` |
| `packages/sdk/package.json` | `plugins` `^0.6.17` → `^0.7.0` |

`apps/website` has no package.json of its own; it is part of the root package. No `@jini-ai/*` range below 0.7 is left in any package.json or lockfile.

## 3. Lockfile verification (`lockfile-verify.txt`)

The repo has four lockfiles and all were refreshed. For each lockfile, every `node_modules/**/@jini-ai/*` entry was checked for: version `0.7.0`, `resolved` `https://registry.npmjs.org/@jini-ai/...`, an `integrity` field, and no `link`.

| Lockfile | Root version | `@jini-ai` @0.7.0 from registry | Exceptions |
|---|---|---|---|
| `package-lock.json` | 0.1.0 | 35 | **none** |
| `apps/admin/package-lock.json` | 0.1.0 | 17 | **none** |
| `apps/desktop/package-lock.json` | **0.1.31** (was 0.1.30) | 18 | **none** |
| `apps/site-chat/package-lock.json` | 0.1.0 | 9 | **none** |

None has a `file:`, `link:` or workspace path for `@jini-ai/*`. The only `link: true` entries are Tovu's own `@tovu/contracts` and `@tovu/sdk`, the same as before.

Changes outside `@jini-ai`, all new transitive dependencies of the 0.7.0 packages, with no existing pin changed:
- **Root (34 added):** `@simplewebauthn/{browser,server}`, `otplib` + `@otplib/*`, `@peculiar/*` / `asn1js` / `pvtsutils` / `pvutils`, `tsyringe`, `reflect-metadata`, `@noble/hashes`, `@scure/base`, `@hexagon/base64`, `@levischuck/tiny-cbor`.
- **Admin:** the same set, plus `parse5@7.3.0` and `entities@6.0.1`.
- **Desktop and site-chat:** no changes outside `@jini-ai`.

## 4. Gates (published packages, no link:jini)

| Step | Exit | Notes / raw |
|---|---|---|
| root `npm ci` | 0 | 811 packages; `@jini-ai/core` reads 0.7.0 from node_modules, not a symlink (`ci-root.txt`) |
| root native rebuild | 0 | npm 11 skipped install scripts (esbuild ×3, argon2, better-sqlite3), so I ran `npm rebuild`. `better-sqlite3` opens `:memory:`, `argon2` loads, esbuild 0.28.1 runs (`rebuild-root.txt`) |
| apps `npm ci` admin / desktop / site-chat | 0 / 0 / 0 | `ci-*.txt` |
| apps `npm rebuild --foreground-scripts` | 0 / 0 / 0 | `rebuild-*.txt` |
| `@tovu/sdk` build | 0 | `build-sdk.txt` |
| root `npm run typecheck` (root + e2e) | **0** | 0 `error TS` (`typecheck-root.txt`) |
| desktop `npm run build:preload` | **0** | electron 43 types present; the electron binary was not downloaded because its install script did not run, and the preload build does not need it (`desktop-build-preload.txt`) |
| admin `npm run build` | **0** | `check-no-linked-jini` passed, then the vite build; the only output is a chunk-size warning (`admin-build.txt`) |
| admin `npm run typecheck` | **0** | `admin-typecheck.txt` |
| runtime import smoke | 1 → **no published-package defect** | 252 specifiers; 250 resolve, 2 do not, and both are test-fixture strings (below) |
| website agent-plugins unit tests (`--test-concurrency=1`) | 1 → **PRIOR only** | 1169 tests: 1161 pass, 4 fail, 4 skipped (below) |
| desktop `src/jini-mcp-peers.test.ts` (10-31 packaged-peers regression, `--test-concurrency=1`) | **0** | 8/8 pass (`test-desktop-jini-mcp-peers.txt`) |

### Import smoke

The brief's `git grep -ho "@jini-ai/[a-z-]*[^'\"]*" apps/website/src` matches comment text too (823 lines, kept as `runtime-imports-list.txt`). The smoke therefore used the specifiers that appear in `from` / `import()` / `require()` statements: 252, in `runtime-specifiers.txt`. Each was loaded with a dynamic `import()` from the repo root (`smoke-imports.txt`).

- `@jini-ai/integrations` (bare): `ERR_PACKAGE_PATH_NOT_EXPORTED`. The package has no `"."` export, and `0.6.19` had none either (`npm view … exports`). The only place it appears is a type-only fixture string inside `a10-card-seam.unit.test.ts`.
- `@jini-ai/plugin-sdk`: `ERR_MODULE_NOT_FOUND`. This is not an npm package. It is the virtual SDK alias that `plugin-sdk-resolver.unit.test.ts` and the tier-2 worker test create in a temp `node_modules`.

Neither is a difference between the tarballs and the linked build.

### The 4 unit-test failures: PRIOR, not caused by the tarballs

All 4 are in `connect-tool.api-connections.unit.test.ts` and fail with `TypeError: Invalid URL`, input `/api/admin/v1/workspaces/ws-1/agent-plugins/connections/sign-in/<id>`:
- a declared API connection connects through the real host…
- API sign-in displays only the declaring plugin oauth card copy
- a failed connected-card update never turns a real connection into a tool failure
- with no poll interval or wait bound configured, the built-in defaults…

**Cause.** The published `@jini-ai/integrations@0.7.0` `connectHosted` hands hosted cards a same-origin path (`new URL(start.authorizationUrl).pathname`). Tovu's test helper `apps/website/src/features/api-connections/__tests__/support/starting-browser.ts:34` (`providerUrl`) still calls `new URL(link)`, which fails on a relative path.

**Not a tarball difference.** The Jini source for 0.7.0 carries the same change on purpose: Jini `9d8c30642`, "Hosted sign-in cards get a same-origin path", which is on Jini `cloud/integ-1110` at version 0.7.0. The same 4 titles are already listed as PRIOR reds in `cloud/reports/integ-1110.md` §5 (fail on both parents with the linked build, `reds-api4-on-*.txt`).

**Not fixed here.** This job is limited to package.json and lockfile changes, so the test helper was left as it is. The fix is a one-line Tovu test-helper change: resolve `link` against a base, e.g. `new URL(link, "http://x")`. It belongs in a follow-up.

## 5. Step 5 (tarballs differ from linked build)

No missing export, missing dependency or peer problem was found in the published 0.7.0 tarballs. The ERESOLVE in §1 came from the stale 0.6.x lockfile, not from the 0.7.0 peer graph: once the 0.6.x entries were removed, the 0.7.0 set resolved cleanly in all four projects.

## 6. State

- No processes left running.
- Working tree clean apart from this report and its raw files.
- main, tags and Jini untouched.

TOVU-LOCK DONE
