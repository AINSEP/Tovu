# Coverage verification, 2026-10-21/22 (report-only; no source/test/config edited, no subagents)
Started 22:36Z, measurement stopped 00:14Z (1h38m). Each wave measured on its own checkout. Jini J1/J2/J3 were rebuilt per branch. Tovu T1 ran against Jini `cloud/integration-2026-10-21`, built in a worktree and linked via `JINI_PACKAGES_DIR`.

## Headline
- **J1, J2, J3, T1: measured. T2 and T3: NOT MEASURED.** The website node:test runs (~1370 and ~730 test files) had not finished at the cap and were killed. node:test writes lcov only at exit, so there is no partial data.
- Every measured suite passed, apart from 2 ENV items below.
- J2 is **OVERSTATED** by 2 files. J1, J3 and T1 are CONFIRMED.

## Tool limits (read first)
- Jini and Tovu admin use vitest v8. I read `coverage-final.json` directly.
  - Line% = share of lines that start a statement and were hit.
  - Branch and function figures come from the istanbul-converted map.
  - A v8 `??` or `?.` arm counts as a branch, so a branch the owner calls unreachable shows as uncovered.
- For every Jini package I overrode `--coverage.exclude` to `**/node_modules/**`.
  - agent-runtime's config excludes `src/skills/**`, and vitest's default drops `*-test.ts`. Together they hid 25 lot files.
  - Config files are untouched.
- `--coverage.include` was scoped to the lot files; the whole package suite ran each time.
- Tovu desktop uses node:test lcov, one run per loader (main uses resolve-ts-ext, renderer and contracts use tsx).
  - The two loaders number branches differently for the same file, so I did not sum them. I took the best record per file.
  - A file shows 100 if either run covers it fully. A real split across the two loaders could be understated.
- No mocked copy can inflate a figure here. vitest coverage is keyed by real file path, and no node:test module-mock run completed.
- Never-loaded means absent from the coverage map with `coverage.all=true`.

## Per wave
| wave | lot files | at 100/100/100 | below | never loaded | wave REPORT claim | verdict |
|---|---|---|---|---|---|---|
| J1 (lots 1-33) | 296 | 285 | 10 | 1 | 285 at 100, 10 below, 1 deleted | **CONFIRMED** |
| J2 (34-66) | 126 | 123 | 3 | 0 | 125/126 (only gate.ts below) | **OVERSTATED** (rules.ts, assistant-chats.ts) |
| J3 (67-98) | 433 | 415 | 18 | 0 | 8 listed below, 10 excluded compile-only/scripts/test-support | **CONFIRMED** |
| T1 admin | 171 | 161 | 10 | 0 | the same 10 | **CONFIRMED** |
| T1 desktop | 67 | 59 | 5 | 3 | same files, plus main.ts and 2 verify scripts never loaded | **CONFIRMED** |
| T2 (19-37) | 395 | - | - | - | per-lot claims | NOT MEASURED |
| T3 (38-55) | 382 | - | - | - | per-lot claims | NOT MEASURED |

The T1 total is 238 files, split by app into admin (171) and desktop (67).

### Below 100 (L/B/F %; line numbers in below-100.csv, 50 rows)
**J1** (all as the wave said):
- agent-plugins `ui-ux-design/skills/shadcn-ui/examples/{auth-layout,data-table,form-pattern}.tsx`: 0/0/0. They import `@/components/ui/*`, which is not in the repo.
- agent-runtime remotion-template `{Root.tsx, chatSpec.ts, index.ts, ChatMotionOverlay.tsx, DeviceFrame.tsx}`: 0/0/0.
- `avatarLibrary.tsx`: 100/50/100 (b15, b16).
- charts-recharts `scripts/build-artifact.mjs`: 0 (owner-excluded).
- `admin/src/media/styles.ts` was deleted, with the reason "dead, no importer". The base has no import of it.

