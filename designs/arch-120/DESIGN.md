# arch-120 — the 120 "NEW cross-feature edges" that keep `check:architecture` red

Design run `design-arch-120`, 2026-11-18. Plan documents only; no product code is changed on this branch.
Branch: `plan/design-arch-120-2026-11-17` (Tovu), cut from `origin/refactor/terra` (`ada11733`).
Facts base: `origin/refactor/import-cycle-b` = terra + import-cycle-b, `f0613d9e5` (a fast-forward of terra: `git rev-list --count origin/refactor/import-cycle-b..origin/refactor/terra` prints `0`).
Executable sheets: [`INDEX.md`](INDEX.md) and [`sheets/`](sheets/).

## 0. Result in five lines

1. `npm run check:architecture` exits 1 on one hard metric only: 120 `NEW cross-feature edge` lines. Every other hard metric holds (API surface 821 = baseline, 1 cycle pair vs 3, SCC 2 vs 22).
2. **93 of the 120 are not new.** They exist in the tree of `9240cbe1`, the very commit that created the baseline list, and the gate already reports **107 NEW edges at `9240cbe1` itself and at `origin/main`**. The list was wrong the day it was committed.
3. **26 more are moves, a rename, or edges an approved design created on purpose** (publish-engine P0.3, import-cycle S5 and S3b, the 11-17 index repoint).
4. **1 is unreviewed new coupling**: `site-backup/import-plugin-state.ts → agent-plugins/soon-lock.ts`. Sheet S1 removes it through the lifecycle owner that already binds the Soon catalog.
5. Order: S1 (remove the one tangle) → S2 (a narrow tool that adds reviewed edges to the baseline, never touching any other metric) → S3 (apply the reviewed 119-row list). A local dry run of S1 + S3 makes the gate **exit 0** (§6).

## 1. How every number here is produced

Setup (Node 24; the repos side by side as `Tovu` and `Jini`):

```bash
export PATH="$HOME/.local/node24/bin:$PATH"
cd Jini && git checkout origin/refactor/terra && pnpm install --frozen-lockfile && pnpm --no-bail -r build && cd ..
cd Tovu && git checkout origin/refactor/import-cycle-b && npm ci
JINI_PACKAGES_DIR="$PWD/../Jini/packages" node development/scripts/link-jini.mjs
npm --prefix packages/contracts run build && npm --prefix packages/sdk run build   # without this, tsc reports TS2307 '@tovu/sdk'
```

Jini must be `refactor/terra`: Jini `main` (0.7.2) does not typecheck against terra (ratchets-arch report). The `@tovu/sdk` build is needed for `tsc`, not for `check:architecture`.

All facts in [`facts/`](facts/) come from one script, and re-running it reproduces them byte for byte (checked: `cmp` on `EDGES.tsv`, `new-edges.head.txt`, `imports.head.tsv`, `imports.9240cbe1.tsv`):

```bash
TOVU="$PWD" bash designs/arch-120/tools/regenerate-facts.sh
# facts base: f0613d9e5
# NEW edges at head: 120
# edge count: gate=427 extractor=427 (must be equal)
# NEW edges the extractor does not see: 0 (must be 0)
# NEW edges reported by the gate at its own baseline commit: 107
#      16 MOVED
#       3 NEW
#      93 OLD
#       8 RENAMED
```

Tools (read-only, plan tooling, in [`tools/`](tools/)):

| tool | what it does | why it can be trusted |
|---|---|---|
| `cross-feature-imports.mjs <root>` | every import between two `features/<x>/` folders (production files, tests excluded exactly as the gate does), with imported names and `type`/`value` | It finds 427 distinct file edges, the gate's own `cross-feature import edges (all-import)` number, and it sees all 120 NEW edges (both checks are printed by the script above). It resolves `./x.js`, `#src/*` (the `imports` map in `package.json`) and `import("x")` type nodes. |
| `classify-edges.py` | joins the NEW list with the import facts, the rank table and the `9240cbe1` tree | Pure set logic; rules in its docstring. |
| `make-accepted.py` | builds the reviewed accept list from `EDGES.tsv`; refuses every `NEW` row that is not one of the two named design edges | Exits 1 and names the refused edges. |
| `feature-scc.py` | feature-level SCCs, type-inclusive and runtime-only | Reproduces the import-cycle-b report: 1 type-inclusive SCC of 25 features, 0 runtime SCCs. |
| `lane-edges.sh <branch>…` | the edges a live lane adds/removes against its own merge-base | Used for the collision notes in `INDEX.md`. |

## 2. The exact edge list, grouped by root cause

The list itself is the gate's output, unedited: [`facts/new-edges.head.txt`](facts/new-edges.head.txt) (120 lines, `LC_ALL=C` sorted) from [`facts/check-architecture.head.txt`](facts/check-architecture.head.txt). It equals `cloud-results/ratchets-arch-new-edges.txt` on the facts base except for the one swap import-cycle-b already reported (`custom-credentials/credential-ports.ts → source-control/provider-registry.ts` gone, `source-control/write-port.ts → custom-credentials/write-files-validation.ts` new):

```bash
diff <(git show origin/refactor/import-cycle-b:cloud-results/ratchets-arch-new-edges.txt | LC_ALL=C sort) designs/arch-120/facts/new-edges.head.txt
```

Every edge with its id, kinds, rank direction, provenance and names: [`facts/EDGES.tsv`](facts/EDGES.tsv); the same rows grouped below in Appendix A.

