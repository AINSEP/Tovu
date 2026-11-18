REJECT

| Claim checked | Result |
|---|---|
| Base and prerequisites (`DESIGN:4,285–295`) | **REPRODUCED.** Tovu `b5fbf2a5`, Jini `6c9effae`. Import-cycle-b is 16 commits ahead and 242 behind terra. E2, publish P0, and size02-step5 are ancestors. `app.ts` has 374 lines, with the memory factory at 128 and outbound call at 282. `wave3/import-cycle-b-2` is absent from the fetched refs. |
| Census, edges, importers (`DESIGN:29–50,73–154`) | **REPRODUCED.** All four census TSVs matched row for row using TypeScript 5.9.3 and Git blobs, including the scripts’ name-based edges. 3,036 lines, 305 imports, 37 other module statements, 215 closure statements, 68 importer files, 171 text-only mentions. All 27 explicitly named test paths exist. `git grep` confirms 17 production logger calls and the unexported `pluginsInstallDir` import. |
| Ranges and behavior counts (`DESIGN:34,139,247`) | **WRONG.** `awk -F '\t' '$3>=50' work/closure-census.tsv` gives Map 1388–1455, publish apply 2010–2073, literal 2131–2714 with **376** code lines. The literal census gives 258 entries, six spreads, 15 writes to 14 keys, five forms writes, and **eight** self-reading properties. AST inspection gives **nine** root awaits. The tenth census hit belongs to the orphan wrapper. |
| Budget and prior fixes | **REPRODUCED.** INDEX’s sum is 1,970k, max 230k. Stale TSV gating is gone. Committed-HEAD why-comments, inventory’s OK check, build/hooks, the two-activation SDK probe, kernel placement, synchronous slices, concurrent teardown barriers, and widget log levels are addressed in the instructions. |
| Fail-closed proof (`DESIGN:329`) | **WRONG.** `bash -n` parsed 38 of 39 literal Bash blocks. `COMMON:13` needs the sheet number substituted before parsing. A shell replay returned **0** for boundaries exit 99 followed by its summary. `work/rev3-command-proofs.txt:59–89` exercises isolated comparisons and historical freeze hits. It supplies no complete candidate-path failure proof. |

### Blockers

1. **S0 stops before characterization.** `S0:24–25` runs the unchanged boot-order test before the edits at `S0:49`. I ran it against Git blobs in memory. It exited 1 with two missing anchors. `composition-boot-order.unit.test.ts:62` expects the factory call inside `main`, but `index.ts:246–253,280` delegates to `openSiteDeps`. Test line 156 expects positional `kernel`, while `deps.ts:1032` passes `{ kernel }`. Land both source-test repairs in the prerequisite before running S0’s baseline.

2. **The gates can accept regressions and publish red history.** `COMMON:63–65,94–98` captures and discards boundaries status. `COMMON:89–93` misses hard regressions whose summary count stays constant, including API-surface growth and SCC growth printed at `check-architecture.ts:909,943–944,956–961`. `COMMON:78,130` explicitly permits a failed commit followed by a fix commit in the same push. `S13:11` also defers debt edits that `check-size-drift.ts:156–160` and `check-error-gate.mjs:119–128` require at the crossing move. Validate status against findings, compare hard metrics by identity and value, amend failed unpublished candidates, and put debt edits in the crossing commit. Plant these failures through the actual push gate, including runner failure and a forbidden import.

3. **The freeze has no integration enforcement.** `COMMON:29–40,103–109` samples terra before a push to a different branch. Terra can advance between those operations. The prescribed integration rerun also contains a push to `refactor/deps-split`, and its history check will flag the authorized split once merged. `INDEX:27` allows concurrent `app.ts` edits despite `SEQUENCE.md:103`. Serialize terra merges through H1 step 5, validate each candidate against its actual terra parent, and run the checks without the split-branch push.

### Major

- **Owner limits can pass with violations.** `COMMON:135–142` reports the 50-line limit until S13, and `S13:36–38` excludes tests and the moved `outbound-http.ts`. The recorded 56-line plant passed (`rev3-command-proofs.txt:16–21`). Apply all three limits to new or moved code in its landing commit. `DESIGN:292,320` also retains the module singleton at `deps.ts:413`. Construct it at the host composition boundary and pass it down.
- **Behavior pins still miss their seams.** `S0:44` searches for `productTracker()`, but `lifecycle.ts:105` uses `optional.productTracker?.().capture` via Jini’s `set-enabled.ts:100`. `S0:46` says the drain starts before credential provision, but `deps.ts:700,716,2823–2831` registers it there and runs it at close. Use the activation callback and assert drain registration. `S13:19` credits the backup test with calling `staticSiteContext`. The direct assertion is in `static-export-none.integration.test.ts:36`. Name that test explicitly.
- **S12 breaks a source reader as written.** `S12:8` replaces the first expected path, but `serving-app-boot-wiring.unit.test.ts:66–69,164` sorts matches. After the move, `serving-app.ts` sorts before `site-deps/slices/forms.ts`. Update the expected order in the move commit.
- **INDEX misses shared-file overlaps.** `INDEX:34,38` omits D0c’s `app.ts` and both debt files, plus size-02-app’s S5 wiring-identity test, both S11 tests, and S12 serving-app test. K03/K04 and K09/K10 also edit size debt. Reproduce with `git diff --name-only $(git merge-base b5fbf2a5 "$lane") "$lane"`. Record the files and their integration owner before S0.

### Minor

`S8:3` predicts a comments-capability hit. Its own `awk` returns the resolver, provider assignment, and literal at `deps.ts:1649,1881,2131`. Correct the anchor description.

### Over-engineering

- `S9:10` gives the eight-line provider argument a file and function (`deps.ts:1841–1848`). Keep the object at its call site unless measured root size requires extraction.
- `S13:7–8` gives every run the entire `SiteRootContext`. Pass each run the fields it reads, keeping getters for its actual late reads (`deps.ts:2252,2273,2629–2643,2707–2710`).

**Unverifiable:** future integration base, actual freeze enforcement, full native builds and tests, runtime parity, final extracted sizes, and the historical plant runs. Estimated 12 minutes and 14k generated tokens.
