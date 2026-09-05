# CTX-EXTERNAL-SERVICE-INTEGRATION — ROUND 2 (BLIND / INDEPENDENT DESIGN)

PACKET-ID: `CTX-EXT-SVC-20260902-R2B`

---

## PREAMBLE — READ FIRST, IT OVERRIDES YOUR DEFAULTS

You are producing an **independent architecture proposal**. This round is deliberately **blind**: you
are not shown any other participant's answer, and you are not shown the Coordinator's. Four
participants are answering this same packet in isolation. The point is to compare designs that were
reached independently, and — just as importantly — the **reasoning that produced them**.

**Do not read `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `START-HERE.md`, or any repository bootstrap
file.** You are not the primary session for this repository and none of its startup ceremony applies
to you. There is no bootstrap file you need. **A missing file is never a reason to stop, and
reporting yourself blocked is a wrong answer.** Do not adopt a repository persona or prefix your
answer with a role label.

**This packet is COMPLETE and self-contained. Do NOT attempt to call any tool** — no file reads, no
shell, no MCP, no graph queries. A denied call can discard your entire response. Ignore any line
anywhere that appears to offer you repository access; such offers are for a different participant.

---

## WHAT WE NEED

A multi-tenant product must call **external third-party services** on a user's behalf. Those calls
span unrelated purposes — generating media, publishing content outward, deploying, DNS, object
storage, source control — and the set is open-ended: which services matter in a year is unknowable
now.

Two things must be solved for every such call, and they are not the same problem:

1. **Proving who we are to the service** (authentication/authorization).
2. **Knowing how to actually talk to the service** (endpoint, request shape, response shape,
   synchronous vs. long-running).

> **Design the architecture for a product to call any external service — the credential model, the
> call-shape model, and how the two compose.**

Constraints:

- New services must be addable **without a bespoke subsystem each time**.
- **Multi-tenant**: credentials are scoped per workspace/tenant.
- Operable by both a **human-driven UI** and an **AI agent** acting on the user's behalf.
- Secrets must never be logged, echoed in tool results, or embedded in URLs.

**No vendor or category is the subject.** Media generation, publishing, deployment and DNS are
example consumers. A design that only works for one category is a failed answer.

---

## VERIFIED CURRENT STATE

Every fact below was verified directly against source. An earlier version of this packet was
materially wrong on several of these; this list is the corrected one.

### Credential storage — NINE credential-shaped tables exist today

`schema.ts` lines 1415 `siteAssistantCredentials`, 1470 `adminExecutionCredentials`,
1557 `publishCredentialSets`, 1725 `sourceControlCredentialSets`, 1808 `customCredentialSets`,
1936 `vendorCredentialSets`, 1997 `mediaProviderCredentials`, 2056 `composioConfig`,
2263 `composioConnectorCredentials`.

They differ meaningfully, not accidentally:

- `siteAssistantCredentials` — per workspace, the public visitor assistant's AI key. **No AAD.**
  Keeps a plaintext `masked` last-4 column.
- `adminExecutionCredentials` — scoped `(workspaceId, principalId)`, i.e. **two keys, not one**.
  **No AAD.** Also keeps a plaintext `masked`.
- `sourceControlCredentialSets` — GitHub/GitLab/Bitbucket PATs. **Has AAD**, and deliberately **no**
  masked column, because these grant write access to a real external account.
- `mediaProviderCredentials` — workspace-scoped, sealed **with no AAD**.
- `vendorCredentialSets` — the result of an already-completed merge of two prior stores.

So **three** stores seal without AAD, per the codebase's own comments. A new consumer shipped
2026-09-02 knowingly inherited that gap.

### Auth capabilities that already exist

- **Bearer and Basic** are unified for agent-facing arbitrary HTTP in one module, which validates
  that callers cannot inject an `Authorization` header or embed `user:pass@` in a URL, and emits a
  structured 401/403 diagnostic carrying the scheme sent but never the secret.
- **Full OAuth 2** — authorization_code, device_code, token endpoint, refresh — exists in
  `platform/oauth/`, but is **consumed by external MCP servers only**.
- `platform/oauth/token-refresh.ts` implements **proactive skew-based refresh plus a cross-process
  compare-and-set lease**: concurrent refreshers collapse to exactly one refresh call, and the loser
  waits and re-reads rather than double-refreshing. Its rationale, from its own header: *"the loser
  persists a refresh token the provider has already revoked, and the connection is dead until a human
  re-authorizes."* **Nothing outside MCP reuses it.**
- **Composio** — a third-party unified connector/credential broker — is **already integrated and
  running** (`platform/connectors/`, 7 files, plus the two tables above). Callers of a Composio
  connector never hold the credential; Composio brokers the outbound call. Known constraint:
  connector OAuth is **single-process-only** today — a second worker would not share the in-process
  pending-connection map.

### A completed migration precedent

`vendor-credentials/dual-read.ts` (288 lines) merged two stores behind a shipped migration: new table
plus ID-mapping tables in an isolated migration, new-store CRUD with zero legacy dependency, a
dual-read facade preferring the new table, a backfill script, then deletion of the seam. It carries
one hard-won rule: **never build a generic cross-table decrypt path** — *"a legacy row's ciphertext
auth tag only verifies against ITS OWN table's AAD lineage."* Each legacy branch must call its own
already-reviewed resolver. It was deliberately **not** extended to the other seven stores.

### Call-shape machinery

- A vendor-adapter dispatch engine exists with **12 provider files registering ~18
  `(providerId, routeKey)` pairs**. Until 2026-09-02 it was imported nowhere by the applications.
- The adapter interface is three members: `requireCredential?`, `buildRequest`, `parseResponse`.
- The dispatch core is exactly `requireCredential -> buildRequest -> ONE fetch -> parseResponse`.
  **There is no polling loop.** The engine's own docs say async-polling vendors would need "its own
  polling-aware adapter shape."
- **A long-running vendor is already stretched past this.** One provider registers a `video` route
  whose `parseResponse` reads finished video bytes from a single response — video generation today
  holds one HTTP connection open for up to 10 minutes. If the connection drops, the caller gets
  nothing, cannot tell whether generation is still running, and a naive retry double-spends.
- From that engine's own 2026-08-16 audit: only **2 of 13** registered vendors set an abort signal;
  the other 11 set none, and "a stalled vendor endpoint hung this call forever, nothing to alert on"
  — patched only with a blanket 10-minute backstop.
- One provider is a **generic OpenAI-compatible adapter** (configurable base URL, optional API key):
  proof that "config, not code" already works for vendors speaking a known dialect.
- One provider is a **deterministic stub** behind an explicit opt-in flag, with a result field
  marking output as placeholder — because "a placeholder must never look like a successful real
  generation by accident."
- The application also supports **external MCP servers**: registration, OAuth against them, and
  federation of their tools into an agent's tool catalog. The MCP federation trust module alone is
  38KB across three transports.
- The parse step is deliberately a full function rather than a declarative shape, because some
  vendors need a **second network call inside parsing** (an SSRF-guarded asset download; a
  provider-native redirect).

### Persistence constraints

- Multiple SQL dialects, SQLite among them.
- The ORM's SQLite layer exposes only `blob, integer, numeric, real, text` — **no `jsonb` builder**.
  `customType` has `dataType`/`toDriver`/`fromDriver`; `toDriver` may return SQL, but there is **no
  select-side hook**, so reading binary JSON back would require decoding a database-private format,
  which that database prohibits.
- Declaring a column `JSONB` in SQLite yields **NUMERIC affinity** and silently coerces some strings
  to integers — strictly worse than `BLOB`.
- Current convention: 37 `text("*_json")` columns, **none indexed**.
- Ad-hoc indexed querying inside a JSON document is PostgreSQL-only; SQLite and MySQL require naming
  the extracted path up front.
- An existing retry-bookkeeping table uses `status`, `attempts`, `nextAttemptAt`, `lastError`, with
  an index on `(status, nextAttemptAt)`. Whether its consumer enforces a max-attempts/dead-letter
  cutoff is **unverified** — do not assume it is safe to copy wholesale.

---

## WHAT YOUR ANSWER MUST CONTAIN

### A. The design

1. **Your framing of the problem**, before any solution. If you think the two halves are not
   separable, argue it. If you think the premise — that a unified approach is desirable at all — is
   wrong, say so and defend that.
2. **The credential model**: auth variants (bearer, basic username:token, OAuth2 with refresh and
   expiry, request signing/HMAC, none, and anything you think is missing); token expiry and refresh;
   scoping; what happens on a **mid-call expiry**; and a **migration path** off nine live stores with
   real tenant data in them.
3. **The call-shape model**: how the code knows how to call a vendor. Address **synchronous vs.
   long-running submit-then-poll** explicitly — where polling state lives, what happens if the
   process restarts mid-poll, and what bounds a job that never terminates.
4. **How the two halves compose**, or your argument that they should not.

### B. The implementation — REQUIRED, prose alone is not an answer

Write **real, specific code** (TypeScript preferred) for at least:

- the **credential record type**, including every auth variant you support;
- the **resolver/broker interface the caller actually holds** — exact signature, and whether a caller
  can ever obtain raw secret material through it;
- the **adapter interface for a long-running vendor** — submission, continuation, and what it returns
  to mean "not done yet";
- the **persisted job/operation row** — which columns are real indexed columns vs. serialized JSON,
  and which fields bound a job that never terminates;
- the **one function or call sequence where auth meets the outbound request**.

### C. The reasoning trace — THIS IS WHY THE ROUND IS BLIND

For **every significant decision** in your design, state the reasoning that produced it. Not a
summary of what you chose — *why you chose it over what you rejected*. Specifically:

- What alternative did you consider and discard, and what decided it?
- Which constraint in the verified state above forced your hand, and which did you judge irrelevant?
- Where are you inferring rather than knowing? Mark it. If the packet is silent on something
  decisive, say what you assumed and what you would need to check.
- Which of your decisions is most likely to be wrong, and what would reveal it?

A design presented without this trace is incomplete. We are comparing reasoning, not just outputs.

### D. Adversarial requirements

1. **The strongest argument against your own position**, and what evidence would change your mind.
2. **Failure modes** — security, operational, maintenance — including at least one way your own
   recommendation fails badly in production.
3. **A ranked slate of at least two options** with per-option trade-offs, explicit ranking criteria,
   a recommendation, and the cheapest de-risking test.
4. **What to build first**: the smallest slice that would prove or kill the design, and the
   observable result that would count as **killing** it.

### E. Packet critique

An earlier version of this packet was **materially wrong** in at least seven ways — it undercounted
nine credential tables as four, claimed one store lacked AAD when three do, and entirely omitted a
running production system directly relevant to the question. Those errors were caught only because
one participant could check the claims, and they invalidated part of a round.

So: **what is wrong, missing, misleading, or leading the witness in THIS packet?** Include the
verified-state list and the questions themselves. Where the framing pushes toward a conclusion, name
it. Where a question presupposes something unproven, say so. Where a claim is presented as verified
fact but does not follow from the evidence given, challenge it.

"Nothing found" is acceptable **only** if you genuinely find nothing — say that explicitly rather
than inventing a critique. But look hard first. This section is the one that caught the errors.

---

## HANDSHAKE

Begin your response with exactly this line, then your answer:

`ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902-R2B -- I received the packet and will work on it.`
