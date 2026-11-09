# EXTRACT-S7

Started 2026-11-09T17:40:00Z (conservative); deadline 2026-11-09T21:40:00Z. Four-hour owner cap includes S7-0; final 20 minutes reserved for shutdown and reporting. Serial execution; no subagents, publication or deployment.

## Verified starting pair

- Tovu origin: https://github.com/AINSEP/Tovu.git; fetched `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa`.
- Jini origin: https://github.com/AINSEP/Jini.git; fetched `46cd558de9c6b4fa882b46349450ce3bcf0a378d`.
- Both clean before branch creation; no local or remote `cloud/extract-s7` existed. Both branches created at those exact pins.
- Node v24.22.1, npm 11.9.0, pinned pnpm 10.33.2. Default pnpm is 11.25.0 and is not used for gates.
- Expected missing Tovu AI-Dev-Shop: Jini bootstrap loaded. Owner brief overrides pipeline delegation and historical cross-package architecture.

## S7-0 inventory

| Symbol/helper | Kind | Source | Resolution | Vocabulary |
| --- | --- | --- | --- | --- |
| resolveAgentPluginSignInPort | value | T features/agent-plugins/mcp-host-bindings.ts:45 | Delete retired test-only resolver and its type-only import; real isAgentPluginSignInRefusal stays | No new host vocabulary |
| Three dead-resolver test lines | test | T features/external-mcp/__tests__/h1a/hosted-mcp-error-identity.test.ts:48 | Coordinator-approved assertion removal, S4 retirement over S5 compatibility. Real-classifier assertion retained | One approved existing-test edit; outside subsequent F7 base |
| Registration/device/callback protocol-code sets | value | J oauth/src/{registration,device-code,authorization-code}.ts | One internal same-package set, identical 20-member contents despite order differences | OAuth protocol vocabulary, not host input |
| TOKEN_ERROR_CODES | value | J oauth/src/token-endpoint.ts:19 | Distinct 15-member set: preserve existing endpoint behavior | Brief's three identical sets refer to registration/device/callback, not token |
| OAuth error spec and adaptOAuthResponse comment | prose | J oauth/docs/spec/errors.spec.md:31; src/errors.ts:60 | Document protocol allowlists and plain unknown-code refusal/invalid_provider_error | No host vocabulary |

S7-0 is in progress. Baselines, gates, overlap accounting and final source pair will be recorded from actual results. No terminal marker has been written.

## Stop before L2

The untouched required baseline file `apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts` fails its fourth case, **bundled cold-start guidance names the enable tool and Agent Plugin family**: 3 pass, 1 fail, exit 1. Its regex requires `plugins_set_enabled` before `family: "agent-plugin"`; the pinned Jini Composio guidance instead says “enable the plugin with confirmation” followed by that family. Higgsfield guidance has the same wording pattern. Neither content file nor the test was changed here. The integrated receipt does not select this test. A fresh composed-bundle run after the clean package builds reproduced the same failure. This is prior test drift, not a missing emission or a new session regression. The owner stop rule blocks L2; it has not started. L3 and F7 have not started either.

## S7-0 implementation checkpoint

- F2: deleted the unused resolver and its type import, and only the approved three dead-resolver test statements (one setup and two assertions). All four test cases and the real classifier assertions survive. Real installed-error identity suite: 4/4 before and after.
- F3: shared the three identical 20-code registration/device/callback sets in one package-local module. The 15-code token set and all runtime strings remain unchanged. Corrected the OAuth spec/comment and existing minor changeset.
- Removed the stale plugin-runtime comment claiming that this file never uses `ToolInputError` and introduces no such convention; the uninstall-specific error behavior remains documented. The S9 changed-path inventory does not include this file.
- OAuth baseline/final suites: 42 files, 755/755. A first consolidation compile caught duplicate local declarations (TS2440 in three files); repair committed immediately. Build, typecheck, strict lint and subsequent full suite pass. Mutation removing `invalid_client`: exactly the existing recognized-registration case fails (24/25); restored source passes 25/25 and full 755/755.
- Current cross-package XP1–XP5 checker passes with the immutable original snapshot. Main Tovu types and changed-production strict lint pass. Final ready baseline selections and shutdown results are still being collected; no complete-extraction claim is made.
