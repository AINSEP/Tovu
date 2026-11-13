# Split plan: apps/website/src/server/routes/types.ts

## 1. Header
- Path: `apps/website/src/server/routes/types.ts` — 519 counted / 1743 raw; 101 import statements (~157 counted lines). Over: file only (519 > 500). No function is over 100 (largest declaration: `RouteDeps` type, 63).
- Phase: NOW. Survey u087-1 row types.ts = STAY-WIRING (no Jini home; "NEEDS-TIER-2 for any split" refers to narrowing `RouteDeps` itself, which this plan does NOT do — it only moves the group interfaces, a type-only change). Every new module runs before the move and stays in Tovu after it.
- Executor: Fable/Opus. Type-only moves: no runtime code changes at all (tsx erases `import type`).
- Deviation from CONVENTIONS rule 3 (siblings): new folder `server/routes/route-deps/`, one file per deps.md §3 feature, the same names as `composition/deps/` and `composition/memory-deps/` (see app.md), so a feature's types and its two composers line up by file name. Sibling names (`types-identity.ts` …) next to the `workspaces/` route folder would hide that.

## 2. Responsibility map (every top-level declaration)
Each interface moves with the doc block directly above it (word for word).
| Declaration (outline range) | Unit | Job |
|---|---|---|
| L168-177 `SiteStoragePaths` | `route-deps/site.ts` | served site storage locations |
| L182-185 `ClockDeps`, L981-984 `EventBusDeps` | `route-deps/core.ts` | clock/ids, outbox + bus |
| L190-250 `IdentityDeps` | `route-deps/identity.ts` | principal auth ports |
| L256-320 `MediaDeps` | `route-deps/media.ts` | media asset/blob/transform ports |
| L327-549 `CredentialsDeps` | `route-deps/credentials.ts` | credential repos + sealing |
| L557-622 `ContentTaxonomyDeps`, L787-828 `PostDeps`, L963-976 `ChangeSetDeps`, L1188-1196 `WidgetsDeps` | `route-deps/content.ts` | content model, posts, change sets, widget projection |
| L629-651 `CommentsDeps` | `route-deps/comments.ts` | comments backend |
| L658-699 `MembersDeps` | `route-deps/members.ts` | member ports |
| L706-738 `DatabaseRecoveryDeps`, L1118-1156 `DatabaseOpsDeps` | `route-deps/database.ts` | recovery + database ops |
| L745-750 `WebhooksDeps` | `route-deps/webhooks.ts` | webhook persistence |
| L757-781 `FormsDeps` | `route-deps/forms.ts` | forms write ports |
| L833-865 `PresentationDeps`, L871-957 `SettingsDeps` | `route-deps/settings.ts` | presentation + settings ledger |
| L992-1037 `ObservabilityDeps`, L1043-1097 `AnalyticsDeps` | `route-deps/observability.ts` | observability + analytics (§3 "observability+analytics") |
| L1103-1111 `NavigationDeps` | `route-deps/navigation.ts` | menus + bindings |
| L1162-1181 `RedirectsDeps` | `route-deps/redirects.ts` | redirects/origin |
| L1203-1258 `PluginRuntimeDeps` | `route-deps/plugins.ts` | plugin runtime |
| L1264-1266 `PublishTrustRevocationDeps` | `route-deps/publish.ts` | publish trust deny-store |
| L1280-1345 `TrashDeps` | `route-deps/trash.ts` | local admin Trash |
| L1353-1740 `RouteDeps`, L1742 `RouteRegistrar` | stay in `types.ts` | the intersection + registrar (141 importers) |
Verified (grep of interface bodies, comments excluded): no group interface names another group interface or `RouteDeps` in code, so the moves create no type cycle; `{@link RouteDeps…}` in doc comments needs no import.

## 3. Target layout
- `route-deps/<feature>.ts` (18 files above): exports exactly the interfaces listed for it, nothing else. Imports: the `import type` bindings its interfaces use, copied from types.ts's import block (an import line's "why" comment, e.g. the "Composition-root-only boot effect…" block above the `features/media` deep import, moves/copies with it). Relative paths gain one `../` (`"../../features/x/index.js"` → `"../../../features/x/index.js"`); `#src/...` and package specifiers are unchanged. No route-deps file imports `../types.js` or another route-deps file.
- `types.ts` keeps: `RouteDeps` (its intersection list unchanged, same order), `RouteRegistrar`, the import bindings still used by `RouteDeps`'s inline fields, plus one `import type { … } from "./route-deps/<feature>.js";` per feature file (18 lines). Bindings no longer used are deleted (eslint `@typescript-eslint/no-unused-vars` lists them).
- No re-exports from types.ts: it is not a package entry (`#src/*` subpath import, not a `package.json` `exports` target), so per rule 4 the 9 importers below are edited.

