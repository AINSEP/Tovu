# apps/admin

The Tovu admin SPA: Vite + React, no framework router. Served at `/admin` — by Vite's dev server on
`:5173`, and in packaged builds by `src/server/middleware/admin-static.ts` (which serves
`apps/admin/dist`, or SEA assets in a single-binary build).

> Historical note: an earlier draft of this file described a Next.js app under `../../nextjs`. That
> is long gone; this is a Vite SPA. The section list below is the real one, read out of the code.

## Routing

Path-based, via `src/lib/router.ts`. URLs are real paths — `/admin/settings`, not
`/admin/#/section/settings`. There is no router dependency; `App.tsx`'s `parseRoute` is a ~30-line
segment matcher.

Two concepts that must not be conflated (doing so is what produced the old `#/section/` URLs):

- a **route path** is base-agnostic and is what `parseRoute` consumes: `/`, `/settings`, `/posts/abc`
- a **URL** is what goes in an `href`: `/admin/settings`

`router.ts`'s `adminHref` converts the first to the second. `nav.ts` stores route paths; `Sidebar`
applies the base. Anchors in `sections/*.tsx` are written as full URLs (`href="/admin/posts"`) and
stay plain `<a>` tags — a document-level click interceptor in `router.ts` turns unmodified
left-clicks into SPA navigations, so cmd-click, middle-click and "copy link address" all keep
working. Programmatic navigation is `navigate("/posts/abc")`, never `location.hash`.

Legacy `#/section/...` URLs are rewritten in place to their path equivalent on boot
(`redirectLegacyHashUrl`), so old bookmarks still land.

`/admin` is hard-coded in three places that must agree: `vite.config.ts` (`base`), the server's
`/admin/*` route patterns, and `ADMIN_BASE` in `router.ts`.

## Adding a new admin section

**This is the checklist. Step 1 is required; 2 and 3 are deliberate opt-ins, not oversights.**

1. **`src/App.tsx` — add one entry to the `SECTIONS` map.** This is the only required step, and it
   is the single definition of a section: the same map is both the router's allowlist
   (`parts[0] in SECTIONS`) and the render dispatch (`SECTIONS[id]?.()`). One entry gets you a
   working URL, the rendered screen, the sidebar highlight, and the correct `data-agent-page` value.
   The map holds thunks (`() => <Thing />`) so a screen needing props still fits.

   There is intentionally **no separate id allowlist to keep in sync.** Path routing needs one —
   `/admin/settings` has no marker distinguishing a section from a typo — but deriving it from the
   dispatch map means it cannot drift. Do not reintroduce a parallel list.

2. **`src/nav.ts` — only if it belongs in the sidebar.** Not derivable from `SECTIONS`: this carries
   the label, icon, group and ordering. Some sections are deliberately reachable without a nav entry
   (`appearance`, `settings-raw`). **The item's `id` must equal the `SECTIONS` key**, because
   `activeSectionId` derives the highlighted nav id from the route's section id — a mismatch gives a
   link that works but never lights up. `href` is a route path (`/settings`), not a URL.

3. **`src/lib/agent-pages.ts` — only if the AI assistant should be able to navigate there.** This is
   the security allowlist behind `page.navigate`, and it is manual **by design**: an agent can only
   reach pages this file names. Do **not** derive it from `SECTIONS` — that would make every new
   admin screen agent-reachable as a side effect of existing, which inverts the point of an
   allowlist. Values are route paths and must parse to a real route, or `page.navigate` reports
   success while sitting on the dashboard.

A section that renders but has no screen yet maps to `Placeholder` (see `newsletter`).

## Hooks (`src/hooks/*.hooks.ts`)

Stateful logic that isn't a component lives here, not in `src/lib/` — `lib/` is for modules
(clients, pure helpers), `hooks/` for things that call `useState`/`useEffect`. Files carry a
`.hooks.ts` suffix.

Each hook follows the `useX(dependencies)` / `useWiredX()` pair `@jini-ai/ui` uses throughout
(`features/html-viewer/react/hooks/usePresentMode.ts` is the reference implementation). Three files
per hook that needs I/O:

