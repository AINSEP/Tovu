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
- 01:10 — escapeHtml copies closed, sites tool, dev proxy, orphan reaper, IPC stubs, pages permission grant verified. §1i.
- 00:58 — media-import + http client, executor parity, sites route, adopt, duplicateSite, scripts, autosave read. §1f–1h; SEC-05/06.
- 00:44 — chat attachment trio + refusal-notice read; §1e. Next: BYOK executor stack, sites binding, adopt, duplicateSite, export href, escapeHtml copies, scripts, autosave route, media-import + http egress at HEAD.
- 00:33 — daemon-auth, INV-05 route, external-mcp guard/put/trust read. §1b–1d.
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

## 1b. Daemon token — what holding `TOVU_AGENT_DAEMON_TOKEN` grants
Read `apps/website/src/assistant/daemon-auth.ts` (whole), `agent-daemon-server.ts:27-57, 891-935, 1245`. The daemon binds `127.0.0.1` (`:1245`) and gates every route with `requireAgentDaemonToken` (no loopback exemption) except `POST /api/delegated-tool-calls`, which is exempt but requires a live `runId` (`resolvePrincipal`, `:891`). A holder of the token can start runs and execute tools against `content.db` — as the principal the proxy stamps into the run (`:27`, `:670` — decoded from the forwarded request). So the daemon token ≈ "any local process can drive the assistant as whichever principal id it stamps". Same-user threat model only; consistent with SEC-04 being Low.

## 1c. INV-05 fix (`8e973578`) — verified
`routes/workspace/delete.ts:64-98`: `:workspaceId !== deps.workspaceId` → 404; `authorize(workspace.manage)`; then identity guard `targetWorkspaceId === deps.workspaceId` → 409 `BOUND_WORKSPACE`. Because the first check narrows the target to the bound id, `deleteWorkspace` (`:92`) is unreachable over HTTP. Guard is on identity not count — matches the fix's claim. No sibling arm exists (workspace_delete tool is unwired per Jini's `UNWIRED_WORKSPACE_TOOL_IDS`; not re-verified in Jini, taken as a CLAIM). **Fix holds.**

## 1d. External MCP write grants (`0d9e41d5`, `ae13e739`, `37ac1943`) — in progress
- `routes/external-mcp/guard.ts:32-59`: one gate for list/put/delete — workspace narrow + `admin.integrations.manage` (site-owner level; a stored `command` is spawned as a child at daemon boot, so this permission == code execution as the Tovu process, stated in the file). Consistent across the three arms.
- `routes/external-mcp/put.ts:86`: `writeAllowedToolNames` is `asStringField` — a non-string collapses to `""` → clears every write grant (fail-closed; noted in-file as known).
- `mcp-federation/trust.ts:403-450`: both lists consulted; `writeAllowedButNotAllowlisted` is surfaced, never admitted. Admission is computed once at connect (R5) — config read at daemon start, confirmed by `put.ts:105-108` `restartRequired: true`.
- `refusal-notice.ts` (what the MODEL is told) — pending read for secret leakage.

- `refusal-notice.ts` (whole): every remote name re-checked against `SAFE_REMOTE_NAME` before it reaches the prompt (`:92-111`); explanations are fixed literals; connection id is operator-authored + pattern-validated upstream; list capped at 10 (`:100`). No command/env/URL of the connection is rendered. **No leak.**

## 1e. Chat attachments (`0b298d86`, `f281d3a2`, `feb8a777`, `72e1e529`, `3b196ffb`) — verified, one accepted widening
- `features/media/read-chat-attachment.ts` (whole): ref allowlisted (`:106`), sidecar dir parent-equality (`:282`), batch dir re-derived from canonical root not from the sidecar (`:193-201`), owner compared BEFORE the file is touched and an ownerless record matches nobody (`:296-303`), `isUnchangedAttachment` dev/ino/size + realpath (`:305-307`). HTTP shell (`routes/assistant/get-chat-attachment.ts`) collapses every refusal to one 404 body and sniffs content type from bytes, forcing download for html/svg/xhtml. **Sound.**
- `promote-chat-attachment.ts:38-52`: promotion is scoped by RUN claim (`resolveForRun(ref, ctx.run.id)`), not by owner; the file states the first-claimer-wins model for an unclaimed attachment. Cross-principal promotion therefore needs the victim's ref (`attachment:<uuid>`, 122-bit) or its absolute path (`<root>/<batchId 8-80 random>/<name>`), neither of which the discovery tool leaks (`list-pending-chat-attachments.ts:91` is owner-scoped). Read side is owner-scoped, promote side is run-scoped — an asymmetry, documented in-file as accepted. Not a finding; recorded so the next auditor does not re-derive it.
- Daemon principal: `agent-daemon-server.ts:670` `principal = { id: decoded.principalId }` straight from the proxy-supplied `contextRef`. Only the bearer gate stands between a local process and "run tools as any principal id" — this is the real impact statement for SEC-04 (still same-user, still Low).

