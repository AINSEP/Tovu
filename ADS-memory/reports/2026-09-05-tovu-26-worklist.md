# tovu-26 Worklist — live, authoritative

**Owner:** session `tovu-26` (pid 58410), branch `restructure/apps-website-phased`.
**Inherited from:** `tovu-07` (pid 70980) on 2026-09-05 ~15:10, full handoff in two cross-session
messages. `tovu-07` stood down all three of its subagents at Leona's direction; they committed
nothing.

This file is the single place work is tracked. Update status in place. Do not let an item leave
this file without a resolution line.

---

## Status legend

`TODO` not started · `WIP` in flight (name the agent) · `BLOCKED` needs Leona · `DONE` finished + verified · `DROPPED` with a reason

---

## A. Live / immediate

| # | Item | Status | Notes |
|---|---|---|---|
| A1 | Restart dev server | **DONE** | 15:14. API :3000, admin :5173, daemon :57085, "agent daemon reachable after 6.3s". Logs to `development/.dev-server.log`. |
| A2 | Commit the dirty test work | **DONE** | `cdba286b`. `newsletter-routes.test.ts` verified 5/5 unchanged. `settings-workspace-scoping.test.ts` 8/9 -> 13/13: the malformed `saveDefinition({definition:{...}})` call replaced with seed-through-the-real-route + `findActiveDefinition` + re-save `status: "tombstone"`. Port shape independently re-confirmed against `Jini/packages/cms/src/settings/{ports,types}.ts`; `coercionTag` is also required and no `tombstonedAt` field exists. SQLite adapter upserts by `(settingId, version)` so the status flip is safe. **No production code touched. MenuEditor untouched, verified still dirty.** |
| A3 | Desktop app "didn't run" (§6a) | **DIAGNOSED — fix TODO** | Leona saw "a folder, like a Mac folder, nothing else" = the native site-dir picker. Confirmed `sites/tovu-com/config.json` does not exist, so `tovu serve` exits 3 `SITE_DIR_INVALID` and resolution falls through to the picker; Electron then exits 0. |
| A4 | Daemon-token bug | **TODO** | `apps/website/src/index.ts:292` calls `ensureAgentDaemonToken()`; nothing under `apps/website/src/cli/` does. `tovu serve` boots with a silently dead assistant — `daemon-auth.ts` is fail-closed, daemon answers 503, nothing names the cause. Fix in `serve.ts`, preserving an operator-set value. Then diff the two boot sequences for other initializers `serve.ts` skips. |

## B. Queued

| # | Item | Status | Notes |
|---|---|---|---|
| B1 | Dev server crash (§6b) | TODO | Died twice today. Log frozen at 14:24:43 on a *successful* bind. Zero shutdown messages in 212 KB, no crash report, no jetsam. Rules out app crash + OOM; leaves an unhandled external signal (SIGHUP from a vanishing process group, or a deliberate SIGTERM). Now logging to `development/.dev-server.log` so the next death leaves evidence. |
| B2 | ~31 untriaged Gemini findings | TODO | `ADS-memory/reports/2026-09-05-gemini-audit-admin-tooling.md`. Triage only. Verify each against the current tree first — a long list is already fixed (`44adffff`, `787e841b`, `49088969`, `e651317f`, `3f834944`, `974c2072`, `4db3229c`, `5c379ac0`, `f06e499a`, `03936c90`, `6ee9452a`, the `theme-files.ts`/`structure.ts` symlink family, `9088f5f1`, `f6458bb7`, and the 7 MEDIUMs). |
| B3 | Features coverage | TODO | `apps/website/src/features/**`, never measured, largest unmeasured surface. **Leona's constraint: two features at a time, strictly serial, ONE test invocation at a time.** Put the constraint in the spawn prompt. |
| B4 | Orphan reconciliation | TODO | ~60-80 lines net in `apps/website/**`. Needs a unique marker arg on the daemon spawn first (argv is identical for every instance). Seam: `daemon-supervisor.ts:247` `killCurrentChild()`. Lower priority — `agent-daemon-server.ts:188`'s parent watchdog already covers the catastrophic path. |
| B5 | Desktop phases 4+ | BLOCKED (B6) | Packaging deferred: 227 MB dmg, ~20 min builds, needs Developer ID + notarization. `playwright` is a runtime `dependency`, so if site-evidence is reachable in desktop mode packaging grows by Playwright + a browser. |

## C. BLOCKED — needs Leona

The complete unanswered set, from `tovu-07`'s gap-check. Do not let one drop.

| # | Question | History | Why it blocks |
|---|---|---|---|
| C1 | Are the 200 uncommitted lines in `settings-workspace-scoping.test.ts` yours? | Asked **3x**, never answered | Attribution on A2. Proceeding on the assumption they are keepable work. |
| ~~C2~~ | ~~Do you run several sites at once?~~ | **ANSWERED 2026-09-05** | *"We're gonna need to run several sites at once. Imagine a web designer and web developer wanting multiple sites for clients."* **Multi-site is the product, not a Runner leftover.** See §H — this reverses the desktop port plan. |
| C3 | Route files short of 100% — `agent-tools.ts` (3 branches), `media-rendition.ts` (2) | Not yet | **ASK before starting.** Under her rule a shortfall means refactor and she wants a say. Same for `apps/admin` coverage beyond `api.ts`. |
| C4 | `MenuEditor.tsx` + untracked `MenuEditor.hooks.tsx` — commit them? | Not yet | Her own in-flight work. Looks like a finished hooks extraction. Not touching without a yes. |
| C5 | Delete `apps/admin/coverage-lib-audit/`? | Asked, unanswered | Untracked, Sep 4 17:13, no scope, claims 56-61%. Traced and rejected as a partial run. Poison. `tovu-30` declined to remove another session's artifact. |
| C6 | Make `check-governance-adr-scope-drift.ts` runnable in CI, or leave it an honest no-op? | Asked, unanswered | Making it runnable means tracking those ADRs in git, overturning the deliberate workspace-is-local-only gitignore. Ruling (b) is what's implemented — it reports SKIPPED/UNVERIFIED, not "ok". |
| C7 | Are the three `eslint-disable`'d `boundT` siblings still worth their tradeoff? | Asked, unanswered | `use-recovery.hooks.ts`, `use-members.hooks.ts`, `use-restore-points-section.hooks.ts` all carry an unmemoized `boundT`, deliberately omit `t`/`locale` from dep arrays with explicit disables, accepting a stale-closure-on-locale-change bug. The memoized shape is now proven twice (`use-access-tokens`, `use-sites.hooks.ts:209`), so the disables may be obsolete. |
| C8 | Which site-duplication pieces to build? | Asked, unanswered | (a) wire `createSite`/`listSites` as an assistant tool domain — small, 15+ existing patterns; (b) `duplicateSite()` copying DB + uploads + theme — **new code, exists at no layer**; (c) a theme-activate tool. `tovu-07` recommended all three in that order. |
| C9 | Is "System" appearance going light on a dark OS a fix or a loss? | Asked, unanswered | The product question under the two-repo dark-mode fix (§F1). Moot while Zana's migration is halted. |

Answered already — **do not re-ask**: `--fg-1` is an alias of `--fg`; vitest/npx are fine again; `features/*` before `apps/admin`; the token package is approved; two features at a time, serial; port the desktop app so `Tovu-Runner` can be deleted.

## D. Untracked leftovers to keep or delete

- `apps/website/src/features/presentation/__tests__/` — partial, from a stood-down coverage agent
- `apps/website/src/features/workspace/__tests__/` — same
- `ADS-memory/reports/2026-09-05-coverage-task-list.md` — written by `tovu-07`, **every entry deliberately marked UNVERIFIED**
- `development/scripts/check-jini-registry-drift.mjs`
- `apps/admin/coverage-lib-audit/` — see C5
- `apps/website/sites/`, new blob dirs under `sites/tovu-com/uploads/`

## E. Closed / do not re-walk

- **`publish-credentials.ts` branch 5** — `if (!result)` in GET `.../:id/repos`. Genuinely unreachable: `listGitHubReposByCredentialId` is a private closure stub that throws unconditionally, no seam. Resolves free when routedeps-vendor lands. **Do not build a harness.**
- The 92.75 / 87.70 / 86.19 route numbers — **not reproducible**, lcov died with a subagent's scratch dir, and measured over 170 test files against a 238-file denominator. Different sets. Discard.

---

## Traps inherited from `tovu-07` (cost real time today)

1. **Symbol grep NEVER proves coverage.** Five confident claims died on this today. Assume the coverage-task-list items 6-11 are wrong the same way until checked.
2. **`grep` here is ugrep.** A `--` before the pattern turns later `--include`/`--exclude-dir` into FILE operands (warns on stderr, searches unfiltered). Searching `apps`/`packages` also reaches `dist/`, `dist-debug/`, `.vite/`, `coverage/`. Use `find ... -not -path '*/dist*/*'` piped to `xargs grep`; plain `dist` misses `dist-debug`. `\s` does not work in macOS `grep -E`.
3. **BRDA positions are unstable under tsx.** A branch total drifted 69→67 with a flat hit count; a hit count *decreased* across identical superset runs. Adding a passing suite cannot remove branches — if you see that, stop. Never average or adjust.
4. **Machine cap ~3 test-running agents across ALL sessions.** Box crashed today at load 721, swap 6.4 GB of 8. `npm run test:cov` and full-repo `tsc --noEmit` both OOM it. Any number measured during a load spike is **void** — discard and re-measure, never adjust.
5. **Two vitest coverage runs share `apps/admin/coverage/.tmp`** and clobber each other; presents as `Something removed the coverage directory`. Pass your own `--coverage.reportsDirectory`.
6. **`env -u TOVU_ADMIN_PASSWORD` must be UNSET, not empty**, or admin tests 401 in setup. `apps/website` tests run from the **repo root** (fixtures use `process.cwd()`). Dropping `--test` spins node at 99% forever.
7. **Never delete a branch to raise coverage.** Delete only if unreachability is provable locally; if it rests on a framework/protocol contract, KEEP and test by direct invocation. Worked example: `publish-credentials-route.test.ts`, `fd697555`.
8. **Attribute a process by the `cc-socks/<pid>.sock` filename, never by start time.** Three misattributions in one hour today.
9. **Port 3000 is HTTPS** — probe `curl -sk https://localhost:3000/`; plain http returns `000` on a healthy server. Restart by SIGTERM-ing the `dev.mjs` orchestrator, never child PIDs.
10. **Gemini's residual failure mode** in the audit reports: citing real code accurately but mischaracterizing what it proves. Only caught by tracing call chains, not by confirming cited lines exist.
11. **Keep replies to Leona SHORT.** A few plain lines. No status dumps, no commit lists.
12. Leona confirmed **vitest and npx are fine again**, superseding an earlier ban you may hear relayed.
13. **A permission guardrail in the previous session blocked agents from temporarily mutating production source to prove RED.** Expect agents to hit it on "prove the guard actually guards" work and fall back to reasoning. Brief them on it before asking for RED-first.
14. **Watch for the coverage-by-deletion diff shape.** A `tovu-30` agent tried to raise coverage on `widgets/agent-tools.ts` by deleting a guard — `config: typeof body.config === "object" && body.config !== null ? ... : {}` reduced to a bare cast on an admin HTTP body nothing else validates. Caught uncommitted.

