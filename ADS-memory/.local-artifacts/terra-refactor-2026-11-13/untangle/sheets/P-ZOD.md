# P-ZOD — no zod types in protocol's public contract

Sheet written 2026-11-16 (plan/wave-c, unattended cloud planning run). Inputs: `handoffs/sheets-fix.md` item 6, `C10.md` sheet-fix revision item 3 and "zod in emitted types" (5), census configs `scripts/census/{protocol-zod,a2ui-zod}.json` (raws re-checked on the integration view). Base: Jini `refactor/terra` + local `-X ours` integration view of the 11 wave-B lanes; Tovu `refactor/terra`. Guards are blobs on that view (first 12 hex): **re-guard on the merged wave-B tip before dispatch.**

Owner rule (B3, recorded in C10.md): zod is **internal-only** in protocol/core public APIs. Public contracts are written TypeScript types and plain parse functions; a `.d.ts` of `@jini-ai/protocol` (any subpath) names no zod type. zod stays protocol's one runtime dependency.

**Behaviour change: none.** Same schemas, same parse results, same thrown errors (the parse functions throw whatever the schema throws today, so the `registry.test.ts:22` zod-message assertion still holds); only the exported surface changes.

## 0. Placement

| | |
|---|---|
| Wave | C. Part A (root `registry.ts`) can run any time after the wave-B cloud run. **Part B (a2ui) needs C10 landed** (`protocol/src/a2ui/*` does not exist until then; today the files are `agentic/src/core/a2ui/*`). Run P-ZOD after C10 + pass B2, before R11 and before any protocol release tag. |
| Size | Sonnet ~40k: Part A ~25k (18 written types, 7 parse functions, 2 registry backends), Part B ~15k (33 written types, mechanical) |
| TSV | `P-ZOD.repoint.tsv`: 6 rows (3 scripted protocol-test repoints, 1 KEEP, 2 MANUAL registry backends). Part B has **no rows**: the 33 type names keep their names and specs |
| Outside users | Tovu: none (census). Jini: registry `static-backend.ts` (6 schema names), `database-backend.ts` (1), 3 protocol tests. a2ui schema values: none after C10 (C10 already routes chat/reference-web through `parseDynamicValue`) |

## 1. Rules for the written types (both parts)

- One written type per `z.infer` alias, **same name, same doc comment**, placed where the alias was. Shapes are the zod **output** types:
  - `tsconfig.base.json` has `exactOptionalPropertyTypes: true`, and zod 3 outputs `.optional()` fields as `key?: T | undefined`: write `key?: T | undefined`, not `key?: T`.
  - `.passthrough()` objects (Dist, Publisher, Metrics, Signature, Version, Entry, Manifest) output an index signature: add `[key: string]: unknown`.
  - `.default(x)` fields are **required** in the output (`query: string`, `verified: boolean`, `changedFiles: string[]`, `warnings: string[]`).
  - `RegistryListFilterSchema` is `.optional()` as a whole: `RegistryListFilter = { … } | undefined`.
  - Use `interface` for objects with no index-signature/union issue, `type` otherwise; keep field order of the schema.
- **Equality guard, in the schema file (never exported):**
  ```ts
  type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
  true satisfies Same<RegistryEntry, z.infer<typeof RegistryEntrySchema>>;
  ```
  one line per type. A drift fails `pnpm typecheck` in protocol. STOP if a type cannot be written so that `Same` is `true` (report the zod construct).
- No `z.` type appears in any exported signature. Check after the lane: `rg -n "zod|Zod|z\\.infer" packages/protocol/dist/**/*.d.ts` finds nothing except inside the unexported schema files' own `.d.ts` (which must not be reachable from `exports`).

## 2. Part A: protocol root `registry.ts` (`471c105b22a4`)

