# arch-120 — revision 2 (answers CODEX-JUDGE-1: REJECT)

Plan run `arch-120-rev2`, 2026-11-18. Documents only. Supersedes DESIGN.md §0–§6, `ACCEPTED-EDGES.tsv`, sheets S1–S3 and `tools/` (all withdrawn; git history keeps them).

**Base:** Tovu `origin/refactor/terra` = `b5fbf2a5e`; Jini `origin/refactor/terra` = `6c9effae` (built, linked). Node 24.22.3.
**Lane measured alongside:** `origin/wave3/import-cycle-b-2` = `2f6bfeed` (one commit on `b5fbf2a5e`, the Tovu half of import-cycle-b being re-applied).

## 0. Result

1. **No baseline waiver.** Revision 1 asked to accept 119 edges because of their history. Revision 2 accepts none by history. Each of the 120 edges is classified on its own, with evidence from the repo's own rules: **89 LEGITIMATE**, **31 TANGLE**.
2. **LEGITIMATE (89)** means the edge points strictly down `development/boundaries/feature-ranks.json`. No rule in `check:boundaries` fires on it, or the only rule that fires is `no-circular:warn`, where an UP edge in this list closes the cycle. The `crossFeatureEdges` ratchet is wrong for these edges: it keys on file paths, so it reports moves and renames as new coupling, and it judges a downward edge, which cannot close a cycle. **Narrow rule change R1:** the ratchet freezes only same-rank and upward edges, read from the same rank table `check:boundaries` uses. Three edges need a one-line rank correction (§3.2). The ratchet still includes type-only edges. An unranked feature fails closed.
3. **TANGLE (31)** is a real dependency that must be removed:
   - **7 upward value imports.** Lane `wave3/import-cycle-b-2` owns them. 2f6bfeed already removes 6 (`source-control → site-backup`). The 7th, `credential-ports.ts → source-control/provider-registry.ts`, is the import-cycle S3b move, which has not been re-applied yet.
   - **19 upward or same-rank type imports**, of which 17 close a feature cycle. Sheets M1 (2), P1 (6) and C1 (11) handle them.
   - **5 downward deep imports into `features/media` private files**, all `no-deep-imports:error` in `check:boundaries`. Sheet M1 handles them.
4. **`check:architecture` cannot exit 0 from this plan alone, and the plan says so.** The API-surface hard metric is 842 against a baseline of 821 on `b5fbf2a5e` and 839 on 2f6bfeed. This plan unexposes 5 files (4 through lane icb2, 1 through M1), and no sheet may expose a new one. The remaining ~17 need their own design (F-S, §7). The runtime mutual pair `site-backup ↔ source-control` is removed by lane icb2. It is a prerequisite here, not a sheet.
5. **Order:** R1, then M1 ∥ P1, then C1 (after `wave3/moves-b1`). `wave3/import-cycle-b-2` runs in parallel. Every gate runs the repo's own commands in one `set -euo pipefail` block ([INDEX.md § Gate block](INDEX.md#gate-block-g)). There are no bespoke gate scripts.

## 1. Re-derived edge list on `b5fbf2a5e`

Commands, all repo-owned, run from the Tovu root after the setup in INDEX.md:

```bash
npm run check:architecture  > check-architecture.txt 2>&1 || true   # exit 1; facts/check-architecture.b5fbf2a5e.txt
npm run check:boundaries    > check-boundaries.txt   2>&1 || true   # exit 15; facts/check-boundaries.b5fbf2a5e.txt
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type json > dc.json   # check:boundaries' graph, as JSON
npx depcruise apps/website/src --no-config --ts-pre-compilation-deps --ts-config tsconfig.json --do-not-follow node_modules --output-type json > raw.json   # check-architecture.ts cruise(), verbatim
```

Two plan-only evidence readers sit in [`rev2/`](rev2/). They are not gates and no sheet depends on them. `classify-edges.mjs` joins the gate's `NEW` lines with `dc.json` and the rank table. It exits 1 if a NEW edge is missing from the graph or the gate summary line is absent. `surface-and-edges.mjs` re-applies the gate's own `moduleOf`/`isTestFile` to `raw.json`, and its totals must equal the gate's printed numbers. They do: **427 / 842** on `b5fbf2a5e`, **424 / 839** on `2f6bfeed`, and **435 / 766** on `987cf88f6`.

| ref | NEW lines | LEGITIMATE | TANGLE value-up | TANGLE type-up/same | TANGLE deep | API surface | runtime module pairs | gate exit |
|---|---|---|---|---|---|---|---|---|
| `b5fbf2a5e` terra | 120 | 89 | 7 | 19 | 5 | 842 (> 821) | 4, of which 1 is new: `site-backup ↔ source-control` | 1 (3 hard metrics) |
| `2f6bfeed` icb2 lane | 117 | 92 | 1 | 19 | 5 | 839 | 3, none new | 1 (2 hard metrics) |

**What `wave3/import-cycle-b-2` (2f6bfeed) changes:**
- It **removes 6** TANGLE edges: `source-control/commit-site.ts →` `site-backup/{share-policy,share-zip,static-copy,static-download-landing,static-download-layout}.ts`, and `source-control/tool-registrations.ts → site-backup/static-download-landing.ts`.
- It **adds 3** downward type edges, all LEGITIMATE: `site-backup/static-site-packager.ts → source-control/index.ts` (8→6), `site-backup/static-site-packager.ts → site-export/index.ts` (8→5), and `source-control/static-site-packager-port.ts → site-export/index.ts` (6→5).
- It removes the runtime pair `site-backup ↔ source-control` and unexposes 4 site-backup files.
- What it does **not yet** remove is `custom-credentials/credential-ports.ts → source-control/provider-registry.ts`. The original import-cycle-b, `f0613d9e5`, removed this edge with S3b (`bindSourceControlWritePort` moved into `source-control/write-port.ts`). The re-application must include S3b, which adds `source-control/write-port.ts → custom-credentials/write-files-validation.ts` (6→3, down, LEGITIMATE).