**J2** (3 below):
- cms `consent/html/gate.ts` 100/99.33/100 (b230). Claimed.
- **chat `chat-pane/rules.ts` 100/99.2/100 (b283).** Not claimed. The `[]` in `newest.events ?? []` is never taken.
- **chat `hooks/assistant-chats.ts` 100/99.47/100 (b862).** Not claimed. The `?? new Set()` default in `writtenRef.current.get(id)` is never taken.

**J3** (8 claimed below):
- core `fetch/cache.ts` 100/99.15/100 (b138)
- daemon `http/xai.ts` 100/99.45/100 (b300)
- oauth `oidc.ts` 100/96.67/100 (b64)
- platform `net/address.ts` 100/92.86/100 (b27)
- ui `panel-kit/fetch-query/adapter.tanstack.tsx` 100/97.7/100 (b212, b219)
- ui `mcp-ui/host-message-source.ts` 100/75/100 (b27). The wave blames a jsdom/node merge artefact. I see 75% in a single per-package vitest run, so I could not confirm that explanation.
- ui `utils/smooth-scroll-to-top.ts` 100/96.55/100 (b43)
- user-management `server/agent-tool-registrations.ts` 98.67/97.22/100 (l211-214, b164, b210)

J3 files the wave excluded from its claim:
- Compile-only, 0%: core `{args-convention,compose}.typecheck.ts`, server `create-local-node-daemon.typecheck.ts`, oauth `tests/{args-convention.types,integration-contract.types}.ts`.
- Test support: oauth `tests/{dispatcher-stub,fixtures,helpers}.ts`, 60-100% on functions.
- Build scripts, 0%: `ui-kit/scripts/headless-smoke.mjs`, `ui/scripts/generate-agent-icon-data-uris.mjs`.

**T1 admin** (10):
- `AssistantDock.hooks.tsx`: b1160, b1203, b1210
- `use-agent-plugins.hooks.ts` 100/93.75/100 (b147). The wave flagged this as a likely bug.
- `use-package-file-tree.hooks.ts`: b81
- `use-publish-content-confirm.hooks.ts`: b727, b981, b1302
- `AdminAppearance.tsx`: b39
- `ExternalMcpSettingsPanel.tsx`: functions 91.67 (f168, f223)
- `ThemeExplore.tsx`: b998
- `use-theme-explore.hooks.ts`: functions 99.21 (f902)
- `UsersPanel.tsx`: functions 85.71 (f33)
- `lib/page-lifecycle.ts`: branches 50 (b18)

**T1 desktop**:
- `desktop-agent.ts` 100/99.15/98 (b314, f380)
- `shared-sites.ts` 100/98.75/95 (b56, f64)
- `site-process-registry.ts` 99.2/95.61/100 (l506-507, l566-568, b313, b502, b505, b564, b565)
- renderer `App.hooks.ts` 100/99.42/100 (b358, b363)
- renderer `App.tsx` 96.32/100/97.14 (l537 onward)
- Never loaded: `main.ts`, `scripts/verify-find-in-page.ts`, `scripts/verify-site-power.ts`.

## Honesty checks (diff vs base b3c4144b / e0c935bb5)
These are heuristic greps over the diffs. I did not read every diff line.
- **Ignore pragmas:** no new `v8`, `istanbul`, `c8` or `node:coverage` ignore comment in any of the six branches. The T2 report mentions the words in prose only.
- **Skips:** no `.skip`, `.todo` or `.only` added. No added test file lacks an assertion keyword.
- **Config:** no threshold lowered and no exclude added.
  - J1: agent-plugins vitest `include` widened to `core/**` and `persistent-state.js`.
  - J2: cms vitest `include` widened to `scripts/**/*.mjs`.
  - Both add measured files.
  - Tovu T1, T2 and T3 have no config change.
