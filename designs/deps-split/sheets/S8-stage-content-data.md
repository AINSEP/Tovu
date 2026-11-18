# S8 — stage `content-data` (D1-D4)

Responsibility: bindings `databaseJournalDbPath` … `commentsCapability` (`f0613d9e` 1586-1690). The cell `formCollectionProviders` moves to the top of the closure in commit 2 (a pure arrow; nothing reads it before `wireCoreResolvers` — check: `awk -F'\t' 'NR>2 && ($10 ~ /formCollectionProviders/ || $11 ~ /formCollectionProviders/) {print $1, $2}' designs/deps-split/work/closure-census.tsv` prints only the resolver, comments-capability and literal rows). Budget ≤120k. Commits: 5. Prerequisites: S7; COMMON §1-§3, §9 (`DS_SHEET=S8`).

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/database-journal.ts` | `databaseJournalDbPath` … `databaseIntrospection` (the `mkdirSync` and the journal `onStoreClose` in order) | — | `databaseJournalDb`, `databaseLedgerRepo`, `migrationRunsRepo`, `publishContentRunRepo`, `restorePointsRepo`, `dbOps`, `databaseIntrospection` |
| 2 | `slices/content-repos.ts` | `entryRepo` … `contentTypeIndexProvisioner` minus the `formCollectionProviders` cell | — | the 12 repos |
| 3 | `slices/core-resolvers.ts` | the `wireCoreResolvers(…)` statement | `mediaRepo`, `mediaContentTypeStore`, `postRepo`, `routeDeps`, `formCollectionProviders: () => formCollectionProviders()` (the call-time indirection verbatim) | — |
| 4 | `slices/comments.ts` | `commentsModule`, `commentsCapability` | `postRepo` | same |
| 5 | `stages/content-data.ts` (sync) | 1-4 | | |

## Carries
| behaviour (base lines) | pin |
|---|---|
| resolver fallback: empty registry until provider boot, provider registry after, read per call (1637, 1649-1669, 1881) | S0 pin 3d; new `core-resolvers.unit.test.ts`: the slice wires with a getter, flipping the getter after wiring changes the answer (mutation: call the getter at wiring → red) |
| process-global widget registry written exactly once (1649) | `expect-count` below; `create-core-resolvers.unit.test.ts` (wide) |
| journal close hook registered at the same position (1590) | S0 pin 5 |
| comment write chain uses the same repos/capability (1667-1690) | comment route tests (wide); S0 pin 1 (keys + types) |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S8-WIRE-ONCE 1 'wireCoreResolvers\(' $D/deps.ts $D/site-deps
$G forbid S8-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/database-journal.ts $D/site-deps/slices/content-repos.ts $D/site-deps/slices/core-resolvers.ts $D/site-deps/slices/comments.ts $D/site-deps/stages/content-data.ts
```
Gates: COMMON §5.
