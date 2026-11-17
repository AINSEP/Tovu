# R3 + C9c sheet: user-management kit for forbidden domain imports only (2 runs)

Revision 2 (judge findings 1, 10, 12). Read `COMMON.md` first. `sites/R3.sites.tsv` has 39 rows; **23 are class `allowed-optionC`** (`@jini-ai/ui-kit/react` imported by React files under `src/admin/react/**`) and are **not work: keep those imports exactly as they are.** The old sub-sheet R3a (24 sites onto a kit) is **deleted**.

Cleanup work = **16 sites** (`awk -F'\t' '$12=="work"' sites/R3.sites.tsv`):
| Target | Sites | Names |
|---|---|---|
| `@jini-ai/admin/react` | 6 | `RowMenu`, `ConfirmDialog`, type `RowMenuItem` (`react/users/{Users.tsx:3, ChangeUsernameDialog.tsx:1, UserRowParts.tsx:2, rules.ts:4}`, `react/members/{Members.tsx:2, rules.ts:4}`) |
| `@jini-ai/ui`, `ui/admin-widgets` | 4 | `SecretInput` (`react/auth/Login.tsx:2`, `TotpSettings.tsx:1`, `react/users/Users.tsx:12`), `InfoTip` (`Users.tsx:11`) |
| `@jini-ai/ui/panel-kit`, `ui/fetch-query` | 5 | `useFetchQuery`, `useFetchMutation`, `useAsyncAction`, `useCachedLoader`, `useInvalidate`, type `QueryKey` (`react/users/hooks/*.hooks.ts`, `react/users/rules.ts:2`, `react/members/hooks/use-members.hooks.ts:6`) |
| `@jini-ai/ui-kit` (root) | 1 | `needs` (`admin/react/index.ts:1`) |

| Run | Work | Estimate (Sonnet) |
|---|---|---|
| C9c | the kit (4 component slots, 5 hook slots), provider, fake, probe test; Tovu binding + provider mount (pair); the `needs` deletion | 70k |
| R3b | `src/react/{users,members,auth}/**` (15 sites) onto the kit, page tests per commit, manifest cleanup | 90k |
C9c first (wave 1), R3b after it (wave 2).

## C9c: `packages/user-management/src/react/kit.tsx`
```
jini_files:
  - packages/user-management/src/react/kit.tsx (NEW, ≤ 150 lines) ; src/react/__tests__/{fake-um-kit.tsx, kit.unit.test.tsx} (NEW)
  - packages/user-management/package.json ("./react/kit" export + jini.entries line, as admin's kit entry is) ; API baseline ; scripts/injection-debt.json (the `needs` key)
  - packages/user-management/src/admin/react/index.ts:1-21 (the four `*KitNeeds` exports)
tovu_files (pair): apps/admin/src/integrations/jini-kits.ts (add `userManagementKit`) ; apps/admin/src/main.tsx (mount `UserManagementKitProvider` beside the admin kit provider)
```
1. **Interface (the consumer declares it; implementers never import it):**
   ```ts
   export interface UserManagementKitComponents { SecretInput: ComponentType<SecretInputProps>; RowMenu: ComponentType<RowMenuProps>; ConfirmDialog: ComponentType<ConfirmDialogProps>; InfoTip: ComponentType<InfoTipProps> }
   export interface UserManagementKitHooks { useFetchQuery: …; useFetchMutation: …; useAsyncAction: …; useCachedLoader: …; useInvalidate: … }
   export interface UserManagementKit { readonly components: UserManagementKitComponents; readonly hooks: UserManagementKitHooks }
   export function UserManagementKitProvider(props: { kit: UserManagementKit; children: ReactNode }): ReactElement
   export function useUserManagementKit(): UserManagementKit   // throws a typed "kit not provided" error naming the provider
   ```
   Each `…Props` type and `RowMenuItem`, `QueryKey` restate **only what user-management passes or reads** (collect per component: `rg -n "<(SecretInput|RowMenu|ConfirmDialog|InfoTip)\b" -A4 packages/user-management/src/react`). This `ConfirmDialog` slot is the **admin** one used under `src/react/**`; the `ui-kit/react` `ConfirmDialog` used under `src/admin/react/**` is an allowed direct import and is not a slot. Hook slots copy each signature as user-management calls it. Export thin hook wrappers (`useFetchQuery = (...a) => useUserManagementKit().hooks.useFetchQuery(...a)`), as admin's kit does (`packages/admin/src/react/kit.tsx:262`).
