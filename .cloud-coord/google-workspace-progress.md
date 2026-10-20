# google-workspace cloud build — progress

Status: PHASE A — Jini G1–G5 + G1b + G5b + G6-vault-kind merged; Tovu G7 + G8 merged; G6 fixed, G6b wiring running (07:25Z). Next: G6 merge → G9 + G10 (parallel) → G11/G12/G13 → G14.

## Step 0 / base
- cloud-proof: `4db891f3 cloud-proof: Linux vm /home/user/Tovu google-workspace` (Linux vm 6.18.44, 2026-10-20 05:16 UTC)
- Base check OK: form-destinations/registry.ts + agent-plugins/connect-tool.ts present on origin/restructure/apps-website-phased.
- `origin/cloud/forms-multidest`: does NOT exist (ls-remote empty) at start. G14 will build against the brief contract unless it appears.
- Jini proof pushed on `cloud/google-workspace` (from origin/general-work).

## Resume log
- 2026-10-20 06:18Z: fresh coordinator resumed (previous coordinator + subagents died at 05:46Z on account usage limit). Container is new: Node 24.22.0 re-installed to ~/.local/node24, AI-Dev-Shop re-cloned, Jini + Tovu re-installed/built, worktrees recreated. Coordinator re-loaded software-architect, code-inspection, security skills.md.
- Pushed lot work found at resume: Jini `cloud/google-workspace-G6` 00b05e13 (platform `api-connection` vault kind); Tovu `cloud/google-workspace-G8` 3cd9d157 (AgentPluginDetailsModal characterization pins); G7: nothing pushed. Fresh subagents continue from those branches.

## Personas
- Coordinator loaded: software-architect, code-inspection, security skills.md (all three).

## Setup (timings)
- Node: container had v22.22.0; installed v24.22.0 tarball into ~/.local/node24 (4 s). PATH must be exported per command (profile edits blocked).
- Jini: pnpm install 16 s; `pnpm --no-bail -r build` 95 s, only integrations' own test files fail tsc (known), dist emitted for all packages. Push to AINSEP/Jini works.
- Tovu: npm ci root 17 s, admin + site-chat ci OK; link:jini OK (57 links); @tovu/sdk build 1 s.
- Jini worktrees ../wt-j-G1..G5 created (install offline OK, dist copied).

## Seams reused (coordinator recon)
- `@jini-ai/oauth`: beginAuthorizationCode/completeAuthorizationCode (PKCE, extra params), createTokenRefresher (lease-aware), OAuthTokenStore port.
- Contract between G1 and G2 (parallel): G1 token storage port = `OAuthTokenStore & { delete({key}) }` keyed by opaque connection key; G1 owns a connection-record port holding status/account/credential generation; G2's vault store takes an injected fence reader (generation) and refuses stale persists.

## Lots
| Lot | Status | Branch | Merged SHA | Notes |
|---|---|---|---|---|
| G1 | MERGED | cloud/google-workspace-G1 (Jini) | merge + 1 coord test-typing fix (pushed) | api-connections service; 44 tests; cx ≤9; package.json conflict with G2 resolved; token-store re-exported from entry |
| G2 | MERGED | cloud/google-workspace-G2 (Jini) | 70145356 | vault token store in integrations/api-connections/token-store; 17 tests; cx max 9; tsc clean (excl. known integrations test errors); guard 26 = base |
| G3 | MERGED | cloud/google-workspace-G3 (Jini) | 00a1b4cb | @jini-ai/oauth/loopback-receiver; oauth suite 313/313; cx max 9; 1 RED survivor (!consumed gap guard) → phase C |
| G4 | MERGED | cloud/google-workspace-G4 (Jini) | pushed | agent-plugins/lifecycle/tools; 16 tests + 7 char pins; cx ≤9; plugins suite 442/443 — the 1 failure (install.unit 'lock creation rethrows faults') is env (runs as root), untouched file |
| G5 | MERGED | cloud/google-workspace-G5 (Jini) | pushed | agent-plugins/admin-surfaces (+/client); 70 tests; 31 RED checks; cx ≤9 |
| G6 | fix pushed (386d1db0c: fresh 0020 bootstrap op, 0020 now re-creates dropped MCP-identity trigger + pin, vendor wording); G6b WIRING running | cloud/google-workspace-G6 | — | G6b: adapt to G1b/G5b, wire service/connect deps/public callback, executable-tool host ports, admin-surface handler host. 12 real-Postgres tests not runnable here; postgres-baseline publish_history text-vs-jsonb fails on base too. |
| G7 | MERGED 3987044d4 | cloud/google-workspace-G7 (c951d4204 fix: daemon-catalog test harness binds surfaceExchanges) | 3987044d4 | importers 643/643, root tsc 0, typecheck:tests 0, inventory OK, boundaries 1069=base, architecture same 3 hard fails as base (API surface 660→661). Coord coverage: register 87.7/80/87.5, approval 79.7/66.7/100, host-capabilities 78.5/90/90 (phase C). cx: new ≤9; touched pre-existing fns unchanged vs base. |
| G8 | MERGED 02c8b43ce | cloud/google-workspace-G8 (fixes f64cf5e3c route pin, d8cc64d43 i18n 21 locales, ec280be35 non-array listing) | 02c8b43ce | website importers 104/105 (forms-admin route pin = base failure), admin plugins+assistant 396/396, AgentPlugins 12/12, root+admin tsc 0, cx ≤7, vendor clean; boundaries 1070 (+1: new test deep-imports platform/site-dir test helper, same as existing tests — phase B), architecture API surface →663. |
| G1b | MERGED (Jini 3f0cfe90) | cloud/google-workspace-G1b (549d7d87) | 3f0cfe90 | fenced token-store install() (no lease) for install/stageSwitch; explicit clientKind dep; vault label=key (fixed G2 bug: staged switch always collided). api-connections 60 tests pass, tsc no new errors, guard 26, cx clean. |
| G5b | MERGED (Jini b633dd94) | cloud/google-workspace-G5b (ca28a268) | b633dd94 | createAdminSurfaceHandlerHost + defineAdminSurfaceHandlerContribution (same trust gate as G4). agent-plugins 49 files pass, tsc 0, guard 26; added lifecycle/contribution-loader.ts + tools/capabilities.ts to jini.isolation.shared (no runtime imports; accepted, phase B review). Jini integrations + agent-plugins rebuilt 07:20. |
| G9–G16 | pending | | | |

