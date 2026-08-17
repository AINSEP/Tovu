# Session 11 — Verification of sessions 7–10 handoff claims (2026-08-17)

Follow-up to the continuity audit of sessions 7–10. Dispatched 4 subagents to independently verify
the items the audit flagged as "claimed but thin evidence" or "still open." This file is appended
to as each agent reports back.

Directly verified by the Coordinator (not delegated):
- `npm run check:architecture` → "OK: at baseline" at HEAD (16357b68). Zero violations right now.
- **CI run for final commit `16357b68` (run `32039622926`) — COMPLETED: FAILURE.** This answers session 10's #1 open question ("did the last commit's CI run pass"). Read via live browser (GitHub Actions UI — `gh api`'s `/actions/runs/{id}/jobs` and `/commits/{sha}/check-runs` endpoints both 404 for this token for unknown reasons, the per-workflow-ID `runs` list endpoint works for status/conclusion but not job-level detail, so job logs had to be read via the Actions web UI directly). Both jobs failed:
  - **`build-and-test` → `Typecheck (admin)` step fails.** `tsc --noEmit` in `apps/admin` errors across ~a dozen+ test files with `error TS2348: Value of type 'Mock<Procedure | Constructable>' is not callable. Did you mean to include 'new'?` (e.g. `CollectionEntries.unit.test.tsx`, `Dashboard.unit.test.tsx`, `use-migrate-forward-section.unit.test.tsx`, and more). **This is pre-existing, not introduced tonight** — independently corroborated: the theme-explore-preview-fix agent ran a full `apps/admin` typecheck earlier this session and reported "pre-existing unrelated failures only (test-infra `Mock` type drift ... not introduced by this change)," matching this exact error signature. Looks like a vitest/vite `Mock<T>` type-signature drift affecting many test files at once, not a targeted regression.
  - **`route-coverage` → `Check route coverage diff` step fails**, exit code 1. This is the diff gate's first-ever real execution in CI. A large number of route files fail the required ≥80% branch-coverage-on-changed-files threshold (e.g. `taxonomy/merge-term.ts` 60.61%, `site/comments-submit.ts` 50.00%, `members/sign-in.ts` 75.00%, `themes/explore.ts` 66.88%, and many more — dozens shown in the log). Because this branch has never had a real CI run before tonight, the diff is likely comparing against a stale `main` base spanning weeks of accumulated route work, so most of what's flagged is longstanding coverage debt getting its first real look, not new-tonight regressions. **Consequence: the next step in that job, `Check route test-failure baseline` (the gate `test-baseline-investigator` already confirmed works correctly and is clean locally), never ran at all** — it's marked skipped because the diff-coverage step failed first and the job has no `if: always()` to let it run anyway.
  - **Bottom line: this is not "your work is broken."** Neither failure is new-tonight regression — one is a pre-existing test-infra typing issue, the other is a coverage-diff gate meeting a multi-week-stale diff base for the first time. But CI is genuinely red right now, and both need an owner decision: (1) fix or ratchet the `Mock<T>` typecheck errors, (2) decide the diff-gate's comparison base / whether to ratchet-not-block on the first real run the way the test-failure baseline already does.

---

## Group B — Jini backend (verify-group-b-jini) — ALL 3 CONFIRMED GOOD

### Item 1: `configuredAllowedOrigins` throw-on-malformed-config — VERIFIED FIXED, stronger than the handoff implied
- `packages/core/src/origin-validation.ts:74-90` and `packages/http-kit/src/origin-validation.ts:64-77` — `configuredAllowedOrigins` never throws; malformed entries dropped + `console.warn`.
- New `assertValidAllowedOrigins` (core:97-104, http-kit:87-94) throws, naming every malformed entry — the boot-time companion.
- Wired at startup: `packages/server/src/compose-jini-kernel.ts:215`, unconditional first line of `composeJiniKernel`, before any resource opens — deliberately not scoped to specific security modes (comment at lines 197-214).
- Dedicated tests on both sides: `packages/core/src/__tests__/origin-validation.test.ts`, `packages/http-kit/src/__tests__/origin-validation.test.ts` — cover both the drop-not-throw case and the assert-throws-naming-the-entry case.
- **Verdict: fail-fast at startup confirmed. Real, evidenced, tested.**

