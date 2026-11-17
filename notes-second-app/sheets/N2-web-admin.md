# N2: `examples/notes-web`, the admin shell and entity screens wired to the notes API

## Revision 3 (authoritative; revision-2 corrections folded into the steps below, which were rewritten in place)

- **Prerequisite GA landed** (judge 7, 6, 8, 12: mutation-failure seam `describeFailure` / `{ failure, retry, reload }`,
  create-time fields, `refreshToken`, `search` in the list query). The revision-2 check named `onMutationFailure`,
  which GA never creates, so `refreshToken` alone satisfied it. Landed check (both must print at least one line):

  ```bash
  rg -n "describeFailure" packages/admin/src/react/entities
  rg -n "refreshToken" packages/admin/src/react/entities
  ```

  Either empty: STOP. The conflict message and Reload action are built on that seam; do not catch errors in the example.
- **Static serving (judge 2).** The `Server` contract has no wildcards and requires equal segment counts
  (`packages/core/src/contracts/server.ts:95-107`), `GET /` is already registered (`examples/notes-app/src/app.ts:58`),
  and a duplicate registration throws. So: the admin is mounted at **`/admin/`**; `serveAdminBundle` is bound to N0's
  `onUnmatched` hook; there is **no `--web` flag and no "register last" static route**. The existing HTML routes and
  every smoke assertion stay untouched (characterized first, T5).
