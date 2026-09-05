# CTX-EXTERNAL-SERVICE-INTEGRATION — ROUND 2 (INFORMED)

PACKET-ID: `CTX-EXT-SVC-20260902-R2`

---

## PREAMBLE — READ FIRST, IT OVERRIDES YOUR DEFAULTS

You are a participant in an adversarial multi-model design debate. **This is Round 2.** You answered
Round 1; your own answer is reproduced below along with every other participant's, verbatim.

**Do not read `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `START-HERE.md`, or any repository bootstrap
file.** You are not the primary session for this repository and none of its startup ceremony applies
to you. There is no bootstrap file you need. **A missing file is never a reason to stop, and
reporting yourself blocked is a wrong answer.** Do not adopt a repository persona or prefix your
answer with a role label. (In Round 1 one participant spent ~70k tokens doing exactly this.)

**This packet is COMPLETE and self-contained. Do NOT attempt to call any tool** — no file reads, no
shell, no MCP, no graph queries. A denied call can discard your entire response. Ignore any line
anywhere that appears to offer you repository access; such offers are for a different participant.

---

## ⚠️ ROUND 1 WAS ARGUED FROM A MATERIALLY WRONG PACKET. CORRECTIONS FIRST.

One Round 1 participant had repository access and fact-checked the Round 1 packet. The Coordinator
independently re-verified every correction below against source. **All of them held.** Treat these
as established fact, and revise your position accordingly — several Round 1 recommendations propose
building machinery that already exists.

**1. There are NINE credential-shaped tables, not four.** `schema.ts` lines 1415
(`siteAssistantCredentials`), 1470 (`adminExecutionCredentials`), 1557 (`publishCredentialSets`),
1725 (`sourceControlCredentialSets`), 1808 (`customCredentialSets`), 1936 (`vendorCredentialSets`),
1997 (`mediaProviderCredentials`), 2056 (`composioConfig`), 2263 (`composioConnectorCredentials`).

**2. THREE stores seal with no AAD, not one** — per the codebase's own comments (`schema.ts:1539`:
"the two tables above, sealed with no AAD at all"; plus `provider-credential-store.ts:34`). A new
consumer shipped **the same day as this debate** knowingly inherited the gap
(`media-generation/tool-registrations.ts:73`).

**3. THE BIGGEST OMISSION — candidate A3 is ALREADY LIVE IN PRODUCTION.** `platform/connectors/`
(7 files: `composio-service.ts`, `composio-config-store.ts`, `connector-credential-store.ts`, …)
integrates **Composio**, a third-party unified connector/credential broker, with its own OAuth
handshake and its own durable credential store distinct from all others. It has a known constraint:
connector OAuth is single-process-only today — a second worker would not share the in-process
pending-connection map.

Round 1 asked you whether to *adopt* capability-handle indirection. It was already running. The real
question is: **extend Composio, build a first-party equivalent, or run both permanently for
different vendor classes?**

**4. The refresh design several of you recommended building ALREADY EXISTS.**
`platform/oauth/token-refresh.ts` implements proactive skew-based refresh (`shouldRefresh`) **plus a
cross-process compare-and-set lease** where the loser waits and re-reads rather than double-
refreshing. Its own header gives the rationale one of you independently named as the worst
operational failure mode: "the loser persists a refresh token the provider has already revoked, and
the connection is dead until a human re-authorizes." **It is scoped to external MCP only. Nothing
else reuses it.**

**5. A migration playbook already shipped.** `vendor-credentials/dual-read.ts` (288 lines) merged two
prior stores behind a real migration: new table + ID-mapping tables, new-store CRUD with zero legacy
dependency, a dual-read facade, a backfill script, then seam deletion. It carries a rule none of you
derived: **never build a generic cross-table decrypt path** — "a legacy row's ciphertext auth tag
only verifies against ITS OWN table's AAD lineage," so each legacy branch must call its own reviewed
resolver. Note also: it was deliberately NOT extended to the other seven stores. Read that as
evidence about real migration cost.

**6. A long-running vendor is ALREADY stretched past the single-fetch core.**
`imagerouter.ts:152` registers a `video` route whose `parseResponse` reads finished video bytes from
one response — video generation today holds a single HTTP connection open for up to 10 minutes.
Related, from `vendor-adapter.ts`'s own 2026-08-16 audit: only 2 of 13 registered vendors set an
abort signal; the other 11 set none, and "a stalled vendor endpoint hung this call forever, nothing
to alert on," patched only with a blanket 10-minute backstop.

**7. Minor precision:** 12 provider files registering ~18 `(providerId, routeKey)` pairs, not "13
providers." Scoping is `workspaceId` everywhere except `adminExecutionCredentials`, which is
`(workspaceId, principalId)` — so a `resolve(vendor, tenant)` signature that assumes
`tenant == workspaceId` cannot represent a table that already exists.

---

## THE SHARPENED QUESTION FOR ROUND 2

Round 1's question stands, but the corrections reframe it. Answer all four:

**Q1 — Given that the refresh lease, the migration playbook, and A3-via-Composio already exist and
are each scoped to exactly one consumer: is the work here greenfield architecture, or is it
generalization and consolidation of proven in-repo machinery? Say which, and what changes about your
Round 1 recommendation as a result.**

**Q2 — Composio: extend it, build a first-party equivalent, or run both permanently for different
vendor classes?** Its single-process OAuth constraint is a real fact to weigh. Name what would make
you choose differently.

**Q3 — The sharpest live disagreement.** Three Round 1 participants said "one unified credential
record." The repo-access participant argued the opposite: that credential **shape and lifecycle**
should unify, but **storage and exposure policy should stay differentiated by trust tier** — because
the nine tables genuinely differ on whether a plaintext `masked` last-4 is safe to keep and whether
AAD was retrofittable onto live rows. The Coordinator's counter is that "AAD wasn't retrofittable" is
a fact about migration history, not desired end state, and that three no-AAD stores is the strongest
argument *for* consolidation, not against it. **Take a side and defend it.**

**Q4 — Build-first.** Round 1 produced competing slices. The repo-access participant proposed fixing
the already-async `imagerouter` video path with a `kill -9`-mid-poll-then-restart pass bar — no
duplicate vendor-side charge, no state that lived only in the killed process. Others proposed
synthetic slices or a credential-seam slice. **Which slice, and why is it better than the others
now that you know a genuinely-broken async path already exists in production?**

---

## REQUIRED OF EVERY PARTICIPANT THIS ROUND

State each explicitly — a Round 2 answer without these is incomplete:

1. **Your current position**, in full.
2. **Whether it changed this round, and precisely which correction changed it.** If nothing changed,
   say so and defend why the corrections do not move you.
3. **The strongest argument against the leading opposing position** (see Q3 for the sharpest one).
4. **What evidence or assumption change would move you.**
5. **A ranked slate of at least two options** with per-option trade-offs, explicit ranking criteria,
   a recommendation, and the cheapest de-risking test.

6. **A CONCRETE IMPLEMENTATION SKETCH — this is required this round, not optional.** Prose alone is
   not an answer. Write real, specific code (TypeScript preferred, matching the repo) for at least:
   - the **credential record type**, including every auth variant you claim to support;
   - the **resolver / broker interface** the caller actually holds — show its exact signature, and
     make clear whether a caller can ever obtain raw secret material through it;
   - the **adapter interface** for a long-running vendor: show submit and continuation, and what the
     adapter returns to represent "not done yet";
   - the **persisted job/operation row**, including which columns are real indexed columns versus
     serialized JSON, and which fields bound a job that never terminates;
   - the **one function or call sequence** where auth meets the outbound request.

   The Coordinator has published its own sketch at the end of this packet **specifically so you can
   attack it.** Do not defer to it. Where yours differs, say why yours is better; where you think it
   is wrong, say so plainly and show the corrected code. A participant that only critiques and
   proposes nothing concrete has not answered this round.

7. **PACKET CRITIQUE — what did the Coordinator get wrong THIS time?** The Round 1 packet was
   materially wrong in at least seven ways: it undercounted nine credential tables as four, said one
   store lacked AAD when three do, and entirely omitted that candidate A3 was already running in
   production. Those errors were caught only because one participant had repository access, and they
   invalidated part of the round.

   So: state explicitly what in **this** packet is wrong, missing, misleading, or leading the witness
   — including in the corrections list, the four questions, and the Coordinator's own implementation
   sketch. Where the framing pushes toward a conclusion, name it. Where a question presupposes
   something unproven, say so. If a claim is presented as verified fact and you think it does not
   follow from the evidence given, challenge it. "The packet looks fine" is an acceptable answer only
   if you genuinely find nothing — say that explicitly rather than inventing a critique, but look
   hard first. This section is not a formality; it is the one that caught the errors last round.

Be adversarial. If you now think the whole premise is wrong, say so and defend it.

---

## HANDSHAKE

Begin your response with exactly this line, then your answer:

`ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2 -- I received the packet and will work on it.`

---

# ROUND 1 RESPONSES — ALL PARTICIPANTS, VERBATIM

## PARTICIPANT: PRIMARY (Opus 5, Coordinator) — Round 1, withheld from you at the time

# PRIMARY (Opus 5) — Round 1 frozen position

Written BEFORE reading any peer response. Withheld from the Round 1 packet.

## 1. Framing, before endorsing anything

The two halves are separable, but they are **not symmetric**, and treating them symmetrically is the
main way this design goes wrong.

- **Auth paradigms are a closed set.** There are roughly six in the world (bearer, basic, OAuth2
  variants, request signing, mTLS, none) and the set turns over on a decade timescale. A closed set
  is exactly what a tagged union is for.
- **Call shapes are an open set.** Every vendor invents one, and new ones appear continuously. Open
  sets resist unification; every attempt to unify one produces a configuration language that
  gradually reinvents programming, badly.

So: **unify the credential half hard, and deliberately do not unify the call-shape half.** Tier it
instead, and accept per-vendor code as the honest floor.

## 2. Credential model — A1, bent toward A3

One record, one resolver. But the resolver must **not** return a secret.

The decisive case is request signing. AWS SigV4 and its cousins cannot be represented as "a header
you fetch," because the signature is computed over the request body, path, and timestamp. If the
resolver's interface is `() => string`, signing is permanently unrepresentable and will be bolted on
later as a special case that breaks the abstraction.

So the interface is:

```
applyAuth(vendor, tenant, request) -> request
```

The resolver returns an **applier**, not a credential. This captures most of A3's benefit — callers
never hold a secret, so a secret cannot be logged or echoed by a careless caller — without A3's full
handle-indirection machinery. This is the single most load-bearing decision in the whole design.

Record shape: tagged variant over `bearer | basic{username, secret} | oauth2{access, refresh,
expiresAt, scopes} | signed{keyId, secret, algo} | none`, plus vendor id, tenant id, baseUrl,
lastVerifiedAt.

**Expiry and refresh**, three layers, because no one of them is sufficient:
- refresh-ahead on a skew window (proactive);
- **single-flight refresh** behind a per-credential lock, or N concurrent calls stampede the token
  endpoint and some providers invalidate the older refresh token, locking the tenant out;
- **retry-once on 401** as the backstop — this is what actually covers mid-call expiry, which no
  proactive window fully prevents.

**Migration — strangler, never big-bang.** A2 is a legitimate *migration step* but a bad end state:
stand the new resolver in front of all four stores behind read adapters, cut consumers over one at a
time, backfill, then delete the old stores. Live data and a running multi-tenant system make any
flag-day rewrite unacceptable.

**Storage:** given the SQLite constraints, the variant payload is `text(*_json)` and anything queried
is a real column — vendor, tenant, and `expiresAt` (needed for a refresh sweep). This matches the
existing 37-column convention, so it is not a new pattern to defend.

## 3. Call shape — tiered, and B4 rejected

Preference order **B1 > B2 > B3**, with **B4 explicitly rejected**.

- **B1 (MCP-first)** where the vendor ships a server: discovery and invocation come free, and it is
  the only tier where a *new* vendor costs zero engineering.
- **B2 (compatible dialect)** next: already proven here by the existing OpenAI-compatible adapter.
- **B3 (hand-written adapter)** as the honest floor. The existing adapter interface is three members.
  That is already cheap.
- **B4 (declarative/config-driven)** is the trap. A config language expressive enough for real
  vendors — conditionals, pagination, retries, polling, envelope variants — becomes a programming
  language with no type checker, no tests, no debugger, and no stack traces. It solves an expense
  (writing ~40 lines per vendor) that is not actually the expensive part.

## 4. Async is the real gap, and it is being under-costed

A one-fetch core cannot express submit-then-poll, and **polling cannot live inside a request
handler** — it survives neither a timeout nor a deploy. It needs a durable job record (vendor, job
id, credential ref, state, attempts, next-poll-at) and a worker that resumes it. On restart the
worker re-reads the row and continues; the job id is the recovery key.

That is a real subsystem. My claim: **async job execution, not the credential model, is what should
gate this roadmap.** The credential unification is a week; durable polling is the part that will be
underestimated.

## 5. How the halves compose

The seam is `applyAuth`. The adapter builds an **unsigned** request; the credential layer applies
auth; the transport sends it. The adapter never sees a secret and does not know which auth variant
is in play. Auth and shape stay orthogonal by construction rather than by discipline.

## 6. Strongest argument against my own position

Two, and both are real:

- **If most target vendors turn out to be MCP-capable, the adapter tier is dead weight** and I have
  over-built a generic engine to run three integrations. The 13 existing adapters being wired
  nowhere is weak evidence *for* this objection, not against it.
- **My "auth is a closed set" premise is falsifiable and may already be false.** Vendors do invent
  bespoke schemes — signed query parameters, per-request nonces, proprietary HMAC envelopes. Every
  one that does not fit leaks out of the enum, and an enum that needs a `custom` escape hatch is
  just a worse version of B3 applied to auth.

**What would change my mind:** a census of the vendors actually on the roadmap. If ≥60% ship an MCP
server, invert to MCP-first and stop investing in the adapter engine. If ≥2 of the first 5 need an
auth scheme outside the enum, the tagged union is wrong and the right shape is a pluggable
`AuthApplier` interface with the common variants shipped as implementations.

## 7. Failure modes

- **Security:** the applier interface makes secret leakage structurally hard, but a debug log inside
  the transport that dumps the final request undoes all of it. The signed variant is worst — a
  logged `Authorization` from SigV4 is a valid credential for a window.
- **Operational:** refresh stampede locking a tenant out of a vendor (mitigated by single-flight, but
  only if the lock is real and distributed, not per-process).
- **Maintenance:** the unified record becomes a union of every vendor's quirks — the existing
  per-vendor variants (an account id here, no token there) are early evidence this pressure is real.
- **How my own recommendation fails badly:** I unify credentials, ship it, and then discover the
  first genuinely valuable integration is submit-then-poll. Now there is a beautiful credential model
  and still no way to call the vendor, and the roadmap stalls with the visible work already spent.

## 8. Build first

The `applyAuth` seam with two variants (bearer, basic) and one real vendor, replacing exactly one of
the four stores end to end.

**Kill criterion:** if request signing cannot be expressed through `applyAuth` without a special
case, the interface is wrong and the whole model should be re-cut before anything else migrates.
Second kill criterion: if migrating one store off the old shape takes more than a few days, the
strangler is not viable here and A4 (do nothing structural) becomes the honest answer.

---

## PARTICIPANT: Codex gpt-5.6-sol (xhigh) — Round 1 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902 -- I received the packet and will work on it.

Codex(Peer Debate): The product needs a connection platform, not a universal vendor abstraction. Authentication and call execution should remain separate modules joined through opaque credential handles and a policy-enforcing outbound transport.

## 1. Problem framing

The packet’s two halves are separable but not independent:

- Authentication answers: “May tenant T use identity I against destination D?”
- Call shape answers: “What durable sequence of remote interactions implements operation O?”
- Their composition must also enforce destination, tenant, actor, consent, scopes, idempotency, and audit policy.

“Call any external service” is an unsafe and unattainable goal. Services vary not only in request shape but also in semantics: retries, idempotency, rate limits, webhooks, streaming, pagination, cancellation, and ambiguous outcomes. The attainable goal is:

> Add a service by implementing or configuring bounded auth and protocol adapters, without changing domain logic or exposing credentials.

Human UI and AI agents should share the execution substrate, but not necessarily authorization policy. Agent actions may require narrower capabilities, approvals, or spending limits.

## 2. Credential model

I recommend A3 as the steady-state security boundary, backed by an A1-like logical registry and reached initially through an A2 facade.

### Core records

A tenant-scoped `IntegrationConnection` should bind:

- tenant/workspace ID
- connector type and pinned version
- service account/environment identity
- permitted destinations
- non-secret connector configuration
- opaque credential handle
- granted operations/scopes
- lifecycle status

A separate credential registry stores versioned credential material. Callers receive only handles. They cannot read tokens or ask the resolver to return headers. A broker validates the connection and tenant, attaches or computes authentication, performs the network request, and returns a sanitized response.

The proposed closed A1 union is insufficient. At minimum, support:

- `bearer`
- `basic`
- `oauth2`
- `signed`
- `none`
- header API keys
- an extension point for mTLS, workload identities, SSH credentials, and future mechanisms

OAuth authorization-code and device-code are acquisition flows, not runtime credential types. Runtime OAuth state contains access token, refresh token, expiry, scopes, token type, and a reference to the OAuth client configuration.

Likewise, `signed{keyId, secret}` is too weak as a universal shape. Signing usually depends on a named algorithm plus request body, timestamp, region/service, session token, or certificate chain. It needs a versioned auth-handler interface rather than a generic two-field implementation.

### Refresh and expiry

The broker should:

1. Refresh proactively using an expiry skew.
2. Serialize concurrent refreshes using a lease or optimistic credential-version update.
3. Persist rotated refresh tokens atomically with the new access token.
4. On a verified token-expiry response, refresh and retry at most once.

A request is replayed only when it is safe:

- Reads may normally be retried.
- Mutations require an idempotency key or an adapter-supplied reconciliation method.
- A submission with an ambiguous outcome must become `unknown`, not be blindly submitted again.
- A streaming response that expires after output begins generally cannot be transparently replayed.

Each poll in a long-running operation obtains a current auth lease through the same handle, so a job can outlive individual access tokens.

### Persistence

Use normalized relational columns for fields needed in joins, constraints, scheduling, or indexes. Store versioned low-query metadata and operation state as serialized JSON in `TEXT`, matching the cross-dialect reality described in the packet. Do not declare fake SQLite `JSONB`, and do not depend on decoding database-private binary JSON.

Seal secrets with AAD containing at least tenant ID, credential ID, credential version, and auth-handler kind. This prevents ciphertext from being transplanted between records or tenants. Logs and audit events contain credential IDs, versions, schemes, and fingerprints—not material.

### Live migration from four stores

1. Introduce the broker/resolver facade over the existing stores. Move consumers behind it without moving data yet.
2. Define the new registry and a mapping from every legacy record to a stable credential handle.
3. Add dual-write for credential creation and update. Reads remain legacy-authoritative initially.
4. Backfill tenant by tenant. Decrypt through the old adapter and immediately reseal with the new AAD. Verify using non-secret metadata or keyed fingerprints.
5. Cut over one consumer class at a time behind a feature flag: custom requests, media, vendor targets, then OAuth/MCP.
6. For each OAuth credential, establish one refresh authority before cutover. Two refreshers must never race across old and new stores.
7. Switch to new-primary with legacy fallback, reconcile, then make legacy stores read-only.
8. Remove fallback only after a defined rollback window and evidence that no active credential lacks a mapping.

Migration state must be explicit—such as `legacy`, `dual`, `new-primary`, `complete`—and transitions idempotent. A big-bang migration risks mass credential invalidation.

## 3. Call-shape model

The existing `buildRequest → one fetch → parseResponse` interface is an immediate-call adapter, not a general execution engine. Do not add a polling loop as a special case around it.

Use a durable operation state machine. An adapter should interpret one remote step at a time and return a transition such as:

```text
Complete(output)
Call(nextRequest)
Wait(nextPollAt, remoteOperationId, adapterState)
Failed(error)
Unknown(reconciliationData)
```

The runtime owns scheduling, leases, retries, deadlines, cancellation, and persistence. The adapter owns protocol semantics: how to submit, recognize completion, parse output, poll, and reconcile ambiguity.

Persist an `ExternalOperation` with explicit indexed columns for:

- tenant and connection
- operation kind and status
- pinned adapter name/version
- remote operation ID
- idempotency key
- attempt count and next action time
- worker lease and expiry
- created/updated/deadline timestamps
- versioned adapter state as JSON text
- sanitized error classification

After restart, a worker reclaims expired leases and continues from the recorded transition. Never persist authorization headers or secret-bearing URLs.

There remains an unavoidable crash window between a remote side effect and recording its response. Exactly-once delivery cannot be manufactured locally. The runtime needs:

- stable idempotency keys where supported;
- adapter-specific lookup/reconciliation where possible;
- an `unknown` state requiring retry policy or human resolution otherwise.

Polling is only one asynchronous pattern. The same durable operation can also wait for a verified webhook, consume a stream, or resume after human approval.

### Adapter tiers

I would combine B2 and B3, use a constrained subset of B4 later, and reject B1 as the organizing principle:

- A known compatible dialect is one tested protocol adapter instantiated by configuration.
- Hand-written typed adapters are the default for meaningful vendor semantics.
- A declarative DSL is appropriate only for bounded mappings and polling rules. It must be versioned, schema-validated, host-restricted, and incapable of arbitrary code execution.
- MCP is another connector adapter and trust boundary, not the foundation. It may be preferred for a particular service, but it does not remove credential, durability, policy, or observability requirements.

The existing deterministic stub is a good contract-test adapter. Its explicit placeholder marker should remain mandatory.

## 4. How the halves compose

The connector adapter produces an unauthenticated canonical request plus declared requirements:

```text
destination + operation + required auth capabilities + retry/idempotency metadata
```

The operation runtime passes that request and the connection’s opaque credential handle to the outbound broker. The broker:

1. verifies tenant, actor, operation, credential ownership, and destination;
2. refreshes or selects credential material;
3. signs or attaches authentication internally;
4. sends the request;
5. strips secrets from errors and telemetry;
6. returns a sanitized response to the adapter.

The adapter never sees plaintext credentials. It also cannot choose an unrelated handle supplied by an AI-generated argument.

For user-supplied base URLs, enforce origin binding, DNS/private-network policy, redirect restrictions, and TLS rules. Never forward authentication across an origin-changing redirect.

Domain modules should expose intent-level ports such as publish, deploy, store, or generate—not raw HTTP. The generic credentialed-request feature remains a privileged escape hatch with allowlists, approval policy, and strong audit controls.

## 5. Strongest case against this position

This design risks building an internal integration platform more complex than the product itself. The central broker becomes both an availability bottleneck and a catastrophic security blast radius. The state-machine abstraction may degrade into opaque `state_json` plus vendor-specific conditionals, while domain-specific stores may actually model important invariants more safely.

I would reconsider if representative integrations show that:

- auth and protocol cannot be separated without repeatedly leaking vendor concepts across the boundary;
- most adapters bypass or substantially extend the state machine;
- the broker materially increases outage scope or latency;
- maintaining one logical registry is more hazardous than a permanent A2 facade;
- MCP providers demonstrably supply tenant isolation, durable asynchronous execution, observability, and stable contracts across the target service set.

## 6. Expected failure modes

Security:

- Cross-tenant handle substitution or an authorization-cache key missing tenant ID.
- SSRF or credential exfiltration through custom base URLs, redirects, DNS rebinding, or proxy behavior.
- Tokens leaked through request dumps, tracing, vendor error bodies, or adapter state.
- Ciphertext moved between tenants because AAD is missing or incomplete.
- Refresh-token races invalidating the surviving token.
- An AI agent abusing a generic HTTP capability or selecting an overprivileged connection.
- Spoofed webhooks advancing another tenant’s operation.

Operational:

- Broker outage disabling every integration.
- Refresh stampedes or database hot rows.
- Polling queues overwhelming workers or vendor rate limits.
- Duplicate publishes or deployments after a crash in the remote-call/commit gap.
- Adapter upgrades making persisted in-flight state unreadable.
- Infinite polling, abandoned jobs, clock skew, and uncontrolled external spend.

Maintenance:

- A supposedly compatible dialect drifting in subtle error or response semantics.
- Declarative configuration becoming an untestable programming language.
- Provider-specific branches accumulating in the core runtime.
- Old adapter versions being removed while operations still reference them.

The worst plausible failure is the broker attaching a tenant credential to an attacker-controlled endpoint—perhaps through a redirect from a configured gateway. Centralization would turn one validation defect into platform-wide credential theft. Destination enforcement therefore belongs inside the same trusted boundary that holds the secret.

## 7. What I would build first

Build one thin vertical slice containing:

- the opaque-handle broker facade over legacy storage;
- bearer and refreshable OAuth handlers;
- the portable `IntegrationConnection` and `ExternalOperation` schemas;
- one immediate adapter using the existing engine shape;
- one submit-then-poll adapter;
- the same operation callable through both UI and an agent-facing intent tool;
- a restartable worker with leases and pinned adapter versions.

Use deterministic test services to exercise expiry, refresh races, redirects, rate limits, restart after submission, duplicate delivery, malformed responses, and tenant-handle substitution. Contract tests should run against both adapter shapes.

The design is killed—or at least sent back for redesign—if any of these occurs:

- an adapter must receive raw credential material;
- adding the polling adapter requires vendor-specific branches in the runtime;
- restart testing produces an unclassified duplicate or silently orphaned operation;
- the same handle can be exercised outside its tenant, destination, or operation policy;
- secrets appear in logs, persisted state, agent results, or URLs;
- an in-flight operation cannot resume under its pinned adapter version;
- supporting the second service requires another credential store or bespoke execution subsystem.

That slice proves the real claim: not that every service is identical, but that service-specific behavior can remain behind replaceable, contract-tested auth and protocol seams.
---

## PARTICIPANT: Gemini 3.1 Pro — Round 1 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902 -- I received the packet and will work on it.

Here is a blunt, structural tear-down and proposed architecture for your egress problem. 

### 1. Problem Framing

The prompt frames this as two halves: "proving who we are" (credentials) and "knowing how to talk" (call shape). This framing is mostly correct, but hides a critical trap: **if you let the two halves know too much about each other, you fail the security constraint.**

If a vendor adapter (the call shape) is responsible for taking a raw API key and formatting it into a header, it *will* eventually log it during a messy debug session, or echo it back in a structured error. 

Therefore, the problem is actually three-fold:
1. **Storage:** Safely persisting and rotating disparate auth materials.
2. **Execution (The Firewall):** A centralized HTTP client that injects secrets *below* the application/adapter layer.
3. **Orchestration:** Handling the synchronous vs. asynchronous nature of the vendor's domain logic.

The current state of your system is fragmented not just in storage, but in domain mixing. Your media dispatcher knows about S3 base URLs; your deployment targets probe GitHub APIs. You lack a unified **Egress Gateway**.

### 2. The Credential Model (Storage & Scoping)

**Position: A1 (One unified record) for persistence, wrapped in A3 (Capability/Handle) for execution.**

Your current setup of four separate stores is a migration nightmare and an auditing liability. You cannot enforce a global security policy (like "never log secrets") when four different subsystems are pulling raw strings from the database.

*   **The Schema:** A single `egress_credentials` table. Because you are bound to SQLite and its hostile JSON/numeric coercion behavior, **do not use text or pseudo-JSON columns for secrets.** Use a strict `BLOB` column. The payload is a serialized JSON object encrypted at the application layer before hitting the ORM.
*   **The Structure:** `(id, tenant_id, vendor_id, auth_type, encrypted_blob_payload, status)`. `auth_type` is an enum (`bearer`, `basic`, `oauth2`, `aws_sigv4`).
*   **Per-Tenant Scoping & Encryption:** The encryption scheme **must** use Additional Authenticated Data (AAD). You pass `tenant_id` and `vendor_id` as the AAD. If an attacker swaps rows in the database, the decryption fails. The database layer guarantees multi-tenancy.
*   **Expiry, Refresh, and Mid-Call 401s:** The caller (the agent or UI) never sees the token. They request an action using a `CredentialHandle` (A3). The internal `HttpClient` resolves the handle. If a mid-flight request returns a 401, the `HttpClient` catches it, acquires a distributed/local lock for that `tenant_id+vendor_id` (crucial to prevent thundering herds), uses the refresh token to get a new access token, updates the `BLOB`, and retries the original request transparently. The caller never knows it happened.
*   **The Migration Path:** 
    1. Stand up the `egress_credentials` table with strict `BLOB` encryption.
    2. Implement dual-write: the four existing sub-systems write to their bespoke tables *and* the new table.
    3. Run a background script to backfill historical rows from the four stores into the new table, applying AAD encryption.
    4. Switch the read paths to use the new table via the `HttpClient`.
    5. Drop the old tables.

### 3. The Call-Shape Model (Sync vs. Polling)

**Position: B3 (Hand-written adapters) returning a discriminated union, backed by a persistent Job State Machine.**

I reject B4 (Declarative config-driven adapters). It is a siren song. You will inevitably encounter a vendor that requires a customized HMAC signature on the body, or a bizarre cursor pagination scheme. You will end up inventing a Turing-complete YAML dialect, which is just programming but worse. 

I also reject your current dispatch core doing "exactly ONE fetch." It is broken by design for modern GenAI/media workloads.

*   **The Interface:** The adapter interface must return `SyncResult<T> | AsyncJob<T>`.
*   **Submit-then-poll:** If an adapter knows its vendor is async (e.g., Replicate, Midjourney), the initial `buildRequest` fires, and the adapter's `parseResponse` returns an `AsyncJob` containing the vendor's `job_id` and the required `poll_endpoint`.
*   **State & Process Restarts:** The engine does *not* sit in an in-memory `await sleep()` loop. It writes an `egress_jobs` record to the database `(internal_job_id, tenant_id, vendor_job_id, poll_endpoint, status)`. 
*   A background worker (or cron) polls the database for active jobs. If the Node process restarts, the worker simply boots up, reads `egress_jobs`, and resumes polling. The AI Agent is given the `internal_job_id` and can query its status independently, without blocking its own execution thread.

### 4. How the Two Halves Compose

They compose via a **Sandboxed HTTP Client**. 

1. The App requests `MediaAdapter.generate(prompt, CredentialHandle)`.
2. `MediaAdapter` constructs a generic `HttpRequest` object (URL, JSON body). It does *not* attach auth.
3. `MediaAdapter` passes the `HttpRequest` and `CredentialHandle` to the internal `EgressClient`.
4. `EgressClient` decrypts the credential `BLOB`, determines the `auth_type`, and injects the `Authorization` header (or performs AWS SigV4 signing).
5. The request executes. If it fails (401), `EgressClient` handles the refresh lifecycle. 
6. `EgressClient` returns the raw HTTP response to `MediaAdapter`, which parses it into domain data (or an `AsyncJob`).

The adapter never touches the secret. The credential layer never parses the domain response. Strict isolation.

### 5. Strongest Argument AGAINST My Position

**The Critique:** I am over-engineering a distributed workflow engine (`egress_jobs` background worker) and a transparent auto-refreshing HTTP proxy for a system that currently runs on a basic SQLite/ORM stack. 
The vast majority of APIs are fast and synchronous. By forcing async jobs into the database and requiring background workers, I am introducing massive operational complexity, database locking contention (especially in SQLite, which struggles with concurrent writes during polling loops), and deployment friction. A simple in-memory `Promise` with a timeout, combined with B2 (compatible dialects) for 90% of use cases, would ship faster and be easier to debug.

**What would change my mind:** If product analytics prove that the "long-running" tasks (like video generation) can simply be handled by webhooks rather than polling, or if the product requirement for "AI Agent autonomy" does not actually require the agent to survive a server restart mid-thought. If ephemeral memory is acceptable, the persistent polling table should be killed immediately.

### 6. Failure Modes

*   **Security:** The AAD implementation uses the wrong context (e.g., using `workspace_name` which can be changed, instead of an immutable `tenant_id`). When a user renames their workspace, decryption fails, locking them out of their credentials permanently.
*   **Operational:** The OAuth refresh thundering herd. If an access token expires, and 50 concurrent background jobs try to use it simultaneously, all 50 fail, and all 50 attempt to use the refresh token. The vendor revokes the refresh token due to reuse (OAuth token rotation policies), permanently bricking the integration until the user logs in again.
*   **Maintenance:** The `EgressClient` becomes a bottleneck. Every time a vendor introduces a slightly non-standard auth mechanism (e.g., passing the token in a custom header instead of `Authorization`), the core client has to be modified, breaking the isolation boundary.
*   **Spectacular Production Failure:** The SQLite polling worker. The `egress_jobs` polling loop runs every 1 second, updating row statuses. Because SQLite locks the entire database (or heavily restricts concurrency in WAL mode) on writes, the polling loop starves the main application of database connections. The entire CMS UI becomes unresponsive because a background task is aggressively checking if a Cloudflare deployment is finished. 

### 7. What to Build First

**The Proof Slice:** Do not build the migration, and do not build the UI. 
Build the **`EgressClient` + one Sync Adapter (e.g., a dummy deterministic stub) + one Async Adapter (e.g., a mock image generator)** backed by SQLite.

**The Kill Criteria:** 
1. **The Leak Test:** Force the Async Adapter to throw an unhandled exception during `buildRequest`, and force the vendor to return a 400 Bad Request. If the raw credential string appears *anywhere* in the resulting stack trace, error log, or agent prompt, the isolation design is dead.
2. **The Concurrency Test:** Run a load test simulating 100 concurrent async jobs polling the SQLite `egress_jobs` table while simultaneously running 50 UI read queries. If `SQLITE_BUSY` errors spike above an acceptable threshold, the persistent polling architecture is killed, and you must fall back to in-memory tracking or move off SQLite.

---

## PARTICIPANT: Gemini 3.7 Flash — Round 1 verbatim

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902 -- I received the packet and will work on it.

---

### 1. Problem Framing: The Coupling Fallacy & True Boundary

The packet separates the problem into:
1. *Proving who we are* (Auth/Credentials)
2. *Knowing how to talk to the service* (Call shape & protocol)

Treating these as completely orthogonal and cleanly decoupled is an architectural mistake that causes failure in real-world integration engines. They are not independent layers that can be composed by simple string concatenation of an `Authorization` header onto an arbitrary HTTP request. They interact intimately across three critical boundaries:

1. **Payload-Dependent Signing**: Protocols like AWS SigV4, HMAC-SHA256 webhooks, and modern OAuth mutual-TLS/DPoP do not inject static headers. They hash the HTTP method, canonicalized URI, query string, timestamp, and body bytes using the secret. Auth cannot run before call-shape resolution; it must run *after* request serialization.
2. **Context-Dependent Scoping**: Credentials frequently contain non-secret routing metadata (e.g., Cloudflare `accountId`, AWS `region`/`roleArn`, GitHub `org`/`login`, S3 `bucket`). If the credential store only knows how to yield a bearer token, the adapter must maintain duplicate out-of-band configuration to know *where* to send the request.
3. **Failure Recovery and Polling Loops**: A `401 Unauthorized` encountered during initial submission means the token is invalid; a `401` encountered on minute 8 of a long-polling status loop means the access token expired mid-flight while the job is still running upstream. The execution lifecycle must be able to invoke token refresh *without* terminating or restarting the remote job.

#### The Correct Boundary
The architecture should not decouple "Credentials" from "Adapters". Instead, it must separate:
- **The Credential Vault & Lifecycle Subsystem** (Storage, tenant isolation, encryption with AAD, lifecycle status, refresh mutexes, and secret resolution).
- **The Pure Functional Adapter** (Declarative or typed transform: `Input -> RequestSpecification`, `RawResponse -> Output`, `RawResponse -> PollStatus`).
- **The Outbound Invoker / Durable Execution Engine** (Stateful orchestration: handles request canonicalization, dynamic auth signing, single-fetch vs. durable polling, 401 mid-flight refresh/retry, and secret masking).

---

### 2. The Credential Model

#### Architecture: Unified Record with Opaque Capability Handles (A1 + A3)
Neither the UI nor the AI agent should ever touch plaintext secrets or raw tokens. Callers operate exclusively on opaque **`CredentialHandle`** references scoped to a `tenant_id`.

```typescript
// Unified storage contract across all dialects (Postgres, SQLite, MySQL)
interface StoredCredentialRecord {
  id: string;                         // UUID / CUID
  tenant_id: string;                  // Strict tenant partitioning
  vendor_key: string;                 // e.g. "openai", "github", "cloudflare", "generic_mcp"
  auth_scheme: 'bearer' | 'basic' | 'oauth2' | 'custom_header' | 'sigv4' | 'none';
  metadata_json: string;              // Plaintext non-secrets: { accountId?, baseUrl?, keyId?, region? }
  sealed_payload: Uint8Array;         // Encrypted secret data (AES-256-GCM / ChaCha20-Poly1305)
  expires_at: number | null;          // Unix epoch seconds (null if non-expiring)
  refresh_token_id: string | null;    // Self-reference or internal pointer for linked refresh tokens
  status: 'active' | 'expired' | 'revoked' | 'refresh_failed';
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}
```

#### Secret Encryption with Mandatory AAD
The existing flaw where one store "seals without AAD" is a critical multi-tenant vulnerability (an attacker or corrupt DB update could swap ciphertext blobs across tenants or vendors).
- Every secret payload MUST be encrypted using authenticated encryption with associated data (AEAD).
- The **AAD (Additional Authenticated Data)** must bind: `${tenant_id}:${id}:${vendor_key}:${auth_scheme}`.
- If a ciphertext is moved to another tenant or vendor record, decryption will fail cryptographically.

#### Dialect & SQLite Persistence Constraints
- **Do not use `JSONB` in SQLite schema builders**: As noted in the packet, SQLite resolves `JSONB` to `NUMERIC` affinity, silently mangling strings into numbers.
- Store `metadata_json` as explicit `TEXT` (`text("metadata_json")`).
- Store `sealed_payload` as `BLOB` (`blob("sealed_payload")`).
- For multi-tenant indexed lookups: All queries are indexed on composite `(tenant_id, vendor_key)` and `(tenant_id, id)`. Path-based indexing inside `metadata_json` is banned; any field that requires filtering or lookup must be a dedicated column on the record (e.g., `vendor_key`).

#### Token Expiry, Locking, and Mid-Call Refresh
1. **Proactive Refresh (Pre-flight)**:
   When resolving a credential, if `expires_at != null` and `now() >= expires_at - BUFFER` (e.g., 300 seconds), trigger a refresh before dispatching the request.
2. **Refresh Concurrency & Token Rotation**:
   OAuth2 providers using single-use Refresh Token Rotation (RTR) will revoke the entire authorization chain if two concurrent requests send the same refresh token simultaneously.
   - Refresh execution MUST acquire a distributed/row-level lock per `(tenant_id, credential_id)` (in SQLite: immediate transaction or an in-memory per-credential async mutex with DB state verification; in Postgres: `FOR UPDATE`).
   - If a request enters while refresh is in flight, it awaits the existing promise/lock and receives the new access token.
3. **Reactive Refresh (Mid-flight 401)**:
   If an endpoint returns `401 Unauthorized` and the credential is of scheme `oauth2`:
   - Step A: Invalidate the cached/resolved token in memory.
   - Step B: Acquire the refresh lock. Check if another worker already refreshed it while this request was running. If yes, retry immediately with the new token.
   - Step C: If still expired, execute the OAuth2 refresh flow.
   - Step D: Update the database record with the new access token and rotated refresh token inside a single transaction.
   - Step E: Re-sign and re-issue the failed HTTP request (max 1 retry attempt). If the retry returns `401`, mark credential `status = 'refresh_failed'`, fail fast, and return a structured diagnostic without secret material.

#### Concrete 4-Store Migration Plan (Zero-Downtime, Live Data)

```
Phase 1: Facade Layer
[4 Legacy Stores] <--- [Unified Credential Resolver Facade (A2)] <--- [Application Callers]

