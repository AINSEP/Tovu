### jini:packages/plugins/src/host/declarative-content-types.ts
- **Over:** `createDeclarativeContentTypes` 131
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/declarative-content-types.extract-s6.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | consts, interfaces, `declError` … `labelValid`, `incompatibilities`, `planDeclaredContentTypes`, `judgeLostRace` | grammar helpers + planning (unchanged) |
| B | `fieldIdentity`, `parseField`, `parseFields` | parse one type's `fields[]` |
| C | `keyErrors`, `parseDecl`, `parseDeclaredContentTypes`, `validateDeclarativeManifest` | parse/validate declarations (stays) |
| D | `applyDeclaredContentTypes`, `createDeclared` | apply a plan via write ports |

- **Splits** (module level above `createDeclarativeContentTypes`):
  1. HELPER `createDeclaredFieldParser({ isContentTypeFieldKind, isIndexableFieldKind, validateIdentifierGrammar, IDENTIFIER_GRAMMAR_TEXT, CONTENT_TYPE_FIELD_KINDS }: CreateDeclaredFieldParserInput): { parseFields }` ← `function fieldIdentity(` through `function parseFields(` (with the "One `fields[]`" comment). Input = exactly the destructured names those bodies read; types = `DeclaredContentTypeCms[...]` indexed accesses.
  2. HELPER `createDeclaredContentTypeApplier({ isAlreadyExists }: CreateDeclaredContentTypeApplierInput): { applyDeclaredContentTypes }` ← `async function applyDeclaredContentTypes(` (with its "Carries out a conflict-free plan" comment) and `async function createDeclared(` (with its comment).
  3. Main keeps the destructure, `RESERVED_KEYS`, unit C, and `return {`.
- **Importers to update:** none (helpers not exported; `host/index.ts` re-exports this file with `export *`).
- **After:** file ~285; `createDeclarativeContentTypes` ~65; helpers ~45 / ~28.
- **Risks / notes:** error text/order in collect-all parsing must not change.
