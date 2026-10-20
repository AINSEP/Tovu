# google-workspace cloud build — progress

Status: PHASE A — G1–G5 merged in Jini; G6/G7/G8 re-dispatched after RESUME (2026-10-20 06:18Z).

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
| G6 | VERIFY RED → fix running | cloud/google-workspace-G6 (Tovu 3d496ff19); Jini part merged 7846710b | — | slice works (27/27 own tests) but migration 0020 breaks tool-registrations.contracts (fresh content bootstrap behind CONTENT_MIGRATIONS, 29 fails; 35/35 base) + vendor word in a comment → fix subagent. Wiring (deps/app, connect deps, public route, G7 accessor, G14 port) owed in G6b after G7/G8 merge. Subagent hit 280k tokens. |
| G7 | VERIFY RED → fix running | cloud/google-workspace-G7 (502bd6813) | — | 16/16 own, tsc+typecheck:tests 0, cx unchanged vs base; importer run 628/629: federation-runtime-wiring 'surfaceExchanges is not defined' (10/10 on base) → fix subagent. Subagent hit 276k tokens. |
| G8 | VERIFY RED → fix running | cloud/google-workspace-G8 (a7c4bc090) | — | own 8+17 pass, root+admin tsc 0, cx ≤7, vendor clean; route-modules 'agent-plugins' route pin not updated (forms-admin case fails on base too) + i18n strings missing → fix subagent. |
| G1b | running (Jini fix lot) | cloud/google-workspace-G1b | | installCredential persists without lease (G2 refuses; Tovu workaround in vault-stores.ts); clientKind derived from authMethod (installed-app client needing a non-confidential secret) |
| G5b | running (Jini fix lot) | cloud/google-workspace-G5b | | no seam for plugin-supplied admin-surface action handlers/bootstrap data (G8 finding; needed by G9/G13) |
| G9–G16 | pending | | | |

## Coverage / RED / complexity debt / removed checks
(phase C)

## Vendor-neutrality proof
pending (G9)

## Bugs + security findings pinned
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