The Jini half of import-cycle-b: Jini `refactor/terra` (`6c9effae`) contains `origin/refactor/import-cycle-b`. That half adds no Tovu file edge, because the gate only sees `apps/website/src`.

Every row, with its kind, rank pair, door, depcruise rules, imported names, verdict, sheet and the move: [`rev2/facts/EDGES.terra.tsv`](rev2/facts/EDGES.terra.tsv) (120) and [`rev2/facts/EDGES.icb2.tsv`](rev2/facts/EDGES.icb2.tsv) (117). Appendices A and B below render the same rows.

## 2. The rules, quoted, and the classification test

- **Rank rule** (`.dependency-cruiser.mjs:829–873`, `feature-rank:<n>`): *"a feature may value-import only features of a STRICTLY lower rank … a new upward need is solved with a port the composition root binds, not by re-ranking around it."* Type-only imports are exempt (`dependencyTypesNot: ["type-only","type-import"]`). Severity is `warn`.
- **Door rule** (`no-deep-imports:<module>`, `GUARDED_MODULES` at `.dependency-cruiser.mjs:383`): from outside a guarded module, only its `index.ts` may be imported, apart from named exemptions. Severity is **error**.
- **Ratchet** (`check-architecture.ts:189–191, 264–285`): *"Exact directed imports between distinct features, including erased type dependencies. No new edge may be offset by removing another."* This is a hard metric.
- **CI:** both `check:boundaries` and `check:architecture` are `continue-on-error` steps whose outcomes the "Gate summary" step checks (`.github/workflows/ci.yml:191–212`, summary `:423–424`). Both block.

Classification of one edge (`classify-edges.mjs`, columns `dir`, `door`, `rules`):

| verdict | test | why |
|---|---|---|
| LEGITIMATE | rank(src) > rank(tgt), and dependency-cruiser reports no `no-deep-imports` or `feature-rank` violation on this dependency | Under a strict rank order, a downward edge can never close a cycle. The door rule accepts it. The ratchet flags it only because its path is new. |
| LEGITIMATE-RANK | non-downward under today's table, but the table is stale: the target never reaches the source, and moving one rank keeps every other edge into and out of that feature downward | The rank rule itself says lowering or correcting a rank is "a one-line change this rule itself verifies". |
| TANGLE value-up | value import to the same or a higher rank | It breaks the rank rule. 7 of 7 close a runtime feature cycle (`rev2/facts`: runtime feature SCC `{form-destinations, deployments, site-backup, source-control, custom-credentials}`). |
| TANGLE type-up | type import to the same or a higher rank | 18 of 19 close a type-inclusive feature cycle (the 26-feature type SCC). The owner rule "no tangles" covers type cycles. The ratchet's own doc includes erased edges on purpose. |
| TANGLE deep | downward, but `no-deep-imports:features/media:error` fires | It bypasses the module's door. All 5 are among `check:boundaries`' 15 errors. |

## 3. The LEGITIMATE edges and the narrow rule change (sheet R1)

### 3.1 Rule change R1 (replaces "accept 119 rows")

`check-architecture.ts` keeps counting every cross-feature edge, so the informational line `cross-feature import edges (all-import)` is unchanged. The **ratchet set** becomes the edges that are **not strictly downward** in `development/boundaries/feature-ranks.json`. An edge whose feature is missing from the table is ratcheted, which is fail-closed. Consequences:

- The 89 LEGITIMATE edges, and any future edge that goes down through a door, stop being reported. The rank and door rules already judge them, and `check:boundaries` blocks on door errors.
- Every new **upward or same-rank edge, type or value**, is still reported. `check:boundaries` cannot catch these: the rank rule is `warn`, and it ignores type edges. So the ratchet becomes the blocking "no new tangle" check, which today does not exist for type edges.
- Re-ranking around an edge cannot hide it. Raising a feature's rank turns every edge into it from a feature of the same or lower rank into a ratcheted edge.
- The baseline's `crossFeatureEdges` shrinks from 445 to the **27** legacy non-downward edges still in the tree ([`rev2/facts/baseline-after-R1.txt`](rev2/facts/baseline-after-R1.txt)). That is old-baseline ∩ current ∩ non-downward. **None of the 31 TANGLE edges enters the baseline.** After R1, the gate prints exactly the 26 non-downward TANGLE lines on `b5fbf2a5e` (20 on `2f6bfeed`), and the sheets and the icb2 lane remove them.

### 3.2 Three rank corrections (LEGITIMATE-RANK)

| edge | today | evidence | change |
|---|---|---|---|
| N054 `object-storage/artifact-provider.ts → deployments/contracts.ts` (type `DeployTargetCredential`) | 1 → 8, UP | No feature imports `object-storage`; the composition root binds it. `deployments` never reaches `object-storage` (closes-cycle: false). object-storage *implements* the deployments contract, which is the same consumer-owned-port direction the import-cycle design approved for `site-backup → source-control` (E095). | `"object-storage": 9` |
| N055 `object-storage/registry.ts → deployments/contracts.ts` (type `DeployHostKit`) | same | same | same |
| N065 `project-keys/site-sealer.ts → webhooks/index.ts` (type `KeyringPort, SecretSealerPort`) | 0 → 0, same rank | `webhooks` imports nothing from `project-keys`, and every importer of `project-keys` has rank ≥ 3 (custom-credentials 3, api-connections 4, mail-status 5, source-control 6, deployments 8) | `"project-keys": 1` |

### 3.3 Two LEGITIMATE rows on which `no-circular:warn` fires

N004 `api-connections/host-bindings.ts → agent-plugins/lifecycle.ts` and N005 `→ custom-credentials/index.ts` both point down. The cycles they sit in are closed by the UP edges N001/N002 (`agent-plugins → api-connections`) and N064 (`project-keys → api-connections`), which P1 removes.

