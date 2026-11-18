# S8 — slices `database-journal`, `content-repos`, `core-resolvers`, `comments` (D1-D4)

Responsibility: bindings `databaseJournalDbPath` … `commentsCapability` (`b5fbf2a5` 1586-1690). The cell `formCollectionProviders` moves to the top of the closure in commit 2 (a pure arrow; nothing reads it before `wireCoreResolvers` — check: `awk -F'\t' 'NR>2 && ($10 ~ /formCollectionProviders/ || $11 ~ /formCollectionProviders/) {print $1, $2}' "$W/closure.tsv"` (COMMON §3) prints only the resolver, comments-capability and literal rows). Budget ≤110k. Commits: 4. Prerequisites: S7; COMMON §1-§4, §9 (`DS_SHEET=S8`).

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/database-journal.ts` | `databaseJournalDbPath` … `databaseIntrospection` (the `mkdirSync` and the journal `onStoreClose` in order) | — | `databaseJournalDb`, `databaseLedgerRepo`, `migrationRunsRepo`, `publishContentRunRepo`, `restorePointsRepo`, `dbOps`, `databaseIntrospection` |
| 2 | `slices/content-repos.ts` | `entryRepo` … `contentTypeIndexProvisioner` minus the `formCollectionProviders` cell | — | the 12 repos |
| 3 | `slices/core-resolvers.ts` | the `wireCoreResolvers(…)` statement | `mediaRepo`, `mediaContentTypeStore`, `postRepo`, `routeDeps`, `formCollectionProviders: () => formCollectionProviders()` (the call-time indirection verbatim) | — |
| 4 | `slices/comments.ts` | `commentsModule`, `commentsCapability` | `postRepo` | same |

## Carries
| behaviour (base lines) | pin |
|---|---|
| resolver fallback: empty registry until provider boot, provider registry after, read per call (1634, 1649-1666, 1881) | S0 pin 3d; new `$D/__tests__/core-resolvers.unit.test.ts`: the slice wires with a getter, flipping the getter after wiring changes the answer (mutation: call the getter at wiring → red) |
| process-global widget registry written exactly once (1649) | STOP block (one `wireCoreResolvers(`); `apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts` |
| journal close hook registered at the same position (1590) | S0 pin 5 |
| comment write chain uses the same repos/capability (1667-1690) | `server/__tests__/routes/comments-e2e.test.ts`, `comments-settings-routes.test.ts`; S0 pin 1 (keys + types) |

```bash
SHEET_TESTS=(
  apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts
  apps/website/src/server/__tests__/routes/comments-e2e.test.ts
  apps/website/src/server/__tests__/routes/comments-settings-routes.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'wireCoreResolvers\(' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S8-WIRE-ONCE"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/database-journal.ts" "$D/site-deps/slices/content-repos.ts" "$D/site-deps/slices/core-resolvers.ts" "$D/site-deps/slices/comments.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S8-ASYNC-SLICE"; exit 1; }
```
Gates: COMMON §5.
