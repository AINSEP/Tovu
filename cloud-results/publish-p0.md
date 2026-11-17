# publish-p0: publish engine Phase 0, preparatory steps

Status: **PARTIAL**. Done: P0.1, P0.2, P0.3, and 2 of the 8 function splits of P0.6. Not started: the other 6 splits, P0.5, P0.8 (see "Next step").
Branch: Tovu `refactor/publish-p0`, from `origin/refactor/terra` @ `80b00f5b`. No Jini change was needed.
Jini used: `refactor/terra` @ `02edbb68`, built and linked locally (`link-jini.mjs`).
Design: `plan/publish-engine-design-2026-11-16:designs/publish-engine/DESIGN.md` (revision 2), `AMENDMENTS-B` X5, `SEQUENCE.md` H1/H8.

## Commits

| SHA | Step | What |
|---|---|---|
| `75113f3b` | P0.1 | Pinned key bytes (installation id, public key, signature, session MAC), MAC-before-parse by outcome, constant-time source guard |
| `04c25336` | P0.2 | T-FROZEN (every value of design 3.3) and T-D6 (pinned trusted-route list) |
| `f7dce7eb` | P0.1 | Tests for the seven checks that survived the existing suites; mutation spec and runner |
| `6fd46c35` | P0.3 | Port bag split into `tovu-publish-ports.ts`; `PublishContentDeps` / `PublishContentContributor` generic over the bag; before-save hook moved to `ports.hooks.beforeSave` |
| `aa074e1b` | P0.1 | T-D11c (run-scoped command key), first report, the mutation table |
| `08b58a3a` | P0.6 | Characterization of the file provisioning port with a codec that keeps other file content |
| `93b99837` | P0.6 | `createFileProvisioning` split: `grantsInFile`, `readProvisionedGrants`, `applyGrantEdit` |
| `57cfe190` | P0.6 | `buildPublishContentImportHooks` split: `planStagedImport`, `captureImportRestorePoint`, `executeConfirmedImport`; its `size-debt.json` entry deleted |
| (this commit) | report | final report and table |

## Baseline on the unmodified tree

| Suite | Result |
|---|---|
| `features/publish-trust/__tests__/*.test.ts` | 402 pass |
| publish route and gate suites (`server/__tests__/routes/publish-trust-*`, `routes/publish-content/__tests__/*`, keyless, handshake) | 299 pass |
| `features/publish-content/__tests__/*.test.ts` | green (exit 0) |
| `check:size`, `check:complexity`, `check:boundaries`, `check:architecture` | **all four already fail on the base tree** (exit 1, 1, 16, 1) |

The four gates were run on a second, untouched worktree and on the working tree, and the outputs
compared: `check:size` and `check:complexity` are identical; `check:boundaries` reports the same
111 violations (16 errors, 95 warnings); `check:architecture` is red on base (4 hard metrics) and
after P0.3 shows one more exposed file (the new `tovu-publish-ports.ts`) and 17 more type-only
feature -> `publish-content/tovu-publish-ports` edges. Those edges are the design's own shape
(the bag in its own file, no re-export); they replace nothing because the same files still import
`type-registry` for the engine types.

## P0.1: characterization tests and mutation proof

Method: `cloud-results/publish-p0-mutation-proof.mjs` removes or inverts one check, runs the named
test files, records the result and restores the file. Full table: `cloud-results/publish-p0-mutation-table.md`.

**142 mutations: 140 red, 2 survived** (131 before the splits, 11 added for them). 105 are red on suites that existed before this run; 25
are red on tests this run added. Of those 25, nine were first shown to **survive** the existing
suites (K1b, D4c, H5, H7a, H12a, K9c, D9c, D12h, D11c); the rest are frozen values and the route
list, which had no pin at all (F1-F7, D6a-c), or second pins of a check an existing suite also
guards (D4b2, D12g, H7b, H7c, H12e, HOOKa). The checks that had no failing test:

| Row | Check | New test |
|---|---|---|
| K1b | installation id length (16 bytes) | `publish-trust/__tests__/trust-key-pins.characterization.test.ts` |
| D4c | session MAC compared in constant time (a plain compare returns the same answers) | same file, source guard T-D4c |
| H5 | accepted key is the one for the generation the session claims | `server/__tests__/routes/publish-trust-gate-predicates.characterization.test.ts` |
| H7a | principal rewritten to the system kind | same file, T-H7 (pins the whole rewrite: id, kind, credential kind, context) |
| H12a, H12e | session route refuses an expired or unknown grant **before the nonce is taken** (the verifier refuses too, but only after consuming it) | same file, T-H12 |
| K9c | pull cap 2,000 blobs | `publish-content/__tests__/publish-guards.characterization.test.ts` |
| D9c | staged bundle body cap 20 MB | same file |
| D12h | raw send recorded as `pending` before its work runs | same file |
| D11c | a run-scoped type gets a per-run command key | `publish-content/__tests__/apply-loop.test.ts` (2 cases) |
| F1-F7 | frozen values (they had no pin at all before P0.2) | `publish-trust/__tests__/frozen-values.pins.test.ts` |

Three rows were green on the design's candidate file and red on another existing suite; the table
names the suite that actually guards them: D12k (`backstop.l061`), D13b (`file-tree-policy.l044`),
H12b (`publish-trust-gate`).

**Survivors, recorded and not papered over.**

**D10e** (found while splitting the import ceremony; the gap predates the split): the plan step looks up
the baseline under the staged bundle's own source principal, not the acting admin
(`features/publish-content/gated-hooks.ts`, `planStagedImport`). Replacing it with the admin's id
leaves the hook, execute-import, import-route, planner, zero-setup and round-trip suites green
(91 cases). A wrong key would make every row of a second publish look like a first publish, or read
another peer's baseline. **A test must be written before this file is touched again or moved (B02-S3).**

**K6c**: the context check inside the peer vault's
`authorize` callback (`features/publish-content/peers.ts`, `peerVault`). Every caller in the module
builds the scope from the same constant, and when the check is gone the next step fails with the
same typed error, so no outcome reachable through the module's exports distinguishes it. It is a
second line behind K6d (the read-side kind/owner check, which is red). It stays in the Tovu vault
adapter; design T-K6c is defined on that adapter's port surface and belongs to P0.7c.

New test cases added: 8 + 11 + 6 + 5 + 2 + 2 + 3 (file provisioning port) = 37. No existing test was changed except the one
fixture line of the hook move (below). No test was deleted.

### Rows of design section 6 that cannot be written yet

They test a port or binding that Phase 0 has not created (P0.4 / P0.7 are outside this run):
T-K6a/b/d/e/f (`PeerStorePort`), T-K7a (`redact` port), T-K7b and T-HTTP (`jini-publish.ts`),
T-K10 (`blobKeyFor`), T-D12 per-config-field (`BackstopPolicyConfig`), T-C1b/T-C2b/c (compensation
reporter, also waits for OD-9), T-REG, T-REG-ROOT, T-PORTS. Today's behaviour behind them is
covered: K6a-e, K7a-c, D12a-k and C1/C1b/C2 are mutation rows against the current code.

Not mutated: D14, D15 (SQL revocation store and provisioning file IO; they stay in Tovu and no
step of this design touches them); D10 actor-class identity; D11 "changed since plan" re-check.

## P0.2: T-FROZEN

`frozen-values.pins.test.ts` pins every value of design 3.3. Exported values and values carried by
behaviour are pinned through behaviour (signed message, recorded derivation requests, failure code
on the thrown error, request URL). Three values have no seam a unit test can reach (vault scope,
history row kind, deploy-config key); they are pinned by a source search over the two feature
folders, not by file path, so the pins survive a file split.

## P0.3: port bag split

Done as designed, with three recorded deviations:

1. **Generic types only.** `PublishContentDeps<TPorts>` and `PublishContentContributor<TPorts>`
   are generic with the phase-only default. `buildPublishContentCatalog` and
   `registeredPublishTypePermissions` stay non-generic: they read the module-level registry, whose
   element type is fixed until P0.4 gives the registry an owner. Making them generic now would need a cast.
2. **`TovuPublishDeps` is not added yet.** With the phase-only default, `type-registry.ts` imports
   the bag type; an alias in the bag file would import back and close a type cycle. It lands at F1,
   when the default is removed.