---

## H. MULTI-SITE IS THE PRODUCT — reverses the desktop port plan

Leona, 2026-09-05: *"We're gonna need to run several sites at once. Imagine a web designer and web developer wanting multiple sites for clients. This should be able to do that."*

The desktop plan's core recommendation was "the shell moves in, the fleet stays out." **That is now wrong.** Consequences:

- **~7,200 previously-excluded lines are back IN SCOPE**: `project-registry` (310), `project-provisioner` (884), fleet chat/store/IPC (~1,950), renderer (~3,300), contracts (~800).
- **Orphan reconciliation (B4) stops being optional and moves onto the critical path.** The skip argument — "Tovu has one in-memory child that reaps itself via `agent-daemon-server.ts:188`'s `startParentWatchdog`" — **only holds for the single-site case.** With N persisted projects nothing covers each one. Runner's pid-identity proof before killing a recycled pid, SIGTERM-then-SIGKILL, and crash/OOM/power-loss reconciliation are all load-bearing for a fleet.
- **The identity-proof blocker is now critical-path.** Runner proves identity by matching argv against a uuid-bearing `installDir` plus `--port N`. **Tovu's daemon argv is identical for every instance on the box** (`<execPath> <…>/agent-daemon-server.js`), so an argv proof cannot work as spawned. Either add a unique marker argument to the daemon spawn, or identify via `lsof` on the known port (Runner's own fallback). **That change lands in `apps/website/**`.**
- **Re-derive the MRU storage choice.** Phase 3 picked a JSON file in `userData` over Runner's SQLite registry because "a single-site shell has no registry DB." **That reasoning is void.** Runner's `RunnerProjectRow` carries `last_pid`, `installDir` and `port` — exactly the fields reconciliation needs.
- **Packaging (B5) becomes real, not deferred.** A multi-site product is one people install: 227 MB dmg, 425 MB staged, 772 MB unpacked, ~20 min builds, Developer ID + notarization. `playwright` is a runtime `dependency` (`features/site-evidence/playwright-browser.ts`), so if site-evidence is reachable, packaging grows by Playwright plus a browser.
- **`Tovu-Runner` cannot be deleted until the fleet is ported.** Deletion is much further out than "after you verify the shell works." Leona framed it as near-term.
- **The three do-not-port rulings STAND, unaffected**: the in-process Jini daemon (contradicts Tovu's detached-by-design supervisor; the failure is silent), the keychain vault (no AAD binding, into a repo with a `check:seal-aad` gate), and the second MCP surface. Fleet supervision does not require Runner's daemon architecture.

**To put to Leona (C10):** re-adding the shell reverses a deletion, but dragging the supervisor back **re-litigates the repo split**. The pre-split repo had a 60-line `web/apps/desktop`; the split deleted it and grew Runner into a supervisor. Confirm she is deliberately reversing that split, not only answering a usage question. Full argument: `ADS-memory/reports/2026-09-05-desktop-app-port-plan.md`.

---

## F. Intel in no report and no commit (from `tovu-07`'s gap-check)

### F1. Dark mode / design tokens — a two-repo fix, cannot land as one CSS edit
- `@jini-ai/ui`'s `tabbed-dialog.css:70-71` ships an **ungated** `@media (prefers-color-scheme: dark)` that is **LOAD-BEARING**: Tovu's "System" appearance works *because* it falls through to that query. Gating it makes "System" render light on a dark OS — a regression to a shipped control, not a cleanup. *(Half-proven — measured by `zana-c8` in two same-origin iframes; not re-run.)*
- Correct sequence: widen `AppearanceTheme` (typed `'light' | 'dark'`) to include `'system'` and actually stamp it, **then** gate `tabbed-dialog.css:70`, **then** change `resolveDialogDataTheme`. **Steps 1 and 2 must land together** or Settings regresses.
- `apps/admin/src/features/settings/rules.ts:349` returns `undefined` for `"system"` — it removes the attribute deliberately. `@jini-ai/ui`'s `AppearanceTab.tsx:61` and `utils/appearance.ts:39-41` do the same. **No code path in the Jini stack can emit `data-theme="system"`**, so `tokens.css`'s new `[data-theme='system']` gate is dead code.
- Bare-`var()` scan: **61 properties in the deletion range, 55 referenced with no fallback, ~1,400 call sites; only 10 written defensively.** Largest: `--border` (119), `--surface-2` (87), `--space-3` (86), `--muted` (83), `--fg-2` (82). All 55 resolved post-migration in both OS schemes. Lives in `Zana/ADS-project-knowledge/.local-artifacts/zana-gap-analysis-2026-09-04/09-design-token-package.md` §7 — **outside this repo**, so it appears in no Tovu report. **Caveat: §7.5 may still contain the WRONG ugrep mechanism** ("`--include` silently ignored") alongside the corrected one; a correction was sent but may not have landed.
- `--ok-solid` / `--ok-solid-ink` are **empty in light mode today**, so 7 call sites silently ride a `var(--ok-solid, var(--ok))` fallback. A static resolver cannot see this by construction. Same shape as `--fg-1`.

### F2. Cross-repo port drift (unverified by `tovu-07`)
- `@jini-ai/admin`'s package-level `MembersPort` has **already drifted** from `apps/admin`'s local one (`lib/api.ts:1024`): the local has an extra required `workspaceId` and wraps returns in `{member}`/`{members}` envelopes; the package returns bare. Zana needed a translation shim for a screen admin itself owns. **"Wire up the ports" is not a mechanical job today.**
- `NavTargetKind`'s `entryRef`/`termRef` in `@jini-ai/admin/core/ports/menus.ts` is Tovu vocabulary sitting in a neutral port. Its own doc names "a second host" as the generalization trigger — Zana is now that host.
- Jini's `pnpm-lock.yaml` is uncommitted and bundles a better-sqlite3 11→13 upgrade with `vibecoding` test deps. `zana-fb` owns committing it.

### F3. Corrections and small debts
- **`MediaRenditionRouteDeps`'s doc is FALSE.** It claims the admin composer needs draft assets reachable on the public `/m/` route. Measured false — the composer previews via `api.mediaOriginalUrl`, the authenticated admin route. Worth correcting.
- **Three copies of `collectImageAssetIds`**: `media-rendition.ts` (~line 70), `pages.ts:881`, `widgets/resolver-service.ts:679`. Plausibly why the media gate drifted out of sync with how content is actually embedded. **No consolidation verdict was ever reached.**
- **SEO/OG share cards are anonymously reachable BY DESIGN.** `seo/media.ts:buildSeoImageUrl` emits `/m/{assetId}/...` URLs fetched by crawlers, referenced by no entry body. **This is why the media gate was not flipped blanket-fail-closed.** Standing design question — do not "fix" without a ruling.
- `deps.ts:27` has a stale cross-reference to `app.ts`'s old name.
- `development/scripts/dev.mjs`'s `main()` is **complexity 11**, before and after today. `.mjs` is not under the complexity gate at all (the sonarjs block is scoped to `.ts`/`.tsx`), so nothing catches it.
- `features/identity/builtin-role-grants.ts` was the **only** thing making the complexity gate red — **now FIXED** by `ab051e61`, a real refactor, not baselining. Gate is `0 new (4 total, 4 in baseline)`, rc=0. Earlier briefs calling it red are stale.
- Electron is `apps/desktop/node_modules/electron`, **299 MB**, devDependency. Only other copy is `Tovu-Runner/node_modules/electron`; **no global electron** (`which electron` → rc=1).
- Launching the desktop app created `~/Library/Application Support/tovu-desktop` — Electron userData, where the MRU site-dir store lives **as JSON, not SQLite**.

### F4. Claims rated BELOW verified — re-verify before building on any of these
| Claim | Why it's soft | What settles it |
|---|---|---|
| 92.75% line / 87.70% branch / 86.19% function | `tovu-30` never re-ran it or checked raw counters; nor did `tovu-07`. Also **untimed** — that session overlapped the load spike | Re-run the §3 command, keep the lcov somewhere durable |
| Coverage-task-list §4a items 6-11 | Taken wholesale from a departed agent. Items 1-3 of the same list were **proven** scope artifacts (§4a said `put-config.ts` was `FNF:8 FNH:2`; real state `FNF:8 FNH:8`) | Check each against its real driving tests first. **Assume 6-11 are wrong the same way** |
| `better-sqlite3` 13.0.3 / `argon2` / `sharp` load under Electron 43 | Reported with a claimed real SQLite roundtrip; never verified | Repeat the roundtrip |
| "`rm -rf apps/desktop` fully reverts" | Verified all three commits touch zero `apps/website` files; **did not** verify no other repo file references `apps/desktop` | Repo-wide grep for `apps/desktop` |
| `cover-guard-branches`' four guard tests | RED was **reasoned, not demonstrated** — the permission guardrail blocked source mutation | Mutate each guard, watch the specific test fail |
| The desktop agent's "four defects found and fixed" | Only the daemon-token one was independently verified (it is real). The others were never seen — the message truncated twice | Read the commit body at `5eeb58df` |
| `route-async-guards.test.ts` exercises `publish-credentials.ts` | Cross-referenced to `2026-08-17-mutation-sweep.md` §4; neither verified | Direct check |
| `cover-features-serial` picked `presentation` + `workspace` | **Inferred from the untracked dirs it left.** Its reasoning was never seen — stopped before reporting | Treat the pair choice as unjustified; re-derive |
| `agent-tools.ts` / `media-rendition.ts` after-numbers (100%, 96.5%, 97.96%) | `tovu-30` verified the commits were tests-only with the guard restored, but did **not** re-run suites or re-read lcov. Also untimed | Re-run scoped |

### F5. The dev-server crash — what is actually established
- **NOT an application crash and NOT an OOM kill.** No crash report, no jetsam event for `node` today (latest `node-*.ips` is Sep 2), log ends on a *successful* bind, zero shutdown-signal strings in 212 KB. What remains is an **external signal with no handler**.
- The first death followed a client reconnect storm (Playwright tab-loss orphaned an assistant run → "Switch to BYOK" clicked → 100+ `ERR_CONNECTION_REFUSED` in ~15s against `/api/agents`, `/api/frontend-sessions/stream`, chat messages). **Causation unproven** — a reconnect loop hammering an already-dead server is expected and proves nothing. The question is whether the storm *preceded* the death. No log existed then. It does now.

---

## G. Dead ends — RULED OUT, do not re-walk

- **`--fg-3` is NOT a bug.** Both references are `var(--fg-3, var(--fg-2))`, degrading cleanly. Wrongly called broken **four times across three sessions**, twice relayed as "confirmed by two agents" when it was one error and its echo. `--fg-1` was the real one (8 bare refs), fixed at `6ee9452a`.
- **`--radius-md`** is undeclared but its single use is `var(--radius-md, 8px)` — a typo for `--r-md`, degrades cleanly. Cosmetic. `--r-md` IS properly declared (`styles.css:124`, packed four-per-line, which fooled a line-anchored scan).
- **MCP-UI `d3834ec2`: BOTH claims REFUTED**, settled by static reading. Self-navigation buys nothing (the sensitive HTML handoff completes before attacker JS exists; three independent mechanisms prevent a resend). The postMessage handshake is safe because the trust decision is **not** made by `@mcp-ui/client` — it's Jini's `sandbox-proxy.ts:219-223` checking `event.source === host && event.origin === hostOrigin`, browser-enforced and unspoofable. **One LOW note stands**: the vendor library's own transport uses wildcard `"*"` with a source-only receive check — defense-in-depth gap, not exploitable today, recheck on any `@mcp-ui/client` upgrade.
- **The handlebars `@`-data gap is NOT prototype pollution.** CRITICAL→LOW: templates have no write primitive, and `handlebars@4.7.9` blocks the read anyway (`internal/proto-access.js:24-32` denylists `constructor`/`__proto__` regardless of defaults; the worker sets both proto flags plus `knownHelpersOnly` and a partial registry resolving nothing). Fixed for lint consistency at `5619228a`. **Do not let anyone re-escalate it.**
- **`packages/*` has nothing to test.** One workspace (`sdk`), 135 lines ~90% type declarations; runtime surface is 5 string constants and a one-line identity function, already fully pinned by a 110-line snapshot test.
- **`system/sites.ts` is NOT untested** — `sites-route.test.ts`, 272 lines, drives it over HTTP. Real gap is 71.79% branch.
- **`apps/admin/src/lib/api.ts` is NOT missing 145 endpoints** — it is 100% (FNF 219/219, BRF 184/184, lines 298/298).
- **The assistant CANNOT duplicate a site**, gap total at three layers: no sites domain in `assistant/tool-registrations.ts` (154 tool ids, 25+ domains); `createSite` is a thin wrapper over `initSite` producing a **blank** site; **no `duplicateSite`/clone exists anywhere** (project-wide grep, zero hits); no theme-activate tool. `MCP_UI_REDEEMABLE_TOOL_IDS` was a **red herring** — a confirmation-dialog allowlist for already-wired tools.
- **Runner's `resolveNodeBinary()` (~90 lines probing Homebrew/MacPorts/Volta/nvm/fnm/asdf/n) and `assertNodeMajorInSync` are obsolete** — delete, don't port. Runner's "KNOWN GAP: the packaged app depends on a Node install it does not ship" is stale, written against the node-gyp better-sqlite3 11 build.
- **`writeFileAtomically`'s ELOOP branch is unreachable single-process** once its sibling `writeThemeFile` fix landed — only via a genuine TOCTOU race. Fixed and tested anyway with an isolated `node:fs`-mocking test.
- **pid 44545 was `zana-c8`** — not `tovu-07`, not `tovu-6a`. Settled by socket filename → PPID.

---

## A3 — Desktop "didn't run": DIAGNOSED (agent `desktop-sitedir`, file:line verified)

**Root cause is not the resolution logic — it is two missing "tell the user" steps, on top of a likely deeper divergence.**

1. **No app window exists while the site dir resolves.** `main.cjs:169-172` — `createWindow` is called only AFTER `resolveTarget()` finishes. So in own-server mode with no valid default, the only thing that can appear on screen is the native picker itself, with nothing behind it.
2. **Precedence, traced end to end** (`site-dir-store.cjs:177-200`): `TOVU_DESKTOP_SITE_DIR` unset → MRU empty (first run) → `devFallbackDir` = `sites/tovu-com` (`main.cjs:89`) → `classifySiteDir` (`site-dir-store.cjs:101-105`) finds no `config.json` and a non-empty dir → classified `"occupied"`, not `"site"` → rejected (`184-186` requires exactly `"site"`) → `pickDir()` → native `dialog.showOpenDialog`.
3. **Cancel exits 0 in total silence, deliberately.** `promptForSiteDir` returns null (`main.cjs:67`) → `SiteDirSelectionCancelled` (`site-dir-store.cjs:189-191`) → `reportBootFailure` (`main.cjs:114-118`) quits with no `console.error` and no `showErrorBox`. Comment at `main.cjs:112` says this is intended. **Tested only at the `resolveSiteDir` level** (`site-dir-store.test.cjs:172-176`) — no test asserts the silent-quit itself.
4. **The picker DOES pass title + message** (`main.cjs:61-66`). NSOpenPanel renders `message` as small, easy-to-miss text; with no window behind it, "just a Mac folder, nothing else" is the expected perception. *(Inferred — the app was not launched.)*
5. The prior agent's "rendered a window, exited 0 after ~5 min" reconciles: the "window" was the native picker (its own OS-level window), not a `BrowserWindow`. *(Inferred.)*
6. **Unresolved:** whether `sites/tovu-com` lost its `config.json` or never had one. `git log --all -- 'sites/**/config.json'` returns nothing and `sites/` is not gitignored, so git cannot distinguish "deleted" from "never existed."

### The bigger finding underneath it — now the priority

**`npm run dev` is serving `sites/tovu-com` successfully right now, while `tovu serve` rejects that same directory as `SITE_DIR_INVALID`.** Two boot paths disagree about what a valid site is. Same defect family as the daemon-token bug (A4): `index.ts` and `serve.ts` have drifted.

Open questions dispatched to the agent:
- Does `init-site.ts`'s `initSite` write `config.json`? If **no**, `tovu serve` cannot serve a freshly-initialized site at all — far larger than the picker.
- What validation does `index.ts` apply vs `serve.ts`? (`boot-site-dir.ts`, `read-site-dir.ts`, `site-registry.ts`, `product-root.ts`, `types.ts`, `errors.ts`.)
- `errors.ts:24` names `config.json` **or** `.site-meta.json`; `site-dir-store.cjs:34` hardcodes `config.json` only. If the server accepts either, **the desktop classifier is stricter than the server** and rejects sites the server can serve.

### Approved fixes (in `apps/desktop/**`)
- **(1)** Cancel branch must say something before `app.quit()` — not an error dialog (declining is legitimate), a one-line message. ~4 lines, contained to `main.cjs`.
- **(2)** Pass the rejection reason into `promptForSiteDir` so the dialog says *why* it is asking, naming `sites/tovu-com` and the missing file.
- **(3) REJECTED as a standalone fix**: just writing a `config.json` into `sites/tovu-com` unblocks this one machine but leaves the silent-cancel/bare-picker first-run UX broken for everyone. May still be done *in addition*, as a data change — Leona's call.

---

## H-REVISED — multi-site scope CUT. Ports, not a fleet port.

**Supersedes §H.** Leona pushed back on "~7,200 lines back in scope" and she is right. Her framing:
*"I don't know if it needs 7,200 lines. I think if we're gonna run multiple sites, we just need
different ports. Some code that sees which port is free and then boots it up from there."*

**Most of the mechanism already exists:**
- `serve.ts:37` **already self-allocates a free port** when unconfigured. Its own comment: "an
  unconfigured instance now self-allocates a free port instead of every unconfigured Tovu on the
  box colliding."
- It already prints a machine-readable boot line —
  `tovu serve: dir=(.+) port=(\d+) schemaVersion=(\d+) workspaceId=(\S+)` — parsed at
  `apps/desktop/src/tovu-server.cjs:23`.

So "boot a site and learn its port" is **already solved for one site**. One → N is: keep a list of
dirs instead of one, spawn a child per dir, let each self-allocate.

**The 7,200 is Runner's PRODUCT SURFACE, not the capability**: ~3,300 renderer
(grid/onboarding/hooks/CSS), ~1,950 fleet chat, ~884 provisioner, ~800 contracts. Tovu needs none
of it — it has the admin UI, and `tovu init` instead of a provisioner. Only the registry (~310) is
near-core, and that is mostly a list of folders.

**Actual scope: multi-dir list + spawn-per-dir + a site switcher in the shell + identity-checked kill.**

**The one thing worth keeping from Runner's fleet code (~50 lines): identity proof before killing a
child.** With N children pid reuse becomes reachable, and **Tovu's daemon argv is identical for
every instance on the box**, so there is currently no way to prove which process you are about to
kill. Port `terminateOrphan`'s SIGTERM → poll → **re-identify** → SIGKILL, plus `isProcessAlive`.
Needs a unique marker arg on the daemon spawn first, or `lsof` on the known port (Runner's own
fallback). Seam: `daemon-supervisor.ts:247` `killCurrentChild()`, which group-kills a detached pid
guarded only by a `childHasExited` flag.

**B4 (orphan reconciliation) therefore stays on the critical path** — that part of §H survives.
Everything in §H about porting the registry/provisioner/renderer/fleet-chat is **CANCELLED**.

The three do-not-port rulings still stand: in-process Jini daemon, keychain vault, second MCP surface.

### A5 — Runner vs `apps/desktop` screenshot comparison (NEW, in flight)
The point is the **UI gap**: Runner has a real multi-project surface (grid, onboarding, per-project
chat); `apps/desktop` is a single window over the admin. If Runner's UI turns out to be what she
actually wants, scope goes back up — and she can say so looking at a picture rather than a line count.

---

## A3 RESOLVED — root cause, and a bigger finding underneath it

**Fixes committed `543b6784`** (`apps/desktop/**` only, 3 files): the picker now names the actual
rejected dir and the reason instead of generic copy, and a cancelled picker shows a short message
before `app.quit()` instead of exiting 0 in silence. 4 new tests; `site-dir-store.test.cjs` 21/21,
`tovu-server.test.cjs` 23/23 (untouched, ran as regression). **Not visually confirmed** — no test
harness exercises `main.cjs`'s Electron-dependent code; `runner-vs-desktop-shots` will exercise it.

### Why `sites/tovu-com` fails
1. **`initSite` DOES write `config.json`** — `init-site.ts:190-192`, step 5,
   `writeJsonFileAtomic(path.join(target, "config.json"), config)`. So a site made by `tovu init`
   always has it. **`sites/tovu-com` was never created that way, or lost the file.** Git cannot
   settle which: `git log --all -- 'sites/**/config.json'` returns nothing and `sites/` is not
   gitignored.
2. `sites/tovu-com` is real, live, working data (44 MB content.db) that was **only ever exercised
   through the `index.ts` path**, which has no install-dir validation at all. `serve.ts` correctly
   rejects it. That is not a bug in `serve.ts`.

### THE REAL FINDING — the dev path and the shipped path have different site contracts
- **`serve.ts:120-121`** → `bootSiteDir` → `readSiteDir` (`read-site-dir.ts:81-86`) **unconditionally
  requires BOTH `config.json` AND `.site-meta.json`** to exist, parse and validate. Each is read via
  `readJsonFile`, which throws `SiteDirInvalidError` if missing (`read-site-dir.ts:33-41`). This is
  the `tovu serve` / desktop path.
- **`index.ts`** (the `npm run dev` path) **never calls `bootSiteDir` or `readSiteDir` at all** —
  grep-confirmed, zero matches. It resolves a dir via `siteDir()` → `resolveSiteRoot()`
  (`site-root.ts:63-71`) and a db path via `defaultContentDbPath()` (`deps.ts:436-445`). **No marker
  file check anywhere.** `deps.ts:437-441`'s own comment confirms it is a legacy model that
  **predates SPEC-003's install-dir contract**.

**We develop against a path with no validation and ship a path that requires two files.** Class of
bug this hides: anything that works in dev and fails on a real install. Architecture call pending —
does `index.ts` adopt `bootSiteDir`, or is the divergence deliberate and documented?

### Correction to an earlier hypothesis
`errors.ts:24`'s "config.json or .site-meta.json" means **either one missing triggers
`SITE_DIR_INVALID`** — NOT that they are accepted alternatives. `read-site-dir.ts` requires both.
The server does **not** accept `.site-meta.json` alone.

### Latent gap — APPROVED for fix
`classifySiteDir` (`site-dir-store.cjs:101-105`) checks only `config.json` to call a dir `"site"`,
never `.site-meta.json`. **The desktop classifier is LOOSER than the server on that axis**: a dir
with `config.json` but no `.site-meta.json` classifies as `"site"`, sails past the picker, then dies
inside the spawned `tovu serve` child. Not silent today (the CLI error surfaces via
`reportBootFailure`'s general branch), but late. Fix approved: require both, and name which file is
missing.

### C10 — NEW, needs Leona: write marker files into `sites/tovu-com`?
Would make the desktop app work against the real site today. **HELD, not done.** Requires
`config.json` `{ name, domain, port }` plus `.site-meta.json` `{ siteId, templateId,
templateVersion, schemaVersion, schemaTag, createdAt }`. **The risk is the schema stamp**: guess it
wrong and `compareSchemaVersion` either forces an unwanted migration or throws
`SiteNewerThanRuntimeError` — and in this repo **migrations auto-apply to the live DB**, so this is
a mutation of 44 MB of real data, not a dry run. Alternative: let the picker-driven `tovu init` flow
create a NEW site instead, with no schema guessing.

---

## A6 — Classifier fix DONE (`c49aaea3`) + the dev/serve validation divergence, written up

**`c49aaea3`** (`apps/desktop/**` only): `classifySiteDir` now requires BOTH markers to return
`"site"` (`site-dir-store.cjs:126-131`, new `missingSiteMarkers()` at `:112-119`). A dir with exactly
one marker gets a new `"incomplete"` state, distinct from `"empty"`/`"occupied"`. `adoptSiteDir`
refuses it by name (`:166-169`). `rejectedDefault` carries `missing: string[]`, so the picker says
"...missing config.json and .site-meta.json" — and a `config.json`-only dir gets its own copy
("looks like a half-initialized site"). 6 new/updated tests; 25/25 + 23/23 regression, `node -c` clean.

### The divergence, stated for the record

**`index.ts` (the `npm run dev` process running right now) applies ZERO install-dir validation.
`serve.ts` (`tovu serve` — the shipped path, what the desktop app spawns) requires both marker files,
a name check, AND a schema-compatibility guard. Developers exercise the weaker path daily; the
product ships the stricter one.**

`index.ts` side:
- `index.ts:5` imports only `createSqliteRouteDeps, defaultContentDbPath, siteDir`. Never imports
  `bootSiteDir`, `readSiteDir`, or anything from `platform/site-dir/index.ts`. Grep for
  `readSiteDir|bootSiteDir|SiteDirInvalidError` finds real call sites only in `serve.ts`,
  `cli/commands/init.ts`, `cli/commands/export.ts`, and `platform/site-dir/site-registry.ts` (a
  separate multi-site listing module, not on `index.ts`'s boot path). `index.ts` and its whole chain
  (`runBootLifecycle`/`buildBootModules`) are absent.
- `deps.ts:200`: `siteDir()` → `resolveSiteRoot()`. `site-root.ts:63-71`: `TOVU_SITE_DIR` env, else
  `<cwd>/sites/<TOVU_SITE ?? DEFAULT_SITE_NAME>` — **pure path arithmetic, no `fs.existsSync`, no
  validation at all.**
- `deps.ts:436-445`: `defaultContentDbPath()` → `TOVU_CONTENT_DB ?? join(siteDir(), "content.db")`.
- `index.ts:306`: the real (non-memory) dev mode — what is running now against `sites/tovu-com` —
  resolves a real on-disk site dir and never validates it.

`serve.ts` side:
- `serve.ts:120-121` → `bootSiteDir`. `boot-site-dir.ts:66-115`: step 1-2 `readSiteDir`
  (`read-site-dir.ts:81-86`, BOTH markers unconditionally, plus a `config.json.name` 1-200 char
  check); step 3-4 `compareSchemaVersion` (`:80`) run **before the db is ever opened** (AC-06 — a
  newer-or-divergent site must never be touched); step 3 `openContentDb`; step 6 `resolveWorkspace`
  (can throw `SiteCorruptError`).

**Class of bug hidden:** everything `bootSiteDir`'s validation exists to catch — missing/corrupt/
oversized markers, invalid site name, and critically the schema-newer-than-runtime guard — is
invisible under `npm run dev` and surfaces only the first time that dir goes through `tovu serve`.
Not hypothetical: that is exactly what happened today.

### A7 — OPEN, DATA SAFETY, dispatched: does the dev path have an AC-06 equivalent?
**UNVERIFIED and it is the sharpest edge here.** `serve.ts` runs `compareSchemaVersion` *before*
`openContentDb` so a site newer than the runtime is never touched. If `index.ts`'s boot chain has no
equivalent, then — because **migrations auto-apply to the live DB in this repo** — `npm run dev` can
**silently migrate a content.db that `tovu serve` would refuse to open**, forward and irreversibly,
on real site data. A developer on an older checkout could destroy a site a newer runtime created.
Static tracing only, dispatched to `desktop-sitedir`. Read-only; no fix without Leona.

### C11 — NEW, needs Leona: should `index.ts` adopt `readSiteDir`?
Agent's recommendation (not implemented): the divergence looks **unintentional**, not deliberate.
`site-root.ts:187-191`'s own comment says `resolveSiteRoot()` is "that same [install-dir] model's
DEFAULT for the non-CLI boot path... which previously had no site folder at all" — i.e. `index.ts`
already adopted the *directory-shape* half of ADR-012 but not the *validation* half. Precedent
exists: `site-registry.ts:96` calls `readSiteDir` directly for a different purpose, so reusing it is
not architecturally novel. Proposal: `index.ts` calls `readSiteDir` on the resolved dir before
opening `content.db`, **non-memory branch only** (`TOVU_DB=memory` has no dir and stays exempt).
Small and additive; makes dev fail the way serve fails instead of later and worse. **But it changes
boot behaviour for every developer — Leona's call.** Answer to A7 should come first.

---

## A4 DONE — daemon-token bug fixed (`2f03ec5f`), and the sink audit found worse

**Fix**: `serve.ts` now calls `ensureAgentDaemonToken()` right after `installUnhandledRejectionGuard()`,
mirroring `index.ts`'s ordering, before `startAssistantDaemon()` spawns the child (full-env inherited
spawn already existed — `daemon-supervisor.ts:405`). The function itself is untouched, so
operator-set tokens are still preserved.

**Verified, not inherited.** `find apps/website/src -not -path '*/dist*/*' ... | xargs grep -n
"ensureAgentDaemonToken"` → zero hits under `cli/`; only `index.ts:18,292`, `assistant/index.ts`
(export), `daemon-auth.ts` (definition), tests. **Control run** proved the tooling works
(`ensureAgentDaemonPortResolved`, `installUnhandledRejectionGuard`, `startAssistantDaemon` all hit
in `serve.ts`), so the zero is real.

**RED → GREEN, against a real spawned server.** New regression test in
`serve-command.integration.test.ts` spawns a real `tovu serve` with a known
`JINI_AGENT_DAEMON_PORT` and no `TOVU_AGENT_DAEMON_TOKEN`, then hits the daemon's own port with no
Authorization header — bypassing the admin proxy and session auth to isolate the daemon's bearer
gate. Pre-fix **503 `AGENT_DAEMON_UNCONFIGURED`**; post-fix **401 `UNAUTHENTICATED`** (proves a real
token exists without asserting its value). Logs in the session scratchpad
(`red-run.log`, `green-run.log`, `full-green-run.log`).

**Known flakes, NOT caused by this change**: `serve-command.integration.test.ts` has 2 pre-existing
failures (`BR-07` SIGTERM, `CR-R04`/`CR-R01` foreign-cwd) with identical signatures in BOTH the RED
and GREEN runs, under load 7-8. The file's own `loadFactor()` comments describe this class. 15/17
pass. **Do not chase these.**

### A8 — SECURITY: `registerPluginSdkResolver()` missing from `serve.ts`. Dispatched.
`index.ts`'s `main()` calls it; **`serve.ts` never does.** Per its own doc (CIC U-002, marked
`ESCALATE_SECURITY`) it must run **synchronously before any path can reach `loadPlugin()`'s dynamic
`import()`**, or a plugin can plant a local `node_modules/@tovu/sdk` and **defeat ADR-005's
deep-import blocking**. Both boot paths reach `createApp(deps)`, which wires the same plugin routes
(`server/inbound/admin-http/routes/plugins/deps.ts` calls `loadPlugin`), so **`tovu serve` — the
shipped path, and what the desktop app spawns — can load a plugin with the resolver hook never
registered.** Dispatched to `fix-plugin-sdk-resolver` with the security persona: verify reachability
and read CIC U-002 / ADR-005 directly before fixing; establish the real exploit path and an honest
severity rather than inheriting the framing.

### A9 — two more boot divergences, flagged UNVERIFIED, not dispatched
- **`runBootGateOrExit()` / `runProductionReadinessGate`** — production-mode-only checks (default
  owner password, dev secret placeholders). `serve.ts` never calls it, so **`tovu serve` in
  production mode skips the gate entirely.** Unclear whether intentional; `bootSiteDir` may cover
  different ground. Equivalence NOT verified.
- **`runBootLifecycle(buildBootModules(...))`** — `index.ts`'s critical-module readiness check plus
  the `logCriticalBootFailures` exit-1 path. `serve.ts` uses `bootSiteDir()` instead, a different
  mechanism (validates/migrates the site dir, not module readiness). Equivalence NOT verified.

Everything else in the two `main()` / `runServeCommand()` sequences lined up
(`installUnhandledRejectionGuard`, `ensureAgentDaemonPortResolved`, `startAssistantDaemon`
readiness-await ordering — already fixed 2026-08-28 per `serve.ts`'s own header).

**Pattern note:** three independent boot-path divergences found today (daemon token, site-dir
validation, plugin SDK resolver), all the same shape — `index.ts` does it, `serve.ts` does not.
**We develop on `index.ts` and ship `serve.ts`.** That is the systemic finding, bigger than any one
of them.

---

## A7 SETTLED — the AC-06 gap is REAL. Two agents, independently, same conclusion.

`ac06-dev-path-guard` and `desktop-sitedir` traced this separately and converged. Read-only both.

**No AC-06-equivalent schema guard exists anywhere on `index.ts`'s boot chain.**

1. `index.ts:306` — `createSqliteRouteDeps()` called with **zero arguments** (no `dbPath`, no `overrides`).
2. `deps.ts:657-674` → `resolveOrOpenContentDb(dbPath, overrides)` (`deps.ts:547-562`); `overrides` undefined,
   so it takes the `??` branch straight to `openContentDb`. No schema check in this file.
3. `content-db.ts:73-89` — `openContentDb()` calls `migrate(db, { migrationsFolder: MIGRATIONS_DIR })`
   **unconditionally at line 85.** Not inference — **Tovu's own docstring says so** at
   `content-db.ts:93-104`, describing the sibling `openContentDbReadOnly`: *"Unlike `openContentDb`,
   which unconditionally calls `migrate()` (applies any migration not yet recorded against this file,
   a genuine schema write)... before a caller ever gets to check its own `--dry-run` flag."*
4. **Ordering makes any later check useless**: `index.ts:306` builds deps (opening AND migrating the
   db) **before** `index.ts:311` runs `runBootLifecycle`. Even a lifecycle module that checked would
   be too late.
5. `bootstrap.ts:41-105`'s six modules were read in full — `database-migration-reconciliation`
   (crash-interrupted plugin **dataModule** DDL recovery per ADR-023, a DIFFERENT subsystem),
   `settings`, `seo`, `newsletter`, `comments`, `bundled-agent-plugins`, `store-plugin`. **None
   compares a schema version.**
6. `compareSchemaVersion` / `SiteNewerThanRuntimeError` live in `schema-guard.ts:74-92`. Only caller
   is `boot-site-dir.ts:80`. `bootSiteDir`'s only callers are `serve.ts` and `export.ts`.
   **`index.ts`, `deps.ts`, `boot-lifecycle.ts`, `bootstrap.ts` never reach it, directly or
   transitively** — repo-wide grep, both agents.

**Concrete scenario:** a site's `content.db` is migrated forward by a NEWER checkout (recorded in the
db's own `__drizzle_migrations` table — separate from `.site-meta.json`'s `schemaVersion`/`schemaTag`
stamp, which is only a cached belief record). A developer checks out an OLDER commit and runs
`npm run dev` against that site. **`tovu serve` refuses outright before opening it**
(`SiteNewerThanRuntimeError`). **`npm run dev` opens it and migrates immediately.** Also unguarded:
the same-index-different-lineage divergent-tag case (REQ-05(b) / CIC U-002-B1), which
`schema-guard.ts:85` treats identically to newer and never as compatible.

**NOT settled (flagged honestly by both):** the SQL-level consequence once Drizzle's migrator hits
that divergent state — inert skip, loud error, or destructive DDL. Answering it needs a **hermetic
fixture test**, not a live probe. Note `schema-guard.ts:83-88`'s own comment — *"divergent lineage,
refusing rather than guessing"* — is institutional memory that this was judged unsafe enough to
refuse rather than attempt.

**→ C11 (should `index.ts` adopt `readSiteDir`/a schema guard) is now backed by a confirmed gap, not
a hypothesis. Leona's call; it changes boot for every developer.**

---

## B2 DONE — Gemini admin-tooling triage (`993688d5`, skeleton `6fa63a8b`)

Report: `ADS-memory/reports/2026-09-05-gemini-admin-tooling-triage.md`. All 37 findings re-verified
against the CURRENT tree. **9 ALREADY FIXED · 28 REAL/still live · 0 mischaracterized · 0 not-real ·
0 cannot-determine.** Notably the source report's confirmations all held — unusual for this tool,
whose prior calibration was ~24% fabricated. Settled by reading source; no test runs needed.

**Already fixed:** 8 (`974c2072`), 13 (`3f834944`), 16 (`44adffff`), 19 (`49088969`),
26/27/28/29 (`e651317f`), 34 (`787e841b`).

**Dispatched from this triage:**
- **A10 — CRITICAL, `fix-dryrun-migration`**: `development/scripts/backfill-reset-admin-password.ts:92`
  calls `openContentDb()` unconditionally before the `--apply` check, so **every dry run of this
  incident-recovery script migrates the schema and writes a watermark row against a live db**. Plus
  (HIGH, same file) `resolveExistingDbPath` is **never called**, so a mistyped `--db` silently
  creates a new empty db and presents as "user not found." **Same root cause as A7** — `openContentDb`
  migrating unconditionally — and the fix already exists unwired: `openContentDbReadOnly`.
- **A11 — 3× HIGH, `fix-use-sites-hooks`**: `apps/admin/src/features/sites/use-sites.hooks.ts` —
  `activate` (~132) has no in-flight guard (two rapid clicks, last-to-settle wins regardless of click
  order); `createSite` has none either **while its own doc comment one line above claims it does**;
  and line ~152's `createMutation.error ?? activateMutation.error` **permanently latches a stale
  Create error over any later Activate outcome.**

**Still untriaged into action:** the remaining REAL findings below the top 5. One named sibling —
`App.tsx:463`'s `dockT` is the last unfixed instance of the unstable-`t`-breaks-`useCallback` pattern
(finding 36), after fixes in `use-access-tokens.hooks.ts` and `useWiredSites`. Handed to
`fix-use-sites-hooks` to verify.

---

## A5 — screenshots BLOCKED (environment, not the apps). Two real bugs found anyway.

**Screenshot deliverable UNMET.** `screencapture` in this agent session cannot composite ANY
application window — only desktop wallpaper and the menu bar. Proven with a control: an ordinary
already-running Chrome window, on-screen at X=657/Y=93 per `CGWindowListCopyWindowInfo`, made
frontmost via `osascript activate` — full-screen capture still returned only wallpaper. **Screen
Recording permission is NOT the blocker** (`screencapture` exits 0 and returns real pixels). Both
target apps behaved the same. Playwright/Chromium was never used. The agent stopped rather than
chasing private WindowServer APIs. **Needs either fixed capture, or Leona capturing interactively.**

### SETTLED: `tovu init` → `tovu serve` WORKS
- `npx tsx apps/website/src/cli/main.ts init <scratch>/qa-e2e-site` → exit 0.
- `npx tsx apps/website/src/cli/main.ts serve <dir> --port 57958` → clean boot:
  `tovu serve: dir=... port=57958 schemaVersion=57 workspaceId=workspace-local`, agent-daemon up.
- **So `initSite`'s output IS accepted by `serve`. `sites/tovu-com` was the dead path, not a general
  defect.** Closes the open question from A3.

### A12 — NEW BUG: `apps/desktop` spawns a STALE compiled CLI (schema v50 vs source v57)
`apps/desktop` does not build the CLI. It spawns the **repo-ROOT `dist/src/cli/main.js`** — verified
last built **2026-08-28 21:08**, more than a week stale, schema **v50**. Current source is **v57**.
So a site created from current source is **rejected by the desktop app's own server**:
`SITE_NEWER_THAN_RUNTIME: site schema (v57) is newer than this runtime supports (v50)`.
The agent only got `apps/desktop` to boot own-server mode by creating a site with the **stale dist
CLI** — after which it worked properly: real boot line, real `tovu serve` + agent-daemon children,
and a genuine on-screen `BrowserWindow` (owner=Electron, layer=0, bounds X=75/Y=25/925x900) confirmed
via `CGWindowListCopyWindowInfo`.

**C12 — needs Leona: rebuilding `dist` is blocked and the unblock is risky.**
`npm run build` runs `check-no-linked-jini.mjs` first, and **13 `@jini-ai/*` packages are npm-linked**
into `node_modules` (symlinks into `/Users/la/Programming/Jini/packages/*`, dated Sep 1). Clearing
that means `npm run unlink:jini`, which is repo-wide and touches what the **live shared dev server**
depends on. Not attempted. Decide before anyone rebuilds.

### A13 — Tovu-Runner opens OFF-SCREEN on this machine
First launch of the packaged `release/mac/Tovu Runner.app` put its window at **X=-1443** — off-screen
to the left, a stale remembered frame from a past multi-monitor setup. A fresh `--user-data-dir`
scratch profile fixed it (X=200/Y=95). **Worth a bug note on its own** — a user hitting this sees an
app that "launched" and shows nothing, the same class of symptom as the desktop picker.

**Cleanup verified**: every process the agent launched is gone (tsx serve 72711/72735/72736; desktop
attempts 73906-73910 and 76350-76434; a stray default-Electron 75982/76034-36 launched accidentally
by an `osascript activate` targeting no running instance; Runner 80393 tree, 81808-81841). Shared dev
server pid 64043 untouched. Nothing committed, no edits under `apps/website/**`, `apps/desktop/**`,
or `Tovu-Runner/**`.

---

## B3 — coverage inventory DISPATCHED (`coverage-inventory`)
Leona asked directly which folders under `apps/website/src/features/**` and `apps/admin/**` have no
coverage. Dispatched with the standing constraints in the spawn prompt: static mapping first, measure
only as load allows, two feature dirs at a time strictly serial, ONE test invocation at a time,
`uptime` recorded with every number, lcov kept durably, and **file listing / symbol grep explicitly
banned as an answer** — that method produced five wrong claims today.

---

## A14 — Runner vs desktop PARITY MATRIX done (`24f871aa` skeleton, `7edc1557` filled)
Report: `ADS-memory/reports/2026-09-05-runner-vs-desktop-parity.md`. Read-only; Tovu-Runner never
touched, neither app launched, no tests run.

### Confirms Leona's "just different ports" read. Costed.
**~150-300 lines** in `main.cjs`/`site-dir-store.cjs` for "run N sites in one continuously-live app,
no crash-safety." **~400-550 lines** if crash-safety across restarts is in scope (adds Runner's
orphan-reconciliation cluster, `project-provisioner.ts:617-871`, **measured 255 lines**).
So "a few hundred lines" is **confirmed for the minimal version, refuted by ~2x with crash-safety.**

