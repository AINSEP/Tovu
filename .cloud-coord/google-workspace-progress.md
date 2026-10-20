# google-workspace cloud build — progress

Status: PHASE A in progress — G1–G5 (Jini) dispatched in parallel.

## Step 0 / base
- cloud-proof: `4db891f3 cloud-proof: Linux vm /home/user/Tovu google-workspace` (Linux vm 6.18.44, 2026-10-20 05:16 UTC)
- Base check OK: form-destinations/registry.ts + agent-plugins/connect-tool.ts present on origin/restructure/apps-website-phased.
- `origin/cloud/forms-multidest`: does NOT exist (ls-remote empty) at start. G14 will build against the brief contract unless it appears.
- Jini proof pushed on `cloud/google-workspace` (from origin/general-work).

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
| G1 | running | cloud/google-workspace-G1 (Jini) | | |
| G2 | MERGED | cloud/google-workspace-G2 (Jini) | 70145356 | vault token store in integrations/api-connections/token-store; 17 tests; cx max 9; tsc clean (excl. known integrations test errors); guard 26 = base |
| G3 | MERGED | cloud/google-workspace-G3 (Jini) | 00a1b4cb | @jini-ai/oauth/loopback-receiver; oauth suite 313/313; cx max 9; 1 RED survivor (!consumed gap guard) → phase C |
| G4 | running | cloud/google-workspace-G4 (Jini) | | |
| G5 | running | cloud/google-workspace-G5 (Jini) | | |
| G6–G16 | pending | | | |

## Coverage / RED / complexity debt / removed checks
(phase C)

## Vendor-neutrality proof
pending (G9)

## Bugs + security findings pinned
- Jini `pnpm guard` has 26 violations on base general-work (311851df); lots add none.
- G2: no vault kind fits OAuth rows (Tovu secrets_vault_kind CHECK) → Tovu migration 0020 + platform VAULT_KINDS edit needed (G6). refresh.ts markNeedsReauthBestEffort swallows refused stale mark (reported). Lease 30s must exceed token timeout 15s.
- G3: agent-runtime/src/providers/oauth-callback-server.ts:134 non-constant-time state, :198 any host bind, :239 echoes provider error (reported). oauth endpoint-safety.ts:40 allowLoopbackHttp also allows http loopback token endpoints (reported). Wrong-state request consumes the one callback (by design, DoS of one attempt).

## Needs Chrome visual check locally
none yet

## Problems
none yet

## Next
Verify + merge G1–G5 as they finish; then G6/G7/G8.