## 1f. Media import + `platform/http` byte path (`dd187ece`, `b1ce2d0a`, `7b2a2007`, `916eb8b0`; post-freeze fix `103f7ae1` read at HEAD)
Read `features/media-import/{fetch-image,agent-tools,tool-registrations}.ts`, `platform/http/{client,egress-policies,transport.fetch}.ts` in full.
- SSRF guard holds: scheme allowlist + embedded-credential refusal (`client.ts:209-216`); DNS resolved then EVERY address classified, any non-public rejects (`:238-245`); connection pinned to the vetted IP with original Host/SNI (`transport.fetch.ts:46-57`); redirect target re-runs the whole guard and strips `authorization`/`cookie` cross-origin (`client.ts:355-372`); IPv4-mapped IPv6 in every spelling normalised (`:117-154`). Numeric-host spellings (`2130706433`, `0x7f000001`, `0177.0.0.1`) are not IP literals to `isIP`, go through `lookup`, and come back as dotted-decimal → classified → refused. `MEDIA_IMPORT_EGRESS_POLICY`: https-only, empty dev allowlist, 3 hops, 12 MiB. **No new SSRF finding.** MI-01/MI-02 fixed, not re-reported.
- Bytes: served `Content-Type` never read; sniffed type must be in a 5-type still-image allowlist (`fetch-image.ts:84-90, 248-254`); truncation checked before sniff (`:240`). Filename sanitised to `[A-Za-z0-9 -]`, extension from sniffed type (`:182-193`).
- **SEC-05 (Low, CONFIRMED — the refusal-collapse shape the brief asked about):** an egress refusal is a plain `Error` thrown from `client.ts:242` (`egress to '<host>' (<ip>) rejected: resolved address is <class>`); `fetch-image.ts:270-274` deliberately lets it propagate; `tool-registrations.ts:120` classifies only `MediaImportValidationError` as a caller-visible shape rejection. Everything else falls to the executor's generic failure. Attack-path-wise this hides nothing dangerous, but the operator/model sees "internal error" for a security refusal, and the audit row records a crash, not a block. Fix shape: a typed `EgressRefusedError` in `client.ts` that `withSchemaOnRejection`/the executor surface as a refusal.
- **SEC-06 (Low, PLAUSIBLE):** the policy caps are enforced AFTER the transport has buffered the whole body: `transport.fetch.ts:32,65-71` buffers up to `ABSOLUTE_MAX_BYTES` = 100 MiB before `client.ts:348-353` clips to the 12 MiB policy cap. `timeout` (`:52`) is a socket-idle timeout, not a wall clock, so a hostile CDN can hold one `media_import_from_url` call open for as long as it drips bytes and make the process hold ~100 MiB per concurrent import. Disclosed in the transport's own header as a v0 limitation; noting it because the media-import tool is the first agent-supplied-URL consumer of this transport.

## 1g. Executor parity (`08ace3ea`) — verified
`tool-executor-stack.ts:79-85` is the single composition (read-only gate innermost, audit, recovery); `byok-tool-surface.ts:450-454` calls it. Daemon call site to be confirmed by grep (below).

