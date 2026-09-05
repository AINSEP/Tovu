# Outstanding worklist — 2026-09-03 session

**STATUS: paused by the owner. No new subagents until they say otherwise.**
Of the three agents running when the stop came, T and S have landed and been verified; only
`cx-R-rbac-outbox` remains. Peer session `tovu-f7` holds items 3, 7/21 and 23 with its own agents.

Full evidence for every item below is in `2026-09-03-complexity-swarm-findings.md` (15 findings).

---

## DONE AND VERIFIED THIS SESSION

- **Complexity campaign closed.** 68 violations / 43 files → **1** (the documented
  `mergeExternalMcpSavePrefill` exemption). Gate green: `0 new complexity violations (1 total,
  1 in baseline)`. 11 batches, each commit independently re-measured, baseline ratcheted DOWN.
- **`apps/admin` complexity: 11 → 0** (`1425da68`). Gate green against its 8 grandfathered entries.
- **Privilege escalation fixed** — Jini `32c58888` + Tovu `1ae2ac19`. `resetUserPassword` now takes
  `seededOwnerPrincipalId` and refuses a mismatched caller. Deliberately NOT the unconditional
  guard `disablePrincipal` uses: the self-caller case is a shipped incident-recovery path
  (`TOVU_ADMIN_RESET_PASSWORD` boot hook + `backfill-reset-admin-password.ts` CLI) and an
  unconditional refusal breaks it. INV-08 correctly judged inapplicable (no status change).
- **Stored XSS CLOSED on both render paths** — `a69f5892` (static tier menu links) and `0a41515c`
  (8 widget href sinks in `render.ts`). Zero unguarded author-controlled href sinks remain;
  `safeHref` uses 4 → 11. RED proof reverted the fix and produced exactly 8 failures, one per call
  site, through the real `renderSite → renderComponentBlock` composition. Fixture sweep: 25 href
  values across 7 files, all `#anchor`/same-origin, none required widening the allowlist.
  `attrs.icon`/`attrs.description` were a FALSE LEAD — `data-icon` attribute and text content, not
  URL sinks, already correct under `escapeHtml`.
- **Comments on unpublished entries fixed** (`9b67d4c6`) — gates on `status === "published"`, NOT
  `publishedAt`, because retraction never clears `publishedAt`.
- **Restore-point idempotency fixed** (`1738b578`) — repeat key returns the original instead of
  burning a second real backup.
- **Menu 400-not-500 fixed** (Jini `e467f5c4`) — 4 unguarded reads, not the 1 reported.
- **5 crashing gate scripts repointed** (`99635013`); dead-path-sweep gap closed; false
  "continue-on-error swallows it" rationale corrected (`9e6d5084`).
- **3 CI gates wired** (`99d5bec6`): coverage-integrity, seal-aad, default-credential.
- **2 stale tests corrected** (`df430ac5`) — neither was a bug.
- **False comments fixed** (`33cd80b3`) + register at `2026-09-03-false-comment-register-*.md`.
- **Jini watchdog false-positive fixed** (`0796d387`) — the one already live in prod via chat@0.3.4.
  `emit()` was the only reset signal, so a legitimate long tool call was indistinguishable from a
  stall. Added `suspendSlowRunNotice`/`resumeSlowRunNotice` around the daemon-awaited tool execute,
  plus `resume()` never re-arming after `finish()` cancelled. Also made `claimDue` sargable
  (`status NOT IN` → `IN`): query plan went `SCAN` → `SEARCH ... USING INDEX
  idx_jini_async_operations_claim`, proven by capturing the REAL prepared statement via a
  `Database.prototype.prepare` spy — the agent's first draft hand-rebuilt the query and false-passed
  pre-fix, which is why the spy matters.

---

## OWNER DECISIONS STILL OPEN

1. **Rotate the Fly admin password.** `~/.bash_profile:91` exports the live deployed credential;
   every agent shell inherited it and the value reached at least one transcript.
   `fly secrets set TOVU_ADMIN_PASSWORD=<new> -a tovu-ai-cms`, and move it out of the profile.
