# Session 8 handoff — 2026-08-16 (evening)

**Both repos: nothing at risk at time of writing — verify with `git status` before trusting this.**
**Unpushed: Tovu 80 commits, Jini 5. Still never pushed. This is the largest single risk on the board.**

---

## Do this first

1. **Push.** 80 + 5 commits of proven, tested work exist only on this laptop. Nothing else on this
   list matters if the machine dies.
2. **Before/with the push: decide the architecture baseline** (see §5). `check:architecture` is a
   **blocking** CI step (`.github/workflows/ci.yml`, no `continue-on-error`). It is currently RED.
   **Your first push will fail CI** until the baseline moves. This is not a new breakage — see §5.
3. Read §7 ("Not verified") before claiming any of this works.

---

## 1. The headline: the site is live, and the pipeline that proves it is automated

**https://leonaburime-ucla.github.io/tovu-demo/** — HTTP 200, published by the in-app assistant,
end to end, unattended.

`development/e2e/live-publish-e2e.spec.ts` + `development/playwright.live-publish-e2e.config.ts`
(`24a0b9b8`, `2cc23742`, `afb4cbdc`). One ~5-6 minute run: real browser, real spawned `claude` CLI,
real MCP-UI iframe, real in-frame click, real GitHub push. **All 7 assertions green in-process**,
several cross-checked against GitHub's own API:

1. Correct account resolved (`leonaburime-ucla`, not the invented `leonaburime`) ✅
2. No "type it, e.g. leonaburime" guess-fallback fired ✅
3. Publish succeeded to GitHub Pages ✅
4. Post-click UI shows the real outcome, not "Done." ✅
5. Assistant reported it truthfully in chat ✅
6. `publish_history` row with `triggeredBy='agent_tool'` and a real `commitSha` ✅
7. Published URL returns 200 ✅

Rerun: `npx playwright test --config=development/playwright.live-publish-e2e.config.ts`
(ports 7951/7952/7953). **Every run pushes a NEW real commit to `gh-pages`.** Owner has standing
authorization; `Bash(npx playwright test *)` is in `.claude/settings.json` so it needs no gate.

**Trap that cost this session an hour:** GitHub Pages publishes to the **`gh-pages` branch**, not
`main`. The Coordinator repeatedly reported "no publish landed" while checking `main`. Check
`gh-pages`.

Two config traps, both fixed, both non-obvious:
- `src/index.ts` **never auto-loads `.env`** (only `development/scripts/dev.mjs` does, via
  `process.loadEnvFile`). A test webServer booted from `src/index.ts` has no
  `TOVU_INTEGRATIONS_ROOT_KEY`, and the first decrypt **killed the whole process**. No other e2e
  config hit this because none of them decrypt a real secret.
- **Playwright evaluates the config file twice** — once in the main process that starts the
  webServer, once in the worker running the spec. A `Date.now()`-based temp path there yields two
  different files: the server writes DB A, the test queries DB B. Make config setup idempotent.

---

## 2. The server-crash bug class — found, fixed at three layers, and swept

A missing `TOVU_INTEGRATIONS_ROOT_KEY` made an async Express handler throw, which became an
unhandled rejection, which **killed the entire server process** — not a 500, the process.

Chain (every link verified): Express **4.22.2** does not catch async handler rejections → no
error-handling middleware anywhere in `src/server/` → no `process.on('unhandledRejection')`
anywhere in `src/` → Node's default is exit.

**It was worse than first diagnosed.** The verify route had no `try/catch`, but POST/PUT *looked*
guarded and were not: `sendStoreError` recognises 4 typed errors and does `throw err` for anything
else — from inside their own catch block.

**Fixed at the root, not the symptom** (`650b92f6`): `decryptRecord()` in
`publish-credentials/store.ts` now converts any sealer/keyring failure into the typed
`PublishCredentialSecretStoreUnconfiguredError`, so `sendStoreError` maps it correctly everywhere.
The write path already did this; the read path never got it. Plus a new
`src/server/boot/process-error-guards.ts` (`installUnhandledRejectionGuard()`, wired at
`src/index.ts:250`) — deliberately `unhandledRejection` only, NOT `uncaughtException`.

