# UI-A57: admin shell helpers (route template + error handlers, sidebar title/overflow, process-restart controller) -> `@jini-ai/admin/browser` + `@jini-ai/admin/react` (templates T-UI, T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A57`. Blocker "kit-inject": C9a (admin `react/kit.tsx`) has LANDED at integ/wave-b (`packages/admin/src/react/kit.tsx`, blob `6a609428fd9035d35561797e6e6a60ab7b363969`); none of the four helpers renders a kit component, so **no kit slot is needed** (all four are hooks/pure functions). Execute after wave B merge (App.tsx/main.tsx sit in applier-pass area; text-anchored edits below).

Tier: S1 Sonnet + Opus review (hook contracts), S2 Sonnet. est. executor tokens ≈ 36k (S1 22k, S2 14k). Chrome look owed after S2 (sidebar tooltips, Sites label truncation tooltip, assistant daemon restart tab).

## Findings that change the audit row
1. **Telemetry is mostly moved already**: Jini `admin/browser/telemetry.ts` owns collection, dedupe, caps and debounce (`createBrowserTelemetry`, `installBrowserErrorListeners`). What is left in `lib/browser-telemetry.ts` is (a) `toAdminRouteTemplate` (the route-param masking; its only Tovu coupling is the `ADMIN_BASE` prefix), (b) `reactRootErrorOptions` (calls `console.error`: rule 7 -> a `report` port, Tovu binds `console.error`), (c) the `adminTelemetry` singleton + `import.meta.env.MODE === "test"` policy (STAYS), and (d) three RE-EXPORT lines (`installBrowserErrorListeners`, types) that are forwarders to delete under rule 19 (importer: `main.tsx:18`).
2. **`useSitesSidebarNav` is mostly Tovu**: Sites discovery (`useSitesSnapshot`, `defaultSitesPort`), the `Sites ({siteName})` label pattern and `translateAdminNavLabel` STAY (row STAYS list). Only the overflow measurement (lines 79-93: `ResizeObserver` + window `resize` + `scrollWidth > clientWidth`) is generic -> `useOverflowTitle`.
3. **`useCmsSidebarLabelTooltips` hard-codes Tovu DOM**: `a.cms-item`, the `span` text, and the `/sites` href special case. Generic shape: "title each matching link with its visible label text, remember the original title, observe the nav for replaced rows, restore on unmount". The three Tovu specifics become args (`linkSelector`, `labelSelector`, `skipLink` predicate).
4. **The restart controller is a process-status hook, not an assistant one** (`use-assistant-daemon-restart.hooks.ts`: restart mutation + one status read on mount + one delayed read after restart; "no health signal exists, so we never claim one"). Jini name `useProcessRestart`; the port is `{ restart(); getStatus(): Promise<{ failed: boolean }> }` and Tovu's `getReadyz` -> `{ failed: readyz.assistantDaemonKnownFailed === true }` adapter lives in the Tovu dependencies file. Error text: `describeError` port (Tovu `describeApiError`) + `messages.restartFallback`/`statusFallback` strings (Tovu copy: `"failed to restart the assistant"`, `"failed to check the assistant daemon's status"`), so no Tovu words enter Jini. `REAL_POST_RESTART_CHECK_DELAY_MS = 2500` and the Local-CLI rationale comment STAY in Tovu.
5. `useAdminTelemetry` (20 lines, `useMemo` + `useEffect` feeding `setSignedIn`/`setRoute`) becomes `useBrowserTelemetryFeed`; Tovu deletes its hook file and App.tsx calls the Jini hook with `{ telemetry: adminTelemetry, base: ADMIN_BASE }` (not a forwarder: no Tovu hook remains).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/admin/src/lib/browser-telemetry.ts | blob facd5b8dd76f642d074d31e642bbcb2f3fe848d8 | keep-reduced
  - apps/admin/src/hooks/use-admin-telemetry.hooks.ts | blob c24f8f77020609695cf8bf10ba82ab4ed67f2ae0 | delete
  - apps/admin/src/hooks/use-cms-sidebar-label-tooltips.hooks.ts | blob 03a1ff62ae39d181504c3e4c3a362f0adb23a42a | delete
  - apps/admin/src/hooks/use-sites-sidebar-nav.hooks.ts | blob 703c0d5095d27476086ca1705df829212f390dde | keep-reduced (lines 79-93 leave)
  - apps/admin/src/features/ai-assistant/hooks/use-assistant-daemon-restart.hooks.ts | blob 7cd5e4145896f86ab87fc3c9b57959742b201624 | keep-reduced (controller leaves; wired binding + REAL delay stay)
tovu_importers_edited:
  - apps/admin/src/App.tsx | blob 93c51d8db7cd8da56a3bdbfdc121a5e12865749e | :2 import useCmsSidebarLabelTooltips, :36 import useAdminTelemetry + their call sites
  - apps/admin/src/main.tsx | blob 21291b92dade3dc627f01a0a0bec3d845efe5a70 | :18 import, :77 use of reactRootErrorOptions
  - apps/admin/src/features/ai-assistant/AiAssistant.tsx:31 imports useWiredAssistantDaemonRestart + type AssistantDaemonRestartController (names kept)
