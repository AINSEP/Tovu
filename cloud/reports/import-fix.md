# Import fixes

Started 2026-11-07 19:57:25 UTC (11:57:25 PST). Deadline 21:57:25 UTC.
Branches: `cloud/import-fix` in both repositories. Bases: Tovu `b45d2ee759009b08d04268ef9ddcf2b6d0f60671`; Jini `32e9c9c2128805b20d1a562d6f0053d1c4604b52`.

## Item 1 — done

Imported menus and forms follow the same keep-off rule as pages. Menus use existing `items` mode: draft menus still resolve, so draft status would not suffice. The stored HTML remains recoverable by choosing HTML mode. Forms use existing `disabled` status, preserving their authoring envelope unchanged. Innocent menus/forms and marker-only pages remain live. Existing trusted theme behavior remains covered by the restore tests. Notices use the existing 80-character title limit and 20-item cap per kind plus a summary.

Changed test command (Tovu root):

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
```

Node tests use `--test-concurrency=2`; Node does not accept Vitest worker flags. Vitest commands will use `--maxWorkers=2 --minWorkers=1`.

- Red: 42 passed, 1 failed (`AssertionError [ERR_ASSERTION]`, menu remained in HTML mode).
- Mutation: menu-only implementation: form remained active, caught by `AssertionError [ERR_ASSERTION]`; 41 passed, 2 failed (the second exposed changed missing-table error order; corrected before final validation).
- Mutation: bypass menu keep-off: 42 passed, 2 failed (menu state and notice-cap checks).
- Green: 44 passed, 0 failed. An initial cap fixture used identical titles and encountered existing notice deduplication; unique titles now exercise the intended cap.
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

## Items 4–6 — pending

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