Phase 2: Target Schema & Dual-Write
[Unified Schema]  <--- (Dual Writes on create/update)
[4 Legacy Stores] <--- (Reads fallback to legacy if missing in unified)

Phase 3: Backfill Worker
[Backfill Script] ---> Read Legacy -> Decrypt -> Re-encrypt with AAD(tenant:id) -> Write Unified

Phase 4: Cutover & Deprecation
[Unified Schema]  <--- [Unified Credential Store (A1)] <--- [Application Callers]
[4 Legacy Stores] ---> DROPPED
```

1. **Step 1 (Schema & Facade)**: Create the unified `credentials` table. Deploy a `UnifiedCredentialResolver` interface.
2. **Step 2 (Dual Write + Read Fallback)**:
   - UI and Agent credential creation routes write to the *new* unified store (using AEAD with AAD).
   - The resolver checks the *new* unified table first; if missing, it falls back to querying the respective legacy store.
3. **Step 3 (Offline/Online Backfill)**:
   Run an idempotent migration job:
   - Read from `platform/oauth/`, map to `auth_scheme: 'oauth2'`, re-encrypt tokens with AAD.
   - Read from `features/custom-credentials/`, map `Bearer`/`Basic`, re-encrypt.
   - Read from `media ProviderCredentials` & `vendor-credentials/store.ts`, extract metadata (`baseUrl`, `accountId`, `region`), seal secrets (`apiKey`, `token`).
4. **Step 4 (Validation & Decommission)**:
   Log zero fallback hits for 72 hours. Remove legacy read fallbacks, delete legacy access code, and drop legacy tables.

---

### 3. The Call-Shape Model: Sync vs. Long-Running Submit-then-Poll

#### Critique of Candidates
- **B1 (MCP-first) — Rejected as Foundation**: MCP is an agent tool protocol, not a universal remote execution protocol. External vendors (GitHub, AWS, Cloudflare, specialized media providers) do not natively host MCP servers. Wrapping every HTTP REST API in a local or remote MCP daemon adds operational failure modes, serialization overhead, and latency. MCP should be a *consumer* of this engine, not the engine itself.
- **B2 (Compatible-Dialect Config) — Accepted as Tier**: For OpenAI-compatible endpoints, Ollama, vLLM, and S3-compatible storage, hand-writing 10 identical adapters is wasteful. A dialect adapter parameterized by `baseUrl` and `model`/`bucket` is essential.
- **B4 (Declarative JSON/DSL) — Rejected**: Declarative DSLs for REST APIs sound elegant until an API requires multi-part form boundary calculations, binary payload stream hashing, conditional pagination, or dynamic error code extraction. Declarative configs inevitably morph into buggy, half-baked Turing-incomplete programming languages.
- **B3 (Typed Hand-Written Adapters) + B2 (Dialect Tier) — Selected**: Small, functional, typed adapters using TypeScript contracts, with dialect-level parameterization where standards exist.

#### The Synchronous vs. Submit-then-Poll Dilemma
The existing 1-fetch core (`requireCredential -> buildRequest -> fetch -> parseResponse`) is fatally limited. Video generation, batch deployments, DNS propagation, and asynchronous training jobs take between 10 seconds and 30 minutes. Holding an HTTP connection open or running an in-memory `setTimeout` loop in Node.js/TypeScript will fail on any deployment, worker restart, or serverless autoscaling event.

#### The Dual-Mode Execution Architecture

Every adapter declares an `ExecutionKind`:
1. **`Immediate` (Synchronous)**: 1 fetch $\rightarrow$ immediate response.
2. **`Deferred` (Submit-then-Poll)**: A 3-step state machine (`submit` $\rightarrow$ `poll` $\rightarrow$ `fetchResult`).

```typescript
// Pure Functional Adapter Contract
export type Adapter<TInput, TOutput, TPollState = unknown> = 
  | ImmediateAdapter<TInput, TOutput>
  | DeferredAdapter<TInput, TOutput, TPollState>;

