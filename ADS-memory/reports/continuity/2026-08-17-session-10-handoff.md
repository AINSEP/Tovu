# Session 10 handoff — 2026-08-17 (early morning)

**Everything marked ✅ VERIFIED was re-run independently by the Coordinator, not taken from an
agent's report. ⚠️ UNVERIFIED was not.**

**Repo state: Tovu `general-work`, 37+ commits this session, all pushed. Jini `general-work` pushed;
Jini `main` moved once (lockfile only, owner-authorized).**

---

## 0. The headline: CI works. That was the whole point of the night.

**✅ VERIFIED by the Coordinator reading GitHub's own API on run `31996680254`, not an agent report:**

    Clone Jini (sibling dependency): success
    Run pnpm/action-setup@v4:         success
    Build Jini (pnpm -r run build):   success     ← flagged UNPROVEN for weeks, never once reached
    Install root dependencies:        success     ← npm ci resolving all 13 file:../Jini/packages/*

Both blockers that had failed **every run on `main` since 2026-08-04** are dead.

**Two real bugs, not one.** `af5af566` (Coordinator) replaced the `actions/checkout` Jini step with a
plain `git clone` in a `run:` step — `actions/checkout` hard-refuses any `path:` outside
`$GITHUB_WORKSPACE`, so `path: ../Jini` could never work. That was necessary but **not sufficient**:
`ci-pipeline` then found `pnpm/action-setup@v4` with no `version:` input defaults to reading
`packageManager` from `$GITHUB_WORKSPACE/package.json` — **Tovu's** root, which uses npm and has no
such field. Traced through the action's own `dist/index.js` to confirm `package_json_file` is a plain
`path.join` + `readFileSync` with no containment check, so `package_json_file: ../Jini/package.json`
is legal. Fixed in both jobs (`192e484a`).

**Jini's own CI: first green run in its history** — `31996459339`, 4m31s. `guard:drift`, `typecheck`,
`complexity` all executed against `general-work` for the first time and passed. Its triggers had the
identical never-ran `push: branches: [main]` bug (`9807c196`).

### ⚠️ The one thing NOT proven, stated plainly
**No full Tovu run has completed end-to-end.** With 8 agents pushing ~1 commit/45s,
`cancel-in-progress` cancelled every run before `Typecheck` / `Test` / the architecture and coverage
gates finished. Those gates are wired and their scripts verified present — **but no run has executed
them.** The concurrency config was deliberately NOT weakened to force a green; that would be gaming
the gate. **Push once to a quiet branch next session and read the result.**

---

## 1. Jini Publish — diagnosed, fixed, and the remainder is an owner decision

Failing **every run since 2026-07-31** (5 consecutive, 16s each). Nobody had read the log.

**Root cause: stale `pnpm-lock.yaml` on `main`.** Six deps were removed from
`packages/ui/package.json` and the lockfile never regenerated, so `pnpm install --frozen-lockfile`
hard-fails. Reproduced in an isolated worktree, regenerated (clean: +2/−573, only the orphans, no
version bumps). **Owner authorized the push; the Coordinator pushed it** — ✅ VERIFIED
`refs/heads/main = 704077ab`.

**It worked: 16s → 1m20s, install now passes.** The failure moved to the next step.

**The new failure needs NO fix.** `packages/renderers-react` fails resolving `@jini-ai/chat`.
`ci-pipeline` root-caused it as a genuine **circular `workspace:*` dependency** between `chat` and
`renderers-react` (pnpm cannot topologically order a cycle; pnpm has warned about it in its own
install output since 2026-08-09, visible in the original logs nobody read).

**✅ VERIFIED: `packages/renderers-react` does not exist on `general-work`** — `git ls-tree` on both
refs. It was folded into `packages/ui` on 2026-08-09, and `main` is frozen immediately before that.
**Publish is failing on a package that no longer exists in the project.** Do not debug it.

> ⛔ **OWNER DECISION: `main` is 25+ commits stale and cannot build. That staleness is now the only
> thing wrong with Publish.** Reconciling `main` with `general-work` is a real decision (Publish's
> trigger gates an actual `npm publish` once `NPM_TOKEN` exists) and is NOT urgent.

✅ VERIFIED separately: **`general-work`'s lockfile is NOT stale** — a fresh
`pnpm install --frozen-lockfile` against a clean worktree passed. The problem was only ever on `main`.

---

## 2. What shipped

### Assistant self-healing — COMPLETE, the loop actually closes
`019e50f1`, `6b4f3d35`, `0dbda781`, `f854e011`, `88e061c3`, `26011c9b`

`respondIfDaemonKnownFailed()` now fires `ensureAssistantDaemonStarted()` on every known-failed 503,
fire-and-forget — the request still 503s immediately; recovery is a background effect.

**✅ VERIFIED by the Coordinator reading source, because the obvious doubt was whether this covers a
*crash* or only a failed boot:** `daemon-supervisor.ts` calls `recordAssistantDaemonFailure` at lines
194, 207 and 230 — **including the crash-loop give-up path at :207** — and `clearAssistantDaemonFailure()`
at :214 runs at the start of every attempt. So the chain closes: crash → supervisor retries → gives up
→ latches → next request triggers recovery → next attempt clears the latch. **Wiring it at the 503
branch was better than the brief's instruction to wire it deeper.**

Plus: `POST .../system/assistant-daemon/restart` (`system.write`-gated, relays `{ok,reason}` verbatim,
**never claims health** — no health signal exists in this path), and a "Restart assistant" /
"Check status" button on the AI Assistant admin screen.

**Also fixed, found by the Coordinator:** the 503 body said *"the agent daemon failed to start for
this boot"* / `AGENT_DAEMON_BOOT_FAILED`. That became untrue the moment the crash-loop path could set
the same flag. Now `AGENT_DAEMON_KNOWN_FAILED` + the real latched `reasonCode` — **the code was
changed too, not just the message, because the code encoded the same wrong claim.** Grepped for
consumers first; only this repo's own tests referenced it.

**⚠️ Known rough edge:** after clicking Restart, the status check is a **single read, not a poll** —
an operator looking immediately still sees "known failed" for a few seconds and must press Check
status again. Deliberate (no principled "waited long enough" without a health signal), flagged for a
UX pass.

### Architecture — Sol's steps 4 and 5 done
`2f73732b`, `c9747f16`

| Metric | Before | After |
|---|---:|---:|
| largest SCC (runtime-only) | 36 | **30** |
| back-edges into composition root | 27 | **15** |
| core size | 16.79% | **16.49%** |
| propagation (all-import / runtime-only) | 10.58% | 10.51% / **2.31%** |
| module API surface | 204 | 208 ⚠️ **disclosed regression** |

✅ VERIFIED at HEAD by the Coordinator. **The agent disclosed the API-surface regression unprompted,
traced it, and flagged that "module cycles 13 → 6" is partly a metric-identity change rather than a
pure improvement.** That is the exact behavior whose absence was last session's one real miss.

**The metric split is the durable win:** type-only vs runtime edges (via dependency-cruiser's own
`dependencyTypes`), and `src/index.ts` / `cli/**` reclassified as legitimate outer callers rather
than violations. **It changed a decision within the hour — see §4.**

### Vendor-credential agent-tool cutover — COMPLETE
`7dc7cae9`, `c3271a02`

Both cutover points done. `deployment_get_static_publish_capabilities` dual-reads (new table first,
legacy fallback per-provider) **implemented at the non-decrypting list level, NOT via `dual-read.ts`'s
resolve function — which decrypts and would have silently broken this tool's own tested "never
decrypts" guarantee.** `tokenTail` added, and the *"NEVER a token, ciphertext, or masked tail"*
contract text rewritten **in the same commit**, as required.
`deployment_propose_custom_provider_credential` now writes through `vendor-credentials/store.ts`.

**Interaction bug caught before shipping:** without merging `credentialConfigured` off the new table
too, a credential saved via the second tool would appear in `savedCredentials` while
`credentialConfigured` still read `false` — self-contradictory.

**⚠️ Left for the owner:** the permission string stayed `deployments.credentials.write` rather than
being renamed to `vendor-credentials.write`. Used nowhere else in the repo, but the agent had no
visibility into live RBAC grants and correctly refused to rename unilaterally.

### Route quality — a proven negative
`7f8781e1`, `8d88e71c`, `95f0fff5`, `0fc57da3`

**The `sendStoreError` sweep found NOTHING, and that is the valuable result.** AST-scanned `src/` with
ts-morph (not grep) through three tightened passes; 9 survivors, all read by hand, all false
positives in two recurring shapes (inner rethrow to a fully-guarded outer catch; guard-clause throw
caught by the same function's own catch ending in a 500). Cross-checked every other
`send*Error`/`handle*Error` by name. **`sendStoreError` really was unique.**

Also: `test-agent.ts` genuinely untested → extracted a pure `resolveTestAgentOutcome()` and covered it
(8 tests); marker-type literals hoisted into `core/embeds/marker.ts`.

### Complexity gate for `src/`
`025eba91`, `d75ef36f` — `check:src-complexity-drift`, baseline 115 violations / 72 files, 9 unit
tests. **Multiset diff, not a Set** — proven necessary with real data (`admin/widgets/agent-tools.ts`
has two textually-identical violations). **Scoped to `src/server/routes/**` only, not all of `src/`**
— every number in the brief came from an audit that only measured route files.

### Source-control UI
`f23f2d3b`, `5e136004`, `6f0c707c`, reports through `c5b10001`

"Create access token" cross-links on both Static Site and Providers tabs, live-verified in real
Chrome. Complexity-17 violation fixed (six named helpers composed by spread).

**Most of the redesign was already built** — `b440a007` had already shipped *"one list, all 8
credential stores + category filter"*. ✅ VERIFIED by the Coordinator.

---

## 3. ⛔ Open decisions for the owner

| # | Decision | Notes |
|---|---|---|
| A | **Users → New user autofill** — still unverified | Only a real browser can test it. Playwright's Chromium has no saved passwords. **Two sessions old.** |
| B | **Remove the Static Site token field?** | **Now known SAFE.** Security's Access Tokens tab does full CRUD on the *same* `publish_credential_sets` rows; the publish path reads them server-side. Nobody is stranded. And `StaticSiteTab.tsx:1188` already implements the replacement picker — **removal is pure deletion, not a build.** Owner said "wait" under an earlier, wrong premise (Coordinator error, §5). |
| C | **Reconcile Jini `main` with `general-work`?** | §1. Not urgent. |
| D | **Rename `deployments.credentials.write` → `vendor-credentials.write`?** | §2. Needs RBAC-grant visibility. |

---

## 4. What's left

1. **Get one clean CI run.** The only unproven piece. Push to a quiet branch and read it.
2. **`check:architecture` is RED**, 2 metrics, from the vendor cutover:
   `features/deployments <-> features/vendor-credentials`. `routedeps-vendor` was mid-fix at session
   end (`publish-agent-tools.ts` uncommitted). **The fix is injection, not import** — and note the
   gap `arch-scc-cuts` caught: `PUBLISH_PROVIDER_TO_VENDOR` at `publish-agent-tools.ts:116` is a plain
   **value** constant in the same import statement, so injecting only the three *functions* leaves the
   edge and the cycle intact. **If it can't be fixed, baseline it WITH the justification written down**
   (the cycle is temporary by design — dual-read's legacy fallback is documented for deletion "once
   every install is confirmed migrated"). Never silently.
3. **The GitHub repo-list endpoint is half-built.** `route-quality` shipped the route adapter
   (`0fc57da3`) with `listGitHubReposByCredentialId` as a **temporary stub that throws
   unconditionally**, clearly marked for deletion. `routedeps-vendor` owns the real probe. Swap the
   stub and update the one test asserting the stub's 500.
4. **Phase 4 (admin UI → vendor-keyed table) is scoped but NOT started.** See
   `2026-08-17-source-control-ui.md` for a verified file manifest. **It is NOT a rename** — the vendor
   model carries Vercel `teamId`, Netlify `siteId`, and an entire 5-field `s3-compatible` form that
   has never existed in this admin; `tokenTail` has no UI home; `lib/api.ts` has zero
   `*VendorCredential*` methods. **Do not ship it before backfill/dual-read is proven** — the real
   `infra/content.db` has zero `vendor_credential_sets` rows, so the owner's working credential would
   read "not configured."
5. **Mutation testing** — dispatched to `route-quality` at session end, status unknown.
6. **Jini browser-bundled fetch sites** — `jini-hardening`'s status was unconfirmed at session end.
   Evidence its Task A landed: Jini's green run was on *"feat(platform): add browser-safe
   fetch-with-timeout subpath export"* — which reads like the right answer (a browser-safe subpath
   rather than polluting the bundle), but **⚠️ UNVERIFIED**. Its Tasks B (`configuredAllowedOrigins`
   throws on malformed `JINI_ALLOWED_ORIGINS`) and C (SIGTERM callers) are unconfirmed.
7. **~~Recover the 8% core-size slice~~ — DECLINED, do not re-propose.** See §5.

---

## 5. Findings that change how you read older docs

**The export↔server cycle was a MEASUREMENT ARTIFACT.** `export/route-manifest.ts:7` and
`site-exporter.ts:29` import `RouteDeps` as `import type` — zero circular-load risk. `deps.ts:891`
and `app.ts:687` have a real `require()` back. Under the OLD all-import graph both counted → a mutual
cycle. Under the runtime-only graph it **is not a cycle at all**. So the stated motivation for
extracting `createApp` is gone; what remained was ~0.7pp of a ratchet-tier metric against surgery on
the two busiest files in the repo. **Declined with evidence.**

Related and reusable: **dependency-cruiser statically resolves a lazy `require()`.** The
`app.ts`/`deps.ts` comment is correct that the lazy require avoids a Node CJS boot crash, but
**silently over-generalizes to "removes the edge from static analysis."** It does not. That is a
second independent instance of this repo's evidence-shaped-comment pattern.

**Test files in `src/` are NOT typechecked.** `tsconfig.json` excludes `**/__tests__/**` and
`**/*.test.ts`. A test file with genuinely invalid TypeScript
(`for (const config: StaticPublishConfig of ...)` at `static-publish/__tests__/adapter.unit.test.ts:208`)
sits in the tree right now **passing all 15 of its tests**, because tsx/esbuild strips annotations
without validating them. ✅ VERIFIED both ways by the Coordinator. Low severity, zero visibility.

**`RouteDeps` narrowing in feature tools is BLOCKED by TypeScript contravariance** — not by effort.
`routedeps-vendor` re-derived the argument from first principles rather than trusting the existing
comment that said so, and it holds. `DeploymentsToolDeps = RouteDeps` and each file threads
`routeDeps` into `exportSite()`, which genuinely needs the full bag. **Sol's step 3 is at its safe
ceiling.** Surface-exchange relocation is narrowable in principle but hits the identical trap; measured
payoff was 2 of 13 cycle pairs and zero SCC/propagation change.

---

## 6. Coordinator errors this session, logged

1. **Told the owner removing the Static Site token field risked stranding their credential.** False —
   Security's tab does CRUD on the same rows. The owner made decision B on a wrong premise; it should
   be re-offered.
2. **Omitted `apps/admin/src/features/source-control/**` from the source-control agent's owned-files
   list** — on a task literally named "the source-control page redesign." The agent worked around a
   gap that shouldn't have existed.
3. **Said "inject the four functions"** to break the module cycle. Three are functions; the fourth is
   a plain value constant. `arch-scc-cuts` caught it. Injecting only the callables would have left the
   cycle intact after work that *looked* complete.
4. **Diagnosed the Publish build failure as a parallel-build race.** It is a genuine circular
   `workspace:*` dependency. `ci-pipeline`'s diagnosis superseded mine.
5. **Sent a "commit now, work at risk" nudge that had already been acted on** — the agent had
   committed before my check ran. Stale alarm.

---

## 7. Operational notes

- **8 agents in one checkout worked**, with the git rules in every spawn prompt. One `git stash`
  incident, self-reported within seconds and popped; ✅ VERIFIED nothing lost, including the owner's
  own uncommitted `index.html` edit. **Self-reporting is what made it a non-event.**
- **`cancel-in-progress` + 8 agents = no CI run ever finishes.** Not a config bug; the branch was
  simply too hot. Do not weaken it to force a green.
- **The Coordinator caught a live `tsc` break** (`#src/assistant` — the imports map is `"#src/*":
  "./src/*.ts"` with no directory fallback, so a barrel needs `#src/assistant/index`). A green test
  run is NOT evidence an import resolves; tsx strips types without resolving them. **Run `tsc`
  explicitly.**
- **Stray processes cleaned at session end**: 63 → 35 node processes. Three zombie vite servers
  (5797/5798/5799, ports confirmed released), one test hung 30 minutes, and strays 6–8 days old.

## 8. Where to be most skeptical

- **No full Tovu CI run has completed.** Everything past `Install root dependencies` is wired but
  unexecuted.
- **Nothing in Jini was independently re-run by the Coordinator**, and `jini-hardening`'s report was
  not received before session end.
- **The autofill fix remains unproven after two sessions.**
- **`check:architecture` was RED at session end.**
- **The repo-list endpoint's GitHub call is a stub that throws.** Do not read the route's passing
  tests as evidence the feature works.