| group | root cause (commit) | edges | provenance | gate verdict should be |
|---|---|---|---|---|
| RC1 | the baseline list never matched the tree it was committed with (`9240cbe1`) | 93 | OLD | accept: the edge is not new |
| RC2 | publish-engine P0.3 split the host port bag out of `type-registry.ts` into `tovu-publish-ports.ts` and renamed `PublishContentPorts` → `TovuPublishPorts` (`6fd46c35`) | 21 | 13 MOVED, 8 RENAMED | accept: same names, same feature pairs |
| RC3 | import-cycle S5: `StaticSitePackagerPort` owned by source-control, implemented in site-backup (`5ef062bf`) | 3 | 2 MOVED (`ExportReport`), 1 NEW (designed) | accept: approved design |
| RC4 | import-cycle S3b: `bindSourceControlWritePort` moved to `source-control/write-port.ts` (`a9965c88e`) | 1 | NEW (designed) | accept: approved design |
| RC5 | ratchets-arch repointed `purgeMedia` from `media/purge-media.ts` to `media/index.ts` (`73020166`) | 1 | MOVED | accept: same name, now through the index |
| RC6 | the Soon lock (`1a4fb72f`, 2026-11-10, after the baseline) made site-backup import `findSoonAgentPlugin` from a private agent-plugins file | 1 | NEW | **remove** (sheet S1) |

Provenance rules (`classify-edges.py`): **OLD** = the same file edge exists in the `9240cbe1` tree; **MOVED** = a new file edge, but every imported name already crossed the same feature pair at `9240cbe1`; **RENAMED** = the same after mapping `PublishContentPorts=TovuPublishPorts`; **NEW** = anything else.

Attribution commands:

```bash
git show 6fd46c35 --stat --format=   # RC2: creates tovu-publish-ports.ts and touches all 12 contributor files of the 21 edges
git show 6fd46c35 -- apps/website/src/features/media/publish-content.ts | grep '^[-+].*Ports'   # -PublishContentPorts / +TovuPublishPorts
git show 5ef062bf --stat --format= | grep static-site-packager                                    # RC3
git log origin/refactor/import-cycle-b --format='%h %s' -S'findSoonAgentPlugin' -- apps/website/src/features/site-backup/   # RC6: 1a4fb72f
git log origin/refactor/import-cycle-b --format='%h %s' -G'features/media/index' -- apps/website/src/features/forms/form-file-maintenance.ts   # RC5: 73020166
```

## 3. Wrong rule (or wrong baseline) vs real tangle — with proof

The gate rule (`check-architecture.ts:189-191`, `:264-285`) is: *the exact set of directed file imports between distinct features may not grow; a new edge may not be offset by a removed one.* It counts type-only imports and imports into an `index.ts`. That rule is deliberate and this design keeps it. What is wrong is the data it compares against, and the fact that a path-keyed rule cannot tell a moved import from a new dependency. A real tangle is coupling that no reviewed decision created.

### 3.1 RC1 — wrong baseline (93): the gate itself says the list never matched its commit

```bash
git show 9240cbe1:development/scripts/check-architecture.baseline.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).crossFeatureEdges.length))'
# 445
git log --format='%h %s' -S'"crossFeatureEdges"' -- development/scripts/check-architecture.baseline.json
# 9240cbe1 docs(reports): X2-F report corrections — ...   (the list's only creation)
git worktree add /tmp/t9240 9240cbe1 && ln -s "$PWD/node_modules" /tmp/t9240/node_modules
(cd /tmp/t9240 && npx tsx development/scripts/check-architecture.ts 2>&1 | grep -c 'NEW cross-feature edge')
# 107      <- the gate is red at the commit that wrote its own baseline (facts/check-architecture.9240cbe1.txt)
git checkout origin/main && npx tsx development/scripts/check-architecture.ts 2>&1 | grep -c 'NEW cross-feature edge'
# 107      <- origin/main 0df57a3a, same verdict (facts/check-architecture.main-0df57a3a.txt)
LC_ALL=C comm -12 designs/arch-120/facts/new-edges.head.txt <(awk -F'\t' '{print $1" -> "$2}' designs/arch-120/facts/imports.9240cbe1.tsv | LC_ALL=C sort -u) | wc -l
# 93       <- of today's 120, these already existed in that tree
```

Of the 107 red at `9240cbe1`, 93 are still in the tree today and 14 were removed since. The ratchets-arch report's reading ("they come from terra's moves and splits") is right for 27 of the 120 and wrong for these 93. Accepting them borrows no credit: the edge was already there when the ratchet was set. They split as 59 downward value imports, 19 downward type imports, 1 same-rank type import (`project-keys → webhooks`, both rank 0) and 14 upward type imports.

### 3.2 RC2, RC3 (MOVED part), RC5 — the rule is path-keyed; these are moves (22 edges incl. the 8 renames below)

For each MOVED edge every imported name already crossed the same feature pair at `9240cbe1` (column `names` of `EDGES.tsv`; the old crossing is a row of `facts/imports.9240cbe1.tsv`). Example, E035: `forms/form-file-maintenance.ts → media/index.ts` imports `purgeMedia`; at `9240cbe1` the same file imported `purgeMedia` from `media/purge-media.ts`. Moving to the index *reduces* exposure; the gate still calls it new.

```bash
grep -P 'forms/form-file-maintenance.ts\tapps/website/src/features/media/' designs/arch-120/facts/imports.9240cbe1.tsv designs/arch-120/facts/imports.head.tsv
```

### 3.3 RC2 RENAMED (8) — one symbol renamed

`6fd46c35` renamed `PublishContentPorts` (in `type-registry.ts`) to `TovuPublishPorts` (in `tovu-publish-ports.ts`) and its commit message says "No re-export is left behind: 23 files that imported a bag type are repointed (29 names)". The 8 contributor files imported `PublishContentPorts` from publish-content at `9240cbe1`:

```bash
grep -P '\tpublish-content\t' designs/arch-120/facts/imports.9240cbe1.tsv | grep PublishContentPorts | cut -f1,6
```

### 3.4 RC3 E095 and RC4 E112 — new on purpose, decided by the approved import-cycle design (rev 2, judged)

| edge | decision in `plan/import-cycle-design-2026-11-16:designs/import-cycles/DESIGN.md` | rank |
|---|---|---|
| E095 `site-backup/static-site-packager.ts → source-control/index.ts` (`StaticSitePackagerPort`, `StaticSitePackage`, `StaticSiteIdentity`, type-only) | §2.5, lines 238-260: the port is consumer-owned (source-control), the implementation lives in site-backup "beside the code it calls" | 8 → 6, down |
| E112 `source-control/write-port.ts → custom-credentials/write-files-validation.ts` (`validateRepositoryTarget`, value) | §2.3(b), line 172: "it keeps calling `validateRepositoryTarget` from `custom-credentials`; that direction is downward, rank 6 → 3"; line 502(b) keeps its positional args for that file's DEDUPE row | 6 → 3, down |

