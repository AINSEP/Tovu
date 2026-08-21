# Handoff — coverage campaign, measurement-tooling defect, and external audit

Generated 2026-08-21 · Branch `general-work` · HEAD `2bf1185a` · **74 commits, ALL UNPUSHED**
Source: Claude Code (Opus 5), Coordinator — Review Mode · Target: Claude Code, fresh session

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff, then
> `ADS-memory/reports/2026-08-21-session-request-audit.md` (the honest status of every open item).
>
> **Three agents were live at handoff time. Check whether they finished before dispatching into their
> areas** — `refactor-exporter` (site-exporter branch coverage), `fix-sol-rest` (4 audit findings),
> `rootcause` (coverage root cause). Their work is committed incrementally, so `git log` is the truth.
>
> **The owner's open goal is `analytics/export/media` at 100% branch with no unreachable code.** That is
> §1 below and it is the only thing blocking "done".

---

## THE ONE THING TO KNOW

**A full-repo `npm run test:cov` produces corrupt per-file coverage for 681 of 769 source files (89%).**
Do not use it to measure anything. Use **scoped per-area runs** — they are the only trustworthy source
and also the cheap ones (2–3 min / a few hundred MB vs 35 min / 2.7 GB).

Mechanism: an affected file is instantiated **twice** — native ESM (exercised) plus a CJS image — and
merged into one `SF:` block. `FN:` entries concatenate; `DA:` entries merge by line with the zero-hit
shadow winning, so **line coverage deflates too**. Tell: `__toCommonJS` / `__copyProps` / `__toESM` /
`__export` inside the block.

**Detection rule** — apply per file, never quote an aggregate without it:
```
grep the SF: block for __toCommonJS|__copyProps|__toESM|__export
  markers PRESENT -> combined number is corrupt; use the SCOPED number
  markers ABSENT  -> combined is right; a 0%/low scoped number just means
                     that run never loaded the file
```
**Markers flag RISK, not MAGNITUDE.** Three files with identical marker counts showed line deltas of
−63, −1 and 0.

**Consequence for the whole campaign:** every area re-measured honestly came back **30–45 points better**
than the full run claimed. `navigation` was published at 51.55% func and is actually 100%. The premise
this session opened with — "this repo is badly undertested" — was an instrument artifact.

Reports: `2026-08-21-repo-wide-combined-coverage-map.md` (headline retracted, kept as artifact evidence),
`2026-08-21-coverage-dual-instantiation-root-cause.md` (the bisect + root cause).

---

## §1 — THE OWNER'S OPEN GOAL (start here)

`src/analytics` + `src/export` + `src/media` = **100% line / 100% func / 97.00% branch.**
All 13 remaining branches are in **`src/export/site-exporter.ts`** (118/131).

Owner's bar, verbatim: *"Has to be at a hundred percent. No dead branches or anything or unreachable
code or anything. Absolutely not."*

`refactor-exporter` was dispatched with **execution authority** (Refactor persona normally proposes only)
and with the escape hatch withdrawn — all 13, no documented exceptions.

**Group A — 7 type-required** (`?? fallback` under `noUncheckedIndexedAccess`), lines 423, 425, 438, 452,
499, 543, 581. Two `split(sep)[0] ?? x`, two regex captures, three
`headers.get("content-type") ?? undefined`. Approach: total helpers that never index an array
(`indexOf`/`slice`), and widening the downstream signature to accept `string | null` so the three
conversions disappear.

**Group B — 6 no-seam.** `writeRedirectRoute`'s missing-`Location` family (3) and `assetOutputFile`'s
path-containment guards + `fetchOneAsset`'s refusal (3).

**⚠️ The containment guards are a SECURITY boundary. Do not delete or weaken them.** The sanctioned route
is to extract the containment decision into a small total function that is called on the real path and
can be tested directly with a traversal payload — the check stays enforced and stops being dead. That is
a design improvement, not a coverage seam.

**Banned as suppression, not elimination:** `!` assertions, `as` casts, ignore-comments, disabling
`noUncheckedIndexedAccess`. Precedent to follow: `getWidgetTypeRegistration` was split so the uncoverable
branch **stopped existing** (`recent-entries.ts` → `BRF:9 / BRH:9`).

---

## §2 — CONFIRMED BUG, DELIBERATELY UNFIXED

