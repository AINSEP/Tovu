# Handoff — Tovu, 2026-08-20 (session 3): repo-wide complexity campaign

**Branch:** `general-work`, pushed, `HEAD == origin == 2fb22933` · **132 commits this session**
**Typecheck:** clean · **`check:src-complexity-drift`:** green

---

## ⛔ READ FIRST — five facts

### 1. The complexity gate now covers 9 folders, not 1. Debt went 105 → 5.

`development/scripts/check-src-complexity-drift.ts` covered `src/server/routes/**` and nothing
else. `SCOPES` is now:

```
src/server  src/assistant  src/features  src/widgets  src/seo
src/export  src/analytics  src/media     apps/site-chat/src
```

**105 → 5 is not re-grandfathering. 103 of the original 105 were FIXED.** The whole campaign ran
**179 → 5**, and a suppression check confirms none of it was gamed: `grep -rn
'eslint-disable.*complexity' src apps` returns nothing, and the diff since `81f88354` adds none.

### 2. THREE files are all that remain. They are the entire complexity backlog.

```
src/features/settings/migration.ts            cyc 10   (Async fn migrateLegacyPresentationSettings)
src/features/theme/validation/references.ts   cog 10
src/features/vendor-credentials/dual-read.ts  cyc 10   (publishConnectionToVendorConnection)
```

Worklist with line numbers is regenerable — see the command in §Commands.

**`src/server/routes/admin/plugins/uninstall.ts` (cyc 10 + cog 11) is the 4th and 5th baseline
entry and is DELIBERATELY EXCLUDED.** It belongs to a concurrent human-driven session that was
active in `plugin-runtime/` all day. Do not touch it without confirming that session has landed.

### 3. FIVE traps that break "just extract a helper". All found the expensive way.

Full detail in `2026-08-20-routes-complexity-handoff-patterns.md` (Patterns A–E) and
`2026-08-20-features-complexity-handoff-patterns.md` (A–D). Summary:

| trap | symptom | fix |
|---|---|---|
| **`?.` is a cyclomatic branch** | cyc high, cog absent; extraction MOVES the count | collapse the accesses — read the object once; resolve related fields as a unit |
| **cognitive nesting bonus** | cog still high after extracting the obvious inner block | extract the WHOLE loop/wrapper body |
| **extraction widens types** | eslint clean, `tsc` red | narrow the annotation to the TRUE type, never cast |
| **`.find()` loses narrowing** | predicate narrows inside, not in the return type | `for...of` + early return inside a resolver |
| **`src/features` scan exits 2** | EMPTY stdout, `could not find plugin "sonarjs"` | the two `--ignore-pattern` flags (now baked into the gate) |

The last one matters beyond eslint: **exit 2 is not exit 1**, so a naive check reads it as a pass.

### 4. `req.body` is `any`. Route handlers have never been typechecked.

Surfaced 4× by extraction forcing an annotation. **VERIFIED SAFE** — every path traced routes
through a validating domain function (`post.ts:677 validateUpdatePostInput`,
`widgets/write-service.ts:11-13 → WidgetTypeUnregisteredError`). Routes are thin parsers; the
domain is the chokepoint. **But the safety is conventional, not enforced** — nothing stops someone
adding a route that casts a body field and calls something that does not validate. Suggested audit
in `2026-08-20-route-body-type-safety-finding.md`.

### 5. Nothing was checking. That is the real lesson of the day.

`general-work` was **type-broken on origin for ~2 hours** across 3 files. Five agents committed
continuously; `npm run ci:local` runs typecheck but nobody ran it. Found only because an agent ran
`tsc` as an unprompted side-check.

A 13-minute typecheck cron was running this session. **It was session-only and is now gone.**
Recreate it, or run `npm run typecheck` between agent batches.

---

## Remaining work

### A. Finish the last 3 files (small — nothing above cyc 10)

Then re-capture the baseline so it holds only `uninstall.ts`. Capture procedure: there is **no
`--capture` flag**; the baseline is produced by importing the script's exported `findViolations()`
and writing `{_comment, violations}` to `development/scripts/src-complexity-debt.json`. A working
one-off lives in this session's transcript; rewriting it is ~15 lines.

### B. Coverage — the biggest untouched piece

**Complexity is done; coverage is not.** Two agents were mid-coverage when rotated and their work
was never resumed:

- **`src/assistant`** — 5 commits landed (`mcp-federation/config.ts` 0→100% funcs, `mcp-ui.ts`
  40→100%, `persistence/tenant-scope.ts` 0→100%, `store-factory.ts` 50→100%). Baseline before
  those: 50 files, line 99.24%, branch 89.94%, funcs 95.13%. **Re-measure first — the refactors
  changed function counts.**
- **The 6 long-tail folders** — 2 commits landed (`widgets/deps.ts`, `where-used.ts`,
  `tool-registrations.ts`). Before-baseline: 47 files, line 96.4%, branch 87.5%, funcs 89.1%.
  Worst remaining: `src/widgets/tool-registrations.ts` 15.8% funcs, `src/seo/tool-registrations.ts`
  27.3%.

**`src/analytics/config.settings.ts` has NO direct test** (confirmed by grep — only test doubles of
`AnalyticsConfigPort` exist). An agent volunteered to write its first real one and was rotated first.

### C. Wire up the new coverage gate