3. **T-HOOK-ROUTE cannot be written as designed.** See finding 1. In its place
   `routes/publish-content/__tests__/deps.hooks.characterization.test.ts` pins the producer (red when
   the builder drops the hook), and the existing `execute-pull-tool.plugin-hook-refusal` suite is red
   when the consumer stops reading `ports.hooks.beforeSave`.

Importers: 23 files repointed (29 imported names), none left on the old name. Coordinator: two
comment lines in the frozen files still say `type-registry.ts`'s `PublishContentPorts`
(`composition/deps.ts`, `composition/app.ts`, the line above each apply bag's `ports:`).

Gates after P0.3: tsc root 0 errors, tsc tests 0 errors; publish-content + publish-trust + touched
feature suites 1134 pass, 1 skipped (as before); publish route suites 439 pass; size, complexity
and boundaries unchanged against base (above).

## P0.6: function splits (2 of 8)

Both were done characterization-first, and the mutation rows were repointed to the split code and
re-run (a split moves the mutated text).

| Function | Was | Now | Proof |
|---|---|---|---|
| `createFileProvisioning` (`publish-trust/provisioning.ts`) | 53 code lines, three closures | factory of about 12 lines + three module functions over one `ProvisioningFile` value built when the port is built | P6a-h all red; three of them (re-encode into other file contents, second read, write after a failed encode) had **no** failing test before `08b58a3a` |
| `buildPublishContentImportHooks` (`publish-content/gated-hooks.ts`) | 104 lines | hooks object + plan, restore-point and execute steps; each still reads `input` when it runs | D10a-d red; D10e survives (above) |

Late-read check (lesson 3) for both: every closure read only values fixed before it could run
(`deps` fields destructured at construction; the `input` object). No read became eager.
After both: tsc root and tests 0 errors; publish-trust + gate suites 479 pass; publish-content +
publish route suites 929 pass, 1 skipped; `check:size` and `check:complexity` identical to base
(with the retired debt entry removed).

## Findings (class, location, fix)

1. **A host hook is not applied on one write path.** Class: the plugin before-save hook reaches
   the publish *plan* bag but not the *apply* bag. Location: the two composition roots build the
   apply bag (`toPublishContentApplyDeps`) without the hook; the route deps builder and the tool
   registrations put it only on bags that pack, inspect and precheck. The apply loop builds its
   handlers from the apply bag alone. So on a real install a post applied by a publish does not run
   the before-save hook; the only suite that shows a refusing hook blocking a row builds its own
   apply bag with the hook in it. Found by reading while moving the field; **not proven by a failing
   test**, because the fix and the wiring are in `composition/deps.ts` / `app.ts`, frozen for this
   run. Fix: one line in each root's apply bag, `hooks: { beforeSave: pluginRuntime.beforeSaveHook }`,
   with a route-level test first. It turns a hook on, so it is a behaviour change and needs the
   owner's yes. P0.3 keeps today's behaviour exactly.
2. **A producer value nothing reads.** The hook the tool registrations put on their bag
   (`features/publish-content/tool-registrations.ts`, `pullHooks`) never reaches a handler's apply,
   for the same reason. Fix: decide with finding 1; if the apply bag gets the hook, delete this one.
3. **K6c** above: a guard with no distinguishable outcome.
4. **Four repository gates are red on `refactor/terra`** before any change of this run (size,
   complexity, boundaries, architecture). This run added nothing to the first three.

## Not done

- **P0.6**: six functions left (`createRepoPublishHandler`, `buildRawRowHandler`, `contributeRawFilePublish`,
  `applyOneRow`, `applyReport`; `planPublishToPeer` stays in Tovu and is not part of the move).
  **P0.5a/b** signature conversions (87 functions, about 39 port methods) and **P0.8** file splits
  (7 files) are not started. No partial edit is in the tree.
- P0.8 depends on P0.7 for three of its seven files (`peers.ts` needs `PeerStorePort`,
  `peer-transport.ts` and `file-tree-policy.ts` need their config/redact ports to end up at the
  design's target names). The four that do not are `apply-loop.ts`, `type-registry.ts` (needs P0.4
  for `registry.ts`), `planner.ts`, `provisioning.ts`.
- 13 of the 14 `size-debt.json` entries for `publish-content/*` remain (one retired with the import-hooks split; X5 item 5).

## Next step

First a test for D10e. Then P0.6, one commit per function, in this order (smallest blast radius first):
`createRepoPublishHandler` ->
`buildRawRowHandler` -> `contributeRawFilePublish` -> `applyOneRow` (free-variable check of the
five closures first, lesson 3; the lifted functions take `{ step }`, X5 item 2) -> `applyReport`.
Each commit deletes its `size-debt.json` rows. The mutation spec is the regression net: re-run
`node cloud-results/publish-p0-mutation-proof.mjs cloud-results/publish-p0-mutations.json` after
each split (a split moves the mutated text, so a row that no longer finds its text reports
`SPEC-ERROR` and must be repointed, not dropped).

## Run notes

- The container clock stops between tool calls, so wall time could not be measured from inside;
  the run was stopped on the context budget.
- A scratch worktree (`../Tovu-mut`) was used to run the mutation proof beside the edits; it was
  removed at the end. No test process was left running.

# Run 2

Status: **PARTIAL**. Done: the 6 remaining P0.6 function splits (each characterization-first, each with
mutation proof), the D10e test, P0.8 for `apply-loop.ts`, `planner.ts` and `provisioning.ts`, and the
empty-options-type part of P0.5a for the backstop, raw-contributor and apply family. Not done: the rest of
P0.5a (the 87-function census), P0.5b (port methods), and P0.8 for `type-registry.ts`, `peers.ts`,
`peer-transport.ts`, `file-tree-policy.ts` (they wait for P0.4 / P0.7, as the design says).
Branch: Tovu `refactor/publish-p0`, continued from `5c37c65f` (run 1). Jini: `refactor/terra` @ `02edbb68`, built and
linked locally; no Jini change. Node 24.22.3, pnpm install `--frozen-lockfile`, `pnpm -r build` green on the unmodified tree.

## Commits (all pushed; last pushed SHA `ff81ceffc`)

| SHA | Step | What |
|---|---|---|
| `f3bec7f4d` | P0.1 | **D10e test**: the import plan reads the baseline under the bundle's source principal. 2 cases, green on base, red when the lookup uses the admin |
| `15a2d6a36` | P0.6 | characterization of `createRepoPublishHandler` (15 cases, rows RH1-17) |
| `ede34bec6` | P0.6 | `createRepoPublishHandler` -> codec, env, pack/inspect/precheck/apply steps; 2 size-debt rows deleted |
| `8a458467e` | P0.6 | characterization of the raw row contributor over a fake port (15 cases, rows RR1-23) |
| `85c2d13f1` | P0.6 | `buildRawRowHandler` -> `RawRowEnv` + steps; 1 size-debt row and 1 complexity-debt row deleted |
| `ebaf0afde` | P0.6 | characterization of the raw file contributor (10 cases added to the L044 suite; rows RF1-49) |
| `135bfed0c` | P0.6 | `contributeRawFilePublish` -> `RawFileEnv` + steps, one `RawFileWrite` value; 2 size-debt rows deleted |
| `0287ffebb` | P0.6 | characterization of `planPublishToPeer` (8 cases, rows PP1-23) |
| `e5cce52a8` | P0.6 | `planPublishToPeer` -> select, push, annotate, answer |
| `7ba531d85` | P0.6 | characterization of the apply loop (21 cases over a fake handler, rows AL1-32, AR1-44) |
| `ad3c56f03` | P0.6 | `applyOneRow` (five closures -> module functions taking `{ step }`) and `applyReport` (-> `RunProgress` + steps); 3 size-debt function rows deleted |
| `051f7845e` | P0.8 | `apply-loop.ts` -> `idempotency`, `apply-failure`, `apply-row`, `apply-retire`, `apply-report`, `apply-run`, `apply-port` |
| `5dc899acb` | P0.8 | `planner.ts` -> `planner` + `plan-rows`; 40 imports repointed by script |
| `67ec9b900` | P0.8 | `provisioning.ts` -> `provisioning` + `provisioning-status` |
| `ff81ceffc` | P0.5a (part) | `_optional: Record<string, never> = {}` -> `_optional = {}` in 9 files; apply port factory destructures its input |
| (this commit) | report | this section and the regenerated mutation table |

## Baseline and gates

Baseline on the unmodified tree: Jini build green; Tovu root `tsc` 0, tests `tsc` 0; the publish-content, publish-trust, route and
gate suites passed before any edit (the D10e and characterization files were green before each split).
After every commit: `tsc` root 0 errors; `check:size` and `check:complexity` output **identical to the previous commit** (diffed
line by line), with one exception named below. After the last commit: `tsc` tests 0 errors; the publish-content + publish-trust + route
suites **1285 tests, 1284 pass, 0 fail, 1 skipped** (the skip is the one of run 1); `check:boundaries` 111 violations (16 errors,
95 warnings), the same as base; `check:architecture` still red as on base: this run **adds** exposed files (`module API surface 821 -> 852`, the
new split files), which the design expects ("check-architecture.baseline.json edges rewritten") and which the coordinator
should rebaseline after the whole of P0.8; cycle count is not worse by file in the two publish folders (no cycle among the new files).
Exception: at `ad3c56f03` the file row of `apply-loop.ts` counted 775 lines against a baseline of 720 (the step signatures and
interfaces); `051f7845e`, the next commit, deletes it. That is a worsened line for one commit, by design of the order (P0.6 then P0.8).

## P0.6: function splits (all eight now done)

| Function | Was | Now | Proof (mutation rows, all re-run on the split code) |
|---|---|---|---|
| `createRepoPublishHandler` | 177 lines | codec + `RepoEnv` + 8 module functions | RH1-17: 17 red |
| `buildRawRowHandler` | 134 | `RawRowEnv` + 9 module functions | RR1-23: 23 red |
| `contributeRawFilePublish` | 152 | `RawFileEnv` + 13 module functions | RF1-49: 48 red, RF32 equivalent |
| `planPublishToPeer` | 63 | 5 module functions + 3 named types | PP1-23: 22 red, PP17 equivalent |
| `applyOneRow` | 195 | dispatcher + `validateRetire`, `applyRetiringRow`, `checkExistence`, `checkAgreement`, `applyOrdinaryRow` taking `{ step }` | AL1-32: 32 red |
| `applyReport` | 314 | `loadStagedBundle`, `abandonRefusedRun`, `openRun`, `executeRows`, `failRun`, `closeRun` and 15 helpers over one `RunProgress` | AR1-44: 42 red, AR19 and AR20 equivalent |

Late-read check (lesson 3), done by reading every closure before lifting it: `applyOneRow`'s five closures read only `row`, `ctx`,
`key` and `current`, all assigned before the first call, so each lifted function takes them in `{ step }` and nothing became eager.
In `applyReport`, `report` is reassigned once (`prepareRunAudit` adds `backstop`); it is now `progress.report`, read at the
same points. `transactional` was computed late and is pure over `entities`, so `openRun` computes it. The raw and repo handlers read
`port` / `files` once at build time, as before (kept in the env value); every other read is still made when the step runs. The
mutable state of `applyReport` is the one `RunProgress` value; the steps that write it name themselves in its doc.
Bugs found: none new beyond the D10e gap. Where the design said "re-verify with the AST", I read the code; no closure
depended on a later assignment.

## Mutation proof

The spec now has **330 rows** (142 before; +188: RH 17, RR 23, RF 49, PP 23, AL 32, AR 44). Final run at `ff81ceffc`:
**325 red, 5 survived**. The survivors, all recorded and none papered over:

- **K6c** (run 1): a second line behind K6d; stays for P0.7c.
- **RF32**: the guard `written && prior` in the raw file rollback. The command gateway calls `rollback` only after `execute`
  returned, so `written` is always true there; equivalent, kept as defense in depth.
- **PP17**: `scoped.skipped` vs `bundle.skipped`; `selectBundleEntities` and `includeReferencedEntities` keep the scoped list, so
  the two are the same value; equivalent.
- **AR19, AR20**: `result.changeSetId ?? item.changeSetId` (and the retired id): an item gets a change set id only together with the result
  that carries it; equivalent.
- **D10e** is no longer a survivor.

Method note: the first pass of the apply-loop rows left 39 of 76 green on the existing suites; the 21 characterization cases killed
37 of them (nothing in the existing suites pinned the send-by-hand audit, the file rollbacks, the run-row identity or the retire
refusals' wording). Three mutation workers ran in scratch worktrees (`/tmp`) so the main tree was never mutated while edited; a stale
mutation left in two worktrees by a killed run was reset with `git checkout`, never in the main tree.

## P0.8 notes

- `apply-run.ts` is a **seventh** file beyond the design's six: `apply-report.ts` alone counted 537 lines against the 500 limit and
  the run types cannot sit in `apply-port.ts` without a type cycle (the canonical `no-circular` rule counts type-only edges). It holds
  `ApplyRun`, `RunProgress`, `CreatePublishContentApplyPortInput` and the run-row persistence. Coordinator: confirm or fold it back
  once the F1/B02-S5 file shapes are set.
- `applyOneRow` lives in `apply-report.ts` (the dispatcher imports `apply-row` and `apply-retire`; the other way round would be a cycle).
- The two composition roots (`composition/deps.ts`, `composition/app.ts`) changed **only their import line**
  (`createPublishContentApplyPort`, `toPublishContentApplyDeps` now from `apply-port`). Coordinator: re-take the text guards.
- `planner.ts` re-exported `RetireTarget` and `ReferenceHolder`; that forwarder is deleted and its importers take the types from
  `type-registry.ts`.
- Error messages that say "wire it from the apply-loop composition root (features/publish-content/apply-loop.ts)" (repo handler, post,
  media, menu, theme handlers) now name a file that no longer exists. They are asserted verbatim by tests, so they are **unchanged**; a
  later step should reword them together with their tests (owner decision).
- Not done and why: `type-registry.ts` needs P0.4; `peers.ts` needs `PeerStorePort` (P0.7c); `peer-transport.ts` and
  `file-tree-policy.ts` need their config/redact ports to end up at the target names (P0.7). The 4 remaining `size-debt.json` rows for
  `publish-content/*` are `peer-transport.ts` (file), `publish-backstop-file.ts`, `publish-tool.ts`, `tool-registrations.ts`.
  The `apply-loop.ts` rows (4), `repo-handler.ts` (2), raw row (1 + 1 complexity row), raw file (2) are retired. X5 item 5 is now met for
  `apply-loop.ts`.

## P0.5

Only a slice of **P0.5a** was done: the empty-options type (`Record<string, never>`) was dropped from function signatures in
`backstop-policy.ts`, `backstop-service.ts`, both raw contributors, `apply-report/retire/row`, `push-plan.ts` and `repo-handler.ts`
(type-only, no caller changed), and the apply port factory takes a destructured input. The `(deps, input)` and no-options-boundary
conversions of the 87-function census and all of **P0.5b** (about 39 port methods, OD-12) are not started; each is a
one-family-per-commit job with every caller and fake. Self-check at the end of the run: `owner-rules-audit` on the whole tree gives
**0 new findings** in changed files; `args-object-audit` gives **0 findings that are new by function name** in the two publish
folders (its by-line comparison lists 2 pre-existing `unsure` entries that moved with their files:
`packedEntityLabel` and `describePublishTrustState`); the findings it dropped are `applyOneRow` (now `{ row, ctx }`),
`build`, `blob`, `check` and two `apply` closures.

## Findings carried and new

1. (run 1, still open) the plugin before-save hook is not on the apply bag; needs the owner's yes.
2. (run 1) K6c.
3. **D10e is closed** by a test.
4. The stale error-message path above.
5. `check:architecture`'s API-surface count grows with every split file; plan one baseline rewrite after P0.8.

## Next step

P0.4 (registry per composition root) unblocks `type-registry.ts` and the rest of P0.8's first group; P0.7a-c unblock `peers.ts`,
`peer-transport.ts`, `file-tree-policy.ts`. P0.5a/b are independent and can be dispatched per file family now, starting with the families
whose files this run already moved (`apply-*`, raw contributors, backstop), because their callers and tests were just repointed.
