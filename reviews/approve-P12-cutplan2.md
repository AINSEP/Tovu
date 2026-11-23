APPROVED WITH FIXES

# Approval — `plans/P12-cut-plan-v2.md` (cuts #4, #6, #7, #8)

Second-agent approver (Opus, unattended cloud run, 2026-11-23). Read-only: no builds, tests, or codebase-memory.
Role bootstrap: `AI-Dev-Shop/agents/code-review/skills.md` does not exist in AI-Dev-Shop at this checkout; I read the
fallback `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2) before starting.

Plan read at Tovu `origin/plan/whats-left-1122` `ad83629191`, with `plans/P12-tovu-tangle.md`, `plans/P12-cut-plan.md`,
`reviews/rv-f-fnd-seams-inject.md` and `reviews/rv-g-fnd-kit.md`.

| Cut | Verdict | Build now? |
|---|---|---|
| #4 Admin request transport | **APPROVED WITH FIXES** (F4.1–F4.6). The fixes reuse the existing Jini transport owner. | Yes, scope = factory + host binding only |
| #6 Locale hook | **APPROVED WITH FIXES** (F6.1–F6.7). Shared mounts only; the old hook stays until the census closes | Yes, after #4 (Jini metadata serial) |
| #7 HTML escape + slug | **APPROVED WITH FIXES** (F7.1–F7.3, all minor) | Yes, now |
| #8 AdminKit 0c `SettingsDialogTab` | **APPROVED WITH FIXES** (F8.1–F8.4). Gated on the rv-g re-review | After gate |

## Pins: the plan's cached tips are stale (all builders re-pin)

Fetched today. Each moved tip descends from the plan's SHA, so the plan's anchors still apply. Builders branch from the
fresh tips:

| Ref | Plan says | Remote now | Delta |
|---|---|---|---|
| Tovu `codex/ex5-fnd-kit-tovu` | `97a033e11a` | **`541537de6f`** | `43b8d52d3` selection-echo test move, fix report |
| Tovu `codex/ex5-fnd-seams-tovu` | `54db4bce97` | **`63b09af263`** | `5e5b48998` InstalledAgentPlugin test repoint, report |
| Jini `codex/ex5-fnd-kit-jini` | `1af2c1684` | **`c03c3cd1c`** | rv-g FIX 1–7: `c54d9e24`, `ad4b2d02`, `0045495c`, `6bd475bc`, `d8782022`, `4aa88759`, `f7fd63c9`, `c03c3cd1` |
| Tovu merge-13 / halves / holds / inject / ex-html | as cited | unchanged (`f7185f153a`, `d6590fc72d`, `8eb8ea568e`, `6f571e3d00`, `ba5b313581`) | — |
| Jini merge-14 | `4902a6a1a` | unchanged | — |

Every plan command uses `G=/Applications/Xcode.app/Contents/Developer/usr/bin/git`. Cloud builders run on Linux, so they
use plain `git` (applies to #4 and #6).

## Spot-check evidence (27 anchors, all on `97a033e11a` unless noted)

All 27 matched. #4: `A/lib/admin-http/request.ts:7` (`import { BASE } from "./config"`), `:10` (`class ApiError`),
`:483` (`describeApiError`), file length 486. `A/App.hooks.ts:29,44,109,110,156`, `A/App.session.ts:6,23`,
`A/lib/server-reconnect.ts:21,22,113,165`, `A/lib/admin-failure-channel.ts:10,112,128`, `A/lib/admin-http/urls.ts:1`, and
Holds `settings-api.ts:3` (`./request`) all matched. I counted the importers myself: 296 files on the kit tip and 295 on
Holds, as stated. The count is 296 on halves, seams and inject too, and 60 files match `admin-http/config`.

#6: `use-admin-locale.hooks.ts:50–65` is the shared hook body. `settings-tabs.ts:261,266`,
`use-settings-slice.hooks.ts:6,11`, `Login.tsx:9,30`, `Placeholder.tsx:3,161`, `panels.tsx:60,1296`, the five
`*-module.hooks.ts` live-hook imports at 5/5/5/6/6, and all nine feature `index.ts` loading mounts matched. All named
test files exist. On the Jini kit tip, `admin-locale-port.hooks.ts` is present at 15–23 and `kit.tsx:263` is
`AdminKitHooks`.

#7: the wrapper `W/platform/html/escape.ts:2–4` delegates to `@jini-ai/core/text`. Core `text/index.ts:3` exports both
escapers, and `escape.ts:14–26` produces `&#39;` for HTML and `&apos;` for XML. Both slug blobs are
`e92352c21f30818faa767b1f58bce4446087ce07`. The census finds 29 production escape importers plus `escape.test.ts:4` on
kit, merge-13, halves, seams and inject. There are 9 slug importers (the post-local `./slug.js` imports are a different
file). I checked 10 sampled lines and all matched. Admin declares `@jini-ai/cms`, and the root `package.json:143`
declares it as well.

