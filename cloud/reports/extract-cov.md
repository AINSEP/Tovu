# EXTRACT-COV: line coverage of the code the plugin extraction moved or changed

Report only. No tests were written and no code was changed. Measured on 2026-11-10 in a 4-core cloud container with Node v24.22.2.

## Tips measured

| repo | branch | tip measured | baseline (cloud/combine) |
|---|---|---|---|
| AINSEP/Jini | cloud/extract-s10 | `6c7a7857d41c6185e8fb6f23ebfef0111c584adb` | `e1b1bdbd6` |
| AINSEP/Tovu | cloud/extract-s10 | `0e14ab98f462a6e842aacd872f7b2801d036a537` | `7cf9658e5` |

Both tips were recorded at the start of the job and checked out detached from later pushes. The concurrent fix job's changes were not pulled. This report is on Tovu `cloud/extract-cov`, branched from the Tovu tip above.

## Headline

| repo | changed or added non-test src files | types / re-exports only (excluded) | measured at 100% lines | measured below 100% | not measured |
|---|---:|---:|---:|---:|---:|
| Jini (`packages/*/src`) | 244 | 53 | 89 | 81 | 21 (20 have no executable statements per v8; 1 never loaded) |
| Tovu (`apps/website/src`, `packages/`) | 159 (all in `apps/website/src`) | 26 | 94 | 30 | 9 (no importing test) |

**The main finding:** most low Jini numbers come from code that moved into Jini while its tests stayed in Tovu. 59 of the 81 Jini files below target score under 50% in Jini's own suite, and 34 score 0%. Yet, of the 81 below-target Jini files, 80 have their compiled `dist/*.js` counterpart loaded by the Tovu tests run here. Many of those are nearly fully hit there, for example `plugins/src/host/tools/management.ts` at 0% in Jini against 597/605 `dist` lines in Tovu. Under the owner's rule (Jini code proven by Jini tests with injected fakes), these are real gaps in Jini. They are not dead code. The tests exist, but they are in the wrong repo, and they run against built output.

## Tools and exact commands

Setup: Node 24 from the nodejs.org tarball, with corepack enabled. Jini ran `pnpm install --frozen-lockfile` and `pnpm --no-bail -r build`; both succeeded (`raw/00`, `raw/01`). Tovu ran `npm ci`, then `npm run build -w @tovu/sdk`, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` (`raw/04`–`raw/06`). The env var is needed because the script defaults to `~/Programming/Jini/packages`.

**1. File lists** (`raw/02-*-filelist.txt`, with git status and classification per file):

```bash
git -C Jini diff --name-status -M e1b1bdbd6 6c7a7857 -- 'packages/*/src/**'
```

```bash
git -C Tovu diff --name-status -M 7cf9658e5 0e14ab98f -- 'apps/website/src/**' 'packages/**'
```

Deleted files were dropped, and so were tests (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`), fixtures and `.d.ts` files. A comment-stripping classifier marked files whose only content is imports, `export … from`, interfaces and type aliases as types/re-exports only (TYPEONLY). Afterwards, v8 found zero statements in 20 more Jini files that the classifier had kept. They are listed under "not measured".

**2. Jini.** Each package that has a listed file ran its own vitest config once (vitest 2.1.9). The config's `coverage` block was used as is, including `include`, `exclude` and thresholds. Only the reporters and the output directory were overridden on the CLI. Wrapper: `raw/03-jini-runpkg.sh.txt`. Run from `packages/<pkg>`:

```bash
npx vitest run --coverage.enabled=true --coverage.provider=v8 --coverage.reporter=json --coverage.reporter=json-summary --coverage.reporter=lcov --coverage.reportOnFailure=true --coverage.reportsDirectory=<scratch>/cov/<pkg> --maxWorkers=2 --minWorkers=1
```

Two packages differ. `commerce` adds `-c vitest.coverage.config.ts`, its own coverage config that merges its two vitest suites; its `node --test` catalog unit tests are not measured. `plugins` has no coverage config, so it adds `--coverage.include=src/**`. The per-file line count uses istanbul's rule on `coverage-final.json`: a line is one that has a statement starting on it. Results per package are in `raw/03-jini-<pkg>.txt`:

| package | test files | tests | exit | why non-zero |
|---|---|---|---|---|
| cookie-consent, oauth, plugins, user-management, commerce, cms, daemon | all pass | all pass | 0 | — |
| devops, core, mcp, platform, agent-runtime, ui | all pass | all pass | 1 | the package's own global coverage thresholds only (`ERROR: Coverage … does not meet global threshold`) |
| integrations | all pass (96/96, 2015 tests; rerun without coverage, `raw/03b`) | — | 1 | the coverage run printed no summary; the rerun without coverage exits 0, so most likely thresholds |
| agent-plugins | 4 failed / 121 | 8 failed / 1652 | 1 | `manifest.test.ts`, `integration-contract.test.ts`, `lifecycle/__tests__/type-cycles.test.ts`, `commerce-manifest.unit.test.ts` |
| db | 2 failed / 94 (rerun, `raw/03b`) | 2 failed / 737 | 1 | `loads-without-driver.test.ts` (subpath export list), `import-isolation.test.ts` |

`reportOnFailure` was on, so all 16 packages wrote coverage. In agent-plugins and db the failing files' own coverage is still counted.

**3. Tovu.** `development/scripts/coverage-changed.sh` is the repo's own changed-file coverage tool, but it cannot run in a fresh clone: it needs the gitignored gate `ADS-memory/.local-artifacts/test-slots/run-gated.sh`. I used its discovery helpers instead (`scanModule` and `resolveLocalImport` from `coverage-changed-discovery.ts`) to find tests that import a listed file directly or through one `export … from` hop. Script: `raw/07-tovu-select-script.ts.txt`. The runner is the repo's own `test:cov` command line, with the selected files in place of the globs. A hard cap on how many tests ran is explained below. Run from the Tovu root:

```bash
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 --experimental-test-coverage --test-coverage-exclude='**/__no_route_coverage_gate_exclusions__/**' --test-reporter=lcov --test-reporter-destination=<scratch>/tovu-NN.lcov --test-reporter=tap --test-reporter-destination=<scratch>/tovu-NN.tap --test-reporter=dot --test-reporter-destination=stdout <batch NN of the selected test files>
```

The 222 selected test files ran in 4 batches (`raw/08-tovu-batch-NN.txt`). Results: 2,833 tests in total, with 2 failures, both in `features/external-mcp/__tests__/access-choice.postgres.test.ts`, which needs Postgres. The container has none. LCOV from the 4 batches was merged per line, keeping the max hit count. Analysis script: `raw/10-analyze.py.txt`.

**Test selection was capped.** 1,022 test files import a listed file directly or through one re-export, which would not fit the 1-hour cap at concurrency 1. Each listed file got its 3 path-nearest importing tests, 222 unique tests in total. Map: `raw/07-tovu-file-to-tests.tsv`. The full importer map: `raw/07-tovu-file-to-all-importing-tests.tsv`. Every listed Tovu file with an importing test was measured, but **Tovu numbers are a lower bound**. `server/runtime/composition/app.ts`, for example, has 447 importing tests and only 3 of them ran.

**4. Moved files.** Each added Jini file was matched to the Tovu file at combine (deleted or modified between combine and the tip) that shares the most normalized code lines. A match needs ≥3 shared lines and ≥25% of the Jini file's lines (`raw/09-moved-jini-to-tovu-match.tsv`). 104 of the 153 added Jini files matched a Tovu source. The other 49 are new code or splits. No committed coverage *artifact* (lcov or json) for real source exists at combine in either repo. Jini has only test fixtures. The committed *result* that covers these paths is Tovu's `ADS-memory/reports/2026-10-16-sweep-c2/COVERAGE.md`, a table of every file below 100% lines+branches, plus its `NEVER-LOADED.txt`. That result was measured on 2026-10-16 and committed in `7d299e5f` (2026-11-03). Combine's suites were not run.

Each old path falls in one of four cases: in that table (its lines %), never loaded, present but in neither list (which implies 100% lines+branches then), or not existing when the sweep ran. Totals: 46 below 100%, 50 at 100%, 2 never loaded, 6 with no result (`raw/09-moved-old-path-committed-coverage.tsv`). The mapping table is at the end of this report.

## Where these numbers can mislead