## 1h. `1044e2d5` escapeHtml apostrophes — the fix landed in 4 of 10 copies
Touched: `static-render.ts`, `site-exporter.ts`, `form-render.ts`, `render.ts`. Untouched copies in `apps/website/src`: `assistant/mcp-ui.ts:190`, `public-http/routes/site/store.ts:16`, `public-http/http/site/page-head.ts:194`, `newsletter-confirm.ts:40`, `newsletter-unsubscribe.ts:45`. The two newsletter copies escape only `& < >` but are used only in text-node contexts (`<title>`, `<h1>`, `<p>`) — safe as used. Checked: `mcp-ui.ts:190` and `store.ts:16` already escape `'`; `page-head.ts:194` escapes `& < > "` only, and every sink in that file is double-quoted (no `='${` interpolation exists). **No exposed copy — verified, not a finding.**

## 1i. Misc verified in this pass (no finding)
- `sites_duplicate_site` (`features/sites/tool-registrations.ts:131-178`): both names validated against `SITE_NAME_PATTERN` before any path join; flag + `switcherCompatible` + `system.write` in that order; target is `path.join(cwd,"sites",targetName)`. `duplicate-site.ts` copies only `layout.ts`'s allowlist (`uploads/themes/plugins/overrides/skills/agent-plugins`), regenerates `config.json` (domain/port reset) and `.site-meta.json` (fresh `siteId`); `content.db` goes through `duplicateContentDb`. `chat.db`, `*.bak`, `restore-point-*.db`, `ops/`, `out/` are excluded by not being on the list. Sound.
- Executor parity: `agent-daemon-server.ts:485` also calls `createAssistantToolExecutor`. Both surfaces share one stack.
- `admin-dev-proxy.ts` (`848ddd09`): `rejectUnauthorized:false` is scoped to a dedicated agent for the Vite upstream only; active only when `TOVU_ADMIN_DEV_PROXY_URL` is set and not SEA. Dev-only surface.
- `site-registry.cjs:140-268` orphan reaper: kills only a pid whose argv contains the row's `siteDir` AND `--port <n>` AND whose ppid is 1; re-identifies before SIGKILL. Fail-closed direction.
- `runner-ipc-stubs.cjs`: every unported `runner:*` verb (working-directory pick/exists/normalize, chat-attachments save, conversations) throws — the preload exposes them but nothing in main acts on renderer-supplied paths.
- `features/pages/permissions.ts`: `pages.edit_html` reaches `admin` (built-in role grant) and any custom policy holding `theme.edit`; `editor`/`viewer` structurally excluded. `wiring.ts` `reconcileGrantsOnBoot:false` only skips grants (fail-closed direction).
- `backfill-reset-admin-password.ts`: password from env or `--password=` (shell-history exposure acknowledged in-file), never echoed; dry run opens read-only. `cleanup-stale-owner-sessions.ts`: deletes only revoked/expired rows; restore point before delete.

## 2. Codex `pending` commits (priority 2)
_(in progress)_

## 3. Rest of window (priority 3)
_(pending)_

## 4. Findings (severity-ordered, filled as found)

| ID | Sev | Status | Where | One line |
|---|---|---|---|---|
| SEC-01 (=D-04) | High | CONFIRMED | `apps/desktop/src/project-delete-guard.cjs:104-108`, `project-ipc.cjs:164-166` | Erase authorized by a stale path-keyed row; live directory identity never checked |
| SEC-02 (=D-05) | Medium | CONFIRMED | `apps/desktop/src/project-ipc.cjs:151-167` vs `:205-211`; `main.cjs:569-576` | Delete bypasses the per-site serializer Start uses; rm under a booting child |
| SEC-03 | Low | PLAUSIBLE | `apps/website/src/cli/commands/serve.ts:259` | Desktop-spawned `tovu serve` binds all interfaces; admin + daemon proxy reachable from LAN |
| SEC-04 | Low | CONFIRMED | `apps/desktop/src/tovu-server.cjs:299-301` | Daemon bearer token passed via child env, contradicting the boot-token rationale in `desktop-auth.cjs:22-24` |
| SEC-05 | Low | CONFIRMED | `platform/http/client.ts:242` → `media-import/tool-registrations.ts:120` | SSRF/egress refusal surfaces as a generic internal error, not a refusal |
| SEC-06 | Low | PLAUSIBLE | `platform/http/transport.fetch.ts:32,52,65-71` | Body buffered to 100 MiB before the 12 MiB policy cap; idle-timeout only — slow-drip hold on agent-supplied URLs |


## 5. Open questions for the owner
_(none yet)_

## 6. Commit ledger (all 243)
_(pending — filled incrementally)_
