# BUG-BATCH report

Base: `cloud/combine` in both repos (Tovu `f4b2d1531`, Jini `60807a9ca`). Work branch: `cloud/bug-batch` in both, one commit per bug, explicit paths, pushed after each unit. Raw outputs are in `cloud/reports/raw/bug-batch/<step>.txt`.

Setup: Node v24.22.2 from the nodejs.org tarball (sha256-checked) in `~/.local/node24`. Jini `pnpm install` then `pnpm --no-bail -r build` (both exit 0). Tovu `npm ci`, then `npm run build --workspace @tovu/sdk`, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`. The default Jini path in `link-jini.mjs` is `/root/Programming/Jini`, which fails here (`tovu-link-jini.txt`). `build:preload` exists only in `apps/desktop`. It was not needed: no desktop test was touched.

## Summary

| # | Bug | Confirmed on base | Jini commit | Tovu commit |
|---|-----|-------------------|-------------|-------------|
| 1 | cms parse5 is only an optional peer, but forms entries load it at import | yes (forms/sql, forms/html, forms/express) | `f7ab5e9e2` | — |
| 2 | cms SQL reads a null `source_ip` as `""` | yes | `9ee2680c6` | — |
| 3 | import expiry throws TypeError on JSON `null` | yes (both) | — | `50105ab7c` |
| 4 | data-module `dbPath` naming the wrong real file | yes | — | `7ff1828a3` |
| 5 | `sign-in-card.unit.test.ts` fails with `AbortSignal.any is not a function` | **no**, not reproducible | — | — |
| 6 | Tovu `tsconfig.tests.json` type errors | partly: the named files are clean; 10 other errors existed | — | `c51b8e071` |
| 7 | `plugin-host-bundled-identity` test is stale | **no**: no test by that name; the closest match passes | — | — |
| 8 | read-only outcome card fails silently on a refused link | yes | `52b035dcd` | — |
| 9 | repeated Sign in clicks open duplicate windows | yes (Jini sign-in card) | `0abd656be` | — |
| 10 | chat-preview doc says batches stay plain JSON | yes | — | `d9c5c5c75` |

Bugs 8 and 9 were **not seen in a browser**. They are proven with jsdom tests only.

## 1. cms parse5 loaded at import but declared only as an optional peer (Jini `f7ab5e9e2`)

- **Confirmed.** A walk of the import graph (`auditSubpathIsolation` closures) shows parse5 reached by three forms entries:
  - `./forms/sql`, through `repo.rows.ts` → `html/html-authoring.ts`
  - `./forms/html`, through `html-authoring.ts`
  - `./forms/express`, through `html/retry-draft.ts`. This is the same class elsewhere in forms, as the brief asked.
  - parse5 was an optional peer whose opt-in text named only `widgets/html/html-embeds`. The other forms entries reach only `@jini-ai/core` (always a dependency), plus kysely/`@jini-ai/db` on `forms/sql` and `@jini-ai/platform` on `forms/email-sender`. Those are optional peers that name their entry, so they are correct.
- **Fix:** parse5 `^7.3.0` moved to `dependencies`. It was removed from `peerDependencies`, `peerDependenciesMeta` and `jini.optionalPeers`, and the lockfile was updated (`pnpm install --lockfile-only`). There is no lazy import. The `jini.isolation.forbidden` lists still bar parse5 from universal and browser entries.
- **Test:** new case in `scripts/__tests__/optional-peer-contract.test.ts`. Every library a cms `./forms*` entry reaches must be in `dependencies`, or be an optional peer whose classification names that entry.
- **Red** (`bug1-red.txt`): `['./forms/html → parse5', './forms/sql → parse5', './forms/express → parse5']`.
- **Mutation** (`bug1-mutation.txt`): with parse5 dropped from `dependencies` (no peer either), the same three come back red.
- **Green** (`bug1-green.txt`): whole file, 58/58. The scripts type-check is clean (`bug1-typecheck-scripts.txt`).
- Command: `npx vitest run scripts/__tests__/optional-peer-contract.test.ts --maxWorkers=2 --minWorkers=1`

## 2. cms SQL row mapper reads a null `source_ip` as `""` (Jini `9ee2680c6`)

- **Confirmed.** `FormSubmissionRecord.sourceIp` is `string | null`, and the memory repo keeps `null`. Only `toSubmissionRecord` (`repo.rows.ts:77`) did `row.source_ip ?? ""`. Its comment said this was a shim "until the host adopts the nullable package DTO". Tovu already maps `null` to `""` at its own display edges (`inbound/admin-http/http/forms.ts:94`, `features/forms/tool-registrations.ts:194`).
- **Fix:** `sourceIp: row.source_ip`. The stale shim comment was removed with the shim.
- **Existing test pinned the bug itself:** `repo.dialects.test.ts`, "…reads back with an empty source IP", asserted `""`. It now asserts `null`, and its title says null.
- **Red** (`bug2-red.txt`): fails on sqlite and pglite. **Mutation** (`bug2-mutation.txt`): putting back `?? ""` turns both red again. **Green** (`bug2-green.txt`): repo.dialects, repo.contract and submission-ip-retention.dialects pass, 90/90. The cms type-check is clean (`bug2-typecheck.txt`).

## 3. Import expiry throws TypeError on JSON null (Tovu `50105ab7c`)

- **Confirmed** in `apps/website/src/features/site-backup/import-registry.ts`. `expireUpload` read `.createdAt` and `expireOwnerSetup` read `.status` off a `null` value, so one null file made the whole `expire()` sweep throw.
- **Fix:**
  - A null upload row can never be claimed (`getUpload` refuses it), so it now expires like an old upload, together with its ZIP. Otherwise the ZIP would pin the staging budget forever.
  - A null import record has nothing to expire, so it stays, the same way history listing already skips it.
- **Existing tests pinned the crash itself:** "expiry crashes on a null upload row (reported, not fixed)" and "expiry crashes on a null import record (reported, not fixed)" asserted the TypeErrors. I replaced both with the behaviour above, and no other registry test changed.
- **Red** (`bug3-red.txt`): 2 of 40 fail with the original TypeErrors. **Mutations:** keeping a null upload (`bug3-mutation-a.txt`) fails the upload test, and removing the record guard (`bug3-mutation-b.txt`) fails the record test. **Green** (`bug3-green.txt`): 40/40.
- Command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 <file>`

