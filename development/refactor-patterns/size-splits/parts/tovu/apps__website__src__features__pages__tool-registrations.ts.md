### tovu:apps/website/src/features/pages/tool-registrations.ts
- **Over:** `buildPagesRegistrations` 154 (file 429, under)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-50
- **Tests:** `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.read-html.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.write-region.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.move-region.test.ts`, `apps/website/src/features/pages/__tests__/edit-html-permission.test.ts`, `apps/website/src/assistant/__tests__/pages-read-html-batch.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `parsePageExpectedVersion`, `requireCapturedVersion`, `assertExpectedVersion`, `toModelFacingWriteError`, `openForFullWrite`, `FullWriteOpening` | version/CAS guards (stay) |
| B | `assertTopLevelSectionsAreTagged`, `describeRegionProblem`, `requireRegion`, `describeUnsafeRegions`, `joinWarnings`, `describeHandleCollision`, `describeFullWriteHandleCollision`, `parseMovePlacement`, `describeMoveProblem` | region validation + refusal text (stay) |
| C | `PagesToolDeps`, `readPageTheme`, `readDocPageFallback`, `docPageNote`, `normalizePageRegionInput`, `normalizePageInput`, `embedWarningMessages` | reads + input normalizing (stay) |
| D | `buildPagesRegistrations` handler entries `pages_read_html`, `pages_write_html`, `pages_write_region`, `pages_move_region` | one tool handler each → factories |

- **Splits:**
  1. HELPERS in `buildPagesRegistrations` (same file, directly above it, in this order). Shared plan-named input `interface PagesHandlerInput { routeDeps: PagesToolDeps }`; each returns `ToolHandler`:
     - `createReadHtmlHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← the `pages_read_html: async (ctx) => {` arrow (~L534-557) — returns that arrow.
     - `createWriteHtmlHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_write_html` arrow (~L558-605).
     - `createWriteRegionHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_write_region` arrow (~L606-680).
     - `createMoveRegionHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_move_region` arrow (~L681-727).
     - `buildPagesRegistrations` keeps `const handlers: Record<string, ToolHandler> = { pages_read_html: createReadHtmlHandler({ routeDeps }), pages_write_html: createWriteHtmlHandler({ routeDeps }), pages_write_region: createWriteRegionHandler({ routeDeps }), pages_move_region: createMoveRegionHandler({ routeDeps }) };` and its `return buildDomainRegistrations({ metadata: toolMetadata,` statement unchanged.
- **Importers to update:** none (exports unchanged).
- **After:** file ~435; `buildPagesRegistrations` ~17; factories ~26 / ~50 / ~76 / ~46.
- **Risks / notes:** Comments above/inside each handler move with it. Handlers read only `routeDeps` (outline). If `ToolHandler`'s `ctx` type was inferred from the `Record<string, ToolHandler>` annotation, the factory return type `ToolHandler` keeps the same contextual typing. After the move, write-service pieces leave; these handlers are STAY-WIRING.
