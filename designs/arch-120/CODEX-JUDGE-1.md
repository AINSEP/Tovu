REJECT

| Claim | Result |
|---|---|
| `DESIGN.md:5`, `INDEX.md:4` baseline refs | **WRONG on current refs.** `git rev-list --left-right --count f0613d9e5...b5fbf2a5e` gives **16 / 242**, versus the claimed zero on the terra side. Jini moved `4c189236` → `6c9effae4`, 311 commits forward. `git merge-base --is-ancestor` confirms the import-cycle-b tip is integrated in Jini and absent in Tovu. |
| `DESIGN.md:30–74,241`, Appendix A | **REPRODUCED on `f0613d9e5`.** Ran the extractor against Git blobs in memory using `git ls-tree` and `git cat-file --batch`. All 120 appendix rows match. Of 427 edges, 120 are NEW and 124 baseline entries are stale. The 119-row ledger regenerates byte-for-byte after removing E085. |
| Same edge inventory on `b5fbf2a5e` | **WRONG for membership and provenance.** Same totals, ten additions and ten removals. After S1 the classifier yields **99 OLD, 12 MOVED, 8 RENAMED, 0 DESIGNED**. E095/E112 disappear, the old credential-registry and `purge-media` imports return, and `entries/repo.sqlite.ts:3` replaces the `repo.ts` edge. |
| `DESIGN.md:11,90–106` baseline history | **REPRODUCED** 445 stored edges and the same 107 NEW at `9240cbe1` and `0df57a3a`. **WRONG** creation commit. `git log b5fbf2a5e --full-history -S'"crossFeatureEdges"' -- development/scripts/check-architecture.baseline.json` identifies `987cf88f6`. At creation, the rederived graph has 435 edges and 62 NEW. |
| `DESIGN.md:10,145–150,162,242` graph and S1 | **REPRODUCED** S1’s call sites, eight existing tests, and baselined lifecycle import. **WRONG** cycle baseline comparison, which is 1 vs **5** at `f0613d9e5`. Replaying the checker with the blob-derived AST graph gives **4 pairs, SCC 5, API surface 842** on `b5fbf2a5e`. Feature-only SCCs drift from 25 type-inclusive / zero runtime to **26 / one of size 5**. Upward type-only imports drift **37→35**, with **23→21** in the acceptance set. |
| `INDEX.md:37–48`, `DESIGN.md:243` lanes and CI | **REPRODUCED** zero direct overlaps among the 14 listed lanes. **WRONG** several counts using the INDEX’s `git diff --name-only` command. Against `f0613d9e5`, `su-cms` is 152 files and +1/−4 edges, versus 96 and +1/−3. The extra removal is `entries/trash-aware-memory-repo.ts → media/access-evidence.ts`. CI already runs and enforces architecture through its summary (`.github/workflows/ci.yml:210–212,414–424`). |

### Blockers

- **S3 cannot turn the current gate green.** `S3:73,100` requires exit 0. Replaying S1 and accepting every remaining edge in memory still exits 1 for API surface **842 > 821** and a new runtime mutual pair. `source-control/commit-site.ts:6–10` and `site-backup/backup-service.ts:31–32` demonstrate that pair. S1 leaves `soon-lock.ts` exposed through `server/runtime/boot/bootstrap.ts:6`. Qualify an integration base that passes both hard metrics before dispatching S3.
- **The acceptance evidence becomes a blanket waiver for OLD edges.** `DESIGN.md:67,106`, `make-accepted.py:17–26`, and `S3:48–52` let a historical path match confer approval automatically. I checked all 119 original rows individually for provenance. The 16 moves and eight renames match the historical symbol inventory, and the two DESIGNED rows cite explicit decisions at import-cycle `DESIGN.md:172,238–260`. But **43 of the original 93 OLD rows**, and **49 of the current 99**, were absent when the ratchet was created. Seven current OLD rows are upward value imports, including `credential-ports.ts:15` and the six source-control imports into site-backup. Require explicit review of those rows and bind acceptance to the reviewed live list.

### Major

- **Gate failures can look successful.** `S2:214–231` discards child status and signals. In-memory probes returned 0 and reached the writer for checker exit 127, SIGKILL, and a separate hard regression. `sheet-gates.sh:11–24` returned 0 comparing two missing report directories and omits hard-metric detail from its architecture filter at line 28. `regenerate-facts.sh:17–31` swallows checker errors and only prints validation counts. `lane-edges.sh:9–13` races checkouts in one worktree and hides producer failures behind `comm`. Validate statuses and expected output, require complete reports, and compare independently generated inputs.
- **Several sheet STOPs do not enforce their stated conditions.** S1’s test and lint pipelines (`:41–43,128–135`) and S2/S3 test summaries (`S2:38,240,280–282`, `S3:102`) can succeed after a failing producer. S2’s red/mutation checks (`:107,255,258`) match text without checking the expected failure status. S3 F1 passes with no matching line, BSD `wc` padding trips F1/F2, and inverted `grep -P` masks BSD grep failure (`S3:42–52`). GNU `sed -i` mutations also fail on BSD. `INDEX.md:68` prints STOP and continues. Check statuses directly, normalize numeric output, and rerun gates after a successful rebase before pushing.
- **Refresh the collision and execution prerequisites.** `INDEX.md:33–48` omits `fix/vendor-names-out-of-core` touching `soon-lock.unit.test.ts`, and `integ/ratchets-arch-2026-11-17` plus `refactor/import-cycle-b` touching the baseline. `fix/desktop-waveb` edits `import-plugin-state.ts` relative to its merge base, with identical final content at `b5fbf2a5e`. The parallel sheets also share checkouts and `/tmp/arch120/base` (`S1:13–20,39`, `S2:15–22,37`). Record integration order and isolate each run’s paths.

### Minor

- The Python tools reject some malformed input, and `make-accepted.py` correctly exits 1 for E085. All three exit 0 on empty inputs. The MJS extractor throws on filesystem errors but silently drops unresolved imports and ignores TS parse diagnostics (`:27–36,48`). Require evidence that extraction completed before interpreting an empty result.

### Over-engineering

- `DESIGN.md:175–185` and S2 add a permanent CLI and helper for a reviewed baseline edit. A one-time `crossFeatureEdges`-only edit and committed ledger suffice. Verify with `npm run check:architecture` and a JSON key diff. The existing `--update` rewrites all metrics (`check-architecture.ts:866`).
- Use the repository’s existing gate commands and dependency-cruiser graph for verification. Keep symbol provenance as review evidence instead of making the second extractor and SCC script dispatch prerequisites.

### Unverifiable

Product test outcomes, mutation runs, full native gate exits, and the historical dry-run environment require a writable checkout. I checked the tool syntax, exercised failure cases in memory, and rederived graph metrics. The overlap scan covered recent fetched refs. **Estimated effort: 12 minutes and 13k generated tokens.**