**The hard part is already built**: `apps/desktop/src/tovu-server.cjs` (327 lines) is already a pure
`{repoRoot, siteDir, port} → handle` function **with zero single-instance assumptions**, and
free-port allocation already works at BOTH the site-HTTP layer (`allocatePort()`) and the
agent-daemon layer (per `daemon-supervisor.ts`'s own "Self-allocation fix (2026-08-28)" comment).

### Ranked gaps
1. **`apps/desktop` runs exactly one site dir per process** — the actual blocker; everything else is
   secondary.
2. **Boot-time orphan reconciliation missing** — and `main.cjs:230-232` already says so itself
   ("...that machinery belongs with the fleet supervisor, not here, and is reported rather than ported").
3. **Fleet-operator chat** — big by line count, ranks LOW: if there is no separate "fleet operator"
   identity in the ports-not-fleet model, **this surface may not need to exist at all.** Desktop gets
   a working per-site chat free from Tovu's own admin UI.

### Line-count corrections to the inherited estimates
- `project-registry` **310** and `project-provisioner` **884** — exact.
- Contracts **~828** (close). Renderer **~3,131-3,281** (close).
- **Fleet chat/store/IPC as literally scoped is 1,027, NOT ~1,950.** The ~1,950 only holds if you
  also fold in `runner-mcp-bridge.ts` (428) + `runner-tools.ts` (487).

### Identity-before-kill (B4): real, unported, and does NOT transplant as code
Tovu's seam is `daemon-supervisor.ts:247` `killCurrentChild()`, guarded only by an in-memory
`childHasExited` bool, no re-identification. Runner's `isProjectSidecar` proves identity via an argv
substring (installDir + `--port N`) — but `spawnRealDaemonProcessFor` (`daemon-supervisor.ts:402-416`)
**spawns byte-identical argv for every instance**, verified. **Port the SHAPE, not the code**: add a
discriminating argv token (e.g. `--workspace <id>`), then argv-check before any future kill of a
persisted pid. **Do NOT use `ps eww` to read child env as a substitute** — that command is banned
here for credential leakage.

### `resolveNodeBinary` (~90 lines, `tovu-cli.ts:121-223`) — confirmed DEAD
`apps/desktop/src/tovu-server.cjs:110-121`'s own comment, dated **today**, already documents why:
better-sqlite3 13 is N-API with prebuilds and loads unmodified under Electron 43, "measured
2026-09-05, incl. a real SQLite roundtrip."

### All three do-not-port rulings CONFIRMED, with independent reasoning
- **In-process Jini daemon** — contradicts Tovu's detached-supervisor architecture (verified via
  `daemon-supervisor.ts`'s `detached: true` spawn).
- **Keychain vault** — no AAD binding, and the exploit is concrete: **a ciphertext blob copied between
  two projects' vault slots decrypts without error.** `safeStorage` has no AAD parameter at all. This
  would land in a repo that runs a `check:seal-aad` gate.
- **Second MCP surface** — exists only because Runner's fleet-operator chat and a site's own chat are
  different processes. That problem does not exist if desktop has no separate fleet-operator identity.

### Could not verify (listed in the report's own gap section)
`site-dir-store.cjs`'s `resolveSiteDir` full body (header only — its MRU-list shape affects the Q3
cost), `daemon-respawn-policy.ts`, `agent-daemon-port.ts`, `App.hooks.ts`, `runner-tools.ts` bodies
(sampled by import/export only), and `stage-tovu-runtime.mjs`'s `assertNodeMajorInSync()`.