**Root cause of the coverage corruption**, found by `gpt-5.6-sol` and **all six hops verified by reading
the code**:
```
src/cli/__tests__/integration/export-command.integration.test.ts
  runCli() -> spawnSync(process.execPath, [...], { encoding, timeout })   <- NO env override
                                                        -> child INHERITS NODE_V8_COVERAGE
  -> cli/commands/export.ts   createSqliteRouteDeps(...) ; await exportSite({...})
  -> export/site-exporter.ts:738   createServer(routeDeps.createSiteApp())
  -> server/deps.ts:926            createSiteApp: () => createSiteAppLazily(routeDeps)
  -> server/deps.ts:1048-1050      (require("./app.js") as ...).createApp(routeDeps)
```
The child writes a V8 profile into the inherited dir; the parent's collector merges it. In the child,
`require("./app.js")` pushes `app.ts` + its whole graph through tsx's **CJS** hook.

**It explains the immune set** (`src/cli` 13/13, `apps/site-chat` 6/6, `src/http` 2/2 clean) — those load
in only one context.

**⚠️ UNRESOLVED TENSION — do not assume this is the only trigger.** Round 5 (media + all 162 `src/server`
tests) **reproduced**, and the CLI test above is in `src/cli`, **not in that set**. So either there are
multiple triggers, or the mechanism is broader — *any* tsx CJS `require()` of Tovu source, in-process or
in a child. **A second suspected site is already named:** `daemon-boots.integration.test.ts` spawns a
child with full env inherited, structurally identical.

**Do not ship a fix until the trigger set is known.** Candidate fixes (redirecting `NODE_V8_COVERAGE` for
spawned children, excluding descendant profiles) have repo-wide blast radius, and there is likely more
than one call site.

Useful filter: **`app.ts` sets `createSiteApp: () => createApp(routeDeps)` (non-lazy, harmless);
`deps.ts:926` sets the lazy `require()` variant. Only `createSqliteRouteDeps` carries the lazy one.**

---

## §3 — SMALL AND KNOWN (`fix-sol-rest` was dispatched on these — verify before redoing)

1. **Seed drift gate absent from `.github/workflows/ci.yml`** (local `ci-local.sh` gate 9 exists and
   works; verified it fails on real drift). Actions is billing-disabled, so YAML can only be validated
   statically.
2. **`--check` false-pass:** `JSON.stringify` drops `undefined`-valued optional properties;
   `exactOptionalPropertyTypes` is off.
3. **`generate-seed-content.ts` header cites a unit test that does not exist.**
4. **`phase-handler.repo-identity-binding.security.test.ts` pins an implementation detail**
   (construction-time object identity), not a security contract — a safe refactor to a live getter would
   fail it. Correct model to follow: `redirects-site-serving.test.ts`, which pins fail-closed behavior
   over real HTTP.

---

## §4 — DO NOT RE-OPEN

1. **`src/forms/manifest.ts` and `src/http/client.ts` have no importers because those features are not
   built yet.** Owner decision 2026-08-21. Not dead code, not a wiring bug. **Do not delete, do not
   cover, do not re-raise.**
2. **`src/db/schema.ts` is excluded from the function metric.** Its 301 raw `FN` entries decompose
   exactly: 79 esbuild `__export()` getters + 74 Drizzle FK closures + 144 anonymous builders + 3 CJS
   helpers. **Zero hand-written functions.** Line coverage (88.3%) is the only meaningful axis.
3. **`UnauthenticatedError`** (`gateway.ts`) has zero throw sites; its doc reserves it for a future
   caller. Documented, untested, **not deleted**.
4. **Architecture gate:** green and self-consistent. The `141` figures in commit `3d989a5f` don't
   reproduce (shipped baseline freezes `fanOut: 9.5`, count is **151**; `check-architecture.ts:455` uses
   strict `>`). Cause understood: the demo used the *prior* baseline's `>10`; `--update` freezes the
   *current* median. **The frozen-median fix is correct and undisputed. Do not `--update` or rebaseline.**
5. **Hub/barrel verdict: DO NOTHING.** Settled in the prior session.

---

## §5 — RULES THAT COST SOMETHING TO LEARN