2. **Fake:** `fakeUmKit(overrides?)` renders each component as a plain element with `data-um-kit="<Slot>"` and its label/children, and implements the hooks over in-memory state (query: loading → resolved value or error; mutation: pending/error). `renderWithUmKit(ui, { kit })`.
3. **Tests first, with a dedicated consumer (judge finding 12: no existing page uses the kit yet):** `kit.unit.test.tsx` defines a test-only `KitProbe` component that renders all four component slots and calls all five hook wrappers. (a) `KitProbe` without a provider throws the typed error naming the provider (RED until the hook exists); (b) with `fakeUmKit` every slot renders and every hook returns the fake's output; (c) an override replaces exactly one slot; (d) a type-level case: an object missing one slot does not satisfy `UserManagementKit`. Page-level coverage is **not** claimed here; it belongs to R3b's commits.
4. **`needs()` exports:** re-check `rg -n "(roles|users|members|auth)KitNeeds" packages apps examples -g '!**/dist/**'` in both repos. No reader → delete the four exports and the `@jini-ai/ui-kit` root import in this run, with the debt key. A reader exists → **STOP**.
5. **Tovu pair (same run):** `jini-kits.ts` gains `userManagementKit = { components: { SecretInput, InfoTip, RowMenu, ConfirmDialog }, hooks: { … } } satisfies UserManagementKit` from the real packages (Tovu is the host; it may import them), and `main.tsx` mounts the provider. Nothing reads the kit yet, so both repos are green after each commit. A slot that does not `satisfies` without a cast → **STOP**: the restated props are wrong.

## R3b: call sites (15 sites)
For each `work` row under `src/react/**`:
- components: `const { RowMenu, … } = useUserManagementKit().components` at the top of the component (hook rules: top level only);
- a `.hooks.ts` file imports the wrapper from `../kit.js` / `../../kit.js`; components that receive a hook as a prop **keep that prop, defaulted to the kit wrapper** (owner rule), and each such component gets a fake-hook output test (pass a fake hook prop, assert the rendered output);
- type-only imports (`RowMenuItem`, `QueryKey`) come from `kit.tsx`.

**Tests per commit (this is where page/slot coverage lives):** each commit switches the tests of the pages it edits to `renderWithUmKit`, drops their `@jini-ai/ui`/`@jini-ai/admin` imports and any `vi.mock` of them, and asserts with the fake: the page's **loading** state, its **error** state (the fake query rejects: the plain-words error and its Copy-details control render) and its loaded state, so conditional slots (`ConfirmDialog` open, `RowMenu` items, `InfoTip`) are each rendered at least once. Assertions that looked for real `ui`/`admin` markup switch to the fake's `data-um-kit` attributes; text assertions stay. One real-implementation render per page stays as a host test in Tovu admin (or moves with G-TESTS T4); it is never dropped: report the test count before and after.

**Steps (each commit green alone in both repos, because the Tovu provider is already mounted):** one commit per folder: `react/auth` (2 sites), `react/members` (3), `react/users` (10). Last commit: delete `@jini-ai/ui` and `@jini-ai/admin` from `packages/user-management/package.json` production fields **with** their debt keys and lockfile (`rg -n "@jini-ai/(ui|admin)['/\"]" packages/user-management/src -g '!**/__tests__/**' -g '!*.test.*'` prints only `@jini-ai/ui-kit/react` lines). **`@jini-ai/ui-kit` stays a declared dependency** (option C imports use it).

**Chrome look after landing** (UI lane): users list, row menu, change-username dialog, member invite, login and TOTP settings in Tovu admin, light and dark.

## STOP (commands above)
- A `*KitNeeds` export has a reader. A slot needs a cast to fit. A component needs a `ui`/`admin` behaviour the fake cannot express without importing that package (report the component; its test is an integration test).
- `awk -F'\t' '$12=="allowed-optionC"' /tmp/census/CENSUS-sites.tsv | wc -l` is lower than 23 after your run: you removed a permitted import.
