VERDICT: REJECT

All 25 B-sheets need fixes. The synchronous extraction can preserve boot order, but the prescribed tests reject the generated code and the push gate can publish an unchecked rebase.

| ID | Severity | Sheet | Claim vs evidence | Fix |
|---|---|---|---|---|
| 1 | blocker | B01–B25 | Every position pin looks for a statement starting with the callee, but every replacement starts with `const {` (`B01:10,73–76`). Later pins also compare a complete first line with a truncated predecessor (`B05:89`). | Match AST call initializers and named ordering anchors. Keep the pins valid across later slices and R. |
| 2 | major | B01–B25 | Declaration lists miss effects: B01’s swap leaves the list unchanged (`deps.ts:965–966`). B04/B09/B12/B22 have only one declaration to swap. B13/B25 swap a declaration with an effect (`deps.ts:1590–1591,2723–2736`). B09’s prescribed direct return contradicts its expected declaration (`B09:14,93`). The lazy visitor skips IIFEs and never checks the root getter arguments (`B01:84–93`). | Pin effect order and actual late reads. Use a distinct, executable mutation for each assertion. |
| 3 | blocker | B02/B03/B16/B17/B25, M2 | The base deny-store anchor is already stale (`composition-boot-order.unit.test.ts:156`, `deps.ts:1036`). Its regex misses the owner await (`:166–175`, `deps.ts:1980`). M2/B02/B03/B16/B17 remove anchors at test lines 117–127, 158, 176–178 and 188. B25 omits the reader that sorts `.formSubmissionsAutoPull` matches (`serving-app-boot-wiring.unit.test.ts:66–69,164`, `deps.ts:2750`). | Repair the baseline before extracting. Specify exact per-move edits and stage them. B25 expects `serving-app.ts` first and the new slice second. |
| 4 | blocker | B01–B25 | The type recipe misses object literals, aliases and awaited renamed destructures (`deps.ts:1081–1082,1823,1884`). B05 lists two local helpers without prescribing their move or dependencies (`deps.ts:795–822,1131,1152,2937–2948`). B06/B25 omit `consoleLogger` from both calls and input tables despite their notes (`deps.ts:1283,2727,2731`). | Supply exact types, imports, bindings and calls. B05 must carry both helpers and `createSiteDisplayNameSource` at `deps.ts:615–619`. |
| 5 | blocker | All gates | The first dirty-tree check is exempt from `errexit` inside `&&` (`B01:102`). The literal block pushes immediately after rebase (`:213–221`). Its prose rerun is conditional on `deps.ts` and retains the old parent and baselines. Architecture can print regressions and exit zero (`check-architecture.ts:160–175,998–1014`). | Use separate cleanliness checks. After every parent change, regenerate baselines and gate the exact rebased SHA before push. Define blocking metrics explicitly and plant failures through that path. |
| 6 | blocker | All gates | `INDEX-v4` cites test and boundary-baseline proof, but `gates-2d82735a.txt:1–13` has neither runner results nor an ignore-known run. The parent test command includes the candidate-only test (`B01:206–208`). Setup assumes `../Jini` and `../Tovu`, and its Node 22 evidence is below `package.json:11–12`’s Node 24 minimum. | Pin paths, SHAs and Node. Repair base-red tests before gating or require complete runner evidence. Run the gates on a capable verifier and require its result for the candidate SHA. |
| 7 | major | All, especially B09/B10/B22/R | The size override checks one new implementation file (`B01:129`), leaving changed readers, new tests and phases outside its coverage. B10 conditions its split on a local gate (`B10:14`). | Specify the splits and exact inputs up front. Enforce 50/10/500 and suppression checks on landing code, with debt edits in the crossing commit. |

**Per-sheet and parallel groups.** B01–B25 are each **NEEDS-FIX**. M1–M3, L*, H2–H4 and R are **NOT-CODEX** until written. There are no file-disjoint groups. All sheets edit `deps.ts`, and several share readers. Consolidate the duplicated test scaffolding into an existing boot-order test. Keep B08–B11 in one trash module if it fits, retaining separate ordered calls and the shared Map.

**Required missing sheets**

- **M1:** Move the override interface and five helpers with comments. Specify two-object signatures and update calls at `deps.ts:550,835,977,989,1033,1115`, plus B02’s workspace anchor. Repoint the type import at `deps-observability-wiring.integration.test.ts:15`.
- **M2:** Include hydration (`deps.ts:536–551`) with storage/open/close helpers (`:653–760`). Export only `StoreCloseRegistration`, `openCompositionStore` and `resolveChatDbPath`. Rebind `:837,956,1041` and boot-order readers. Preserve drain → concurrent disposers → concurrent sweep stops → close, and the borrowed-store release branch.
- **M3:** Move `deps.ts:846–929` with exact imports and defaulted options. Repoint `:1823,1845,1850,1840,2681,2692` and `deps-provider-plugin-boot.integration.test.ts:15`. Preserve injected boot selection, warning/fallback and project-close registration.
- **L\* / H2:** Specify ordered, size-bounded, contextually typed literal runs, seven spread positions, overwrite order and deferred self-reads. Move shared OAuth from `deps.ts:2789–2798` and call it at `:2276`. Keep commerce construction and registration at `:2800–2816`. Pin optional-key presence, credentials/static-context bindings, backup/version and consent.
- **H3 / H4:** Give exact inputs and a compliant sharing split at `deps.ts:2834–2930`. Preserve shared `savedKeys`, late reads, the sharing catch and `undefined` assignment, imports’ conditional assignment, and the consent tail.
- **R:** Specify synchronous phases between the nine original awaits, with explicit inputs/outputs and live getters. Include the orphan and project-key closures, exact reader rewrites, debt removals and root/file limits. Preserve tracker flush, host assignment → attach → drain registration → credential provision. The coordinator’s phase decision supersedes the size-exception question.

**Earlier findings**

- J1 B1 — Open. Runner status propagates, but staging and push gates remain incomplete.
- J1 B2 — Freeze superseded. Post-rebase validation remains open.
- J1 B3 — Open. Baseline, contextual typing and runtime shape pins remain incomplete.
- J1 S1–S3 — Open pending M sheets and exact reader edits.
- J1 S4–S8 — Kernel position preserved. Store-bound and orphan pins need repair.
- J1 S9–S12 — Extra root awaits resolved in B*. Runtime seams and final phases remain open.
- J1 S13 — Open pending literal and tail sheets.
- J1 minor / over-engineering — Gate coverage remains open. Memory outbound wrapper superseded.
- J2 B1 — Old branch and placeholder stops superseded. A stale boot anchor remains.
- J2 B2 — TSV gating resolved. Crossing debt edits remain open.
- J2 B3 — Committed-HEAD why-comments resolved. Candidate-path proof remains open.
- J2 B4 — Freeze superseded. Rebase bypass remains.
- J2 majors — Kernel ordering resolved. SDK/tracker pins and coverage remain open.
- J2 minors / over-engineering — Log levels corrected. Teardown awaits M2. Map split needs a matching pin.
- J3 B1–B3 — Baseline and push blockers remain. Freeze superseded.
- J3 majors — Limits, logger, seam pins and sorting remain open. Static-export test is listed.
- J3 minor / over-engineering — Old comments anchor and provider wrapper superseded. Literal inputs remain open.

Read-only review. No tests, builds, installs or type-checks ran.
