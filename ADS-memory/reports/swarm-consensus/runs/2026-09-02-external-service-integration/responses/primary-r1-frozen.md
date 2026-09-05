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
