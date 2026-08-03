# Widgets port — closure collapse delivered, package port blocked on prerequisites

**Date:** 2026-08-03
**Branches:** `port/widgets` (Tovu), base `refactor/jini-admin-extraction`
**Method:** transitive-closure walk over relative TS imports rooted at `src/`, seeded from `src/widgets/`, tests excluded; cross-checked against `npm run check:architecture`.

---

## Verdict

The composition-root edge is cut and the closure collapsed as predicted. **The port of `widgets` into `@jini-ai/cms/widgets` cannot proceed yet**: 17 of the 21 non-`db` files in widgets' collapsed closure do not exist in `packages/cms`, and four of widgets' own files depend on them at **runtime**, not just for types. Two of the four missing modules are explicitly owned by other in-flight tasks.

---

## 1. What landed

`toWhereUsedResponse` moved from `server/http/admin/widgets.ts` to `widgets/where-used.ts`.
`server/http/admin/widgets.ts` re-exports it, so existing call sites are untouched. Body moved verbatim; the inline return type was given the names `WhereUsedResponse` / `WhereUsedReference` (structurally identical).

| measure | before | after |
|---|---|---|
| widgets transitive closure | 162 files / 31 modules | **48 files / 7 modules** |
| edges from `widgets` into `server/` | 1 | **0** |
| `check:architecture` back-edges into composition root | 25 | **24** |

Collapsed closure: `widgets 24 · content-types 7 · core 6 · entries 5 · db 3 · forms 2 · navigation 1`.

The module set matches the dispatch's prediction exactly. Absolute file counts differ from the dispatch's figures (179 -> 44) because that measurement used `dependency-cruiser` with `--ts-pre-compilation-deps`, which resolves barrels and type-only edges slightly differently; the shape of the result is identical and the conclusion is unchanged.

---

## 2. Why the package port is blocked

The dispatch's fact-base states: *"Only remaining blockers are the 3 `src/db/*` files via `widgets/repo.sqlite.ts`."* That is not correct. `db/*` is handled by design (`repo.sqlite.ts` stays in the host), but four **other** modules in the closure are absent from `packages/cms/src/`:

| closure module | files | in `packages/cms`? | owned by |
|---|---|---|---|
| `core` (ports, commands/command, tools/registration-kit) | 3 | **yes** | — |
| `navigation` | 1 | **yes** | — |
| `core/entry-refs` (types, ports, extractor) | 3 | no | **nobody** |
| `features/entries` (write-service, list, types, errors, field-validation) | 5 | no | concurrent task |
| `features/content-types` (7 files) | 7 | no | concurrent task |
| `forms` (ports, types) | 2 | no | **nobody** |
| `db` (schema, content-db, repo-helpers) | 3 | n/a — stays in host | — |

These are not type-only edges that could be stubbed. Four widgets files — `write-service.ts` (381 lines), `region-area-service.ts` (268), `embed-service.ts` (362), `entry-payload.ts` (206), together 1,217 of widgets' 3,711 lines — import **runtime values**:

```
write-service.ts        createEntry, updateEntry   <- features/entries/write-service
region-area-service.ts  VersionConflictError       <- features/entries/errors
embed-service.ts        extractEntryRefs           <- core/entry-refs/extractor
entry-payload.ts        registerContentType        <- features/content-types/write-service
                        NoopContentTypeIndexProvisioner <- features/content-types/repo.memory
```

A widget instance *is* an entry, so widgets' write path is built directly on the entries write path. `tool-registrations.ts`, `resolver-service.ts` and every integration test sit downstream of those four files. Porting `widgets` before `entries` and `content-types` would produce a `packages/cms/src/widgets/` that cannot typecheck or build — failing two of the dispatch's own hard gates — and the porting of those two domains is explicitly out of this task's scope.

### The unowned prerequisite

`core/entry-refs` is the item most likely to block the *next* attempt as well. It is:

- **not** brought in by the entries port — verified, no file under `src/features/entries/` imports `entry-refs`;
- self-contained — `types.ts`, `ports.ts`, `extractor.ts` depend only on `core/ports`'s `UUID`;
- consumed, outside `server/`, only by `widgets`.

It was left unported here rather than shipped as an unconsumed module in shared `core/` surface. **Whoever sequences the next round must assign it explicitly**, or the widgets port blocks a second time on the same file. `forms/{ports,types}.ts` (108 lines, needed only for the `FormDefinitionRepoPort` type in the contact-form resolver) is in the same unowned position, though it is type-only and therefore cheaper to resolve.

---

## 3. Recommended sequencing

1. `core/entry-refs` + `forms/ports` — small, unowned, no dependants among the in-flight tasks.
2. `entries` and `content-types` — already in flight.
3. `widgets` — re-run the closure check first; it should still read 7 modules.

The resolver seam (`widgets/resolvers/`, registered individually via `wireCoreResolvers`) is untouched by this pass and remains intact for step 3.
