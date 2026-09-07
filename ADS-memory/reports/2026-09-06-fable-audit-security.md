# Fable audit — SECURITY lens — window 4b89cd09..efc6847e

- Auditor: Fable 5.1 (subagent `fable-security`), dispatched 2026-09-07 00:01 local
- Audit HEAD (frozen): `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`
- Window: `4b89cd09..efc6847e` — 243 commits, all 2026-09-06
- Skills loaded: `AI-Dev-Shop/agents/security/skills.md`
- Mode: read-only. No tests, builds, typechecks, servers. Commit cadence: every ~5 min.
- Already fixed, NOT re-reported: J01, MI-01, MI-02, chat-run death path (`f682eff2`).
- Off limits: `apps/admin/src/features/menus/MenuEditor.*`.

Status legend: **CONFIRMED** = traced reachable path from untrusted input to sink, caller named. **PLAUSIBLE** = inferred, path not fully traced. **REFUTED** = codex claim did not survive reading the code.

## 0. Progress log (append-only, newest last)

- 00:01 — report created, first commit.
- 00:22 — boot token (`15548bef`) read end to end: `boot-session-token.ts`, `dev-auth.ts:391-427`, `serve.ts:259-283`, `desktop-auth.cjs`, `tovu-server.cjs`. Verdict below (§3a). INV-05 fix commit read; route file next.
- 00:12 — desktop read at frozen SHA: `project-delete-guard.cjs`, `project-ipc.cjs`, `main.cjs`, `desktop-auth.cjs`, `tovu-server.cjs`, `keyed-serializer.cjs`, `preload.mts`, `site-registry.cjs` (partial). D-04/D-05 verdicts below.

## 1. Codex claim verification (priority 1)