`4cd31179` + `6fbaab16` closed the daemon-side twin: `source-control/store.ts`'s `decryptRecord`
got the same typed conversion, `commit-site.ts:222` was wrapped into the existing
`{ok:false, code:"NO_CREDENTIALS_CONFIGURED"}` shape, and the guard was installed in
`src/assistant/agent-daemon-server.ts` too (the daemon runs as a **spawned child process**, so the
main-server guard does not reach it).

**Why the daemon guard is justified, and it is not a guess:** `src/index.ts:389` says in its own
words *"There is no retry path today (this function is called exactly once per process boot)"*, and
`child.on("exit")` only logs. **Nothing respawns the daemon.** A crash means the assistant is dead
for every workspace until a human restarts Tovu. That is not a deliberate crash-only design.

Three findings worth keeping:
- **The unguarded version HANGS rather than crashing fast.** The RED test sat for a full 5s
  timeout. A hang is worse than a crash — nothing alerts.
- **A comment was lying.** `publish-credentials.ts` documented `verifyPublishCredentialById` as
  "never throws". That guarantee only ever covered the provider-probe layer; the decrypt underneath
  it throws. Someone trusted the comment and skipped the try/catch. Comment corrected in place with
  the reason, not deleted.
- A **pre-existing test bug** was found and fixed: a test re-captured `globalThis.fetch` *after* it
  had already been stubbed and restored to the stub in its own `t.after`, permanently corrupting
  fetch for every later test in that file.

---

## 3. What else shipped

| Commit | What |
|---|---|
| `2359d8bd` | **Verify button** in Static Site — the control the assistant had been telling people to click, which did not exist. Plus a token picker (old schema; see §4). Regression spec confirmed RED first. |
| `dcc23788`, `fc64f2d9` | Access-tokens autofill fix — see §6, **unverified** |
| `4593bee4` | Server routes coverage/complexity audit |
| `4cd79506`, `57d705f1` | Two adversarial Jini audits |
| `84f4606e` | check:architecture regression diagnosis |
| `3fa92581` | `Bash(npx playwright test *)` permission rule |
| `22dceb2e` | gitignore for interactive-run debug artifacts |
| Jini `1d895e76`, `c39311e5` | Two real unhandled-rejection gaps in `http-kit` |
| Jini `9817562c` | SIGTERM/SIGINT graceful-shutdown helper — **has no caller, see §5** |

---

## 4. Vendor-credential redesign — Phase 1 DONE, Phase 2 in flight

**Owner decision (not open for re-litigation): ONE table replaces BOTH
`publish_credential_sets` AND `source_control_credential_sets`, keyed by VENDOR not destination.**
`github-pages` is a place you send things; `github` is a company you authenticate to. Today one
GitHub PAT must be entered twice and can drift.

Also decided: multiple named tokens per vendor; an explicit "add another token"; a stored last-4
tail displayed as `••••MPWg`; **the model MAY see the tail** (owner's explicit call — 4 chars of a
~90-char token is not a meaningful secret); a searchable picker at each point of use.
i18n/locales explicitly OUT of scope.

### ⚠️ The trap that would have destroyed every saved credential
`src/features/source-control/aad.ts:30` and its publish twin build the AES-GCM additional
authenticated data:

    source-control-credential-set:v1:${workspaceId}:${providerId}:${id}

**That string is authenticated but NEVER STORED** — it is re-derived from `(workspaceId,
providerId, id)` at every `open()`. Changing `providerId` from `github-pages` to `github` changes
the AAD, so auth-tag verification fails and **the ciphertext can never be opened again**. The
plaintext exists nowhere else. A pure `.sql` migration cannot do this; SQL cannot decrypt.

