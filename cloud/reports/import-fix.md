# Import fixes

Started 2026-11-07 19:57:25 UTC (11:57:25 PST). Deadline 21:57:25 UTC.
Branches: `cloud/import-fix` in both repositories. Bases: Tovu `b45d2ee759009b08d04268ef9ddcf2b6d0f60671`; Jini `32e9c9c2128805b20d1a562d6f0053d1c4604b52`.

## Item 1 — done

Imported menus and forms follow the same keep-off rule as pages. Menus use existing `items` mode: draft menus still resolve, so draft status would not suffice. The stored HTML remains recoverable by choosing HTML mode. Item IDs distinguish notices for equal titles, so existing notice deduplication cannot merge different items. Forms use existing `disabled` status, preserving their authoring envelope unchanged. Innocent menus/forms and marker-only pages remain live. Existing trusted theme behavior remains covered by the restore tests. Notices use the existing 80-character title limit and 20-item cap per kind plus a summary.

Changed test command (Tovu root):

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
```

Node tests use `--test-concurrency=2`; Node does not accept Vitest worker flags. Vitest commands will use `--maxWorkers=2 --minWorkers=1`.

- Red: 42 passed, 1 failed (`AssertionError [ERR_ASSERTION]`, menu remained in HTML mode).
- Mutation: menu-only implementation: form remained active, caught by `AssertionError [ERR_ASSERTION]`; 41 passed, 2 failed (the second exposed changed missing-table error order; corrected before final validation).
- Mutation: bypass menu keep-off: 42 passed, 2 failed (menu state and notice-cap checks).
- Green: 44 passed, 0 failed. Final review restored identical-title coverage: 0/2 red, then a menu-only ID mutation remained 0/2, then 44/44 green after both notices included item IDs. This verifies the one-notice-per-item rule through the existing deduplicating list.
- No-emit check: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item1.json --noEmit`, exit 0. Config extends Tovu's tsconfig and includes the changed production file and its dependency graph, with the repository's typeRoots.
- Production lines added: 26; test lines added: 58.
- Cost once per import: two table reads of eligible menu/form JSON; O(total selected JSON + HTML bytes) memory/parsing and one update per kept-off row (menu document bytes or form status). Notices add O(item count × bounded title/message size) transient memory; stored notices cap at 42 strings for these two kinds. No per-page runtime cost.

## Item 2 — done

The existing live-import open callback receives the created record, opens its tab at the admin Import page and calls the existing imported-site starter. Its existing running-site guard prevents a duplicate start. No new callback option or startup layer was added.

From `apps/desktop`:

```sh
node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=2 src/renderer/App.render.test.ts src/renderer/use-import-website.hooks.render.test.ts
./node_modules/.bin/tsc -p tsconfig.renderer.json --noEmit
```

- Base: App file 24 passed; renderer no-emit exit 0.
- Red: App file 25 passed, 1 failed (`AssertionError [ERR_ASSERTION]`: start call missing).
- Mutation: passing a running site as stopped to the starter: both files 39 passed, 1 failed (duplicate start caught).
- Green: both files 40 passed, 0 failed; renderer no-emit exit 0. Tests observe the Starting tab, then the exact admin Import URL carrying the encoded live address, and no second start for a running site.
- Production lines added: 4; test lines added: 35.
- Cost: once per newly created live import, one existing start request and two existing state updates (one site record each). No new scan, buffer, or recurring I/O. Already-running sites: none.

## Item 3 — done

The native transport honors an explicit response limit. The existing 100 MiB default remains when no limit is supplied. No new option was added. The guarded client still applies the request and egress policy limits before calling the transport.

Jini commands from `packages/platform`:

```sh
../../node_modules/.bin/vitest run src/http/guarded/__tests__/transport-request-port.test.ts --maxWorkers=2 --minWorkers=1
npm run typecheck
npm run build
```