## 4. data-module `dbPath` naming the wrong real file (Tovu `7ff1828a3`)

- **Confirmed** through `features/plugins/data-module.ts`, then `snapshot.ts` and `disk-headroom.ts`:
  - The snapshot is the live connection's `backupTo`, but it is written to `dirname(dbPath)`.
  - Boot recovery restores it over `dbPath`.
  - Headroom measures `dbPath`'s size and its directory.
  - On base, with the connection open on `content.db` and `dbPath` pointing at another real (empty) `other.db`, the result was `ok: true`, `snapshotPath: …/other.db.snapshot-hello-…`, and headroom measured `other.db` (required bytes 0, so it always passes). See `bug4-red.txt`.
- **Fix:** before preflight, a recoverable (file-backed SQLite) declare compares the realpath of `dbPath` with the file the connection has open (`pragma_database_list`, `main`).
  - On a mismatch it refuses with `DB_PATH_MISMATCH` before any headroom check, snapshot or DDL.
  - Message: "dataModule declare refused: <dbPath> is not the database this connection has open (<file or 'an in-memory database'>). Pass the path of the open database file."
- **Existing test pinned the old crash for a mismatched path:** `data-module.dialects.test.ts`, sqlite branch of "a Postgres kernel takes no snapshot…". It used an in-memory kernel with `/nonexistent/content.db` and expected the snapshot to throw "directory does not exist". It now expects `DB_PATH_MISMATCH`. The Postgres branch is unchanged.
- **Mutation** (`bug4-mutation.txt`): with the realpath comparison dropped (only the existence check left), the new test goes red. **Green** (`bug4-green.txt`): all plugins tests plus comments, newsletter and share-database tests, 610/610.