### Phase 1, committed and verified
`57f31435`, `d84be213`, `cf762f6f`, `ae404ba6`.
- New `vendor_credential_sets`; `VendorId = github|gitlab|bitbucket|vercel|netlify|cloudflare|s3-compatible`;
  new plaintext `token_tail`.
- **Migration `0045` is additive-only** — one `CREATE TABLE` + one unique index. Both old tables
  untouched and still serve every route/tool/store. **Nothing reads the new table in production.**
  This means Phase 2 is revertable without a data migration.
- AAD strategy: fresh lineage `vendor-credential-set:v1:...`. Rejected a legacy-providerId column
  (defers the problem) and a v1/v2 dual-read (permanent two-path complexity).
- Migration is **application code**: `development/scripts/backfill-vendor-credentials.ts` — dry-run
  by default, `--apply` required, restore point first, idempotent, and it **opens every re-sealed
  row back before inserting it**, refusing to write what it cannot prove round-trips.
- **The proof exists**: seal a row the OLD way → migrate → open it the NEW way → assert byte-identical
  plaintext, AND assert the OLD AAD now *fails*. Plus an adversarial test that corrupts a row and
  confirms the run aborts while the previously-processed row survives.
- Backup of the real DB at
  `~/.claude/harness-tmp/.../scratchpad/db-backups/content.db.pre-vendor-credential-migration-20260816.bak`
  (outside the repo; a restart may or may not preserve it — take a fresh one if you need it).
- `s3-compatible` is documented as a **deliberate protocol-bucket exception** (`ae404ba6`): it is a
  protocol, not a company — Backblaze/MinIO/Wasabi/R2 all speak it — so rows under it may belong to
  different companies. Related open ambiguity: **Cloudflare R2 is S3-compatible**, so one real
  account could land as `cloudflare` or `s3-compatible` depending which route saved it.

### Phase 2 — IN FLIGHT, check its state first
`store.ts`, `repo.memory.ts`, the sqlite repo and their tests were being written when the session
ended. **Check `git log` and `git status` before assuming anything** — the agent was told to commit
WIP. Remaining after that: resolvers, the agent-tool contract rewrite, then Phase 3 (both UIs).

### Acceptance criteria carried forward
- `deployment_get_static_publish_capabilities` currently promises the model **"NEVER a token,
  ciphertext, or masked tail."** `token_tail` makes that false. **Rewrite it deliberately** — a
  lying comment is what caused §2's bug.
- **Vendor label vs destination label are two different fields.** The remove-token dialog currently
  reads *"Revoke it on GitHub Pages"* while its link already points at `github.com/settings/tokens`
  (`apps/admin/src/features/deployment/rules.ts:301-303`). Token-provenance and revoke copy must
  name the **vendor**; publish-target copy may still name the **destination**. Do not let one
  `label` serve both. Surfaces: `AccessTokensTab.tsx:585-592`, `security-i18n.ts:63` (English
  interpolation only — do not touch locale coverage), `StaticSiteTab.tsx:905`.
- Suggested seam (from the Phase 1 author): a `VendorId -> {displayName, tokenSettingsUrl}` lookup
  belongs next to `VendorId` in `src/features/vendor-credentials/`, while
  `deployment/rules.ts`'s per-DESTINATION `tokenPageUrl` stays where it is and keeps its meaning.

---

## 5. ⭐ NEXT SESSION'S PRIORITY: architecture + gates

The owner named this as the critical thread. Two halves.

### 5a. Tovu — `check:architecture` is RED and blocking

Current vs baseline:

    propagation cost                  29.05%   (baseline 7.60)
    back-edges into composition root  29       (baseline 26)
    module cycles (mutual pairs)      13       (largest SCC 33 -> 35)
      deep-import edges               531      (informational)
    IMPROVED: module API surface  220 -> 202
    IMPROVED: core size        15.21 -> 7.96