| File | Holds | Rule |
|---|---|---|
| `<name>-port.hooks.ts` | the interface the hook needs from outside | no runtime import of the provider — `import type` only |
| `<name>-dependencies.hooks.ts` | `default<Name>Port` (module singleton) + `createFake<Name>Port` | the **only** file importing the real client |
| `<name>.hooks.ts` | `useX(port)` + a one-line `useWiredX()` | pure rules imported directly, never injected |

Why the seam is worth three files: `useAssistantChats` was previously testable only by stubbing the
global `fetch`, so its tests asserted URLs and HTTP methods when what they meant to describe was
"which conversation did this message get written to". Retry and backoff behaviour was worse — it
needed hand-built `Response` objects with the right status codes. With a fake port a test says
`onSaveMessage: (…, attempt) => { if (attempt === 1) throw new HttpError(503, …) }`.

Two traps, both of which have already cost real time:

- **The port must be read through a ref, not listed in dep arrays.** Putting `port` in every
  `useCallback`'s dependencies makes referential stability an unenforceable contract on callers, and
  the natural way to write an injection — `useChats={() => useAssistantChats(createFakePort())}` —
  builds a new port per render, so `refresh` changes identity, its effect refires, state updates,
  and it spins forever.
- **A "disposed" flag must reset on mount, not only set on unmount.** StrictMode runs mount →
  unmount → mount in development, so a cleanup-only version latches on the throwaway first pass and
  disables the behaviour it guards for the real one — a bug that exists only in dev.

Components consume the wired hook and may accept it as an overridable prop (`AssistantDock`'s
`useChats`), which is what lets a component test run against a fake without touching `fetch`.

## Components (`src/components/<Name>/`)

A shared component is a **folder of two files**, ported from `@jini-ai/admin`'s
`react/components/ConfirmDialog/` (see also `ConfirmButton/`, `RowMenu/` there):

| File | Holds |
|---|---|
| `<Name>/<Name>.tsx` | props interface + JSX, and nothing else |
| `<Name>/<Name>.hooks.tsx` | the state, effects, refs, and DOM/IO logic, as named `use*` hooks |

Four rules, each of which has already earned itself:

**1. No `index.ts` barrel.** Importers reference `components/<Name>/<Name>` directly. A barrel
makes "add a file to this folder" look like an API change and hides which module a symbol really
comes from.