## 5. `sign-in-card.unit.test.ts` and `AbortSignal.any` — NOT CONFIRMED

The test passed 7/7 every way I ran it:
- in `packages/ui` under its jsdom 25.0.1 environment, on Node 24.22.2 and on Node 22.23.4 (`bug5-node22.txt`)
- from the Jini root with `--environment jsdom` (jsdom 26.1) and with the default node environment (`bug5-root-jsdom.txt`, `bug5-root-node.txt`)
- inside the full `ui` suite: 8915 passed (`bug5-ui-full-suite.txt`). Its only 2 failures were my bug-8 red test, which was in the working tree at that moment. There were zero `AbortSignal.any` errors.

Nothing changed. It may only appear with an older jsdom (before `AbortSignal.any` existed) in some other runner. I could not reproduce that here.

## 6. Tovu `tsconfig.tests.json` type errors (Tovu `c51b8e071`)

- **Partly confirmed.** Against the linked Jini packages (the setup the brief prescribes), `mail-status-tool.test.ts`, `provider-tools.unit.test.ts` and `site-mailer.unit.test.ts` have no errors, and there is no implicit any. `apps/admin` (which holds `agent-plugin-choice-replay.unit.test.ts`, outside `tsconfig.tests.json`) also type-checks with 0 errors (`bug6-tsc-admin.txt`).
- The 10 errors that did exist (`bug6-tsc-tests-before.txt`):
  - `cli/__tests__/integration/import-local.integration.test.ts`: 8 × `result` is possibly null. It now does `assert.ok(result, …)`; only a tidy request returns null.
  - `plugin-runtime/__tests__/unit/set-enabled-confirmation-ui.unit.test.ts`: an approval fixture passed `scope` on a resource typed `Omit<AccessApprovalResource, 'scope'>`. That field is removed, and the outer `scope` is still passed. This is the same fixture-field class as the brief's assertAccessApprover note.
  - `admin-http/routes/system/site-imports.integration.test.ts`: the fake backend lacked the required `tidy`. It is now added as `assert.fail("unexpected tidy")`, matching that file's other fake.
- Test code only, no casts. **Green:** `tsc -p tsconfig.tests.json` reports 0 errors (`bug6-tsc-tests-after.txt`), and the 3 files pass 38/38 (`bug6-tests-green.txt`). Red is the before run; for a type-only fix the mutation is that same before state.
- Against the registry-published `@jini-ai/*` packages (`unlink:jini`, then relinked), the same check gives 431 errors (`bug6-tsc-tests-published.txt`). The published packages lag well behind `cloud/combine`, so that is not this bug.

## 7. `plugin-host-bundled-identity` — NOT CONFIRMED, unchanged

No test by that name exists on this base. The closest match is `server/runtime/composition/__tests__/plugin-host.integration.test.ts`, "every bundled agent and site package declares a distinct publisher identity…". It passes, as does the whole file (25/25, `bug7-before.txt`). Its `JINI_PUBLISHED_IDENTITIES` map matches the composed bundle: the Jini-published `charts-echarts` and `langfuse` carry `jini/*` ids but are not selected into the bundle, so they are rightly absent. With no product behaviour shown to differ, I left it unchanged.

## 8. Read-only outcome card fails silently on a refused link (Jini `52b035dcd`) — not seen in a browser