2. **`ADS-memory/governance/` is gitignored** (`.gitignore:118`). Three MANDATORY ACCEPTED ADRs and
   their index exist only on this machine. One-line fix drafted: `!ADS-memory/governance/`. The
   glob repoint is done in the working tree but **cannot be committed** while ignored.
3. **19 historical `check:secret-scan` hits** — all git history, tip clean, all in fixtures whose
   job is to contain credential shapes. Cheapest fix is a path-scoped allowlist, not a history
   rewrite. Gate also takes >2min, which is the real CI-wiring obstacle.
4. **ADR tier design** — three disjoint sets (`governance/adrs` 4 / `reports/architecture` 57 /
   `reports/pipeline/*/adr.md` unindexed). Pipeline tier has no index at all.
5. **GOV-ADR-003/004 govern code that now lives in `@jini-ai/cms`** — a Tovu-scoped review can
   never catch a DDL-generation violation. Needs an architecture call.
6. **Commit attribution**: dispatches asked for `Claude Sonnet 5`; the session instruction specifies
   `Claude Opus 5` and supersedes. Agents followed the session instruction. Reconcile or leave.

---

## NOT YET DISPATCHED — items 14-24 (owner released via peer, then paused)

| # | Item | Notes |
|---|---|---|
| 3 | `media/update.ts` stores literal `"null"` for `alt`/`caption`/`credit`/`title` | Owner ruled: "do the responsible thing." Sibling fields on the SAME endpoint treat null as clear. Alt text is an a11y surface — a screen reader announces "null". Must also: verify `updateMediaMetadata`'s contract can express "clear", **count existing poisoned rows**, keep omitted-means-unchanged, fix the doc comment that calls the bug deliberate. |
| 7/21 | Three untracked test files — **DONE** (peer `tovu-f7`) | `1ca7e2e8` redirects/list (6/6 as-is) · `96caeb7d` comments/data-module-install (**test bug**: asserted a `p_comments__settings` table that exists nowhere in production — `COMMENTS_DATA_MODULE` declares only `comments`+`moderation_log`; settings live in the ADR-028 ledger) · `65c311a2` newsletter/import-subscriptions (**three** test bugs, each surfacing only after the prior fix: nonexistent `deps.newsletterSubscriberRepo`, treating `save`'s `Promise<void>` as the saved row, asserting `failed[].subscriberId` when the shape is `{index,code,message}`). 14/14 green, nothing red committed. **Both reds were test bugs, not production bugs.** |
| 14 | RBAC chokepoint divergence | Tovu routes pass `entityType`, Jini chokepoints don't → spurious 403 for `resourceType: "entry"`-scoped principals. **Assigned to R, in flight.** |
| 15 | `update-campaign` scheduled-edit | Spec says draft OR scheduled; code permits draft only → 409. Spec-vs-code ruling needed. |
| 16 | Entries outbox never drained | `processOutbox` never called from entries/content-types routes. **Assigned to R, in flight.** |
| 17 | 7 Jini packages published ahead of HEAD — CONFIRMED | protocol 0.3.0/0.3.1 · agent-runtime 0.3.0/0.3.2 · daemon 0.3.1/0.3.2 · http-kit 0.3.0/0.3.3 · chat 0.3.2/0.3.4 · integrations 0.3.4/0.3.5 · cms 0.3.1/0.3.5 (committed/published). **Moving target** — `jini-publish` is bumping and publishing concurrently. Owner call on retroactive commits. |
| 18b | `better-sqlite3` lockfile drift — CONFIRMED, not fixed | `packages/integrations/package.json` wants `^13.0.0`; lockfile resolves `11.10.0`; **13.0.3 is what's actually on disk**. `pnpm install --frozen-lockfile` would not deliver what's been tested against. Lockfile NOT regenerated — owner call. |
| 18c | The CRASH watchdog has the identical gap | Same `emit()`-only reset and same `resume()` miss as the slow-run one just fixed — but it **terminates** runs. Dormant today (no production caller sets `inactivityTimeoutMs`), so a latent bug, not a live one. |
| 19 | `custom_credential_create` can't set `additionalHosts` | Chat path only; admin UI modal works. Why the fly.io credential had to be added by hand. |
| 20 | `check-jini-registry-drift.mjs` — VERIFIED SOUND, still untracked | Found live drift on `root` and `apps/admin` with correctly-attributed diagnostics (incl. `seededOwnerPrincipalId` from today's privesc fix). A no-op cannot produce that. **Recommend committing** — owner call. |
| 22 | ADR-PIPE-011 records "Red-Team has NOT run for SPEC-011" | Process gap, unverifiable from the tree. |
| 23 | Menu href write-path hardening (`menus/update-tree.ts`) | The durable half of the XSS. Render-only leaves the payload in the DB, and three render paths diverge. Settle reject-vs-coerce; **count existing non-conforming stored hrefs**; decide on backfill. Reuse `safeHref`, do not write a second allowlist. Enumerate every author-controlled attribute reaching a URL position, not just `href` (`icon`/`description`/`src` already flagged). |
| 24 | Production HTTP/2 unconfirmed (ADR C2) | One `curl --http2` settles it. **`gh` here answers about the WRONG repo** — get the hostname from `fly.toml` or the owner. If prod is HTTP/1.1 the fix is at Fly's TLS termination, an owner-approved config change. |
| — | `check:openapi-contract`: 27 real spec mismatches | Instrument repaired; readings not acted on. |
| — | `check:theme-replaced-elements` red | 4/5 themes missing `max-width:100%` on video/iframe. |
| — | 9 `check:*` scripts still in zero workflows | Distinct from wired-but-red. |
| — | Deferred `apps/admin` TSX logic | `AccessTokensTab`, `OtherCredentialsSection`, `ThemeExplore` fullscreen lifecycle, `SitemapModal`. |
| — | `static-render.ts` comment now stale | Still says the href scheme gap is a "KNOWN GAP, not fixed here". `0a41515c` closed it. Doc-only. |
| — | Reported-not-fixed | F-1/F-2 OAuth status lifecycle · F-9 settings-migration last-row-wins · `disclosure.ts` dead `restorePointId` (port can't carry it — needs the real watermark source) · `renameTerm` no OCC · taxonomy no slug/uniqueness · `maxPerIpPerHour` never reaches the live limiter · `verifySignature` has zero production callers · restore-point duplicate-CAPTURE race (unique index stops the row, not the backup) · Jini `workspace/delete.ts` doc comment still false. |

---

## PATTERNS FOUND (the reusable output of this session)

1. **Correct primitive, unwired call site — 8 instances, 2 repos.** The primitives here are good;
   the wiring fails. Auditing a primitive in isolation answers the wrong question — ask which call
   sites reach the sink WITHOUT it. Instance 1 had a clean 15-cell truth table while the bypass
   was live.
2. **Obvious fix, wrong field.** `publishedAt` would have caught drafts and missed every retracted
   entry. The plausible one-liner passes review and leaves half the hole open.
3. **A test pinned to a contract that later changed by design.** Reads exactly like a regression.
   Both of P's "failures" were this.
4. **Exit-code masking through pipes.** `cmd | tail` returns tail's status. Three false verification
   claims in one session, two of them the coordinator's. `timeout` also doesn't exist on macOS.
5. **A concurrent `npm install` can tear down `node_modules` mid-test-run.** A peer agent's run
   failed with `ERR_MODULE_NOT_FOUND` for `@jini-ai/ui/mcp-ui/surfaces` because PID 37014 was
   rebuilding `apps/website/node_modules/@jini-ai/ui/dist/features/mcp-ui/` — confirmed by watching
   the directory vanish and return across three `ls` calls. Same hazard class as the standing
   "never `pnpm -r build` mid-run" rule, but reached via `npm install`. **Any module-resolution
   failure filed during such a window is suspect and should be re-run before being believed.**

6. **A false belief about tooling becomes a disposition.** "continue-on-error swallows the crash"
   was wrong, was written into a register, and three broken gates were deliberately parked on it.
   Worse than a false comment, because it has the authority of a recorded decision.