- Base: 1 passed; platform package no-emit exit 0.
- Red: 2 passed, 1 failed (`AssertionError`: 101 MiB response was truncated to 100 MiB despite an explicit 300 MiB limit).
- Mutation: raising the default to 300 MiB: 2 passed, 1 failed (unspecified limit incorrectly completed). An initial rejects-assertion attempted to format the large resolved response; its test processes were terminated, then the assertion was changed to compare a small completion/error outcome. The assertion strength is unchanged.
- Green after rebuild: 3 passed, 0 failed; package no-emit and build exit 0.

Tovu regression command from root:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-download-limit.unit.test.ts apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
```

- Restoring the old clamp and rebuilding Jini: download regression 0 passed, 1 failed, `SiteShareRefusal` code `DOWNLOAD_FAILED`, message “Share download failed or exceeded the 300 MiB archive cap.”
- Restore fix, rebuild platform, run `JINI_PACKAGES_DIR=/workspace/Jini/packages node development/scripts/link-jini.mjs`, rerun: 45 passed, 0 failed.
- Tovu test no-emit exit 0: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item3-tovu.json --noEmit`; config extends repository settings, includes the new test/dependency graph, and sets repository typeRoots.
- Caller review: only configured request above 100 MiB found is `downloadShareArchive`, 300 MiB via `SHARE_LIMITS.maxArchiveBytes`, with matching `SITE_IMPORT_EGRESS_POLICY`. Media providers and publish-content use 96 MiB; media import uses 60 MiB; web-page uses 5 MiB. Generic media fetch and diagnostic adapters forward caller-supplied limits; no other configured caller above 100 MiB found in either repository.
- Production lines added: 4 (Jini); test lines added: 72 (36 Jini, 36 Tovu).
- Cost per download: O(1) limit selection; existing buffering/copies now permit up to 300 MiB instead of 100 MiB. Network reads: one × up to 300 MiB; memory O(response bytes), approximately 4–5 × payload bytes at the Tovu download boundary (chunks, concatenated bytes, decoded text and returned archive copy), with unchanged copy passes. No added disk I/O.

## Item 4 — done

Timeout messages retain the timeout duration and only the server origin (including a non-default port). Relative/unparseable input uses “the requested server” without retaining input. The full `url` property was removed: no production consumer reads `FetchTimeoutError.url` in either repository, while raw Error objects are passed to logs (for example public page/search/member handlers). CLI `mapErrorToCliOutcome` and desktop `copyableDetails` use `error.message`. Tests cover message, inspection, JSON, both user-visible surfaces, and media-provider deadline behavior. Existing saved import data is unaffected.

Jini commands from `packages/platform`:

```sh
../../node_modules/.bin/vitest run src/__tests__/fetch-with-timeout.test.ts src/__tests__/fetch-text-guards.test.ts src/http/guarded/__tests__/timeouts.test.ts src/http/guarded/__tests__/client-boundaries.test.ts src/http/guarded/__tests__/transport-request-port.test.ts --maxWorkers=2 --minWorkers=1
npm run build
npm run typecheck
```

- Base: four timeout test files 82 passed; integrations file 7 passed and package no-emit exit 0.
- Red: four changed timeout files 79 passed, 8 failed (`AssertionError`, full addresses retained). CLI test 1 passed/1 failed, desktop hook file 14 passed/1 failed (`AssertionError [ERR_ASSERTION]`).
- Mutation: change only the message while retaining the full address property: 81 passed, 6 failed (the retained property is observed).
- Green: five changed platform test files 90 passed; platform build/no-emit exit 0.

From `packages/integrations`:

```sh
../../node_modules/.bin/vitest run src/media-providers/dispatch/__tests__/node.integration.test.ts --maxWorkers=2 --minWorkers=1
npm run typecheck
npm run build
```

All 7 passed; no-emit and rebuild exit 0. This package has only expectation updates, with the complete timeout sentence replacing the former full-address property assertion.

After rebuilding and relinking Jini, the two changed website test files passed 46/46; the two changed desktop files passed 41/41 using the commands recorded above. Renderer no-emit passed. The new CLI-output test's no-emit dependency graph reports one existing `TS2353` in `features/site-export/site-exporter.ts:589` (`assetUrls` absent from `ExportSiteArgs`), also present in the base diagnostic capture; no diagnostic is in changed code. This dependency error is retained as a limitation, not suppressed.