**This session did NOT cause it. That is measured, not assumed** (`84f4606e`): the check was run in
two isolated worktrees — session start `0261491e` vs HEAD — and the three failing metrics are
**byte-for-byte identical**. The 6 cycle-creating edges all trace to commits from 2026-08-15 to
2026-08-16 13:46 (the *prior* session), each confirmed with `git merge-base --is-ancestor`.

**The baseline is 768 commits stale** — last moved `e8688e15`, 2026-08-10.
This session's only effect: +2 back-edges (wiring the process-error guard into two entry points, a
legitimate shared-module pattern) and +1 API-surface file. Propagation cost and core size actually
improved today.

**Severity, honestly:** nothing breaks at runtime. The 282% propagation jump is the metric's own
documented nonlinearity — two more modules joining an SCC that already held **79% of modules at
baseline**. Not 4× more coupling.

**Recommendation (from the diagnosis, endorsed): move the baseline citing `84f4606e` as
justification, and file the 6 edges as tracked cleanup.** Not a revert — there is nothing to
revert, it is 748 commits of shipped work. Not leave it red — a permanently-red blocking gate
trains everyone to ignore CI. **This is required before the push succeeds.**

The 6 edges share **one fixable shape**: `tool-registrations` / `commit-site` / exporter files
reach into concrete `assistant/surface-exchanges.ts` and `server/routes/types.ts` instead of a
narrow port. That is the targeted decoupling.

### 5b. Do we need a RADICAL re-architecture? — evidence says no

The owner's worry is code quality and blast radius. The measured answer so far is **targeted
decoupling, not a rewrite**:

Leiden community detection over the call/import graph (`src`, 17.6k nodes / 32k edges) returns 12
clusters with cohesion **0.916, 0.764, 0.924, 0.820, 0.856, 0.956, 0.875, 0.957, 0.839, 0.899,
0.843, 0.982** — high almost everywhere — and they **map onto recognisable product features**
(widgets, posts, newsletter, site rendering, members/forms, SEO, settings, assistant). In a codebase
that genuinely needs re-architecting, the graph's de-facto modules cut ACROSS the intended layout
and cohesion is low. That is not what this shows.

The largest cluster is **199 members, cohesion 0.916 — the composition root**
(`createRouteDeps`, `createSqliteRouteDeps`, `main`). That single fact is the whole defect: a large
wiring layer that feature modules import back into, producing the back-edges, the SCC, and the
propagation cost.

**⚠️ A second opinion was IN FLIGHT and did not finish.** `gpt-5.6-sol` was dispatched with full
repo access and told to attack the above thesis. It ran 43+ commands over 276KB of output with zero
errors and had NOT emitted `turn.completed` when the session ended. **Its verdict is unknown —
re-run it.** Packet at `~/.claude/harness-tmp/.../scratchpad/sol-packet.txt`; the canonical
invocation pattern is in the `feedback_codex_peer_dispatch` memory (stdin via `-`,
`<<PEER_DISPATCH>>` marker, `--ignore-rules --ignore-user-config --ephemeral --json`, and
**exit 0 does not mean success** — parse the JSONL for `error`/`turn.failed`).

### 5c. Jini — the gates exist and are UNPLUGGED (owner explicitly wants this next)

**Correction to an earlier claim: Jini is NOT ungated.** It has three scripts — `guard`,
`complexity`, `complexity:strict`. `.github/workflows/` contains **only `publish.yml`**, a dormant
Changesets publisher. **No CI runs any of them.**

`pnpm guard` (`scripts/guard.ts`, six self-tested rules: import boundaries, deep-path bans,
product-neutrality strings, DOM/universal split purity, driver isolation) **currently exits 1 with
25 violations**, accumulated since 2026-08-03 — 13 of them the literal string "Tovu" leaking into
supposedly host-neutral engine packages. Two were introduced *during this session* by an agent that
had no way to know the rule existed. That is the argument for wiring it up.

**Sequencing matters:** a CI workflow that is red on its first run gets disabled within days.
Options: fix the 25 first; land non-blocking with a dated issue; or baseline-and-ratchet (Tovu's
`development/scripts/check-admin-complexity-drift.ts` is a working precedent). Decide, then do.