- **Confirmed:** `outcomeScript` (`outcome.ts:157`) called `api.openLink(OPEN_URL)` and ignored the reply.
- **Fix:** on a refused (`isError`) or rejected open, the status keeps the outcome text and state and appends: "The link did not open. Try again, or copy this address into your browser: <url>". The button stays usable.
- The byte-exact pins for outcomes that carry a link changed on purpose: 3 render cases plus the framed wrapper. "failure without link" is untouched and still pinned.
- **Red** (`bug8-red.txt`): refused and rejected cases fail. **Mutation** (`bug8-mutation.txt`): handling only rejections leaves the refused case red. **Green** (`bug8-green.txt`): mcp-ui tests 523/523. The ui type-check is clean (`bug8-typecheck-ui.txt`).

## 9. Repeated Sign in clicks open duplicate windows (Jini `0abd656be`) — not seen in a browser

- **Confirmed** in the sign-in card (`cancellableOutcomeScript`): every click sent a new `ui/open-link` request. The Tovu admin External MCP "Connect" button was also checked. It is disabled while busy, and React renders the click synchronously, so no change was made there.
- **Fix:** a repeat click while the open request is in progress reuses it. Once that request settles, a click opens again, so retry after a refusal still works.
- **Red** (`bug9-red.txt`): 3 clicks gave 3 requests. **Mutation** (`bug9-mutation.txt`): never clearing the in-progress request blocks the later open, which is red. **Green** (`bug9-green.txt`): mcp-ui 524/524. The ui type-check is clean (`bug9-typecheck-ui.txt`).

## 10. chat-preview batch comment (Tovu `d9c5c5c75`)

- **Confirmed** against `@jini-ai/core` `batch-tool-inputs.ts`. Each item's JSON drops its image, and the batch result carries up to four previews (at most two million serialized characters) beside its JSON summary.
- The comment is corrected. Comment only, so there is no red/green test or mutation.

## New findings (listed, not fixed)

1. **Jini cms `check:packaging` fails on base:** `src/media/video-frames.ffmpeg.ts` reads `process.env` (`bug1-check-packaging.txt`). This failure exists before and after bug 1.
2. **The read-only outcome "Open site" button can open duplicate windows on repeat clicks, like bug 9.** I left it alone because bug 9 named Sign in.
3. **The plugin-host test comment "Shared plugins published by Jini carry Jini's publisher id" is inaccurate.** Many `@jini-ai/agent-plugins` packages carry `tovu/*` ids; the map still handles it.
4. **Tovu's `tsconfig.tests.json` gives 431 errors against the registry-published `@jini-ai/*` packages**, so the tests type-check only holds while Jini is linked.
5. **`link-jini.mjs` defaults to `/root/Programming/Jini`.** A cloud checkout needs `JINI_PACKAGES_DIR`.
6. **Root and package vitest on this 4-core box:** `--maxWorkers=2` alone fails with "options.minThreads and options.maxThreads must not conflict". `--minWorkers=1` is needed alongside it.

## Not done

- Bugs 5 and 7: not reproducible, so there are no commits.
- Bugs 8 and 9 are not seen in a browser.
- No full-repo test run; only the touched files were run, per the brief.
- No processes were left running.

BUG-BATCH DONE

## BUG-BATCH-2

This is the owner-approved follow-up to an independent review: same branch, `cloud/bug-batch` in both repos. Raw outputs are in `cloud/reports/raw/bug-batch-2/`.

| # | Fix | Commit |
|---|-----|--------|
| 1 | data-module `dbPath` matched by file identity; a mismatch only warns | Tovu `da0b05264` |
| 2 | Sign in open request times out after 30 s and releases its guard | Jini `fa3f5d229` |

### 1. dbPath identity and no boot refusal (Tovu `da0b05264`)

This supersedes the `DB_PATH_MISMATCH` refusal from bug 4 above.

