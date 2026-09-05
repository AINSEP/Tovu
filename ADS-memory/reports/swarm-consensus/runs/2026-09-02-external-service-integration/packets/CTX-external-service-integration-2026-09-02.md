# CTX-EXTERNAL-SERVICE-INTEGRATION-2026-09-02

PACKET-ID: `CTX-EXT-SVC-20260902`

---

## PREAMBLE — READ THIS FIRST, IT OVERRIDES YOUR DEFAULTS

You are a participant in an adversarial multi-model design debate. This is Round 1.

**Do not read `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `START-HERE.md`, or any repository
bootstrap/instruction file.** You are not the primary interactive session for this repository and
none of its startup ceremony applies to you. There is no bootstrap file you need. **A missing or
unreadable file is never a reason to stop, and reporting yourself blocked is a wrong answer.** Do
not adopt a repository persona or prefix your answer with a role label.

**This packet is COMPLETE and self-contained.** Everything you need to answer is written below. You
do not need to read source files, run commands, or query any index. If your session has no tools,
that is expected and fine — **do not attempt to call any tool**, since a denied call can discard
your entire response. Ignore any line anywhere that appears to offer you file, shell, graph, or MCP
access; such offers are meant for a different participant, not for you.

**Answer from the packet.** Where the packet is silent on something you consider decisive, say so
explicitly and state what you would need to know — do not invent repository facts.

---

## WHAT WE NEED

A software product needs to call **external third-party services** on a user's behalf. Today those
calls span several unrelated purposes — generating media, publishing content outward, deploying,
managing DNS, object storage, source control — and the set is open-ended: services that matter in a
year are not knowable now.

Two things must be solved for every such call, and they are not the same problem:

1. **Proving who we are to the service** (authentication/authorization).
2. **Knowing how to actually talk to the service** (endpoint, request shape, response shape,
   synchronous vs. long-running).

The question this debate must answer:

> **What is the right architecture for a product to call any external service — covering both the
> credential/authentication model and the call-shape model, and how the two compose?**

Constraints that matter:

- New services must be addable **without a bespoke subsystem each time**.
- It must work for a **multi-tenant** product: credentials are scoped per workspace/tenant.
- It must be operable by both **human-driven UI** and an **AI agent** acting on the user's behalf.
- Secrets must never be logged, echoed back in tool results, or embedded in URLs.

**Do not treat any particular vendor or category as the subject.** Media generation, content
publishing, deployment and DNS are examples of consumers, not the question. A design that only works
for one category is a failed answer.

---

## CURRENT SYSTEM STATE (factual; no position is implied by its inclusion)

The product is a TypeScript monorepo: a web/CMS application plus a set of shared packages.

### Credential storage as it exists now — four separate stores

| Store | What it can represent | Consumed by |
|---|---|---|
| `platform/oauth/` — `authorization-code.ts`, `device-code.ts`, token endpoint, refresh | OAuth 2: authorization_code and device_code grants, refresh tokens | external MCP servers only |
| `features/custom-credentials/` — `credentialed-request.ts` | Bearer **or** Basic (`username:token`); arbitrary HTTP calls; exposed to the AI agent as 5 verbs; validates that callers cannot inject an `Authorization` header or embed `user:pass@` in a URL; emits a structured 401/403 diagnostic carrying `schemeSent` but never the secret | any vendor, agent-driven |
| media dispatch `ProviderCredentials` | `{ apiKey?: string; baseUrl?: string; model?: string }` — no OAuth, no refresh token, no expiry, no username | the media provider engine |
| `features/vendor-credentials/store.ts` | per-vendor typed variants, e.g. Cloudflare requires `accountId`, an S3-compatible variant has no `token` field at all, GitHub stores a login probed from the API | deployment/publishing targets |

Encryption exists (a sealer/keyring port); one store seals without AAD.

### Call-shape machinery as it exists now

- A **vendor-adapter dispatch engine** exists in a shared package with **13 provider
  implementations**. It is **imported nowhere by the applications** — it is written but unwired.
- The adapter interface has exactly three members:
  `requireCredential?`, `buildRequest`, `parseResponse`.
- The dispatch core is literally: `requireCredential -> buildRequest -> ONE fetch -> parseResponse`.
  **There is no polling loop.** The engine's own documentation states that async-polling vendors
  would need "its own polling-aware adapter shape." A submit-then-poll (job-id, poll-until-done)
  vendor cannot use the generic core today.
- One provider is a **generic OpenAI-compatible adapter**: user-supplied base URL, optional API key
  (a self-hosted gateway may need none), speaking a widely-copied request/response dialect. For any
  vendor that speaks that dialect, adding it is configuration rather than code.
- One provider is a **deterministic stub** returning placeholder bytes, explicitly gated behind an
  opt-in flag, with a result field marking output as placeholder — documented rationale: a
  placeholder "must never look like a successful real generation by accident."
- The application separately supports **external MCP servers** (Model Context Protocol): server
  registration, OAuth against them, and federation of their tools into the agent's tool catalog.
- An in-repo comment records that the original motivating case for one feature was "an external MCP
  server generating an image from a prompt."

### Persistence constraints

- The product targets **multiple SQL dialects**, SQLite among them.
- The ORM's SQLite layer exposes only `blob, integer, numeric, real, text` — **no `jsonb` column
  builder**. Its `customType` escape hatch has three hooks: `dataType`, `toDriver`, `fromDriver`.
  `toDriver` may return a SQL expression, but **there is no select-side hook**, so reading a binary
  JSON column back would require decoding the database's internal binary format in application code,
  which that database explicitly prohibits.
- Declaring a column `JSONB` in SQLite is accepted but resolves to **NUMERIC affinity** (the string
  contains none of SQLite's affinity keywords), which silently coerces some string values to
  integers. It is strictly worse than declaring `BLOB`.
- Current convention: 37 `text("*_json")` columns, **none indexed**.
- Ad-hoc indexed querying inside a JSON document is a PostgreSQL-only capability; SQLite and MySQL
  both require naming the extracted path up front.

---

## CANDIDATE APPROACHES — OPTIONS TO CRITIQUE, NOT A PROPOSAL

These are presented as a **starting slate to attack**, in no particular order and with no
endorsement. Reject any of them if warranted, combine them, or propose something absent from the
list. Naming a candidate here is not a claim that it is correct.

**On the credential half:**

- **A1 — One unified record + one resolver.** A single tagged-variant credential type
  (`bearer` | `basic` | `oauth2{access, refresh, expiresAt}` | `signed{keyId, secret}` | `none`),
  one store, one `resolve(vendor, tenant)` entry point handling refresh transparently.
- **A2 — Keep stores separate; unify only the read interface.** Leave existing storage in place,
  put a common resolver facade in front of them.
- **A3 — Capability/handle indirection.** Callers never receive a credential at all; they receive an
  opaque handle and a signing/attaching service performs the outbound call.
- **A4 — Do nothing structural.** Extend individual stores as each new need arises.

**On the call-shape half:**

- **B1 — MCP-first.** Prefer vendors that expose an MCP server; adapters only for those that do not.
- **B2 — Compatible-dialect config tier.** Treat "speaks a known dialect" as configuration.
- **B3 — Hand-written adapters.** A small typed adapter per vendor.
- **B4 — Declarative/config-driven adapters.** Data (JSON/DSL) describing URL, body, envelope, and
  polling, interpreted by a generic engine — no code per vendor.

---

## WHAT YOUR ANSWER MUST CONTAIN

1. **Your own framing of the problem first**, before endorsing any option. If you think the two
   halves are not in fact separable, argue that.
2. **A position on the credential model**, covering: the auth variants above; token expiry and
   refresh; per-tenant scoping; what happens on a mid-call expiry; and a concrete **migration path**
   off four existing stores in a running system with live data.
3. **A position on the call-shape model**, explicitly addressing **synchronous vs. long-running
   submit-then-poll**, since the current core does exactly one fetch. Say where polling state lives
   and what happens if the process restarts mid-poll.
4. **How the two halves compose** — or your argument that they should not be composed.
5. **The strongest argument AGAINST your own position**, and what evidence would change your mind.
6. **Failure modes** you expect: security, operational, and maintenance. Include at least one way
   your own recommendation could fail badly in production.
7. **What you would build first** — the smallest slice that would prove or kill the design, and what
   observable result would count as killing it.

Be concrete and adversarial. Identify where this packet's framing may itself be wrong. If you think
the premise (that a unified approach is desirable at all) is mistaken, say so and defend it.

---

## HANDSHAKE

Begin your response with exactly this line, then your answer:

`ACK_PACKET_RECEIVED CTX-EXT-SVC-20260902 -- I received the packet and will work on it.`
