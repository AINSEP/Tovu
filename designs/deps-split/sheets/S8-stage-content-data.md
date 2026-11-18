# S8 — stage `content-data` (rows D1-D4)

Responsibility: statements 86-111 (`f0613d9e` 1589-1693). Budget ≤120k. Commits: 5.
Prerequisites: S7. COMMON §2, §3, §9.

| commit | slice | statements | getters | returns |
|---|---|---|---|---|
| 1 | `slices/database-journal.ts` | 86-95 (the `mkdirSync` and the journal `onStoreClose` move in order) | — | `databaseJournalDb`, `databaseLedgerRepo`, `migrationRunsRepo`, `publishContentRunRepo`, `restorePointsRepo`, `dbOps`, `databaseIntrospection` |
| 2 | `slices/content-repos.ts` | 96-104, 106-108 — **statement 105 (`let formCollectionProviders = …`) is a root cell**: the closure keeps it at its position between the two calls, or (if the slice must be contiguous) the `let` moves up to the top of the closure in this commit (a pure arrow; nothing reads it before 1637 — `awk -F'\t' '$10 ~ /formCollectionProviders/ || $11 ~ /formCollectionProviders/ {print $1}' work/closure-census.tsv` prints only rows ≥ 109) | — | `entryRepo`, `sqliteEntryTermRepo`, `taxonomyRepo`, `termRepo`, `taxonomyRevisionRepo`, `stampWatermark`, `widgetBindingRepo`, `entryRefsRepo`, `formDefinitionRepo`, `formSubmissionRepo`, `contentTypeRepo`, `contentTypeIndexProvisioner` |
| 3 | `slices/core-resolvers.ts` | 109 | `mediaRepo`, `mediaContentTypeStore`, `postRepo`, `routeDeps`, `formCollectionProviders: () => formCollectionProviders()` (keeps the call-time indirection 1666 verbatim) | — |
| 4 | `slices/comments.ts` | 110-111 | `postRepo` | `commentsModule`, `commentsCapability` |
| 5 | `stages/content-data.ts` | 86-111 | | |

`wireCoreResolvers` writes a process-global registry in `@jini-ai/cms/widgets`: called exactly once, same position.

## STOP
```bash
D=apps/website/src/server/runtime/composition
test "$(grep -rn 'wireCoreResolvers(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: wireCoreResolvers called more than once in the site root"
grep -nE '^  (const [^=]+= )?await ' $D/site-deps/slices/{database-journal,content-repos,core-resolvers,comments}.ts && echo "STOP: became async"
```
Gates: COMMON §5; `site-root.late-contracts.pin.test.ts` (d) every commit; `create-core-resolvers.unit.test.ts` at sheet end.
