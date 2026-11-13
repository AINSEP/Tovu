### tovu:apps/admin/src/features/sites/hooks/use-sites.hooks.ts
- **Over:** `useSites` 118 (file 184, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`, `Sites.unit.test.tsx`, `create-site-admin-password.unit.test.tsx`, `create-site-plugin-tokens.unit.test.tsx`, `sites-idle-requests.unit.test.tsx` (same folder), `apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx`
- **Responsibility map:**

| unit | statements in `useSites` | job |
|---|---|---|
| A | `createName`, `adminPassword`, `createdAdminLogin`, `createdName`, `pluginTokens`, `createdTokens`, `creatingRef` (+ comment), `nameErrorKey`, `setCreateName` (+ comment), `setAdminPassword`, `createSite` | the Create-site form |
| B | `activation`, `activatingName`, `activateSettlement` (+ comment), `writes` (+ "Activations reach the server one at a time…" comment), `activate` | serialized activation |
| C | `list`, `siteConfirm`, `localSites`, `createMutation`, `activateMutation`, `view`, return | composition (stays) |

- **Splits** (same file, module level, above `useSites`):
  1. SUB-HOOK `useCreateSiteForm({ port, list, t, createMutation, activateMutation }: UseCreateSiteFormInput): { createName; adminPassword; setAdminPassword; createdAdminLogin; setCreateName; nameErrorKey; createSite; createdName; pluginTokens; createdTokens }` ← unit A (deps arrays unchanged).
  2. SUB-HOOK `useSiteActivation({ port, createMutation, activateMutation }: UseSiteActivationInput): { activate; activatingName; activation }` ← unit B.
  3. `useSites` order: `list`, `siteConfirm`, `localSites`, `createMutation`, `activateMutation` (move them above the sub-hook calls), `useCreateSiteForm`, `useSiteActivation`, `view`, return — return fields unchanged, read from the destructured names.
  Types: `list: ReturnType<typeof useSitesSnapshot>`. For the mutations, add two module-level hooks wrapping the existing calls verbatim — `useCreateSiteMutation({ port }: { port: SitesPort })` and `useActivateSiteMutation({ port }: { port: SitesPort })` (each returns its `useFetchMutation({...})`) — and type the inputs as `ReturnType<typeof useCreateSiteMutation>` / `ReturnType<typeof useActivateSiteMutation>`. `useSites` calls them where the two `useFetchMutation` calls are now.
- **Importers to update:** none.
- **After:** file ~215; `useSites` ~45; `useCreateSiteForm` ~60; `useSiteActivation` ~33.
- **Risks / notes:** `createSite` calls `activateMutation` and `activate` calls `createMutation.reset()` — that is why both mutations stay in `useSites` and are passed down. `useState` order shifts only by grouping.