#8: the four consumer lines, `jini-kits.ts:5,31,49`, and kit `SettingsDialogTab` at `kit.tsx:171–173` all matched.

## #4 — Admin request transport: APPROVED WITH FIXES

The host binding, legacy-shape preservation, tests-first list, named mutations and STOP list are sound. The design
duplicates code that Jini already owns:

- **F4.1 — Extend the existing transport owner. Do not add a second copy.** Jini already ships the same lineage in
  `packages/admin/src/core/transport/http.ts`: `createHttpTransport` at `:142`, `throwTranslatedFetchFailure`,
  `mergeHeaders`, `responseError`/`unreachableApiMessage` with the `API_UNREACHABLE` code, `isPageUnloading`, `onOk`,
  and the rule that a caller's signal wins over the timeout. Write `createAdminHttp` to import and reuse those helpers,
  exporting them package-internally where needed. It must not re-implement them. Placement can be beside them
  (`core/transport/admin-http.ts`) or at the planned `shell/lib/admin-http/request.ts`. Either way, no helper body may
  appear twice in `packages/admin`. The Admin README Wiring section must state when a host uses `createHttpTransport`
  (the route-group `AdminTransport`) and when it uses `createAdminHttp` (the host session client with
  reconnect/failure-channel/retry). Add a convergence follow-up to the P12 ledger. This is the "Before You Write"
  owner-of-behavior rule.
- **F4.2 — `AdminHttpError` must be satisfied by Core's `AdminApiError`.** `packages/core/src/admin-runtime/admin-api-error.ts:29`
  already has `status`, `code?` and `body?` with the same `(required{message,status}, optional{code,body})` constructor
  as the plan's `createError` port. Add a compile-time test asserting `AdminApiError` is assignable to `AdminHttpError`,
  so a host can pass `AdminApiError` as `E`. The factory defines **no** error class. `E` always comes from `createError`.
  Reword the STOP to "the factory defines or instantiates its own error class".
- **F4.3 — Core entry.** `packages/core/package.json` exposes only `./admin-runtime` (`:61`, `:382–385`). There is no
  `./admin-runtime/admin-http` subpath. Either (a) add `src/admin-runtime/admin-http.ts` and export the three types
  from the existing `@jini-ai/core/admin-runtime` entry (preferred: canonical same-package entry, no new subpath), or
  (b) add the subpath with all four records: `exports`, `jini.entries`, `typesVersions` and `api-baseline`. Update the
  import lines in #4.T to match. Add a changeset either way.
- **F4.4 — Unblock credit is zero until features convert.** All 296 importers keep the host `./request` /
  `admin-http/request` specifier by design. This cut therefore removes no file's transport prerequisite. The ledger must
  not credit the 132/138 count to #4. That credit comes from the per-feature API-factory sheets this plan defers
  (NOT-CHECKED). Each sheet will inject the single bound operation it uses.
- **F4.5 — Size.** `request.ts` is 486 lines today. After composition, the host file keeps `ApiError`,
  `describeApiError`, the listener registry and the binding. Each function stays ≤80 lines with complexity ≤10 (warn at
  50). The factory body stays ≤80 lines by keeping stage helpers outside it, as the plan says.
- **F4.6 — No new defaulted hook/port parameters.** `App.hooks.ts:109` (`subscribeUnauthenticated = onUnauthenticated`)
  is existing debt. Do not touch it in this cut and do not copy its pattern. The factory's `ports` object is required
  and has no fallback bindings.

## #6 — Locale hook: APPROVED WITH FIXES