### Item 2: ~30 browser-bundled fetch sites — safety-check step WAS done, and is now CI-enforced
- Safety-check artifact: `packages/platform/src/fetch-with-timeout.ts` module doc (lines 36-52, dated 2026-08-17). Root barrel `@jini-ai/platform` pulls in Node-only modules (`process.ts` → `node:child_process`); silently fine under `vite build` (tree-shaken) but breaks `vite dev` outright. Verified empirically: `esbuild --bundle --platform=browser` on the barrel → 154 resolution errors; `vite build` on the subpath → clean, 5.92kB, zero Node code.
- Fix: dedicated subpath `@jini-ai/platform/fetch-with-timeout` (confirmed in `packages/platform/package.json` exports map).
- All real browser consumers use the subpath (chat, ui, examples/reference-web); server-only packages correctly use the root barrel.
- **Now CI-enforced**, not just convention: `scripts/check-engine-boundaries.ts` "R2 exception #5 (2026-08-17)" allow-lists exactly this one subpath; any other deep-path import is flagged. Run via `guard:drift` in `.github/workflows/ci.yml`, ratcheted against `scripts/guard-baseline.json`.
- Only 2 remaining plain `fetch()` calls without the timeout wrapper (`examples/reference-web/src/A2uiLab.tsx:74`, `daemon-transport.ts:181`) — deliberately excluded with inline comments: long-lived SSE streams that need a caller-supplied signal instead of a whole-call timeout.
- **Verdict: genuinely addressed as its own step, not silently skipped. Stronger evidence than the handoff's "0 unprotected sites remain" line alone suggested.**

### Item 3: `packages/memory/src/llm-provider.ts` — confirmed untouched, contract intact
- Git history: exactly one commit ever (`d47b3988`). Never touched by the AbortSignal migration.
- `postJson` (lines 214-236): module's own `AbortSignal.timeout(resolved.timeoutMs)` is spread AFTER `resolved.requestInit`, so it always wins over anything a caller supplies — matches the documented "unconditional timeout, caller cannot override" contract (doc at line 63).
- **Verdict: correctly left alone. No regression.**

---

## Group A — Tovu admin UI (verify-group-a-admin-ui) — no Playwright available, static-code-only

### Item 1: Create User autofill — attribute fix IS in place, root cause is NOT
- `Users.tsx:104-111` (NewUserForm): password input has `autoComplete="new-password"`, regression test at `Users.autofill.unit.test.tsx:57`.
- `AccessTokensTab.tsx`: `TokenRow` (303) / `ExistingTokenFields` (459), token input (420) also has `autoComplete="new-password"`.
- **`TokenRow` still renders `ExistingTokenFields` UNCONDITIONALLY inside `<details>`** (line 329, confirmed not gated on open/expanded) — the code's own comment (406-419) says this IS the actual root cause (a live password input sits in the DOM per saved token even collapsed; Chrome's formless heuristic groups it with nearby fields by DOM proximity). The `autoComplete="new-password"` fix mitigates the symptom but the structural trigger is unchanged.
- **Verdict: still genuinely unverified.** Needs a real browser with real saved Chrome creds, or Playwright wired to a profile that has them — cannot be closed by static review or vanilla Playwright.

### Item 2: StaticSiteTab old token field — premise partly wrong, real target found
- The field is `CredentialTokenPicker` (`StaticSiteTab.tsx:1201`, wired 1128) — a "which saved token is default" `<select>`, only shown when a provider has 2+ saved connections.
- **Correction: NOT dead code** — its own doc comment says it implements the owner's original ask verbatim, has dedicated passing tests (`StaticSiteTab.unit.test.tsx:1185-1218`). Writes via `port.updateCredential(credentialId, {isDefault:true})`, same table/mechanism `AccessTokensTab.tsx`'s "Make default" button uses.
- **It IS genuinely redundant** (not dead) — Access Tokens tab already offers the equivalent action against the same rows. Removing it would not strand any credential or break publish (publish reads `isDefault` server-side regardless of which UI set it).
- Two flags before removal: (1) the surrounding `PublishCredentialsSection`/`PublishCredentialFields` (actual token entry) is explicitly OUT of scope per a standing comment citing `2026-08-17-source-control-ui.md` — only the small dropdown is the removal candidate; (2) removing it means updating/deleting the 3 tests at `StaticSiteTab.unit.test.tsx:1185-1218`.
- **Verdict: safe to remove on the data/backend side**, contingent on the owner accepting the UX tradeoff (one fewer place to pick default token).

### Item 3: Vendor-credential Phase 4 — confirmed fully unstarted
- Grepped `apps/admin/src` for `VendorConnectionInput`, `VendorCredentialSetRecord`, `resolveForVendor`, `vendor_credential_sets`, `VendorCredential`, `tokenTail`, `vendorCredential` — zero hits, all variants. Only unrelated "vendor" hits are for a pre-existing media-generation feature (Grok image/video providers).
- **Verdict: 0% started, not even partially.**