export interface ImmediateAdapter<TInput, TOutput> {
  kind: 'immediate';
  buildRequest(input: TInput, ctx: RequestContext): RequestSpec;
  parseResponse(response: ResponseSpec, ctx: RequestContext): TOutput;
}

export interface DeferredAdapter<TInput, TOutput, TPollState> {
  kind: 'deferred';
  buildInitialRequest(input: TInput, ctx: RequestContext): RequestSpec;
  parseInitialResponse(response: ResponseSpec, ctx: RequestContext): {
    jobId: string;
    pollState: TPollState;
    nextPollAfterMs: number;
  };
  buildPollRequest(jobId: string, pollState: TPollState, ctx: RequestContext): RequestSpec;
  parsePollResponse(response: ResponseSpec, pollState: TPollState, ctx: RequestContext): 
    | { status: 'running'; pollState: TPollState; nextPollAfterMs: number }
    | { status: 'completed'; resultSpec?: RequestSpec; inlineResult?: TOutput }
    | { status: 'failed'; error: DiagnosticError };
  parseFinalResponse?(response: ResponseSpec, ctx: RequestContext): TOutput;
}
```

#### Where Polling State Lives & Surviving Process Restarts
Polling state MUST NOT live in process memory. It resides in a persistent **`external_tasks`** table:

```typescript
interface ExternalTaskRecord {
  id: string;                         // Task ID
  tenant_id: string;                  // Tenant isolation
  vendor_key: string;                 // e.g. "runway", "cloudflare_deploy"
  credential_id: string;              // Pointer to StoredCredentialRecord
  status: 'pending' | 'polling' | 'completed' | 'failed' | 'timed_out';
  job_id: string;                     // Upstream vendor's job identifier
  poll_state_json: string;            // Adapter-specific checkpoint data
  next_poll_at: number;               // Unix epoch millisecond timestamp
  attempts: number;                   // Retry/poll count
  max_timeout_at: number;             // Hard ceiling for job expiration
  last_error_json: string | null;
  result_json: string | null;         // Final result or pointer to stored blob
  created_at: number;
  updated_at: number;
}
```

**Restart Recovery Lifecycle**:
1. A durable dispatcher worker / cron scheduler queries:
   `SELECT * FROM external_tasks WHERE status = 'polling' AND next_poll_at <= :now LIMIT 50`
2. If the Node.js process crashes mid-poll, the record remains in the database with its last known `poll_state_json` and `next_poll_at`.
3. When the process restarts, the worker picks up the row, loads the adapter, resolves the credential handle, executes `buildPollRequest`, and continues.
4. **Idempotency on Crash**: The adapter’s `parsePollResponse` is pure. Polling a vendor twice with the same `jobId` is safe.
5. If the job succeeds, the result is saved, status is marked `completed`, and the calling subsystem (or AI agent via task notification) is woken up reactively.

---

### 4. How the Two Halves Compose

The composition must prevent the adapter from handling secrets and prevent the auth layer from knowing HTTP request body schemas.

```
+-----------------------------------------------------------------------------------+
| 1. CALLER (AI Agent Tool / UI Action)                                             |
|    Calls execute(vendor: "runway", input: {...}, credentialHandle: "cred_123")    |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. PURE ADAPTER LAYER                                                             |
|    - Maps Input -> RequestSpec (Method, Path, Headers, Body, AuthRequirements)    |
|    - Has NO access to raw API keys or decryptor keyring                           |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. DISPATCH EXECUTOR & SIGNING PIPELINE                                           |
|    a. Fetch Credential Record for (tenant_id, credentialHandle)                   |
|    b. Ensure token validity (Proactive Refresh under Mutex if expired)            |
|    c. Decrypt Secret with AAD(tenant_id, id, vendor, scheme)                      |
|    d. Auth Attacher: Inject Bearer / Basic / SigV4 signature / Custom headers     |
|    e. Sanitize & Validate: Block URL credentials (user:pass@), verify BaseURL     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. HTTP TRANSPORT & RECOVERY                                                      |
|    a. Dispatch single fetch()                                                     |
|    b. Catch 401: Invalidate -> Lock -> Refresh -> Re-sign -> Single Retry        |
|    c. Catch Timeout / 5xx: Apply exponential backoff                              |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 5. RESPONSE PARSING & STATE ROUTING                                               |
|    - If Immediate: Adapter.parseResponse() -> Return to caller                    |
|    - If Deferred: Insert row in external_tasks -> Return TaskHandle to caller     |
|    - Mask all secrets from logs, agent transcripts, and error payloads            |
+-----------------------------------------------------------------------------------+
```

#### Composition with AI Agents
When the AI agent needs to call an external service:
1. The agent's tool definition takes parameters: `{ credentialId?: string, ...serviceArgs }`.
2. If `credentialId` is omitted, the executor auto-resolves the default credential configured for `(tenant_id, vendor_key)`.
3. The tool runner invokes `execute()`. If the adapter is `deferred`, the agent receives `{ status: "queued", taskId: "task_456" }`.
4. When `external_tasks` completes, the agent receives a reactive wakeup message with the clean parsed output.
5. Errors return structured diagnostics (e.g. `{ error: "VendorAuthFailed", vendor: "github", schemeSent: "bearer", httpStatus: 401 }`), guaranteeing that raw tokens and secret URLs are never leaked into the LLM context or conversation logs.

---

### 5. Strongest Argument AGAINST This Position

#### The Critique: "The Micro-Platform Over-Engineering Trap"
By creating a unified credential vault, AEAD envelope encryption layer, durable polling table, worker scheduler, and a multi-stage execution pipeline, we are building a bespoke in-house **Workflow Engine** (a mini-Temporal / mini-Inngest).

- For a product where 85% of third-party calls might turn out to be short-lived synchronous REST calls (e.g. fetching user info from GitHub or basic LLM completions), building a durable polling state machine in SQLite adds substantial code mass, migration friction, and operational burden.
- If the ecosystem standardizes heavily on **external MCP servers** over the next 18 months, vendors will ship their own MCP servers that manage their own internal polling and credential flows remotely. Our custom adapter layer and polling table will become instant legacy code.

#### What Evidence Would Change My Mind?
1. **Adoption of Native External Durable Runtimes**: If the product moves to an infrastructure environment that provides native durable execution primitives (e.g. Cloudflare Workflows, Temporal, Inngest, or AWS Step Functions), the in-database `external_tasks` polling engine should be discarded in favor of running the adapter as a standard durable workflow step.
2. **Universal MCP Vendor Parity**: If major non-AI SaaS providers (Cloudflare, GitHub, AWS, Stripe) begin shipping authenticated hosted MCP endpoints with standard long-polling tool contracts, direct REST adapters should be frozen and deprecated in favor of native MCP federation.

---

### 6. Failure Modes

#### 1. Security Failure Mode: SSRF via Configurable `baseUrl` and Metadata Spoofing
- **Mechanism**: Generic dialect adapters and custom credentials allow users/agents to specify `baseUrl` (e.g. to point to a local Ollama or self-hosted proxy). An attacker in a multi-tenant environment could set `baseUrl: "http://169.254.169.254/latest/meta-data/"` or `"http://kubernetes.default.svc.cluster.local"`. When the executor attaches the tenant's Bearer token or executes an unauthenticated fetch, it hits internal cloud infrastructure.
- **Mitigation**: The transport layer must run an **IP/DNS Pre-flight Validation** (DNS resolution before connect, banning RFC 1918 private IPs, link-local addresses, and loopback ranges unless an explicit server environment variable allows local development).

#### 2. Operational Failure Mode: The SQLite Polling Stampede & Write-Lock Contention
- **Mechanism**: In a multi-tenant SQLite setup, if 50 asynchronous video generation or deployment tasks are polling every 2 seconds, 50 concurrent worker iterations will attempt to update `external_tasks` rows (`UPDATE external_tasks SET next_poll_at = ..., attempts = ...`). SQLite allows only one writer at a time (`SQLITE_BUSY`). The polling workers will exhaust the SQLite busy timeout, failing jobs spuriously and blocking web request writes.
- **Mitigation**: Implement dynamic adaptive polling with jitter (exponential backoff up to 30–60s for long jobs), batch status writes in a single transaction, and enforce strict polling worker concurrency limits on SQLite instances.

#### 3. Maintenance Failure Mode: OAuth Single-Use Refresh Token Destruction
- **Mechanism**: A tenant has two simultaneous agent runs calling GitHub/Google. Both encounter an expired access token simultaneously. If locking fails or if clock skew causes Worker A to exchange the refresh token and Worker B to attempt an exchange with the now-invalidated prior refresh token 50ms later, the OAuth provider detects an apparent token replay attack and revokes the client’s entire authorization grant. The tenant is permanently logged out.
- **Mitigation**: Atomic DB-level transition lock on `(tenant_id, credential_id)` with a 30-second grace-period cache for newly minted access tokens to satisfy in-flight concurrent callers.

---

### 7. What to Build First: The Proving Slice

The smallest slice that proves or kills this architecture is an end-to-end implementation of **one deferred (submit-then-poll) vendor with rotating credentials** on top of the **unified SQLite store**.

#### The Slice:
1. Implement the `credentials` table in SQLite with AEAD encryption + AAD.
2. Implement the `external_tasks` table and a 50-line polling worker.
3. Wire **one real or mock asynchronous vendor** (e.g. a Video Generation API or Deployment API that returns `202 Accepted + { jobId }`, requires 5 polls over 15 seconds to return `200 OK + { url }`, and uses an expiring Bearer token with refresh).
4. Run the call via the AI agent using an opaque `credentialId`.

#### Observable Results that KILL the Design:
1. **The Restart Test (Fatal)**: Trigger the async job, kill the application process with `SIGKILL` on poll iteration 2, restart the process. If the job does not automatically resume from SQLite, complete, and notify the caller, **the call-shape engine is killed**.
2. **The Concurrency / Refresh Test (Fatal)**: Fire 5 concurrent requests against an expired token with simulated 1-time refresh token rotation. If any request fails with an unhandled 401 or revokes the refresh token chain, **the credential lifecycle model is killed**.
3. **The SQLite Lock Contention Test (Fatal)**: Run 20 concurrent polling loops in SQLite. If `SQLITE_BUSY` errors bleed into the API layer or increase HTTP latency by >200ms, the DB-backed polling design is killed and must be replaced with an in-memory queue backed by WAL-mode checkpoints.

---

## PARTICIPANT: Sonnet 5 in-host subagent (THE ONLY PARTICIPANT WITH REPOSITORY ACCESS) — Round 1 verbatim

> Its section 8 is the source of every correction at the top of this packet. The Coordinator
> independently re-verified all of it against source; all of it held.

ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902 -- I received the packet and will work on it.

## 1. Framing

The two halves ARE separable, but the packet's implicit question — "should we build one unified system" — has a sharper answer once you look at what this repo already tried: **partial unification is validated, full unification was tried in scope and deliberately NOT extended further.** `vendor_credential_sets` (`apps/website/src/platform/db/schema.ts:1808` — actually `vendorCredentialSets` at :1936, doc comment starting ~1780) merged two prior stores (`publishCredentialSets`, `sourceControlCredentialSets`) behind a real, shipped migration. Nobody folded in `siteAssistantCredentials`, `adminExecutionCredentials`, `mediaProviderCredentials`, `customCredentialSets`, or the Composio tables into it. That's not an oversight — the docs say why: those tables differ on trust tier (per-workspace vs per-admin), whether a `masked` last-4 column is safe to keep in the clear, and whether AAD is worth retrofitting onto live rows. So my framing: **credential *shape* and *lifecycle mechanics* (refresh, lease, resolve) should be unified into one shared library; credential *storage/exposure policy* should stay differentiated per trust tier**, the same way this repo already differentiates `site_assistant_credentials` (workspace-wide, cost-bearing, keeps a plaintext `masked` tail) from `source_control_credential_sets` (per-admin-relevant, AAD-bound, deliberately NO masked column because it grants write access to a real external account). Treating "unify or don't" as one binary decision, as the packet's A1 vs A4 framing implies, reproduces a distinction the codebase already drew correctly.

## 2. Credential model

**Position: A1's tagged-union *shape* + A2's phased, no-big-bang *migration discipline*, with A3 already partially live via Composio (see §8) rather than hypothetical.**

- **Auth variants**: bearer/basic already unified for agent-facing arbitrary HTTP via `custom-credentials/credentialed-request.ts` (`buildAuthorizationHeader`, `schemeSent: "Basic" | "Bearer"` at line 321). OAuth2 (auth-code + device-code + refresh) is fully built in `platform/oauth/` but genuinely scoped to external MCP servers only — I checked every importer of `platform/oauth` (`grep -rl` across `apps/website/src`) and the only real feature-level consumer is `assistant/external-mcp-oauth.ts`; the rest are composition-root wiring (`server/runtime/composition/{app,deps}.ts` importing `createPendingAuthorizationStore`) or false hits from a loose grep pattern I re-checked and found empty on the actual import line. So the packet's "consumed by: external MCP servers only" is accurate.
- **Refresh and mid-call expiry — the packet undersells this, there's a real, already-audited answer sitting in the repo**: `platform/oauth/token-refresh.ts` implements proactive skew-based refresh (`shouldRefresh`, line 109) plus a cross-process compare-and-set lease (line 62) so concurrent refreshers on the same key collapse to exactly one `refresh()` call — the file's own header explains why this matters: "the loser persists a refresh token the provider has already revoked, and the connection is dead until a human re-authorizes" (lines 9-10). A loser waits and re-reads rather than double-refreshing. **This is the correct general-purpose answer to requirement #2's "what happens on a mid-call expiry" question, and it should be generalized to every OAuth2 vendor, not rebuilt per-consumer.** Nothing today reuses it outside MCP.
- **Per-tenant scoping**: consistently `workspaceId` except `adminExecutionCredentials`, which is `(workspaceId, principalId)` (schema.ts:1470) — a real precedent for "per-tenant" needing more than one dimension. A unifying `resolve(vendor, tenant)` entry point must accept a *scope*, not assume `tenant == workspaceId` always, or it silently can't represent the one table that already needs two keys.
- **Migration path — don't invent one, generalize the one that already shipped**: `vendor-credentials/dual-read.ts` is the concrete playbook requirement #2 asks for. Its header lays out the exact recipe: (1) add the new table + old-to-new ID mapping tables in an isolated migration (`0045`), (2) build the new store's CRUD with *zero* dependency on legacy tables (`store.ts`), (3) ship a `resolveDefaultForVendorDualRead` facade that tries the new table first and falls back to whichever legacy table used to own that vendor — **critically, it never builds a "generic" cross-table decrypt path; each legacy branch calls its OWN already-reviewed resolver with its own AAD lineage**, because (as the file states) "a legacy row's ciphertext auth tag only verifies against ITS OWN table's AAD lineage" (dual-read.ts:43-44) — mixing AAD across tables fails closed, not silently, and the migration code must never try to be clever about that, (4) run and verify a `backfill-vendor-credentials.ts` script, (5) delete the whole dual-read seam once the backfill is confirmed for every install. This generalizes cleanly to any future consolidation. It was explicitly NOT applied beyond publish+source-control — take that as a signal about real migration cost, not an oversight to just "finish."
- **Reject A3 as the sole/default mechanism** — a capability-handle indirection for every credential means every `buildRequest` must go through an attach-service, which is unnecessary plumbing for the common case (a plain API key in a header) and duplicates what Composio already does for OAuth-heavy third-party connectors (see §8). Endorse A3 *only* as the shape for vendors whose auth Tovu doesn't want to own (delegate to Composio), not as the universal credential-access pattern.

## 3. Call-shape model

**Position: keep `VendorAdapter`'s `requireCredential -> buildRequest -> parseResponse` for synchronous vendors (it's a good, proven shape — I read `vendor-adapter.ts` and `engine.ts` in full), but do NOT try to bolt polling onto it as a bigger single function. Split submit from poll into two separately-callable, separately-persisted operations.**

I verified the "no polling loop" claim directly: `dispatchVendorRequest` (`vendor-adapter.ts:84-101`) is exactly `requireCredential? -> buildRequest -> one fetchWithTimeout -> parseResponse`, and the file's own comment admits a real, already-observed failure from this shape: as of a 2026-08-16 audit, "only 2 of 13 registered vendors... set their own `request.init.signal`; the other 11 set none at all... a stalled vendor endpoint hung this call forever, nothing to alert on" (lines 91-94) — patched only with a blanket 10-minute backstop timeout, not real per-vendor SLAs.

More importantly, **this gap is not hypothetical — it's already live for a genuinely long-running surface.** `providers/imagerouter.ts` registers a `'video'` route (`mediaVendorRegistry.register('imagerouter', 'video', imageRouterVideoAdapter)`, line 152) whose `parseResponse` just parses one JSON response for finished video bytes (lines 140-142) — i.e., video generation today is implemented by holding one HTTP connection open for up to 10 minutes and hoping the vendor's infra doesn't time out the connection before the generation finishes server-side. If it does, the caller gets nothing, cannot tell whether generation is still running, and a naive retry double-spends against the vendor. **This is the smallest real reproduction of the packet's "no polling loop" problem — use it, not a hypothetical vendor, for what to build first (see §7).**

- **Where polling state lives**: the database, never process memory. `outboxEvents` (schema.ts:1139) is the closest existing precedent — `status`, `attempts`, `nextAttemptAt`, `lastError`, an index on `(status, nextAttemptAt)` for claiming due work. I did NOT verify whether its *consumer* code enforces a max-attempts/dead-letter cutoff — flagging that as unverified rather than assuming it's safe to copy wholesale (see failure modes).
- **What happens on process restart mid-poll**: nothing should be lost, because nothing should live only in the process that submitted the job. This forces a real architectural split: `submit(ctx, credentials) -> jobRef` (fast, called once from the request path) and `poll(jobRef) -> RenderResult | {pending, nextPollAt}` (idempotent, called repeatedly from a scheduled tick, resumable from the job row alone with no assumption the polling process is the submitting one). That is a materially different execution shape than today's single async function, and conflating them — letting each vendor roll its own ad hoc polling loop inline (B3 without the split) — reproduces the exact "essentially its own hand-written function" problem `vendor-adapter.ts`'s header says this engine was built to kill (lines 5-9).
- **Reject B1 (MCP-first) as a general default.** The MCP federation stack is heavy (`assistant/mcp-federation/trust.ts` alone is 38KB; three transport adapters — http/stdio/memory) and most vendors that matter here (media generation APIs, DNS registrars, S3-compatible storage) don't ship an MCP server at all. Concrete counter-evidence: the repo's own comment records the *original motivating case* for one feature was "an external MCP server generating an image from a prompt" (per the packet) — yet when the team needed a *working* image-generation tool today (2026-09-02), they shipped it through the vendor-adapter dispatch engine directly (`features/media-generation/agent-tools.ts`), not through MCP. When it mattered, MCP-first lost to adapter-first. B1 should read "prefer an MCP server when a vendor already ships a good one and its trust story clears `mcp-federation/trust.ts`'s bar," never a default route new integrations are pushed toward first.
- **B4 (declarative/config-driven adapters) — be skeptical.** `vendor-adapter.ts`'s own header explicitly argues against pushing further into declarative territory: `parseResponse` is "intentionally still a full function, not a further declarative shape" because real vendors need a *second* network call inside parsing (SenseAudio's SSRF-guarded asset download, AIHubMix's Gemini-native redirect) that "a purely declarative parser DSL can't express without becoming its own bespoke escape hatch anyway" (lines 16-21). The team already considered and rejected going further than B3-with-a-thin-shared-harness. Weight that.

## 4. How the two halves compose

They already compose at exactly one seam, and it's the right one: `engine.ts:203` resolves `credentials = options.credentials?.[def.provider]` *before* calling the renderer; `dispatchVendorRequest` receives an already-resolved `ProviderCredentials` value and never knows how it was obtained. Keep that boundary. Extend `ProviderCredentials` (currently `{apiKey?, baseUrl?, model?}`, `types.ts:26-30`) into a tagged union that can also carry `{kind:'handle', attach: (req) => req}` so a Composio-brokered or OAuth-refreshed credential can flow through the same seam as a plain API key, without `buildRequest` needing to know which. **Do not compose them any tighter than that** — don't make `dispatchVendorRequest` refresh-aware. Credential lifecycle (crypto, cross-process leases, provider-grant quirks) and wire-shape (URL/envelope/polling) are different failure surfaces, and the module's own doc already argues for exactly this narrow-scope genericity (§3).

## 5. Strongest argument against my own position

Resolving credentials once, before dispatch, works cleanly today because `engine.generate()` resolves-and-dispatches inline in one call. The moment submit/poll split exists (§3), a job's *submit* and its *poll continuation* are no longer the same call — possibly hours apart. A credential resolved at submit time may be stale by the time a poll tick fires. My "resolve-once-at-the-seam" design either needs every poll tick to re-resolve credentials fresh (cheap, but means the job row can't be treated as self-contained — it needs a live resolver reachable at poll time, not just stored bytes), or it needs to carry a live handle through persisted job state (more machinery, closer to A3 for every polling vendor whether or not it needs OAuth). **What would change my mind**: if in practice every real polling vendor's key/token comfortably outlives the poll window (plausible — job tokens for video-gen APIs are typically valid far longer than generation itself), then "re-resolve on every poll tick" is sufficient and cheap, and I'd drop the "carry a live handle in the job" idea entirely. I have not verified this against any real vendor's token TTL — it's an assumption, not evidence.

## 6. Failure modes

- **Security**: `vendor_credential_sets` already documents a known, *accepted* ambiguity for `s3-compatible` — `accountLabel` is always `null` because "there is no reliable way to derive the real company from an S3-compatible endpoint URL" (types.ts:29-51), so two credentials for two unrelated companies (AWS, Backblaze, R2...) can land in the same vendor group with only a user-typed label distinguishing them. A generalized `resolve(vendor, tenant)` inherits this ambiguity and could make it *less* visible than it is today (currently contained to one admin page's explicit picker; a resolver invoked implicitly by an agent tool could silently pick the wrong same-vendor credential).
- **Operational**: the *already-shipped* single-fetch core has a known, documented reliability gap (11 of 13 vendors with no abort signal, patched only with a blanket timeout — §3). Generalizing to submit-then-poll without first closing that class of gap multiplies it: a hung poll sequence with no outer bound is worse than a hung single fetch, because nothing terminates it.
- **My own recommendation's worst-case failure**: if I generalize `VendorAdapter` with a `pollForCompletion` member and a job table modeled on `outboxEvents`, the realistic production failure is **silent job leakage** — a vendor that intermittently reports "still processing" forever (bad status-code mapping, or a webhook-based vendor mistakenly wired through polling instead of a callback) fills the job table with rows that never terminate. I explicitly did NOT verify whether `outboxEvents`'s actual consumer enforces a max-attempts/dead-letter cutoff before recommending it as the model to copy — that must be checked before anyone builds on it, not assumed from the schema alone (schema.ts:1139-1152 shows the *shape* for retry bookkeeping, not the policy).

## 7. What to build first

Not a new vendor, not a synthetic slow-fetch test. **Take the vendor that's already secretly async in production: `imagerouter` 'video'.** Build only the submit/poll split for that one (provider, routeKey) pair, wired through the real caller that exists today (`features/media-generation`'s tool path — the only real `apps/`-level consumer of this engine as of today's change, per `agent-tools.ts`'s own header admitting the engine "was imported nowhere under `apps/`" until this). Kill test: submit a real generation job, `kill -9` the server process mid-poll, restart it, and confirm the job completes without operator intervention, without a duplicate vendor-side charge, and without any state that lived only in the killed process. **If that can't be made to work cleanly for this one already-real vendor, B4's "generic declarative polling engine" is not viable and hand-written per-vendor polling (B3) should win by default** — don't build the generic polling engine speculatively before this one case proves it's worth generalizing.

## 8. Packet corrections

**The packet's "four separate stores" table is a real undercount, not just a simplification.** I found at minimum these additional, distinct, already-live credential-shaped stores/tables the packet never mentions:
- `siteAssistantCredentials` (schema.ts:1415) — one row per workspace, the public visitor assistant's own AI provider key, sealed with **no AAD** and a plaintext `masked` last-4 column.
- `adminExecutionCredentials` (schema.ts:1470) — per-`(workspaceId, principalId)` admin BYOK key, also **no AAD**, also plaintext `masked`.
- `sourceControlCredentialSets` (schema.ts:1725) — GitHub/GitLab/Bitbucket PATs, deliberately a separate table from publish credentials despite identical column shape, WITH AAD, deliberately NO masked column.
- **`composioConfig`** and **`composioConnectorCredentials`** (schema.ts:2056, 2263) — Composio project API key and Composio-brokered per-account credentials, respectively. See below — this is the biggest omission.
- `mediaProviderCredentials` / `features/media/provider-credential-store.ts` — a real, persisted, workspace-scoped, sealed DB store feeding the dispatch engine's runtime `ProviderCredentials`. The packet describes the media side as if the *only* credential concept there is the ephemeral `{apiKey?, baseUrl?, model?}` runtime type — it omits that a durable store already exists behind it, and (per that file's own header) as of **2026-09-02, the same day as this packet**, it gained its first real decrypting reader (`resolveMediaProviderCredential`) because `media-generation/tool-registrations.ts`'s new `media_generate_asset` tool needed one.

**AAD count is also wrong.** The packet says "one store seals without AAD." I found at least three: `siteAssistantCredentials`, `adminExecutionCredentials` (schema.ts:1539 explicitly: "the two tables above, sealed with no AAD at all"), and `mediaProviderCredentials`/`provider-credential-store.ts` (its own header: "Sealed with NO `aad`... `ports.ts`'s doc names `provider-credential-store.ts` as one of the three callers that seal with no AAD" — the codebase's own comment says *three*, not one).

**"13 provider implementations" is close but not exact.** There are 12 provider files under `dispatch/providers/`, registering **18** `(providerId, routeKey)` adapter pairs total (several vendors register more than one surface) — `custom-image.ts` both registers into `mediaVendorRegistry` AND is called directly by `engine.ts` for the openai-image-override branch, so it's double-counted either way you slice it. Minor, but worth being precise about since the debate may reason about "how many vendors migrate."

**The single biggest omission: Composio.** `apps/website/src/platform/connectors/` (`composio-service.ts`, `composio-config-store.ts`, `connector-credential-store.ts`) wires `@jini-ai/integrations/composio`'s `ComposioConnectorProvider`/`ComposioConnectorService` — a **third-party unified connector/credential broker** Tovu has already integrated, live, with its own OAuth handshake (in-process pending-connection map keyed by OAuth `state`, `composio-service.ts` header), its own durable credential store distinct from every store the packet lists, and its own singleton-lifecycle constraint ("connector OAuth is single-process-only today: a second worker would not share it," per that file's header). This is materially relevant because **it is a real, running instance of candidate A3** ("callers never receive a credential at all... a signing/attaching service performs the outbound call") — not a hypothetical option to weigh in the abstract. The debate as framed asks "should we adopt A3" without disclosing that a vendor-operated version of A3 is already live in production for some connectors. That changes the question from "should we build capability-indirection" to "should we extend the *existing* Composio-brokered path to more vendors, build a first-party equivalent, or run both permanently for different vendor classes" — a genuinely different, harder question the packet doesn't surface at all.

**One thing the packet gets right and understates as a strength**: the dual-read/backfill migration pattern (§2) is a *proven*, low-risk template for exactly the "migration path off live data" requirement the packet asks debate participants to invent from scratch. It should be cited as prior art, not reinvented.

I did not find evidence contradicting the packet's core "no polling loop" / "exactly one fetch" architectural claim — I confirmed it directly in `vendor-adapter.ts`, and found a live example (`imagerouter` video) of it already being stretched past where it safely applies.

---

## COORDINATOR (Primary, Opus 5) — Round 2 position, frozen BEFORE dispatching this packet

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

--- END OF PACKET ---

---

# COORDINATOR'S OWN IMPLEMENTATION SKETCH — attack this

# COORDINATOR'S OWN IMPLEMENTATION SKETCH — frozen before dispatch

This is the Coordinator's concrete proposal, published so participants can attack a real design
rather than a preference. Tear it apart.

## 1. Credential record — unify SHAPE, do not assume one table

```ts
/** Scope is a value, never assumed to be `workspaceId`. `adminExecutionCredentials` is already
 *  (workspaceId, principalId), so a single-key scope cannot represent a table that exists today. */