- **F6.1 — The port signature change is a public API change.** On the kit tip, `AdminLocalePort.loadLanguage()` takes
  no arguments, and `subscribeToSettingsRefresh(required)` has no optional pad. The subpath is already published
  (`packages/admin/package.json:122,201,756`). Moving to `(required, optional?)` needs a changeset and an api-baseline
  update, plus the matching Tovu binding change in `admin-locale-dependencies.hooks.ts` in the paired commit.
- **F6.2 — Jini hook signature.** `useAdminLocale(required: UseAdminLocaleArgs, optional: Record<string, never> = {})`.
  The Jini file imports nothing from Tovu (no `useAdminBootScope`, no `DEFAULT_LOCALE`, no `"core.language"` literal).
  The query key is `[...queryPrefix, queryScope]`, and invalidation uses `[...queryPrefix]`. Call the three injected
  hooks unconditionally on every render. Only `port` is captured by `useRef`, as today.
- **F6.3 — One host hook instance, two references.** The plan both adds `AdminKitHooks.useAdminLocale` and threads a
  required `useAdminLocaleHook` prop from `SessionApp`. Build the hook once in `admin-locale-dependencies.hooks.ts`.
  Reference that same function from `adminKit.hooks` (`jini-kits.ts`, which `satisfies AdminKit` at `:49`) and from the
  App prop. Add an identity assertion to `admin-kit.integration.test.tsx`. Update `react/testing-kit.tsx` in the same
  Jini commit, since the new required kit member breaks every other `AdminKit` literal.
- **F6.4 — Defaulted hook props become required.** `Placeholder.tsx:161` (`useWiredAdminLocaleHook = useWiredAdminLocale`)
  and `panels.tsx:1296` (`PanelRouteLoading({ useWiredAdminLocaleHook = useWiredAdminLocale } = {})`) are defaulted live
  hooks. Remove both defaults in this cut and rename both props to `useAdminLocaleHook`. Gate D2 covers both.
- **F6.5 — Scope as built.** Build #6.J and the shared-mount table rows only. `useWiredAdminLocale` and
  `use-admin-locale.hooks.ts` stay in Tovu until a full census shows zero direct consumers. The plan's STOP and hold
  already require this. Census drift: `git grep -l -F use-admin-locale.hooks` on `97a033e11a` gives **136 files (24 in
  `__tests__`)**, not 132/21. Re-census on the merged tree and paste the list into the PR. Do not split feature lanes
  from the plan's number.
- **F6.6 — Serialize with #4 and #8.** #6.J edits `packages/admin/package.json`, `api-baseline/jini-ai__admin.json`
  and `react/kit.tsx`, the same files as #4.J. #6.T edits `integrations/jini-kits.ts` and
  `admin-kit.integration.test.tsx`, the same files as #8.T. Run them one after another, never in parallel.
- **F6.7 — Required mutations.** All four named mutations (`omit-query-scope`, `drop-settings-event-forward`,
  `skip-language-invalidation`, `drop-english-fallback`) must go red and then green, with the result recorded in the
  report. Add `default-hook-prop-restored`: putting back the `= useWiredAdminLocale` default must fail typecheck or a
  source-pin test.

## #7 — HTML escape + slug: APPROVED WITH FIXES (ready)

The evidence is exact and the call shapes are identical. The wrapper and Core both take `({ text }, _optional = {})`,
so no call site changes beyond the import line. The cut also removes the cross-app relative import at
`A/features/menus/hooks/use-menu-editor.hooks.ts:16` (`../../../../../website/src/platform/html/slug`).

- **F7.1 — Themes stay in Tovu.** Six importers live under `W/features/theme/` (`preview-switcher-html.ts`,
  `static-render{,-content,-menus,-previews}.ts`, `visitor-publication.ts`). They get the import-line repoint only. No
  theme file moves, and no theme code or vocabulary enters Jini.
- **F7.2 — Delete, do not shim.** After the repoint, `W/platform/html/{escape,slug}.ts` are removed. No forwarding file
  remains. Search all four specifier forms (`#src/platform/html/…`, relative with and without `.js`, and the admin
  cross-app path) and expect zero matches.
