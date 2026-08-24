# Detection tooling build — trial run of 4 sweep proposals

Status: DONE

Owner directive: "do one, two, three, and four for a test." Building all four as a
real, live trial — not a permanent policy. Easy to revisit/revert if any turn out
to be more friction than value.

Source: `ADS-memory/reports/2026-08-17-resource-leak-sweep.md` (read in full before
starting).

## Plan
1. Lint rule (or rg-based fallback) for useEffect + timer/socket/listener with no cleanup
2. Cross-repo interface-change checklist step
3. Three bug-taxonomy.md entries
4. Generalized multi-tab soak check (development/e2e/)

## Progress log
- Loaded required skills, read report in full.
- Discovery: repo uses a minimal flat ESLint config (`eslint.config.mjs`) — complexity/sonarjs +
  one custom `no-restricted-imports`/`no-restricted-syntax` boundary rule. No react-hooks plugin
  loaded. IMPORTANT FINDING: the top-level `**/*.ts`/`**/*.tsx` block sets
  `linterOptions.noInlineConfig: true` repo-wide, which makes standard
  `// eslint-disable-next-line <rule>` comments silently NO-OP (verified empirically — ESLint
  prints "has no effect because of noInlineConfig" and still reports the violation). Any new lint
  rule needing inline suppression cannot rely on ESLint's own disable-directive machinery.
- Checked `apps/admin/src/lib/settings-events.ts`'s real call site: `App.hooks.tsx:94-97` calls
  `useEffect(() => { if (!user) return; return subscribeToSettingsChanges(WORKSPACE_ID); }, [user])`
  — a DELEGATED pattern (helper function owns the open/close pairing, effect body just calls it and
  returns its disposer). Not a literal `new EventSource(...)` inside the effect body.

### Item 1 — DONE: custom ESLint rule (not an rg fallback — a real rule fit the repo's flat-config style)
- `development/eslint-rules/effect-resource-cleanup.mjs` — new local plugin rule
  `local/effect-resource-cleanup`. Flags a `useEffect` callback that opens
  `new EventSource`/`new WebSocket`/`setInterval`/`window.setInterval`/`.addEventListener(...)`
  directly in its body with no matching `.close()`/`clearInterval(...)`/`.removeEventListener(...)`
  in the effect's own returned cleanup function.
- Wired into `eslint.config.mjs`, scoped to `apps/admin/src/**/*.{ts,tsx}` (excl. `__tests__`) —
  the only workspace in this repo with React hooks (`packages/sdk` has none).
- Deliberately scoped to LITERAL opens only — does not trace into helper functions. This means the
  `settings-events.ts`/App.hooks.tsx delegated pattern, and the bus-subscription pattern
  (`assistant-dock-bus.ts`, `settings-refresh-bus.ts`), never trigger it at all — verified directly,
  no suppression comment was needed anywhere in the real codebase.
- Suppression mechanism: since standard `eslint-disable` is a no-op here (see finding above), the
  rule implements its own: a comment containing `leak-lint-ignore: <reason>` anywhere inside the
  effect callback suppresses reporting for that effect. Verified working via probe file.
- Verification (probe files created under `apps/admin/src/__eslint_probe__/`, run, then deleted —
  repo is clean, `git status` confirms only `eslint.config.mjs` (M) and `development/eslint-rules/`
  (new) are touched):
  - `bad.tsx` (EventSource/interval/addEventListener with no cleanup, 3 functions, 4 opens): all 4
    flagged as errors.
  - `good.tsx` (same 3 patterns with correct cleanup + one `leak-lint-ignore`-suppressed interval +
    one delegated-helper case): 0 errors.
  - Full `apps/admin/src/**/*.{ts,tsx}` run: 0 errors from this rule (57 pre-existing unrelated
    warnings, all `noInlineConfig`/complexity, untouched by this change).
- Command to re-verify: `npx eslint -c eslint.config.mjs "apps/admin/src/**/*.{ts,tsx}"`

### Item 2 — DONE: cross-repo interface-change checklist step
- Read `AI-Dev-Shop/skills/change-management/SKILL.md` and `AI-Dev-Shop/skills/context-engineering/SKILL.md`
  plus the authoritative `AI-Dev-Shop/framework/governance/knowledge-routing.md` before touching
  either candidate toolkit file.
- `knowledge-routing.md` is unambiguous and explicit: `AI-Dev-Shop/agents/*/skills.md` and
  `AI-Dev-Shop/skills/*/SKILL.md` are both listed under "FORBIDDEN Destinations" for project-specific
  memory, with the routing table's own worked example being almost this exact case ("Adding a
  'remember always use TypeDoc' rule to agents/programmer/skills.md — WRONG... belongs in
  project_memory.md"). The checklist step here is a Tovu/Jini-specific convention, not a
  project-agnostic framework primitive, so it is exactly the content type that file routes to
  `ADS-memory/knowledge/project_memory.md`.
- Wrote the entry to `ADS-memory/knowledge/project_memory.md` (new `[CONVENTION]` bullet, 2026-08-17).
  Chose `project_memory.md` over the toolkit files, per the routing file's own authority — not
  editing either toolkit file.