1. NEW `packages/protocol/src/registry-schemas.ts` (**not** in `package.json` `exports`, not re-exported by `index.ts`): `git mv registry.ts registry-schemas.ts` first (history follows the schemas), then recreate `registry.ts`.
   - `registry-schemas.ts` holds the 18 `*Schema` consts unchanged (still `export`ed, for its siblings and protocol's own tests) and the 18 `Same` guards. It imports the written types from `./registry.js`.
   - The module header comment ("Pure zod schemas + inferred types…") is split: the schema half stays here, rewritten to "validation schemas behind the written types in `registry.ts`; internal to the package".
2. `registry.ts` keeps: the 18 written types (§1), `RegistryBackend`, `RegistryBackendFactory` (unchanged), and the parse functions below. Header: "Wire types of the registry protocol… validation lives in `registry-schemas.ts`".
3. Parse functions (`(required, optional)` rule; each delegates to its schema; names chosen from the call sites, nothing speculative):

   | Function | Replaces (call site) | Returns |
   |---|---|---|
   | `parseRegistryBackendKind({ value }, _optional = {})` | `RegistryBackendKindSchema.parse` (static-backend `:65`) | `RegistryBackendKind`; throws as today |
   | `parseRegistryTrust({ value }, _optional = {})` | `RegistryTrustSchema.parse` (`:66`) | `RegistryTrust`; throws |
   | `parseRegistryListFilter({ value }, _optional = {})` | `RegistryListFilterSchema.unwrap().parse(filter)` (`:73`) | `NonNullable<RegistryListFilter>`; throws. Keep `.unwrap()` inside: today `undefined` throws here, keep that |
   | `parseRegistrySearchQuery({ value }, _optional = {})` | `RegistrySearchQuerySchema.parse` (`:78`) | `RegistrySearchQuery`; throws |
   | `safeParseRegistryEntry({ value }, _optional = {})` | `RegistryEntrySchema.safeParse` (static `:195`, database `:221`) | `RegistryParseResult<RegistryEntry>` |
   | `safeParseRegistryPublishRequest({ value }, _optional = {})` | `RegistryPublishRequestSchema.safeParse` (`:226`) | `RegistryParseResult<RegistryPublishRequest>` |
   | `isRegistryEntryName({ name }, _optional = {})` | `RegistryEntrySchema.shape.name.safeParse(name).success` (`:312`) | `boolean` |

   `export type RegistryParseResult<T> = { success: true; data: T } | { success: false; error: { message: string } }` — the same fields the two backends read today (`.success`, `.data`, `.error.message`), so their bodies change only at the call expression. Build it from the zod result (`{ success: false, error: { message: parsed.error.message } }`), never return the `ZodError` itself.
4. `index.ts`: `export * from './registry.js'` stays (KEEP row). It now exports types + 7 functions + `RegistryParseResult`, and no `*Schema`.
5. Repoint: protocol's 3 tests import the schemas from `../registry-schemas.js` (scripted rows). The 2 registry backends are MANUAL (call-expression rewrites; the row notes give every line).
6. `.changeset/protocol-no-zod-registry.md`: protocol **major** (18 schema exports removed; types unchanged in name and shape), registry patch.

## 3. Part B: a2ui (after C10)

Files (after C10's move; blobs today at the agentic path, re-guard at the protocol path): `protocol/src/a2ui/common-types.ts` (17 aliases; today `agentic/src/core/a2ui/common-types.ts` `5814150be520`), `agent-to-renderer.ts` (8; `06afd01dc280`), `renderer-to-agent.ts` (8; `d4202b6d89b2`).
- Each `export type X = z.infer<typeof XSchema>` becomes a written type with the same name and doc comment, plus its `Same` guard next to the schema (§1). Recursive schemas (`DynamicValue`, `Child`/`ChildList`, `FunctionCall` args if `z.lazy`): write the recursive type first and type the schema with it (`const DynamicValueSchema: z.ZodType<DynamicValue> = z.lazy(…)`) — that is the zod-documented pattern, already used today for `FunctionCall` and `ArgValue` (`common-types.ts:45,63`, written types with a comment on the exact `| undefined` form) and keeps `Same` true; STOP if a `z.lazy` schema's output differs from its input in a way `z.ZodType<Output, Def, Input>` cannot express.
- The schema consts stay sibling-exported and stay **out** of `a2ui/index.ts` (C10 already made the index an explicit list without `*Schema`). `A2uiPropsValidator` and `parseDynamicValue` (C10) are unchanged.
- No importer changes: every importer already reads these names as types from `@jini-ai/protocol/a2ui` (C10's TSVs). No TSV rows.
- Changeset: protocol patch (type text only; same names and shapes).

## 4. Files touched

`packages/protocol/src/{registry.ts,registry-schemas.ts(new via git mv),index.ts(no edit, KEEP)}`, `packages/protocol/src/__tests__/{registry.boundaries,registry,verification-contradictions.unit}.test.ts` (applier), `packages/registry/src/{static-backend,database-backend}.ts` (MANUAL), `packages/protocol/src/a2ui/{common-types,agent-to-renderer,renderer-to-agent}.ts` (Part B), 2 changesets. Coordinator: nothing in `package.json` (no export changes; zod stays a protocol dependency).

## 5. Applier pass

`node scripts/apply-repoint.mjs --tsv sheets/P-ZOD.repoint.tsv --repo-root jini=<Jini> --repo-root tovu=<Tovu> --phase wave` after the Part A lane commit.
Dry run 2026-11-16 (`--phase all --dry-run`): **rows 6; applied 3, already 0, keep 1, manual 2, STALE 0, ERROR 0; files changed 3.**

## 6. STOP

- Guard mismatch (re-guard on the merged wave-B tip; Part B on the post-C10 protocol paths).
- A `Same` guard that cannot be made `true` (§1).
- Any Jini or Tovu importer of a `*Schema` value outside protocol appears that the census did not list (re-run `repoint-census.cjs` with both configs at dispatch).
- Part B dispatched before C10 has landed.

## 7. Tests (cloud run)

protocol (all registry + a2ui tests; the `Same` guards run in `typecheck`), registry, chat (`A2uiSurfaceCard.rules`), Tovu typecheck. Add one protocol test per parse function: valid input returns the typed value; invalid input throws (or `success: false` with the same message text zod gives today).