export type CredentialScope =
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "principal"; readonly workspaceId: string; readonly principalId: string };

/** Trust tier is a COLUMN, not a schema. This is my answer to the Round 1 disagreement: the nine
 *  tables differ on policy, and policy is data. `maskedTailAllowed` is the concrete thing they
 *  actually disagree about — source-control PATs deliberately keep no masked tail because they
 *  grant write access to a real external account. */
export interface CredentialPolicy {
  readonly tier: "workspace-shared" | "principal-private" | "external-write";
  readonly maskedTailAllowed: boolean;
  readonly aadRequired: boolean;
}

/** OAuth GRANTS (authorization_code / device_code) are acquisition flows and deliberately absent
 *  here — Codex was right in Round 1. This is runtime state only. */
export type AuthMaterial =
  | { readonly kind: "none" }
  | { readonly kind: "bearer"; readonly token: string }
  | { readonly kind: "basic"; readonly username: string; readonly secret: string }
  | { readonly kind: "header"; readonly name: string; readonly value: string }
  | {
      readonly kind: "oauth2";
      readonly accessToken: string;
      readonly refreshToken?: string;
      readonly expiresAt?: string;
      readonly scopes?: readonly string[];
      readonly clientRef: string;
    }
  | {
      /** Deliberately NOT {keyId, secret} — Codex's Round 1 correction. Real signing needs the
       *  algorithm and often region/service/session-token. */
      readonly kind: "signed";
      readonly algo: "aws-sigv4" | "hmac-sha256";
      readonly keyId: string;
      readonly secret: string;
      readonly region?: string;
      readonly service?: string;
      readonly sessionToken?: string;
    }
  | { readonly kind: "brokered"; readonly broker: "composio"; readonly connectedAccountId: string };