## 4. The TANGLE edges: owner and smallest move

| group | edges | owner | smallest move | where |
|---|---|---|---|---|
| source-control → site-backup (value, 6→8) | N102–N106, N111 (6) | lane `wave3/import-cycle-b-2` | already done in 2f6bfeed (source-control owns `StaticSitePackagerPort`, site-backup implements it, composition binds it) | lane |
| custom-credentials → source-control (value, 3→6) | N015 (1) | lane `wave3/import-cycle-b-2` | re-apply import-cycle S3b: `bindSourceControlWritePort` to `source-control/write-port.ts` | lane |
| media deep imports (value, down) | N030, N031, N036, N062, N063 (5) | `features/media` (door owner) | `media/index.ts` exports `invalidateMediaAccessEvidence` (it already exports `purgeMedia`); repoint the 5 imports | **M1** |
| media → post (type, 2→6) | N046, N050 (2) | `features/media` (consumer) | media declares the shape it reads: `MediaAccessSettings { memberAccessJson?: string \| null }` in `access-evidence.ts` and `MediaPostListPort` (the one `list()` `where-used.ts` calls) | **M1** |
| agent-plugins → api-connections / external-mcp (type, 0→4/5) | N001–N003 (3) | `features/agent-plugins` (port owner: `service-ports.ts` declares the ports) | declare `DeclaredApiConnection`, `ApiConnectionConnectStatus` and `ExternalMcpConnectStart` (or the fields the port uses) in `agent-plugins/service-ports.ts`; the api-connections/external-mcp files import them from there (down) | **P1** |
| project-keys → api-connections (type, 0→4) | N064 (1) | `features/project-keys` (consumer) | declare `SharedOAuthOwnerStorage` (the methods `shared-oauth-disconnect.ts` calls) in project-keys; `api-connections/shared-owner.ts` satisfies it structurally | **P1** |
| custom-credentials → deployments (type, 3→8) | N016 (1) | `features/custom-credentials` (consumer) | a one-method `DeployTargetListPort` (`list()` of `{ descriptor }`) declared in `custom-credentials/tool-registrations.ts` | **P1** |
| plugin-runtime → post (type, 0→6) | N059 (1) | `features/plugin-runtime` (no package above domains) | `service-ports.ts` declares the record shape plugins read; composition maps `PostRecord` onto it | **P1** |
| publish-content → content-types, entries, media, navigation, post, taxonomy, theme, deployments (type, 1→2..8) | N068–N078 (11) | `features/publish-content` engine plus each contributor feature | the engine files (`type-registry.ts`, `apply-port.ts`, `tool-deps.ts`, `tool-registrations.ts`, `peer-transport.ts`, `push-plan.ts`) become generic over the host port bag `P`. Each contributor owns its `<X>PublishPorts` slice in its own `publish-content.ts`. `TovuPublishPorts` is assembled in `server/runtime/composition/content-publish-ports.ts` (which already exists and already imports the bag) | **C1** |

A move may only place a type in a file that is already exposed (`rev2/facts/api-surface-delta…`, or `surface-and-edges.mjs surface`) or in the consumer's own file. Every sheet STOPs if the API surface rises.

## 5. Sheets

| sheet | removes | files | size | prerequisite |
|---|---|---|---|---|
| [R1](sheets/R1-rank-keyed-edge-ratchet.md) | 89 + 3 NEW lines (rule plus 2 rank fixes); baseline key cut to 27 | `check-architecture.ts`, its test, `check-architecture.baseline.json` (`crossFeatureEdges` only), `feature-ranks.json` | ≤ 120k | none |
| [M1](sheets/M1-media-door-and-owned-shapes.md) | 2 NEW lines plus 5 `check:boundaries` errors | `media/{index,access-evidence,where-used}.ts`, `post/repo{,.memory}.ts`, `entries/{repo.sqlite,trash-aware-memory-repo}.ts`, `forms/form-file-maintenance.ts` | ≤ 150k | R1 merged |
| [P1](sheets/P1-consumer-owned-ports.md) | 6 NEW lines | `agent-plugins/service-ports.ts`, `api-connections/{contribution,connect,shared-owner}.ts`, `external-mcp/contracts.ts`, `project-keys/shared-oauth-disconnect.ts`, `custom-credentials/tool-registrations.ts`, `plugin-runtime/service-ports.ts` (+ composition binding files if a mapper is needed) | ≤ 200k | R1 merged |
| [C1](sheets/C1-publish-ports-generic-engine.md) | 11 NEW lines | `publish-content/*` engine files, 13 contributor `publish-content.ts` files, `composition/content-publish-ports.ts` | ≤ 250k | R1 merged; `wave3/moves-b1` merged (it edits `tovu-publish-ports.ts`) |

