# TESTRUN — chat-assistant suites — 2026-09-02 18:16

Dispatch snapshot HEAD: `e92b3226`. Repo is a shared, actively-committed tree — 13 commits landed
between dispatch start and this report (HEAD now `41c2c2ad`). Reporting-only run: no source/test
files modified, no commits.

## 1. Inventory

| Path | Runner | Files | Notes |
|---|---|---|---|
| `apps/website/src/assistant/__tests__/**` | `node --import tsx --test` | 92 | includes subdirs (`persistence/`, `site/`, `tool-dispatch/`) |
| `apps/website/src/server/**` (assistant/chat-relevant only) | `node --import tsx --test` | 26 | filtered from full server tree by `assist|chat` in filename |
| `apps/admin/src/components/AssistantDock/**` | `vitest run` (admin's own config) | 10 | component + hooks |
| `apps/admin/src/features/ai-assistant/**` | `vitest run` (admin's own config) | 10 | |
| `/Users/la/Programming/Jini/packages/chat/src/**` | `npx vitest run` (from inside package) | 71 | `dist/**` excluded — build output, not source |
| `development/e2e/byok-*.spec.ts` | Playwright, `development/playwright.admin.config.ts` | 10 spec files, 40 tests | hermetic 2-process boot on ports 6421-6423, `reuseExistingServer:false` — no collision with :3000/:5173 |
| `development/e2e/site-assistant-*.spec.ts` | Playwright, `development/playwright.site-assistant.config.ts` | 4 spec files, 13 tests | hermetic boot on ports 4996/4997 — no collision |
| `development/e2e/byok-model-field.ts`, `inspect-assistant-pane.mjs`, `site-assistant-fixtures.ts`, `site-assistant.globalSetup.ts` | — | 4 | helpers, not specs; not run directly |

Total executed: 92+26+20+71 = 209 unit/integration files (3,987 tests) + 53 e2e tests across 14 spec files.

## 2. Results by suite

| Suite | Tests | Pass | Fail | Skip | Not run |
|---|---|---|---|---|---|
| `apps/website/src/assistant/__tests__` | 1449 | 1446 | 3 | 0 | — |
| `apps/website/src/server` (26 files) | 233 | 233 | 0 | 0 | — |
| `apps/admin` AssistantDock + ai-assistant (20 files) | 169 | 169 | 0 | 0 | — |
| Jini `packages/chat/src` (71 files) | 1136 | 1136 | 0 | 0 | — |
| Playwright `site-assistant-*.spec.ts` | 13 | 12 | 1 | 0 | — |
| Playwright `byok-*.spec.ts` | 40 | 37 | 3 | 0 | — |

Full logs: `ADS-memory/.local-artifacts/test-failures/website-assistant-2026-09-02.log`,
`website-server-assistant-2026-09-02.log`, `admin-assistant-2026-09-02.log`, `jini-chat-2026-09-02.log`,
`e2e-site-assistant-2026-09-02.log`, `e2e-byok-2026-09-02.log`, plus a targeted single-test retry log
`e2e-site-assistant-highlight-retry-2026-09-02.log`.

**GEMINI_API_KEY is set in this environment**, so `byok-google-live-smoke.spec.ts` ran for real (live,
billed Gemini call) rather than skipping — flagging per the "skip is a different fact than pass" rule:
this was **RUN, not skipped**, and it failed (see 3.5).

**Reporter anomaly, not a confirmed failure:** in the byok Playwright run, the list reporter printed
✘ once for `byok-state-races.spec.ts:86` and `:123` mid-stream, but the run's own final tally ("3
failed" + the numbered failure list) does **not** include either test, and counts them inside "37
passed." I do not have a clean explanation for the transient ✘ glyphs and did not re-run this suite
to chase it (anti-loop rule, and it's a 9.6-minute serial suite with a live-billed test in it). Flagging
so the coordinator can decide whether to re-verify `byok-state-races.spec.ts` in isolation; I am
**not** counting it as a failure or a pass with confidence — treat as unresolved.

Environment check per the "concurrent runs corrupt shared fixtures" caveat: `ps aux | grep -cE
"[n]ode --import tsx --test"` returned **3** at time of writing (other agents' runs). My own four
`node --test`/`vitest` invocations above each completed in isolation before I checked this, so they
are not suspect on that basis, but any failure a reader sees that does NOT reproduce in isolation
should be treated as a fixture-collision artifact of the now-3-concurrent-runners environment, not a
real defect.

## 3. Failure classification

### 3.1 `tool-registrations.contracts.test.ts` — 3 failures, ONE root cause — **REAL REGRESSION from today**

- `every wired registration publishes the inputSchema from its catalog entry — the descriptor no longer carries only {id, description}`
- `the real catalog and this layer's independent classification agree for every wired tool`
- `no CURRENTLY wired tool carries a confirmation-requiring actor-class rule — the guard above is an invariant, not a live fix`

All three throw `AssertionError: no wired catalog has an entry for 'media_generate_asset'` from
`catalogEntry()` at `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:214`.

**Root cause, verified by evidence, not inference:**
- `media_generate_asset` is wired into `buildAssistantToolRegistrations` via
  `apps/website/src/assistant/tool-registrations.ts:191` (`MediaGenerationToolDeps`), which pulls from
  `apps/website/src/features/media-generation/tool-registrations.ts`, whose catalog export is
  `mediaGenerationAgentToolCatalog` (`apps/website/src/features/media-generation/agent-tools.ts`).
- That catalog is landed by **today's** commits: `c7f3861b feat(media): wire image generation
  (media_generate_asset)...`, `93146234 fix(media-generation): make media_generate_asset
  provider-agnostic...`, `24500310 fix(media): default image model resolves...` — all dated 2026-09-02.
- `tool-registrations.contracts.test.ts`'s hand-maintained `WIRED_CATALOGS` array (the test's own
  "every newly wired domain must be added here" contract, stated in its own comment at line ~119) was
  last touched `9eebf39d` on **2026-09-01** — one day before the media-generation wiring landed — and
  was never updated to import/spread `mediaGenerationAgentToolCatalog`.
- Confirmed still unfixed as of this report (`grep` for `mediaGenerationAgentToolCatalog` in the test
  file returns nothing; no commit touched the test file since the dispatch snapshot).

This is a real, single-root-cause regression: today's media-generation wiring landed without updating
this test's `WIRED_CATALOGS` contract array. Fix is additive (one import + one spread line in the test
file) — not something I touched, per the reporting-only mandate.

### 3.2 `site-assistant-highlight.spec.ts:212` "byte-for-byte identical before and after" — **PRE-EXISTING, test asserting a stale property, NOT today's regression**

Fails on `await expect(sibling).toBeVisible()` for `page.locator(".entry-meta")` — element never
appears. Confirmed **deterministic**, not flaky: targeted retry of just this test (per the
skill's flaky-evidence protocol) reproduced the identical failure signature
(`e2e-site-assistant-highlight-retry-2026-09-02.log`).

**Root cause, traced through the render path:**
- The test's own comment asserts `render.ts#entryContent`'s markup (`<h1 class="entry-title">…</h1><p
  class="entry-meta">…`) is "the real markup" for the seeded About page.
- `entryContent()` is only invoked by `fallbackSiteBody()` for `route === "post"` —
  `apps/website/src/server/inbound/public-http/http/site/render.ts:2449` — which is itself only a
  fallback path for tiers with no dedicated template.
- The seeded default theme is `"basic"` (`apps/website/src/server/runtime/configuration/seed.ts`),
  `tier: "static"` (`content/themes/static/basic/theme.json`). Static-tier pages render through a
  wholly separate code path (a theme-owned, complete `<!doctype html>` document), not
  `fallbackSiteBody`/`entryContent`. `content/themes/static/basic/render/pages/blog-post.html` uses
  `class="post-detail wrap"` — **no `.entry-meta` class exists anywhere in this theme**. The theme also
  ships its own bundled `about` page (`theme.json`'s `"pages"` list), which may pre-empt the seeded
  blog post entirely for the `/about` route.
- Neither `content/themes/static/basic/**` nor `development/e2e/site-assistant-highlight.spec.ts` were
  touched today (`git log --since=2026-09-01` on both is empty for today). The seed default became
  `"basic"` on 2026-08-10 per that file's own comment — well before today.

Classify as: **test asserting the wrong property** — its premise (that the dynamic
`entryContent()`/`.entry-meta` markup is what the currently-seeded default theme renders) has been
stale since the static `"basic"` theme became default, unrelated to anything in today's diff. This is
a 6th instance of the "test asserts a property the current wiring doesn't produce" pattern the prior
audit found five of — worth naming to whoever owns that backlog.

### 3.3 `byok-key-handling.spec.ts:231` "whitespace-only API key keeps Test Connection disabled" — **likely fallout from today's Jini rebuild, root cause not fully isolated**

`expect(locator).toBeDisabled()` fails — the "Test connection" button is enabled when a whitespace-only
key is entered.

- The client-side rule that's supposed to catch this,
  `missingRequiredFields()` in `/Users/la/Programming/Jini/packages/ui/src/features/execution/rules.ts:121`,
  correctly does `!config.apiKey.trim()` and is unchanged since 2026-08-01 (source is correct).
- `@jini-ai/ui` is a live local symlink (`node_modules/@jini-ai/ui -> ../../../Jini/packages/ui`), and
  its `dist/features/execution/rules.js` was rebuilt **today at 15:10:45** — consistent with the
  dispatch context's "several @jini-ai packages were rebuilt and republished."
- Since the source logic is correct, the failure is most likely either (a) a UI-wiring gap between
  `missingRequiredFields` and the actual disabled-state prop on the Test Connection button (not traced
  to a specific line — would need to read the admin BYOK form component), or (b) a stale
  Vite `optimizeDeps` cache for the linked package in the fresh Playwright-booted admin Vite process —
  this repo has a known trap here (`reference_admin_new_dep_needs_vite_cache_clear` in prior session
  memory). I did not chase this further given the reporting-only mandate and time budget; flagging both
  candidate causes rather than guessing.

### 3.4 `byok-model-discovery-self-heal.spec.ts:51` — **same suspect family as 3.3, not independently isolated**

`expect(locator).toHaveText(...)` on `.jini-field-hint.is-error[role='status']` times out — the element
never appears at all (not a text mismatch). Also a BYOK-form UI hint under the same
`@jini-ai/ui`-rebuilt-today surface as 3.3. Plausibly the same root cause (stale dep/cache or a wiring
gap introduced by the rebuild); not confirmed independently — would need isolated investigation of the
admin BYOK form's discovery-hint wiring, out of scope for a reporting-only run.

### 3.5 `byok-google-live-smoke.spec.ts:68` — **environment / live-dependency, indeterminate**

`Test timeout of 90000ms exceeded` waiting for `.jini-message-assistant .jini-message-content` to
render a reply from a REAL Gemini call (this suite only runs live because `GEMINI_API_KEY` is set in
this environment — see note in §2). Could be a genuine break in the BYOK Gemini turn path, or ordinary
live-API latency/flakiness. I deliberately did **not** retry this one — it makes a real, billed model
call, and the anti-loop rule plus the cost of a second live call argue against a blind retry without
explicit sign-off. Recommend the coordinator decide whether a second live run is worth the spend, or
whether to trust the config's own SSE-framing route test as the byte-level guarantee here instead.

## 4. Named wrong-property tests found this run

- `development/e2e/site-assistant-highlight.spec.ts:212` — asserts a `.entry-meta` sibling from
  `render.ts#entryContent`'s dynamic markup, but the seeded default theme is static-tier and never
  emits that class (§3.2). This is new evidence for the wrong-property backlog, not one of the five the
  dispatch referenced.

## 5. Bottom line

One confirmed real regression from today's work: `tool-registrations.contracts.test.ts` (3 failing
assertions, single root cause) needs `mediaGenerationAgentToolCatalog` added to its `WIRED_CATALOGS`
array — the media-generation domain landed today without updating this test's own "every wired domain
must be listed here" contract. Two BYOK e2e failures (whitespace-key guard, discovery self-heal) are
plausibly connected to today's `@jini-ai` package rebuild but not conclusively isolated — both sit in
the admin BYOK form's client-side validation/hint surface, which is exactly what the newly-rebuilt
`@jini-ai/ui` dist backs. One e2e failure (site-assistant-highlight AC7) is pre-existing noise: a test
whose premise about which theme markup renders has been stale since 2026-08-10, unrelated to today.
One e2e failure (byok-google-live-smoke) is a live external API call that timed out — indeterminate
without a second (costly) live run. Everything else — 1446/1449 assistant unit tests, all 233
assistant/chat server route tests, all 169 admin AssistantDock/ai-assistant tests, all 1136 Jini chat
package tests, 12/13 site-assistant e2e tests, 37/40 byok e2e tests — is green. No suite was
un-runnable; nothing was skipped except by the suite's own designed skip conditions (none triggered,
since GEMINI_API_KEY is present).
