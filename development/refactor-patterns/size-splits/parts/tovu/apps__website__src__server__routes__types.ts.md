### tovu:apps/website/src/server/routes/types.ts
- **Over:** file 519 lines (no function over)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** type-only module (tsx strips types, so tests only smoke-load it): `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/revision-attribution.test.ts`, `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts`. Real check = `npx eslint` on both files + `outline.mjs --check`.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A (stays) | `SiteStoragePaths`, `ClockDeps`, `IdentityDeps`, `MediaDeps`, `CredentialsDeps`, `MembersDeps`, `DatabaseRecoveryDeps`, `WebhooksDeps`, `SettingsDeps`, `ChangeSetDeps`, `EventBusDeps`, `ObservabilityDeps`, `AnalyticsDeps`, `DatabaseOpsDeps`, `PluginRuntimeDeps`, `PublishTrustRevocationDeps`, `TrashDeps`, `RouteDeps`, `RouteRegistrar` | platform/runtime dependency groups + the app-wide `RouteDeps` bag |
| B (moves) | `ContentTaxonomyDeps`, `CommentsDeps`, `FormsDeps`, `PostDeps`, `PresentationDeps`, `NavigationDeps`, `RedirectsDeps`, `WidgetsDeps` | content-side domain dependency groups (posts, taxonomy, comments, forms, presentation, menus, redirects, widgets) |

- **Splits:**
  1. NEW `apps/website/src/server/routes/types-content-deps.ts` — job: the content-side domain dependency groups `RouteDeps` composes. Moves (word for word, each with its doc comment): interfaces `ContentTaxonomyDeps`, `CommentsDeps`, `FormsDeps`, `PostDeps`, `PresentationDeps`, `NavigationDeps`, `RedirectsDeps`, `WidgetsDeps`, plus every `import type` line whose names ONLY these interfaces use (check each imported name with `rg -n "\bName\b" types.ts` after the cut; a name still used in types.ts keeps its import there too). Exports all eight. Imports nothing from `types.ts` (the outline shows none of them uses another types.ts declaration — re-verify; if one does, STOP).
  2. `types.ts` adds `import type { ContentTaxonomyDeps, CommentsDeps, FormsDeps, PostDeps, PresentationDeps, NavigationDeps, RedirectsDeps, WidgetsDeps } from "./types-content-deps.js";` and the `RouteDeps` intersection stays textually the same.
- **Importers to update:** `apps/website/src/server/inbound/admin-http/routes/forms/deps.ts` (`FormsDeps` → from `#src/server/routes/types-content-deps`; keep `RouteDeps` from `#src/server/routes/types`). No other file imports the eight names (the `deps.ts:1741` hit is a comment). Re-run `rg -n "\b(ContentTaxonomyDeps|CommentsDeps|FormsDeps|PostDeps|PresentationDeps|NavigationDeps|RedirectsDeps|WidgetsDeps)\b" apps packages --glob '!node_modules'`.
- **After:** `types.ts` ~440 lines; `types-content-deps.ts` ~85.
- **Risks / notes:** pure type move, no runtime effect. Inline `import('…')` type expressions inside moved members move as-is. Do not re-export from `types.ts` (not a package entry).