**→ C13, needs Leona: is crash-safety in scope?** That is the ~150-300 vs ~400-550 line decision.

---

## A10 DONE — dry-run migration bug fixed (`1e2dc23f`) + 4 siblings dispatched

**RED, concrete**: a dry run against a zero-table fixture **created 92 tables** — the full schema.
The mistyped-`--db` test got `SiteCorruptError: zero workspace rows` because the script had already
silently created and migrated an empty db at the typo'd path. **The 3 pre-existing tests passed
throughout** — they only asserted on log lines, never file state. That is why the bug survived.

**Fix** (`development/scripts/backfill-reset-admin-password.ts`):
```
const dbPath = resolveExistingDbPath(args.dbPath);
const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
```
`--apply` behaviour unchanged. **GREEN 5/5**: table count stays 0, file bytes byte-identical,
missing-path error is the exact `missingDbPathMessage`.

**Diligence worth copying**: before converting to a read-only connection, the agent checked what
runs *after* the open — `createSqliteIdentityRouteDeps` kicks off `seedIdentity` /
`migrateDeprecatedPermissionGrants` / `applyBuiltinRoleGrants`, all real writes on first boot. It
read all three, confirmed they read-check-before-write and that `seedIdentity` early-returns once an
owner exists, so on an already-provisioned db they emit zero writes.