- **Jini files tested only from Tovu.** Jini's numbers count only Jini's own suite. When Tovu tests reach Jini code through the `link:jini` symlinks, they load **`dist/*.js`**, not `src/*.ts`. That coverage lands on the compiled file (paths like `../Jini/packages/<pkg>/dist/...` in Tovu's LCOV), not on the source file in this table. The last column of the below-target table shows those `dist` hits as hit/total compiled lines, from the capped Tovu selection only. It is indicative, not a line-for-line equivalent.
- **Re-export barrels and shims.** Index barrels and Tovu shims such as `export { restoreFromSnapshot } from "@jini-ai/db/data-modules"` are excluded as re-export only. Where a listed file is counted, it was reached through at most one re-export hop for Tovu. A barrel at 100% says only that it was imported.
- **Different line definitions.** Jini lines are lines with a statement start (v8 → istanbul). Tovu lines are Node `--experimental-test-coverage` LCOV lines, which include comments and blank lines inside a range. Tovu's own README warns that tsx LCOV positions are instrumented indices, not exact source line anchors. Tovu uncovered ranges can therefore start on a comment line. Treat them as approximate locations. Line counts are not comparable across the two repos.
- **Coverage is not assertions.** A file at 100% here was executed, not necessarily checked. The agent-plugins and db runs include failing tests, whose executions still count.
- **Tovu lower bound.** Each Tovu file was measured with at most 3 tests, so heavily imported files such as `deps.ts` and `app.ts` would probably score higher on a full run.
- **Moved-file history.** The sweep-c2 result predates combine by about three weeks. "Present but not in the table" assumes the sweep measured every file then present, as its header says. It does not cover files the sweep excluded.


## The 15 worst files: what the uncovered lines do

Ranked by uncovered line count; the full row for each is in the table below.

1. `jini packages/integrations/src/api-connections/hosted-mcp/sign-in.ts` (549 uncovered): almost all of the OAuth sign-in flow for an external-MCP connection: start, callback, token exchange, refresh and error mapping. Jini's suite loads only the module constants. Tovu tests hit 862/889 lines of its `dist` build.
2. `jini packages/mcp/src/federation/hosted/store.ts` (442): fallback and error branches of the external-MCP roster store. These are the malformed-JSON column fallbacks, shared and per-server OAuth token resolution, the refresh and re-auth-required failures, and row update paths.
3. `jini packages/plugins/src/host/tools/management.ts` (425, 0%): the plugin-management agent tools (list, enable, disable, configure for runtime and agent plugins, with permission and workspace gating). The Jini suite never loads it. Tovu hits 597/605 `dist` lines.
4. `jini packages/integrations/src/credentialed-http/tools/tool-registrations.ts` (391, 0%): credential tool orchestration, covering the write-permission gate, DELETE handling and provider request adapters. Never loaded in Jini. Tovu hits 627/729 `dist` lines.
5. `jini packages/db/src/data-modules/data-module.ts` (389, 0%): the core-mediated plugin dataModule DDL engine (declare, migrate, snapshot, restore). Never loaded in Jini. Tovu hits 830/837 `dist` lines.
6. `jini packages/agent-plugins/src/connect/connect-tool.ts` (310, 0%): the `agent_plugin_connect` tool with its shared host sign-in flow, connect defaults and error replies. Tovu hits 422/426 `dist` lines.
7. `jini packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts` (285): registers each active Agent Plugin as one tool, with skill and file argument handling. Everything except the module setup is uncovered in Jini. Tovu hits 480/482 `dist` lines.
8. `tovu apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (225, 86.4%): host-only paths of the slim agent daemon's site scope. These include attachment batch limits, per-run tool-access revocation and cleanup failures, no-tools notices and the setup error branches. Line anchors are approximate (tsx LCOV).
9. `jini packages/integrations/src/api-connections/host.ts` (206): the per-workspace host that composes the api-connections service with vault stores (service lookup, record store, fresh access token). Only module setup ran in Jini. Tovu hits 312/320 `dist` lines.
10. `jini packages/devops/src/deploy/ops-runner.ts` (195): deploy-ops tool runner, covering the 300s deadline, cancellation, response-size capping and module pause or poll handling. Tovu hits 343/343 `dist` lines.
11. `jini packages/plugins/src/host/node/runtime-core.ts` (192, 55.8%): the error and conflict paths of the plugin runtime core. These are boot-time conflict quarantine, re-attach failures, provider admission refusals and the reload and source wiring.
12. `jini packages/agent-plugins/src/connect/access-token-tool.ts` (156, 0%): the `agent_plugin_set_access_token` fallback (probe URL check, token storage, error replies). Tovu hits 209/213 `dist` lines.
13. `tovu apps/website/src/server/runtime/composition/deps.ts` (151, 95.2%): host-only composition-root branches, such as site-key keyrings for non-memory databases, runtime-mode and site-binding variants, and optional dependency fallbacks. This file was measured with only 3 of its 61 importing tests.
14. `jini packages/cms/src/core/commands/revert.ts` (138, 0%): the change-set revert executor (descending-position walk, per-item undo, conflict errors). Tovu hits 136/136 `dist` lines.
15. `jini packages/agent-plugins/src/connect/federate-mcp.ts` (184 lines, 128 uncovered): turning a plugin's planned MCP servers into connection rows. The uncovered part covers row building, existing-row reuse and the rollback and failure branches.

## Files below 100% lines (111), sorted by uncovered line count

| # | repo | path | lines | covered % | uncovered | uncovered line ranges | Tovu-run hits on Jini `dist` .js (indicative) |
|---:|---|---|---:|---:|---:|---|---|
| 1 | jini | `packages/integrations/src/api-connections/hosted-mcp/sign-in.ts` | 571 | 3.9 | 549 | 77-80,83-90,94-103,108-110,146-153,157-170,177-180,183-190,203-213,218-232,252-254,264-273,283-295,310-312,331-335,350-368,374,376-380,387-390,399-406,408-414,416-421,441-451,453-454,457-459,463-465,467-475,487-490,498-501,509,513-521,532-536,544-547,550-556,565-567,571-573,583,586-597,602-608,611-619,621-626,628-631,684-689,691-692,694-697,703-713,720-734,738-745,747-748,750,752-760,774-781,784-789,791-799,801-804,806,809-810,812-820,822-826,828-834,836-840,843-846,848,850-865,870-873,877-900,902-906,908-920,924-928,931-933,935-945,947-955,957-965,968-975,977-982,985-986,988-993,996,1009,1012-1024,1026-1033,1038-1047 | 862/889 |
| 2 | jini | `packages/mcp/src/federation/hosted/store.ts` | 947 | 53.3 | 442 | 94-103,109-110,112-121,150-154,158-162,170-171,181-182,184-185,194-198,200-208,231-233,239-240,253-263,324-330,447-453,492-499,511-526,529-536,538-543,570-571,574-580,595-602,604-612,614-625,627-631,669-670,685-686,696-697,748-768,773-777,781-783,806-807,812-816,825-829,843-848,852-864,877-887,957-969,985-994,1015-1027,1038-1051,1053-1060,1062-1066,1077-1082,1084-1098,1102-1105,1116,1137-1138,1153-1157,1172-1180,1199-1202,1214,1232-1249,1282-1283,1285-1286,1334-1337,1363-1366,1388-1391,1403-1408,1411-1413,1415-1424,1452-1453,1456-1462,1469-1472,1497,1522-1526,1528-1532,1557-1559,1562-1563,1571-1572,1580-1581,1665-1670 | 1322/1441 |
| 3 | jini | `packages/plugins/src/host/tools/management.ts` | 425 | 0.0 | 425 | 1,29,47,49-52,56-69,77-78,80,82,84-85,94-98,102-110,134-135,137-149,151-165,170-185,194-213,221-230,233-245,250-253,255-259,275-284,297-301,306,310-313,318-323,327-329,334-347,353-365,372-384,393-405,414-420,428-430,433,435,437-476,478-490,495-497,501-503,507,509-512,527-528,531-535,541-543,546-553,578-585,588-590,594,596-600,607-609,612-618,631-633,636-640,642,645-649,660-666,669-673,675-689,696-704,707-714,725-729,731,733,735,737-747,750-755 | 597/605 |
| 4 | jini | `packages/integrations/src/credentialed-http/tools/tool-registrations.ts` | 391 | 0.0 | 391 | 1,41-43,89-100,119-121,145,152-161,164-166,174,186-193,208-217,223,236-243,256,259-260,262-268,303-305,307,315-316,319-329,337-340,346-361,399-408,453-456,458-468,489-500,516-521,524-539,547,551-552,558-564,566-571,573-587,589-597,599-602,610-612,620-624,631-634,644-652,654-671,673-679,687,692-694,696-701,706-723,731-733,737-742,744-748,750-755,766-771,776-779,781-782,789-795,797-799,805-813,817,820-821,824-837,840-847,851-859,864-867,869-873,876-879,881-888 | 627/729 |
| 5 | jini | `packages/db/src/data-modules/data-module.ts` | 389 | 0.0 | 389 | 1,336-337,339-345,347,356,373-378,380-381,391-400,405-412,415-421,424-428,439-446,453-458,461-463,465-470,473-483,485-489,519-522,530-534,536,538-543,546,548-551,558,560-564,566-567,577,579-584,586-587,597-603,606-607,615-629,632-637,654-668,677-697,700-714,722-729,743-757,760-770,773-785,792-796,799-802,811-814,817-828,835-848,851-852,854-859,862-876,879-882,893-894,896-898,900-901,915-917,919-924,928-936,938-940,944-948,953,963,965-968,975-989,1000-1010,1012,1014-1015 | 830/837 |
| 6 | jini | `packages/agent-plugins/src/connect/connect-tool.ts` | 310 | 0.0 | 310 | 1,53,58,73-79,82-84,95-102,104,106-112,114-127,270-291,294-298,312-315,321-334,336-340,369-376,382-383,387-409,415-418,435-436,439-442,444,446-449,451-458,462-464,466-469,472-478,480-483,485-487,491-505,508,510-518,523,526-561,564,566-575,578-579,588-602,605-606,611-625,636-639,641-669 | 422/426 |
| 7 | jini | `packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts` | 290 | 1.7 | 285 | 42-48,53-55,60-66,72-75,92-107,111,113,166-171,173-176,180,183-192,202-207,211-215,217-218,223-236,249,252-254,258-261,267-268,270,276-277,279-280,282-283,285-290,295-301,306-307,314-330,332-335,341-351,365-369,371-378,380-381,383-386,497-500,503-504,507-512,514-517,530-541,561-570,572-577,579-585,587-588,592-599,616-625,628-640,643-646,649-651,654-661,665-666,668-669,671-676,678-683 | 480/482 |
| 8 | tovu | `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` | 1650 | 86.4 | 225 | 105-106,113-114,118,137,142,147-148,180-189,196,199-201,220-246,265-267,286-288,298,304,308-310,313-339,360,366-370,383-385,419,452-465,469,477,513-522,524-535,537-547,550-558,560-568,579-588,593,603-607,612-623,625-629,639-644,656-659,662-664,667,680-687,698-700,721-722 | n/a |
| 9 | jini | `packages/integrations/src/api-connections/host.ts` | 208 | 1.0 | 206 | 42-44,47-49,52-54,57-60,63-65,67-69,72-74,79-81,90-98,101-104,106-108,111-113,121-125,127-128,132,134,137,140-148,151-155,157-160,163-166,174-184,187-191,194-197,204-205,207-217,219-222,225-227,230-243,246-249,258-273,281-297,300-302,305-313,315-324,326-339,341-343 | 312/320 |
| 10 | jini | `packages/devops/src/deploy/ops-runner.ts` | 212 | 8.0 | 195 | 16-21,34-36,40-51,53-59,62-72,75-82,85-93,100-102,104-108,110-130,151-161,165-168,171-181,192-208,210,214-220,223-226,232-243,245-251,253-255,257-260,262-266,277-294,297-302 | 343/343 |
| 11 | jini | `packages/plugins/src/host/node/runtime-core.ts` | 434 | 55.8 | 192 | 101-106,108-109,155,159-170,424,448-452,469-470,504-505,535-536,543-544,558,572-577,591-593,601-602,620-628,630-634,638-647,650-665,670-674,676-679,682-685,688-690,692-698,703-707,709-711,714-719,722-739,747-748,755-756,760-761,766,773-776,781-782,784-788,792-802,806,810-813,818-824,836-838,841-846 | 515/612 |
| 12 | jini | `packages/agent-plugins/src/connect/access-token-tool.ts` | 156 | 0.0 | 156 | 1,118-122,141-148,156-168,178-183,185-192,194-200,206-213,215-218,227-231,233-249,253-258,266-267,270-274,276-289,291-294,297-302,314-329,331-351 | 209/213 |
| 13 | tovu | `apps/website/src/server/runtime/composition/deps.ts` | 3120 | 95.2 | 151 | 360,386,498,501-502,538-542,561,580,583-587,694-696,709,722,747-762,765-768,770-771,782-785,795,799-801,816-817,825,827,856,877,882,898-900,938,982,1037-1039,1066-1067,1101-1105,1113-1114,1239,1247,1255-1256,1261,1263,1265-1266,1276-1277,1293-1298,1311,1332-1333,1336,1352,1388,1390-1396,1400-1402,1404,1408-1410,1412-1434,1436-1437,1444-1453,1472-1474,1487 | n/a |
| 14 | jini | `packages/cms/src/core/commands/revert.ts` | 138 | 0.0 | 138 | 1,34-36,43-52,57,60-74,105-110,116-121,124-130,132,135-139,141,143,146-152,156-164,166-171,173-185,187-188,190-193,195-207,212-216,218-225,227,229-241 | 136/136 |
| 15 | jini | `packages/agent-plugins/src/connect/federate-mcp.ts` | 184 | 30.4 | 128 | 237-238,240-244,246-250,256-260,264-265,298,319,326-327,331-340,356-357,365,372-375,412-414,419-431,436-440,448,452,456-459,481-485,491-494,503-513,519-521,543-551,554,556-562,566-568,571-572,577-584,586-587,589-594 | 440/440 |
| 16 | jini | `packages/devops/src/deploy/ops-secrets.ts` | 134 | 5.2 | 127 | 26-28,30-34,37-46,48-51,54-59,62-64,77-83,86-93,95-99,101-109,112-117,120-123,125-131,134-137,139-142,154-173,176-180,192-208 | 221/221 |
| 17 | jini | `packages/agent-plugins/src/admin-surfaces/connections/connections.ts` | 116 | 0.0 | 116 | 1,30-33,36-40,44,47-53,56-58,61-68,74-78,80-84,87-90,93-95,101-108,110-115,117-164,166-173 | 133/135 |
| 18 | jini | `packages/agent-plugins/src/connect/plugin-host/index.ts` | 113 | 0.0 | 113 | 1,156-159,162-165,174-176,179-181,183-201,203-205,209-217,219-221,225-245,247-252,255-264,267-272,275-295 | 152/152 |
| 19 | jini | `packages/integrations/src/credentialed-http/sets/store.ts` | 262 | 57.6 | 111 | 103-106,120-123,145,147-154,173-174,194-195,200-201,203-204,211-226,242-246,251-254,271-278,287-291,298,303-304,339-340,355,358-359,423,425-431,434,436-441,448-453,466-469,471-472,478-482,490,492-495,535-536,551 | 459/489 |
| 20 | jini | `packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts` | 148 | 30.4 | 103 | 184-186,190-194,196-197,199-201,211-220,222-223,234-240,244,246-247,254-260,263-264,278-287,289-296,312,316-332,334-340,342-357 | 277/282 |
| 21 | jini | `packages/integrations/src/api-connections/connect.ts` | 103 | 2.9 | 100 | 51-54,75-81,83-86,89-92,116-123,128-142,145-151,153-157,159-164,167-173,180-185,188-197,205-210,212-222 | 142/142 |
| 22 | tovu | `apps/website/src/server/runtime/composition/modules/assistant-byok.ts` | 829 | 88.9 | 92 | 52,121,129-134,137-138,144,146,155-172,179,198,229,236-241,247,251-252,254-268,278,296-304,310-313,316-334,359-360 | n/a |
| 23 | jini | `packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts` | 255 | 64.3 | 91 | 120-131,136-145,204-208,210-214,217-227,230-232,234-238,240-253,255-261,265-266,280,316-319,322-328,330-334 | 60/293 |
| 24 | tovu | `apps/website/src/server/runtime/composition/app.ts` | 2677 | 96.7 | 88 | 446,449,458,479-485,496,498,502,507-508,523-526,529-533,543-547,549,572,589,667,703-712,757-760,763-775,850,918-919,951,975,979-980,999-1003,1034-1035,1064-1066,1093-1100,1282,1292-1293 | n/a |
| 25 | jini | `packages/integrations/src/credentialed-http/tools/credential-copy-tool.ts` | 83 | 0.0 | 83 | 1,25,27-36,39-47,50-54,57,59-64,72,74-100,104-117,119-126 | 105/111 |
| 26 | jini | `packages/agent-plugins/src/connect/executable/register.ts` | 81 | 0.0 | 81 | 1,29-35,49-60,62-69,71-80,83-94,96-103,105-111,114-129 | 125/125 |
| 27 | jini | `packages/agent-plugins/src/connect/import-access-token.ts` | 80 | 0.0 | 80 | 1,52-53,60-66,69-74,76-79,96-107,130-136,146-148,152-161,163-168,173-179,182-193,195-197 | 103/103 |
| 28 | jini | `packages/db/src/data-modules/migration-journal.ts` | 79 | 0.0 | 79 | 1,30,33-38,40-55,58-74,91-99,102-109,112-121,124,131-140 | 90/90 |
| 29 | jini | `packages/agent-plugins/src/connect/apply-tool-renames.ts` | 78 | 0.0 | 78 | 1,50-58,65-69,73-74,82-101,104-105,112-133,143-151,153-160 | 105/105 |
| 30 | jini | `packages/db/src/data-modules/plugin-identity.ts` | 78 | 0.0 | 78 | 1,50-63,65-83,86-99,101-104,111-117,119-137 | 101/101 |
| 31 | jini | `packages/devops/src/deploy/ops-tools.ts` | 82 | 8.5 | 75 | 10-15,17-21,23-30,32-38,46-69,71-78,82-98 | 110/117 |
| 32 | jini | `packages/plugins/src/host/tools/source.ts` | 71 | 0.0 | 71 | 1,5,9,11-15,25-37,45-63,65-69,71-73,76-91,95-101 | 95/95 |
| 33 | jini | `packages/agent-plugins/src/admin-surfaces/plugin-state.ts` | 73 | 8.2 | 67 | 47-50,53-59,70-74,77-80,83-85,89-93,95-97,102-114,116-124,126-139 | 106/106 |
| 34 | tovu | `apps/website/src/features/api-connections/vault-stores.ts` | 253 | 74.7 | 64 | 50,58-59,88-93,96-100,102-124,127-131,134-137,139-156 | n/a |
| 35 | jini | `packages/agent-plugins/src/connect/grant-signed-in-defaults.ts` | 62 | 0.0 | 62 | 1,66-68,73-81,87-91,101-106,108-121,125-128,138-139,146-163 | 97/100 |
| 36 | jini | `packages/agent-plugins/src/connect/executable/host-capabilities.ts` | 61 | 0.0 | 61 | 31-32,34-37,40-49,57-58,60-62,66-72,74-75,82-84,91-97,100-104,117-118,122-130,132-133,135-137 | 100/100 |
| 37 | jini | `packages/agent-plugins/src/connect/connect-card-ui.ts` | 60 | 0.0 | 60 | 31-38,66-68,84-99,114,119-139,148,153-162 | 106/106 |
| 38 | jini | `packages/agent-plugins/src/lifecycle/mail/selection.ts` | 57 | 1.8 | 56 | 19-31,33-34,38-43,45,49-62,65,67-79,81-82,84-85,87-88 | 86/86 |
| 39 | jini | `packages/agent-plugins/src/lifecycle/mail/catalog.ts` | 56 | 1.8 | 55 | 37,39-41,43-48,51-57,63-69,71-77,85-92,96-105,107-110,113-114 | 72/72 |
| 40 | jini | `packages/agent-plugins/src/lifecycle/mail/contribution.ts` | 57 | 3.5 | 55 | 53-59,72-75,83-86,89-92,95-100,107-115,117-119,127-142,144-145 | 115/115 |
| 41 | jini | `packages/agent-plugins/src/lifecycle/host-tools/memory-tools.ts` | 56 | 3.6 | 54 | 10-19,27-60,62-71 | 63/63 |
| 42 | jini | `packages/plugins/src/host/tools/install.ts` | 54 | 0.0 | 54 | 1,8-11,15,17-23,27,29-37,45-71,74-75,79-80 | 71/71 |
| 43 | jini | `packages/cms/src/core/commands/repo.memory.ts` | 51 | 0.0 | 51 | 10-13,18-22,24-31,33-38,40-42,44-45,47,50-56,58,60-64,66-71,73-75 | 40/46 |
| 44 | jini | `packages/agent-plugins/src/connect/connection-status.ts` | 50 | 0.0 | 50 | 19,24-31,34-36,39-43,46-49,52,54-58,60,62-68,70,73-80,82,84-88 | 58/63 |
| 45 | jini | `packages/devops/src/deploy/ops-secret-card.ts` | 47 | 2.1 | 46 | 8-18,20-30,32-51,53-56 | 62/62 |
| 46 | jini | `packages/agent-plugins/src/lifecycle/mail/configuration.ts` | 42 | 2.4 | 41 | 20-22,25-27,30-36,39-43,45-57,63-70,72-73 | 62/62 |
| 47 | jini | `packages/integrations/src/credentialed-http/sets/vault-repo.ts` | 107 | 62.6 | 40 | 67-69,88-96,109-110,113-115,120-127,129-134,136-144 | 147/147 |
| 48 | jini | `packages/mcp/src/federation/hosted/connection-gate.ts` | 42 | 4.8 | 40 | 70-80,83-85,91-95,101-108,116-123,130-134 | 107/107 |
| 49 | jini | `packages/mcp/src/federation/hosted/store.memory.ts` | 108 | 63.0 | 40 | 98-99,115-123,126-130,132-139,146-150,153-157,160-165 | 147/149 |
| 50 | jini | `packages/agent-plugins/src/connect/connect-destination.ts` | 33 | 0.0 | 33 | 1,17-23,30,35-58 | 45/45 |
| 51 | jini | `packages/agent-plugins/src/connect/credential-cards.ts` | 33 | 0.0 | 33 | 1,9-12,17-32,37-47,50 | 49/49 |
| 52 | jini | `packages/agent-plugins/src/connect/plugin-credential-card.ts` | 37 | 10.8 | 33 | 17,19-26,29-36,39-43,46-47,50,52-54,57-60,67 | 61/63 |
| 53 | jini | `packages/agent-plugins/src/connect/token-sign-in.ts` | 33 | 0.0 | 33 | 1,24-25,28-29,35-36,41-50,60-61,71-84 | 43/43 |
| 54 | jini | `packages/agent-plugins/src/connect/apply-connect-defaults.ts` | 68 | 52.9 | 32 | 104-105,115,122,133,135-140,142-144,148,150-156,164,168-176 | 113/113 |
| 55 | jini | `packages/db/src/data-modules/snapshot.ts` | 32 | 0.0 | 32 | 1,38-43,45-48,50-52,61-66,68-73,100-105 | 94/94 |
| 56 | jini | `packages/agent-plugins/src/lifecycle/host-tools/write-note-tool.ts` | 35 | 14.3 | 30 | 9-15,25-47 | 47/47 |
| 57 | jini | `packages/agent-plugins/src/connect/credential-save-tool.ts` | 115 | 74.8 | 29 | 97-99,109-112,116-119,121-125,127,129-130,132-134,149-150,181,184-187 | 156/156 |
| 58 | jini | `packages/core/src/text/descriptor-i18n.ts` | 35 | 17.1 | 29 | 32-35,37-45,47-49,52-64 | 65/65 |
| 59 | jini | `packages/agent-plugins/src/connect/executable/approval.ts` | 27 | 0.0 | 27 | 22-24,45-68 | 40/40 |
| 60 | jini | `packages/agent-plugins/src/lifecycle/host-tools/identity.ts` | 31 | 16.1 | 26 | 17-22,33-38,48-61 | 58/58 |
| 61 | jini | `packages/db/src/data-modules/disk-headroom.ts` | 24 | 0.0 | 24 | 1,26,28-30,32-35,43-45,47-49,51-57,59-60 | 44/44 |
| 62 | jini | `packages/db/src/data-modules/migration-recovery.ts` | 23 | 0.0 | 23 | 1,25,45,48-52,54-60,63-66,69-72 | 62/62 |
| 63 | jini | `packages/platform/src/mail/provider-mailer.ts` | 24 | 8.3 | 22 | 10-20,22-32 | 31/31 |
| 64 | jini | `packages/mcp/src/federation/hosted/revocation.ts` | 36 | 50.0 | 18 | 76-78,85-92,109-115 | 78/78 |
| 65 | jini | `packages/cms/src/core/commands/appliers.ts` | 16 | 0.0 | 16 | 36-37,45-58 | 13/13 |
| 66 | jini | `packages/platform/src/mail/plugin-abi.ts` | 19 | 15.8 | 16 | 6-7,10-15,19-26 | 21/21 |
| 67 | tovu | `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts` | 297 | 94.9 | 15 | 24-29,73-75,128-129,132-133,137,153 | n/a |
| 68 | jini | `packages/plugins/src/host/declarative-content-types.ts` | 211 | 92.9 | 15 | 122-124,200-202,355-357,389-390,393-394,434-435 | 270/270 |
| 69 | jini | `packages/plugins/src/host/capability-tools.ts` | 209 | 93.3 | 14 | 375-376,629-635,638-640,666-667 | 304/306 |
| 70 | jini | `packages/agent-plugins/src/connect/connect-sign-in-wait.ts` | 13 | 0.0 | 13 | 1,14,19-29 | 21/21 |
| 71 | jini | `packages/agent-plugins/src/connect/switch-on-saved-token.ts` | 13 | 0.0 | 13 | 47-52,54-55,57-58,60-62 | 20/20 |
| 72 | jini | `packages/agent-plugins/src/lifecycle/mail/adapter-descriptors.ts` | 106 | 88.7 | 12 | 86-87,167-169,172-175,177-179 | 153/155 |
| 73 | jini | `packages/db/src/data-modules/restore.ts` | 12 | 0.0 | 12 | 1,33-43 | 42/42 |
| 74 | jini | `packages/mcp/src/federation/hosted/vault.ts` | 84 | 86.9 | 11 | 106-109,117-123 | 106/106 |
| 75 | jini | `packages/integrations/src/api-connections/declarations.ts` | 110 | 91.8 | 9 | 68-70,76-78,101-103 | 171/178 |
| 76 | tovu | `apps/website/src/features/form-destinations/registry.ts` | 108 | 92.6 | 8 | 12,14-15,27,44-47 | n/a |
| 77 | tovu | `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts` | 284 | 97.2 | 8 | 48-55 | n/a |
| 78 | jini | `packages/daemon/src/agent-executor/launch.ts` | 822 | 99.0 | 8 | 830,900,947,1082,1099,1150,1618-1619 | 415/1322 |
| 79 | jini | `packages/integrations/src/api-connections/budgets.ts` | 60 | 86.7 | 8 | 30-32,40-41,57-59 | 87/87 |
| 80 | tovu | `apps/website/src/features/agent-plugins/connect-tool.ts` | 205 | 96.6 | 7 | 80-85,98 | n/a |
| 81 | tovu | `apps/website/src/features/site-backup/import-database.ts` | 104 | 93.3 | 7 | 20-23,47,49-50 | n/a |
| 82 | jini | `packages/devops/src/deploy/ops-registry.ts` | 9 | 22.2 | 7 | 6-12 | 12/12 |
| 83 | jini | `packages/plugins/src/host/tools/contract.ts` | 7 | 0.0 | 7 | 1,4-9 | - |
| 84 | tovu | `apps/website/src/cli/commands/serve.ts` | 491 | 98.8 | 6 | 50,123-127 | n/a |
| 85 | tovu | `apps/website/src/features/agent-plugins/lifecycle.ts` | 255 | 97.6 | 6 | 34-35,45,61,104,147 | n/a |
| 86 | tovu | `apps/website/src/features/custom-credentials/tool-registrations.ts` | 498 | 98.8 | 6 | 69-71,171,181,183 | n/a |
| 87 | tovu | `apps/website/src/server/runtime/composition/plugin-host.ts` | 105 | 94.3 | 6 | 46,48-52 | n/a |
| 88 | jini | `packages/agent-plugins/src/connect/enable-access.ts` | 53 | 88.7 | 6 | 52-53,85-86,88-89 | 74/74 |
| 89 | jini | `packages/agent-plugins/src/lifecycle/mail/host-mailer.ts` | 8 | 25.0 | 6 | 7-12 | 10/10 |
| 90 | jini | `packages/db/src/data-modules/plugin-store.ts` | 6 | 0.0 | 6 | 46-49,51-52 | 6/6 |
| 91 | jini | `packages/devops/src/deploy/target-descriptors.ts` | 193 | 96.9 | 6 | 94-95,174-175,236-237 | 273/273 |
| 92 | tovu | `apps/website/src/features/agent-plugins/tool-registrations.ts` | 158 | 97.5 | 4 | 64-67 | n/a |
| 93 | tovu | `apps/website/src/features/api-connections/contribution.ts` | 81 | 95.1 | 4 | 31-34 | n/a |
| 94 | tovu | `apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts` | 63 | 95.2 | 3 | 21-23 | n/a |
| 95 | tovu | `apps/website/src/features/deployments/deploy-config-registry.ts` | 175 | 98.3 | 3 | 78-79,84 | n/a |
| 96 | jini | `packages/agent-plugins/src/lifecycle/metadata.ts` | 62 | 95.2 | 3 | 75-77 | 73/80 |
| 97 | tovu | `apps/website/src/features/agent-plugins/access-token-tool.ts` | 132 | 98.5 | 2 | 15,57 | n/a |
| 98 | tovu | `apps/website/src/features/agent-plugins/connect-sign-in-wait.ts` | 35 | 94.3 | 2 | 13-14 | n/a |
| 99 | tovu | `apps/website/src/features/deployments/deploy-ops/run-ops.ts` | 95 | 97.9 | 2 | 62-63 | n/a |
| 100 | tovu | `apps/website/src/features/external-mcp/external-mcp-store.ts` | 74 | 97.3 | 2 | 36-37 | n/a |
| 101 | tovu | `apps/website/src/features/site-backup/import-backend.ts` | 189 | 98.9 | 2 | 87,89 | n/a |
| 102 | tovu | `apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts` | 161 | 98.8 | 2 | 82-83 | n/a |
| 103 | tovu | `apps/website/src/server/runtime/boot/bootstrap.ts` | 375 | 99.5 | 2 | 24-25 | n/a |
| 104 | tovu | `apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts` | 94 | 97.9 | 2 | 20,23 | n/a |
| 105 | jini | `packages/devops/src/deploy/config-descriptors.ts` | 62 | 96.8 | 2 | 53-54 | 92/92 |
| 106 | jini | `packages/platform/src/mail/provider-setup.ts` | 87 | 97.7 | 2 | 128-129 | 139/144 |
| 107 | jini | `packages/ui/src/features/mcp-ui/surfaces/fields.ts` | 50 | 96.0 | 2 | 82-83 | 76/86 |
| 108 | tovu | `apps/website/src/features/agent-plugins/capability-projection.ts` | 129 | 99.2 | 1 | 7 | n/a |
| 109 | tovu | `apps/website/src/features/api-connections/browser-binding.ts` | 69 | 98.6 | 1 | 20 | n/a |
| 110 | tovu | `apps/website/src/features/deployments/deploy-config.ts` | 374 | 99.7 | 1 | 25 | n/a |
| 111 | tovu | `apps/website/src/server/runtime/composition/plugin-runtime.ts` | 109 | 99.1 | 1 | 20 | n/a |

## Files at 100% lines (183)

| repo | path | lines | covered % | uncovered | uncovered line ranges |
|---|---|---:|---:|---:|---|
| jini | `packages/agent-plugins/src/core/identity-namespace.ts` | 63 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/folder-zip-node.ts` | 124 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/automatic-use.ts` | 175 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/capability-projection.ts` | 63 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/credential-card-metadata.ts` | 119 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts` | 31 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/install.ts` | 301 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/installed-package-index.ts` | 82 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/manifest.ts` | 247 | 100.0 | 0 | — |
| jini | `packages/agent-plugins/src/lifecycle/persistent-state.ts` | 28 | 100.0 | 0 | — |
| jini | `packages/agent-runtime/src/defs/claude.ts` | 141 | 100.0 | 0 | — |
| jini | `packages/cms/src/content-types/types.ts` | 15 | 100.0 | 0 | — |
| jini | `packages/cms/src/forms/destination-descriptors.ts` | 66 | 100.0 | 0 | — |
| jini | `packages/cms/src/forms/sql/repo.rows.ts` | 56 | 100.0 | 0 | — |
| jini | `packages/commerce/src/catalog-tools.ts` | 64 | 100.0 | 0 | — |
| jini | `packages/commerce/src/tools.ts` | 29 | 100.0 | 0 | — |
| jini | `packages/cookie-consent/src/contracts/consent-file.ts` | 41 | 100.0 | 0 | — |
| jini | `packages/daemon/src/agent-executor/contracts.ts` | 16 | 100.0 | 0 | — |
| jini | `packages/daemon/src/tool-executor.ts` | 341 | 100.0 | 0 | — |
| jini | `packages/daemon/src/tool-recovery/redaction.ts` | 86 | 100.0 | 0 | — |
| jini | `packages/daemon/src/tool-recovery/stack.ts` | 13 | 100.0 | 0 | — |
| jini | `packages/devops/src/deploy/ops-descriptors.ts` | 52 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/access-token.ts` | 67 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/attempt-state.ts` | 53 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/authorization.ts` | 91 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/byo-client.ts` | 20 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/deps.ts` | 7 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/descriptor.ts` | 85 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/finish-authorization.ts` | 89 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/hook-http.ts` | 15 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/hosted-sign-in.ts` | 34 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/index.ts` | 7 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/install-credential.ts` | 13 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/request-checks.ts` | 51 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/token-store/record.ts` | 75 | 100.0 | 0 | — |
| jini | `packages/integrations/src/api-connections/token-store/vault-token-store.ts` | 151 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/adapter.http.ts` | 250 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/config.ts` | 22 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/access.ts` | 61 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/auth.ts` | 15 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/projections.ts` | 9 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/unconfigured-error.ts` | 6 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/validation-error.ts` | 11 | 100.0 | 0 | — |
| jini | `packages/mcp/src/federation/hosted/vocabulary.ts` | 2 | 100.0 | 0 | — |
| jini | `packages/oauth/src/authorization-code.ts` | 161 | 100.0 | 0 | — |
| jini | `packages/oauth/src/device-code.ts` | 93 | 100.0 | 0 | — |
| jini | `packages/oauth/src/discovery-policy.ts` | 29 | 100.0 | 0 | — |
| jini | `packages/oauth/src/discovery.ts` | 170 | 100.0 | 0 | — |
| jini | `packages/oauth/src/errors.ts` | 62 | 100.0 | 0 | — |
| jini | `packages/oauth/src/flow-operations.ts` | 6 | 100.0 | 0 | — |
| jini | `packages/oauth/src/messages.ts` | 6 | 100.0 | 0 | — |
| jini | `packages/oauth/src/pending-authorizations.ts` | 88 | 100.0 | 0 | — |
| jini | `packages/oauth/src/protocol-error-codes.ts` | 8 | 100.0 | 0 | — |
| jini | `packages/oauth/src/refresh.ts` | 166 | 100.0 | 0 | — |
| jini | `packages/oauth/src/registration.ts` | 107 | 100.0 | 0 | — |
| jini | `packages/oauth/src/registry.ts` | 85 | 100.0 | 0 | — |
| jini | `packages/oauth/src/sealed-state.ts` | 60 | 100.0 | 0 | — |
| jini | `packages/oauth/src/token-endpoint.ts` | 107 | 100.0 | 0 | — |
| jini | `packages/platform/src/fetch-with-timeout.ts` | 184 | 100.0 | 0 | — |
| jini | `packages/platform/src/http/guarded/client.ts` | 187 | 100.0 | 0 | — |
| jini | `packages/platform/src/http/guarded/transport.fetch.ts` | 94 | 100.0 | 0 | — |
| jini | `packages/platform/src/mail/adapter-module.ts` | 6 | 100.0 | 0 | — |
| jini | `packages/platform/src/mail/provider.ts` | 61 | 100.0 | 0 | — |
| jini | `packages/platform/src/object-store/descriptors.ts` | 52 | 100.0 | 0 | — |
| jini | `packages/platform/src/secrets/credential-sets/vault.types.ts` | 38 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/admin-response.ts` | 25 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/manifest.ts` | 312 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/node/archive-policy.ts` | 73 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/node/install.ts` | 326 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/node/invocation-binding.ts` | 39 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/node/source-drafts.ts` | 256 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/plugin-claims.ts` | 123 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/plugin-format.ts` | 18 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/plugin-tool-errors.ts` | 6 | 100.0 | 0 | — |
| jini | `packages/plugins/src/host/worker/start.ts` | 15 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/cards.ts` | 4 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/credential-card.ts` | 29 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/secret-card.ts` | 122 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/bridge.ts` | 14 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/confirmation.ts` | 146 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/document.ts` | 89 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/form.ts` | 81 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/outcome.ts` | 59 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/select.ts` | 22 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/structured-details.ts` | 118 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/text-input.ts` | 58 | 100.0 | 0 | — |
| jini | `packages/ui/src/features/mcp-ui/surfaces/tokens.ts` | 80 | 100.0 | 0 | — |
| jini | `packages/user-management/src/server/login-providers.ts` | 49 | 100.0 | 0 | — |
| jini | `packages/user-management/src/server/login-types.ts` | 8 | 100.0 | 0 | — |
| tovu | `apps/website/src/assistant/batch-tool-inputs.ts` | 153 | 100.0 | 0 | — |
| tovu | `apps/website/src/assistant/tool-search-keywords.ts` | 159 | 100.0 | 0 | — |
| tovu | `apps/website/src/contracts/core/commands/appliers.ts` | 6 | 100.0 | 0 | — |
| tovu | `apps/website/src/contracts/core/hosted-sign-in-links.ts` | 6 | 100.0 | 0 | — |
| tovu | `apps/website/src/contracts/core/plugin-credential-card.ts` | 11 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/apply-connect-defaults.ts` | 78 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/apply-tool-renames.ts` | 36 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts` | 204 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/card-host-bindings.ts` | 14 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/connect-card-ui.ts` | 35 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/connect-destination.ts` | 21 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/connection-status.ts` | 15 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/descriptor-i18n.ts` | 22 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/enable-access.ts` | 33 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/executable-tools/approval-bindings.ts` | 7 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/executable-tools/approval.ts` | 9 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts` | 96 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/executable-tools/register.ts` | 9 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/exports/source.ts` | 70 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/federate-mcp.ts` | 67 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/host-signals.ts` | 83 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/import-access-token.ts` | 63 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/mail-adapter-registry.ts` | 40 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/mcp-host-bindings.ts` | 43 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/memory-tools.ts` | 17 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` | 151 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/provider-plugin-link.ts` | 128 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/supersession.ts` | 140 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/switch-on-saved-token.ts` | 55 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/token-sign-in.ts` | 31 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/agent-plugins/write-note-tool.ts` | 28 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/budgets.ts` | 36 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/byo-client.ts` | 36 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/connect.ts` | 16 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/host-bindings.ts` | 83 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/host.ts` | 14 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/oauth-bindings.ts` | 19 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/plugin-state-bindings.ts` | 13 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/plugin-state.ts` | 11 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/surface-connection-bindings.ts` | 44 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/api-connections/surface-connections.ts` | 14 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/consent/region-plugins.ts` | 88 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/credential-copy-tool.ts` | 62 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/credential-ports.ts` | 79 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/credential-save-tool.ts` | 12 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/plugin-credential-card.ts` | 6 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/store.ts` | 135 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/tovu-credential-card-identity.ts` | 18 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/types.ts` | 84 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/custom-credentials/vault-repo.ts` | 37 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-ops/registry.ts` | 99 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-ops/secrets.ts` | 8 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts` | 65 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts` | 24 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-targets/host-kit.ts` | 151 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/deployments/deploy-targets/registry.ts` | 159 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/external-mcp/external-mcp-oauth.ts` | 168 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/external-mcp/external-mcp-revocation.ts` | 38 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/external-mcp/external-mcp-store.memory.ts` | 10 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/external-mcp/external-mcp-vault.ts` | 45 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/media/chat-preview.ts` | 34 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/member-login/providers.ts` | 65 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/object-storage/registry.ts` | 122 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/admin-response.ts` | 38 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/agent-plugin-tool-binding.ts` | 52 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/capability-tool-registrations.ts` | 129 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/declarative-content-types.ts` | 89 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/enable-confirmation-ui.ts` | 80 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/host-tool-binding.ts` | 54 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/install-archive.ts` | 46 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/install-tool-binding.ts` | 23 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/install-tool-catalog.ts` | 27 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/install-tool.ts` | 44 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/invocation-core-deps.ts` | 52 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/provider-status-tool.ts` | 12 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/source-tool-catalog.ts` | 40 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/source-tools.ts` | 16 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugin-runtime/tool-registrations.ts` | 73 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/disk-headroom.ts` | 4 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/migration-journal.ts` | 11 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/migration-recovery.ts` | 5 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/plugin-identity.ts` | 4 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/plugin-store.ts` | 4 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/plugins/snapshot.ts` | 5 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/site-backup/import-backend-steps.ts` | 164 | 100.0 | 0 | — |
| tovu | `apps/website/src/features/site-backup/import-registry.ts` | 149 | 100.0 | 0 | — |
| tovu | `apps/website/src/platform/mail/purpose-scoped-mailer.ts` | 31 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts` | 82 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` | 310 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/runtime/boot/mail-provider-catalog.ts` | 118 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/runtime/boot/mail-provider-configuration.ts` | 6 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/runtime/composition/domain-dns-adapters.ts` | 189 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/runtime/composition/site-mailer.ts` | 110 | 100.0 | 0 | — |
| tovu | `apps/website/src/server/runtime/plugin-tier2/worker.ts` | 63 | 100.0 | 0 | — |

## Files not measured (30)

| repo | path | reason |
|---|---|---|
| jini | `packages/agent-plugins/src/connect/executable/ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/agent-plugins/src/connect/ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/agent-plugins/src/lifecycle/host-tools/ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/agent-plugins/src/lifecycle/ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/agent-runtime/src/types.ts` | not in coverage report: no test in the package suite loaded it (or outside the config include) |
| jini | `packages/cms/src/forms/destination-contracts.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/core/src/contracts/cards.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/core/src/contracts/credentials.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/core/src/contracts/mail/adapter-module.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/core/src/contracts/mail/ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/core/src/contracts/oauth/flow.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/devops/src/deploy/config-contracts.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/devops/src/deploy/ops-tool-contracts.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/devops/src/deploy/target-contracts.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/api-connections/host-ports.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/api-connections/hosted-mcp/contracts.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/api-connections/oauth-capabilities.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/credentialed-http/sets/host.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/credentialed-http/tools/credential-tool-host.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/integrations/src/credentialed-http/tools/credential-tool-operations.ts` | 0 executable lines (v8 found no statements) |
| jini | `packages/mcp/src/federation/hosted/store-ports.ts` | 0 executable lines (v8 found no statements) |
| tovu | `apps/website/src/features/agent-plugins/customize-tool.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/agent-plugins/host-tool-ports.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/agent-plugins/service-ports.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/api-connections/connect-bindings.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/custom-credentials/tovu-credential-sets.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/plugin-runtime/plugin-tool-ids.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/features/site-backup/import-keep-off.ts` | no test imports it directly or through one re-export |
| tovu | `apps/website/src/server/routes/types.ts` | no test imports it directly or through one re-export |

## Moved files: Jini file → old Tovu path at combine (7cf9658e5) and the committed result for it

Committed result source: Tovu `ADS-memory/reports/2026-10-16-sweep-c2/COVERAGE.md` (table of files below 100% lines+branches) and `NEVER-LOADED.txt`, both present at combine. No committed coverage artifact (lcov/json) for real source exists in either repo at combine; Jini has only test fixtures.

| Jini file | old Tovu path at combine | committed result for old path | Jini lines % now |
|---|---|---|---|
| `packages/agent-plugins/src/admin-surfaces/connections/connections.ts` | `apps/website/src/features/api-connections/surface-connections.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/admin-surfaces/plugin-state.ts` | `apps/website/src/features/api-connections/plugin-state.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 8.2 |
| `packages/agent-plugins/src/connect/access-token-tool.ts` | `apps/website/src/features/agent-plugins/access-token-tool.ts` | sweep-c2: lines 95.9%, branches 74.3%, 12 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/apply-connect-defaults.ts` | `apps/website/src/features/agent-plugins/apply-connect-defaults.ts` | sweep-c2: lines 100.0%, branches 82.6%, 0 uncovered lines | 52.9 |
| `packages/agent-plugins/src/connect/apply-tool-renames.ts` | `apps/website/src/features/agent-plugins/apply-tool-renames.ts` | sweep-c2: lines 98.3%, branches 75.0%, 2 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/connect-card-ui.ts` | `apps/website/src/features/agent-plugins/connect-card-ui.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/connect-destination.ts` | `apps/website/src/features/agent-plugins/connect-destination.ts` | no committed result (file did not exist at sweep-c2) | 0.0 |
| `packages/agent-plugins/src/connect/connect-tool.ts` | `apps/website/src/features/agent-plugins/connect-tool.ts` | sweep-c2: lines 99.5%, branches 89.0%, 2 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/connection-status.ts` | `apps/website/src/features/agent-plugins/connection-status.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/credential-cards.ts` | `apps/website/src/features/agent-plugins/credential-cards.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/credential-save-tool.ts` | `apps/website/src/features/custom-credentials/credential-save-tool.ts` | sweep-c2: lines 100.0%, branches 75.0%, 0 uncovered lines | 74.8 |
| `packages/agent-plugins/src/connect/enable-access.ts` | `apps/website/src/features/agent-plugins/enable-access.ts` | no committed result (file did not exist at sweep-c2) | 88.7 |
| `packages/agent-plugins/src/connect/executable/approval.ts` | `apps/website/src/features/agent-plugins/executable-tools/approval.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/executable/host-capabilities.ts` | `apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/executable/ports.ts` | `apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | not measured |
| `packages/agent-plugins/src/connect/executable/register.ts` | `apps/website/src/features/agent-plugins/executable-tools/register.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/agent-plugins/src/connect/federate-mcp.ts` | `apps/website/src/features/agent-plugins/federate-mcp.ts` | sweep-c2: lines 99.4%, branches 67.5%, 3 uncovered lines | 30.4 |
| `packages/agent-plugins/src/connect/grant-signed-in-defaults.ts` | `apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts` | no committed result (file did not exist at sweep-c2) | 0.0 |
| `packages/agent-plugins/src/connect/import-access-token.ts` | `apps/website/src/features/agent-plugins/import-access-token.ts` | sweep-c2: lines 98.8%, branches 68.3%, 2 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/plugin-credential-card.ts` | `apps/website/src/features/custom-credentials/plugin-credential-card.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 10.8 |
| `packages/agent-plugins/src/connect/plugin-host/index.ts` | `apps/website/src/server/runtime/composition/plugin-host.ts` | sweep-c2: lines 99.3%, branches 69.3%, 1 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/switch-on-saved-token.ts` | `apps/website/src/features/agent-plugins/switch-on-saved-token.ts` | sweep-c2: lines 100.0%, branches 79.4%, 0 uncovered lines | 0.0 |
| `packages/agent-plugins/src/connect/token-sign-in.ts` | `apps/website/src/features/agent-plugins/token-sign-in.ts` | sweep-c2: lines 100.0%, branches 95.7%, 0 uncovered lines | 0.0 |
| `packages/agent-plugins/src/lifecycle/credential-card-metadata.ts` | `apps/website/src/features/agent-plugins/credential-cards.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/agent-plugins/src/lifecycle/host-tools/identity.ts` | `apps/website/src/features/agent-plugins/identity.ts` | sweep-c2: lines 100.0%, branches 75.0%, 0 uncovered lines | 16.1 |
| `packages/agent-plugins/src/lifecycle/host-tools/memory-tools.ts` | `apps/website/src/features/agent-plugins/memory-tools.ts` | sweep-c2: lines 93.9%, branches 96.0%, 3 uncovered lines | 3.6 |
| `packages/agent-plugins/src/lifecycle/host-tools/provider-status-tool.ts` | `apps/website/src/features/plugin-runtime/provider-status-tool.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts` | `apps/website/src/features/agent-plugins/tool-registrations.ts` | sweep-c2: lines 99.1%, branches 80.6%, 9 uncovered lines | 30.4 |
| `packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts` | `apps/website/src/features/agent-plugins/tool-registrations.ts` | sweep-c2: lines 99.1%, branches 80.6%, 9 uncovered lines | 1.7 |
| `packages/agent-plugins/src/lifecycle/host-tools/write-note-tool.ts` | `apps/website/src/features/agent-plugins/write-note-tool.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 14.3 |
| `packages/agent-plugins/src/lifecycle/mail/adapter-descriptors.ts` | `apps/website/src/features/agent-plugins/mail-adapter-registry.ts` | sweep-c2: lines 100.0%, branches 67.5%, 0 uncovered lines | 88.7 |
| `packages/agent-plugins/src/lifecycle/mail/catalog.ts` | `apps/website/src/server/runtime/boot/mail-provider-catalog.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 1.8 |
| `packages/agent-plugins/src/lifecycle/mail/configuration.ts` | `apps/website/src/server/runtime/boot/mail-provider-configuration.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 2.4 |
| `packages/agent-plugins/src/lifecycle/mail/contribution.ts` | `apps/website/src/features/agent-plugins/mail-adapter-registry.ts` | sweep-c2: lines 100.0%, branches 67.5%, 0 uncovered lines | 3.5 |
| `packages/agent-plugins/src/lifecycle/mail/selection.ts` | `apps/website/src/server/runtime/composition/site-mailer.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 1.8 |
| `packages/cms/src/core/commands/appliers.ts` | `apps/website/src/contracts/core/commands/appliers.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/cms/src/core/commands/repo.memory.ts` | `apps/website/src/contracts/core/commands/repo.memory.ts` | sweep-c2: lines 100.0%, branches 90.2%, 0 uncovered lines | 0.0 |
| `packages/cms/src/core/commands/revert.ts` | `apps/website/src/contracts/core/commands/revert.ts` | sweep-c2: lines 100.0%, branches 68.3%, 0 uncovered lines | 0.0 |
| `packages/cms/src/forms/destination-contracts.ts` | `apps/website/src/features/form-destinations/types.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | not measured |
| `packages/cms/src/forms/destination-descriptors.ts` | `apps/website/src/features/form-destinations/registry.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/cookie-consent/src/contracts/consent-file.ts` | `apps/website/src/features/consent/region-plugins.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/core/src/contracts/content-types.ts` | `apps/admin/src/lib/api.ts` | sweep-c2: lines 91.1%, branches 88.2%, 32 uncovered lines | types/re-export only |
| `packages/core/src/contracts/hosted-mcp/config.ts` | `apps/website/src/features/external-mcp/contracts.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | types/re-export only |
| `packages/core/src/contracts/hosted-mcp/record.ts` | `apps/website/src/features/external-mcp/contracts.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | types/re-export only |
| `packages/core/src/contracts/hosted-mcp/vocabulary.ts` | `apps/website/src/features/external-mcp/contracts.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | types/re-export only |
| `packages/core/src/contracts/vault/vendor-credential-sets.ts` | `apps/admin/src/lib/api.ts` | sweep-c2: lines 91.1%, branches 88.2%, 32 uncovered lines | types/re-export only |
| `packages/core/src/text/descriptor-i18n.ts` | `apps/website/src/features/agent-plugins/descriptor-i18n.ts` | sweep-c2: lines 100.0%, branches 75.0%, 0 uncovered lines | 17.1 |
| `packages/db/src/data-modules/data-module.ts` | `apps/website/src/features/plugins/data-module.ts` | sweep-c2: lines 99.8%, branches 76.0%, 2 uncovered lines | 0.0 |
| `packages/db/src/data-modules/disk-headroom.ts` | `apps/website/src/features/plugins/disk-headroom.ts` | sweep-c2: lines 100.0%, branches 64.3%, 0 uncovered lines | 0.0 |
| `packages/db/src/data-modules/migration-journal.ts` | `apps/website/src/features/plugins/migration-journal.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/db/src/data-modules/migration-recovery.ts` | `apps/website/src/features/plugins/migration-recovery.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/db/src/data-modules/plugin-identity.ts` | `apps/website/src/features/plugins/plugin-identity.ts` | sweep-c2: lines 100.0%, branches 94.7%, 0 uncovered lines | 0.0 |
| `packages/db/src/data-modules/plugin-store.ts` | `apps/website/src/features/plugins/plugin-store.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/db/src/data-modules/restore.ts` | `apps/website/src/features/plugins/restore.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 0.0 |
| `packages/db/src/data-modules/snapshot.ts` | `apps/website/src/features/plugins/snapshot.ts` | sweep-c2: lines 100.0%, branches 84.6%, 0 uncovered lines | 0.0 |
| `packages/devops/src/deploy/config-contracts.ts` | `apps/website/src/features/deployments/deploy-config.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | not measured |
| `packages/devops/src/deploy/config-descriptors.ts` | `apps/website/src/features/deployments/deploy-config-registry.ts` | sweep-c2: lines 100.0%, branches 72.1%, 0 uncovered lines | 96.8 |
| `packages/devops/src/deploy/ops-contracts.ts` | `apps/website/src/features/deployments/deploy-ops/types.ts` | sweep-c2: NEVER LOADED (0%) | types/re-export only |
| `packages/devops/src/deploy/ops-descriptors.ts` | `apps/website/src/features/deployments/deploy-ops/registry.ts` | sweep-c2: lines 97.9%, branches 78.0%, 3 uncovered lines | 100.0 |
| `packages/devops/src/deploy/ops-registry.ts` | `apps/website/src/features/deployments/deploy-ops/registry.ts` | sweep-c2: lines 97.9%, branches 78.0%, 3 uncovered lines | 22.2 |
| `packages/devops/src/deploy/ops-runner.ts` | `apps/website/src/features/deployments/deploy-ops/run-ops.ts` | sweep-c2: lines 98.4%, branches 88.4%, 4 uncovered lines | 8.0 |
| `packages/devops/src/deploy/ops-secret-card.ts` | `apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts` | sweep-c2: lines 98.5%, branches 85.2%, 1 uncovered lines | 2.1 |
| `packages/devops/src/deploy/ops-secrets.ts` | `apps/website/src/features/deployments/deploy-ops/secrets.ts` | sweep-c2: lines 100.0%, branches 89.6%, 0 uncovered lines | 5.2 |
| `packages/devops/src/deploy/ops-tools.ts` | `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts` | sweep-c2: lines 95.2%, branches 89.8%, 7 uncovered lines | 8.5 |
| `packages/devops/src/deploy/target-contracts.ts` | `apps/website/src/features/deployments/deploy-targets/types.ts` | sweep-c2: NEVER LOADED (0%) | not measured |
| `packages/devops/src/deploy/target-descriptors.ts` | `apps/website/src/features/deployments/deploy-targets/registry.ts` | sweep-c2: lines 98.4%, branches 67.7%, 5 uncovered lines | 96.9 |
| `packages/integrations/src/api-connections/budgets.ts` | `apps/website/src/features/api-connections/budgets.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 86.7 |
| `packages/integrations/src/api-connections/byo-client.ts` | `apps/website/src/features/api-connections/byo-client.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/integrations/src/api-connections/connect.ts` | `apps/website/src/features/api-connections/connect.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 2.9 |
| `packages/integrations/src/api-connections/declarations.ts` | `apps/website/src/features/api-connections/contribution.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 91.8 |
| `packages/integrations/src/api-connections/hook-http.ts` | `apps/website/src/features/api-connections/hook-http.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/integrations/src/api-connections/host.ts` | `apps/website/src/features/api-connections/host.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 1.0 |
| `packages/integrations/src/api-connections/hosted-mcp/contracts.ts` | `apps/website/src/features/external-mcp/contracts.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | not measured |
| `packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts` | `apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts` | no committed result (file did not exist at sweep-c2) | 64.3 |
| `packages/integrations/src/api-connections/hosted-mcp/sign-in.ts` | `apps/website/src/features/external-mcp/external-mcp-oauth.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 3.9 |
| `packages/integrations/src/credentialed-http/sets/store.ts` | `apps/website/src/features/custom-credentials/store.ts` | sweep-c2: lines 96.3%, branches 62.9%, 15 uncovered lines | 57.6 |
| `packages/integrations/src/credentialed-http/sets/vault-repo.ts` | `apps/website/src/features/custom-credentials/vault-repo.ts` | sweep-c2: lines 98.8%, branches 75.2%, 1 uncovered lines | 62.6 |
| `packages/integrations/src/credentialed-http/tools/credential-copy-tool.ts` | `apps/website/src/features/custom-credentials/credential-copy-tool.ts` | sweep-c2: lines 100.0%, branches 89.1%, 0 uncovered lines | 0.0 |
| `packages/integrations/src/credentialed-http/tools/tool-registrations.ts` | `apps/website/src/features/custom-credentials/tool-registrations.ts` | sweep-c2: lines 99.9%, branches 89.5%, 1 uncovered lines | 0.0 |
| `packages/mcp/src/federation/hosted/access.ts` | `apps/website/src/contracts/core/external-mcp-access.ts` | no committed result (file did not exist at sweep-c2) | 100.0 |
| `packages/mcp/src/federation/hosted/auth.ts` | `apps/website/src/contracts/core/external-mcp-auth.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/mcp/src/federation/hosted/connection-gate.ts` | `apps/website/src/features/external-mcp/external-mcp-oauth.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 4.8 |
| `packages/mcp/src/federation/hosted/revocation.ts` | `apps/website/src/features/external-mcp/external-mcp-revocation.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 50.0 |
| `packages/mcp/src/federation/hosted/store.memory.ts` | `apps/website/src/features/external-mcp/external-mcp-store.memory.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 63.0 |
| `packages/mcp/src/federation/hosted/store.ts` | `apps/website/src/features/external-mcp/external-mcp-store.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 53.3 |
| `packages/mcp/src/federation/hosted/unconfigured-error.ts` | `apps/website/src/features/external-mcp/external-mcp-store.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/mcp/src/federation/hosted/validation-error.ts` | `apps/website/src/contracts/core/external-mcp-access.ts` | no committed result (file did not exist at sweep-c2) | 100.0 |
| `packages/mcp/src/federation/hosted/vault.ts` | `apps/website/src/features/external-mcp/external-mcp-vault.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 86.9 |
| `packages/platform/src/mail/plugin-abi.ts` | `apps/website/src/platform/mail/purpose-scoped-mailer.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 15.8 |
| `packages/platform/src/mail/provider-mailer.ts` | `apps/website/src/server/runtime/boot/mail-provider-catalog.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 8.3 |
| `packages/platform/src/mail/provider-setup.ts` | `apps/website/src/features/agent-plugins/mail-provider-setup.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 97.7 |
| `packages/platform/src/object-store/descriptors.ts` | `apps/website/src/features/object-storage/registry.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/plugins/src/host/admin-response.ts` | `apps/website/src/features/plugin-runtime/admin-response.ts` | sweep-c2: lines 100.0%, branches 84.6%, 0 uncovered lines | 100.0 |
| `packages/plugins/src/host/capability-tools.ts` | `apps/website/src/features/plugin-runtime/capability-tool-registrations.ts` | sweep-c2: lines 100.0%, branches 79.8%, 0 uncovered lines | 93.3 |
| `packages/plugins/src/host/declarative-content-types.ts` | `apps/website/src/features/plugin-runtime/declarative-content-types.ts` | sweep-c2: lines 100.0%, branches 98.5%, 0 uncovered lines | 92.9 |
| `packages/plugins/src/host/node/archive-policy.ts` | `apps/website/src/features/plugin-runtime/install-archive.ts` | sweep-c2: lines 100.0%, branches 76.4%, 0 uncovered lines | 100.0 |
| `packages/plugins/src/host/node/invocation-binding.ts` | `apps/website/src/features/plugin-runtime/invocation-core-deps.ts` | sweep-c2: lines 100.0%, branches 88.6%, 0 uncovered lines | 100.0 |
| `packages/plugins/src/host/node/runtime-core.ts` | `apps/website/src/server/runtime/composition/plugin-runtime.ts` | sweep-c2: lines 98.4%, branches 57.4%, 10 uncovered lines | 55.8 |
| `packages/plugins/src/host/tools/management.ts` | `apps/website/src/features/plugin-runtime/tool-registrations.ts` | sweep-c2: lines 95.7%, branches 62.3%, 35 uncovered lines | 0.0 |
| `packages/plugins/src/host/tools/source.ts` | `apps/website/src/features/plugin-runtime/source-tools.ts` | sweep-c2: lines 98.4%, branches 92.1%, 2 uncovered lines | 0.0 |
| `packages/plugins/src/host/worker/start.ts` | `apps/website/src/server/runtime/plugin-tier2/worker.ts` | sweep-c2: lines 100.0%, branches 92.9%, 0 uncovered lines | 100.0 |
| `packages/ui/src/features/mcp-ui/credential-card.ts` | `apps/website/src/contracts/core/plugin-credential-card.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/user-management/src/server/login-providers.ts` | `apps/website/src/features/member-login/providers.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |
| `packages/user-management/src/server/login-types.ts` | `apps/website/src/features/member-login/types.ts` | sweep-c2: 100% lines+branches (absent from below-100 table) | 100.0 |

Added Jini files with no matching Tovu source at combine (new code, not moved; 49): `packages/agent-plugins/src/admin-surfaces/connections/index.ts`, `packages/agent-plugins/src/admin-surfaces/connections/ports.ts`, `packages/agent-plugins/src/admin-surfaces/plugin-state-persistence.ts`, `packages/agent-plugins/src/connect/connect-sign-in-wait.ts`, `packages/agent-plugins/src/connect/executable/index.ts`, `packages/agent-plugins/src/connect/index.ts`, `packages/agent-plugins/src/connect/ports.ts`, `packages/agent-plugins/src/lifecycle/host-tools/index.ts`, `packages/agent-plugins/src/lifecycle/host-tools/ports.ts`, `packages/agent-plugins/src/lifecycle/mail/host-mailer.ts`, `packages/agent-plugins/src/lifecycle/mail/index.ts`, `packages/agent-plugins/src/lifecycle/metadata.ts`, `packages/cms/src/core/commands/index.ts`, `packages/core/src/contracts/cards.ts`, `packages/core/src/contracts/credentials.ts`, `packages/core/src/contracts/hosted-mcp.ts`, `packages/core/src/contracts/mail.ts`, `packages/core/src/contracts/mail/adapter-module.ts`, `packages/core/src/contracts/mail/engine-contracts.ts`, `packages/core/src/contracts/mail/ports.ts`, `packages/core/src/contracts/mail/provider.ts`, `packages/core/src/contracts/oauth.ts`, `packages/core/src/contracts/oauth/details.ts`, `packages/core/src/contracts/oauth/flow.ts`, `packages/core/src/contracts/vault.ts`, `packages/core/src/contracts/vault/ports.ts`, `packages/core/src/contracts/vault/records.ts`, `packages/core/src/surface-cards.ts`, `packages/db/src/data-modules/index.ts`, `packages/devops/src/deploy/ops-tool-contracts.ts`, `packages/integrations/src/api-connections/host-ports.ts`, `packages/integrations/src/api-connections/hosted-mcp/index.ts`, `packages/integrations/src/api-connections/oauth-capabilities.ts`, `packages/integrations/src/credentialed-http/sets/host.ts`, `packages/integrations/src/credentialed-http/sets/index.ts`, `packages/integrations/src/credentialed-http/tools/credential-tool-host.ts`, `packages/integrations/src/credentialed-http/tools/credential-tool-operations.ts`, `packages/integrations/src/credentialed-http/tools/index.ts`, `packages/mcp/src/federation/hosted/index.ts`, `packages/mcp/src/federation/hosted/projections.ts`, `packages/mcp/src/federation/hosted/store-ports.ts`, `packages/mcp/src/federation/hosted/vocabulary.ts`, `packages/oauth/src/flow-operations.ts`, `packages/oauth/src/protocol-error-codes.ts`, `packages/plugins/src/host/plugin-tool-errors.ts`, `packages/plugins/src/host/tools/contract.ts`, `packages/plugins/src/host/tools/index.ts`, `packages/plugins/src/host/tools/install.ts`, `packages/ui/src/features/mcp-ui/cards.ts`

## Files excluded as types or re-exports only (not measured by design)

- jini `packages/agent-plugins/src/admin-surfaces/connections/index.ts`
- jini `packages/agent-plugins/src/admin-surfaces/connections/ports.ts`
- jini `packages/agent-plugins/src/admin-surfaces/index.ts`
- jini `packages/agent-plugins/src/admin-surfaces/plugin-state-persistence.ts`
- jini `packages/agent-plugins/src/connect/executable/index.ts`
- jini `packages/agent-plugins/src/connect/index.ts`
- jini `packages/agent-plugins/src/lifecycle/host-tools/index.ts`
- jini `packages/agent-plugins/src/lifecycle/mail/index.ts`
- jini `packages/cms/src/core/commands/index.ts`
- jini `packages/cms/src/forms/index.ts`
- jini `packages/cookie-consent/src/plugins.ts`
- jini `packages/core/src/contracts/content-types.ts`
- jini `packages/core/src/contracts/hosted-mcp.ts`
- jini `packages/core/src/contracts/hosted-mcp/config.ts`
- jini `packages/core/src/contracts/hosted-mcp/record.ts`
- jini `packages/core/src/contracts/hosted-mcp/vocabulary.ts`
- jini `packages/core/src/contracts/mail.ts`
- jini `packages/core/src/contracts/mail/engine-contracts.ts`
- jini `packages/core/src/contracts/mail/provider.ts`
- jini `packages/core/src/contracts/oauth.ts`
- jini `packages/core/src/contracts/oauth/details.ts`
- jini `packages/core/src/contracts/vault.ts`
- jini `packages/core/src/contracts/vault/ports.ts`
- jini `packages/core/src/contracts/vault/records.ts`
- jini `packages/core/src/contracts/vault/vendor-credential-sets.ts`
- jini `packages/core/src/index.ts`
- jini `packages/core/src/primitives/http.ts`
- jini `packages/core/src/surface-cards.ts`
- jini `packages/core/src/text/index.ts`
- jini `packages/db/src/data-modules/index.ts`
- jini `packages/devops/src/deploy/index.ts`
- jini `packages/devops/src/deploy/ops-contracts.ts`
- jini `packages/integrations/src/api-connections/hosted-mcp/index.ts`
- jini `packages/integrations/src/api-connections/ports.ts`
- jini `packages/integrations/src/credentialed-http/sets/index.ts`
- jini `packages/integrations/src/credentialed-http/tools/index.ts`
- jini `packages/mcp/src/federation/hosted/index.ts`
- jini `packages/oauth/src/args.ts`
- jini `packages/oauth/src/index.ts`
- jini `packages/oauth/src/ports.ts`
- jini `packages/platform/src/mail/engine-contracts.ts`
- jini `packages/platform/src/mail/index.ts`
- jini `packages/platform/src/mail/ports.ts`
- jini `packages/platform/src/mail/types.ts`
- jini `packages/platform/src/object-store/index.ts`
- jini `packages/platform/src/secrets/credential-sets/types.ts`
- jini `packages/platform/src/secrets/ports.ts`
- jini `packages/platform/src/secrets/types.ts`
- jini `packages/plugins/src/host/index.ts`
- jini `packages/plugins/src/host/node/index.ts`
- jini `packages/plugins/src/host/tools/index.ts`
- jini `packages/plugins/src/host/worker/index.ts`
- jini `packages/user-management/src/server/index.ts`
- tovu `apps/website/src/contracts/core/commands/index.ts`
- tovu `apps/website/src/contracts/core/commands/repo.memory.ts`
- tovu `apps/website/src/contracts/core/commands/revert.ts`
- tovu `apps/website/src/contracts/core/external-mcp-access.ts`
- tovu `apps/website/src/contracts/core/external-mcp-auth.ts`
- tovu `apps/website/src/features/agent-plugins/credential-cards.ts`
- tovu `apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts`
- tovu `apps/website/src/features/agent-plugins/identity.ts`
- tovu `apps/website/src/features/agent-plugins/mail-provider-setup.ts`
- tovu `apps/website/src/features/agent-plugins/mcp-metadata.ts`
- tovu `apps/website/src/features/api-connections/hook-http.ts`
- tovu `apps/website/src/features/custom-credentials/credential-tool-host.ts`
- tovu `apps/website/src/features/custom-credentials/credential-tool-operations.ts`
- tovu `apps/website/src/features/custom-credentials/index.ts`
- tovu `apps/website/src/features/custom-credentials/sets/host.ts`
- tovu `apps/website/src/features/custom-credentials/sets/store.ts`
- tovu `apps/website/src/features/custom-credentials/sets/vault-repo.ts`
- tovu `apps/website/src/features/deployments/deploy-ops/types.ts`
- tovu `apps/website/src/features/deployments/deploy-targets/types.ts`
- tovu `apps/website/src/features/external-mcp/contracts.ts`
- tovu `apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts`
- tovu `apps/website/src/features/form-destinations/types.ts`
- tovu `apps/website/src/features/member-login/types.ts`
- tovu `apps/website/src/features/plugins/data-module.ts`
- tovu `apps/website/src/features/plugins/index.ts`
- tovu `apps/website/src/features/plugins/restore.ts`

EXTRACT-COV DONE
