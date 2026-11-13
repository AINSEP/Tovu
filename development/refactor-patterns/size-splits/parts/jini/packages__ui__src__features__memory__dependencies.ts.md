### jini:packages/ui/src/features/memory/dependencies.ts
- **Over:** `createMemoryHttpPorts` 105 (file 222, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/dependencies.test.ts`, `src/features/memory/__tests__/http-ports.test.ts`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `requiredField`, `requiredNonNullField` | response-field validators — stay |
| B | `createMemoryHttpPorts`: `function request(...)` | fetch binding with timeout — stays |
| C | `// ─── Config cluster` … `const memoryConfigPort` | config REST port |
| D | `// ─── Entries/index cluster` … `const memoryEntriesPort` | entries/index REST port |
| E | `// ─── Extraction history cluster` … `const memoryExtractionsPort` | extraction-history REST port |
| F | `createFakeMemoryConnectorsPort`, session helpers, `notifyConnectorsChanged`, singletons | connectors demo cluster — stays |

- **Splits** (same file, module level, between `requiredNonNullField` and `createMemoryHttpPorts`, in this order):
  0. TYPE `type MemoryHttpRequest = (url: string, init: RequestInit, options: { timeoutMs: number }) => Promise<Response>;` (module-private) — the existing shape of `request`.
  1. HELPER `createMemoryConfigHttpPort({ request }: CreateMemoryConfigHttpPortInput): MemoryConfigPort` ← from `// ─── Config cluster (real HTTP)` through `const memoryConfigPort: MemoryConfigPort = { … };` then `return memoryConfigPort;`. Input type `{ request: MemoryHttpRequest }`.
  2. HELPER `createMemoryEntriesHttpPort({ request }: CreateMemoryEntriesHttpPortInput): MemoryEntriesPort` ← from `// ─── Entries/index cluster (real HTTP)` (with the big `BUG FIX` doc comment on `fetchMemoryList`, word for word) through `const memoryEntriesPort: MemoryEntriesPort = { … };`, then `return memoryEntriesPort;`. Inner function names unchanged (the inner `fetchMemoryList` shadows the module export as it does today).
  3. HELPER `createMemoryExtractionsHttpPort({ request }: CreateMemoryExtractionsHttpPortInput): MemoryExtractionsPort` ← from `// ─── Extraction history cluster (real HTTP)` through `const memoryExtractionsPort …`, then `return memoryExtractionsPort;`.
  4. `createMemoryHttpPorts` keeps its signature, `function request(...)` (annotate nothing new), and ends with `return { config: createMemoryConfigHttpPort({ request }), entries: createMemoryEntriesHttpPort({ request }), extractions: createMemoryExtractionsHttpPort({ request }) };` — construction order config → entries → extractions as today.
- **Importers to update:** none (no export moves; `createMemoryHttpPorts`, singletons and `fetchMemoryList` keep their names and location).
- **After:** file ~230; `createMemoryHttpPorts` ~10; `createMemoryEntriesHttpPort` ~62; config ~12; extractions ~30.
- **Risks / notes:** `request` closes over `fetch` from the options object; passing it in keeps that binding. No mocks of this module.
