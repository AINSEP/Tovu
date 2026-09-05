# PRIMARY (Opus 5) — Round 2 frozen position

Frozen before dispatching Round 2. Round 2 is informed, so this IS disclosed to peers.

## Position changes since Round 1

**1. I was wrong on MCP-first. Dropped.** I ranked B1 top. All three external peers rejected it as an
organizing principle, and the Sonnet participant produced the decisive evidence: the packet's own
cited comment says the original motivating case for image generation was "an external MCP server
generating an image from a prompt" — yet when this team needed a *working* image tool **today**, they
shipped it through the vendor-adapter engine, not MCP. When it mattered, MCP-first lost to
adapter-first in this very repo. B1 is now: "prefer MCP when a vendor already ships a good one and
its trust story clears the bar" — never the default route.

**2. My retry rule was unsafe. Corrected.** I wrote "retry-once on 401" as a flat backstop. Codex is
right that replay safety depends on the operation: reads are replayable, mutations need an
idempotency key or a reconciliation lookup, and an ambiguous submission must become an explicit
`Unknown` state. A blind retry on a durable-write tool double-spends. Exactly-once cannot be
manufactured locally.

**3. My credential union was too weak. Corrected.** Codex: OAuth grants (authorization_code,
device_code) are *acquisition flows*, not runtime credential types — runtime OAuth state is
`{access, refresh, expiresAt, scopes, clientRef}`. And `signed{keyId, secret}` cannot express real
signing, which needs algorithm, region/service, session token, and sometimes a cert chain. The right
shape is a versioned auth-handler interface, not a two-field variant.

**4. I missed AAD entirely, and it is worse than any peer knew.** All three peers raised
tenant-scoped AAD independently; I raised it zero times. Verified since: **three** stores seal with
no AAD, per the codebase's own comments — and the `media_generate_asset` tool that landed *today*
inherited the gap knowingly (`media-generation/tool-registrations.ts:73`).

## What I hold

- Reject B4 (declarative DSL). Unanimous across all four Round 1 participants, and the repo's own
  `vendor-adapter.ts` header already argues it: `parseResponse` stays a real function because some
  vendors need a second network call inside parsing that no declarative DSL expresses without
  becoming its own escape hatch.
- Async durability, not the credential model, is the gating risk.
- The auth/shape seam belongs where the adapter builds an *unsigned* request and a broker attaches
  credentials. Every participant converged on this independently.

## The material update Round 1 could not see

My packet was wrong in ways that invalidate part of the round. Verified against source:

- **Nine credential-shaped tables, not four** (`schema.ts` 1415, 1470, 1557, 1725, 1808, 1936, 1997,
  2056, 2263).
- **Composio is already live** (`platform/connectors/`, 7 files, 2 tables) — a running, third-party
  instance of candidate A3. The peers were asked whether to *adopt* A3 while A3 was already in
  production.
- **`platform/oauth/token-refresh.ts` already implements** proactive skew refresh plus a
  cross-process compare-and-set lease where the loser waits rather than double-refreshing — the exact
  mechanism Gemini Pro named as its worst failure mode and recommended building.
- **`vendor-credentials/dual-read.ts` (288 lines) is a shipped migration playbook**, with a rule none
  of us derived: never build a generic cross-table decrypt path, because a legacy row's ciphertext
  auth tag only verifies against its own table's AAD lineage.
- **`imagerouter.ts:152` registers a `video` route** — a live vendor already stretched past the
  single-fetch core, holding one connection open for up to 10 minutes.

**Therefore my position shifts materially:** this is **not greenfield architecture. It is
generalization and consolidation of proven in-repo machinery that was each built for exactly one
consumer and never lifted.** The refresh lease exists but only MCP uses it. The migration playbook
exists but was applied to exactly two stores. A3 exists but only through a vendor. Recommending we
"build a broker with lease-based refresh and a dual-write migration" is, substantially, recommending
work that is already done and merely unshared.

## Where I now disagree with the strongest participant

Sonnet argues credential **storage/exposure policy should stay differentiated by trust tier** — that
the nine tables are not accidental, since they differ on whether a plaintext `masked` last-4 is safe
and whether AAD was retrofittable onto live rows. That directly opposes the other three peers'
unanimous "one unified record."

**I think Sonnet is half right, and this is the sharpest question left.** Unify *shape and lifecycle*
(one auth-handler interface, one refresher, one resolver). Do **not** assume one physical table. But
Sonnet's argument proves less than it claims: "these tables differ on whether AAD was retrofittable"
is a statement about *migration history*, not about *desired end state*. Three tables lacking AAD is
a defect the codebase itself flags — it is the strongest argument for consolidation, not against it.
Trust tier is a real axis; it should be a column and a policy, not nine schemas.

## What would change my mind

- If extending Composio covers ≥60% of realistic vendors, first-party credential work is largely
  wasted and the answer is "extend the broker we already pay for."
- If the `masked` last-4 column genuinely cannot be reconciled across trust tiers without weakening
  the stricter tier, Sonnet's differentiated-storage position wins outright.

## Build first — I now prefer Sonnet's over my own

I proposed an `applyAuth` seam with two variants. Sonnet's is better because it is not synthetic:
**fix the already-async `imagerouter` video path**, with `kill -9` mid-poll then restart as the pass
bar — no duplicate vendor-side charge, no state that lived only in the killed process. It proves
durable async on a case that is already broken in production rather than on a mock.

I would add one gate to it: **close the three no-AAD stores' gap first or explicitly accept it in
writing**, because every day that ships new consumers (one landed today) makes the retrofit larger.