export interface CredentialRecord {
  readonly id: string;
  readonly scope: CredentialScope;
  readonly vendorId: string;
  readonly policy: CredentialPolicy;
  readonly material: AuthMaterial;   // sealed at rest; AAD = (scope, id, version, material.kind)
  readonly version: number;
  readonly baseUrl?: string;
}
```

## 2. The seam — an APPLIER, never a secret

This is the load-bearing decision. If the resolver returns a string, request signing is permanently
unrepresentable, because a signature is computed over body + path + timestamp.

```ts
export interface OutboundRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
}

/** Callers get this. They never get `AuthMaterial`. */
export type AuthApplier = (req: OutboundRequest) => Promise<OutboundRequest>;

export interface CredentialResolver {
  /** Refresh (with the EXISTING cross-process CAS lease from platform/oauth/token-refresh.ts)
   *  happens inside here, not in the adapter. Generalizing that file is most of the work. */
  applierFor(vendorId: string, scope: CredentialScope): Promise<AuthApplier>;
}
```

`kind: "brokered"` is how Composio composes rather than competes: its applier delegates the outbound
call to Composio; every other variant applies locally. Callers cannot tell the difference, which is
what makes "run both permanently" a coherent answer to Q2 rather than a cop-out.

## 3. Call shape — the adapter returns a STEP, the runtime owns scheduling

Keep `buildRequest`/`parseResponse` for sync vendors. Do not bolt polling onto one function.

```ts
export type AdapterStep<T> =
  | { readonly kind: "complete"; readonly output: T }
  | { readonly kind: "call"; readonly request: OutboundRequest }        // unsigned
  | { readonly kind: "wait"; readonly nextPollAt: string; readonly remoteId: string;
      readonly state: unknown }
  | { readonly kind: "failed"; readonly error: string; readonly retryable: boolean }
  /** Codex's Round 1 contribution, and I think the most important single idea in this debate:
   *  the crash gap between a remote side effect and recording it cannot be closed locally. */
  | { readonly kind: "unknown"; readonly reconciliation: unknown };