tovu_tests: every test file matching `rg -l "use-admin-telemetry|use-cms-sidebar-label|use-sites-sidebar-nav|use-assistant-daemon-restart|browser-telemetry" apps/admin` (record the list at step 0; telemetry route-template and restart-controller cases move to Jini, sidebar/Sites cases stay and are re-pointed)
jini_guards:
  - packages/admin/src/browser/telemetry.ts | blob 7481c8c495f264119912ec3caceea4f196fcf3b9
  - packages/admin/src/browser/index.ts | blob f248a7afa6d520462fa5af00b9a4e1ceec370c6c
  - packages/admin/package.json | blob f2b5d622f77a970deb49575370f56f321698ce7b (NO new subpath: `./browser` and `./react` exist)
  - `rg -n "toRouteTemplate|createReactRootErrorHandlers|useBrowserTelemetryFeed|useRailLabelTitles|useOverflowTitle|useProcessRestart" packages/admin/src` prints nothing
```

## Contracts (Jini)
```ts
// admin/src/browser/route-template.ts  (exported from browser/index.ts)
export function toRouteTemplate(required: { base: string; routePath: string; params: Readonly<Record<string, string>> }, optional: Record<string, never> = {}): string;
// admin/src/browser/react-root-errors.ts
export function createReactRootErrorHandlers(
  required: { telemetry: Pick<BrowserTelemetry, 'reportError'>; report: (required: { error: unknown }, optional?: Record<string, never>) => void },
  optional: Record<string, never> = {},
): { onCaughtError: (error: unknown, info: { componentStack?: string }) => void; onUncaughtError: (error: unknown, info: { componentStack?: string }) => void };
// admin/src/react/hooks/use-browser-telemetry-feed.ts
export function useBrowserTelemetryFeed(required: { signedIn: boolean; routePath: string; params: Readonly<Record<string, string>>; base: string; telemetry: Pick<BrowserTelemetry, 'setSignedIn' | 'setRoute'> }, optional: Record<string, never> = {}): void;
// admin/src/react/hooks/use-rail-label-titles.ts
export function useRailLabelTitles(required: { navId: string; linkSelector: string; labelSelector: string; skipLink?: (required: { link: Element }, optional?: Record<string, never>) => boolean }, optional: { doc?: Document } = {}): void;
// admin/src/react/hooks/use-overflow-title.ts
export function useOverflowTitle(required: { ref: RefObject<HTMLElement | null>; deps: readonly unknown[] }, optional: { doc?: Document; measure?: (required: { element: HTMLElement }, optional?: Record<string, never>) => { scrollWidth: number; clientWidth: number } } = {}): boolean;
// admin/src/react/hooks/use-process-restart.ts
export interface ProcessRestartPort { restart(): Promise<{ ok: boolean; reason?: string }>; getStatus(): Promise<{ failed: boolean }> }
export function useProcessRestart(required: { port: ProcessRestartPort; describeError: (required: { error: unknown; fallback: string }, optional?: Record<string, never>) => string; messages: { restartFallback: string; statusFallback: string } }, optional: { postRestartCheckDelayMs?: number } = {}): ProcessRestartController;
```
`ProcessRestartController` = the current `AssistantDaemonRestartController` fields with `knownFailed` kept (same names so `AiAssistant.tsx` JSX is untouched; Tovu's type alias is deleted and AiAssistant imports the Jini type). Parity details pinned by tests: `toRouteTemplate` drops query and fragment, decodes a segment before matching params, keeps a malformed `%` segment raw, joins `base` + segments with `/`; one status read on mount, never in a loop; the post-restart read happens AFTER `restarting` reads false and only when the delay > 0 waits first; a failed re-check never overwrites `restartResult`/`restartError`.

```
id: UI-A57-1 .. UI-A57-2
feature: admin shell helpers
jini_target: admin src/browser/{route-template.ts,react-root-errors.ts} (+ index.ts lines); src/react/hooks/{use-browser-telemetry-feed,use-rail-label-titles,use-overflow-title,use-process-restart}.ts (+ react/index.ts lines)
kit_injection: - (hooks only)
class_renames: none (no JSX moves; the DOM selectors `a.cms-item`, `#admin-sidebar`, `data-cms-sites-split` stay Tovu strings passed as args)
agent_handles: UNCHANGED
changeset: @jini-ai/admin: minor | "browser: toRouteTemplate and React root error handlers; react: telemetry feed, rail label titles, overflow title and process-restart hooks"
```

## UI-A57-1 — Jini (commit 1, Opus review of the hook contracts)
0. Branch rule; blobs; guard `rg` prints nothing.
1. Tests first (red = functions absent): `browser/__tests__/route-template.test.ts` (copy every `toAdminRouteTemplate` assertion from the Tovu tests, base passed in; NEW: base with a trailing slash is the host's problem: pin `["/x", "a"]` joins as `/x/a`), `react-root-errors.test.ts` (both handlers report to `report` first then `telemetry.reportError({ error, componentStack })`; a throwing `report` must not stop the telemetry call: NEW, wrap in try), react-hook tests under `react/__tests__/` using the package's existing `renderHook` helper (find with `rg -l "renderHook" packages/admin/src/react/__tests__`): feed (re-runs on `signedIn` and on route change, not on unrelated re-render: `telemetry` stable), rail titles (titles set, original restored on unmount, observed replacement re-titled, `skipLink` removes the title, missing nav is a no-op), overflow (true when `scrollWidth > clientWidth`, updates on `resize` and on a ResizeObserver callback, cleans both listeners), restart (cases listed above).
2. Code: ports as above; hooks use only `react` and `@jini-ai/admin` internals; no `document` global (every DOM read goes through `doc = document` default at the optional arg, the pattern the Tovu hooks already use); no `console`. Each function ≤ 50 lines, complexity ≤ 9 (admin limit). The "why" comments (single read not a poll; the post-restart delay; deferring tooltip ownership) move reworded neutral.
3. Index/exports lines, changeset, commit `feat(admin): route template, React root error handlers, telemetry feed, rail titles, overflow title, process-restart hooks`. Checks COMMON 2-9: `rg -n -i "tovu|cms-item|admin-sidebar|assistant|daemon|sites" <new files>` prints nothing.

## UI-A57-2 — Tovu (commit 2, Sonnet; after S1)
1. `lib/browser-telemetry.ts`: delete `toAdminRouteTemplate`, `reactRootErrorOptions`, the three re-export lines (check `rg -n "BrowserTelemetryPayload|BrowserTelemetryDeps|installBrowserErrorListeners" apps/admin/src` first: repoint every importer to `@jini-ai/admin/browser`); keep `createBrowserTelemetry` binding and `adminTelemetry`.
2. `main.tsx`: `reactRootErrorOptions({ telemetry: adminTelemetry })` -> `createReactRootErrorHandlers({ telemetry: adminTelemetry, report: ({ error }) => console.error(error) }, {})` (identical behaviour: React's default logging preserved), import from `@jini-ai/admin/browser`; `installBrowserErrorListeners` import repointed.
3. `App.tsx`: delete the two imports (:2, :36); import `useRailLabelTitles`, `useBrowserTelemetryFeed` from `@jini-ai/admin/react`; calls: `useRailLabelTitles({ navId: "admin-sidebar", linkSelector: "a.cms-item", labelSelector: "span", skipLink: ({ link }) => Boolean(link.getAttribute("href")?.endsWith("/sites")) }, {})` — NOTE the skipped link must have its title REMOVED (current line 20 `removeAttribute("title")`): the Jini hook's `skipLink` contract is "remove title"; and `useBrowserTelemetryFeed({ signedIn, routePath, params, base: ADMIN_BASE, telemetry: adminTelemetry }, {})` (read the existing call args at the call sites and keep them). `git rm` the two hook files and their tests (moved: record counts).
4. `use-sites-sidebar-nav.hooks.ts`: replace lines 79-93 and `truncated` state with `const truncated = useOverflowTitle({ ref: nameRef, deps: [target, siteName, collapsed] }, { doc, measure: ({ element }) => measure(element) })`; keep `measure` option type unchanged for existing tests.
5. `use-assistant-daemon-restart.hooks.ts`: keep `AssistantDaemonRestartDependencies` and `useWiredAssistantDaemonRestart` (still wiring the real port and REAL delay); `useAssistantDaemonRestart` becomes the binding `useProcessRestart({ port: adaptPort(deps.port), describeError: ({ error, fallback }) => describeApiError({ e: error, fallback }), messages: {...two strings...} }, { postRestartCheckDelayMs: deps.postRestartCheckDelayMs })` with `adaptPort` mapping `getReadyz()` -> `{ failed: r.assistantDaemonKnownFailed === true }`. The comment block about the screen-level override/`FORBIDDEN` copy stays here.
6. Tests: the Tovu tests of moved pieces are deleted AFTER recording the list from step 0; the sidebar/Sites/AiAssistant component tests must pass unchanged. Census: `rg -n "toAdminRouteTemplate|reactRootErrorOptions|useAdminTelemetry|useCmsSidebarLabelTooltips" apps/admin` prints nothing; eslint on touched files; commit `refactor(admin): shell helpers from @jini-ai/admin`.
Look (owed, Chrome): hover sidebar rail links (titles), Sites row long name (truncation tooltip appears only when truncated; resize), AI Assistant tab: restart, immediate status vs 2.5 s re-check, a forced 403.

## untangle overlap (execute after wave B merge)
- C9a landed; R-admin/C11 edits `admin/react/index.ts`: add export lines by text anchor at the end of the hooks block; re-take `react/index.ts` blob.
- `App.tsx` and `main.tsx` are edited by wave-B applier passes (R-BARRELS, C2 `agentHandle`): re-take blobs; apply the four edits by exact text.

## STOP specific to this sheet
- The skipped-link title removal behaviour cannot be expressed through `skipLink` without changing the Tovu test.
- `AiAssistant.tsx` needs a JSX change.
- A hook function exceeds complexity 9 and cannot be split without changing effect order.