Jini's own architecture measured **healthy**: 26 packages, **0 cross-package cycles, 0 layering
violations**, `core`/`protocol`/`platform` with heavy fan-in and zero fan-out. The opposite shape of
Tovu's composition-root problem.

---

## 6. Open work, highest value first

1. **PUSH.** 80 Tovu + 5 Jini commits. Requires the §5a baseline decision first.
2. **§5a baseline move + the 6-edge cleanup.**
3. **§5c Jini CI gates.**
4. **Finish the vendor-credential redesign** (§4) — Phase 2 then Phase 3.
5. **Jini `installGracefulShutdown` has NO CALLER** (`9817562c`). The helper, its tests and its
   opt-in design are good; the only reference is its own export line. **SIGTERM is still unhandled
   in practice.** Docker stops containers with SIGTERM. **Tovu has zero SIGTERM/SIGINT handlers in
   its own `src/` either** — verified. The full fix spans both repos.
6. **Jini fetch timeouts** — 67 raw `fetch()` call sites, none with an `AbortSignal`. A stalled
   remote hangs forever, silently. **Identify deliberately long-lived call sites (SSE, streaming,
   long-poll) FIRST — a blanket timeout would break them.**
7. **Jini `runs` Map never evicts** (`packages/daemon/src/run-lifecycle.ts:447`). Confirmed at
   line 540 in the code's own words: the only `runs.delete()` is the failed-start rollback. Every
   completed run's record stays for the daemon's life. Slow leak; severity scales with run volume
   and uptime. **Not yet dispatched.**
8. **Coverage gate.** Measured across 234 route files: **line 92.20% / branch 74.05% / funcs
   97.54%**. A 98% gate is impossible today — branch is 24 points short. **And an aggregate gate is
   the wrong tool anyway**: one file sits at 42.9% branch while the rollup reads 74%, so it would
   not have caught this session's bug. Recommendation: a floor just under baseline
   (~line 88 / branch 68 / funcs 93) PLUS a **diff gate** requiring ~80% branch on new/changed route
   files. Note `test-agent.ts` is genuinely untested; the audit also flagged `test-connection.ts`
   but **that finding is disproven** — `admin-assistant-execution-routes.test.ts` hits its exact
   path with ~8 tests.
9. **Complexity gate for `src/`.** 70 of 234 route files (113 functions) violate ≤9; 18 files (30
   functions) violate ≤15. A sub-10 gate needs a debt list + ratchet, same as `apps/admin`.
10. **21 unguarded async handlers across 15 files** remain (TS-AST scan, not grep). The process
    guard means they can no longer kill the server, but they still fail badly. Includes GET-list and
    DELETE in `publish-credentials.ts` — real, but they do not decrypt, so lower severity.
11. **The Create User form autofill** — `apps/admin/src/features/users/Users.tsx:82`: a real
    `<form>` with `type="email"` then `type="password"`, neither carrying `autoComplete`. Chrome may
    fill the admin's own email and saved password into a new-user form. Arguably worse than the bug
    in §6's fix. **Not fixed.**
12. **`configuredAllowedOrigins` throw-on-malformed-config** (Jini `origin-validation.ts:32`) is
    still unguarded at its own layer. A bad `JINI_ALLOWED_ORIGINS` value throws on every request.
    Candidate: validate at startup instead.
13. **5 Jini packages with zero real importers** — `artifacts`, `capability-providers`,
    `diagnostics`, `registry`, `vibecoding` (1.3k-4.1k LOC each). **Owner says leave them** — future
    work, not dead weight.
14. **40 failing tests in Jini `model-proxy.test.ts`** making real calls to live provider APIs (one
    returns a genuine "API key is invalid" 401). Proven pre-existing by stash-and-diff. **Owner is
    aware and fine with it.**

---

## 7. Not verified — do not claim these work

