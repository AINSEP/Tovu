# T-SCREEN: the recipe every S sheet uses to move one Tovu admin screen to its owner's `/react`
Assemble a run as: `cat COMMON-ADMIN.md T-SCREEN.md <S sheet section>`. One screen = one run (<= 250k).

Shape every feature already has (verified on roles, taxonomy, menus, trash, collections): `<Screen>.tsx`,
`<Screen>.hooks.tsx`, `hooks/use-<x>.hooks.ts` (state), `hooks/<x>-port.hooks.ts` (the port type the screen needs),
`hooks/<x>-dependencies.hooks.ts` (the Tovu binding of that port to the API), `api/<x>-api.ts` + `.types.ts`
(per-feature HTTP client from size-06), `rules.ts` (pure), `<x>-i18n.ts` (dictionary), `index.ts`.
What moves and what stays:
| File kind | Goes to |
|---|---|
| `<Screen>.tsx`, `<Screen>.hooks.tsx`, `hooks/use-*.hooks.ts`, `rules.ts`, small components | owner `…/admin/react/{pages,tabs,components,hooks}` and `…/admin/{rules,models,controllers}` |
| `hooks/<x>-port.hooks.ts` | owner `…/admin/ports.ts` (the owner declares it), as an `adminPort` token the module `requires` |
| `hooks/<x>-dependencies.hooks.ts`, `api/*` | **stay in Tovu**, become `integrations/jini-admin/<x>-ports.ts` (URLs, workspace id, error decoding are host binding: lesson 9) |
| `<x>-i18n.ts` | stays in Tovu; owner gets `messages.en.ts` with the same keys |
| `index.ts` | becomes the thin mount (copy `features/comments/index.ts`, 17 lines) |
| tests | follow the file they test; a test that renders through the real API fake stays in Tovu as the binding's test |

## Steps
0. COMMON-ADMIN section 0, with `<area>` = the sheet's area. Then the dependency census (lessons 1-4), written into
   the report before any edit:
   - outgoing: `rg -n "from ['\"]\.\./\.\./" apps/admin/src/features/<x> -g '!**/__tests__/**'` (everything outside the feature)
   - incoming: `rg -ln "features/<x>['\"/]" apps/admin/src -g '!**/features/<x>/**'`
   - module state: `rg -n "^(export )?(let|const) \w+ = (new (Map|Set|WeakMap)|\[\]|\{\}|create\w+\()" apps/admin/src/features/<x> -g '!**/__tests__/**'`
     (a module-level cache, bus or store must get an owner and a lifetime: per admin instance, principal and
     workspace; never a module singleton in Jini)
   - late reads: `rg -n "(localStorage|sessionStorage|window\.|document\.|import\.meta\.env)" apps/admin/src/features/<x> -g '!**/__tests__/**'`
     (each becomes a port method or stays in the Tovu binding)
   - hooks used by components: `rg -on "\buse[A-Z]\w+\(" apps/admin/src/features/<x>/*.tsx | sort | uniq -c`
   - source-reading tests and manifests naming the files: `rg -ln "features/<x>/" apps/admin/src/**/__tests__ development scripts`
   - CSS: `rg -n "<each className used by the screen>" apps/admin/src/styles.css apps/admin/src/styles`
   Each outgoing edge is classified: PORT (data or action from the host), KIT (a control), SLOT (another screen's
   UI, passed in as a component), PURE (moves along or already exists in `@jini-ai/core`), or STAYS.
   **STOP if** more than 12 distinct outgoing symbols are not PURE/KIT (the screen is tangled: it needs a design),
   or any outgoing edge points into another feature's internals without a SLOT answer in the sheet.
1. Split first if needed, **in Tovu, under green tests** (one refactor type per commit): every file listed in the
   sheet's ">500" column, and any function over 50 lines or complexity over 10, is split by its dependency graph
   before the move. Check with `npm run check:size && npm run check:complexity`; the file's debt keys are removed.
   If a split needs judgment the sheet did not give, STOP and report the function and its line span.
2. Characterization tests (GREEN now; each shown RED under the mutation named in the sheet's test table). Minimum
   for every screen: (a) the request sequence for open / save / delete through a fake port (method, argument object,
   order); (b) the rendered rows for one fixture; (c) error path shows plain words + "Copy details"; (d) permission
   variants render the same controls as today; (e) unmount during a pending request does not set state.
   **Characterize, never invent (lesson 31):** every assertion cites the Tovu `file:line` that produces the
   behaviour today. A test for behaviour the code does not have is a proposal: list it under "proposed changes"
   in the report and do not write it. A fake used for a concurrency or permission assertion must itself refuse
   what the real server refuses (a fake that accepts a stale revision proves nothing): check the fake first.
3. Jini commit A: owner module (precedent `packages/user-management/src/admin/`), kit file, `messages.en.ts`,
   memory adapter + conformance suite for the port, fakes under `…/testing`. Hooks are props. Classes `jini-<domain>-*`.
   Export-map keys follow the specifier table in `JM-jini-domains-out.md` (`<owner>/<domain>/admin[/react|/adapters/http|/adapters/memory|/conformance]`),
   are added to the owner's `package.json` with their `jini` runtime tags **by this run, in this commit**, with
   `pnpm install`, and are built in this commit. Nothing consumes it yet. Green.
4. Tovu commit B: `integrations/jini-admin/<x>-ports.ts` (binding; run the owner's conformance suite against it
   with the existing API fake), `<x>-module.hooks.ts` (copy `comments-module.hooks.ts`, 35 lines), thin `index.ts`,
   i18n parity test (locales from `ADMIN_LOCALES`), CSS selector renames, delete the moved Tovu files, retire their
   debt keys, **and in the same commit** the `panels.tsx` entry, the `modules.hooks.ts` line and the `jini-kits.ts`
   binding (shared files: this is why screen sheets run one at a time, COMMON-ADMIN section 3).
   `(cd apps/admin && npx vite build)` succeeds linked to commit A.
5. Chrome check (COMMON-ADMIN 4). 6. Report.

## Binding checks (lesson 12), for every port method
Write a three-column table in the report: port method and argument object | Tovu API call it maps to | the test that
fails when one argument is dropped or two are swapped. A structural `satisfies` is not enough.

## STOP (in addition to the ones above)
- The owner package would need to import another domain package, `@jini-ai/ui` or `@jini-ai/admin`.
- The feature imports an editor or other third-party UI library (`rg -n "from ['\"]@tiptap/|from ['\"]@codemirror/" apps/admin/src/features/<x>`
  prints a line): the dependency owner is an open decision (lane K/T D-T4). STOP unless the sheet names the decision.
- A behaviour exists only in the dictionary (a key with no caller, or a caller with no key): report, do not guess.
- The screen permanently deletes something without the trash port.
- An animation is switched off for small screens after your change.