- Production lines added: 2 (Jini); test lines added: 46 (27 Jini, 19 Tovu).
- Cost per timed-out request: one URL parse, O(address length) transient memory; retain only O(origin length + duration) error text. No added I/O. Removing the full-address field reduces retained error memory. Successful requests: none.

## Item 5 — done

The existing link-normalization function now returns `URL.origin`. Ready and failed saves therefore retain scheme, host and port only. Verifying/pending rows keep their original link, and upload IDs are unchanged. No schema migration or new record field was added. Legacy records still load with their existing shape; an ordinary terminal save normalizes them. Existing historical files are not scanned or rewritten merely by loading them.

Command from Tovu root:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts apps/website/src/features/site-backup/__tests__/import-backend.unit.test.ts
```

- Base: 97 passed, 0 failed.
- Red: 94 passed, 6 failed (`AssertionError [ERR_ASSERTION]`: retained paths in ready/failed history, legacy resaves and replay views).
- Mutation: sanitize only ready rows, with `--test-name-pattern='row keeps only|legacy.*history|replayed.*share import'` before those two paths: 3 passed, 3 failed (failed-state handling caught).
- Green: 100 passed, 0 failed, 68.51 s.
- Source no-emit: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item5.json --noEmit`, exit 0; config extends Tovu settings and includes `import-registry.ts` plus dependencies, with repository typeRoots.
- Readers checked: admin history source label and tooltip display the saved value; backend `siteImportView` forwards it; request-ID replay normalizes both existing and incoming sources and returns the recorded result, without downloading again. Success/failure replay tests verify one download only and different-origin `REQUEST_CONFLICT`. Source comparison now operates at origin granularity, so reusing the same request ID on the same origin returns that prior result; a different import needs a new request ID. No retry downloads the saved origin.
- Production lines added: 3; test lines added: 38.
- Cost per terminal save or request-ID comparison: existing URL parse, O(link length) transient memory; terminal JSON write is smaller by the removed path/query bytes. No new writes or scans; no new I/O pass. Legacy reads: none added.

## Item 6 — done

Each database helper parent holds Jini's existing file lock beside its temporary root until normal cleanup finishes. Startup `tidy` scans only `tovu-import-db-*` directories and matching leftover lock files. Existing dead-owner and unknown-owner staleness rules determine cleanup; a proven live owner is never removed for age. A short contended acquisition is skipped. The parent recreates a still-empty directory under its lock if a cleanup pass claimed it before staging began. Temp paths use `tmpdir()`/`path.join()` and the lock stays beside the directory for Windows-compatible removal.

The desktop startup trigger also checks the temp root when the import registry is clean or missing; previously it launched cleanup only for a leftover stage/upload, which misses an interruption during verification.

