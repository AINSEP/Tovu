# Session 9 handoff — 2026-08-16 (night)

**Written for an external audit pass (Terra 5.6 / Codex). Everything below marked ✅ VERIFIED was
re-run by the Coordinator independently, not taken from an agent's report. Everything marked
⚠️ UNVERIFIED was not.**

**Repo state: Tovu `general-work` @ 36 commits ahead of session start (`b5492417`), ALL PUSHED.
Jini `general-work`, all pushed. Nothing lives only on this laptop.**

---

## 0. How this session ran (relevant to auditing it)

Eight subagents worked concurrently in one shared checkout. That produced three *silent* git-index
hazards worth knowing before you read any commit attribution:

1. **Silent no-op** — `git commit` prints "nothing added to commit" because another agent's commit
   consumed the index between your stage and your commit. Looks like noise, not an error.
2. **Sweep-in** — your commit contains another agent's staged files, under your message. **This
   happened at least twice.** Known mis-attributions:
   - `e63865e3` ("build: add test:cov:server…") also contains
     `ADS-memory/reports/2026-08-16-route-async-guards.md`, which belongs to a different agent.
   - `72c4f95e` ("fix(publish-credentials): heal existing rows' account_label…") also contains 9
     files from the architecture refactor.
   **Content in both is correct and complete. Only the commit messages are wrong.** No history was
   rewritten to fix this — deliberately, with 8 concurrent writers.
3. **Near-drop** — an agent ran `git reset --soft HEAD~1`; another commit had landed in between, so
   `HEAD~1` resolved to a different commit and it nearly dropped `87d7a4c5` (an unrelated agent's
   fix) out of history. Caught via reflog, restored. ✅ VERIFIED `87d7a4c5` is a safe ancestor of
   HEAD and all commits are intact.

**Rules that emerged and should be in any future spawn prompt:**
- Scope the commit itself: `git commit <paths> -F <msgfile>`. Checking `--cached` then committing is
  NOT enough — the window between them is unsafe.
- `git show --stat HEAD` after every commit. Absent files = no-op. Extra files = sweep.
- **Forward-only. Never `reset`/`rebase`/`amend` on a shared branch.** If you sweep someone's file
  in, leave it and report it.
- **Never `git stash` to test "is this pre-existing"** — it reverts every other agent's uncommitted
  work tree-wide for as long as it is active. Use `git worktree add --detach <path> <sha>` with
  `node_modules` symlinked in.
- **Subagents do not receive messages mid-flight.** They land at a turn boundary. A rule or STOP sent
  after dispatch cannot prevent anything already in progress. Everything load-bearing must be in the
  spawn prompt. Observed 4+ times this session, including a git-safety correction that arrived after
  the dangerous command had already run.

---

## 1. ✅ VERIFIED — independent test runs by the Coordinator

| Suite | Result | How |
|---|---|---|
| `src/server/__tests__/**` | **692 tests, 28 fail** | Coordinator ran it |
| Same suite at session start (`b5492417`) | **659 tests, 28 fail** | isolated `git worktree`, `node_modules` symlinked |
| **Failing test NAMES, diffed** | **IDENTICAL — zero new failures, zero fixed** | `comm` on sorted TAP `not ok` lines |
| vendor-credentials + publish-credentials + static-publish + daemon + widgets + export | **367 tests, 367 pass** | Coordinator ran it |
| `route-async-guards.test.ts` | **22/22 pass** | Coordinator ran it |
| `vendor-credentials-route.test.ts` | **8/8 pass** | Coordinator ran it |
| `npx tsc --noEmit` repo-wide | **exit 0** | Coordinator ran it |

**The 28 failures are all pre-existing** and unchanged from session start. Categories: BYOK-turn
tests that call live provider APIs, `publish-site` tests that depend on `GITHUB_TOKEN`, site-assistant
chat, and templateChoice/render assertions.

**⚠️ Flakiness warning:** an earlier run of the same server suite under heavy concurrent load
reported **39** failures instead of 28. Same commit, same command. **Those tests are load-sensitive.**
Do not treat a single count as authoritative; diff the *names*.

---

## 2. What shipped — 36 commits