Lane overlap: [INDEX.md](INDEX.md#lane-overlap).

## 6. Judge findings: AGREE / DISAGREE

| # | finding | verdict | evidence |
|---|---|---|---|
| T1 | baseline refs wrong on current refs | **AGREE** | `git rev-list --left-right --count f0613d9e5...b5fbf2a5e` gives `16 242`. Revision 2 is based on `b5fbf2a5e`/Jini `6c9effae`. |
| T2 | Appendix A reproduces on `f0613d9e5` | **AGREE** | not disputed; superseded |
| T3 | the inventory differs on `b5fbf2a5e` (10 added / 10 removed; E095/E112 gone; credential and `purge-media` imports back; `repo.sqlite.ts` edge) | **AGREE** | `diff facts/new-edges.head.txt <(NEW lines on b5fbf2a5e)` gives 20 changed lines. N015 (`credential-ports.ts → provider-registry.ts`), N036 (`→ media/purge-media.ts`) and N030 (`entries/repo.sqlite.ts → media/access-evidence.ts`) are in EDGES.terra.tsv. |
| T4 | the creation commit is `987cf88f6`, not `9240cbe1`; 435 edges and 62 NEW at creation | **AGREE** | Revision 1 ran on a **shallow clone**, so `git log -S` stopped at the graft. After `git fetch --unshallow`, `git log b5fbf2a5e --full-history -S'"crossFeatureEdges"'` gives `987cf88f6 2026-10-29`. The gate at `987cf88f6` prints 435 edges and 62 NEW (`rev2/facts/check-architecture.987cf88f6.txt`). Of today's 120, 50 existed in that tree. |
| T5 | cycles/SCC/API: 4 pairs, SCC 5, API 842; feature SCC 26 with one runtime SCC of 5; up-type 35 / 21 | **AGREE** | the gate output on `b5fbf2a5e`; feature SCCs from `cross-feature-edges.b5fbf2a5e.tsv` give a type-inclusive SCC of 26 and the runtime SCC {form-destinations, deployments, site-backup, source-control, custom-credentials}. Up-type edges: 14 baseline + 21 NEW = 35. (Revision 2 classes the same-rank `project-keys → webhooks` separately, which gives 22 type rows; 19 stay TANGLE.) The 1-vs-5 cycle count on `f0613d9e5` was not re-measured (superseded base). |
| T6 | the 14 lanes have no overlap, but counts were wrong; CI already enforces architecture | **AGREE** | `ci.yml:211–212` plus the summary at `:424`. The lane table was re-measured against `b5fbf2a5e` with `git diff --name-only $(git merge-base <lane> b5fbf2a5e) <lane>` (`rev2/facts/lane-overlap.txt`). Revision 1's F-3 ("whether check:architecture runs in CI") is closed. |
| B1 | S3 cannot turn the gate green (API 842 > 821, new runtime pair) | **AGREE** | reproduced. The pair goes with lane icb2 (2f6bfeed: 3 pairs, none new). The API surface is not fixable by edge work alone (−5 here); §0.4 and F-S. Revision 2 no longer promises exit 0. |
| B2 | acceptance is a blanket waiver for OLD edges; 7 upward value imports among them | **AGREE** | Revision 2 accepts nothing by provenance. The 7 value-up rows are TANGLE, removed by lane icb2. The baseline shrinks only to legacy non-downward edges that were already there. |
| M1 | gate failures can look successful (S2 wrapper, `sheet-gates.sh`, `regenerate-facts.sh`, `lane-edges.sh`) | **AGREE** (not re-run; moot) | S2 and all of `tools/` are withdrawn. Gates are now the repo's commands under `set -euo pipefail` (INDEX § Gate block). |
| M2 | STOPs do not enforce their conditions (pipelines, text-only red checks, BSD `wc`/`grep -P`/`sed -i`) | **AGREE** | the new STOPs test exit statuses directly. Numbers are read with `awk` and compared as integers. There is no `grep -P` and no `sed -i`: edits are named for the executor's editor. Red-first tests check `status != 0` and the expected assertion. |
| M3 | collision prerequisites stale; shared `/tmp/arch120` paths | **AGREE** | re-measured. `fix/vendor-names-out-of-core` touches `api-connections/shared-owner.ts` (P1). `integ/ratchets-arch-2026-11-17` and `refactor/import-cycle-b` touch the baseline JSON (R1), and both are pre-terra, superseded by `wave3/import-cycle-b-2`. Each sheet uses `RUN=$(mktemp -d)`. |
| m1 | tools accept empty input; the extractor drops unresolved imports | **AGREE** | the extractor is dropped; edges come from the gate and depcruise. Both evidence readers exit 1 on empty or missing input, and their totals are cross-checked against the gate. |
| O1 | a permanent accept CLI is over-engineering | **AGREE** | withdrawn. R1 is a rule change plus a one-time single-key baseline edit, verified by a JSON key comparison. |
| O2 | use the repo's gate commands and dependency-cruiser graph | **AGREE** | done (§1) |

## 7. Not in these sheets (owner and next step)

- **F-S, API surface 842 → ≤ 821.** The hard metric stays red after every sheet here. The baseline's 821 does not match its own creation tree either (766 at `987cf88f6`). 130 files exposed since then, 54 unexposed (`rev2/facts/api-surface-delta…`), most of them in `assistant/` (29), `contracts/` (13) and `features/theme` (11). This needs its own design run; this plan only guarantees no sheet raises the number.
- **F-2, the 27 legacy non-downward edges** left in the R1 baseline (14 up-type, 12 same-rank type, 1 up-value). The ratchet now holds them, and the count can only fall. The up-value edge `custom-credentials/tool-registrations.ts → deployments/publish-credentials/index.ts`, plus the two legacy `custom-credentials → source-control` edges, keep the runtime feature SCC alive. Owner: the import-cycle lane, next round.
- **E085** (`site-backup/import-plugin-state.ts → agent-plugins/soon-lock.ts`, N083). It is downward, 8 → 0, and `agent-plugins` is deliberately unguarded (`.dependency-cruiser.mjs:373–382`), so it is LEGITIMATE and sheet S1 is withdrawn. S1 also left `soon-lock.ts` exposed through `bootstrap.ts`, so it never lowered the API surface (judge, Graph row).

## Appendix A — the 31 TANGLE and 3 LEGITIMATE-RANK edges, one by one

Columns: id | verdict | kind | rank pair | dir | source → target (under `features/`) | imported names | move. Sheet assignment is column `sheet` in `rev2/facts/EDGES.terra.tsv`.

| id | verdict | kind | rank | dir | edge | names | move |
|---|---|---|---|---|---|---|---|
| N001 | TANGLE-type-up | type | agent-plugins(0)->api-connections(4) | UP | `agent-plugins/service-ports.ts` → `api-connections/connect.ts` | type ApiConnectionConnectStatus | agent-plugins (consumer) declares the connection/connect shapes in service-ports.ts; api-connections/external-mcp implement them (downward) |
| N002 | TANGLE-type-up | type | agent-plugins(0)->api-connections(4) | UP | `agent-plugins/service-ports.ts` → `api-connections/contribution.ts` | type DeclaredApiConnection | agent-plugins (consumer) declares the connection/connect shapes in service-ports.ts; api-connections/external-mcp implement them (downward) |
| N003 | TANGLE-type-up | type | agent-plugins(0)->external-mcp(5) | UP | `agent-plugins/service-ports.ts` → `external-mcp/contracts.ts` | type ExternalMcpConnectStart | agent-plugins (consumer) declares the connection/connect shapes in service-ports.ts; api-connections/external-mcp implement them (downward) |
| N015 | TANGLE-value-up | value | custom-credentials(3)->source-control(6) | UP | `custom-credentials/credential-ports.ts` → `source-control/provider-registry.ts` | buildSourceControlProviderForApi, type LoadSourceControlProviders | import-cycle S3b (bindSourceControlWritePort moves to source-control/write-port.ts); not yet re-applied at 2f6bfeed |
| N016 | TANGLE-type-up | type | custom-credentials(3)->deployments(8) | UP | `custom-credentials/tool-registrations.ts` → `deployments/contracts.ts` | type DeployTargetRegistry | custom-credentials declares the one-method DeployTargetList port it reads (list() of descriptors) |
| N030 | TANGLE-deep | value | entries(4)->media(2) | down | `entries/repo.sqlite.ts` → `media/access-evidence.ts` | invalidateMediaAccessEvidence | export invalidateMediaAccessEvidence from media/index.ts; repoint |
| N031 | TANGLE-deep | value | entries(4)->media(2) | down | `entries/trash-aware-memory-repo.ts` → `media/access-evidence.ts` | invalidateMediaAccessEvidence | export invalidateMediaAccessEvidence from media/index.ts; repoint |
| N036 | TANGLE-deep | value | forms(3)->media(2) | down | `forms/form-file-maintenance.ts` → `media/purge-media.ts` | purgeMedia | repoint to media/index.ts (already exports purgeMedia) |
| N046 | TANGLE-type-up | type | media(2)->post(6) | UP | `media/access-evidence.ts` → `post/post.ts` | type PostRecord | media declares its own MediaAccessSettings { memberAccessJson } (consumer-owned shape) |
| N050 | TANGLE-type-up | type | media(2)->post(6) | UP | `media/where-used.ts` → `post/contracts.ts` | type PostRepoPort | media declares MediaPostListPort with the one list() it calls (consumer-owned port) |
| N054 | LEGITIMATE-RANK | type | object-storage(1)->deployments(8) | UP | `object-storage/artifact-provider.ts` → `deployments/contracts.ts` | type DeployTargetCredential | adapter implements the deployments contract; no feature imports object-storage; rank 1 -> 9 (table stale for type edges) |
| N055 | LEGITIMATE-RANK | type | object-storage(1)->deployments(8) | UP | `object-storage/registry.ts` → `deployments/contracts.ts` | type DeployHostKit | adapter implements the deployments contract; no feature imports object-storage; rank 1 -> 9 (table stale for type edges) |
| N059 | TANGLE-type-up | type | plugin-runtime(0)->post(6) | UP | `plugin-runtime/service-ports.ts` → `post/index.ts` | type PostRecord | plugin-runtime declares the record shape plugins read (no package above domains) |
| N062 | TANGLE-deep | value | post(6)->media(2) | down | `post/repo.memory.ts` → `media/access-evidence.ts` | invalidateMediaAccessEvidence | export invalidateMediaAccessEvidence from media/index.ts; repoint |
| N063 | TANGLE-deep | value | post(6)->media(2) | down | `post/repo.ts` → `media/access-evidence.ts` | invalidateMediaAccessEvidence | export invalidateMediaAccessEvidence from media/index.ts; repoint |
| N064 | TANGLE-type-up | type | project-keys(0)->api-connections(4) | UP | `project-keys/shared-oauth-disconnect.ts` → `api-connections/shared-owner.ts` | type SharedOAuthOwnerStorage | project-keys (consumer) declares SharedOAuthOwnerStorage; api-connections/shared-owner satisfies it (downward 4->0) |
| N065 | LEGITIMATE-RANK | type | project-keys(0)->webhooks(0) | same | `project-keys/site-sealer.ts` → `webhooks/index.ts` | type KeyringPort, SecretSealerPort | webhooks never imports project-keys; every importer of project-keys has rank >= 3; rank 0 -> 1 |
| N068 | TANGLE-type-up | type | publish-content(1)->deployments(8) | UP | `publish-content/peer-transport.ts` → `deployments/static-publish/index.ts` | type PublishHistoryStore, PublishTrigger | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N069 | TANGLE-type-up | type | publish-content(1)->post(6) | UP | `publish-content/push-plan.ts` → `post/contracts.ts` | type PostRecord | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N070 | TANGLE-type-up | type | publish-content(1)->deployments(8) | UP | `publish-content/tool-deps.ts` → `deployments/static-publish/index.ts` | type PublishHistoryStore | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N071 | TANGLE-type-up | type | publish-content(1)->deployments(8) | UP | `publish-content/tool-registrations.ts` → `deployments/static-publish/index.ts` | type PublishHistoryStore | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N072 | TANGLE-type-up | type | publish-content(1)->content-types(2) | UP | `publish-content/tovu-publish-ports.ts` → `content-types/index.ts` | type ContentTypeListPort, ContentTypeRepoPort, IndexProvisionerPort | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N073 | TANGLE-type-up | type | publish-content(1)->entries(4) | UP | `publish-content/tovu-publish-ports.ts` → `entries/index.ts` | type EntryListPort, EntryRepoPort | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N074 | TANGLE-type-up | type | publish-content(1)->media(2) | UP | `publish-content/tovu-publish-ports.ts` → `media/index.ts` | type AssetBlobRepoPort, BlobStorePort, MediaContentTypeStorePort, VersionedMediaRepoPort | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N075 | TANGLE-type-up | type | publish-content(1)->navigation(2) | UP | `publish-content/tovu-publish-ports.ts` → `navigation/index.ts` | type MenuRepoPort, NavLocationBindingRepoPort | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N076 | TANGLE-type-up | type | publish-content(1)->post(6) | UP | `publish-content/tovu-publish-ports.ts` → `post/contracts.ts` | type BeforeSaveHookPort, ForgetRemovedPostFn, PostRepoPort, RemovePostFn | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N077 | TANGLE-type-up | type | publish-content(1)->taxonomy(2) | UP | `publish-content/tovu-publish-ports.ts` → `taxonomy/index.ts` | type ContentLookupPort, ContentTypeTaxonomyPolicyPort, EntryTermRepoPort, ImportableTaxonomyRepoPort, ImportableTermRepoPort, TaxonomyListPort, TaxonomyRepoPort, TaxonomyRevisionRepoPort, TermListPort, TermRepoPort, UnassignableEntryTermRepoPort,  | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N078 | TANGLE-type-up | type | publish-content(1)->theme(4) | UP | `publish-content/tovu-publish-ports.ts` → `theme/catalog.ts` | type DiscoveredTheme | publish-content engine generic over its host bag; each feature owns its <X>PublishPorts slice; TovuPublishPorts assembled in server/runtime/composition |
| N102 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/commit-site.ts` → `site-backup/share-policy.ts` | SiteShareRefusal | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |
| N103 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/commit-site.ts` → `site-backup/share-zip.ts` | claimArchivePaths | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |
| N104 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/commit-site.ts` → `site-backup/static-copy.ts` | prepareStaticReport | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |
| N105 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/commit-site.ts` → `site-backup/static-download-landing.ts` | LANDING_FILE | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |
| N106 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/commit-site.ts` → `site-backup/static-download-layout.ts` | staticDownloadLayout | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |
| N111 | TANGLE-value-up | value | source-control(6)->site-backup(8) | UP | `source-control/tool-registrations.ts` → `site-backup/static-download-landing.ts` | LANDING_FILE | removed by 2f6bfeed (StaticSitePackagerPort owned by source-control, site-backup implements, composition binds) |

## Appendix B — the 86 LEGITIMATE edges, one by one

Every row is strictly down by rank, and dependency-cruiser reports no door or rank violation on it (`rules` = `-`, or the `no-circular:warn` of §3.3). R1 makes the ratchet stop judging them.

| id | kind | rank | dir | depcruise rules | edge | names |
|---|---|---|---|---|---|---|
| N004 | type | api-connections(4)->agent-plugins(0) | down | no-circular:warn | `api-connections/host-bindings.ts` → `agent-plugins/lifecycle.ts` | type LoadPluginContributions |
| N005 | type | api-connections(4)->custom-credentials(3) | down | no-circular:warn | `api-connections/host-bindings.ts` → `custom-credentials/index.ts` | type CustomCredentialSetRepoPort |
| N006 | type | api-connections(4)->project-keys(0) | down | - | `api-connections/shared-api.ts` → `project-keys/attachments.ts` | type KeyAttachments, ProjectKeyTransaction |
| N007 | type | api-connections(4)->project-keys(0) | down | - | `api-connections/shared-api.ts` → `project-keys/site-references.ts` | type SiteOAuthBindings |
| N008 | value | asset-transfer(5)->media(2) | down | - | `asset-transfer/asset-destinations.ts` → `media/index.ts` | saveLibraryDocument |
| N009 | value | asset-transfer(5)->theme(4) | down | - | `asset-transfer/asset-destinations.ts` → `theme/asset-operations.ts` | THEME_WRITE_PERMISSION; resolveThemeFilePath, writeThemeBinaryFile, nextAvailableFileName; assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, type ThemeToolDeps |
| N010 | value | asset-transfer(5)->theme(4) | down | - | `asset-transfer/asset-sources.ts` → `theme/asset-operations.ts` | findThemeOrThrow; sniffThemeImportType |
| N011 | value | asset-transfer(5)->media(2) | down | - | `asset-transfer/copy-tool.ts` → `media/document-archive.ts` | createDocumentArchiveReader |
| N012 | value | asset-transfer(5)->theme(4) | down | - | `asset-transfer/copy-tool.ts` → `theme/asset-operations.ts` | isShapeRejection as isThemeShapeRejection; THEME_IMPORT_MAX_BYTES, THEME_IMPORT_POLICY, THEME_IMPORT_ACCEPT |
| N013 | type | content-types(2)->publish-content(1) | down | - | `content-types/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N014 | type | custom-credentials(3)->project-keys(0) | down | - | `custom-credentials/credential-copy-tool.ts` → `project-keys/service.ts` | type ProjectKeysPort |
| N017 | value | custom-credentials(3)->settings(2) | down | - | `custom-credentials/tool-registrations.ts` → `settings/index.ts` | resolveOperatorLocale |
| N018 | value | custom-credentials(3)->project-keys(0) | down | - | `custom-credentials/tovu-credential-sets.ts` → `project-keys/create-vault.ts` | ProjectKeyCreateConflictError |
| N019 | value | custom-credentials(3)->vendor-credentials(0) | down | - | `custom-credentials/tovu-credential-sets.ts` → `vendor-credentials/index.ts` | credentialCreateTarget, credentialScopes |
| N020 | type | custom-credentials(3)->project-keys(0) | down | - | `custom-credentials/vault-repo.ts` → `project-keys/attached-vault.ts` | type SiteGrantedVault |
| N021 | value | database-transfer(3)->settings(2) | down | - | `database-transfer/tool-registrations.ts` → `settings/index.ts` | resolveOperatorLocale |
| N022 | value | deployments(8)->webhooks(0) | down | - | `deployments/deploy-ops/run-ops.ts` → `webhooks/index.ts` | fingerprintSiteKeyHex, parseSiteKeyHex, revealSiteKeyMaterial, siteKeySourcesForSiteDir |
| N023 | value | deployments(8)->settings(2) | down | - | `deployments/deploy-ops/typed-secret-card.ts` → `settings/index.ts` | resolveOperatorLocale |
| N024 | value | deployments(8)->settings(2) | down | - | `deployments/publish-agent-tools.ts` → `settings/index.ts` | resolveOperatorLocale |
| N025 | value | deployments(8)->project-keys(0) | down | - | `deployments/publish-credentials/store.ts` → `project-keys/create-vault.ts` | ProjectKeyCreateConflictError |
| N026 | value | deployments(8)->vendor-credentials(0) | down | - | `deployments/publish-credentials/store.ts` → `vendor-credentials/index.ts` | credentialVault, credentialScope, credentialHint; type VendorCredentialSetRecord, VendorCredentialSetRepoPort; credentialCreateTarget, credentialScopes, type ScopedCredentialDeps |
| N027 | value | deployments(8)->consent(7) | down | - | `deployments/static-publish/publish-consent.ts` → `consent/service.ts` | deploymentRefusal |
| N028 | type | entries(4)->publish-content(1) | down | - | `entries/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type EntryPublishPorts |
| N029 | value | entries(4)->taxonomy(2) | down | - | `entries/publish-content.ts` → `taxonomy/term-sync.ts` | prepareTermSync, readTermIds, TERM_SYNC_PERMISSION |
| N032 | value | entries(4)->content-types(2) | down | - | `entries/unreadable-owner-entries-repair.ts` → `content-types/index.ts` | DECLARED_CONTENT_TYPE_OWNERS |
| N033 | value | external-mcp(5)->api-connections(4) | down | - | `external-mcp/external-mcp-oauth.ts` → `api-connections/browser-binding.ts` | hostedMcpSignInLink |
| N034 | type | external-mcp(5)->webhooks(0) | down | - | `external-mcp/external-mcp-store.ts` → `webhooks/index.ts` | type SecretSealerPort |
| N035 | value | external-mcp(5)->settings(2) | down | - | `external-mcp/tool-registrations.ts` → `settings/index.ts` | resolveOperatorLocale |
| N037 | type | forms(3)->publish-content(1) | down | - | `forms/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N038 | value | image-transform(6)->theme(4) | down | - | `image-transform/tool.ts` → `theme/asset-operations.ts` | isShapeRejection as isThemeShapeRejection |
| N039 | type | mail-status(5)->settings(2) | down | - | `mail-status/test-send.ts` → `settings/index.ts` | type MailTestModeSetting |
| N040 | value | mail-status(5)->newsletter(0) | down | - | `mail-status/use-readiness.ts` → `newsletter/index.ts` | evaluateLaunchGate, type LaunchGateDeps, type LaunchGatePrecondition |
| N041 | type | mail(4)->settings(2) | down | - | `mail/attempts.repo.ts` → `settings/index.ts` | type MailTestModeSetting |
| N042 | value | media-generation(3)->settings(2) | down | - | `media-generation/providers-tools.ts` → `settings/index.ts` | resolveOperatorLocale |
| N043 | value | media-generation(3)->media(2) | down | - | `media-generation/tool-registrations.ts` → `media/chat-preview.ts` | withChatPreview |
| N044 | value | media-import(3)->fs-files(0) | down | - | `media-import/agent-tools.ts` → `fs-files/site-file-request.ts` | FS_FOLDER_READ_RECOVERY |
| N045 | value | media-import(3)->media(2) | down | - | `media-import/tool-registrations.ts` → `media/chat-preview.ts` | withChatPreview |
| N047 | type | media(2)->publish-content(1) | down | - | `media/import-media-entity.ts` → `publish-content/type-registry.ts` | type MediaSourceReplacement |
| N048 | type | media(2)->publish-content(1) | down | - | `media/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N049 | type | media(2)->publish-content(1) | down | - | `media/verify-published-media.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N051 | type | member-login(4)->members(0) | down | - | `member-login/link-policy.ts` → `members/index.ts` | type MemberRecord |
| N052 | value | member-login(4)->members(0) | down | - | `member-login/link-service.ts` → `members/index.ts` | type MemberExternalIdentityRepoPort, MemberSignInResult, MembersWriteServiceDeps; completeSignIn, createMember, issueMemberSession, requestSignInLink, notifyMemberCreated; type MemberExternalIdentityRecord, MemberRecord |
| N053 | type | navigation(2)->publish-content(1) | down | - | `navigation/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N056 | type | pages(7)->post(6) | down | - | `pages/html-document-store.memory.ts` → `post/contracts.ts` | type PostKind |
| N057 | type | pages(7)->post(6) | down | - | `pages/html-document-store.ts` → `post/contracts.ts` | type PostKind, PostRepoPort |
| N058 | value | pages(7)->post(6) | down | - | `pages/html-document-store.ts` → `post/index.ts` | SYSTEM_ACTOR_ID, announcePendingGoLive |
| N060 | type | post(6)->publish-content(1) | down | - | `post/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts, TaxonomyPublishPorts |
| N061 | value | post(6)->taxonomy(2) | down | - | `post/publish-content.ts` → `taxonomy/term-sync.ts` | prepareTermSync, readTermIds, TERM_SYNC_PERMISSION, withTermIds |
| N066 | value | publish-content(1)->webhooks(0) | down | - | `publish-content/backstop-policy.ts` → `webhooks/index.ts` | scanTextForSecrets |
| N067 | value | publish-content(1)->webhooks(0) | down | - | `publish-content/file-tree-policy.ts` → `webhooks/index.ts` | scanTextForSecrets |
| N079 | value | seo(7)->post(6) | down | - | `seo/cover-image.ts` → `post/rendering.ts` | collectCoverMediaRefs, resolveCoverImage, type CoverImage, type CoverMedia |
| N080 | type | settings(2)->publish-content(1) | down | - | `settings/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N081 | value | site-backup(8)->agent-plugins(0) | down | - | `site-backup/bundled-export-file-policy.ts` → `agent-plugins/bundled-catalog.ts` | SELECTED_AGENT_PLUGIN_PACKAGES |
| N082 | value | site-backup(8)->theme(4) | down | - | `site-backup/import-keep-off.ts` → `theme/active-theme.ts` | NO_THEME_ID |
| N083 | value | site-backup(8)->agent-plugins(0) | down | - | `site-backup/import-plugin-state.ts` → `agent-plugins/soon-lock.ts` | findSoonAgentPlugin |
| N084 | value | site-backup(8)->theme(4) | down | - | `site-backup/import-restore-placement.ts` → `theme/catalog.ts` | checkSourceDirContainment; loadTheme |
| N085 | value | site-backup(8)->agent-plugins(0) | down | - | `site-backup/package-file-inventory.ts` → `agent-plugins/new-site-agent-plugin-tokens.ts` | listBundledAgentPluginServers |
| N086 | value | site-backup(8)->theme(4) | down | - | `site-backup/share-backend.ts` → `theme/index.ts` | NO_THEME_ID |
| N087 | value | site-backup(8)->settings(2) | down | - | `site-backup/share-database/repo.sqlite.ts` → `settings/contracts.ts` | PUBLISHABLE_SETTINGS |
| N088 | value | site-backup(8)->site-export(5) | down | - | `site-backup/static-copy.ts` → `site-export/export-html-policy.ts` | downloadForms |
| N089 | type | site-backup(8)->site-export(5) | down | - | `site-backup/static-copy.ts` → `site-export/site-exporter.ts` | type ExportReport |
| N090 | value | site-backup(8)->site-export(5) | down | - | `site-backup/static-download-layout.ts` → `site-export/export-html-policy.ts` | downloadDocumentBase |
| N091 | value | site-export(5)->webmcp(0) | down | - | `site-export/export-html-policy.ts` → `webmcp/published-html.ts` | injectPublishedWebMcp |
| N092 | value | site-export(5)->media(2) | down | - | `site-export/media-original-urls.ts` → `media/index.ts` | resolveContentTypes, type ContentTypeDeps |
| N093 | value | site-inspection(5)->theme(4) | down | - | `site-inspection/site-profile.ts` → `theme/active-theme.ts` | NO_THEME_ID |
| N094 | value | site-inspection(5)->theme(4) | down | - | `site-inspection/site-profile.ts` → `theme/theme-id-aliases.ts` | themeIdCandidates |
| N095 | type | site-search(7)->members(0) | down | - | `site-search/access.ts` → `members/index.ts` | type MemberContext |
| N096 | type | site-search(7)->post(6) | down | - | `site-search/access.ts` → `post/contracts.ts` | type PostKind |
| N097 | value | site-search(7)->members(0) | down | - | `site-search/cms-document-source.ts` → `members/index.ts` | resolvePostMemberAccess |
| N098 | type | site-search(7)->post(6) | down | - | `site-search/cms-document-source.ts` → `post/contracts.ts` | type PostKind |
| N099 | value | site-search(7)->post(6) | down | - | `site-search/cms-document-source.ts` → `post/read-model.ts` | toRecord, toPostSearchDocument |
| N100 | value | site-search(7)->settings(2) | down | - | `site-search/settings.ts` → `settings/index.ts` | set |
| N101 | type | sites(1)->agent-plugins(0) | down | - | `sites/site-admin.ts` → `agent-plugins/service-ports.ts` | type PluginCredentialsPort |
| N107 | value | source-control(6)->settings(2) | down | - | `source-control/credential-setup.ts` → `settings/index.ts` | resolveOperatorLocale |
| N108 | value | source-control(6)->project-keys(0) | down | - | `source-control/store.ts` → `project-keys/create-vault.ts` | ProjectKeyCreateConflictError |
| N109 | value | source-control(6)->vendor-credentials(0) | down | - | `source-control/store.ts` → `vendor-credentials/index.ts` | credentialVault, credentialScope, credentialHint; credentialCreateTarget, credentialScopes, type CredentialScope, type ScopedCredentialDeps |
| N110 | value | source-control(6)->custom-credentials(3) | down | - | `source-control/tool-registrations.ts` → `custom-credentials/index.ts` | describeCredentialByLabel, resolveCustomCredentialByLabel, type CustomCredentialSetRepoPort |
| N112 | type | taxonomy(2)->publish-content(1) | down | - | `taxonomy/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TaxonomyPublishPorts |
| N113 | type | taxonomy(2)->publish-content(1) | down | - | `taxonomy/publish-term-ids.ts` → `publish-content/tovu-publish-ports.ts` | type TaxonomyPublishPorts |
| N114 | type | theme(4)->publish-content(1) | down | - | `theme/active-theme-publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type TovuPublishPorts |
| N115 | type | theme(4)->settings(2) | down | - | `theme/preview-switcher-tools.ts` → `settings/index.ts` | type set |
| N116 | value | theme(4)->navigation(2) | down | - | `theme/static-render.ts` → `navigation/render-entry.ts` | menuLinkRelAttr, renderHtmlMenu |
| N117 | value | trash(3)->redirects(2) | down | - | `trash/adapters/redirect.ts` → `redirects/index.ts` | REDIRECT_TABLES |
| N118 | value | widgets(7)->content-types(2) | down | - | `widgets/deps.ts` → `content-types/write-service.ts` | registerContentType |
| N119 | value | widgets(7)->post(6) | down | - | `widgets/deps.ts` → `post/post.ts` | createPublicPostReader, isTrashed, updatePost, restorePostForward, findPublishedPostById, findPublishedPostBySlug, PostVersionConflictError, PostNotFoundError, type PostRecord, type BeforeSaveHookPort, type ForgetRemovedPostFn, type PostRepoPort |
| N120 | type | widgets(7)->publish-content(1) | down | - | `widgets/publish-content.ts` → `publish-content/tovu-publish-ports.ts` | type WidgetPublishPorts |
