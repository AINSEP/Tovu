### jini:packages/devops/src/checks/hardwiring.ts
- **Over:** `createHardwiringInspector` 276
- **Phase:** now (JINI 276) · **Batch:** size-39
- **Tests:** `src/checks/__tests__/hardwiring.test.ts`, `hardwiring.pins.test.ts`, `hardwiring-node.test.ts`, `hardwiring-node.pins.test.ts` (package `@jini-ai/devops`). No test mocks the module. `src/checks/node.ts` is the package entry `./checks/node`. It re-exports `createHardwiringInspector`, whose name and return shape stay the same.
- **Responsibility map** (closures inside the factory; all of them close over `c`):

| unit | closures | job |
|---|---|---|
| P parse/imports | `parse`, `scriptKind`, `erasedImport`, `kept`, `declarationLiteral`, `loadCallLiteral`, `importLiteral`, `imports`, `declaredFunctions`, `exportedFunctions`, `exportedAliases`, `violation` | parse source and list runtime imports/exports |
| R rule predicates | `member`, `env`, `envKey`, `adapter`, `urlOwner`, `vendor`, `moduleScope`, `bindsFetch`, `scopeBindsFetch`, `hasLocalFetch`, `isGlobalThisFetch`, `statementBindsFetch`, `isEnvDefault`, `declarationIdentity`, `mutableModuleState`, `globalFetchCall`, `uncoveredDefault`, `apiUrl` | per-node HW1–HW8 tests |
| G public graph | `firstJsx`, `reactSpecifier`, `implicitReact`, `inspectPublicGraph` | HW7 public-site React graph walk |
| I inspect | `targetPlugin`, `inspectImports`, `inspect`, `return {…}` | per-file inspection (stays) |

- **Splits** (module level, above `createHardwiringInspector`, in this order; closure bodies verbatim, with their comments):
  1. `function createSourceReader({ compiler: c }: { compiler: typeof ts })`. Unit P goes in, returning `{ parse, imports, exportedFunctions, exportedAliases, violation }`. Any `_options` the closures read come from their own parameters.
  2. `function createRulePredicates({ compiler: c }: { compiler: typeof ts })`. Unit R goes in, returning every closure that `inspect`/`inspectImports`/`statementBindsFetch` call from outside the unit: `env`, `envKey`, `adapter`, `urlOwner`, `vendor`, `isEnvDefault`, `declarationIdentity`, `mutableModuleState`, `globalFetchCall`, `uncoveredDefault`, `apiUrl`. Before cutting, check each one's users with the outline's `uses:`.
  3. `function createPublicGraphInspector({ compiler: c, parse, imports, violation }: CreatePublicGraphInspectorInput)`. Unit G goes in and it returns `{ inspectPublicGraph }`. Type the inputs as `ReturnType<typeof createSourceReader>["parse"]` and so on.
  - The factory then holds `const { parse, imports, exportedFunctions, violation } = createSourceReader({ compiler: c });`, `const { … } = createRulePredicates({ compiler: c });` and `const { inspectPublicGraph } = createPublicGraphInspector({ compiler: c, parse, imports, violation });`, followed by unit I and the unchanged `return`.
- **Importers to update:** none.
- **After:** factory about 55 lines, `createRulePredicates` about 95 (if it comes out over 100, split the fetch-binding group `bindsFetch` … `statementBindsFetch` into `createFetchBindingPredicates`), `createSourceReader` about 75, `createPublicGraphInspector` about 60. The file is about 345 counted lines.
- **Risks / notes:** this design came from the outline plus the source of units G and I only. The executor should check each unit's cross-calls against the outline's `uses:` before cutting. A closure that one unit calls and another unit owns has to be returned by its owner, and a new module must never import the factory. Rule ids, messages and visit order stay byte for byte. Fable/Opus should do this one, because the cross-unit call graph needs judgment.