**Correctly guarded already** (the reference shape): `backfill-site-assistant-credential-aad.ts`,
`backfill-composio-config-aad.ts`, `backfill-media-provider-credential-aad.ts`,
`backfill-execution-credential-aad.ts`, `backfill-connector-credential-aad.ts`,
`backfill-external-mcp-aad.ts`, `backfill-custom-credential-usernames.ts`.

**A15 — 4 siblings with the identical two-bug pattern, dispatched to `fix-dryrun-siblings`:**
`backfill-slug-collision-defaults.ts:141` (apply at :165), `convert-legacy-doc-pages-to-html.ts:125`
(:158, already run against prod once per its header), `migrate-page-embed-markers.ts:300` (:309),
`backfill-vendor-credentials.ts:372` (:379). Default `--db` on these is the **nonexistent
`infra/content.db`**, which makes accidental empty-db creation easy.

`apps/**` callers of `openContentDb` (init-site, boot-site-dir, gated-hooks, search-index.memory,
plugins/snapshot, deploy-config, agent-daemon-server, `composition/deps.ts`, assistant-byok) were each
checked for dry-run/read-only language — none claims a contract it violates. Migrating on open is
intended there.

**NOT verified**: whether the 4 unfixed scripts appear in production runbooks or incident procedures
the way `backfill-reset-admin-password.ts` does. Source only.

