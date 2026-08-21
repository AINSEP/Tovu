# Handoff: coverage tool still broken; today's lint/security/UI work is done and pushed

Generated: 2026-08-21T17:43:10Z
Source agent/session: Claude Code (Opus 5, 1M), Coordinator — Review Mode
Target: Claude Code (extension), fresh session
Branch `general-work` · HEAD `57a7a349` · **0 unpushed** · working tree clean of this session's files

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff, then
> `ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-cause.md` and
> `ADS-memory/reports/2026-08-21-coverage-layer2-order-dependency-experiment.md`.
>
> **Start with §1 — the coverage tool is still broken and it is the only substantive open item.**
> Everything else on this branch is finished, verified, and pushed.
>
> Hard constraints, non-negotiable: **never run `npm run test:cov`** (full-repo: 35 min, 2.7 GB, and
> the owner's machine OOMs near 5.4 GB). Scoped runs only, `TEST_CONCURRENCY=2`. Before ANY coverage
> run, `ps -eo args | grep -c '[e]xperimental-test-coverage'` must be `0` — **run that as its own
> separate command**, because chaining it onto the coverage invocation makes `ps` match your own
> shell and false-positive (learned the hard way today). This is a shared git tree with other
> sessions live in it: `git commit -F <message-file> -- <exact paths>` is the ONLY safe commit form.

---

## §1 — THE ONE OPEN ITEM: the coverage tool is still broken

**A full-repo `npm run test:cov` produces corrupt per-file coverage for ~89% of source files.** Not
fixed. This was item 3 of the previous handoff and remains the biggest genuinely-open thing, because
every coverage number anyone quotes depends on it.

Two separate mechanisms, both still live:

- **Layer 1 — deterministic, root cause known.** `src/cli/__tests__/integration/export-command.integration.test.ts`
  calls `spawnSync(process.execPath, …)` with **no env override**, so the child inherits
  `NODE_V8_COVERAGE`. The child's `require("./app.js")` (via `server/deps.ts:1048-1050`, reached only
  through `createSqliteRouteDeps`'s lazy `createSiteApp`) pushes Tovu source through tsx's **CJS**
  hook, producing a second image that merges with the parent's ESM image. Reproduced from 2 files.
  A **second suspected site** is recorded and unconfirmed: `daemon-boots.integration.test.ts` spawns
  a child with full env inherited, structurally identical.
- **Layer 2 — the 12-file `src/server/http/**` cluster.** FN-table corruption reliable 5/5. The
  line-deflation half historically flipped between runs (3 full / 4 partial across 7).

**What was newly learned today (committed `0379127f`, report
`ADS-memory/reports/2026-08-21-coverage-layer2-order-dependency-experiment.md`):** the pre-registered
two-arm experiment ran — same 16 files (12 `src/server/http/**` + 4 `src/media`), `TEST_CONCURRENCY=1`,
sorted ascending ×3 then descending ×3. **All 6 runs identical** (6 shim markers, `FNF:43/FNH:29`,
`LH:357` clean). **Global sort order is ruled out as the lever.**

**The live lead, untested.** Historical baseline was 3 full / 4 partial across 7 unsorted runs (~43%
full-corruption). Today: **0 of 6**. Under that historical rate that is ~3-4% probability. Something
changed, and it was not sort direction.

**Coordinator's hypothesis, explicitly UNTESTED — treat as a hunch, not a finding:** the historical
flip-flop happened on a machine at ~4.8 GB with several agents stacking coverage runs; today's 6 clean
runs happened on an idle machine with one-run-at-a-time enforced. **Memory pressure**, not file order,
would explain why concurrency setting didn't matter, why it looked random, and why no static cause was
ever found in the code.

**The next experiment, ~15 min:** re-run 6 times using the *unsorted* `find` file list (regenerated
fresh per invocation, exactly as the historical rounds did) on today's quiet machine.
- Still 6/6 clean → it was the machine, and Layer 2 is effectively solved.
- Flips again → the file list matters after all, just not its direction.

**Do not ship a Layer 1 fix while Layer 2 is unexplained** — a partial fix makes the remainder harder
to find. Candidate Layer-1 fixes (redirect `NODE_V8_COVERAGE` for spawned children, exclude descendant
profiles) have repo-wide blast radius and there is likely more than one call site.

---

## §2 — Other open items (all parked with an owner decision, none blocking)

1. **`npm run check:boundaries` FAILS, exit 2.** 2 errors + 67 warnings. Both errors are
   `no-deep-imports` on **modules previously promoted to `error` after being cleaned to zero**, so
   each is a regression against a promoted module:
   - `src/widgets/__tests__/unit/create-core-resolvers.unit.test.ts` → `src/widgets/resolvers/create-core-resolvers.ts`
   - `src/redirects/__tests__/phase-handler.repo-identity-binding.test.ts` → `src/routing/routing.ts`
   Both introduced 2026-08-20 (`a7446274`, `72b77057`), **not by this session**. Neither is a one-line
   import swap: `createCoreResolvers` is deliberately NOT re-exported from `widgets/resolvers/index.ts`,
   and `routing/index.ts` exports `runPostContentPhase` but **not** `resetRoutingRegistrationsForTests`
   (a test-only helper). Resolving them means deciding whether tests may reach past a module's front
   door — an architecture call, not a lint fix. Precedent exists: `.dependency-cruiser.cjs` already
   carries a `pathNot` test-file exclusion for a different rule family on exactly this reasoning.
2. **Export-side symlink gap.** `resolvePathWithin` is **lexical only** — no `realpath`/`lstat`, so a
   symlink already inside `outputDir` defeats it. `src/features/theme/theme-files.ts` and
   `validation/structure.ts` give the **theme** side a real symlink-rejecting second layer (verified by
   reading code), but it was NOT confirmed that every serve-time path reaches it. `src/export/` has
   **zero** hits for symlink/realpath/lstat — no second layer at all. Pre-existing. Owner's call.
3. **`npm run lint` FAILS — 205 errors** (was 293). 34 are `useExhaustiveDependencies` the owner
   **explicitly chose to leave red** rather than add 26+ suppressions. The rest were never scoped.
4. **Widget Picker 401 blip — UNEXPLAINED.** Opening the widget picker logged four `401 Unauthorized`
   plus "settings change feed closed by the server". The dialog still worked. Could not be
   root-caused: possibly a real session bug, possibly an artifact of the test harness doing 4 fresh
   logins in ~10 min. No single-session-enforcement code found in the admin frontend; backend not
   checked.
5. **The `locale` gap**, 6 admin hooks. An error toast can render in the wrong language if
   `useAdminLocale()` hydrates concurrently with a failed fetch. Pre-existing, repo-wide, already
   written down as a known gap in 2 sibling files. Cosmetic; owner declined a spot-fix.
6. **TipTap/ProseMirror teardown hangs in jsdom on a genuine unmount.** Real and reproducible. Not a
   task — a wall anyone will hit if a TipTap-backed hook ever needs a real mount/unmount test.

---

## §3 — Completed and pushed this session (22 commits, `fad50a6c..57a7a349`)

**⚠️ One commit in that range is NOT this session's: `c46ab44a` (composer discovery popover e2e) —
another session's work that landed on the same branch. Do not attribute it here.**

**The owner's headline goal — met and independently verified.** `src/export/site-exporter.ts` at
**129/129 branches, 43/43 functions, 825/825 lines**, zero corruption markers in its `SF:` block
(scoped run, measured twice by the coordinator, not taken from a subagent).

- **`d4ef2941` ruled on and resolved.** It had made 4 things public purely for testability. Owner ruled
  "finish the extraction properly": `resolvePathWithin` extracted to `src/core/path-containment.ts`
  and wired into **both** `src/export/site-exporter.ts` and `src/server/middleware/theme-static-assets.ts`
  (the half `d4ef2941` skipped); `writeRedirectRoute`/`fetchOneAsset`/`RouteWriteOutcome`/
  `resolveAssetPathWithinOutputDir` all returned to private; the pure decision `redirectOutcomeFor`
  extracted instead. **`redirectOutcomeFor` remains exported with only its test importing it — the
  owner explicitly decided to keep it** rather than lose the branch. (`034f696e`, `8b705226`, `1784a963`)
- **A false comment that was load-bearing.** `d4ef2941` justified calling the containment refusal
  unreachable by claiming the crawl normalizes everything. True of `extractCssUrls`
  (`new URL(ref, …).pathname`), **false of `extractAssetUrls`** (raw `href`/`src` regex + bare
  `startsWith`). So `href="/theme-assets/../../../../tmp/canary"` in rendered HTML reaches the guard
  for real — **it was never dead code.** Recorded as entry 9 in
  `ADS-memory/reports/2026-08-20-false-code-comments-register.md` (`d1bf2567`).
- **Wiring regression test** (`75c174c4`): pins that `theme-static-assets.ts` actually *calls* the
  shared helper, not just that the helper works. Proven RED (`200 !== 404`) by the coordinator
  independently, not only by the authoring agent.
- **External audit**, `gpt-5.6-terra` xhigh, read-only, 46 commands
  (`2a20421d`, report `ADS-memory/reports/2026-08-21-terra-audit-containment-extraction.md`). Two
  findings, both handled. Everything else it was asked to break held.
- **`resolvePathWithin` trailing-separator bug fixed** (`d0c45cf7`, terra finding 2): the `startsWith`
  prefix was built from raw `root`, so `resolvePathWithin("/tmp/export/", "x")` and root `"/"` refused
  every valid child. Fixed by deriving the prefix from `path.resolve(root)` — safe **only** because the
  guard above already proves `root` is absolute. The deliberate relative-root refusal is preserved and
  still tested. Coordinator probed 11 cases independently including traversal-under-trailing-slash.
- **23 bug-class lint errors cleared, 22 were false alarms** (7 commits, `b4efd182`..`bb8bdd68`). The
  coordinator predicted `src/widgets/config-validation.ts` was a validation hole; **that prediction was
  refuted with evidence** (all `walk*` are `: void` and mutate a shared errors array). Two deliberate
  reasoned suppressions: `origin.ts:46` (ADR-040 F3 control-char validation) and the
  request-volume measurement file (Rules-of-Hooks violation left in place because the correct rewrite
  measures identically and then hangs in TipTap teardown).
- **Hook deps 99 → 34** (`d8741bc9`, `5f67fcc3`, `691be855`, `bc442853`). 21 sites converted from inert
  `eslint-disable` comments to real `biome-ignore` (eslint.config.mjs never loaded the react-hooks
  plugin and sets `noInlineConfig: true`, so those comments silenced nothing); 15 dep-array additions,
  every one verified stable-identity first. **Zero suppressions added in Part 2, per owner order.**
- **Browser sweep: no render loops** (`8c56d22e`, report
  `ADS-memory/reports/2026-08-21-admin-render-loop-browser-sweep.md`). 23 screens measured with
  per-request timestamps; every idle window showed exactly one URL (`GET /api/agents`) at ~5000ms ±30ms
  — one pre-existing app-wide `AssistantDock` poll. **0 burst-shaped gaps, 0 console errors, 0 nav
  failures.** Re-parsed from raw JSON by the coordinator.
- **Media Picker Cancel button was unreachable** — fixed (`d35ad8e7`, `57a7a349`). Measured at
  **y=4907 against a 720px viewport** pre-fix. `.media-picker-grid`/`.media-picker-item` had zero CSS
  anywhere and `.settings-dialog` had no `max-height`. Saved e2e at
  `development/e2e/media-picker-cancel.spec.ts` + `development/playwright.media-picker-cancel.config.ts`,
  proven RED both at symptom level and mechanism level, re-run green by the coordinator.

---

## §4 — Decisions and constraints the next agent must honor

- **MEMORY is the binding constraint.** One coverage run on the machine at a time. Never
  `npm run test:cov`. `TEST_CONCURRENCY=2`. Check `ps` as its OWN command.
- **Shared git tree, other sessions live.** `git commit -F <msg-file> -- <exact paths>` only. Never
  `git add .`/`-A`, `git reset`, `git stash`, `git checkout -- .`.
- **Do not touch:** `apps/admin/src/features/plugins/**`,
  `src/server/routes/admin/plugins/uninstall.ts`,
  `src/assistant/__tests__/execution-credential-store.test.ts` — other sessions own these and they are
  dirty in the tree. **PID 8967** (`codex --dangerously-bypass-approvals-and-sandbox`) is not ours.
  **PID 9969** (vite :5173) and **PID 60795** (backend :3000) are the owner's live dev servers — the
  owner watches :5173. **Ask before killing any process.**
- **Every bug fix ships a regression test that FAILS first.** UI bugs need an e2e test, committed to
  `development/e2e/` — never left in a scratchpad.
- **`npm run test:visual` cannot run a new spec** — `development/playwright.config.ts:32` hardcodes
  `testMatch: /theme-visual\.spec\.ts/`. This repo uses **one config per spec** (34 on disk); copy
  `playwright.access-tokens.config.ts` and reserve a fresh port block.
- **Tovu e2e specs actually run at 1280×720, not the declared 900** — 33 configs spread
  `devices["Desktop Chrome"]` at project level, which overrides the top-level `use.viewport`. Derive
  viewport-dependent expectations from `page.viewportSize()` at runtime, never a literal.
- **`waitUntil: "networkidle"` NEVER resolves** against this admin (open SSE settings feed) and fails
  *silently* — you get screenshots stuck on the login page and no error. Use `domcontentloaded` plus
  explicit element waits.
- **lcov `DA:` line numbers are WRONG** here (tsx strips comments pre-instrumentation). Read
  `FN`/`FNDA` names and `BRDA` zero-hit counts. Never navigate to source by an lcov line number.
- **Screenshots are not evidence.** For any layout claim, read the number back with
  `getComputedStyle`/`getBoundingClientRect`.
- **Subagents rotate at ~350k** (>60 files or >150 tool calls). Put it in the spawn prompt and require
  both counts in every message. **Three agents left work uncommitted today** — always check
  `git status` before stopping one, and require incremental commits.

## Suggested skills
- `AI-Dev-Shop/agents/testrunner/skills.md` — for §1, the coverage experiment (measure-and-report).
- `AI-Dev-Shop/agents/software-architect/skills.md` — for §2.1, the boundary-rule decision.
- `AI-Dev-Shop/agents/security/skills.md` — for §2.2, the symlink assessment.

## Next Steps (ordered)
1. **§1** — run the unsorted-`find` ×6 control on the idle machine. Settles the memory-pressure
   hypothesis. ~15 min, one agent, owns the coverage slot exclusively.
2. Depending on that result: either declare Layer 2 environmental and fix Layer 1 (child env
   override), or resume bisecting Layer 2.
3. **§2.1** — decide the boundary-rule question; it is the only red gate that is a real decision.
4. **§2.2** — decide the export symlink gap (add `realpath` containment, or accept and document).
5. **§2.4** — reproduce or dismiss the Widget Picker 401.

## Handoff Contract
- **Inputs used:** live `git log`/`status`/`rev-list`, `npm run check:architecture` (exit 0, 2
  non-blocking ratchets), `check:boundaries` (exit 2), `check:inventory`/`check:inventory`/
  `check:src-complexity-drift`/`check:seed-content-drift`/`typecheck:e2e`/`complexity`/admin typecheck
  (all pass), `npx biome lint` (205 errors), two scoped lcov runs, one full e2e spec run, 7 subagent
  reports, 1 completed external audit.
- **Output summary:** enables a fresh session to resume on the single substantive open item without
  replaying the day.
- **Risks:** the memory-pressure hypothesis in §1 is **untested inference, not a finding** — do not
  cite it as fact. `check:boundaries` and `npm run lint` are both red by decision, not by oversight.
- **Suggested next assignee:** Coordinator → a single TestRunner-persona agent for §1.