### Architecture (`arch-export-edge`)
Independent second opinion (`gpt-5.6-sol`) said targeted decoupling, not a rewrite. Executed.

| Metric | Session start | Now |
|---|---:|---:|
| propagation cost | 28.94% | **10.56%** |
| back-edges into composition root | 29 | **27** |
| largest SCC | 36 | 37 |
| core size | 7.93% | **16.81%** ⚠️ |

- `d9a61b44` — broke `src/export/site-exporter.ts -> src/server/app.ts`, a **mutual dynamic
  require** that had already killed the agent daemon on every boot (documented at
  `server/app.ts:641`, bisected `dcfdd89`..`a4bddce`). Replaced with `RouteDeps.createSiteApp`
  injection, mirroring the existing `runExportSite` precedent. Zero test-fixture churn — every
  fixture builds via `{ ...createRouteDeps() }`.
- `54e8cb35`, edge 2 — moved `resolveActiveThemeId`/`resolveActiveTheme` down into
  `src/features/theme/`, collapsing a deliberate duplicate in `products.ts`. Did **not** move
  `resolveStorefrontProducts` — `features/commerce/storefront.ts`'s header forbids importing
  `SiteProduct`; used `RouteDeps` injection instead.
- **SCC 36→37 explained, not hand-waved:** ran Tarjan before/after and diffed membership.
  `features/theme` is the only new member, via a real `features/theme -> features/presentation` edge
  (`resolveActiveThemeId` calls `getPresentationSettings`); presentation was already inside the
  cluster.

**RESOLVED — core size was caught, then diagnosed and answered.** The Coordinator caught it by
re-measuring both commits in an isolated worktree: edge 1's injection shape took **core size
7.93% → 16.59%** (66 → 138 files), on a metric that IS ratcheted (`check-architecture.ts:102`,
lower-is-better at `:548`). The agent's original report and commit message never mentioned it, and a
wholesale `--update` silences the script's own `TRADE DETECTED` banner. **That omission is the one
real miss of the session and is exactly the pattern an auditor should hunt for elsewhere.**