`development/scripts/check-area-coverage-floor.ts` is committed but **NOT wired into
`ci-local.sh`**. It needs `development/scripts/area-coverage-floors.json`, which does not exist yet.
It **deliberately exits 1 when unconfigured** so it cannot be wired in blind.

**⚠️ Capture floors from a FULL `TEST_CONCURRENCY=2 npm run test:cov` run, never a scoped one.**
Proven on `render.ts`: server+assistant tests give 59.6% funcs, `src/features/theme` tests give
20.1%. Neither alone is the truth. A scoped floor fails on genuinely-tested code.

### D. Bugs found, not fixed

1. **`liquid-sandbox`** — violating templates (for-range violation, disallowed tag) **time out at
   the 5000 ms render limit instead of being rejected up front**. Verified pre-existing on HEAD.
   The allowlist is not gating those two classes on that path. Owner: `src/server/http/site/`.
   Full writeup in `2026-08-20-liquid-sandbox-preexisting-failures.md`.
2. **3 production paths with zero tests** — `agent-daemon-server.ts`'s attachment-claim branch,
   `theme-page-preview.ts`'s templated `.liquid` route, `connectors/composio-callback.ts` (an OAuth
   callback). See `2026-08-20-untested-paths-found-during-refactor.md`.
3. **`src/assistant/__tests__/_tmp-full-sweep.test.ts`** — name says temp, committed since
   2026-08-18 in the ESM flip (`39096e15`). Probably swept in by accident.

### E. Architecture gate is RED, and partly ours

```
BLOCKING:     module API surface (files exposed)  201 → 202   ← concurrent session's
non-blocking: bidirectional hub count             139 → 151   ← OURS (139→140 before we started)
improved:     propagation cost (all-import)      12.20 → 11.62
improved:     back-edges into composition root      11 → 0
```

The hub rise is the expected cost of splitting large functions into many small helpers. The owner
accepted architecture going red "as long as it's not blowing up naturally". The blocking metric is
not ours — do not `--update` the baseline without asking whoever owns the plugin-runtime work.

### F. Cloud dispatch — 21 triggers, 0 successes, ever

Root cause isolated: container builds ✅, repo clones ✅, Claude Code starts ✅, then **the first
model call returns a bare "An API error occurred"**. Eliminated with evidence: repo URL, clone
access, push perms, `persist_session` (both values), `allowed_tools` (restricted AND full
`preset:default`), transient timing (same error 15 min apart). **`mcp_connections` cannot be tested
— the server injects it even when omitted.**

**Owner's untested hypothesis: peak-hours capacity throttling.** Every failure so far is US
business hours except one off-peak counterexample whose session is no longer retrievable.
**The clean test is one line:** `RemoteTrigger {action:"run", trigger_id:"trig_01VvHwYkthBEtVF12eFcKnyX"}`
late at night, then check `origin/general-work`. Escalation payload (session ids, env, account) is
in `2026-08-20-cloud-dispatch-root-cause.md`.

---

## Traps — carry these forward

- **`git commit` writes the whole index**, not what you `git add`ed. `git diff --cached --stat`
  after `add` is diagnostics, NOT protection. Only `git commit -F <msg> -- <exact path>` protects
  you — and only your own commit; it cannot stop someone else's unscoped commit from sweeping your
  staged file. **Five collisions today.**
- **NEVER `git reset` under concurrency.** Two agents did; one orphaned a commit that also carried
  a third agent's file, stranding 86 uncommitted lines for 15 minutes while that agent believed
  they were committed. Forward-only. A mislabeled commit is cosmetic; a reset is not.
- **Rotate agents at ~350k context** (owner's standing rule). The trigger that actually works is
  asking them to state at every check-in whether they should be rotated — they volunteer accurately.
- **Before killing an agent: kill FIRST, then evaluate the tree.** Checking first races — twice the
  agent committed and started a new file between my check and my `git add`. `TaskStop` leaves the
  working tree intact, so nothing is lost by killing first.
- **A dirty file that is eslint-clean may still be type-broken.** One was. Check `tsc` AND run the
  tests before snapshotting a rotated agent's work.
- **`npm run ci:local` runs typecheck but NOT tests.** `ci:local:tests` adds them.
- **`TEST_CONCURRENCY=2` is load-bearing** — unbounded the suite hits 5.4 GB, gets OOM-killed and
  orphans children. At 2 it peaks ~1.4 GB.
- **vitest is NOT installed at the repo root.** Runner is `node --import tsx --test`.
- **A repo-wide check measures the TREE, not HEAD.** `ci:local` read red at one point purely from
  an uncommitted edit of mine.

---

## Next-agent opening prompt

> Read `ADS-memory/reports/continuity/2026-08-20-session-handoff-complexity-campaign-complete.md`,
> then `2026-08-20-routes-complexity-handoff-patterns.md` (Patterns A–E).
>
> **First:** finish the last 3 complexity files (§A) — none above cyc 10 — then re-capture the
> debt baseline so it holds only `uninstall.ts`.
>
> **Then the real work:** coverage (§B). Complexity is done; coverage never got finished. Start by
> re-measuring `src/assistant` and the 6 long-tail folders, because today's refactors changed the
> function counts the old baselines were taken against.
>
> Before wiring `check-area-coverage-floor.ts` into `ci-local.sh`, read its header — capturing
> floors from a scoped test run instead of a full one will make the gate fail on well-tested code.