**2. The component file is the one public entry point per folder.** Nothing outside a folder may
import from its `.hooks.tsx`. A hook with an external consumer gets re-exported by name from the
component file (`WidgetPickerDialog.tsx`'s `export { useWidgetAddControl };`); hooks with no
external consumer stay exported from `.hooks.tsx` only. Checked against the upstream package: no
consumer there reaches into a `.hooks.tsx` from outside its own folder.

**3. Any hook that touches the DOM, browser APIs, or IO is an injectable prop, defaulted to the
real hook.** This is the load-bearing rule — the folder split alone buys tidiness; this buys
testability.

```tsx
useClamp?: typeof useSeeMoreClamp;                        // optional prop
export function SeeMore({ useClamp = useSeeMoreClamp, ...props }: SeeMoreProps) {
```

Shorten the prop name the way the reference does (`useConfirmDialog` → `useDialog`), so
`useSeeMoreClamp` → `useClamp`, `useFabPosition` → `useFab`. Where the prop name would collide
with the imported hook, rename the *local binding*, not the prop (`useExecutionConfig:
useExecutionConfigState = useExecutionConfig`).

Two consequences worth stating, because both were argued and settled:

- **The seam is additive.** The default is the real hook, so every existing test that renders the
  component without passing the prop still exercises the real path unchanged. Adding a seam is
  never a reason to convert an existing integration test to a fake — `ChatFab`'s end-to-end
  drag-guards-click test deliberately drives the real `useFabPosition`, and stays that way.
- **One seam per *reachable* boundary; no nested overrides.** `useExistingInstances` runs only
  inside `useWidgetPickerDialog`, which is already injectable — faking the outer hook means the
  inner one never executes. Threading an override into a hook's own parameter list would add API
  surface no consumer can reach.

Each component with a seam carries a test proving the real hook is **not** hardcoded, modelled on
the upstream `describe('ConfirmDialog dialog-hook injection')` block. Make the fake return
something the real hook cannot produce, so the test fails if the default is ever wired back in
directly — a fake resolving data synchronously (the real hook always starts `null` and resolves a
microtask later), or a position outside the real hook's clamp range.

This is also the fix for **vacuous tests under jsdom**, which reports `0` for every layout
measurement. A `useSeeMoreClamp` test without the seam can pass while asserting nothing; with it,
you inject "overflows" vs "fits" and assert the two renderings differ.

One sharp edge: **a fake for a generic hook has to stay generic.** `typeof useFetchedOptions` is
`<T>(…) => { items: T[] | null; error: string | null }`, so a fake written as a plain function
returning fixed literal types is not a valid substitute and `tsc` will reject it — pointing at the
fake, not at the genericity, which is what makes it confusing. Write the fake as
`<T>(): { items: T[] | null; error: string | null }` with an `as unknown as T[]` on the literal
data. Everywhere else, `typeof theRealHook` making the fake's shape self-enforcing is the pattern's
main benefit; this is the same mechanism biting rather than helping.

**4. Tests stay in `src/components/__tests__/`, not in the component folder** — matching upstream,
which keeps them in `__tests__/components/`. One file per concern: `<Name>.unit.test.tsx` for
markup and wiring, `<Name>.hooks.unit.test.tsx` for the hook's own behaviour.

### What belongs in `components/` versus `lib/`

**The file extension is not the test — addressability is.** `lib/` holds `.tsx` files, and that is
correct:

- A TipTap `Node` schema (`MediaImage`, `WidgetEmbed`) is a *module the editor consumes*, passed to
  `useEditor({ extensions: [...] })`. It lives in `lib/`.
- A **node view** (`MediaImageNodeView`) is React, but only `ReactNodeViewRenderer` can mount it and
  nothing else imports it — it is the schema's rendering half, always 1:1 with it. It lives in
  `lib/`, beside its schema. Splitting it out would file half of one node's definition elsewhere
  for a naming reason.
- A **toolbar control** any screen can render (`EmbedInsertControl`) is an ordinary component and
  belongs in `components/`.

## Tests

`npm --prefix apps/admin run test` (vitest + jsdom). Run from the repo root — `cd apps/admin &&
npm --prefix apps/admin` double-nests the path. Route tests drive the URL with
`history.replaceState`, never `location.pathname = …`: assigning a path is a real navigation, which
jsdom does not implement, so the app would silently render the dashboard and the test would pass
vacuously.

**The suite reports zero unhandled errors. Keep it that way** — an accumulated background of
tolerated noise is what lets a real one hide. Two sources have to be handled explicitly by any test
that renders `App`:

- **`EventSource is not defined`** under jsdom, from `App.tsx`'s frontend-session bridge. Not
  cosmetic: the throw tears the tree down, so `<main>` is gone before any `data-agent-page`
  assertion runs. Stub it inert (`class { close(){} addEventListener(){} removeEventListener(){} }`).
- **Teardown order.** Call `cleanup()` *before* `vi.unstubAllGlobals()`. Vitest runs `afterEach`
  hooks in reverse registration order and Testing Library registers its auto-cleanup on import — so
  the automatic version unmounts only after `fetch` is restored, and any effect still in flight hits
  real undici with a relative URL (`Failed to parse URL from /api/…`), reported against whichever
  test happened to run last.

A related trap when a test renders many screens: one shared `fetch` stub has to satisfy every
screen's data shape at once (`Dashboard` reads `r.posts.length` and `r.settings.activeThemeId`
unguarded, `Appearance` reads `themes.map`, `WidgetRegionEditor` reads `r.placements`), and each
missing key throws inside a `.then`. If an assertion is really about routing rather than rendering,
test the pure function instead — `agentPageId(parseRoute(path))` — so an unrelated screen gaining a
field cannot break it.

## Styling the chat pane

`@jini-ai/ui` **does** ship CSS, despite emitting BEM-ish `jini-*` class names: `ChatPane` injects
`CHAT_PANE_STYLES` as a `<style>` tag at mount, appended *last* in the cascade. A flat single-class
rule in `src/styles/assistant.css` therefore loses even at equal specificity. Override through the
`--jini-chat-*` custom properties, or with a descendant selector. Check computed style in the
browser before believing a rule in that file has any effect. See its header for the full account.
