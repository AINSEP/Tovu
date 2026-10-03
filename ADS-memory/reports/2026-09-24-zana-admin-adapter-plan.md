# Plan: generated apps (React / Vue / Angular) connect to the Tovu-derived admin

Date: 2026-09-24 · Session: tovu-21 · Status: DRAFT, needs owner decisions (bottom)
Inputs: two read-only research passes (Tovu admin/website + Zana; Jini cms), Zana report
`ADS-project-knowledge/reports/22-admin-extension-points.md`, Tovu specs 047/048.
Jini `@jini-ai/admin` internals were confirmed only at the file/export level (`admin/src/core/ports/entities.ts`,
`manifest/types.ts`, `transport/http.ts`); `resolvePanels` behaviour is from Zana report 22, not read.

## What already exists (don't rebuild)

- **Contract pieces in Jini.** `@jini-ai/admin/core` is framework-free: `AdminEntityPort` / `AdminEntityRegistry`
  (schema-carrying CRUD), `AdminPanel<TRender>`, `createAdminClient`, `resolvePanels` (drops panels whose `requires`
  capabilities aren't wired). `@jini-ai/core` has `ToolRegistration` + `Pack` for the agent side.
- **Zana** already has `apps/admin` (a port of Tovu admin, data mocked), an entity registry proven on a dummy
  Recipes app, and `/admin/*` proxied per project. Its `apps/vibecoding/` is the coding workspace (renamed from studio),
  so the adapters need a different home.
- **cms** owns media, entries + content types (≈ Collections), navigation (menus), taxonomy, settings, identity —
  all behind ports, no DB/React/Express deps.

## Target shape

```
            ┌──────────── Admin shell (React, one codebase) ─────────────┐
            │ panels resolved from the app's capability manifest          │
            │ Content module | Users/Roles | Settings | Deploy | AI ...   │
            └────────────▲───────────────────────────────▲───────────────┘
                         │ HTTP  /api/sites/:siteId/...   │
            ┌────────────┴──────────┐        ┌────────────┴─────────────┐
            │ Host server (Tovu /    │        │ App data API (entities   │
            │ Zana) + cms module     │        │ the generated app owns)  │
            └────────────▲──────────┘        └────────────▲─────────────┘
                         │ read content / previews        │
            ┌────────────┴───────────────────────────────┴─────────────┐
            │ Generated app: React | Vue | Angular                       │
            │ uses app-sdk core (fetch) + thin /react /vue /angular binds│
            └────────────────────────────────────────────────────────────┘
```

- The admin stays React. Framework differences exist only on the **app side** (reading content, rendering
  previews, declaring entities). Per Zana report 22: generated apps supply **data and descriptors, not admin JS**.
- **Content module = the whole Content nav group**: Pages, Posts, Media, Collections, Menus, Widgets,
  Categories & Tags, Forms. It's one optional module with `requires: ["content"]`; an app without it shows none of them.
- Tovu becomes "a host with the content module + themes installed" — same code path as Zana, no fork.

## Admin changes (Tovu admin, then shared)

1. **Transport:** `lib/api.ts` hard-codes `BASE="/api/admin/v1"` and `WORKSPACE_ID="workspace-local"` (~190 uses)
   in one 4.2k-line file, and ~6 raw clients bypass it (assistant chats/runs/agents, tool search, settings SSE).
   Make base URL + site id come from boot context via Jini `createHttpTransport` (already takes baseUrl/credentials/
   headers). The swap seam already exists: each feature has `*-port.hooks.ts` + `*-dependencies.hooks.ts` (72 pairs),
   the only files that call `api`.
2. **Panels:** `ADMIN_PANELS` is a static literal. Tag each panel with `requires` capabilities and run
   `resolvePanels` against the app's manifest **before mount** (sync registry, per report 22).
3. **Entities panel:** generic list/edit screens driven by `AdminEntityPort` descriptors (Zana already has it) —
   this is how a booking/recipes/etc. app gets admin screens with zero UI code.
4. **Cut website imports:** three live Vite aliases point into `apps/website/src` (`@tovu/theme-layout`,
   `publish-content-ui`, `embed-marker`; `@tovu/headless` is declared but unused — just delete it). Move them into Jini.
5. **Auth:** keep the host's HttpOnly session cookie; tokens for an app's data API stay server-side.
6. **Admin shell location:** one shell, ideally moved into Jini (`@jini-ai/admin/react`), consumed by Tovu and Zana,
   instead of two forks drifting. Note `@jini-ai/admin/react` today has only primitives (Sidebar, DataTable, dialogs) —
   "no `<AdminShell>` or panels yet", so this is a real extraction, not a switch.
7. **Custom app screens (if allowed):** ADR-025 (ACCEPTED 2026-07-16) already rules plugin client JS runs in a sandboxed
   cross-origin iframe, talking only via postMessage RPC — not implemented. That is the natural way a React/Vue/Angular
   app could contribute its own admin screen without getting admin access.

Collections is CMS-shaped (every entry has slug/title/draft-publish/body), so arbitrary app data goes through
`AdminEntityPort`, not Collections.

## cms changes

1. **Posts & pages into cms** as content types. Today they're one Tovu `posts` table (`kind:"page"`), ~8k lines in
   `apps/website/src/features/{post,pages}`, and cms reserves `post`/`page` as legacy keys. Biggest job.
2. **Forms, widgets** move too (`./widgets` export is currently empty).
3. **Storage adapters:** cms ships none; every real repo is Tovu Drizzle. Ship SQLite + Postgres adapters
   (on `@jini-ai/infra`).
4. **Runtime hygiene:** media barrel exports Node-only code (`LocalFsBlobStore`, sharp, `node:crypto`) as
   "universal" — split. Global `registerPermission` at import → host-scoped registration.
5. **Workspace vs site:** `workspaceId` is in almost every port; add the mapping layer to the admin entity port.
6. **Admin ports for content:** `@jini-ai/admin` has no posts/pages port — add them.

## Phases (prototype first)

0. **Decisions** (below). Read Zana report 22 open decisions (`:551-575`) and Tovu spec 048 `[NEEDS CLARIFICATION]`s.
1. **Prototype slice:** Zana dummy React app + Zana admin showing Media + Collections from real cms (no mocks),
   capability-gated nav. Proves the contract end to end.
2. **Admin decoupling in Tovu** (1, 2, 4 above) — no behaviour change for Tovu users.
3. **cms: posts/pages/forms/widgets + storage adapters.** Tovu switches to them in the same job (old paths absorbed).
4. **app-sdk:** framework-neutral core + React binding; then Vue, Angular templates in Zana.
5. **Merge admin shells** into Jini; Tovu and Zana both consume it.

## Owner decisions

1. **Where do the adapters live?** Zana `apps/vibecoding/` is taken. Recommended: contract + app-sdk in Jini
   (`@jini-ai/app-sdk` with `/react` `/vue` `/angular`), Zana only holds templates.
2. **Can a generated app add its own admin screens (its own JS)?** Recommended no for v1 — data + entity
   descriptors only. Later: yes via ADR-025's sandboxed iframe, never in the admin's own page.

## Verification note
Second, blind research pass (Opus, 2026-09-24) agreed on all core facts; changes above came from it
(raw clients, per-feature port seams, unused `@tovu/headless`, no Jini AdminShell, ADR-025). Unresolved: Zana
`apps/desktop/src/project-contracts.ts:86-87` says `/admin` answers 501 while `apps/server/src/admin-routes.ts` proxies it.
3. **One admin shell in Jini, or keep Tovu and Zana admins separate?** Recommended one shell.

## Owner decision 2026-09-24
Decision 3 answered: Zana admin is its own project (started as a copy of Tovu admin), not a shared Jini shell.
Flow: vibecoded app -> Zana admin (+ Zana server) -> Jini packages (agent runtime, cms, capability-providers).
Adapters sit between the vibecoded app and Zana; Tovu is not in the path.

## Owner direction 2026-09-24 (later)
- The vibecoded app talks ONLY to Zana. No Jini imports or types in the app; Zana's own adapter maps to Jini internally.
- The Zana app contract is domain-agnostic (care app, accounting, tire shop, restaurant): a versioned JSON manifest
  (entities, fields, actions) + standard REST endpoints; domain words live only in each app's manifest data.
- Gaps vs Jini's AdminEntityDescriptor the Zana adapter must cover: choice/enum, money, file/image kinds; custom actions.