- **Deleted files:** only J1 `packages/admin/src/media/styles.ts`.
- **Assertion lines added/removed in existing tests:** J1 +2009/-3 (the 3 are `loadAnthropicLiveModels` signature changes). J2 +800/-0. J3 +2766/-0. T1 +2423/-0. T2 +1815/-3. T3 +1133/-7.
- **Weak-assertion adds** (`toBeDefined`, `toBeTruthy`, `assert.ok`): J1 0, J2 24, J3 46, T1 98, T2 129, T3 67. Most sit beside stronger asserts. One clear weak one is J2 `useChatPane.cov-j2.test.tsx`: `waitFor(() => expect(rejectStart).toBeDefined())`.
- **Module mocks added:**
  - Jini: 1 (J3 `db/testing-helpers.lazy-user.test.ts` mocks the builtin `node:os`, not the unit).
  - T3: 2 (`lazy-browser.unit.test.ts` mocks `playwright`, a third-party boundary the wave flagged).
  - T1: 0. T2: 0.
- **Removed assertions worth a look:**
  - T2: `card-preview-wiring.test.ts` and `site-card-actions-wiring.test.ts` lost 3 source-text regex asserts.
  - T3: 7 asserts went with removed `req.params.x ?? ""` fallbacks on webhook/integration/member routes. That fits the wave's dead-code removal, but these are 404 error paths, so a human should look.
- **100% via a mocked copy of itself:** none seen in J1, J2, J3 or T1.
- **agent-runtime package gate:** it does not hold the 25 `src/skills/**` and `connection-test.ts` files. They are 100 only when the exclude is lifted, as I measured them.

## Failing tests
- **Jini:** 0 failing tests in all 29 package suites. Test counts per package are in `/tmp/cov/*run.log`; they match the wave REPORT counts (J1 chat 3366, J2 chat 3469, cms 3673, J3 ui 8665, and so on).
  - core, server, ui and agent-runtime exit 1 only because their package-wide coverage thresholds were applied to my scoped include. These are not test failures.
- **T1 admin:** 791 files, 13063 passed, 2 skipped, 0 failed.
- **T1 desktop main:** 0 failed.
- **T1 desktop renderer: 2 failed, ENV.** `renderer/websites-width.test.ts`: "Websites fits at 375px…" and "narrow collapsed multi-tab content fills the dialog…". Error: `browserType.launch: Executable doesn't exist …/chrome-headless-shell` (no chromium, owner rule).
- **Not run, ENV:** Postgres-dependent tests (`*.postgres.test.ts`, Jini db real-Postgres suites) and any browser tests.

## Not measured, and why
- **T2 and T3: 777 lot files** (apps/website is ~700 of them, plus desktop, site-chat, packages/sdk, content/agent-plugins). apps/website has ~2300 test files, many spawning CLI or daemon subprocesses.
  - I scoped each wave to changed-or-added tests plus tests in each lot file's own dir or `__tests__`: 1372 files for T2, 726 for T3.
  - I ran them with `node --import tsx --test --experimental-test-module-mocks --test-concurrency=2 --experimental-test-coverage`, concurrently with other runs.
  - Neither finished in 25-45 minutes. I killed both at the cap and kept no data.
  - The dot reporter prints failure names only at exit. At kill time the logs held ~75 failure marks for T3 and ~7 for T2. Many are probably ENV (Postgres, browser), but I could not tell.
  - The T2 and T3 wave claims are neither confirmed nor refuted. That includes T2 lot 035 (not started) and T3 lots 047, 048 and 050-055 (not started), whose coverage is unchanged from baseline by the waves' own account.
- **Suggested next step:** run the website suite in per-area batches with Postgres and Chromium available. Merge lcov per file with `development/scripts/coverage-all-files.ts`.
- **Complexity and typecheck claims** (cyclomatic and cognitive ≤10, `tsc` clean) were not re-checked.
- **Subprocess coverage** (for example the page-lifecycle SSR branch) is invisible to v8 and node coverage in every measurement here.
