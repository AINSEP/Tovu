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
