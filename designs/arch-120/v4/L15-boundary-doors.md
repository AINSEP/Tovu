# L15 — boundary doors (9 non-feature `check:boundaries` errors) — IN SCOPE (coordinator) — one repo (Tovu); Opus executor

The tip's `check:boundaries` reports 14 errors (`facts/check-boundaries.v3.2d82735a.txt:177-190`):
4 belong to L08 (`no-deep-imports:features/media`, including `media-rendition.ts`) and 1 to L06
(`feature-rank:3`). The 9 below belong to this lane. Every fix is mandatory and there are no
alternatives. No rule edits and no door-list additions in `.dependency-cruiser.mjs`. Sequencing:
run after L06, L08 and L12. L12 also edits the members area, and this lane does not touch
`composition/modules/members.ts`.

| # | error (line in report) | fix (exact) | callers / tests to repoint |
|---|---|---|---|
| 1 | `server/runtime/lifecycle/local-site-process.ts → platform/site-dir/local-admin-bundle.ts` (:177) | **Entry:** add `export { waitForLocalAdminBuild } from "./local-admin-bundle.js";` to `platform/site-dir/index.ts`. `local-site-process.ts:29` imports it from `#src/platform/site-dir/index`, the entry this file already uses at `:3,21,22`. | none (single caller, `:234`) |
| 2 | `platform/dev-host/warm-site-agent.ts → platform/site-dir/local-site-supervisor.ts` (:178) | **Entry:** `LocalSiteError` is already exported by `platform/site-dir/index.ts:112-121`. Repoint `warm-site-agent.ts:2` to `#src/platform/site-dir/index`. | none |
| 3 | `features/site-backup/archive-manifest.ts → platform/site-dir/schema-guard.ts` (:179) | **Entry:** add `isBundledSchemaIdentity` to the existing `export { runtimeSchemaVersion, … } from "./schema-guard.js"` at `platform/site-dir/index.ts:97`. `compareSchemaVersion` stays off the barrel, as its comment requires. Repoint `archive-manifest.ts:7`. | none |
| 4 | `server/inbound/public-http/middleware/published-webmcp.ts → features/theme/visitor-publication.ts` (:180) | **I:** `applyPublishedWebMcp` (`:8`) takes a required `publishVisitorPage: (input: { html: string; path?: string; workspaceId?: string }) => string` in its first argument. `server/runtime/composition/http-app/public-middleware.ts:22` passes theme's `publishVisitorPage`, imported from `#src/features/theme/visitor-publication` (composition). | tests calling `applyPublishedWebMcp`: rg `applyPublishedWebMcp(` under `__tests__`; each passes the real function |
| 5–7 | `assistant/site/{visitor-page-tools,visitor-frontend-control,visitor-confirmation-gate}.ts → features/theme/visitor-publication.ts` (:181-183) | **I:** one port `readVisitorPagePublication: (input: { revision: string; workspaceId?: string }) => PagePublication \| null`. `PagePublication` is from `@jini-ai/agentic/core`, the type the module already uses. `VisitorRoutePorts` (`visitor-frontend-control.ts:22`) gains it as a required member. `createVisitorFrontendControl` (`:87`) uses `ports.readVisitorPagePublication` at `:43` and `:105`, and passes it to the visitor page tools' deps (`visitor-page-tools.ts:65`) and to `createVisitorConfirmationGate`'s `VisitorExecutionPorts` (`visitor-confirmation-gate.ts:67`). `server/runtime/composition/modules/site-assistant.ts` builds `VisitorRoutePorts` and passes theme's `readVisitorPagePublication`. | tests that build `VisitorRoutePorts`, `VisitorExecutionPorts` or the page-tools deps add the real function |
| 8 | `server/inbound/public-http/routes/site/pages/extra-head.ts → features/seo/page-head-contributor.ts` (:184) | **Entry:** add `export { createSeoPageHeadHook } from "./page-head-contributor.js";` to `features/seo/index.ts`. That entry already exports `withCoverReadDeps` from `cover-image.js`, the only feature import of `page-head-contributor.ts`. Repoint `extra-head.ts:1`. | none |
| 9 | `server/inbound/admin-http/routes/members/deps.ts → features/members/tool-registrations.ts` (:185) | **H:** move `buildMembersWriteServiceDeps` (`tool-registrations.ts:93-114`, pure object construction) and its input type into `features/members/ports.ts`, which declares the result type `MembersWriteServiceDeps` (`ports.ts:228`, already exported by `members/index.ts:58`). Restate the input type `MembersWriteServiceSourceDeps` there field by field (today it is `Pick<MembersToolDeps, …>`): each field is typed by the `MembersWriteServiceDeps` member it fills. Export both from `members/index.ts`. `tool-registrations.ts` imports them from `./ports.js`. `admin-http/routes/members/deps.ts:10` imports from `#src/features/members/index`. | `public-http/routes/members/deps.ts`, `admin-http/routes/members/{request-magic-link,disable}.ts`, `admin-http/routes/newsletter/deps.ts` use `toMembersWriteServiceDeps` and are unchanged |

**Shared state (rows 4–7):** `visitor-publication.ts` keeps its module-level `snapshots` map. Both
the writer (row 4) and the reader (rows 5–7) are bound by composition from the same module, so
they share one map, as today.

### Characterization tests
- Rows 4–7: add `server/runtime/composition/__tests__/visitor-publication.wiring.test.ts`. Through the
  composed public middleware, publish a page. Then, through the composed visitor control ports,
  `readVisitorPagePublication` returns that page's publication for the issued revision and `null`
  for a different workspace. This proves that one map is shared.
- Keep: `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` (rows 4 and 8 are on the public path),
  the visitor assistant tests under `assistant/__tests__/` that import `assistant/site/*`, the archive-manifest tests
  under `features/site-backup/__tests__/` (unknown schema identity → `INVALID_ARCHIVE`), and the members route tests.

### STOP
- Row 1, 3 or 8: if the new entry export makes `check:architecture` report a new cycle, or
  `worker-import-graph.test.ts` changes its result, stop and report it. Do not swap in another
  wiring.
- Row 9: if `ports.ts` would need an import from another feature, stop and report it.

**Expected removals:** these 9 error lines. Final acceptance: `npm run check:boundaries` exits 0 on
the integrated tip.

---