## Coverage / RED / complexity debt / removed checks
(phase C)

## Vendor-neutrality proof
pending (G9)

## Bugs + security findings pinned
- G1b: oauth/src/token-endpoint.ts:55 puts provider `error` string unbounded into OAuthError.message → ApiConnectionError text (Low). G2 label=connectionId collision (fixed in G1b).
- G5b: bootstrap data deliberately not token-scanned (hosted Picker needs a short-lived access token; schema-checked, no-store) — matches owner decision; it is the connection's own token, not down-scoped. Handler/bootstrap calls have no deadline/signal (phase B fix). Per-call token scan cannot catch a token cached across calls (pinned, reported). trusted-plugin-files.ts:146 raw import error text in refusal line (may hold abs paths). Node module cache: changed module at same path not re-imported until restart.
- G6 fix: 0020 SQLite rebuild had dropped the secrets_vault_mcp_identity trigger (fixed + pinned before merge).
- G7 (a) Jini plugins/host tool-contributions.ts:21 sets requiresConfirmation for destructive/non-direct tools but Tovu executor has no confirm delegate → park forever; hits existing site executable plugin tools (capability-tool-registrations.ts:503) and their 30 s timeoutMs would cut a human confirmation (reported, not fixed). G7 adapter strips the flag and uses approval cards. (b) no per-plugin outbound host allow-list for plugin HTTP (phase B decision). (c) executable tools gated on admin.assistant.use (phase B decision). Gated-mutation owner (watermarked local DB mutations) fits no v1 op → not used (phase B confirm).
- G6: hosted callback rebuilds redirect URI from resolvePublicOrigin(req) — mismatched proxy/Host fails closed. runAgentPluginConnect 18/15 unchanged vs base.
- G8: public surface-files route reveals active plugins + their static surface files (by design: sandboxed scripts send no cookie); CSRF compares Origin to Host (proxy rewriting Host fails closed).
- Jini `pnpm guard` has 26 violations on base general-work (311851df); lots add none.
- G2: no vault kind fits OAuth rows (Tovu secrets_vault_kind CHECK) → Tovu migration 0020 + platform VAULT_KINDS edit needed (G6). refresh.ts markNeedsReauthBestEffort swallows refused stale mark (reported). Lease 30s must exceed token timeout 15s.
- G3: agent-runtime/src/providers/oauth-callback-server.ts:134 non-constant-time state, :198 any host bind, :239 echoes provider error (reported). oauth endpoint-safety.ts:40 allowLoopbackHttp also allows http loopback token endpoints (reported). Wrong-state request consumes the one callback (by design, DoS of one attempt).
- G1: getAccessToken checks plugin ownership only — host must authorize workspace (G6). Confirmed switch overwrites old tokens without remote revocation. PKCE verifier in record store: never log/export. startParams added (phase B review).
- G4: connectionRef ownership enforced by host capabilities port (G7); token scan 2 levels of cause; abort cooperative. agent-plugins vitest.config aliases @jini-ai/plugins/host to source (phase B: remove now main dist is fresh).
- G5: host must post init only on first load; surface scripts served ACAO:* must be public static; frame-ancestors 'self' assumes same origin.

## Needs Chrome visual check locally
- G8: plugin surface frame tab, CSP 'self' module scripts inside sandboxed frame, frame height, both status messages.

## Problems
- Resume: `git pull --rebase` flattened the Jini G6 merge commit into a linear commit (7846710b); coordinator now uses `git pull --rebase=merges` and so do subagents.

## Next
Verify + merge G1–G5 as they finish; then G6/G7/G8.