- This is still "somewhere real agents will see it": `AI-Dev-Shop/agents/programmer/skills.md`'s own
  Guardrails section already instructs every Programmer dispatch to "Check
  `<ADS_MEMORY_ROOT>/knowledge/project_memory.md` for conventions before writing new patterns" — so
  the entry is in the path future work already reads, without corrupting a framework file.
- Judgment call flagged for the owner: the team lead's brief treated editing the toolkit files as a
  pre-authorized exception; I did not use that exception because the repo's own governance file
  (not just my preference) said the alternate location was correct, not merely "more correct." If the
  owner wants the checklist step to ALSO appear inline in `change-management/SKILL.md` for a
  cross-project reusable version, that's a separate, generic version of this same idea and easy to
  add on request.

### Item 3 — DONE: bug-taxonomy.md entries
- Read `bug-taxonomy.md`, `eval-design-playbook.md`, and `README.md` in
  `AI-Dev-Shop/harness-engineering/agent-evals/` in full first, per this repo's own standing rule
  (also restated in `AI-Dev-Shop/CLAUDE.md`). Note: the brief's given path
  (`harness-engineering/agent-evals/bug-taxonomy.md`) is actually under `AI-Dev-Shop/` at this
  repo's root — `AI-Dev-Shop/harness-engineering/agent-evals/bug-taxonomy.md`.
- Added 3 rows to `AI-Dev-Shop/harness-engineering/agent-evals/bug-taxonomy.md`'s existing tables,
  condensed from the sweep report's draft text to match the file's terse `| ID | Type | Description |`
  format:
  - `RES-BROWSER-SOCKET-LEAK` — Resource Management table, next to `RES-LISTENER-LEAK` (same leak
    family).
  - `RES-POLL-NO-DEDUP` — Resource Management table, next to `RES-RETRY-STORM`/`RES-BACKPRESSURE`
    (same "no dedup/no backpressure" family).
  - `API-SEAM-PARTIAL-ADOPT` — API & Contract table, next to `API-OPTIONAL-REQUIRED` (closest
    existing thematic neighbor).
- Verified: `grep -n "RES-BROWSER-SOCKET-LEAK\|RES-POLL-NO-DEDUP\|API-SEAM-PARTIAL-ADOPT"` on the
  file shows all 3 rows present, correct pipe-delimited column count matching neighboring rows.

### Item 4 — DONE: generalized multi-tab soak check
- Read `development/e2e/themes-presentation-request-timeout.spec.ts` and its paired
  `development/playwright.themes-presentation-timeout.config.ts` in full first.
- Key design finding: a brand-new second real tab (raw `page.goto`) would NOT actually exercise the
  fix under test — `lib/api.ts`'s `AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)` wraps only
  `api.*` calls, not the initial static HTML/JS asset navigation, so a fresh tab's own document
  request has no bounded timeout at all and would just hang past whatever Playwright's own
  navigation timeout is — that would test Playwright's client behavior, not the product fix. So
  generalization means "not pinned to the Themes screen," not "not pinned to any one already-open,
  already-authenticated tab" — kept the proven single-tab-plus-simulated-connections mechanism,
  generalized the SCREEN.
- Verified `.notice.error` on a caught fetch error is a widespread, pre-existing idiom (grep hit
  Themes, Database, Posts, Forms, Comments) before picking screens — not inventing new UI
  assumptions.
- New files:
  - `development/e2e/multi-tab-resource-soak.spec.ts` — loops over `SCREENS` (currently `Posts` and
    `Forms`, deliberately not Themes), opens `EXTRA_HELD_CONNECTIONS = 6` extra `EventSource`
    connections against `/settings/events` from the one logged-in tab (same mechanism/value as the
    Themes spec), navigates to each screen via the sidebar, and asserts `.notice.error` becomes
    visible with a "did not respond|timed out" message within 75s.
  - `development/playwright.multi-tab-resource-soak.config.ts` — new hermetic config, ports
    8001/8002/8003 (checked against every existing `_PORT =` constant in
    `development/playwright.*.config.ts`; highest prior neighbor was 7991-3), `testMatch` narrowly
    scoped to this one spec file (this directory's own established convention — an unscoped config
    would silently adopt every future spec dropped into `e2e/`), `workers: 1`,
    `reuseExistingServer: false`, `timeout: 100_000`.
- Verification (fresh run, not inferred): `npx playwright test
  --config=development/playwright.multi-tab-resource-soak.config.ts` → `2 passed (2.6m)`. Both
  individual tests took 1.1-1.3 minutes each — consistent with genuinely waiting out the real 60s
  `lib/api.ts` timeout window per screen, not a vacuous/instant pass.
- CI wiring: NOT wired into any blocking gate. Checked `.github/workflows/ci.yml` — the only
  workflow file in this repo — and it does not reference Playwright at all, so there is no existing
  "auto-collects new e2e specs" mechanism this could accidentally join. Per the brief, leaving the
  CI-blocking-or-not decision to the owner explicitly: this is a ~2.5min-per-run, real-wall-clock
  suite (2 screens today, trivially extendable by adding to the `SCREENS` array), fine as a periodic/
  manual check but I did not judge whether it belongs in the one existing CI workflow.

## Status: DONE — all 4 items built and independently verified with fresh command output.
