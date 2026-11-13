### jini:packages/cms/src/trash/write-service.ts
- **Over:** `createTrashService` 132 (returned object: `trash` 39, `restore` 30, `purgeSelected` 47)
- **Phase:** now · **Batch:** size-19
- **Package entry:** `./trash` → `src/trash/index.ts`; `createTrashService` stays here, nothing moves out of the file.
- **Tests:** `src/trash/__tests__/service.test.ts`, `follow-ups.test.ts`, `exports.test.ts`, `retention-policy.test.ts`, `record-store-adapter.purge.test.ts`, `sweeper.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | types, `notifyChanged`, `TrashAdapterMissingError`, `DEFAULT_TRASH_RETENTION_DAYS`, `computePurgeAfter`, `bind*` | contract + helpers |
| B (stays) | `retentionDays`, policy self-check call, `requireAdapter`, `trash`, `restore`, the small members of the returned object | move into / out of trash |
| C | `purgeSelected` member body | permanent purge of selected trash entries |

- **Splits:**
  1. HELPER `purgeSelectedTrash({ deps, optional, requireAdapter, request }: PurgeSelectedTrashInput): <current return type>` — module level above `createTrashService` ← `purgeSelected` body verbatim (its doc block moves onto the helper; the member keeps a one-line `purgeSelected: (request) => purgeSelectedTrash({ deps, optional, requireAdapter, request })` keeping the same parameter destructuring the member had).
- **Importers to update:** none.
- **After:** `createTrashService` ~88; `purgeSelectedTrash` ~48; file ~215.
- **Risks / notes:** if `purgeSelected` reads `retentionDays`, add it to the input. Keep `async` and every await order.
