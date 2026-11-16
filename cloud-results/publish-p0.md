# publish-p0: publish engine Phase 0, preparatory steps

Status: **PARTIAL**. Done: P0.1, P0.2, P0.3. Not started: P0.5, P0.6, P0.8 (see "Next step").
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
| (this commit) | P0.1 | T-D11c (run-scoped command key), this report, the mutation table |

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

**131 mutations: 130 red, 1 survived.** 105 are red on suites that existed before this run; 25
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

**Survivor, recorded and not papered over. K6c**: the context check inside the peer vault's
`authorize` callback (`features/publish-content/peers.ts`, `peerVault`). Every caller in the module
builds the scope from the same constant, and when the check is gone the next step fails with the
same typed error, so no outcome reachable through the module's exports distinguishes it. It is a
second line behind K6d (the read-side kind/owner check, which is red). It stays in the Tovu vault
adapter; design T-K6c is defined on that adapter's port surface and belongs to P0.7c.

New test cases added: 8 + 11 + 6 + 5 + 2 + 2 = 34. No existing test was changed except the one
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

- **P0.6** function splits (8 functions), **P0.5a/b** signature conversions (87 functions, about
  39 port methods), **P0.8** file splits (7 files). None started; no partial edit is in the tree.
- P0.8 depends on P0.7 for three of its seven files (`peers.ts` needs `PeerStorePort`,
  `peer-transport.ts` and `file-tree-policy.ts` need their config/redact ports to end up at the
  design's target names). The four that do not are `apply-loop.ts`, `type-registry.ts` (needs P0.4
  for `registry.ts`), `planner.ts`, `provisioning.ts`.
- The 14 `size-debt.json` entries for `publish-content/*` are untouched (P0.6/P0.8 retire them, X5 item 5).

## Next step

P0.6, one commit per function, in this order (smallest blast radius first):
`createFileProvisioning` -> `buildPublishContentImportHooks` -> `createRepoPublishHandler` ->
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