```bash
git show origin/plan/import-cycle-design-2026-11-16:designs/import-cycles/DESIGN.md | sed -n '172p;238,260p;502p'
```

The gate is right to stop on these (they are new coupling); the decision already exists, so the action is to record it, with the citation, in the accept list.

### 3.5 RC6 E085 — the one real tangle

`site-backup/import-plugin-state.ts:4` value-imports `findSoonAgentPlugin` from `agent-plugins/soon-lock.ts` and calls it with `lifecycle.soonCatalog` (`:43`). No design decided this; it came with the Soon-lock feature (`1a4fb72f`). `soon-lock.ts`'s own header says who owns the decision: *"This module imports no lifecycle code: `lifecycle.ts` binds it into the enable paths of the activation owner, and boot passes the same ports."* The lifecycle owner already holds the bound catalog (`lifecycle.ts:159-168`, `buildPolicyGuardedMethods`), so the caller should ask the owner instead of re-binding the policy itself.

### 3.6 What stays a tangle after the gate is green (and who owns it)

Accepting an edge into the baseline changes nothing in the code graph: the SCCs are computed from the tree, not from the baseline. After S1-S3:

```bash
python3 designs/arch-120/tools/feature-scc.py designs/arch-120/facts/imports.head.tsv
# type-inclusive: one SCC of 25 features; runtime-only: []
```

23 of the accepted edges are **upward type-only** imports (14 OLD + the 9 `publish-content/tovu-publish-ports.ts → <contributor>` edges of RC2). They are inside that type SCC. They are allowed by the owner-approved rank rule (`feature-rank:<n>` filters `type-only`/`type-import`, `.dependency-cruiser.mjs:844-870`) and they are **lane T's** open question (import-cycle DESIGN line 543, Q3: "is zero runtime cycles the finish line, with the type-only edges as a ratchet?"), which `2026-11-17-OWNER-DECISIONS-ANSWERED.md` does not answer. This design does not decide it (lesson 27: no stricter rule than the owner approved). The publish bag's own future is decided by the publish-engine design (`plan/publish-engine-design-2026-11-16:designs/publish-engine/DESIGN.md` lines 322, 494, 572: "Tovu keeps `tovu-publish-ports.ts`"; F1 removes the P0.3 default). Moving that bag here would relitigate an approved plan (lesson 10).

## 4. Per group: target owner, the smallest change, rejected alternatives

### RC6 (E085) — owner: `agent-plugins` lifecycle (the activation owner). Change: sheet S1.

Add one bound method to the lifecycle object, next to the other Soon-policy wrappers in `buildPolicyGuardedMethods` (`lifecycle.ts:159`):

```ts
findSoonPlugin: (input: { workspaceRoot: string; pluginId: string }, _optional: Record<string, never> = {}) => findSoonAgentPlugin({ catalog: soonCatalog, ...input }),
```

`import-plugin-state.ts` calls `lifecycle.findSoonPlugin({ workspaceRoot: workspace.root, pluginId: plugin.id })` and deletes its `soon-lock` import. The edge `site-backup/import-plugin-state.ts → agent-plugins/lifecycle.ts` already exists in the baseline (the file already calls `createTovuAgentPluginLifecycle`), so nothing new appears: the gate goes 120 → 119 lines, all of them already in the base output. Behaviour is unchanged (same function, same catalog object, same arguments), and the existing characterization test fails if the Soon check is dropped (proved, §6).

Rejected:

| alternative | why not |
|---|---|
| Accept the edge | No decision ever made it; it imports a private policy file of another feature when the policy owner already exposes bound methods. |
| Inject a `findSoon` port into `restoreImportedPluginState` from the composition root | `restoreImportedPluginState` builds its own lifecycle today (`import-plugin-state.ts:31`); threading a port through the backup import chain touches `backup-service`, routes and both roots for one call. |
| Let `setAgentPluginActivation` refuse Soon plugins | Changes behaviour for boot and every other caller; the import must write Soon plugins *off* without aborting (soon-lock test "a backup import writes a Soon plugin off and carries the rest"). |
| Move `findSoonAgentPlugin` into site-backup | Duplicates owner policy; `lifecycle.ts`, `bootstrap.ts` and `agent-plugin-service-ports.ts` use the same function. |

### RC1, RC2, RC3 (MOVED), RC5 — owner: the gate's baseline data. Change: sheets S2 + S3.

S2 adds `development/scripts/accept-architecture-edges.ts`: it runs the unchanged gate, reads a reviewed TSV (`edge`, `class` ∈ {OLD, MOVED, RENAMED, DESIGNED}, non-empty `evidence`), and writes **only** `crossFeatureEdges` (baseline ∪ listed ∩ currently-NEW) back into `check-architecture.baseline.json` with the same writer `--update` uses (`JSON.stringify(x, null, 2) + "\n"`, `check-architecture.ts:866`). It refuses a listed edge that is not currently NEW (stale or mistyped) and never touches another key. S3 copies the reviewed list (`ACCEPTED-EDGES.tsv`, 119 rows) to `development/boundaries/accepted-cross-feature-edges.tsv` as the permanent audit trail and runs the tool.

Rejected:

| alternative | why not |
|---|---|
| `check:architecture --update` | Rewrites every metric: it would freeze the warn-tier regressions (propagation runtime 3.06 → 3.18, hubs 335 → 367) and re-freeze the hub medians, which the gate's own comment (`:221-248`) says needs a deliberate decision. |
| Hand-edit 119 lines into the JSON | Unreviewable and error-prone; no record of *why* an edge was accepted (ratchets-arch did 11 by hand and stopped there for this reason). |
| Change the rule to key edges by (feature pair, imported symbol) | Needs the TypeScript checker inside the gate (dependency-cruiser gives no names), and a renamed symbol (RC2) would still trip it. A large change to make 26 edges pass; the accept list does it with an explicit record. |
| Edit `check-architecture.ts` to add the flag | `main` there is already 248 lines and the file 615 code lines (eslint limits command, `facts/` not needed: run it on the file); any added branch grows debt. A separate script that calls the gate leaves it untouched. |
| Prune the 124 stale baseline entries in the same sheets | Worth doing (a stale entry silently allows a removed edge to come back), but the gate does not print the full current list and its baseline path is fixed (`check-architecture.ts:69`), so pruning needs a change inside the 615-line file. Listed as follow-up F-1, not needed to unblock. |

### RC2 RENAMED + MOVED, RC3, RC4 — owner of the code: publish-engine lane (RC2), import-cycle design (RC3, RC4). Change: none beyond the accept list.

