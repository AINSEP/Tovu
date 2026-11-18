REJECT

| Claim checked | Result |
|---|---|
| Base and prerequisites (`DESIGN:4,280–292`) | **REPRODUCED**. `git merge-base` and `git rev-list --left-right --count` give `ada11733` and `0/16`. E2 is ancestral. R7/R8 leave both roots untouched. `size02-step5` is `210ba2396`, with `73d5d31a` ancestral. The memory root remains at `app.ts:216`, with a 10-line companion. |
| Counts, ranges, edges and importers (`DESIGN:21–151`) | **REPRODUCED**. Ran all four census scripts against Git blobs with TypeScript 5.9.3. Every TSV row matched, including name-based edges. Independent token counting gave 3,036 physical lines and 1,910/1,195/68 code lines. The census confirmed 308 imports, 37 other module statements, 215 closure statements, 68 importer files and 167 text-only mentions. `git grep` confirmed 17 logger constructions, eight local uses and the unexported `pluginsInstallDir` import. |
| Writes and awaits (`DESIGN:103,151,203,244`) | **REPRODUCED**. Nine root awaits, including the conditional owner await. The tenth census match is nested in the orphan wrapper. **WRONG**. `awk -F '\t' '$2=="write"' work/literal-keys.tsv` gives five forms writes and 15 writes to 14 keys overall. The literal has 260 entries, seven spreads. |
| Budget (`sheets/INDEX:6–23`) | **WRONG**. `awk -F'|' '$5~/[0-9]+k/{s+=$5} END{print s}'` gives 2,160k. Largest sheet is 240k. |
| Gate and freeze proofs (`REVISION-2:28–50`) | **WRONG** as a fail-closed guarantee. `bash -n` passes and the transcript contains 18 cases. The candidate, baseline and rebase failures below are outside those cases. **UNVERIFIABLE** whether the recorded runs reproduce end to end. |

### Blockers

1. **S0 and S4 have deterministic STOPs.** `S0:9,16` requires the import-cycle tip to be ancestral to terra and branches from terra. `git merge-base --is-ancestor origin/refactor/import-cycle-b origin/refactor/terra` returns **1**. `S4:29` also forbids `_required: Record<string, never>` on the retained public factory at `deps.ts:830–832`, which `DESIGN:268` preserves. Pin and branch from `f0613d9e`. Scope the placeholder check to converted helpers.

2. **The sheet-end gate runs against stale evidence.** `COMMON:71–74,118` runs `sheet-end` before refreshing the TSVs. `gates.sh:102–110,379–383` requires byte equality, so S1's deletion of the re-export at `deps.ts:398` already fails. Required lane merges can invalidate the same comparison before a sheet starts. Refresh and verify the TSVs in the gated change that alters them. Also fix the debt command at `COMMON:96–101`: `size-debt.json:1–3,1257–1269` stores rows in `.violations` and names the identity field `function`. The proposed `rows.filter` throws.

3. **The gate proofs miss the candidate.** `gates.sh:236–238,368–376` runs why-comments before commit, but `check-why-comments.mjs:60–61,77–82` diffs committed `HEAD`. The plant at `S0:26` commits its deletion first, proving a different path. `gates.sh:89` also masks a failed lookup inside `echo` (shell probe returned 0), and `:208–209` discards baseline runner statuses. Pass the candidate as `--head`, validate baseline exits and complete TAP, and plant failures through the actual commit path. `S2:22` also accepts inventory findings because `check-capability-inventory.ts:42–47` deliberately exits zero.

4. **The freeze can be bypassed in normal execution.** `COMMON:55–61` rebases after gating and pushes the unchecked result. `INDEX:27` ends checks at S13, though `SEQUENCE:19–20,103` holds the freeze through H1 step 5. `gates.sh:142,147–177` omits `wave1` and `fix/*` and checks listed tips only after an exclusive hit. `git diff $(git merge-base f0613d9e origin/fix/vendor-names-out-of-core) origin/fix/vendor-names-out-of-core -- "$D/deps.ts"` exposes an omitted ref touching the chart import at base `deps.ts:315`. `origin/refactor/size-02-app` also edits S12's `serving-app-boot-wiring.unit.test.ts` and S11's moved test, absent from its `INDEX:38` row. Reconcile lane ownership and SHAs at integration, recheck after rebases, and enforce through step 5.

### Major

- **Two characterization pins demand different behavior.** `S0:35` and `S6:17` must probe a fresh activation on the same runtime after the host is set. Jini `runtime-core.ts:523–529` chooses whether to install `sdk.plugins` when building each SDK. The Tovu fixture at `plugin-host.integration.test.ts:79–93` changes metadata on an already-bound host. `S0:36` also requires swapping tracker assignment and flush to turn red, but `deps.ts:1887–1888` flushes through explicit `tracker`. The source-order assertion can detect the swap. Use an emitted event to prove behavioral routing.
- **S5 changes or obscures order and scope.** `S5:3,8–9` keeps `kernel` in the root but groups the calls on either side of `store.content` into one stage. `deps.ts:964–1001` reads it after theme seeding. Keep the stage boundary there. `COMMON:117` also broadens the body-only SQLite check to all `site-deps` files, including `open-store.ts`, where `deps.ts:697` legitimately uses `db`. Apply the original assertion only to extracted composition bodies.
- **Coverage remains partial.** `gates.sh:186,244–273,313–328,368–382` omits the CI hook rule and per-commit build, and its cognitive ratchet excludes tests (`complexity-eslint.config.mjs:20–27`). `S8:17` calls a feature test “wide” that neither test set includes. `S4:30–34` also accepts ESLint's exit 1 and ignores fatal JSON diagnostics. Restore the named coverage, reject fatal diagnostics, and run the build at the required commit boundary.

### Minor

- `S7:20` promises registration teardown order. `deps.ts:701–705` runs registrations concurrently. Pin registration placement and the drain/sweep/close barriers.
- `S12:7` specifies two error logs. `deps.ts:2726,2730` uses one `info` and one `error`. Preserve both levels.

### Over-engineering

- `S4:10` splits the 43-line adapter Map (`deps.ts:1464–1515`) before moving it. First try the existing Map in one compliant slice. Keep its identity for the theme update.
- `DESIGN:234` adds `composeEarlyStages` over five already-named composition calls. Measure the root first and keep direct calls wherever the limits permit.

**Could not check** full builds, runtime parity, future lane activity, or the real planted-failure transcript. The contextual typing, late-read, direct-repointing and shared outbound-owner revisions address prior design issues on paper. Review used approximately 40k tokens and nine minutes.