### D-04 — stale created-project row authorizes deletion of a replacement directory
**CONFIRMED (code read at efc6847e). Severity: High** (irreversible data loss; the guard's own doc claims it "fails CLOSED" on anything it cannot prove, and it does not prove this).

- `apps/desktop/src/project-ipc.cjs:151-167` `handleDelete(id)`: `row = readTrackedProjects().find(siteDir === id)`; if `mayEraseProjectDirectory(row, {repoRoot})` → `fsp.rm(id, {recursive:true, force:true})`.
- `apps/desktop/src/project-delete-guard.cjs:104-108` `mayEraseProjectDirectory`: tests ONLY (a) `row.origin === "created"` and (b) real-path containment outside `repoRoot`. Nothing consults the live directory: no marker check (`content.db`/`config.json`), no inode/dev identity, no workspaceId compare against the row. The row is the sole authority and the row is a path string in `desktop-projects.json`.
- Attack/loss path (operator-driven, no external attacker needed): create site A at `/x/a` (row: created) → move A elsewhere → place site B (or any files) at `/x/a` → the card for `/x/a` still shows (`readSiteName` reads B's `config.json`, so the card is even titled with B's name and `deleteErasesFiles: true`) → confirm delete → B is erased. B was never created by this app.
- Same shape as INV-05: the authorization is made against a stored record that no longer denotes the thing it names.
- Not mitigated by `rescanProjects` — discovery only adds rows; it never re-validates or downgrades an existing `created` row (see `adoptDiscoveredProjects`, to be confirmed in §1 sweep).

### D-05 — Delete erases a project while Start is opening it
**CONFIRMED (code read). Severity: Medium** (needs the operator to click Start then Delete inside the ≤60 s boot window; effect is a `tovu serve` child left running over an rm'd directory plus an `openSites` entry with no tracked row).

- `handleStart` (`project-ipc.cjs:205-211`) enters `deps.serializer.run(id, …)`; `handleDelete` (`:151-167`) never touches `deps.serializer` — `serializer` appears exactly once in the file, in `handleStart`.
- `main.cjs:569-576` `openSiteServer`: `openSites.set(siteDir, …)` only AFTER `await startSiteBackend()` (spawn + boot line wait, up to `DEFAULT_READY_TIMEOUT_MS = 60_000`, + boot-token redeem). During that window `openSites.get(id)` is `undefined`, so `handleDelete` skips `server.stop()`, untracks the row, and `rm -rf`s the directory the child is booting in. Startup then completes and publishes `{server}` into `openSites` and a crash-safety row into `open-sites.json` (`recordSiteOpened`, `main.cjs:472`).
- Reverse ordering also holds: `handleStart` validates the row OUTSIDE the serialized fn, so a delete landing between validation and `openSiteServer` starts a server for an untracked (and, for a `created` row, erased) directory.
- The `handleDelete` doc comment ("The server is stopped … BEFORE the directory is removed, so `content.db` is never unlinked out from under a live handle") is false for this interleaving.

### D-05 — Delete erases a project while Start is opening it
_(pending)_

### Sweep — authz against stale / attacker-influenceable record (INV-05 shape)
_(pending)_

## 1a. Loopback boot token (`15548bef`) + desktop auto-auth (`2aa317ab`) — what holding the token grants

Read: `apps/website/src/features/identity/boot-session-token.ts` (whole), `apps/website/src/server/inbound/admin-http/dev-auth.ts:258-427`, `apps/website/src/cli/commands/serve.ts:259-283`, `apps/desktop/src/desktop-auth.cjs` (whole), `apps/desktop/src/tovu-server.cjs:23-60,295-334,426-522`, `apps/desktop/main.cjs:407-488`.

**What the token grants:** one redemption → `mintSessionForPrincipal(deps, await deps.ownerPrincipalId)` (`dev-auth.ts:403-410`) → an ordinary revocable `sessions` row for the **seeded owner principal** of `deps.workspaceId`, with the library's default lifetime (the desktop-auth header says 30 days). It is a full-owner admin session, not a scoped one. That is the intended design; no bypass flag exists downstream.

**Scoping, verified in code (all hold):**
- Minted only when `--emit-boot-token` is on argv (`serve.ts:280`), inside the `listening` callback, so never for a failed boot; every other `tovu serve` has the route present but permanently closed (`redeem` on an unarmed store → `false` for every input, `boot-session-token.ts:95`).
- Single-use, digest+`timingSafeEqual`, failed redeem does not burn (`:94-106`).
- Route checks `req.socket.remoteAddress ∈ {127.0.0.1, ::1, ::ffff:127.0.0.1}` BEFORE looking at the token (`dev-auth.ts:275-278, 393`); `X-Forwarded-For`/`req.ip` not consulted.
- Token travels on the child's stdout pipe only (`stdio: ["ignore","pipe","pipe"]`, `tovu-server.cjs:450`); parent redacts it from mirrored output and from every `describeBootFailure` error string (`:38-51, 463, 485, 516`). Never in env, never on disk.
- Parent redeems (`authenticateSiteSession`, `main.cjs:407-432`) inside `startSiteBackend` BEFORE any `BrowserWindow`/`<webview>` exists, so an XSS in the site's admin (the `<webview>` guest is loopback and could POST to the route) finds the token already spent. If the parent's redeem fails on a transport error the token stays armed for the child's lifetime, but nothing else holds it.
- Reuse guard (`hasActiveSessionCookie`, `desktop-auth.cjs:192-195`) skips the mint when a `tovu_session` cookie already sits in the partition → `emitBootToken: false` → nothing minted.

**Observations (not defects in the token itself):**
- **SEC-03 (Low, PLAUSIBLE — pre-existing, not introduced in window, but the fleet-UI default makes it the default desktop experience):** `serve.ts:259` `app.listen(port)` binds ALL interfaces. Every desktop-spawned site admin (login form + `/api/assistant` daemon proxy) is reachable from the LAN. The boot-session route is loopback-gated, so the token is safe; the exposure is the ordinary admin login surface (rate-limited `LOGIN_STRICT`) on a machine whose operator never asked to serve a network. Commit `15548bef`'s own message acknowledges the bind. Recommend `app.listen(port, "127.0.0.1")` in the desktop-spawned path (the shell already hardcodes `http://127.0.0.1:${port}` as origin, `tovu-server.cjs:491`).
- **SEC-04 (Low, CONFIRMED):** `TOVU_AGENT_DAEMON_TOKEN` is minted per launch into the child's ENVIRONMENT (`tovu-server.cjs:299-301`), and `desktop-auth.cjs:22-24` itself states the reason env is unsuitable for a secret ("readable from the process list by anything running as this user"). The same reasoning was applied to the boot token and not to the daemon token. What the daemon token grants is examined in §1b (daemon-auth). Not written to disk by anything in this repo — the "launcher at 0700 baking a bearer" generation path is Tovu-Runner's, not found here: no `writeFileSync`/`chmod 0o700` of a token exists under `apps/desktop`, `development/scripts`, or `apps/website/src` (grep for `0o700|chmodSync|launcher` — only `agent-plugins/install.ts` dirs, `webhooks/keyring.env.ts` key file at 0600, `atomic-write.ts`).
- No rate limiter on `/auth/boot-session` (login has `LOGIN_STRICT`). Irrelevant at 256-bit entropy and loopback-only; noting for completeness, not a finding.

## 2. Codex `pending` commits (priority 2)
_(in progress — §1b daemon-auth, INV-05 route file, MCP federation next)_

## 3. Rest of window (priority 3)
_(pending)_

## 4. Findings (severity-ordered, filled as found)

| ID | Sev | Status | Where | One line |
|---|---|---|---|---|
| SEC-01 (=D-04) | High | CONFIRMED | `apps/desktop/src/project-delete-guard.cjs:104-108`, `project-ipc.cjs:164-166` | Erase authorized by a stale path-keyed row; live directory identity never checked |
| SEC-02 (=D-05) | Medium | CONFIRMED | `apps/desktop/src/project-ipc.cjs:151-167` vs `:205-211`; `main.cjs:569-576` | Delete bypasses the per-site serializer Start uses; rm under a booting child |
| SEC-03 | Low | PLAUSIBLE | `apps/website/src/cli/commands/serve.ts:259` | Desktop-spawned `tovu serve` binds all interfaces; admin + daemon proxy reachable from LAN |
| SEC-04 | Low | CONFIRMED | `apps/desktop/src/tovu-server.cjs:299-301` | Daemon bearer token passed via child env, contradicting the boot-token rationale in `desktop-auth.cjs:22-24` |


## 5. Open questions for the owner
_(none yet)_

## 6. Commit ledger (all 243)
_(pending — filled incrementally)_