- **Confirmed:** the BUG-BATCH check compared canonical path strings. One database file reached through a second path is refused with `DB_PATH_MISMATCH`, so its tables stay uninstalled. In the regression test the second path is a hard link: same `(dev, ino)`, different path. It stands in for the same site directory behind two bind mounts, which can't be made here.
- **Fix** in `features/plugins/data-module.ts`, for a file-backed SQLite declare:
  - The open file comes from `pragma_database_list` (`main`). The named `dbPath` and that file are compared by `statSync` `dev` and `ino`.
  - A genuinely different file, a missing file, or an in-memory connection logs a plain `console.warn` and the install proceeds. The message is: "`<dbPath>` is not the database this connection has open (`<file>`). Its tables are installed in the open database, and the safety snapshot and disk-space check use it too. Fix the configured database path."
  - Headroom and the snapshot always use the database the connection has open. An in-memory connection takes no snapshot.
  - Callers passing `dbPath: ":memory:"` are unchanged.
- **Tests** in `__tests__/data-module.test.ts`:
  - The different-file case was rewritten. It now checks for exactly one warning, a completed install, headroom measured on the open file, the snapshot beside the open file, and nothing written beside the wrong file.
  - Added: "a different path to the same database file (a second mount, a hard link) installs without a warning".
  - In `data-module.dialects.test.ts`, the sqlite branch (in-memory kernel, `/nonexistent/content.db`) now expects `ok: true` and `snapshotPath: null` instead of the refusal.
- **Red** (`fix1-red.txt`): 3 failures. The same-file case failed with `DB_PATH_MISMATCH`; the other two were the rewritten cases.
- **Mutations:**
  - Going back to comparing path strings makes only the same-file case red (`fix1-mutation-a-path-compare.txt`).
  - Snapshotting the named path again makes only the different-file case red (`fix1-mutation-b-snapshot-named-path.txt`).
- **Green:**
  - The two data-module files pass 54/54 (`fix1-green.txt`).
  - All plugin tests plus the comments and newsletter tests pass 611/611 (`fix1-green-wider.txt`).
  - `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.tests.json` both report 0 errors (`fix1-tsc-main.txt`, `fix1-tsc-tests.txt`).
- Command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 <files>`

### 2. Sign in open request that never answers (Jini `fa3f5d229`). Not seen in a browser.

- **Confirmed by reading:** the bridge keeps unanswered requests with no timeout (`surfaces/bridge.ts` `request`). The BUG-BATCH guard (`opening`) cleared only when the request settled, so a lost reply made every later Sign in click return silently.
- **Fix** in `surfaces/outcome.ts`:
  - The request now races one named constant, `OPEN_LINK_TIMEOUT_MS = 30_000`.
  - On timeout the card shows "Failed: The link did not open within 30 seconds. Try again." through the existing failure path, which re-enables the buttons.
  - The guard and the timer are released when the request settles or times out.
  - Clicks before the deadline still reuse the request in progress.
- **Test** in `__tests__/surfaces/outcome.test.ts`, with fake timers. A request that never answers is still coalesced at 29,999 ms. At 30,000 ms the failure text is shown and both buttons are enabled. A retry calls `openLink` again and succeeds, a later click opens again, and only one timer is left.
- **Red** (`fix2-red.txt`): the status stays `partial` with no timeout.
- **Mutations:**
  - Not releasing the guard on timeout fails the retry (`fix2-mutation-a-guard-kept.txt`).
  - Not clearing the timer leaves 2 timers instead of 1 (`fix2-mutation-b-timer-not-cleared.txt`).
- **Green** (`fix2-green.txt`): mcp-ui passes 525/525. The ui type-check `tsc -p tsconfig.json --noEmit` is clean (`fix2-typecheck-ui.txt`).
- Command: `npx vitest run src/features/mcp-ui/__tests__/ --maxWorkers=2 --minWorkers=1`

### New findings (listed, not fixed)

1. After a failed or timed-out open, a later successful retry leaves the "Failed: …" status in place. The refused path did this before BUG-BATCH too.
2. Each timed-out request stays in the bridge's `pending` map forever, because the bridge itself has no timeout. This is a small leak per lost reply.

No processes were left running.

BUG-BATCH-2 DONE
