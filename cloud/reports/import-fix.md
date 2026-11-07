# Import fixes

Started 2026-11-07 19:57:25 UTC (11:57:25 PST). Deadline 21:57:25 UTC.
Branches: `cloud/import-fix` in both repositories. Bases: Tovu `b45d2ee759009b08d04268ef9ddcf2b6d0f60671`; Jini `32e9c9c2128805b20d1a562d6f0053d1c4604b52`.

All six items are done. Final changed tests: **321 passed, 0 failed**. Every changed production graph and the changed website test graph passes no-emit checking. The full desktop main check has four unchanged base test diagnostics, listed below. No work stopped at the cap.

## Branches and pushed revisions

Both branches are `cloud/import-fix`. The implementation tip before this report commit is Tovu `d9979c16b34c4181a95cf25418dba842e38bfbd7`; Jini's tip is `5b8d747a710bcfb8f3df664b18784e1350bd70d9`. The report commit is the commit containing this final version of the file; its SHA is in the delivery message.

| Item | Repository | Pushed implementation/test SHA(s) |
| --- | --- | --- |
| 1 | Tovu | `04236bde907e7fd1165f0d2a9e090d5c87443539`, `e401f890ef6691268029cc554969ba836a52e522` |
| 2 | Tovu | `855144073e9c65ad6c56c35646ccbafe609c7093` |
| 3 | Jini / Tovu | `e95e990921ab93635f9ff0466f946a380356d212` / `a03eb63354ab178903ad89d74222cc0e7ca89258` |
| 4 | Jini / Tovu | `5b8d747a710bcfb8f3df664b18784e1350bd70d9` / `144c541b6e8809aa09ea7c484a640fbc22784c35` |
| 5 | Tovu | `25339add0ba00283996156e85f0875b7adb1df61`, `d9979c16b34c4181a95cf25418dba842e38bfbd7` |
| 6 | Tovu | `7158bfc66f1df9606d0fb22fcfad943ab1c68726` |

Commits used explicit paths. Each item was pushed. Tovu alone used the owner's approved `--no-verify`; Jini commits/pushes used normal verification. Nothing was pushed to combine/main or the excluded branches. No publish, tag, deployment, manifest, lockfile or schema change.

## Item 1 — done

Imported menus and forms follow the same keep-off rule as pages. Menus use existing `items` mode: draft menus still resolve, so draft status would not suffice. The stored HTML remains recoverable by choosing HTML mode. Item IDs distinguish notices for equal titles, so existing notice deduplication cannot merge different items. Forms use existing `disabled` status, preserving their authoring envelope unchanged. Innocent menus/forms and marker-only pages remain live. Existing trusted theme behavior remains covered by the restore tests. Notices use the existing 80-character title limit and 20-item cap per kind plus a summary.

Changed test command (Tovu root):

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
```

Node tests use `--test-concurrency=2`; Node does not accept Vitest worker flags. Vitest commands use `--maxWorkers=2 --minWorkers=1`.

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
- Cost: once per newly created live import, one existing start request and two existing inventory state updates (each replaces one site record and uses the existing inventory merge). Memory is O(inventory references + one site record) per update. No new recurring I/O. Already-running sites: none.

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

After rebuilding and relinking Jini, the two changed website test files passed 46/46; the two changed desktop files passed 41/41 using the commands recorded above. Renderer no-emit passed. The CLI-output test initially reached `TS2353` in `features/site-export/site-exporter.ts:589` while devops output was stale. Rebuilding the declared dependency resolved it. The final website source and changed-test graph checks both pass; no diagnostic was suppressed.

- Production lines added: 2 (Jini); test lines added: 46 (27 Jini, 19 Tovu).
- Cost per timed-out request: one URL parse, O(address length) transient memory; retain only O(origin length + duration) error text. No added I/O. Removing the full-address field reduces retained error memory. Successful requests: none.

## Item 5 — done

The existing link-normalization function now returns `URL.origin`. Ready and failed saves therefore retain scheme, host and port only. Verifying/pending rows keep their original link, and upload IDs are unchanged. No schema migration or new record field was added. Legacy records still load with their existing shape. The existing expiry/history pass normalizes older finished links once, so startup tidy and history refresh clear their stored details too; no schema change or extra directory scan is needed. Plain reads do not write records.

Command from Tovu root:

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts apps/website/src/features/site-backup/__tests__/import-backend.unit.test.ts
```