- **Judge 17 (transitive providers)** and **judge 18 (no slice `index.ts` files)**: kept, see Inventory and Structure.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n2-web`. Creates `examples/notes-web/**`; in
`examples/notes-app` adds `src/admin-bundle.ts` bound to N0's `onUnmatched` and one argv option for the bundle location.
Prerequisites: N1 and GA merged. Estimate: ~150k Sonnet.

## Goal

First real consumer of `AdminShell` + `createEntityPanel`: a Vite + React app that lists, creates and edits
notes and searches them, with every UI primitive injected through `AdminKitProvider`. No component is
copied from any other app.

## Inventory

```sh
sed -n 1,90p packages/admin/src/react/shell/types.ts            # AdminShellProps, AdminShellSlots, AdminShellLabels (10 labels)
sed -n 1,40p packages/admin/src/core/ports/shell.ts             # session + navigation ports
rg -n "^export" packages/admin/src/browser/shell-navigation*.ts packages/admin/src/browser/index.ts | head -20   # createAdminShellNavigation
sed -n 60,82p packages/admin/src/react/entities/contribution.tsx # createEntityPanel(args, options)
sed -n 100,180p packages/admin/src/react/testing-kit.tsx         # fakeAdminKit, fixtureQuery
rg -n "onUnmatched" examples/notes-app/src                       # N0's hook (absent: STOP)
# Which kit slots do the shell and entity screens really use?
rg -no "\b(Button|IconButton|TextField|TextArea|Select|Switch|Dialog|ConfirmDialog|Tabs|Menu|Notice|Spinner|Badge|InfoTip|Lightbox|WidgetSelect|TabBar|HtmlEditor|ErrorNotice|use[A-Z]\w+)\b" \
  packages/admin/src/react/shell packages/admin/src/react/entities packages/admin/src/react/components/{Sidebar,DataTable}* \
  -g '!**/__tests__/**' | awk -F: '{print $NF}' | sort | uniq -c
# Transitive context hooks and their providers (judge 17)
rg -n "use[A-Z]\w*\(\{?\}?\)" packages/admin/src/react/shell packages/admin/src/react/entities packages/ui/src/react/components/CustomSelect.tsx
cat examples/reference-web/vite.config.ts | sed -n 140,169p     # the /api proxy pattern
```

Record the slot list in the report as USED; every other `AdminKit` slot is UNUSED. List every context hook with the
provider that satisfies it. Known today: `CustomSelect` needs the UI kit's overlay container
(`packages/ui/src/react/components/CustomSelect.tsx:14,532`; provider in `react/kit.tsx`).

## Structure (Feature-Sliced; imports only downward; **no slice `index.ts`**: import each symbol from its file)

```
examples/notes-web/
  package.json  (name @jini-example/notes-web; deps: react ^19.2, react-dom ^19.2, @jini-ai/admin, @jini-ai/core,
                 @jini-ai/ui, @jini-ai/ui-kit; dev: vite ^8.1.5, vitest ^2.1, jsdom, @types/react(-dom), typescript)
  vite.config.ts (base '/admin/'; dev server 127.0.0.1:4174; proxy /api -> process.env.NOTES_ORIGIN ?? http://127.0.0.1:3000;
                  test: { environment: 'jsdom' })
  index.html, tsconfig.json
  src/app/main.tsx            mounts <Providers><NotesAdmin/></Providers>
  src/app/providers.tsx       AdminKitProvider kit={adminKit}; every provider from the inventory; query provider if needed
  src/app/labels.ts           AdminShellLabels + translate({key}) => key (English source strings)
  src/pages/notes/NotesAdmin.tsx     <AdminShell …> with panels [notesPanel, searchPanel]
  src/pages/notes/panels.ts          createEntityPanel({ adminBase:'/admin/', panelId:'notes', navigate, registry, translate })
  src/pages/search/SearchPanel.tsx   AdminShellPanel: a search field + result links to the entity routes
  src/entities/note/descriptor.ts    NOTE_DESCRIPTOR (same field list as the server; not imported from it)
  src/entities/note/registry.ts      createAdminEntityRegistry({ note: createEntityHttpPort({ descriptor, baseUrl:'/api/entities/note', fetch }) })
  src/shared/gaps/entity-http-adapter.ts   // GAP: G6   AdminEntityPort over fetch (<= 110 lines, generic)
  src/shared/kit/admin-kit.ts        the host binding: `export const adminKit = { … } satisfies AdminKit`
  src/shared/kit/unbound.ts          // GAP: G4   unboundComponent(name) / unboundHook(name): throw
                                      Error(`AdminKit slot ${name} is not bound by notes-web (GAP G4)`)
  src/shared/session.ts              AdminShellSessionPort: read -> GET /api/session; logout -> resolves; onUnauthenticated -> no-op unsubscribe
  src/shared/styles.css              host styling of `jini-` classes; imports @jini-ai/admin/themes/default/admin.css
  GAPS.json + "gaps" script (reuse the checker: `node ../notes-app/scripts/check-gaps.ts --root .`; add that
            `--root` flag to the checker in this run, with a test)
```

Kit rule: bind a real implementation for every USED slot from `@jini-ai/ui-kit/react`, `@jini-ai/ui/*`
(choose by the slot's prop contract in `packages/admin/src/react/kit.tsx`); bind `unbound*` for every UNUSED
slot. Do not read or copy any other host's binding. If a USED slot has no implementation whose props satisfy
the kit type, STOP and report the slot (that is a new gap). `useT` / `useAdminLocale` are props defaulted to the
real hooks (COMMON rule 8).

Design notes (web-design): one calm layout; states are required, not optional: loading (`role="status"`),
empty list with a "New note" action, load error (`role="alert"` + retry), save conflict (inline alert:
"This note changed since you opened it" + "Reload" action, from GA's `{ failure, retry, reload }`), invalid field
(`aria-invalid`). Keyboard: the search field is reachable from the sidebar; focus moves to the heading after
navigation. No custom colours outside the theme tokens.

## Tests first (vitest + jsdom, `src/**/__tests__/*.test.tsx`; fakes only)

| # | Test | Must fail when |
|---|---|---|
| T1 | `entity-http-adapter.test.ts` with a fake `fetch`: list builds `?limit=&cursor=&search=` (URL asserted exactly); `get` 404 -> `null`; `update` sends PATCH with the whole patch incl. `version`; 409 -> throws an error whose `code` is `CONFLICT`; non-JSON 500 -> typed `TRANSPORT` error; fake fetch that rejects, throws a string, returns malformed JSON (three failure fakes, AP11). | status mapping or query building is wrong |
| T2 | `NotesAdmin.test.tsx` with the **real** `adminKit` and an in-memory `AdminEntityPort` fake (3 notes): the list shows 3 titles; "New Note" -> form -> save -> list shows 4; editing with a port that throws `CONFLICT` shows the conflict alert through GA's seam, keeps the typed text, and Reload refetches. | the registry, routes or error surface is mis-wired |
| T3 | `admin-kit.test.tsx`: rendering an UNUSED slot through the kit throws the named G4 error; `adminKit` passes `satisfies AdminKit` (typecheck) and every USED slot renders without the error; per provider from the inventory: rendering without it shows the documented failure, with it renders. | a used slot or provider is left unbound |
| T4 | `SearchPanel.test.tsx`: typing calls the port's `list({ search })` once per settled input (debounce with injected timers), shows results, shows the empty state for no match; an older slower response never replaces a newer one (out-of-order resolution, AP10). | the race guard is removed |
| T5 | `examples/notes-app/src/admin-bundle.test.ts` (`node --test`): characterization first, green before the change: every existing HTML route and the contact form answer as today. Then red-first: `serveAdminBundle({ request }, { dir })` answers only `GET`/`HEAD` under `/admin/` (a file from the bundle with `content-type` by extension, else `index.html` for a path without a file extension); returns `undefined` (so the adapter's 404 stands) for anything outside `/admin/` or another method; refuses `/admin/../package.json`, encoded `%2e%2e` and `%2f`, and absolute paths with 404 (path containment). | the containment check is removed, or the hook answers outside `/admin/` |

## Steps (commit each)

1. Scaffold package + typecheck/test/build scripts; empty app renders "Notes".
2. T1 red -> `entity-http-adapter.ts`. 3. T3 red -> kit binding and providers. 4. T2 red -> shell, panels, session, labels.
5. T4 red -> `SearchPanel`.
6. T5 characterization (green alone), then T5 red -> `examples/notes-app/src/admin-bundle.ts` (<= 70 lines, app code),
   bound in `main.ts` as `createNodeServer({}, { onUnmatched: (req) => serveAdminBundle(req, { dir }) })`, with `dir`
   from one new argv option `--admin-dir <path>` (default: `../notes-web/dist` resolved from the package location). The
   option name is what D1 and N5 read at dispatch.
7. Styles + README (run: `pnpm --filter @jini-example/notes-web dev` with notes-app running; or build and
   `node src/main.ts --admin-dir ../notes-web/dist`, then open `http://127.0.0.1:3000/admin/`).

## Acceptance

- Example-web and example-server gates of COMMON; both `gaps` scripts; block L.
- `rg -n "from '\.\./\.\./notes-app|from 'express'" examples/notes-web/src` empty; FSD check: no import from a
  higher layer (`rg -n "from '../../(app|pages)" examples/notes-web/src/{entities,shared,features}` empty); no
  `index.ts` under `examples/notes-web/src`.
- Manual look (if a browser is available): list, create, edit, conflict, search at 1280px and 390px; attach
  two screenshots at deviceScaleFactor 2 to the report. If no browser is available say so; N5 covers it.

## Not verified by the planner

The USED slot list; `createAdminShellNavigation`'s exact name and arguments; whether the kit's query hooks
need a provider from `@jini-ai/ui/fetch-query`; whether `admin.css` is enough for a usable layout; whether
`createEntityPanel` accepts `adminBase: '/admin/'` with the trailing slash.
