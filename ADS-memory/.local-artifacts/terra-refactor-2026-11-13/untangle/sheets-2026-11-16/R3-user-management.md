# R3 + C9c sheet: user-management kit and repoint (3 sub-sheets)

Read `COMMON.md` first. Sites: `sites/R3.sites.tsv` (39 sites, 34 files): `ui-kit/react` 23, `admin/react` 6, `ui/panel-kit` 4, `ui` 3, `ui/fetch-query` 1, `ui/admin-widgets` 1, `ui-kit` (root, `needs`) 1. By folder: `src/admin/react` 24 sites, `src/react/users` 10, `src/react/members` 3, `src/react/auth` 2. Needs: C7 (landed), C9a (landed; it is the pattern to copy: `packages/admin/src/react/kit.tsx`, 268 lines). `user-management → agentic` is gone from source (stale peer: G-STALE-DEPS). No kit file exists in user-management today (`ls packages/user-management/src/react/kit.tsx` fails).

| Sub-sheet | Work | Estimate (Sonnet) |
|---|---|---|
| C9c | the kit interface, provider, fake, conformance of the Tovu binding | 90k |
| R3a | `src/admin/react/**` (24 sites) onto the kit | 110k |
| R3b | `src/react/{users,members,auth}/**` (15 sites) onto the kit + manifest cleanup | 80k |
C9c first. R3a and R3b are file-disjoint and may run in parallel after it.

## C9c: `packages/user-management/src/react/kit.tsx`
```
jini_files (all NEW):
  - packages/user-management/src/react/kit.tsx                       (≤ 200 lines)
  - packages/user-management/src/react/__tests__/fake-um-kit.tsx     (fake + renderWithUmKit)
  - packages/user-management/src/react/__tests__/kit.unit.test.tsx
  - packages/user-management/package.json                            | lane may add the "./react/kit" export + jini.entries line (universal/react as admin's kit entry is)
tovu_file: none (the binding joins apps/admin/src/integrations/jini-kits.ts: coordinator-only; the lane reports the lines)
```
1. **Derive the slot list from the census, do not guess.** `cut -f3,8 sites/R3.sites.tsv | sort | uniq -c`. At the merged state the names are:
   - components (from `@jini-ai/ui-kit/react`, `@jini-ai/admin/react`, `@jini-ai/ui`, `@jini-ai/ui/admin-widgets`): `Button`, `TextField`, `Select`, `Menu`, `Tabs`, `Badge`, `Notice`, `Spinner`, `ConfirmDialog`, `SecretInput`, `RowMenu`, `InfoTip`; types `ConfirmDialogProps`, `MenuItem`, `RowMenuItem`.
   - hooks (from `@jini-ai/ui/panel-kit`, `@jini-ai/ui/fetch-query`): `useFetchQuery`, `useFetchMutation`, `useAsyncAction`, `useCachedLoader`, `useInvalidate`; type `QueryKey`.
2. **Interface (B4: the consumer declares it; implementers never import it):**
   ```ts
   export interface UserManagementKitComponents { Button: ComponentType<ButtonProps>; TextField: …; Select: …; Menu: …; Tabs: …; Badge: …; Notice: …; Spinner: …; ConfirmDialog: …; SecretInput: …; RowMenu: …; InfoTip: … }
   export interface UserManagementKitHooks { useFetchQuery: …; useFetchMutation: …; useAsyncAction: …; useCachedLoader: …; useInvalidate: … }
   export interface UserManagementKit { readonly components: UserManagementKitComponents; readonly hooks: UserManagementKitHooks }
   export function UserManagementKitProvider(props: { kit: UserManagementKit; children: ReactNode }): ReactElement
   export function useUserManagementKit(): UserManagementKit   // throws a typed "kit not provided" error naming the provider
   ```
   Each `…Props` type restates **only the props user-management passes** (collect them per component: `rg -n "<Button\b" -A3 packages/user-management/src | …`). Two components named `ConfirmDialog` are imported today, one from `ui-kit/react` and one from `admin/react`, and `RowMenuItem`/`MenuItem` differ: compare their props at every call site; if the two `ConfirmDialog`s are used with different props, keep **two slots** (`ConfirmDialog`, `RowConfirmDialog`) rather than merging contracts (lesson 7).
   Hook slots: copy each hook's signature as user-management calls it (argument object and returned fields it reads). Export thin wrappers `useFetchQuery = (...a) => useUserManagementKit().hooks.useFetchQuery(...a)` as admin's kit does (`kit.tsx:262`), so call sites only change their import line.