- Base: 97 passed, 0 failed.
- Red: 94 passed, 6 failed (`AssertionError [ERR_ASSERTION]`: retained paths in ready/failed history, legacy normalization and replay views).
- Mutation: sanitize only ready rows, with `--test-name-pattern='row keeps only|legacy.*history|replayed.*share import'` before those two paths: 3 passed, 3 failed (failed-state handling caught).
- Green: 100 passed, 0 failed, 68.51 s. Final review also checks legacy expiry: red 0/2, ready-only mutation 1/2, then the full registry file 40/40 green after both terminal states were handled.
- Source no-emit: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item5.json --noEmit`, exit 0; config extends Tovu settings and includes `import-registry.ts` plus dependencies, with repository typeRoots.
- Readers checked: admin history source label and tooltip display the saved value; backend `siteImportView` forwards it; request-ID replay normalizes both existing and incoming sources and returns the recorded result, without downloading again. Success/failure replay tests verify one download only and different-origin `REQUEST_CONFLICT`. Source comparison now operates at origin granularity, so reusing the same request ID on the same origin returns that prior result; a different import needs a new request ID. No retry downloads the saved origin.
- Production lines added: 5; test lines added: 38.
- Cost per terminal save or request-ID comparison: existing URL parse, O(link length) transient memory; terminal JSON write is smaller by the removed path/query bytes. Each existing expiry pass adds one URL parse per finished URL record; each old detailed URL causes one record-sized rewrite, once. No extra directory scan; ordinary reads add no I/O.

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

Setup follow-up: later dependency builds exposed missing `@simplewebauthn/browser`, `@simplewebauthn/server` and `otplib` (`TS2307`, consequent `TS2339`, and runtime `ERR_MODULE_NOT_FOUND`). Their manifest-pinned versions were installed only in `/workspace/work/import-deps` and linked into ignored local dependencies. The first npm cache access failed `EROFS`; using a workspace cache succeeded. No manifest/lockfile changed. Contracts, MCP, daemon, devops, server and user-management outputs were rebuilt. These removed stale-export diagnostics. Chat was also rebuilt after restoring its already-declared local ui-kit link. The four desktop main diagnostics above are the only remaining base source errors.

## Final proof

Only changed test files ran; the helper fixture is counted with test code. No full suite ran. Vitest used `--maxWorkers=2 --minWorkers=1`; Node used its corresponding `--test-concurrency=2`. Final process inventory found no live test/helper process.

| Final run | Result |
| --- | --- |
| Jini platform: five changed files | 90 passed, exit 0 |
| Jini integrations: one changed file | 7 passed, exit 0 |
| Tovu website: six changed files | 158 passed, exit 0 (79.59 s) |
| Tovu desktop main: one changed file | 25 passed, exit 0 |
| Tovu desktop renderer: two changed files | 41 passed, exit 0 |
| Total | **321 passed, 0 failed** |

Exact final commands, in execution order by repository:

```sh
# /workspace/Jini/packages/platform
npm run build
npm run typecheck
../../node_modules/.bin/vitest run src/http/guarded/__tests__/transport-request-port.test.ts src/__tests__/fetch-with-timeout.test.ts src/__tests__/fetch-text-guards.test.ts src/http/guarded/__tests__/timeouts.test.ts src/http/guarded/__tests__/client-boundaries.test.ts --maxWorkers=2 --minWorkers=1
# /workspace/Jini/packages/integrations
npm run build
npm run typecheck
../../node_modules/.bin/vitest run src/media-providers/dispatch/__tests__/node.integration.test.ts --maxWorkers=2 --minWorkers=1
# /workspace/Tovu
JINI_PACKAGES_DIR=/workspace/Jini/packages node development/scripts/link-jini.mjs
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts apps/website/src/features/site-backup/__tests__/import-download-limit.unit.test.ts apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts apps/website/src/features/site-backup/__tests__/import-backend.unit.test.ts apps/website/src/platform/db/sqlite/__tests__/import-database.unit.test.ts apps/website/src/platform/db/sqlite/__tests__/import-database-cleanup.integration.test.ts
# /workspace/Tovu/apps/desktop
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=2 src/site-archive-import.test.ts
node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=2 src/renderer/App.render.test.ts src/renderer/use-import-website.hooks.render.test.ts
```

All package build/no-emit commands above exited 0 (`typecheck` is `tsc -p tsconfig.json --noEmit`). The order of the independent package test/build groups does not affect their results; both touched packages were rebuilt before Tovu was relinked and its dependent tests reran.

Final Tovu no-emit commands:

```sh
# /workspace/Tovu
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/tsc -p /workspace/work/tsconfig-final-source.json --noEmit
./node_modules/.bin/tsc -p /workspace/work/tsconfig-final-tests.json --noEmit
./node_modules/.bin/tsc -p /workspace/work/tsconfig-item6-desktop-source.json --noEmit
# /workspace/Tovu/apps/desktop
./node_modules/.bin/tsc -p tsconfig.renderer.json --noEmit
./node_modules/.bin/tsc -p tsconfig.main.json --noEmit
```

All exit 0 except the full main check, which exits 2 with the same four base diagnostics. Scratch configs are reproduced here; they change no repository compiler settings and suppress no diagnostic.

`/workspace/work/tsconfig-final-source.json`:

```json
{
  "extends": "/workspace/Tovu/tsconfig.json",
  "compilerOptions": {
    "typeRoots": [
      "/workspace/Tovu/node_modules/@types"
    ]
  },
  "include": [
    "/workspace/Tovu/apps/website/src/features/site-backup/import-keep-off.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/import-registry.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/import-database.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/import-backend.ts"
  ],
  "exclude": []
}
```

`/workspace/work/tsconfig-final-tests.json`:

```json
{
  "extends": "/workspace/Tovu/tsconfig.json",
  "compilerOptions": {
    "typeRoots": [
      "/workspace/Tovu/node_modules/@types"
    ]
  },
  "include": [
    "/workspace/Tovu/apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/__tests__/import-download-limit.unit.test.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts",
    "/workspace/Tovu/apps/website/src/features/site-backup/__tests__/import-backend.unit.test.ts",
    "/workspace/Tovu/apps/website/src/platform/db/sqlite/__tests__/import-database.unit.test.ts",
    "/workspace/Tovu/apps/website/src/platform/db/sqlite/__tests__/import-database-cleanup.integration.test.ts",
    "/workspace/Tovu/apps/website/src/platform/db/sqlite/__tests__/import-database-parent.fixture.ts"
  ],
  "exclude": []
}
```

`/workspace/work/tsconfig-item6-desktop-source.json`:

```json
{
  "extends": "/workspace/Tovu/apps/desktop/tsconfig.main.json",
  "compilerOptions": {
    "typeRoots": [
      "/workspace/Tovu/apps/desktop/node_modules/@types",
      "/workspace/Tovu/node_modules/@types"
    ]
  },
  "include": [
    "/workspace/Tovu/apps/desktop/src/site-archive-import.ts"
  ],
  "exclude": []
}
```

## Red at base, separate from regression reds

With the same rebuilt dependencies, the exact Tovu base was checked again: full website exit 0, renderer exit 0, changed website test graph exit 0, full desktop main exit 2. Tracked source/test files were temporarily restored to their exact base contents for those checks and restored afterward. The changed-test graph check retained the two newly added fixture/test files against the base APIs; ordinary base website/main/renderer project checks do not include new files in their test program. Final and base main diagnostics match exactly after normalizing line/column offsets.

| Error name | Base location | Final location | Message |
| --- | --- | --- | --- |
| TS2531 | `src/site-archive-import.test.ts:55:20` | `:56:20` | Object is possibly null |
| TS2531 | `src/site-archive-import.test.ts:170:16` | `:171:16` | Object is possibly null |
| TS2531 | `src/site-archive-import.test.ts:188:16` | `:189:16` | Object is possibly null |
| TS2531 | `src/site-archive-import.test.ts:205:16` | `:206:16` | Object is possibly null |

These existing test expressions were left unchanged. Changed production source, the full renderer, all website source and the changed website test graph pass their checks.

## Named errors and setup findings

This lists failures of commands, regression/mutation runs and baseline checks. Expected negative-case errors in already-green tests are not additional failed checks.

- `AssertionError` / `AssertionError [ERR_ASSERTION]`: intended regression/mutation failures described per item; all final test runs green.
- `SiteShareRefusal` / `DOWNLOAD_FAILED`: the item 3 reproduction with the old response clamp; final complete download passes.
- `FetchTimeoutError`: timeout classification retained; its full-address field removed. Messages, JSON and inspected errors have no path/query.
- `FileLockTimeoutError`: expected contention during cleanup; live/unknown fresh owners are skipped, using existing lock behavior.
- `TypeError`: two existing null-record expiry bugs reproduced by existing assertions; listed individually below and left unchanged.
- `SyntaxError`: stale dependency exports `fileDigest`, `validateScripts`, `mediaFileReplacementRecord`, `accessApprovalDetails`; resolved by rebuilding output.
- `ERR_MODULE_NOT_FOUND`: missing setup packages `esbuild` during the unrelated agent-plugins Cloudflare build and `otplib` after user-management output rebuilt. The Cloudflare build was not needed for this task; manifest-pinned auth dependencies were installed in scratch and local ignored links restored. No dependency manifests changed.
- `ERR_PNPM_UNSUPPORTED_ENGINE`: host pnpm 11 versus required pnpm 10; used `corepack pnpm@10.33.2`.
- `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`: recursive setup stopped at missing esbuild/auth dependencies; required package outputs were rebuilt directly.
- `EROFS`: npm's default home cache was read-only; installation succeeded with `/workspace/work/npm-cache`.
- `FileNotFoundError`, `ENOENT` / “No such file or directory”, shell exit 127: initial scratch-log directory and root-relative/package-local edit/bin paths; corrected to workspace/absolute paths. Read probes also established that Tovu's `AI-Dev-Shop/AGENTS.md` is absent; the sibling Jini toolkit was read and framework files were untouched.
- Git missing/ambiguous `origin/cloud/combine`: resolved by fetching the named refs and verifying both exact base SHAs. Git “couldn't find remote ref cloud/import-fix”: the new remote branch did not yet exist on first pull; the first push created it. Later pulls/rebases and all pushes succeeded.
- Initial diagnostic formatting of a 101 MiB resolved response was terminated; the test now compares a bounded outcome string. No live test process remains.

All observed TypeScript error names are recorded below. Except the four `TS2531` baseline diagnostics, these were setup/stale-output diagnostics or scratch-config resolution errors and are absent in final checks. The remaining missing local ui-kit link was restored before the final chat rebuild.

| Error name | Meaning |
| --- | --- |
| TS18046 | Value is unknown |
| TS18047 | Value is possibly null |
| TS2305 | Missing module export |
| TS2307 | Missing module or declarations |
| TS2322 | Incompatible assignment |
| TS2339 | Missing property |
| TS2344 | Generic constraint mismatch |
| TS2345 | Argument type mismatch |
| TS2353 | Unknown object property |
| TS2531 | Object is possibly null (four base diagnostics remain) |
| TS2551 | Missing property with suggested member |
| TS2554 | Argument count mismatch |
| TS2559 | Types have no properties in common |
| TS2561 | Unknown object property with suggestion |
| TS2688 | Missing node type definition in the initial external scratch config |
| TS2694 | Missing namespace member |
| TS2724 | Missing named export with suggestion |
| TS2739 | Required properties missing |
| TS2741 | Required property missing |
| TS7006 | Implicit-any parameter |
| TS7031 | Implicit-any binding |
| TS7053 | Invalid typed indexing |

## Lines added

Raw `git diff --numstat` against the exact bases; report text, dependency output and local links are excluded. Test counts include the parent-process fixture. Existing worker-body indentation inside its ownership lock is included in raw production additions.

| Item | Production lines added | Test/fixture lines added |
| --- | ---: | ---: |
| 1 | 26 | 58 |
| 2 | 4 | 35 |
| 3 | 4 | 72 |
| 4 | 2 | 46 |
| 5 | 5 | 38 |
| 6 | 80 | 102 |
| Total | **121** | **351** |

By repository: Tovu 115 production / 288 test lines; Jini 6 production / 63 test lines. Item 1 IDs add normally 36 characters per notice; stored caps remain unchanged. Memory and I/O frequency × size are recorded under every item above; no new work runs on each public-page view.

## Other observed bugs

- Expiry throws `TypeError` for JSON `null` upload metadata (`createdAt` access).
- Expiry throws `TypeError` for a JSON `null` import record (`status` access).

Both are existing behavior explicitly reproduced in the unchanged registry test assertions. No unrelated source fix was made. Jini's local untracked `packages/plugin-ui-ux-design/` was left untouched and uncommitted.

Verification and report completed 2026-11-07 12:51:02 PST (20:51:02 UTC). Time used: **53 min 37 s**, below the two-hour cap. All six items are done; final delivery follows the report push.

IMPORT-FIX DONE

## Review fixes

Follow-up started 2026-11-07 13:09:14 PST (21:09:14 UTC); cap 14:09:14 PST. Same `cloud/import-fix` branches. Records below describe this follow-up only.

### 1 — done

Native form grouping and inert input hints are normalized only in the form check; original HTML is retained. The real `formHtmlStarter` output (radio group and URL field) stays active. Handler-bearing and custom-scheme-link forms remain disabled. Page checks are unchanged.

Command: `bash /workspace/work/run-tovu-file.sh --test-name-pattern='starter radio' apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts`. Red: 0/1; mutation allowing the handler attribute: 0/1; restored policy and whole changed file: 45/45 green. No-emit `tsc -p /workspace/work/tsconfig-item1.json --noEmit`: exit 0. Initial bare admin-package import was unavailable at the website root (`ERR_MODULE_NOT_FOUND`); the test uses the real module from the existing admin installation.

Cost: one additional bounded form DOM normalization/serialization per imported HTML form, O(HTML bytes), no additional I/O.

### 2 — done

The existing guarded request now accepts `bodyAs: "bytes"`. Native transport omits decoded text and clears collected chunks immediately after concatenation. The client skips text capping/re-encoding. Share download requests bytes and returns the native Buffer unchanged; older Uint8Array adapters get a zero-copy Buffer view. Other callers retain their text behavior.

Jini changed file command from `packages/platform`: `../../node_modules/.bin/vitest run src/http/guarded/__tests__/transport-request-port.test.ts --maxWorkers=2 --minWorkers=1`. Red 3/4, mutation restoring client re-encoding 3/4, green 4/4. Core and platform rebuild/no-emit checks exit 0. Tovu `import-download-limit.unit.test.ts`: missing request mode red 0/1; copy-restoring mutation red 0/1; full file green 3/3. Its no-emit dependency graph exits 0. The existing download request expectation now includes the mode. A root-relative edit from the package directory initially raised `FileNotFoundError`; no source mutation resulted from that attempt.

Measured with `node --expose-gc --max-old-space-size=128 /workspace/work/review/memory.mjs`: 300 MiB of separately allocated non-ASCII chunks through the real guarded client/native transport effect seam. Peak RSS approximately 637 MiB; sampled peak heap under 8 MiB; text length zero. RSS uses the process high-water reading; heap is sampled, not an exact high-water instrument. Calculated buffer peak is two payload-sized byte allocations at concat, with no payload-sized V8 string or re-encoding buffer. The Tovu Buffer identity test proves its copy is removed.

Cost: one download × at most 300 MiB network data; roughly two payload-sized external byte buffers transiently at concat, then one result buffer. No payload-sized text allocation or additional disk I/O. Jini commit `d469108bd`.

### 3 — done

All imported menus, including trash, have their HTML checked. Restoring a menu leaves its HTML mode off. Forms are checked in every status too: disabled/restorable forms retain HTML but receive the same individual notice before someone can enable them. The prior active-only filter gave no notice for those forms.

`import-restore.unit.test.ts`, pattern `restorable menus`: red 0/1; menu-only mutation still 0/1 because the disabled form's notice was missing; full file green 46/46. Focused source no-emit exits 0. Cost: the same once-per-import table reads now include non-live rows; one status/mode update and bounded notice per applicable item.

### 4 — done

New URL imports retain a SHA-256 `sourceDigest` of the canonical link without its query. Request replay compares that digest when present; old records without it keep the approved origin fallback. Paths are not retained in finished history. Query-only changes replay; a corrected path with the same ID/origin gives `REQUEST_CONFLICT` without another download.

`import-backend.unit.test.ts`, pattern `distinguishes corrected`: red 0/1; mutation saving the digest but still comparing origins 0/1; replay regression group green 4/4. Website production no-emit exits 0. Cost: one SHA-256 pass over at most the accepted URL length at creation/replay, 64 hexadecimal characters per new URL record, no new I/O pass.

### 5 — done

Each menu/form JSON parse is guarded independently. Null and non-string HTML shapes are skipped without changing the stored row; other valid rows still get checked and notices. No shared parser layer was added.

`import-restore.unit.test.ts`, pattern `unreadable menu and form`: red 0/1 (`SyntaxError`); menu-only guard mutation 0/1 on the form parse; whole file green 47/47. Focused source no-emit exits 0. Cost: one existing JSON parse per selected row, with per-row exception/shape handling; no additional I/O or stored fields.

### 6 — done

Per-entry cleanup continues on `EBUSY`, `EPERM` and `EACCES`; the affected folder remains for a later launch. Other unexpected errors still propagate to the caller's warning handling.

`import-database-cleanup.integration.test.ts`, pattern `cleanup continues`: red 0/3; mutation handling only `EBUSY` 1/3; whole changed file green 6/6. Focused website production no-emit exits 0. Cost: O(1) error classification per unavailable entry; no new scans or memory buffers.

### 7 — done

Server boot schedules `tidyImportDatabases` once without awaiting it. A rejected cleanup emits a specific retry warning and does not affect boot. The runtime test stops before site initialization and proves boot continues while cleanup remains pending, as well as the warning on failure.

New changed test command: `node --experimental-test-module-mocks --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/cli/__tests__/unit/serve-import-cleanup.unit.test.ts`. Red 0/1 (missing call), mutation suppressing the warning 0/1, green 1/1. Full website no-emit exits 0.

Cost: one asynchronous OS-temp directory listing per server boot, then small metadata lock attempts for matching entries and unlink work for stale contents. It loads no database bytes, adds no recurring timer, and never awaits the sweep on the serving path.

### 8 — done

Tidy now passes `staleMs: 86_400_000`. The real-parent regression changes a held lock's hostname and sets a one-minute-old timestamp: red with the default interval, still red with a 30-second mutation, then the full cleanup file passes 6/6 with the one-day interval. Known dead owners still reclaim immediately. Focused no-emit exits 0. Cost: none beyond the existing stale comparison; unknown-owner leftovers can remain for a day.

### 9 — done

The parent chooses a random root name, takes its sibling lock, then creates the directory with `mkdir({ mode: 0o700 })`. There is no unlocked staging folder, recursive recreate step or redundant `assertHeld`.

`import-database.unit.test.ts`, pattern `private root only`: red 0/1 (directory already existed before owned creation); mutation retaining recursive mkdir 0/1; both changed worker/cleanup files green 16/16. Focused production no-emit exits 0. Cost: replaces mkdtemp/recreate/ownership reread with one random ID and one private mkdir; lock metadata I/O remains the same.

### 10 — done

The share transfer deadline is 295 seconds, inside the existing five-minute outer import deadline. Request regression red 0/1 at 120 seconds, boundary mutation red 0/1 at 300 seconds, whole download file green 3/3. Focused download/test no-emit exits 0. Cost: none unless a slow transfer uses the additional allowed time; byte cap stays unchanged.

### 11 — done

Deployment timeout messages now identify only the origin, with a plain fallback for an unparseable URL. Caller cancellation still propagates unchanged. The resource-path/query regression is red 0/1; mutation retaining only the path is red 0/1; whole `host-kit.unit.test.ts` green 14/14. Full website no-emit exits 0. Cost: one small URL parse only when a request times out; no additional I/O.

### 12 — done

Desktop's existing registry listing now recognizes JSON history as a reason to run tidy. This lets finished records be scrubbed even without interrupted-import leftovers. Any history record triggers the existing one-child cleanup; distinguishing finished status would require reading files, so the trigger conservatively includes all history.

`site-archive-import.test.ts`, pattern `saved history`: red 0/1; mutation recognizing a different JSON filename pattern 0/1; whole changed file green 26/26. Focused desktop main source no-emit exits 0. During the first whole-file run, the old clean-registry fixture still contained a JSON history file and its expected temp-listing assertion failed; changed that fixture to a plain readme and reran green. The initial red fixture also raised `SyntaxError` while parsing absent child input; it now first asserts the missing spawn explicitly.

Cost: no extra listing or file reads in the startup trigger, O(existing listing entries); at most one existing short tidy child per launch when history is present.

### 1 — final check correction

A new grouped-option handler regression exposed that rewriting grouping to a div could discard attributes during reparse. Grouping now maps to an option for checking, and its inert label is ignored. Original stored HTML stays unchanged. Red 0/1; mutation mapping to span 0/1; the first option-mapping run also failed the innocent label case (46/47), then the complete changed restore file passed 47/47. Focused no-emit exits 0. This supersedes the initial normalization detail above; cost is unchanged.