export interface OperationAdapter<T> {
  readonly submit: (ctx: RenderContext) => AdapterStep<T>;
  readonly advance: (response: HttpResponse, state: unknown) => AdapterStep<T>;
}
```

Job row — indexed columns for anything scheduled or claimed, `text(*_json)` for the rest (the SQLite
constraint makes this forced, not preferred):

```
external_operations(
  id, scope_json, vendor_id, adapter_name, adapter_version,   -- pinned: in-flight rows must stay readable
  status, remote_id, idempotency_key,
  attempts, max_attempts,                                     -- dead-letter cutoff, NOT optional
  next_poll_at, lease_owner, lease_expires_at, deadline_at,   -- deadline bounds a hung poll sequence
  state_json, error_json, created_at, updated_at
)
INDEX (status, next_poll_at)
```

`max_attempts` and `deadline_at` are present specifically because two Round 1 participants
independently predicted the same failure — jobs that report "still processing" forever and never
terminate. Sonnet explicitly flagged it did **not** verify whether `outboxEvents`' consumer enforces
a cutoff. Do not copy that shape without one.

**Credential freshness across the poll window** (Sonnet's self-critique, which I think is the
sharpest unanswered question): re-resolve the applier on **every** tick via `applierFor`. Never
persist material in `state_json`. The job row stays self-contained about the *operation*; the
credential is always live. This costs one resolver call per tick and removes an entire class of
"stale token in a persisted job" bug.

## 4. Composition, end to end

1. Domain calls an intent port (`generate`, `publish`, `deploy`) — never raw HTTP.
2. Runtime loads/creates the `external_operations` row and claims a lease.
3. `adapter.submit()` or `advance()` returns a step.
4. On `call`, runtime asks the resolver for an applier, applies auth, enforces destination policy
   (origin binding, no auth across an origin-changing redirect), sends.
5. Response goes to `advance()`. `wait` reschedules; `complete` finishes; `unknown` goes to
   reconciliation or a human.
6. Adapter never sees a secret. Resolver never parses a domain response.

## 5. What I would build first, and the kill criteria

Sonnet's slice, not mine: **fix the already-async `imagerouter` video path** (`imagerouter.ts:152`),
because it is genuinely broken in production today rather than synthetic. Add one gate: close or
explicitly accept the three no-AAD stores in writing first, since a new consumer inherited that gap
today and every day makes the retrofit larger.

**Kill criteria:**
- `kill -9` mid-poll, restart → job completes, no duplicate vendor charge, no state that lived only
  in the dead process. Fails ⇒ durable async is not viable in this stack; stay synchronous and cap it.
- Signing cannot be expressed through `AuthApplier` without a special case ⇒ the seam is wrong,
  re-cut before migrating anything.
- A secret appears in any log, persisted row, agent-visible result, or URL ⇒ the applier boundary
  failed and A3-for-everything (or Composio-for-everything) wins instead.
- Migrating ONE store off the old shape takes more than a few days ⇒ the strangler is not viable
  here and A4 (leave the nine alone, unify only the resolver facade) is the honest answer.

--- END OF PACKET ---