- **The autofill fix (`fc64f2d9`) is UNPROVEN.** The first attempt (`dcc23788`, `autoComplete="off"`)
  **did not work** — the owner reconfirmed the search box still fills with "admin". Chrome has
  ignored `autocomplete="off"` on credential-shaped fields since ~2014, by design. The second fix
  uses `autoComplete="new-password"` (the value browsers *do* honour) on **all four** credential
  inputs, because the trigger was never the search box: `TokenRow` renders `ExistingTokenFields`
  unconditionally, so every saved token leaves a live `type="password"` input in the DOM even when
  collapsed, and Chrome's formless heuristic groups text fields with nearby password fields — no
  `<form>` needed, and there is none in that feature.
  **This cannot be tested in automation** — Playwright's Chromium has no saved credentials, so
  autofill never fires. **Only the owner's real browser can confirm it.** If it still fails, the
  next approach is unmounting the collapsed password fields; after that it is hacks
  (`readonly`-until-focus, randomised `name`).
  Known side effect: Chrome may now offer to *generate* a password on those fields.
- **Sol's architecture verdict is unknown** — dispatched, ran, never completed. See §5b.
- **`installGracefulShutdown` has no caller** — see §6.5. Do not read `9817562c` as "SIGTERM fixed".
- **Jini Fix #2 (CI) and Fix #3 (fetch timeouts) were not started.**
- **Vendor-credentials Phase 2 state is unknown at time of writing** — verify against git.

---

## 8. Operational lessons — these cost real time today

- **`autocomplete="off"` does not work.** Chrome deliberately ignores it on credential fields.
  `new-password` is the value it honours. Cost: one full failed fix and a round trip with the owner.
- **`SendMessage` DID work this session** — contradicting the previous handoff. Several agents acted
  on mid-flight scope changes. Do not assume it is broken; do still put everything critical in the
  spawn prompt.
- **Agents go idle without reporting, and idle ≠ dead.** The Coordinator declared `publish-e2e`
  "looks dead" while it was mid-run, and separately reported "no publish landed" three times while
  checking the wrong branch. **Check the evidence, and check the right evidence.**
- **A grep that misses is indistinguishable from a fact.** Three wrong claims this session came from
  bad greps: "Jini has no architecture gates" (missed `guard` because the regex was
  `arch|check|lint|dep|boundar`), "no `type="password"` in Jini's UI" (missed
  `type={revealKey ? 'text' : 'password'}`), and "the permission rule isn't saved" (`jq` is not
  installed, so the check silently found nothing). **Verify a negative before reporting it.**
- **`jq` is NOT installed on this machine.** Commands using it exit 127 and can look like an empty
  result when piped.
- **macOS has no `timeout(1)`.** Wrapping a command in it fails with exit 127.
- **An agent cannot edit `.claude/settings.json`** — the auto-mode classifier correctly blocks
  self-granted permissions. The owner had to add the Playwright rule from a **second Claude session**
  because `/permissions` was unnavigable in the running one. Filed upstream:
  **https://github.com/anthropics/claude-code/issues/87224** (a fresh session's `/permissions`
  works; a long-running one's does not — the trigger is accumulated session state).
- **Claude Code is 12 versions behind** — 2.1.221 installed vs 2.1.233 current.

## 9. Worth keeping — what went well

Agents corrected the Coordinator on real errors, repeatedly and correctly: `static-site-verify`
rejected a stale "you have zero commits" claim; `jini-async-sweep` corrected an over-scoped brief by
finding that 79 routes are already safe *by construction* via a `mountJsonRoute` adapter, narrowing
the real surface to 9 hand-mounted routes of which only 2 were broken; `jini-boundaries` found the
`pnpm guard` script the Coordinator had claimed did not exist; `arch-regression` proved causation
with two worktrees instead of inferring it. Several proved their own tests RED before fixing, and
one caught that unit-testing a helper by importing its script would have run `main()` against the
real `infra/content.db` on every test run.