Importers of moved names (complete, rg 2026-11-13; `RouteDeps` stays on the old import):
| File:line | Change |
|---|---|
| `apps/website/src/server/inbound/admin-http/dev-auth.ts:29` | keep `RouteDeps` from `../../routes/types.js`; `ClockDeps` ← `../../routes/route-deps/core.js`; `IdentityDeps` ← `../../routes/route-deps/identity.js` |
| `apps/website/src/server/inbound/admin-http/owner-mfa-deps.ts:2` | `ClockDeps` ← `route-deps/core.js`, `CredentialsDeps` ← `route-deps/credentials.js`, `IdentityDeps` ← `route-deps/identity.js` (all `../../routes/…`) |
| `apps/website/src/server/inbound/admin-http/routes/database-recovery/deps.ts:1` | `DatabaseRecoveryDeps` ← `#src/server/routes/route-deps/database` |
| `apps/website/src/server/inbound/admin-http/routes/forms/deps.ts:5` | `FormsDeps` ← `#src/server/routes/route-deps/forms` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/deps.ts:4` | `WebhooksDeps` ← `#src/server/routes/route-deps/webhooks` |
| `apps/website/src/server/inbound/admin-http/routes/media/deps.ts:3` | `ClockDeps` ← `…/route-deps/core`, `MediaDeps` ← `…/route-deps/media` |
| `apps/website/src/server/inbound/admin-http/routes/members/deps.ts:11` | `MembersDeps` ← `#src/server/routes/route-deps/members` |
| `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts:13` | `SiteStoragePaths` ← `#src/server/routes/route-deps/site` |
| `apps/website/src/server/runtime/composition/site-paths.ts:6` | `SiteStoragePaths` ← `../../routes/route-deps/site.js` |
No test imports a group interface; no `import("…routes/types…").XDeps` inline uses; no mocks (type-only module).

## 4. Steps (each: edit → `npx eslint <changed files>` → listed tests one at a time with the CONVENTIONS website command → commit by explicit paths)
1. Move the groups that have outside importers: site, core, identity, credentials, media, database, forms, webhooks, members (10 interfaces, 9 files) and edit the 9 importers above. Tests: `apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts`, `apps/website/src/server/inbound/admin-http/__tests__/owner-mfa-deps.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/site-path-resolvers.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload.test.ts`. types.ts ≈ 330.
2. Move the remaining groups: content, comments, settings, observability, navigation, redirects, plugins, publish, trash (15 interfaces, 9 files); no importer edits. Tests: same four + `apps/website/src/server/__tests__/admin-trash-routes.test.ts`. types.ts ≈ 140.
3. Done check: `node development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/server/routes/types.ts apps/website/src/server/routes/route-deps/*.ts`.
Type safety: tests cannot see a broken type import (tsx erases types) and CONVENTIONS forbid a full Tovu tsc; eslint's type-aware rules on the changed files are the local gate, the typecheck CI job is the final one. A reviewer should diff the union of moved interface text against the deleted text (must be identical).

## 5. After (expected counted lines)
types.ts ≈ 140 (RouteDeps 63). route-deps: credentials ≈ 55, content ≈ 55, observability ≈ 50, settings ≈ 45, identity ≈ 40, plugins ≈ 30, media ≈ 25, database ≈ 30, trash ≈ 25, members ≈ 30, others ≤ 20. All ≤ 500; no functions. No exception candidates.

## 6. Risks
- Import bindings shared by several interfaces must be imported in each file that uses them (copy, don't move, when types.ts or another group still uses them).
- Keep the `RouteDeps` intersection order and its inline fields byte-identical (doc comments in it reference the old line context; the `exportSiteBound` doc is cited by `.dependency-cruiser.mjs:159` by field name only, unaffected).
- `.dependency-cruiser.mjs` rule `feature-no-server-or-framework-imports` covers all of `apps/website/src/server`, so route-deps/ is policed exactly like types.ts — no rule change.
- app.md / deps.md composers may later type their groups with these interfaces; they must import from `route-deps/<feature>.js`, never back through types.ts for a group.
