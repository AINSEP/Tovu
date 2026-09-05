# PRIMARY (Opus 5) — Round 3 frozen position

Frozen before dispatching Round 3. Round 3 is informed, so this is disclosed.

## Position changes after reading all five Round 2 answers

**1. I accept the AAD count I got wrong twice.** I reported "one store without AAD," then "three." It is **five**: `provider-credential-store.ts:247`, `composio-config-store.ts:238`,
`connector-credential-store.ts:131`, plus `siteAssistantCredentials` and
`adminExecutionCredentials`. Four have AAD. Both of my wrong numbers came from trusting a doc
comment (`webhooks/ports.ts:95-97`) instead of reading `.seal()` call sites. Codex caught the
epistemics without repo access ("three verified examples is supportable; exactly three is not
demonstrated"); Sonnet caught the fact.

**2. I accept Gemini 3.1 Pro's security finding, which no one else made.**
`adminExecutionCredentials` is scoped `(workspaceId, principalId)` **and** seals without AAD.
That means ciphertext is transplantable **across principals**, not merely across rows — a
privilege-escalation shape, not just a hygiene gap. This is the single most actionable security
finding in three rounds.

**3. I accept that my packet's framing pushed participants away from Composio.** I wrote the
single-process constraint as a property of Composio; Pro correctly separated it: single-process
constrains *connection initiation* (the OAuth dance), not *credential usage*. Workers only need to
use a token. Flash built its "Composio cannot be foundational" ranking on my framing. That is my
error propagating into a participant's conclusion.

## The Round 3 question: can per-vendor code be eliminated?

**My answer: the dichotomy is false, and more importantly it optimizes the wrong axis.**

### The case FOR eliminating per-vendor code
- Most REST vendors genuinely are: URL template + auth + JSON body + a path to the result. A
  declarative spec plausibly covers a large majority.
- Every hand-written adapter is a place a secret can leak. Sonnet named this precisely: the design
  protects the error path, but nothing stops a future adapter author from logging the happy path.
  Fewer adapters, fewer such sites.
- **The real product argument, which is stronger than the engineering one:** a config row can be
  added by a non-engineer, or by an agent, at runtime. Code cannot. That is a capability, not tidiness.
- `custom-image.ts` already proves the tier works for one dialect.

### The case AGAINST
- **This repo already ran the experiment and recorded the result.** `vendor-adapter.ts`'s own header
  says `parseResponse` stays a full function because real vendors need a *second network call inside
  parsing* — SenseAudio's SSRF-guarded asset download, AIHubMix's provider-native redirect — which
  "a purely declarative parser DSL can't express without becoming its own bespoke escape hatch
  anyway." That is empirical, in-repo, and pre-dates this debate.
- The failure mode is not expressiveness, it is **erosion**: the config grows conditionals, then
  templating, then loops, and becomes a programming language with no type checker, no tests, no
  debugger, and no stack traces. All four participants independently predicted this in Round 1.
- Debuggability asymmetry: when a vendor breaks at 2am, a typed adapter yields a stack trace; a JSON
  spec yields a silently wrong answer.

### Where I actually land

Not "code vs config" but **what fraction of vendors need no code, and what happens to the rest.**
Two tiers, and one rule that decides whether it works:

- Tier A — declarative spec for the common shape (URL, method, body template, auth ref, result path,
  poll rule). Addable at runtime, no deploy.
- Tier B — typed adapter for everything else.
- **The rule: Tier B must be a first-class, unembarrassing path.** If Tier A is framed as the
  "right" way, engineers will contort a config to avoid admitting they need code, and you get the
  worst of both — a Turing-complete JSON file that nobody can debug. Every DSL that has failed this
  way failed for that social reason, not a technical one.

### The sharpest thing I have to say this round

**"Eliminate per-vendor code" may be optimizing the wrong axis entirely.**

Flash made the observation that reframes this: the dispatch engine's 12 provider files and ~18
registrations sat **imported nowhere by any application for months**, until 2026-09-02. The
bottleneck was never how expensive an adapter is to write. Adapters existed, in quantity, unused.
What was missing was **async support and a consumer**.

So a Round 3 that debates config-vs-code without confronting that risks optimizing the cheap half of
the problem. Writing an adapter is a day. The thing that actually blocked this system for months was
that nothing could call it and it could not express a long-running operation.

**What would change my mind:** a count of the next ten realistic vendors, classified by whether a
declarative spec covers them. If ≥8 are covered, Tier A is worth building first and my "wrong axis"
claim is overstated. If ≤5, the declarative tier is a distraction and durable async is the whole job.

## What I hold from Round 2

- The signer/broker seam — five of five converged on it independently. Treat as settled.
- Durable job row + leased worker, with both an attempt cap and an absolute deadline.
- Dual-read strangler migration, per-table resolvers, never a generic cross-table decrypt.
- Trust tier as a **column**, not nine schemas — though Sonnet's counter still stands unrefuted.

## Build first — unchanged, and now near-unanimous

The already-async `imagerouter` video path, `kill -9` mid-poll then restart, pass bar = no duplicate
vendor charge and no state that lived only in the dead process. Four of five converged here.

I add one gate I have held since Round 2 and now hold harder given the count is five, not three:
**close the no-AAD gap or accept it in writing first**, starting with
`adminExecutionCredentials`, because that one is cross-principal.