### NEW TRAP (saved to memory): `grep` silently skips files containing NUL bytes
`backfill-vendor-credentials.ts` uses literal `\0` as a composite-key delimiter in template literals
(lines ~208/226/296/367 — legitimate, avoids collision with UUIDs). `file` calls it "data"; this
box's `grep` is ugrep with `-I`, so it treats the file as **binary and silently omits it from every
search**. It never appeared in the sink sweep's first pass. Use `command grep -a`. **This is a THIRD
silent-zero route**, alongside the `--` flag-parsing trap and recursive searches reaching `dist/`.

---

## A11 DONE — three sites-screen races fixed (`bac64077`)

Real path is `apps/admin/src/features/sites/hooks/use-sites.hooks.ts` (the triage's path was stale).
All three reconfirmed at current line numbers before fixing. Each RED reproduced by making responses
settle **out of order**.

1. **`activate` (~155)** — clicked alpha then beta; beta settled first, alpha second; pre-fix alpha's
   late response overwrote `activation` back to alpha. **Last-to-settle beat last-clicked.** Fixed
   with a monotonic `activateGenerationRef`, matching `use-access-tokens.hooks.ts`'s
   `reloadGenerationRef`.
2. **`createSite` (~68/116)** — doc comment claimed an in-flight no-op that did not exist. Two
   synchronous calls before the mutationFn's microtask ran called the port 0 or 2 times, never 1.
   Fixed with a synchronous check-then-set `creatingRef`, matching `use-static-publish.hooks.ts`'s
   `publishingRef` (whose comment explains why it must be a ref, not `status`, for same-tick safety).
3. **`createMutation.error ?? activateMutation.error` (~199)** — failed create then successful
   activate left `writeError` on the stale create error. Fixed by resetting the sibling mutation at
   the start of each write, matching `use-redirects.hooks.ts`'s `clearOtherWriteErrors`.

GREEN 13/13 in the hook's test, 17/17 in `Sites.unit.test.tsx`. Runner:
`cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run <path>`, no coverage flag, so no
`.tmp` clobber.

### Sibling sweep — two look-alikes correctly REFUTED, one genuine
- **`App.tsx:463` `dockT` — REFUTED.** Recreated every render, but appears in **no** dependency array
  (grepped `[dockT` / `dockT]`, zero hits) and `AssistantChrome` is not memoized. Nothing for its
  instability to defeat. **Triage finding 36 is wrong.** Left alone.
- **`use-migrate-forward-section.hooks.ts:134` — SAFE.** Same `a.error ?? b.error ?? c.error` text,
  but the three mutations are strictly sequential and gated, so two can never hold conflicting
  non-null errors at once. The file's own header already documents this.
- **`use-themes.hooks.ts` `activate` (142-153) and `download` (174-195) — GENUINE.** Same missing
  guard: single busy-id state, no in-flight or generation check, result applied unconditionally on
  success. **A16, dispatched to `fix-themes-races`.**

**Open question handed on**: `use-theme-explore.hooks.ts` uses `useFetchMutation` per action, the way
Sites did before the fix — the sweeping agent could not quickly settle whether it has the same race
and flagged it rather than claiming either way.

**UNSWEPT, not clean**: `use-workspace.hooks.ts`, `use-widgets-library.hooks.ts`, `use-roles.hooks.ts`,
`use-users.hooks.ts` were spot-checked only, not line-by-line traced. ~28 admin hook files were
swept by `setBusy*/setSaving*/setPending*` grep, which is a shape filter, not a proof.

---

## B3 PARTIAL — coverage inventory delivered (`112fa2af` skeleton, `35eeb5a2`, `01cb55b8` final)
Report: `ADS-memory/reports/2026-09-05-coverage-inventory.md`.

**Phase 2 HALTED by load.** 1-min load went 6.32 (15:42) → 35.57 (15:47) → 57.24 (15:48) → peak
**69.60**, the same trajectory as this morning's 721 crash. **Much of it was external**: the heaviest
process was a `vite build` at 115% CPU owned by the **Zana session in another repo**, which exited on
its own. Only ONE directory was measured before the halt.

**The report leads with the right disclaimer**: it is a map of the surface and its candidate
exercisers, **not a coverage measurement. UNMEASURED means unknown, not uncovered.**

### The agent found and fixed a real bug in its own method, unprompted
**Directory names collide between the two apps** — `settings`, `commerce`, `database`, `comments`,
`forms`, `plugins`, `recovery`, `workspace`, `redirects`, `source-control`, `taxonomy`, `members`,
`seo`, `pages`, `media`, `widgets`, `analytics`. Its first pass **merged their external-suite counts
together**. Redone with the grep split by app; both tables now carry app-correct counts with the
other app's shown parenthetically. **Any future cross-app scan here has the same trap.**

### `deployments` — measured, but DOWNGRADED to unconfirmed
99.0% lines / 94.5% functions / 95.3% branches (28 source files, 34 driving test files, **15
external**). **But** the "after" `uptime` was 35.57, taken at completion — meaning load was already
climbing **during** the run, not only after it. Overlap cannot be ruled out, so the numbers are
flagged **"unconfirmed, reconfirm before trusting"** rather than asserted. A number measured across
a thrashing window is void, not slightly off. **Real finding regardless: `repo.sqlite.ts` at 61%
lines (83/136).**

### Top 10 LARGEST UNKNOWN (not "largest gap" — unknown)
`admin/lib`, `website/theme`, `admin/components`, `admin/deployment`, `website/widgets`,
`admin/pages`, `admin/posts`, `admin/themes`, `admin/collections`, `website/plugins`.

**Key reframing, in the report**: `deployments` measuring **99%** is itself evidence that the
unmeasured set likely contains **more already-covered directories than anyone expects**. The next
agent should go in expecting to *remove* rows from this list, not confirm them.

The report carries a full appendix (all 74 dirs' external-suite **file lists**, not just counts) and
a "what would settle each row" section with exact node/vitest commands, so Phase 2 resumes without
re-deriving the suite map.

**→ Resume Phase 2 in a FRESH agent when 1-min load is genuinely under ~8.**

---

## A8 DONE — CIC U-002 security gap CONFIRMED and fixed in TWO places (`c713a518`, `fe14089d`)

**Verified, not inherited.** `registerPluginSdkResolver` has 4 real call sites repo-wide; scoped to
`apps/website/src/cli/` it returns **zero**, with a control proving the pattern matches — so the zero
is real.

**Reachability chain, file:line:**
- `serve.ts:116` `runServeCommand()` — the packaged `tovu serve <dir>` path, **and what Tovu-Runner
  spawns per project** — never called the resolver.
- → `createSqliteRouteDeps()` (`deps.ts:696-704`) unconditionally builds
  `composePluginRuntime({..., installDir: pluginsInstallDir()})` — a real installDir, so
  site-installed plugin discovery is **live**.
- → `createApp(deps)` (`serve.ts:157`) unconditionally mounts `createPluginsModule(routeDeps)`
  (`app.ts:1098`) → `PATCH /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId`
  (`routes/plugins/set-enabled.ts:95`). Same route also reachable via the `plugins_set_enabled` Jini
  tool (`features/plugin-runtime/tool-registrations.ts:203`) — same composition, not a separate process.
- → `setPluginEnabled()` → `onPluginEnabled` (`plugin-runtime.ts:169-245`): for a site-sourced plugin
  it **omits `importModule`**, so `loadPlugin()` (`loader.ts:195`) uses its real default `import()`.

**CIC U-002-B1 read directly**: requires the hook "called exactly once, synchronously, during
`src/index.ts`'s boot sequence, before any route is registered and before any code path that could
reach `loadPlugin()` is wired into the running process" — **literally naming `index.ts` because that
was the only boot path when the CIC was written (2026-07-28)**. `serve.ts` and `export.ts` were added
later and never got the same wiring.

**Exploit, and honest severity — HIGH, not Critical.** A site-installed plugin
(`<installDir>/plugins/<id>/<version>/`) bundling its own `node_modules/@tovu/sdk` shadows the real
SDK via ordinary Node ESM resolution once `import()` runs with no `module.register()` hook active; a
fake `@tovu/sdk` can re-export `@tovu/core` internals freely, **defeating ADR-005's deep-import
block**. It does NOT require prior compromise — it is exactly the plugin trust model's own threat.
But Milestone 2's own note says plugin install/update is **unbuilt**, so no HTTP route plants a
plugin remotely today; today's actor is whoever can place files under `installDir` plus an admin who
enables it. **Becomes Critical the moment an install route ships.**

**Proven, not reasoned.** The regression test spawns a real `tovu serve`, plants a site plugin with a
shadow `node_modules/@tovu/sdk`, logs in as the real seeded admin, PATCHes the real
`PLUGIN_SET_ENABLED` route, and asserts the import never resolves to the planted copy. **RED observed
(`"planted"`), GREEN after — then the fix was flipped off and on again to confirm RED↔GREEN was not a
fluke.** Both reproduced cleanly. `serve-command.integration.test.ts` 15/17, the 2 failures being the
pre-disclosed load flakes (BR-07, CR-R04/CR-R01).

**Second sink found unprompted — `export.ts` (`fe14089d`).** `tovu export` builds the identical
`createSqliteRouteDeps()` composition and its `exportSite()` boots the `createApp()` equivalent
internally (`site-exporter.ts:823-824`, `createServer(routeDeps.createSiteApp()).listen(0)`), and
also never called the resolver. Fixed identically; its test proves registration by asserting a second
`registerPluginSdkResolver()` throws `PluginSdkResolverAlreadyRegisteredError`.
`export-command.integration.test.ts` 4/4.

**All other sinks audited, clean**: every non-test caller of `createApp(` repo-wide —
`site-exporter.ts`, `features/deployments/{tool-registrations,export-run}.ts`,
`lifecycle/{agent-daemon-port,daemon-supervisor}.ts`, `observability-middleware.ts`,
`server/routes/types.ts`. All but `index.ts`/`serve.ts`/`export.ts` only reference it in comments, or
(the admin `export-site` route, `app.ts:802/850`) call `exportSite()` at **request time inside an
already-booted, already-fixed process** — not a separate boot path.

### A17 — SEPARATE pre-existing bug: plugin loading is broken END TO END. Dispatched read-only.
`resolveDefaultSdkModulePath()` in `plugin-sdk-resolver.ts` computes the wrong relative path to
`packages/sdk/dist/index.js`. Verified nonexistent under **both** layouts: tsx/dev resolves to
`apps/website/src/packages/sdk/dist/index.js`, compiled resolves to
`dist/src/packages/sdk/dist/index.js`. **So even with the resolver correctly registered, a real
plugin's `@tovu/sdk` import fails with ENOENT.**

**This is FAIL-CLOSED, NOT a security regression** — the planted package still never gets reached
because `shortCircuit: true` prevents fallthrough. **Do not let it be re-escalated as a
vulnerability.** It is a functionality bug: no plugin can load.

**Why nothing caught it: no certified test has ever exercised the true default path — every existing
test overrides `sdkModulePath`.** So there is no regression risk either way, and also nothing telling
anyone it is broken.

Dispatched to `sdk-path-investigation` (read-only, software-architect persona): the right fix depends
on **the intended packaged-distributable topology for `packages/sdk`**, which is a design question.
**C14 — Leona's call**, once the options are costed.

---

## A17 VERDICT — SDK resolver path (`ec41b428`), fix dispatched
Report: `ADS-memory/reports/2026-09-05-plugin-sdk-path-verdict.md`.

**Confirmed, and worse than framed — the two layouts are off by DIFFERENT margins.** Dev/tsx is 6
levels below repo root (`apps/website/src/server/runtime/boot`); compiled is 5
(`dist/src/server/runtime/boot`, because root `tsconfig.json`'s `rootDir="apps/website"` collapses
that prefix). The code always does `../../../` — 3 ups. **Both computed paths verified missing.**

**Intended topology, cited**: ADR-005's own "SDK Resolution Mechanism" sub-decision (`adr.md:103-114`)
says `@tovu/sdk` lives in "the runtime binary's own `node_modules`" — **ordinary Node package
resolution, never hand-computed relative paths.** `node_modules/@tovu/sdk` is a real npm-workspace
symlink to `packages/sdk`, and the Dockerfile's production image resolves it that way too. **The
current code fights the ADR's own stated mechanism.**

**It never worked.** Correct only at authorship (`f23bbd63`, 3 levels deep, 3 ups). Silently broken by
`f9b42698` (added `runtime/`) then `708e81b2` (added `apps/website/`) — neither touched the path
string. **Never-finished, not a regression from a working state.**

**Why nothing caught it**: all three real call sites (`index.ts`, `serve.ts`, `export.ts`) pass zero
args; **only the certified test overrides the path.** The true default was never exercised.

**Pattern shape — NOT the "correct primitive, unwired call site" family.** Here the call sites are all
correctly wired; the primitive itself was right once and **rotted silently across two unrelated
renames** because nothing certified the default. Related root cause (untested default), different
mechanism.

**Approved: Option A** — `createRequire(import.meta.url).resolve("@tovu/sdk")`. Layout-invariant,
matches ADR intent, one function's blast radius, and **already idiomatic here**: `admin-static.ts`,
`deps.ts`, `otel.ts`, `mcp-injection.ts`, the SMTP adapter, `worker-sandbox.ts`.
Option B (patch the `..` count) rejected as fragile — **this failure class has already bitten twice.**
Option C (relocate build output) contradicts ADR-005's own rejected "shim directory" alternative.
Dispatched to `fix-sdk-resolver-path`.

### C15 — needs Leona: the root build never produces `packages/sdk/dist`
Confirmed: root `tsconfig.json` includes only `apps/website/src/**`; `emit-dist-package-json.mjs` has
no awareness of `packages/sdk`; `dev.mjs` never builds it; `packages/sdk/dist` is gitignored/untracked.
**Only `Dockerfile:57` builds it.** The copy on disk is a manual build — **a fresh clone has no SDK
dist at all outside Docker.** So even with the path fix, plugin loading stays broken on a fresh
clone until dev tooling builds the SDK. Build-pipeline change, distinct owner, **reported not
implemented.**

### Cross-cutting: `708e81b2` has THREE known victims
The `src/` -> `apps/website/src/` rename silently broke (1) two migration scripts entirely, (2) 43
more files' imports, (3) the SDK resolver path. **Root cause: `tsc` only includes `apps/website/src/**`,
so nothing outside it is checked.** Saved to memory with the sweep command.

---

## A18 — stale-import sweep done (`a4300236`). MY 43 WAS WRONG; the real number is 14.

**Correction to my own count**: the grep matched already-fixed files too, because
`apps/website/src/` still contains `/src/`. Resolved against the filesystem rather than trusted:
**29 fine, 14 genuinely broken.** One further false positive caught — `dead-path-sweep.test.ts`
matched inside a **fixture template literal** used to test the guard's own historical-detection
logic, not a real import.

**Fixed: 11, all in `development/evals/`** (`a4300236`). One needed more than a prefix rewrite —
`tool-registrations` was a directory (`tool-registrations/index.js`) and is now a single consolidated
file, so it became `tool-registrations.js`, verified against the actual listing. Three proved by
**execution** (`ERR_MODULE_NOT_FOUND` before, clean run after); the other 8 by static path resolution.
**Reachability: none have a package.json script or CI reference** — one-off research scripts from
2026-08-05/06, results already captured in reports.

Separate pre-existing bug found in `tool-search-caller2-score-captures.ts`, unrelated to the rename:
two self-referential paths at the wrong depth (`../../../development/evals/...` for same-directory
files) **resolve outside the repo entirely.** Left unfixed, flagged.

### The 3 NOT fixed were deliberately parked — correctly not overridden
`agent-plugin-activation.ts`, `install-agent-plugin.ts`, `theme-tool.ts` are genuinely broken (proved
by execution). But `development/scripts/lib/dead-path-sweep.ts` carries a
**`KNOWN_BROKEN_PENDING_OWNER_DECISION`** register listing these exact specifiers, with a same-day
rationale: *"mechanical fix possible, but the script has no test proving it still works against
today's schema, so a blind fix would ship an unverified migration tool."* **That decision stands.**
One correction to its framing: all three **DO** have package.json scripts — `npm run theme`,
`agent-plugin:install`, `agent-plugin:activation` — so they are manually reachable, just not
exercised by tests or CI.

### A19 — WE turned a test RED today. Dispatched to `fix-deadpath-register`.
`development/scripts/__tests__/dead-path-sweep.test.ts` is **currently failing, 32/33**, and it is
wired into `test`/`test:ci` via the `development/scripts/**/*.test.ts` glob. The failing case is
`"known-broken register has no stale entries"`: the register still lists **9 specifiers** for
`convert-legacy-doc-pages-to-html.ts` and `migrate-page-embed-markers.ts` under their OLD paths —
but those were fixed this afternoon (`bc4b847b`, `45474e26`), so the entries are stale and the
register's own staleness check catches it. **Our fix session caused this red.** The invariant
`assert.equal(..., 18)` needs a coordinated edit.

### C16 — needs Leona: extend the dead-path guard to `development/evals/`?
`collectSweepTargets()` walks only `development/scripts/**` plus two db `*.config.ts` files. **It
never covers `development/evals/` — where 11 of today's 14 genuine breaks lived.** Extending it is
mechanical, same pattern. **That is the real answer to "what gate would have caught this."**
Recommended, not implemented — a gate's scope is Leona's call.

---

## A17 FIXED — plugin SDK resolver path (`d64814cd`). Plugin loading works end to end.

**Fix**: `plugin-sdk-resolver.ts` — replaced
`path.join(import.meta.dirname, "../../../packages/sdk/dist/index.js")` with
`createRequire(import.meta.url).resolve("@tovu/sdk")`, matching the existing idiom in
`admin-static.ts` / `deps.ts` / `otel.ts` / `worker-sandbox.ts`. `registerPluginSdkResolver()`'s
frozen signature/JSDoc and **CIC U-002's ordering are untouched** — only the internal helper changed,
now exported so a test can assert its real return value instead of going through the `sdkModulePath`
override every other test in the module uses.

**RED, on the true default path** (the whole point — the bug survived because every existing test
overrode `sdkModulePath`):
```
+ actual:   '/Users/la/Programming/Tovu/apps/website/src/packages/sdk/dist/index.js'
- expected: '/Users/la/Programming/Tovu/packages/sdk/dist/index.js'
```
No pre-fix code was written into a tracked file to obtain this — the default was already broken, so
the new test simply observed current behaviour.

New test: `server/runtime/boot/__tests__/plugin-sdk-resolver.unit.test.ts`. GREEN. Regressions clean:
`plugin-sdk-resolver.integration.test.ts` 2/2, plus both CLI-level spawned-subprocess tests
(`serve-command-` and `export-command-plugin-sdk-resolver.integration.test.ts`) 2/2.

### The important catch: a GREEN test that tolerated the bug
**The CLI integration test's assertion is `observed.status !== "planted"`, which tolerates BOTH
`'real'` and `'import-failed'`.** Its own fixture comment names this exact bug as a known, tolerated
outcome. **So its green never proved the SDK loads** — only that the planted package was not reached.
The agent did not accept that as proof. It wrote a standalone script calling
`registerPluginSdkResolver()` with **zero args** (the real default) then dynamically importing
`@tovu/sdk`, mirroring a real plugin's `server/index.mjs`:
```
RESULT: real-sdk-loaded
definePlugin is function: true
```
**Same family as the `Themes.unit.test.tsx` trap**: a suite that is green because its assertion
cannot see the failure. Worth remembering as a review question — *what would this assertion still
pass under?*

### C15 is now BLOCKING more than it looks — the `packages/sdk/dist` build gap
Independently re-confirmed: root `tsconfig.json` includes only `apps/website/src/**`,
`emit-dist-package-json.mjs` has no knowledge of `packages/sdk`, `dev.mjs` never references it, and
`packages/sdk/dist` is untracked/gitignored. **Only `Dockerfile:57` builds it.** The local copy is a
manual build dated Aug 27.

Two consequences, both new:
1. **On a fresh clone, plugin loading still ENOENTs** despite this fix.
2. **The CLI test's weak assertion cannot be tightened until the gap is closed** — requiring `'real'`
   would turn it red on any machine without a manually-built SDK dist. So the weak assertion is
   locked in place by the build gap.

**Not verified**: whether the two CLI integration tests would have failed pre-fix (not revert-tested,
deliberately, to avoid churn on a file the live dev server watches) — the unit test's RED/GREEN pair
is the load-bearing proof. Also did not check `apps/admin`/`apps/site-chat` for a `@tovu/sdk`
dependency; none found in files read.