---

## Group C — Tovu config/decisions (verify-group-c-config)

### Item 1: nlweb-demo SIGTERM — premise holds, WRONG REPO in the original item
- `examples/nlweb-demo/` does not exist in Tovu at all (confirmed via `git rev-list --all` tree scan). It lives in the sibling **Jini** repo: `/Users/la/Programming/Jini/examples/nlweb-demo/src/server.ts`.
- Verified there: 64 lines, zero SIGTERM/SIGINT/process.on handling, `package.json` is `private: true`, no Dockerfile references it anywhere.
- **Verdict: substance still accurate** (spike-only, correctly left unwired) — but any future tracking of this item needs a repo qualifier (Jini, not Tovu) or it'll look like it vanished.

### Item 2: `deployments.credentials.write` rename — SAFER than "pending decision" implied
- Real usages: exactly 2 call sites, both in `src/features/deployments/publish-agent-tools.ts` (lines 330, 1263), plus their test assertions. (`source-control-credentials.ts:38` is just a comment citing it as a naming precedent, not a real usage — that route's own permission is the unrelated `source-control.credentials.write`.)
- RBAC grants live in Drizzle tables `roles`/`policyPermissions`/`rolePolicies`/`principalRoles` (`src/db/schema.ts:801-857`), seeded by `@jini-ai/cms/identity`'s `seed.ts` (Jini repo). **No seed/migration grants this permission to any built-in role by name** — the owner role gets it via an unconstrained `*` wildcard, not enumeration.
- **The blocker is already solved and just wasn't known**: Jini ships `migrateDeprecatedPermissionGrants`/`registerPermissionMigration`, already wired live at every boot (`src/identity/wiring.ts:116-127`), additive-only and idempotent, **already in production use for 2 other renames** (`navigation.manage → admin.menus.*`, `integration.manage → admin.integrations.manage`).
- **Verdict: this is now a low-risk, mechanical change** — swap the string at 2 call sites + test, add one more `{from, to}` pair in `wiring.ts` alongside the existing two. No need to know the live-DB answer; the migration mechanism handles both "grant exists" and "doesn't exist" safely.

### Item 3: CI trigger branch config — STALE, already widened
- Current `.github/workflows/ci.yml:54-58`:
  ```yaml
  on:
    push:
      branches: ["**"]
    pull_request:
      branches: [main, general-work]
  ```
  Already widened from `[main]`-only on 2026-08-16, touched again 2026-08-17 for the checkout/pnpm-action-setup fixes. **The "still main-only" framing in the still-open list is out of date.**
- **Has the stated precondition (a clean quiet-branch run proving the gates work end-to-end) actually been met? No.** Pulled all 86 runs of workflow `317655251` via the GitHub API: exactly ONE `success` in the entire history, from 2026-07-21 on `main` — a month old, predates the current workflow's checkout/pnpm-action-setup rewrite, so it's not evidence the *current* workflow content works. Every run today (2026-08-17, all on `general-work`) is `cancelled` or `failure`, with one `in_progress` (`32039622926`, HEAD `16357b68`) as of this check.
- **Verdict: progress is real (bugs fixed), but the actual precondition for widening isn't proven yet — and notably, the trigger was already widened anyway, ahead of that proof.** Worth flagging back to whoever owns that decision.

---

## Test-baseline investigation (test-baseline-investigator) — DONE, real run executed

Quiet checkout confirmed (only a 5-day-idle zombie vitest worker from a different app/runner, no real concurrent load). Ran `npm run test:cov:server` for real: **985 tests, 940 pass, 45 fail**. Ran `npm run check:route-test-baseline` — first real exercise of this gate script ever:
- Exit 0 — "OK: 45 failing test(s), all in the 57-entry baseline"
- **Zero new failures.** CI is not currently exposed to a false negative from this gate.
- **12 baseline entries no longer fail** (stale, named explicitly in the script's own output) — safe, mechanical prune recommended, not yet done.
- Independently re-derived the failing-name set from the TAP file with the same regex the script uses — got the identical 45 names and identical stale-12, confirming the script's TAP-parsing logic is correct, not just "ran without crashing."

**The three numbers reconciled**: 45 is the real, current, quiet-run count for the baseline's actual scope (`src/server/**/*.test.ts`). 57 was the committed baseline, seeded under heavy concurrent load (noisy, over-inclusive). 28 was session 9's narrower `src/server/__tests__/**`-only scope (categories only, never a full name list) — not directly comparable to 45's wider scope.

**Sampled 5 of the 45 across categories, read the actual code — 3 of 5 don't match their documented category:**
1. `identity-crud` AC-27/28/29 — reproduces byte-identical under this quiet run. **Resolves the baseline's own open honesty-note question**: ruled OUT the shared-SQLite-fixture-race theory — confirmed a genuine deterministic bug/gap, not a concurrency artifact.
2. `publish-site` github-pages preview test — NOT actually a missing-`GITHUB_TOKEN` case as labeled; `credentials.ts` (2026-08-15) added `GH_TOKEN`/`GITHUB_ACCESS_TOKEN` aliases and changed the guidance string, and the test still asserts the OLD message — a stale expected-string assertion. Still correctly pre-existing debt, just mislabeled.
3. `site-assistant` chat history test — expects 503 assuming no `GEMINI_API_KEY` in the test env, but this shell HAS a real key set, so it got 200 instead, and a sibling test in the same run took ~7s (vs sub-second) consistent with a real outbound Gemini call happening during a nominal "route test." **Hermeticity gap**: any shell/agent with an ambient provider key gets different, less deterministic behavior here.
4. **BYOK "runs a REAL admin tool" test — likely a genuine app-level bug, not test debt.** Explicitly stubs `globalThis.fetch` (`stubAnthropicFetch`) — no live call happens, contradicting its "calls live provider APIs" category label. Real failure: expected a `tool_use` event on the wire, got `undefined` — smells like real drift in tool_use SSE framing or `execute_delegated_tool` routing vs. what the stub's fixture expects. **Flagged as worth separate human eyes**, not just ratchet debt.
5. `admin-menus-routes` 403 test — failure is `'published' !== 'draft'` on a post status field, unrelated to the 403/permission-grant assertion it's filed under.

**Bottom line**: gate is real, correct, trustworthy — CI is not exposed to a false negative right now. It IS exposed to a false sense of category-accuracy: the "why" documented for several baseline entries doesn't match the actual proximate failure on inspection. Recommendations (not executed, flagged only): (a) prune the 12 stale names — safe/mechanical; (b) don't trust the category comment for any individual entry without re-checking; (c) have `test:cov:server` scrub provider-key env vars before running so route tests behave the same regardless of ambient shell secrets. Full run output + fresh TAP saved; baseline JSON and source left untouched.

---

## Theme Explore preview bug fix (theme-explore-preview-fix) — DONE, both bugs fixed + tested, NOT committed

New owner-reported bug (mid-session, not part of the original 4-handoff audit): `apps/admin/src/features/themes/ThemeExplore.tsx` on `/admin/themes/explore?theme=basic`.

**Bug 1 — Preview blank for CSS/JS/JSON**: `ThemeExplore.tsx:145-160` (`previewSrcFor`) — removed the `!file.readable` guard; every file that isn't page/partial/liquid-template now returns the `/theme-assets/{theme}/{path}` raw URL unconditionally. Doc comments updated. Verified server-side against the owner's own live `:3000` API (not restarted): `curl -I` on `theme.json` and `styles.css` confirm correct `Content-Type: application/json` / `text/css`, so the browser will render both natively. 3 new unit tests + 1 rewritten stale test in `ThemeExplore.unit.test.tsx`, confirmed RED on old code (4 failures via `git stash`), GREEN after (49/49).

**Bug 2 — Sidebar collapses below 720px**: `apps/admin/src/styles.css` — added a second `@media (max-width: 720px)` block switching `.theme-explore-files-wrap`/`.theme-explore-files` to `position: static; max-height: 240px`. **Real gotcha hit and fixed**: the first attempt placed the override in the same spot as the existing early media-query one-liner, which sits BEFORE the unconditional base rules later in the file — same-specificity CSS resolves by source order regardless of which rule's `@media` is true, so the override silently lost. Moved it to after the base rules, which fixed it — caught only because the e2e test still failed post-"fix." New hermetic e2e spec `development/e2e/theme-explore-narrow-sidebar.spec.ts` + dedicated config (own ports 7971-3, own `TOVU_DB=memory` boot, doesn't touch :5173) — confirmed RED pre-fix, GREEN post-fix.

**Verification**: unit 49/49 pass, new e2e passes standalone, e2e typecheck clean, `apps/admin` full typecheck shows only pre-existing unrelated `Mock` type-drift failures (not introduced). **Live confirmation in the actual :5173 tab was NOT done by the agent** — no Playwright MCP tool in its session. Files touched, nothing committed yet: `ThemeExplore.tsx`, `ThemeExplore.unit.test.tsx`, `styles.css`, `theme-explore-narrow-sidebar.spec.ts` (new), `playwright.theme-explore-narrow-sidebar.config.ts` (new).