Rejected for RC2: move `TovuPublishPorts` to `server/runtime/composition/` and make the engine generic now (publish-engine F1/P0.4 already schedules the generic engine; doing it here collides with `wave2/publish-p0-rest` and `wave3/su-cms`, which both edit `tovu-publish-ports.ts`). Rejected for RC4: inject `validateRepositoryTarget` into `bindSourceControlWritePort` from `composition/credentials-host-ports.ts` (2 product files + 6 test files to undo an approved design's explicit choice; no rank, cycle or surface number moves: the pair `source-control → custom-credentials` keeps three other value edges, and `write-files-validation.ts` stays exposed through `site-backup/backup-service.ts:26`); moving the function into source-control (it throws `CustomCredentialValidationError`, so source-control would gain an edge to `custom-credentials/store.ts`; lesson 7: keep the domain error).

## 5. Order

```
S1  remove E085 (product code, red test first)            gate 120 -> 119 NEW lines (all in base output)
S2  accept tool + tests (dev tooling only)                gate unchanged (119)
S3  regenerate facts on the live base, apply the list     gate exit 0
```

S1 first, so the accept list never contains the tangle (`make-accepted.py` exits 1 while E085 is present). S2 before S3 because S3 uses the tool. Every commit is judged on "no new line beyond the base output" (owner decision BASE-RED); only S3's commit turns `check:architecture` green.

## 6. Dry run (proof that the order ends green)

On the facts base, locally, nothing pushed: the S1 code change + S1's two red-first tests + the 119 accepted edges merged into the baseline. Patch: [`facts/dry-run-S1-S3.patch`](facts/dry-run-S1-S3.patch).

| check | result |
|---|---|
| `npm run check:architecture` | **exit 0**: "OK: hard constraints hold, but 2 ratchet metric(s) regressed" (the two warn-tier metrics of the base); `cross-feature import edges 426`; API surface 821 |
| `soon-lock.unit.test.ts` with S1 | 10 pass / 0 fail |
| same, S1 code reverted (tests kept) | 8 pass / **2 fail** (the two new tests): red-first holds |
| same, S1 + the Soon check replaced by `true` in `import-plugin-state.ts` | 9 pass / **1 fail** ("a backup import writes a Soon plugin off…"): the characterization catches a dropped gate |
| `npx tsc -p tsconfig.json --noEmit`; `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` | 0 / 0 (after building `@tovu/sdk`) |
| `check:boundaries`, `check:size`, `check:complexity`, `check:hooks`, `check:why-comments` | identical to the base output [`facts/base-gates.f0613d9e.txt`](facts/base-gates.f0613d9e.txt) (15 boundaries errors; size ok 202/192; 1 inherited why-comment block `ac521b7d86c5` in `server/routes/types.ts`) |
| eslint limits command on `lifecycle.ts`, `import-plugin-state.ts` | no findings |

## 7. Owner rules, checked

| rule | how this design meets it |
|---|---|
| No package above domains; packages state a contract, Tovu wires it | No package changes. The one code move keeps the Soon decision with its owner (agent-plugins lifecycle). |
| No re-export shells / forwarders: delete + repoint | `findSoonPlugin` is a binding (it closes over the owner's `soonCatalog`, like `setAgentPluginEnabled` beside it), not a re-export; the `soon-lock` import in site-backup is deleted, the caller repointed. |
| Ports / DI | Nothing new is reached around a port; the accepted designed edges (E095, E112) are the approved DI moves. |
| API args (required, optional = {}) | `findSoonPlugin(input, _optional = {})`; all new script functions in S2 take `(required, _optional = {})`. |
| Hooks injected as props | No React code touched. |
| No `vi.mock` of another package's internals | No mocks; S1 tests drive a real temp agent-plugins root through the existing `installed()` helper. |
| Functions ≤ 50, complexity ≤ 10, files ≤ 500 | S1 adds one line inside a 23-line function; S2's new file is planned at < 150 lines with every function < 30 lines; each sheet runs the eslint limits command against the base. |
| Why-comments move | S1 keeps the `import-plugin-state.ts:40-41` comment in place (the call it explains stays on that line); S1 adds one comment line; each sheet runs `check:why-comments` and compares with the base. |
| Every commit green | Each sheet's gate block compares against the base output and STOPs on any new line. |
| Failing test first for bugs | S1 starts with two tests that are red on the base (proved, §6). |

## 8. Lessons applied (`plan/reconcile-2026-11-16:reconcile/LESSONS-FOR-DESIGN-BRIEFS.md`, 47)

Applied directly: 1 (graph from real imports, not names), 2 (inventory: 427 edges, both callers of `findSoonAgentPlugin` outside agent-plugins, the source-reading test `wiring-identity.test.ts` row 7 which lists `import-plugin-state.ts` as an owner-builder file and is unaffected because S1 adds no builder), 3 (late reads: `soonCatalog` is a const built before `buildPolicyGuardedMethods`; the binding reads it at call time, same as its neighbours), 5 and 30 (each sheet compiles alone; S2 does not depend on S3), 6 (mutation run in §6), 7 (`findSoonAgentPlugin`'s `undefined | { name }` contract kept), 8 and 41 (eslint limits command per sheet), 10 and 42 (publish-engine owns the bag; collision table in `INDEX.md`), 11 (every command here was run; the dev-script test runner `node --import tsx --test development/scripts/__tests__/check-architecture.test.ts` passes 4/4 on the base), 15, 22 (rank rule's type filter depends on no `verbatimModuleSyntax`, unchanged), 27 (no stricter-than-approved rule for lane T), 29 (sheets have no shared appendix; each is self-contained), 31 (characterize, never invent: the Soon behaviour is pinned by an existing test), 40 (STOP commands only in fenced blocks, each one tested to fire), 43 and 44 (facts regenerated on the exact base; S3 regenerates again on its own base), 45 (each sheet runs whole test folders of every touched feature), 46 (why-comments gate), 47 (link script covers root, `apps/admin`, `apps/site-chat`; desktop not touched by any sheet). Not applicable (no such code touched): 4, 9, 12-14, 16-21, 23-26, 28, 32-39.

## 9. Follow-ups this design does not schedule

- **F-1 prune**: 124 baseline entries name edges that no longer exist (`baseline 431, current 427, stale 124, new 120`). Needs the gate to expose its current edge list (a small exported function, split out of `check-architecture.ts` so the 615-line file shrinks rather than grows).
- **F-2 lane T**: the 37 upward type-only edges (23 of them in this list) wait for the owner's answer to import-cycle Q3.
- **F-3 CI**: `check:architecture` was red on `origin/main` from the day its baseline landed and nothing noticed. Whether it belongs in CI is an owner call.

## Appendix A — all 120 edges by root cause

Generated from `facts/EDGES.tsv` (columns: id, feature pair, import kind, rank direction from `development/boundaries/feature-ranks.json`, provenance, imported names, source → target).

### RC1 — stale baseline: the edge is in the tree of 9240cbe1 (93)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E001 | agent-plugins->api-connections | type | UP(0->4) | OLD | ApiConnectionConnectStatus | `agent-plugins/service-ports.ts` → `api-connections/connect.ts` |
| E002 | agent-plugins->api-connections | type | UP(0->4) | OLD | DeclaredApiConnection | `agent-plugins/service-ports.ts` → `api-connections/contribution.ts` |
| E003 | agent-plugins->external-mcp | type | UP(0->5) | OLD | ExternalMcpConnectStart | `agent-plugins/service-ports.ts` → `external-mcp/contracts.ts` |
| E004 | api-connections->agent-plugins | type | down(4->0) | OLD | LoadPluginContributions | `api-connections/host-bindings.ts` → `agent-plugins/lifecycle.ts` |
| E005 | api-connections->custom-credentials | type | down(4->3) | OLD | CustomCredentialSetRepoPort | `api-connections/host-bindings.ts` → `custom-credentials/index.ts` |
| E006 | api-connections->project-keys | type | down(4->0) | OLD | KeyAttachments, ProjectKeyTransaction | `api-connections/shared-api.ts` → `project-keys/attachments.ts` |
| E007 | api-connections->project-keys | type | down(4->0) | OLD | SiteOAuthBindings | `api-connections/shared-api.ts` → `project-keys/site-references.ts` |
| E008 | asset-transfer->media | value | down(5->2) | OLD | saveLibraryDocument | `asset-transfer/asset-destinations.ts` → `media/index.ts` |
| E009 | asset-transfer->theme | value | down(5->4) | OLD | THEME_WRITE_PERMISSION, ThemeToolDeps, assertThemeFileWritable, findThemeOrThrow, nextAvail… | `asset-transfer/asset-destinations.ts` → `theme/asset-operations.ts` |
| E010 | asset-transfer->theme | value | down(5->4) | OLD | findThemeOrThrow, sniffThemeImportType | `asset-transfer/asset-sources.ts` → `theme/asset-operations.ts` |
| E011 | asset-transfer->media | value | down(5->2) | OLD | createDocumentArchiveReader | `asset-transfer/copy-tool.ts` → `media/document-archive.ts` |
| E012 | asset-transfer->theme | value | down(5->4) | OLD | THEME_IMPORT_ACCEPT, THEME_IMPORT_MAX_BYTES, THEME_IMPORT_POLICY, isShapeRejection | `asset-transfer/copy-tool.ts` → `theme/asset-operations.ts` |
| E014 | custom-credentials->project-keys | type | down(3->0) | OLD | ProjectKeysPort | `custom-credentials/credential-copy-tool.ts` → `project-keys/service.ts` |
| E015 | custom-credentials->deployments | type | UP(3->8) | OLD | DeployTargetRegistry | `custom-credentials/tool-registrations.ts` → `deployments/contracts.ts` |
| E016 | custom-credentials->settings | value | down(3->2) | OLD | resolveOperatorLocale | `custom-credentials/tool-registrations.ts` → `settings/index.ts` |
| E017 | custom-credentials->project-keys | value | down(3->0) | OLD | ProjectKeyCreateConflictError | `custom-credentials/tovu-credential-sets.ts` → `project-keys/create-vault.ts` |
| E018 | custom-credentials->vendor-credentials | value | down(3->0) | OLD | credentialCreateTarget, credentialScopes | `custom-credentials/tovu-credential-sets.ts` → `vendor-credentials/index.ts` |
| E019 | custom-credentials->project-keys | type | down(3->0) | OLD | SiteGrantedVault | `custom-credentials/vault-repo.ts` → `project-keys/attached-vault.ts` |
| E020 | database-transfer->settings | value | down(3->2) | OLD | resolveOperatorLocale | `database-transfer/tool-registrations.ts` → `settings/index.ts` |
| E021 | deployments->webhooks | value | down(8->0) | OLD | fingerprintSiteKeyHex, parseSiteKeyHex, revealSiteKeyMaterial, siteKeySourcesForSiteDir | `deployments/deploy-ops/run-ops.ts` → `webhooks/index.ts` |
| E022 | deployments->settings | value | down(8->2) | OLD | resolveOperatorLocale | `deployments/deploy-ops/typed-secret-card.ts` → `settings/index.ts` |
| E023 | deployments->settings | value | down(8->2) | OLD | resolveOperatorLocale | `deployments/publish-agent-tools.ts` → `settings/index.ts` |
| E024 | deployments->project-keys | value | down(8->0) | OLD | ProjectKeyCreateConflictError | `deployments/publish-credentials/store.ts` → `project-keys/create-vault.ts` |
| E025 | deployments->vendor-credentials | value | down(8->0) | OLD | ScopedCredentialDeps, VendorCredentialSetRecord, VendorCredentialSetRepoPort, credentialCr… | `deployments/publish-credentials/store.ts` → `vendor-credentials/index.ts` |
| E026 | deployments->consent | value | down(8->7) | OLD | deploymentRefusal | `deployments/static-publish/publish-consent.ts` → `consent/service.ts` |
| E028 | entries->taxonomy | value | down(4->2) | OLD | TERM_SYNC_PERMISSION, prepareTermSync, readTermIds | `entries/publish-content.ts` → `taxonomy/term-sync.ts` |
| E029 | entries->media | value | down(4->2) | OLD | invalidateMediaAccessEvidence | `entries/repo.ts` → `media/access-evidence.ts` |
| E030 | entries->media | value | down(4->2) | OLD | invalidateMediaAccessEvidence | `entries/trash-aware-memory-repo.ts` → `media/access-evidence.ts` |
| E031 | entries->content-types | value | down(4->2) | OLD | DECLARED_CONTENT_TYPE_OWNERS | `entries/unreadable-owner-entries-repair.ts` → `content-types/index.ts` |
| E032 | external-mcp->api-connections | value | down(5->4) | OLD | hostedMcpSignInLink | `external-mcp/external-mcp-oauth.ts` → `api-connections/browser-binding.ts` |
| E033 | external-mcp->webhooks | type | down(5->0) | OLD | SecretSealerPort | `external-mcp/external-mcp-store.ts` → `webhooks/index.ts` |
| E034 | external-mcp->settings | value | down(5->2) | OLD | resolveOperatorLocale | `external-mcp/tool-registrations.ts` → `settings/index.ts` |
| E037 | image-transform->theme | value | down(6->4) | OLD | isShapeRejection | `image-transform/tool.ts` → `theme/asset-operations.ts` |
| E038 | mail-status->settings | type | down(5->2) | OLD | MailTestModeSetting | `mail-status/test-send.ts` → `settings/index.ts` |
| E039 | mail-status->newsletter | value | down(5->0) | OLD | LaunchGateDeps, LaunchGatePrecondition, evaluateLaunchGate | `mail-status/use-readiness.ts` → `newsletter/index.ts` |
| E040 | mail->settings | type | down(4->2) | OLD | MailTestModeSetting | `mail/attempts.repo.ts` → `settings/index.ts` |
| E041 | media-generation->settings | value | down(3->2) | OLD | resolveOperatorLocale | `media-generation/providers-tools.ts` → `settings/index.ts` |
| E042 | media-generation->media | value | down(3->2) | OLD | withChatPreview | `media-generation/tool-registrations.ts` → `media/chat-preview.ts` |
| E043 | media-import->fs-files | value | down(3->0) | OLD | FS_FOLDER_READ_RECOVERY | `media-import/agent-tools.ts` → `fs-files/site-file-request.ts` |
| E044 | media-import->media | value | down(3->2) | OLD | withChatPreview | `media-import/tool-registrations.ts` → `media/chat-preview.ts` |
| E045 | media->post | type | UP(2->6) | OLD | PostRecord | `media/access-evidence.ts` → `post/post.ts` |
| E046 | media->publish-content | type | down(2->1) | OLD | MediaSourceReplacement | `media/import-media-entity.ts` → `publish-content/type-registry.ts` |
| E049 | media->post | type | UP(2->6) | OLD | PostRepoPort | `media/where-used.ts` → `post/contracts.ts` |
| E050 | member-login->members | type | down(4->0) | OLD | MemberRecord | `member-login/link-policy.ts` → `members/index.ts` |
| E051 | member-login->members | value | down(4->0) | OLD | MemberExternalIdentityRecord, MemberExternalIdentityRepoPort, MemberRecord, MemberSignInRe… | `member-login/link-service.ts` → `members/index.ts` |
| E053 | object-storage->deployments | type | UP(1->8) | OLD | DeployTargetCredential | `object-storage/artifact-provider.ts` → `deployments/contracts.ts` |
| E054 | object-storage->deployments | type | UP(1->8) | OLD | DeployHostKit | `object-storage/registry.ts` → `deployments/contracts.ts` |
| E055 | pages->post | type | down(7->6) | OLD | PostKind | `pages/html-document-store.memory.ts` → `post/contracts.ts` |
| E056 | pages->post | type | down(7->6) | OLD | PostKind, PostRepoPort, PostStatus | `pages/html-document-store.ts` → `post/contracts.ts` |
| E057 | pages->post | value | down(7->6) | OLD | SYSTEM_ACTOR_ID, announcePendingGoLive | `pages/html-document-store.ts` → `post/index.ts` |
| E058 | plugin-runtime->post | type | UP(0->6) | OLD | PostRecord | `plugin-runtime/service-ports.ts` → `post/index.ts` |
| E060 | post->taxonomy | value | down(6->2) | OLD | TERM_SYNC_PERMISSION, prepareTermSync, readTermIds, withTermIds | `post/publish-content.ts` → `taxonomy/term-sync.ts` |
| E061 | post->media | value | down(6->2) | OLD | invalidateMediaAccessEvidence | `post/repo.memory.ts` → `media/access-evidence.ts` |
| E062 | post->media | value | down(6->2) | OLD | invalidateMediaAccessEvidence | `post/repo.ts` → `media/access-evidence.ts` |
| E063 | project-keys->api-connections | type | UP(0->4) | OLD | SharedOAuthOwnerStorage | `project-keys/shared-oauth-disconnect.ts` → `api-connections/shared-owner.ts` |
| E064 | project-keys->webhooks | type | same(0->0) | OLD | KeyringPort, SecretSealerPort | `project-keys/site-sealer.ts` → `webhooks/index.ts` |
| E065 | publish-content->webhooks | value | down(1->0) | OLD | scanTextForSecrets | `publish-content/backstop-policy.ts` → `webhooks/index.ts` |
| E066 | publish-content->webhooks | value | down(1->0) | OLD | scanTextForSecrets | `publish-content/file-tree-policy.ts` → `webhooks/index.ts` |
| E067 | publish-content->deployments | type | UP(1->8) | OLD | PublishHistoryStore, PublishTrigger | `publish-content/peer-transport.ts` → `deployments/static-publish/index.ts` |
| E068 | publish-content->post | type | UP(1->6) | OLD | PostRecord | `publish-content/push-plan.ts` → `post/contracts.ts` |
| E069 | publish-content->deployments | type | UP(1->8) | OLD | PublishHistoryStore | `publish-content/tool-deps.ts` → `deployments/static-publish/index.ts` |
| E070 | publish-content->deployments | type | UP(1->8) | OLD | PublishHistoryStore | `publish-content/tool-registrations.ts` → `deployments/static-publish/index.ts` |
| E080 | seo->post | value | down(7->6) | OLD | CoverImage, CoverMedia, collectCoverMediaRefs, resolveCoverImage | `seo/cover-image.ts` → `post/rendering.ts` |
| E082 | site-backup->agent-plugins | value | down(8->0) | OLD | SELECTED_AGENT_PLUGIN_PACKAGES | `site-backup/bundled-export-file-policy.ts` → `agent-plugins/bundled-catalog.ts` |
| E083 | site-backup->theme | value | down(8->4) | OLD | NO_THEME_ID | `site-backup/import-keep-off.ts` → `theme/active-theme.ts` |
| E084 | site-backup->widgets | value | down(8->7) | OLD | sanitizePageHtml | `site-backup/import-keep-off.ts` → `widgets/media-html.ts` |
| E086 | site-backup->theme | value | down(8->4) | OLD | checkSourceDirContainment, loadTheme | `site-backup/import-restore-placement.ts` → `theme/catalog.ts` |
| E087 | site-backup->agent-plugins | value | down(8->0) | OLD | listBundledAgentPluginServers | `site-backup/package-file-inventory.ts` → `agent-plugins/new-site-agent-plugin-tokens.ts` |
| E088 | site-backup->theme | value | down(8->4) | OLD | NO_THEME_ID | `site-backup/share-backend.ts` → `theme/index.ts` |
| E089 | site-backup->settings | value | down(8->2) | OLD | PUBLISHABLE_SETTINGS | `site-backup/share-database/repo.sqlite.ts` → `settings/contracts.ts` |
| E090 | site-backup->site-export | value | down(8->5) | OLD | downloadForms | `site-backup/static-copy.ts` → `site-export/export-html-policy.ts` |
| E091 | site-backup->site-export | type | down(8->5) | OLD | ExportReport | `site-backup/static-copy.ts` → `site-export/site-exporter.ts` |
| E092 | site-backup->post | value | down(8->6) | OLD | extractPlainTextFromHtml | `site-backup/static-download-landing.ts` → `post/html-plain-text.ts` |
| E093 | site-backup->site-export | value | down(8->5) | OLD | downloadDocumentBase | `site-backup/static-download-layout.ts` → `site-export/export-html-policy.ts` |
| E096 | site-export->webmcp | value | down(5->0) | OLD | injectPublishedWebMcp | `site-export/export-html-policy.ts` → `webmcp/published-html.ts` |
| E097 | site-export->media | value | down(5->2) | OLD | ContentTypeDeps, resolveContentTypes | `site-export/media-original-urls.ts` → `media/index.ts` |
| E098 | site-inspection->theme | value | down(5->4) | OLD | NO_THEME_ID | `site-inspection/site-profile.ts` → `theme/active-theme.ts` |
| E099 | site-inspection->theme | value | down(5->4) | OLD | themeIdCandidates | `site-inspection/site-profile.ts` → `theme/theme-id-aliases.ts` |
| E100 | site-search->members | type | down(7->0) | OLD | MemberContext | `site-search/access.ts` → `members/index.ts` |
| E101 | site-search->post | type | down(7->6) | OLD | PostKind | `site-search/access.ts` → `post/contracts.ts` |
| E102 | site-search->members | value | down(7->0) | OLD | resolvePostMemberAccess | `site-search/cms-document-source.ts` → `members/index.ts` |
| E103 | site-search->post | type | down(7->6) | OLD | PostKind | `site-search/cms-document-source.ts` → `post/contracts.ts` |
| E104 | site-search->post | value | down(7->6) | OLD | toPostSearchDocument, toRecord | `site-search/cms-document-source.ts` → `post/read-model.ts` |
| E105 | site-search->settings | value | down(7->2) | OLD | set | `site-search/settings.ts` → `settings/index.ts` |
| E106 | sites->agent-plugins | type | down(1->0) | OLD | PluginCredentialsPort | `sites/site-admin.ts` → `agent-plugins/service-ports.ts` |
| E107 | source-control->settings | value | down(6->2) | OLD | resolveOperatorLocale | `source-control/credential-setup.ts` → `settings/index.ts` |
| E109 | source-control->project-keys | value | down(6->0) | OLD | ProjectKeyCreateConflictError | `source-control/store.ts` → `project-keys/create-vault.ts` |
| E110 | source-control->vendor-credentials | value | down(6->0) | OLD | CredentialScope, ScopedCredentialDeps, credentialCreateTarget, credentialHint, credentialSc… | `source-control/store.ts` → `vendor-credentials/index.ts` |
| E111 | source-control->custom-credentials | value | down(6->3) | OLD | CustomCredentialSetRepoPort, describeCredentialByLabel, resolveCustomCredentialByLabel | `source-control/tool-registrations.ts` → `custom-credentials/index.ts` |
| E116 | theme->settings | type | down(4->2) | OLD | set | `theme/preview-switcher-tools.ts` → `settings/index.ts` |
| E117 | theme->navigation | value | down(4->2) | OLD | menuLinkRelAttr, renderHtmlMenu | `theme/static-render.ts` → `navigation/render-entry.ts` |
| E118 | trash->redirects | value | down(3->2) | OLD | REDIRECT_TABLES | `trash/adapters/redirect.ts` → `redirects/index.ts` |
| E119 | widgets->post | value | down(7->6) | OLD | BeforeSaveHookPort, ForgetRemovedPostFn, PostNotFoundError, PostRecord, PostRepoPort, PostVe… | `widgets/deps.ts` → `post/post.ts` |

### RC2 — publish-engine P0.3 split of `type-registry.ts` (6fd46c35) (21)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E013 | content-types->publish-content | type | down(2->1) | RENAMED | TovuPublishPorts | `content-types/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E027 | entries->publish-content | type | down(4->1) | MOVED | EntryPublishPorts | `entries/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E036 | forms->publish-content | type | down(3->1) | RENAMED | TovuPublishPorts | `forms/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E047 | media->publish-content | type | down(2->1) | RENAMED | TovuPublishPorts | `media/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E048 | media->publish-content | type | down(2->1) | RENAMED | TovuPublishPorts | `media/verify-published-media.ts` → `publish-content/tovu-publish-ports.ts` |
| E052 | navigation->publish-content | type | down(2->1) | RENAMED | TovuPublishPorts | `navigation/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E059 | post->publish-content | type | down(6->1) | RENAMED | TaxonomyPublishPorts, TovuPublishPorts | `post/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E071 | publish-content->content-types | type | UP(1->2) | MOVED | ContentTypeListPort, ContentTypeRepoPort, IndexProvisionerPort | `publish-content/tovu-publish-ports.ts` → `content-types/index.ts` |
| E072 | publish-content->entries | type | UP(1->4) | MOVED | EntryListExcludingTypesPort, EntryPublishReadPort | `publish-content/tovu-publish-ports.ts` → `entries/contracts.ts` |
| E073 | publish-content->entries | type | UP(1->4) | MOVED | EntryListPort, EntryRepoPort | `publish-content/tovu-publish-ports.ts` → `entries/index.ts` |
| E074 | publish-content->media | type | UP(1->2) | MOVED | AssetBlobRepoPort, BlobStorePort, MediaContentTypeStorePort, VersionedMediaRepoPort | `publish-content/tovu-publish-ports.ts` → `media/index.ts` |
| E075 | publish-content->navigation | type | UP(1->2) | MOVED | MenuRepoPort, NavLocationBindingRepoPort | `publish-content/tovu-publish-ports.ts` → `navigation/index.ts` |
| E076 | publish-content->post | type | UP(1->6) | MOVED | BeforeSaveHookPort, ForgetRemovedPostFn, PostRepoPort, RemovePostFn | `publish-content/tovu-publish-ports.ts` → `post/contracts.ts` |
| E077 | publish-content->taxonomy | type | UP(1->2) | MOVED | EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort | `publish-content/tovu-publish-ports.ts` → `taxonomy/contracts.ts` |
| E078 | publish-content->taxonomy | type | UP(1->2) | MOVED | ContentLookupPort, ContentTypeTaxonomyPolicyPort, EntryTermRepoPort, ImportableTaxonomyRep… | `publish-content/tovu-publish-ports.ts` → `taxonomy/index.ts` |
| E079 | publish-content->theme | type | UP(1->4) | MOVED | DiscoveredTheme | `publish-content/tovu-publish-ports.ts` → `theme/catalog.ts` |
| E081 | settings->publish-content | type | down(2->1) | RENAMED | TovuPublishPorts | `settings/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E113 | taxonomy->publish-content | type | down(2->1) | MOVED | TaxonomyPublishPorts | `taxonomy/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E114 | taxonomy->publish-content | type | down(2->1) | MOVED | TaxonomyPublishPorts | `taxonomy/publish-term-ids.ts` → `publish-content/tovu-publish-ports.ts` |
| E115 | theme->publish-content | type | down(4->1) | RENAMED | TovuPublishPorts | `theme/active-theme-publish-content.ts` → `publish-content/tovu-publish-ports.ts` |
| E120 | widgets->publish-content | type | down(7->1) | MOVED | WidgetPublishPorts | `widgets/publish-content.ts` → `publish-content/tovu-publish-ports.ts` |

### RC3 — import-cycle S5 packager port (5ef062bf) (3)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E094 | site-backup->site-export | type | down(8->5) | MOVED | ExportReport | `site-backup/static-site-packager.ts` → `site-export/index.ts` |
| E095 | site-backup->source-control | type | down(8->6) | NEW | StaticSiteIdentity, StaticSitePackage, StaticSitePackagerPort | `site-backup/static-site-packager.ts` → `source-control/index.ts` |
| E108 | source-control->site-export | type | down(6->5) | MOVED | ExportReport | `source-control/static-site-packager-port.ts` → `site-export/index.ts` |

### RC4 — import-cycle S3b write-port move (a9965c88e) (1)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E112 | source-control->custom-credentials | value | down(6->3) | NEW | validateRepositoryTarget | `source-control/write-port.ts` → `custom-credentials/write-files-validation.ts` |

### RC5 — index repoint (73020166) (1)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E035 | forms->media | value | down(3->2) | MOVED | purgeMedia | `forms/form-file-maintenance.ts` → `media/index.ts` |

### RC6 — Soon lock reaches into agent-plugins (1a4fb72f) (1)

| id | pair | kind | rank | provenance | names | source → target (under `apps/website/src/features/`) |
|---|---|---|---|---|---|---|
| E085 | site-backup->agent-plugins | value | down(8->0) | NEW | findSoonAgentPlugin | `site-backup/import-plugin-state.ts` → `agent-plugins/soon-lock.ts` |