- **MEMORY is the owner's binding constraint.** Peak this session was 4.8 GB against a ~5.4 GB OOM line.
  **One coverage run on the machine at a time.** Every dispatch must carry:
  `ps -eo args | grep -c '[e]xperimental-test-coverage'` must be `0` before starting; wait if not.
  Always `TEST_CONCURRENCY=2`. `npm run test:cov` also begins with `rm -rf development/coverage`, so a
  second invocation destroys the first run's output.
- **lcov `DA:` line numbers are WRONG** (tsx strips comments pre-instrumentation). Read `FN`/`FNDA`
  **names** and `BRDA` zero-hit **counts**. Never navigate to source by an lcov line number.
- **A green test can be too weak to catch its own bug.** `truncateIp` had 100% coverage, a passing test,
  and live data corruption — the test asserted only *determinism*, which the bug satisfied perfectly.
  Ask: *would this assertion still pass if the function were broken the way it is most likely broken?*
- **Use REAL inputs for classifiers.** `classifyOsFamily`'s `ios` branch was "covered" only by a
  synthetic UA that dodged the bug.
- **An in-process call-site trace cannot see a child process.** That is why an exhaustive, correct trace
  reached a wrong conclusion in §2.
- **Shared git tree, multiple sessions.** `git commit -F <msg> -- <exact paths>` is the ONLY safe form.
  Never `git add .`, `git reset`, `git stash`, `git checkout -- .`.
- **Subagents rotate at ~350k** (>60 files read or >150 tool calls). Put it in the **spawn prompt** and
  require them to report both counts every message. Two agents were stopped with good uncommitted work
  this session; both survived only because the coordinator checked before stopping. **Always check
  `git status` before `TaskStop`.**

---

## §6 — WHAT SHIPPED

**Four real production bugs, none of which anyone was looking for:**
1. **Every iPhone and iPad recorded as a Mac** — `classifyOsFamily` tested `mac os` before `iphone`, and
   every Apple mobile UA contains `"like Mac OS X"`. Fixed `2bc8b2e6` (test `5365a0bb`).
2. **Every IPv4 visitor collapsed into one bucket** — a regression introduced *this session* by the IPv6
   fix, caught by the external audit. Fixed `3264fb4b`, re-verified 6/6.
3. **Chrome and Firefox on iOS recorded as Safari** (`CriOS`/`FxiOS`). Fixed `3264fb4b`.
4. **Newsletter campaigns permanently stuck** — `handleSendBatchClaimed` skipped `recordResult` for
   suppressed rows, and that is the only place a row leaves `pending`, so `completeIfDrained` could never
   fire. Fixed `d9d9dd62` (test `482a500a`).

**Also:** admin typecheck RED→green (`a32fc20f`); `--experimental-test-module-mocks` wired (`6f760f43`);
seed JSON now **generated** with a blocking drift gate (`5ebf32c5`, `838e60bb`) after drifting twice in
one day.

**Coverage:** `core`/`db`/`routing` functions at 100% · `navigation` + `identity` at 100/100/100 ·
`newsletter/send-pipeline.ts` 49.6%→100% line · `webhook-repo` + `media-repo` 100/100/100 · 3 db files
that had **zero tests** now tested · **11 areas measured that no handoff had ever named**.

**Gates:** `check:architecture` green · `apps/admin` typecheck green · `check:seed-content-drift` new.

---

## Handoff contract

- **Inputs:** live `git log`/`status`, `npm run check:architecture`, `check:seed-content-drift`, scoped
  lcov runs, 9 subagent reports, 1 completed external audit (`gpt-5.6-sol` xhigh, 248 commands) and 1
  terminated one (2 findings salvaged).
- **Risks:** **74 commits unpushed — nothing is on GitHub.** Three agents were mid-flight at handoff.
  The coverage root cause is confirmed but **unfixed and possibly multi-site**.
- **Not ours, do not touch:** `apps/admin/src/features/plugins/**`,
  `src/server/routes/admin/plugins/uninstall.ts`, `src/assistant/__tests__/execution-credential-store.test.ts`,
  and several untracked `ADS-memory/reports/2026-08-1x-*.md`. Also **PID 8967**,
  `codex --dangerously-bypass-approvals-and-sandbox`, up 1d 6h, not this session's.
- **Suggested next assignee:** Coordinator → `refactor-exporter` continuation for §1, then §2.
