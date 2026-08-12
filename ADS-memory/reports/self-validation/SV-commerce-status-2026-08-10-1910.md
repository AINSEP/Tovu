# Self-Validation — Commerce Operational Status

- Service: Tovu admin API
- Owner: Commerce System Design + Programmer
- Run date: 2026-08-10T19:10:29-0700
- Outcome: PASS for the implemented route; host runtime declaration remains DRAFT/advisory

## Environment preflight

- Dependencies were already installed in the shared worktree; no download/install was run.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- Formal declaration checked at `ADS-memory/governance/contracts/runtime-validation.md`; it is still
  a DRAFT with placeholder boot/health commands, so the brownfield advisory rule applies.

## Runtime harness

- Harness: repo-local Node API integration server on an ephemeral loopback port via
  `src/server/__tests__/helpers/http-test-server.ts`.
- Critical path: authenticated owner requests
  `GET /api/admin/v1/workspaces/:workspaceId/commerce/status` with an injected provider runtime.
- Expected/result: 200; provider catalog returned; configuration, checkout, subscriptions, webhook
  reconciliation, and revenue remain unavailable. PASS.
- Null-runtime path: authenticated owner requests the same endpoint with default route deps.
- Expected/result: 200 with `paymentRuntime.status = "unavailable"` and an empty provider list. PASS.
- Negative paths:
  - no session → 401. PASS.
  - mismatched workspace → 404. PASS.
  - authenticated principal without `admin.integrations.manage` → 403 with `no_grant`. PASS.
- Safety probe: the injected runtime's charge, refund, webhook, get-payment, and list-payments methods
  throw if called; the successful status request called none of them. PASS.
- Log check: ephemeral servers booted and tore down without crash or leaked listener. No credentials,
  payment data, or external provider traffic were involved.

## Evidence

- Focused command: `node --import tsx --test` over the Commerce unit and route integration tests —
  7/7 pass.
- Expanded command: same runner plus existing payment-webhook and server-module tests — 17/17 pass.
- Retry pass: one test-only correction changed an expected denial reason from prose to Tovu's stable
  `no_grant` code; rerun passed. The later skepticism pass added an adversarial adapter-private-field
  probe, verified RED against a capability-object spread, replaced it with an explicit response
  allowlist, and verified GREEN.
- Bounded diagnosis pass: not used.

## Remaining risks

- A formally declared long-running production boot/health smoke command is unavailable until the
  host runtime-validation contract is completed.
- No external provider/account handshake was attempted; this slice intentionally contains no such
  operation.