Commands from Tovu root:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/platform/db/sqlite/__tests__/import-database.unit.test.ts apps/website/src/platform/db/sqlite/__tests__/import-database-cleanup.integration.test.ts
```

From `apps/desktop`:

```sh
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=2 src/site-archive-import.test.ts
./node_modules/.bin/tsc -p tsconfig.main.json --noEmit
```

- Red: startup cleanup regression (`--test-name-pattern='startup removes'`) 0 passed, 1 failed (`AssertionError [ERR_ASSERTION]`: killed parent's folder remained).
- Mutation: unguarded temp deletion: 0 passed, 1 failed (the other, still-running parent's folder was removed).
- Additional red: an orphan sibling lock was left after its directory had gone; 0 passed, 1 failed. Cleanup now handles that existing lock entry too.
- Desktop trigger red: 23 passed, 2 failed (clean/missing registry skipped temp cleanup).
- Green: 12 worker/cleanup tests passed, including real parent-process termination, an aged live-owner lock, legacy folders, orphan lock files, unrelated entries, repeated cleanup and normal success/cancellation/timeout cleanup. Desktop startup 25 passed.
- Website production no-emit: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item6.json --noEmit`, exit 0 after dependency output rebuild (includes `import-database.ts`, `import-backend.ts` and their dependencies). Desktop production no-emit: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item6-desktop-source.json --noEmit`, exit 0. The full desktop main check retains four base `TS2531` diagnostics in unchanged expressions of `site-archive-import.test.ts` (now lines 56, 171, 189, 206); final proof compares them to base.
- Production lines added: 80 (includes indentation of the existing worker body inside the lock); test/fixture lines added: 102.
- Cost per import: one small ownership lock write, ownership/liveness reads, release/unlink and a directory check; O(1) metadata memory beyond existing snapshot buffers. Cost per startup: up to two directory listings (registry and OS temp) and one cleanup child only if matching leftovers exist; O(entry names) memory. Cleanup attempts one existing small metadata lock per matching directory/lock entry, up to 100 ms wait per contended entry, and unlinks stale contents proportional to their bytes/file count. No database bytes are loaded by cleanup. No polling after startup.

Setup follow-up: later dependency builds exposed missing `@simplewebauthn/browser`, `@simplewebauthn/server` and `otplib` (`TS2307`, consequent `TS2339`, and runtime `ERR_MODULE_NOT_FOUND`). Their manifest-pinned versions were installed only in `/workspace/work/import-deps` and linked into ignored local dependencies. The first npm cache access failed `EROFS`; using a workspace cache succeeded. No manifest/lockfile changed. Contracts, MCP, daemon, devops, server and user-management outputs were rebuilt. These removed stale-export diagnostics; the four desktop main diagnostics above remain base source errors.

## Base/setup findings (separate from regression reds)

- Tovu's referenced `AI-Dev-Shop/AGENTS.md` is absent; the sibling Jini toolkit was read. No framework files changed.
- Initial restore discovery failed with `SyntaxError` for stale Jini exports: `fileDigest`, then `validateScripts`, `mediaFileReplacementRecord`, and `accessApprovalDetails` while local output was being rebuilt.
- Initial broad Tovu no-emit check reported pre-existing/dependency-output diagnostics; final report will separate their names/counts from changed-code checks.
- Host pnpm 11.25.0 failed with `ERR_PNPM_UNSUPPORTED_ENGINE`; `corepack pnpm@10.33.2` meets the repository requirement.
- Setup recursive build stopped with `ERR_MODULE_NOT_FOUND` (`esbuild` in agent-plugins' Cloudflare build) and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Required platform/CMS outputs built; restore tests subsequently ran normally. No unrelated source fixes made.
- First log redirection failed because the scratch directory did not yet exist; created `/workspace/work`.
- First external scratch tsconfig reported `TS2688` (node types); setting the repository typeRoots corrected the check.

## Other observed bugs

None confirmed beyond the requested six. Base/setup failures are listed above.

Work continues in item order. Final proof, SHAs and elapsed time will replace this progress footer.

Progress: item 1 pushed as `04236bde9` on Tovu `cloud/import-fix`. First pre-push pull returned `fatal: couldn’t find remote ref cloud/import-fix` because the new branch did not exist yet; the first push created it. A test-edit attempt used the desktop working directory with a root-relative path and raised `FileNotFoundError`; retried with the correct directory.

Progress: item 2 pushed as Tovu `855144073`; item 3 Jini commit `e95e99092`. Two package-local command attempts used unavailable `./node_modules/.bin` paths (`exit 127`), corrected to the workspace bin. One test append used a root-relative path from the package directory (`No such file or directory`); corrected to the absolute path. The first Jini push creates its previously absent remote branch.

Progress: item 3 Tovu commit `a03eb6335`; item 4 Jini commit `5b8d747a7`.

Other observed bugs (existing, reproduced by the unchanged assertions in the changed registry test file):

- Expiry throws `TypeError` for JSON `null` upload metadata (`createdAt` access).
- Expiry throws `TypeError` for a JSON `null` import record (`status` access).

Item 1 review correction: two additional string replacements identify menu/form notices by item ID; no extra runtime read/write or helper was added. IDs add at most one existing ID per notice (normally 36 characters); caps remain unchanged. Item 6 pushed as `7158bfc66`.