**The diagnosis (measured, and it refuted the Coordinator's hypothesis):** the Coordinator guessed
the required `RouteDeps.createSiteApp` field dragged the BFS through the deps contract. Wrong. The
agent went past the aggregate numbers to raw dependency-cruiser JSON and replicated
`reachableCount`/median per-file. Pre-fix, the `site-exporter -> server/app` edge fused ~692 files
into one mutually-reachable blob; graph-wide **median file fan-in was 285**. Fixing it halved fan-out
for the cluster's hub files (691 → 316 — the real propagation win) but barely moved fan-in
(284 → 285). **Core size is membership relative to the MEDIAN, and the fix crashed the median from
285 to 10.** So a wide band of files whose own numbers did not worsen now clear a much lower bar.
**The yardstick collapsed alongside the fix; 72 files did not become more coupled.**

Attribution isolated by experiment: a throwaway copy of the post-fix worktree with `deps.ts`'s
`createSiteAppLazily` require stubbed out recovered only **138 → 132 (6 files, ~8%)**. The other
**92% is the structural price of closing the cycle at all**, independent of injection vs. move-down —
corroborated by edge 2's pure move-down shape moving core size less than half a point (16.59 → 16.51).
**Not-taken follow-up, named rather than silently skipped:** extracting `createApp` into a third file
neither `app.ts` nor `deps.ts` reaches circularly would recover that 8% (~0.7pp); judged not worth
the restructure since `createApp`'s default param already depends on `createRouteDeps`.

**SCC 36 → 37 was root-caused AND FIXED, not just explained** (`45ff16bd`). Tarjan membership diff
showed `features/theme` was the only new member: edge 2's `active-theme.ts` had bundled
`resolveActiveThemeId` (no theme-data dependency, only reads presentation settings) with
`resolveActiveTheme` (genuinely needs theme data), purely because call sites use them together. That
created a real `features/theme -> features/presentation` edge into the already-fused cluster. Split
into structural homes instead of call-site pairing — `resolveActiveThemeId` →
`features/presentation/active-theme-id.ts`. **Largest SCC back to exactly 36**, edge-2 gains retained.

**`c59d5b01` — third baseline move, with the full trade stated in the commit body**: both mechanisms,
the 92%/8% split, the 36→37→36 round trip, and all four measured states in one table. This is what
the first baseline move should have looked like.

✅ **VERIFIED by the Coordinator at HEAD: `check:architecture — OK: at baseline`.** propagation
10.58%, back-edges 27, largest SCC 36, core size 16.79%.

### The server-crash bug class (`route-async-guards`) — 21 of 21 fixed
`62ca21c7`, `7cd9c200`, `069ee2d9`, `fba9246f`, `0786e718`, `023571fc`

**Headline finding, worth more than the individual fixes:** `sendStoreError` did `throw err` for any
error outside its 4 typed classes — **from inside its own catch block** — so the caller's `try/catch`
was decorative. **5 handlers were only *apparently* guarded**: `publish-credentials.ts` POST/PUT/verify
and `source-control-credentials.ts` POST/PUT. Fixed once in the helper.

Every fix proven RED first by reverting via `git apply -R` on a saved patch (working tree only, never
staged). The failures **hung ~3.0-3.7s against a 3s `AbortSignal.timeout`** — matching the documented
"hangs, doesn't crash" shape. **A hang is worse than a crash: nothing alerts.**

Includes `site/comments-submit` — the only PUBLIC unauthenticated route in the set. It sorted last by
complexity and first by exposure.

**Named follow-up, held:** sweep `src/` for other typed-error-mapper helpers with the same
throw-from-inside-catch shape. `sendStoreError` is unlikely to be unique.

### Coverage gates (`routes-coverage`)
`b2d130bc`, `d71eef2d`, `3c35f78b`, `a9fa15ed`, `e63865e3`, `ece0dc6a`

- **Found a Node bug:** `--experimental-test-coverage` **silently drops any file whose name matches
  Node's own test-discovery glob (`test-*.ts`) — including application code — even with
  `--test-coverage-include` naming it.** `test-agent.ts` and `test-connection.ts` were invisible
  regardless of real coverage. **The prior audit's "test-connection.ts has zero coverage" finding was
  measuring this quirk, not missing tests** (it has ~8 tests). Every coverage number this repo has
  produced was under-measuring. Fixed with an explicit `--test-coverage-exclude` sentinel.
- Corrected baseline: **line 92.15% / branch 73.86% / funcs 97.52%** over 217 measurable files.
- Floor gate: `line>=88 / branch>=68 / funcs>=93`. Diff gate: `>=80%` branch per changed route file.
- **Found a bug in its own gate** (`a9fa15ed`): zero measurable files reported as a 100% PASS. A gate
  that manufactures a pass when it measured nothing is worse than no gate.
- **Measured the full `npm run test:cov` at 18.5 minutes / 4,991 tests / exit 1 (82 pre-existing
  failures).** Redesigned CI to a **parallel** `route-coverage` job scoped to `src/server` (~7 min),
  off the critical path, skipping the Postgres service container.

### Vendor credentials Phase 3 (`vendor-phase3`)
`04cf0747`, `4cfed73f`, `d4d941d0`, `d3406ff9`

**Owner decision: DUAL-READ** (read the new `vendor_credential_sets`, fall back to the legacy table
when the vendor group is empty). Chosen over auto-backfill because the real `infra/content.db` has
**zero rows** in the new table, so a straight cutover would have made the owner's working GitHub
credential report "not configured".

- `dual-read.ts` — never re-derives an AAD across lineages; delegates to each table's own resolver.
- **Best test in the batch, unprompted:** a corrupt NEW-table row throws its own typed error and does
  **not** silently fall back to legacy data. A naive fallback would mask real corruption behind
  stale-but-working rows.
- New `vendor-credentials.write` permission — deliberately NOT reusing `system.publish` or
  `source-control.credentials.write`, since this table now serves both domains.
- Wired into the composition root; 8 HTTP tests through the real `createApp` path. ✅ VERIFIED 8/8.
- **No verify endpoint** — no reviewed cross-vendor verify mechanism exists; deliberately not faked.

### Daemon supervision (`daemon-supervision`)
`5c1fae06`, `a23c99aa`

The agent daemon previously spawned **exactly once per boot** and never respawned. A crash meant the
assistant was dead for every workspace until a human restarted Tovu — while the API server stayed up,
so nothing looked broken.

- New `daemon-respawn-policy.ts` (pure, testable) + `daemon-supervisor.ts` (owns spawn/exit wiring).
- Backoff 1/2/4/8/16/30s from a **rolling 60s window**, not a lifetime counter — because **no
  "daemon became healthy" signal exists anywhere in this codebase**, so a lifetime counter would make
  an isolated crash inherit a past storm's penalty.
- Crash-loop cap: 5 failures in 60s. Separate **consecutive** EADDRINUSE sub-cap of 3, with a reason
  naming `lsof -ti :<port> -sTCP:LISTEN`.
- Manual seam `restartAssistantDaemon()` returning `{ok, reason}`.
- **Bug it found that was not in the brief:** `restart()` must await the old child's actual exit
  before spawning, or the replacement collides on the port and instantly EADDRINUSEs.

**RESOLVED — the SIGTERM resurrection bug, caught and fixed** (`bba7c35a`). In the first pass
(`5c1fae06`) `shuttingDown` was one flag serving two meanings — the agent's own comment admitted it.
`shutdown()` set it true; `restart()` set it **false unconditionally**, with no check for whether the
process was terminating. On Docker SIGTERM → `shutdown()` → any call to `restartAssistantDaemon()`
would **spawn a fresh `detached` daemon during container teardown**, outliving the parent — the same
orphan class the existing `reap()` comment says was already fixed once for `tsx watch`. Found by the
Coordinator reading the source, not by a test.

Fixed with the two-flag split: `shuttingDown` stays the transient "suppress this one exit handler"
signal; new `terminating` is set only by `shutdown()` and **never cleared**. `restart()` and
`ensureStarted()` both check it first and return `{ok:false, reason:"shutting down"}`. **Restart
still WORKS after a crash-loop trip** — only *terminating* refuses. Proven with a real RED/GREEN
cycle: `if (terminating)` was temporarily replaced with `if (false)`, both new tests failed, then
restored and passed.
✅ VERIFIED by the Coordinator at HEAD: `terminating` at lines 182/286/293/317, both SIGTERM-race
tests present, **38/38 daemon tests pass**.

**RESOLVED — lazy / on-demand start: BUILT, not rejected** (same commit). `ensureStarted()` /
`ensureAssistantDaemonStarted()`, exported through the barrel. **Single-flight falls out for free** —
there is no `await` between the "already running" check and `attemptSpawn`'s synchronous
`currentChild` assignment, so Node's run-to-completion guarantee does the work with no extra lock. A
pending scheduled retry is deliberately left alone rather than accelerated (accelerating under
traffic would let request volume outrun the backoff ladder). A 30s cooldown floor gates re-arming, so
a durably broken daemon under sustained traffic cannot spawn more often than its own crash loop
would.
**`src/server/modules/assistant.ts` was deliberately NOT touched** — `ensureAssistantDaemonStarted()`
is the ready primitive for `forwardToAgentDaemon` to call, but the wiring is still **OPEN work**.

**A third bug the agent found unprompted while building this:** verified directly with Node that a
spawn-level failure (ENOENT) fires only `"error"`, never `"exit"`, and `pid` stays `undefined`
forever. The first pass's "wait for the stale child's actual exit" branch would therefore have **hung
forever after any spawn failure** — a real pre-existing bug. Fixed by marking `childHasExited = true`
in the error handler, with its own regression test.

**⚠️ Deliberate scope boundary, disclosed not skipped:** the real `SIGINT`/`SIGTERM`/`SIGHUP` →
`shutdown()` → `process.exit(0)` wiring was NOT tested by sending a real signal — that would kill the
`node:test` runner itself. The interaction is proven at the factory level, where `shutdown()` is the
exact call the real handler makes.

### Account label heal (`admin-vendor-ui`)
`7e10275b`, `fc7a4cc8`, `87d7a4c5`, `6ec01fce`

**The owner's live bug:** their saved GitHub credential had `account_label = NULL`, so the in-app
assistant could not name the account and had to ask them for their own username.

**Two Coordinator claims were WRONG and corrected by the agent:**
- `probeAccountLabel` does not exist in this feature; the probe is
  `static-publish/verify.ts`'s `verifyPublishCredentialById`, already wired into the admin route's
  `verifyAfterSave`.
- "The owner never clicked Verify" is not the mechanism — **`POST` (create) already calls
  `verifyAfterSave` unconditionally** (`publish-credentials.ts:198`). The row is null because the
  initial auto-verify failed/was unreachable at save time, or predates that wiring (migration `0044`,
  same day). **What was missing is a RETRY path, not a probe.**

**Boundary the agent found that the Coordinator's suggested fix would have broken:** `verify.ts`'s
header is categorical — only human-gated callers may call `verifyPublishCredential`, never the
agent's capabilities handler. Since `publish-agent-tools.ts:770` reads `accountLabel` through the
same shared `listPublishCredentials`, a heal inside `store.ts` would put a live outbound request on
an agent-reachable surface. So the heal lives in the **admin GET route only**, fire-and-forget,
in-flight-deduped, `.catch()`-guarded, fired after `res.json()`.

**Known limitation:** an owner who *only* talks to the assistant and never opens the admin
Deployment page stays stuck. Boot-time/background sweep assessed and **deliberately not built** — no
scheduler infrastructure exists in `src/`, `PublishCredentialSetRepoPort` has no cross-workspace
listing method, and `src/index.ts` was another agent's file.

- Also: Create User form autofill (`autoComplete="new-password"` — `"off"` does not work, Chrome has
  ignored it on credential fields since ~2014). **⚠️ UNVERIFIED — cannot be tested in automation;
  Playwright's Chromium has no saved credentials. Only the owner's real browser can confirm.**
- Also: remove-token dialog now says "Revoke it on **GitHub**", not "GitHub Pages" — matching the
  link, which always pointed at `github.com/settings/tokens`. Vendor label ≠ destination label.

### Widgets (`embed-placeholders`)
`5edbfa22`, `ea64fd80`, `9d539a98`

**The Coordinator reported the owner's live site was "shipping placeholders." That was FALSE.** The
agent curled the published site directly: real resolved `<a href>` nav/footer links, zero
`widget-placeholder` markup. `partial`/`menu` are correctly resolved by `static-render.ts`'s
`resolveSlots`/`injectMenuEmbeds`, which run **after** `resolveHtmlPageEmbeds`.

The real bug was a **lying log** — `resolveHtmlPageEmbeds` warned "every occurrence degrades to the
placeholder" ~17x per export for types it does not own, which would bury a genuine typo-type warning.

**The Coordinator instructed it to reuse `isPageEmbedType()`. That instruction was WRONG** —
`isPageEmbedType` is `Object.hasOwn(HTML_EMBED_RESOLVERS, type)`, which returns false for theme-owned
markers AND genuine typos alike, so reusing it would have silenced the diagnostic for real broken
types. The agent proved this rather than complying. Its paired "a real typo still warns" test is what
would have caught the bad instruction.

**Follow-up, held:** hoist `static-render.ts`'s two inline literals (`!== "menu"`, `!== "partial"`)
into a shared constant in `core/embeds/marker.ts`. Deferred because that file was in another agent's
active refactor.

### Jini (`jini-lifecycle`) — ⚠️ NOT independently verified by the Coordinator
`23f01c1e`, `d62cecba`, `734ed213`, `bc7b8807`, `16d254a0`, and in-flight

- **`runs` Map leak fixed.** Worse than the prior handoff described: `rehydrate()` calls
  `eventLog.listRunIds()`, **unbounded**, so a restart reloads the entire terminal run history into
  memory. Fixed with bounded retention (24h TTL + 1000-run LRU cap), **not** delete-on-completion —
  verified `get`/`list`/`stream`/`resume` all read terminal runs after completion. Also fixed a
  second latent bug: eviction must clear the `idempotencyIndex`, or a re-post throws instead of
  starting fresh. RED proven by stashing only the source file (4/6 failed pre-fix).
- **`installGracefulShutdown` wired.** The "no caller" claim was true for `packages/server|daemon|cli`
  but the audit missed `examples/reference-web/src/daemon.ts`, a genuine long-lived host with
  hand-rolled signal handling and no timeout-forced-exit fallback.
- **Recovered TWO caches of orphaned uncommitted work** found sitting in the Jini tree, both complete
  and verified before committing: `fetchWithTimeout` itself (`8a37db9b`) and the media-providers /
  elevenlabs migration (`734ed213`).
- **Corrected the audit's census: 101 raw `fetch()` sites, not 67**; most already protected; **~40
  genuinely unprotected**, all in deploy paths.
- **Stopped a migration that would have caused two regressions:** the 5 streaming LLM callers do not
  use `fetch()` at all — they use `pinnedFetch`, a hand-rolled `node:https` transport built for
  DNS-pinned SSRF protection with its own 300s idle timeout. Migrating them would have dropped SSRF
  pinning AND severed legitimate long streaming completions with a whole-call
  `AbortSignal.timeout` — the exact hang the task exists to prevent. **Permanently excluded.**
- `packages/memory/src/llm-provider.ts` deliberately not migrated — already has an unconditional
  timeout, and migrating would reverse its documented caller-signal-override semantics for zero
  defect fix.
- **~30 browser-bundled UI / example call sites deliberately out of scope** — same-origin, different
  risk profile, and using `@jini-ai/platform`'s barrel in browser code risks pulling Node-only
  modules into a browser bundle. Needs its own verification pass.

---

## 3. ⛔ CI IS DEAD — and nothing tonight touched it

This was found by reading a real GitHub Actions run, not the config. **It invalidates the previous
handoff's framing that "your first push will fail CI until the baseline moves."**

1. **CI does not run on `general-work` at all.** `.github/workflows/ci.yml` is
   `on: push: branches: [main]` / `pull_request: branches: [main]`. **36 commits pushed tonight, zero
   CI runs fired.** The architecture gate and the new coverage gates have never executed in CI.
2. **CI has failed every run on `main` since 2026-08-04.** The most recent failure (2026-08-12,
   run `31558848242`) dies at **typecheck**:

       error TS2307: Cannot find module '@jini-ai/cms/core'
       error TS7006: Parameter 'ctx' implicitly has an 'any' type   (many)
       Process completed with exit code 2

   It never reaches `check:architecture`. **The real blocker is that CI cannot resolve the local
   `file:` Jini dependencies**, which only exist on this laptop.
3. Even if typecheck passed, `npm test` has **82 pre-existing failures** (measured, 18.5 min).

**This is the single largest un-started piece of work on the board.**

---

## 4. Owner's design questions — answered, nothing implemented

### 4a. Source-control page redesign (owner's ask)
> "populate from a dropdown of possible providers for the access tokens… searchable… for GitHub they
> just give a GitHub access token and save it… and a button 'create access token' that takes them
> back to the access token tab on the security page."

**This is exactly Phase 4 of the vendor-credential work, and Phase 3 (shipped tonight) is its
foundation.** `VendorId` is already a closed union of 7 providers
(`github|gitlab|bitbucket|vercel|netlify|cloudflare|s3-compatible`); a searchable picker at each
point of use was already a recorded owner decision. **Not started.**

### 4b. "Does the Static Site tab even belong in Deployment anymore?"
**Yes — but it should stop asking for a token.** The distinction this whole workstream is built on:
`github` is a **company you authenticate to**; `github-pages` is a **place you send things**. Source
control owns the vendor/credential relationship. Static Site owns the publish destination. Those are
genuinely different concerns. What is wrong today is that Static Site *also* collects credentials.

### 4c. "Repo name — attach it to the project, or get it from the GitHub API via the token?"
**Get it from the API.** Strong recommendation, and tonight's work already proves the pattern: the
account-label heal probes GitHub with the saved token to derive the account. Deriving the **repo
list** from the same token is the identical mechanism one level down.

The screenshot shows free-text `GITHUB OWNER OR ORG` and `REPOSITORY` fields. **Those are the exact
guess-prone inputs the live-publish e2e explicitly guards against** — assertion #2 of
`development/e2e/live-publish-e2e.spec.ts` is that no *"type it, e.g. leonaburime"* guess-fallback
fires, and the original bug was an invented account name. Replacing free text with an
API-derived picker (plus a manual override) removes that failure mode structurally.

### 4d. The screenshot's error
`Could not load publish credentials (cannot reach the Tovu API (HTTP 500) — is the server running?)`
— almost certainly the dev server restart-storm: `tsx watch src/index.ts` restarts on every file
save, and 8 agents were saving constantly. Diagnosed live: the server process was **9 seconds old**.
**Worth re-checking now that agents are done before treating it as a real defect.**

---

## 5. What's left — ranked

1. **Fix CI** (§3). Two separate problems: it does not run on the working branch, and it cannot
   resolve `@jini-ai/*`. Biggest un-started item. **IN FLIGHT at time of writing.**
   **⛔ REQUIRES AN OWNER ACTION NOBODY ELSE CAN TAKE:** `AINSEP/Jini` is a **private repo in a
   different org** from `leonaburime-ucla/Tovu-AI-CMS`. Actions' built-in `GITHUB_TOKEN` cannot clone
   it. The owner must create a repo secret holding a PAT (or deploy key) with read access to
   `AINSEP/Jini`. Until that exists, CI cannot typecheck at all.
2. **Wire `ensureAssistantDaemonStarted()` into `src/server/modules/assistant.ts`'s
   `forwardToAgentDaemon`.** The primitive is built, exported, single-flight and cooldown-gated
   (§2) — nothing calls it yet. This is the last step that makes "assistant is down" self-healing
   without a human.
3. **Build the admin "Restart assistant" button.** Contract is fixed and documented: import
   `restartAssistantDaemon` from `src/assistant`, call with no args, returns `{ok}` / `{ok:false,
   reason}`. It is **synchronous and does not wait for health** — no health-confirmation signal
   exists anywhere in this daemon path — so a route must surface `/readyz` /
   `isAssistantDaemonKnownFailed` separately for live status after the click.
4. **Recover the 8% core-size slice** (§2), if judged worth it: extract `createApp` into a third file
   neither `app.ts` nor `deps.ts` reaches circularly. ~0.7pp. Explicitly not taken tonight.
5. **Source-control page redesign** (§4a) — Phase 4.
7. **Agent-tool cutover** — `deployment_get_static_publish_capabilities` still reads the old table.
   Its *"NEVER a token, ciphertext, or masked tail"* contract is **still true today** and must only
   change in the same commit that adds `tokenTail`. `deployment_propose_custom_provider_credential`
   is a second, separate, unscheduled cutover point.
8. **Finish the Jini fetch migration** — ~26 of 40 sites remain (cloudflare-pages, netlify,
   github-pages).
9. **Boot/background account-label sweep** — assessed, deliberately deferred (§2).
10. **Sweep for other `sendStoreError`-shaped helpers** — throw-from-inside-catch.
11. **Hoist the marker-type literals** into `core/embeds/marker.ts`.
12. **Complexity gate for `src/`** — 70 of 234 route files violate ≤9. Needs a debt list + ratchet.
13. **Mutation testing** — `development/scripts/mutation-sweep.mjs` exists; recommended fourth signal.

---

## 6. For the auditor — where to be most skeptical

- **§2 core size.** A ratcheted metric doubled and was baselined without mention. The Coordinator
  caught it only by re-measuring. **Assume other trades may be hidden the same way** — the
  `TRADE DETECTED` banner is silenced by any wholesale `--update`.
- **Commit attribution is unreliable** (§0). Two commits are known to contain another agent's files
  under the wrong message. There may be more.
- **Every "RED first" claim except three is unverified by the Coordinator.** The three checked
  (`route-async-guards` 22/22, `vendor-credentials-route` 8/8, and the 367-test feature sweep) all
  held.
- **Nothing in Jini was independently re-run by the Coordinator.**
- **The autofill fix cannot be verified in automation** and remains unproven.
- **The 28 pre-existing server-test failures are load-sensitive** — one run reported 39. Diff names,
  never counts.