- **F7.3 — `development/scripts/__tests__/dev-lite.test.mjs:9`.** Leave it unchanged. It writes its own temp file under
  a fresh root, and `dev-lite.mjs:16` watches the whole `apps/website/src` tree. Do not delete that case.

## #8 — AdminKit 0c `SettingsDialogTab`: APPROVED WITH FIXES (gated)

- **F8.1 — Gate status (corrects the plan).** The rv-g FIX run is DONE on Jini `c03c3cd1c` and Tovu `541537de6f`
  (`cloud-results/fix-fnd-kit.md`). The Select pass-throughs the plan cites as still present were removed in `0045495c`.
  **Open:** `reviews/` has no rv-g re-review. The fix report marks rv-g FIX 8 "no change needed" (ex2's overlay ignores
  extra Jini locales), and that disposition needs Codex's ruling. Gate: a Codex rv-g re-review returns APPROVED on
  that SHA pair, and the kit pair lands, because `SettingsDialogTab` is on the kit branch only and absent from merge-14
  `kit.tsx`.
- **F8.2 — The inventory missed the multi-line imports.** The single-line census found 4 files, but there are 8:
  `features/ai-assistant/AiAssistant.tsx:15`, `features/authentication/Authentication.tsx:8`,
  `features/plugins/AgentPlugins.tsx:7`, and `features/settings/SettingsUi.tsx:124` are also importers
  (`use-settings-ui.hooks.ts:44` is a comment). Repoint all 8, or give a one-line reason for each file kept out (for
  example, a host-owned admin-theme screen). Use a multi-line-aware search (`git grep -n -U` / TS AST), not a
  single-line grep.
- **F8.3 — Repoint the names that already have kit facades in the same rows.** `kit.tsx` on the kit tip exports
  same-name slots `Icon` (`:450`), `I18nProvider` (`:453`) and `SettingsDialogShell` (`:454`), and `jini-kits.ts:31`
  binds all three. After the repoint, `Skills.tsx` imports nothing from `@jini-ai/ui`. `Observability.tsx` and
  `Recovery.tsx` keep only `SETTINGS_DIALOG_DICTIONARIES`, and `use-observability-tab.hooks.ts` keeps
  `findActiveTab`/`resolveInitialActiveTabId`/`useTabbedDialog`. Record those residuals by file for the next 0c sheet.
  The existing feature tests must still pass under `AdminKitProvider`. Without this, the cut unblocks **0** files. With
  it, Skills becomes kit-clean. Type-only remains acceptable for the four extra files from F8.2.
- **F8.4 — Contract test as planned.** Use the bidirectional assignability test plus the
  `kit-tab-panel-field-rename` mutation. The two declarations are intentional (kit mirror vs `@jini-ai/ui`'s
  `TabbedDialogTab` alias), and this test keeps them in sync.

## Ready-to-build order

Prerequisites (no plan round needed): the corrected Seams pair lands before Inject (rv-f), and the kit pair lands after
the rv-g re-review (F8.1).

| Step | Repo | Cut | Parallel group | Depends on |
|---|---|---|---|---|
| 1 | Tovu | **#7** escape + slug | **G1**, start now | merge-13 / halves only |
| 2 | Jini | **#4.J** factory (F4.1–F4.3) | **G1** | kit-jini landed (shares `packages/admin/package.json` + baseline) |
| 3 | Tovu | **#4.T** host composition | G2 | step 2 (linked) |
| 4 | Tovu | **#8.T** `SettingsDialogTab` + facades (F8.2–F8.4) | **G2**, parallel with step 3 | rv-g re-review + kit pair landed |
| 5 | Jini | **#6.J** hook + kit slot (F6.1–F6.3) | serial | step 2 (same Jini metadata, `kit.tsx`) |
| 6 | Tovu | **#6.T** shared-mount prop chains (F6.4–F6.7) | serial | steps 3, 4, 5 |

Parallel-safe sets: {1, 2} and {3, 4}. Steps 1 and 4 share no files. Steps 3 and 4 share no files either: #4.T edits
`lib/admin-http/` and tests, and #8.T edits four feature files and the kit integration test. Steps 5 and 6 run after
both, as F6.6 requires.

**NOT-CHECKED:** test, build, typecheck and mutation execution (excluded by dispatch); exhaustive per-file census of
the 296 transport and 136 locale importers; and function size and complexity on the post-change files.