3. **Fake:** `fakeUmKit(overrides?)` renders each component as a plain element with `data-um-kit="<Slot>"` and its label/children, and implements the hooks over in-memory state (query returns the loader's resolved value; mutation calls the function and exposes pending/error). `renderWithUmKit(ui, { kit })`.
4. **`needs()` exports:** `src/admin/react/index.ts:1-21` declares `rolesKitNeeds`, `usersKitNeeds`, `membersKitNeeds`, `authKitNeeds` with `needs` from `@jini-ai/ui-kit`. GAPS §4.7 found no reader in Jini or Tovu. Re-check (`rg -n "(roles|users|members|auth)KitNeeds" packages apps examples`); with no reader, delete the four exports and the import in **R3a** (breaking: changeset). With a reader: STOP.
5. **Tests first (`kit.unit.test.tsx`):** rendering a users page without a provider throws the typed error (RED until the hook exists); with the fake, every slot in the interface is rendered at least once across the package's pages (a slot never used fails the test, so the interface cannot carry dead slots).
6. **Coordinator lines for Tovu `jini-kits.ts`:** `export const userManagementKit = { components: { Button, TextField, … from '@jini-ai/ui-kit/react'; RowMenu, ConfirmDialog from '@jini-ai/admin/react'; SecretInput, InfoTip from '@jini-ai/ui' }, hooks: { … from '@jini-ai/ui/panel-kit' and '@jini-ai/ui/fetch-query' } } satisfies UserManagementKit;` and the provider mounted where user-management's admin pages are registered (`apps/admin/src/integrations/jini-admin/`; C7's worked binding `users-module.ts` shows the place). `rg "@jini-ai/user-management" apps/admin/src` to find the mount points; **not verified by this run**.

## R3a / R3b: call sites
For each row of `sites/R3.sites.tsv` in the sub-sheet's folder:
- replace the import from `@jini-ai/ui-kit/react`, `@jini-ai/admin/react`, `@jini-ai/ui*` by `const { Button, … } = useUserManagementKit().components` at the top of the component (hook rules: top level, never in a callback or loop), or by the kit's hook wrappers for the five hooks;
- a `.hooks.ts` file that imported a ui hook imports the wrapper from `../kit.js` (relative path), nothing else changes;
- type-only imports (`ConfirmDialogProps`, `MenuItem`, `RowMenuItem`, `QueryKey`) come from `kit.tsx`.
- Components that today receive hooks as props defaulted to the real hook keep that shape; the default becomes the kit wrapper (owner rule: hooks injected as props defaulted to the real hook).

**Tests:** 20 user-management test files import a non-base package today (census). In this lane, every test of an edited component switches to `renderWithUmKit` and drops its `@jini-ai/ui-kit`/`@jini-ai/ui`/`@jini-ai/admin` imports and any `vi.mock` of them. Assertions that looked for ui-kit markup switch to the fake's `data-um-kit` markers **with the same count and text**; report the assertion count per file before and after. A test whose subject is the real ui-kit rendering moves to `packages/integration-tests` (G-TESTS T3), it is not rewritten into a tautology.

**Steps:** one commit per feature folder (`admin/react/roles`, `…/users`, `…/members`, `…/auth`, then `react/users`, `react/members`, `react/auth`: list the real folder names from the site list), each green alone because the real implementations stay importable until the last one. Final commit of R3b: delete `@jini-ai/ui`, `@jini-ai/ui-kit`, `@jini-ai/admin` from `packages/user-management/package.json` (dependencies and peers), update `src/__tests__/package-entries.test.ts`, and report the gate helpers that become dead (`hasReactPeer`, `isAdminIntegration`, `isReactIntegration` in `scripts/check-package-layers.ts`: coordinator).

**Chrome look after landing** (UI lane): users list, roles tabs, member invite, auth settings in Tovu admin, light and dark.

## STOP
- Two same-named components have different contracts and more than two slots would be needed.
- A `*KitNeeds` export has a reader.
- A component needs a ui-kit behaviour the fake cannot express without importing ui-kit (report the component; it is an integration test).
