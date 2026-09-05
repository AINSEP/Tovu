# Swarm Consensus — External Service Integration Architecture

- **Date:** 2026-09-02
- **Mode:** `debate`, 3 rounds (R1 informed-blind, R2 blind/independent, R3 informed)
- **Coordinator session:** `tovu-04` (Opus 5)
- **Status:** COMPLETE — all three rounds dispatched, census delivered, all four open questions resolved.


> ### ⚠️ READ FIRST — the code discussed here lives in TWO repos
>
> This report cites `vendor-adapter.ts`, `vendor-registry.ts`, `engine.ts`, `imagerouter.ts`,
> `custom-image.ts`, `senseaudio.ts`, the 12 provider files, the ~18 `(providerId, routeKey)`
> registrations, and `source-map.md` **by bare filename, never naming a repo.** None of them are in
> Tovu. Verified 2026-09-02 by `find` across the whole tree:
>
> - **The dispatch engine is in Jini**, not Tovu:
>   `~/Programming/Jini/packages/integrations/src/media-providers/dispatch/`
>   (plus `media-providers/source-map.md`, `media-providers/providers.ts`, and
>   `packages/ui/src/features/media-providers/constants.ts`).
>   Jini's `dist/` is gitignored and Tovu consumes the **built** output — a source edit there is
>   invisible to Tovu until Jini is rebuilt. Never run `pnpm -r build` mid-session; it flaps the
>   Tovu API.
> - **The credential stores, the AAD fix (`ffb5ce44`), the five `development/scripts/backfill-*-aad.ts`
>   scripts, and `features/vendor-credentials/dual-read.ts` are in Tovu.**
>
> So the debate's two halves — call-shape and credential-model — are not even in the same
> repository, and Jini is a **separately-published npm package** (`@jini-ai/integrations`). Any build
> order that interleaves them crosses a package boundary, a published public API, and a build step.
>
> ### ⚠️ This makes "Adopt #1" an API change, not a refactor
>
> Decision-ledger item #1 — *"signer/broker seam, adapter never holds a secret," all 5, independently,
> **Adopt*** — is the **inverse of what ships today**. Verified 2026-09-02 in the real code:
>
> ```ts
> // Jini .../media-providers/dispatch/types.ts:97-99
> readonly credentials?: Readonly<Record<string, ProviderCredentials>>;  // ALL providers, eagerly
> // types.ts:26
> export interface ProviderCredentials { readonly apiKey?: string; readonly baseUrl?: string; readonly model?: string }
> // engine.ts:203
> const credentials = options.credentials?.[def.provider] ?? {};
> ```
>
> The host resolves **every** provider's plaintext key up front, hands the engine a map at
> construction, and each adapter reads `credentials.apiKey` to build its own auth header
> (`requireApiKey()` is a shared helper for exactly that). `MediaDispatchEngineOptions` is the
> package's public export. **Adopting the seam means inverting a published package's public API** —
> a cost no packet priced.
>
> ### How much of "five of five converged" survives
>
> - `MediaDispatchEngineOptions` appears in **zero** of the four packets. Nobody was shown the options bag.
> - `ProviderCredentials` appears in all four, but only as the shape `{apiKey?, baseUrl?, model?}`,
>   cited as evidence the media path cannot represent OAuth — never as "the host eagerly resolves all
>   of them up front."
> - **No packet ever named the Jini repo.** The state section was genericized to keep the question
>   vendor-neutral, which stripped the repo boundary out of it.
> - **But one participant did know.** Sonnet (the only one with repo access) described the seam
>   precisely in Round 2 — *"`engine.ts:203` resolves `credentials` before calling the renderer;
>   `dispatchVendorRequest` receives an already-resolved `ProviderCredentials` and never knows how it
>   was obtained"* — and used it as evidence the halves **are** separable, while explicitly refusing
>   to claim the target property already held: *"the caller DOES receive `material`, which contains
>   the actual plaintext secret… I am not fixing that — I'm preserving it."*
>
> **Honest accounting: the five converged on a target design, not on a claim about current state, and
> one participant flagged that current state is the inverse. Read "5 of 5" as strong on direction,
> weak on cost.**
>
> ### Consequences for build order
>
> - **AAD-first gets stronger, not weaker.** It is entirely within Tovu — five stores, five scripts,
>   one migration, no package boundary, no consumer coordination, no rebuild. The async work is in
>   Jini, changes a published public API, and needs a `dist/` rebuild Tovu consumes.
> - **Decide whether `MediaDispatchEngineOptions` is changing shape BEFORE building submit/poll.** If
>   the signer seam lands it touches the same options bag the async work touches, and you do not want
>   to migrate a published package's public surface twice.
> - **The census inherits this blind spot.** The 12/18 number sizes the *authoring* win. Any Tier-A
>   declarative spec would live in Jini and change its public surface too; that cost is unpriced.
> - **Unaffected:** `dual-read.ts` / `ffb5ce44` (Tovu-only, never crosses the boundary — the reuse
>   recommendation stands), `Unknown(reconciliation)`, and the idempotency-gated retry rule
>   (design-level, repo-neutral).

---

## The Swarm

| Role | Model | Transport |
|---|---|---|
| **Primary** | Opus 5 (Coordinator) | in-host; froze a written position before every round |
| Peer | `gpt-5.6-sol` @ `model_reasoning_effort=xhigh` | `codex exec --json`, stdin |
| Peer | `gemini-3.1-pro-high` | `agy --print` |
| Peer | `gemini-3.7-flash-high` | `agy --print` |
| Added subagent | Sonnet 5 (Addition case) | Agent tool — **the only participant with repository access** |

Owner instruction: **down-weight `gemini-3.1-pro-high`** in synthesis (older, weaker model). Note it
nonetheless produced the single best security finding of the debate (see Decision Ledger).

## Dispatch Diagnostics

- `codex-cli 0.151.0`, `agy 1.1.22`, Darwin x86_64.
- All models smoke-proven before each dispatch with a discriminative probe (`17 × 23` + self-ID);
  all returned `391` and named themselves correctly — no flag-order model substitution.
- All rounds ACKed with the packet-bound handshake. Zero `error`/`turn.failed` events; empty stderr
  throughout.
- Round sizes: R1 packet 14 KB · R2-blind 11 KB · R3 informed 148 KB.

---

## The Question

> What is the right architecture for a product to call **any** external service — the credential
> model, the call-shape model, and how the two compose?

Round 3 added the owner's constraint, framed as genuinely open:
> Can per-vendor integration code be eliminated entirely? **Should** it be?

---

## Synthesis

### Settled — converged independently, five of five, while blind

1. **The credential seam is a signer, not a secret.** The adapter builds an *unsigned* request; a
   broker attaches auth beneath it. Named differently by each participant (`AuthApplier`,
   `AuthenticatedRequestSigner`, opaque-handle broker, `ResolvedAuth`) but structurally identical.
   Treat as decided.
2. **Async requires a durable job row + a leased worker.** Polling cannot live in a request handler.
   Near-identical column sets proposed independently: status, attempts, next_poll_at, lease,
   deadline, state_json.
3. **Two independent bounds** — an attempt cap *and* an absolute deadline. One catches a vendor that
   answers "pending" forever; the other catches a vendor that stops answering.
4. **Migration by dual-read strangler**, per-table resolvers, **never** a generic cross-table decrypt
   path — a legacy row's auth tag only verifies against its own table's AAD lineage.
5. **AAD bound to row identity.** No longer a design opinion — a demonstrated live vulnerability.

### The Round 3 answer: config vs. code

All four converged on a narrower answer than either extreme, and the best formulation is Codex's:

> **Configuration remains declarative only while it uses a closed, non-Turing-complete vocabulary of
> reviewed operations. JavaScript expressions, callbacks, arbitrary loops, embedded WASM, or "custom
> transformation" hooks are integration code disguised as data.**

That is a *testable* criterion, unlike "we'll keep the config simple."

- **Codex** — configuration-first, typed-adapter-always-available. Eliminate routine adapter code
  where a closed effect algebra fits; never eliminate the escape hatch.
- **Flash** — bimodal: declarative Tier A with a **fixed-pipeline** `followUpFetch` step (explicitly
  not a general DSL) to handle the second-network-call case; typed Tier B as a first-class peer.
- **Pro** — **code-as-config**: a `DeclarativeRestAdapter` *class in TypeScript*, instantiated with a
  config object for the simple majority, interface-implemented for the rest. Config ergonomics with
  a typed boundary and nothing to erode into.
- **Primary** — proposed Tier A/B, then conceded Pro's is strictly better: "make Tier B first-class"
  was naive about incentives, since people will shoehorn hard vendors into config to avoid waiting
  on an engineer.

**The decision reduces to one product question:** do you need vendors addable **at runtime, without a
deploy**? If yes → Flash's bounded declarative tier, and you must actively police erosion. If no →
Pro's code-as-config wins outright and there is no second language to police.

### The "wrong axis" exchange

The Coordinator argued that config-vs-code optimizes the cheap half: 12 provider files and ~18
registrations sat **imported by no application for months**, so adapter authoring cost was never the
bottleneck — missing async support and a consumer were. **Both Gemini participants conceded this**,
then Flash rebutted the load-bearing half: the Coordinator conflated *developer authoring
convenience* with *runtime platform capability*. An agent discovering a tool at runtime, or an admin
adding an endpoint without a redeploy, cannot be served by code at all. Concession accepted;
prioritization still disputed.

### Still open after three rounds

- **Sync-UI / async-job impedance.** Raised only by Pro. Forcing a 200 ms human-facing call through a
  durable job row degrades the UI. Flash's answer: optimistic inline execution up to an interactive
  deadline (~2 s), escalating to a persisted row only on `pending` or timeout.
- **Pagination.** Raised only by Pro. Multiple fetches with possible mid-stream auth expiry, but not
  a submit-then-poll job. Flash treats it as a streamed operation passing through the signer per
  chunk, deliberately not in the job table.
- **One table vs. nine.** Codex/Flash/Pro say consolidate; Sonnet says unify shape+lifecycle but keep
  storage policy per trust tier. **Coordinator's own late position, which no participant argued:**
  the evidence that settled this was a *governance* failure, not a schema one — fragmentation let one
  implementer forget the principal in the AAD. One table does not prevent drift; **a single audited
  sealing path does.** Unify the sealing path; care much less about table count.

---

## THE CENSUS — the only empirical evidence produced, and it settles the question

Sonnet 5 read all 12 provider files / 18 registrations and classified them.

| Class | Count | Detail |
|---|---|---|
| **Config-coverable** | **12 / 18 (67%)** | URL template + auth-ref + JSON body template + straightforward extraction; at most enum/lookup/clamp validation |
| **Soft defeats** | 3 / 18 | One runtime conditional on `baseUrl` or a model-name substring (`openai` image+speech Azure branch, `nanobanana` header selection) — absorbable by ONE closed-set primitive |
| **Hard defeats** | 2-3 / 18 | Genuine runtime branching on response **schema**: `aihubmix/image` (two unrelated wire dialects), `senseaudio/image` (SSRF-guarded second fetch + two uncorrelated failure signals), `openrouter/image` (3-way decode + model-substring heuristic) |

**83% coverable counting soft defeats.** This clears the Coordinator's own stated falsifiable bar
(">=8 of the next 10 covered ⇒ Tier A is worth building first and my 'wrong axis' claim is
overstated"), run against vendors that actually exist rather than a hypothetical ten. Sonnet expected
~50/50 going in; the measured result is 2:1 for declarative coverage.

**The "second network call" objection is far narrower than the codebase's own doc comment implies.**
Of ~7 registrations with a second-call site, **5 already share one parameterized helper**
(`bytesFromOpenAICompatibleData`) — i.e. that shape is already, in substance, configuration. Only
**2 of 18 (11%)** need a genuinely bespoke second-call path.

**A false comment at the heart of the argument — verified independently by the Coordinator.**
`vendor-adapter.ts`'s header cites "AIHubMix's Gemini-native redirect" as a case where parsing needs
a second network call. It is not one: `aihubmix.ts:37` states the routing happens in `buildRequest`,
and `classifyAIHubMixModel` is called at line 77 inside `buildRequest`. The real second fetch is line
165, in the *other* branch. **The packet's central empirical anchor against declarative config was
imprecise about its own strongest cited case.**

**Both things are true at once.** Build Tier A (most vendors are config-shaped busywork today) AND
build durable async (nothing in this package has ever survived a restart). They are orthogonal, not
competing uses of the same week — which corrects the Coordinator's "wrong axis" framing as stated,
while leaving the underlying async-urgency point intact.

**Erosion tripwire, proposed by Sonnet and worth adopting:** one closed-set conditional primitive is
fine; the moment a *second, unrelated* conditional primitive is needed for the next vendor, that is
the start of the slope every Round 1 participant warned about — stop and reconsider.

**Also caught:** Gemini 3.7 Flash's claim that the engine went unused *because* it was synchronous is
unsupported — the fix commit states the sole cause as "imported nowhere under `apps/`". Flash
inferred a cause flattering to its own argument. And "months" overstates it: engine created
2026-07-21, first app consumer 2026-09-02 = 43 days.

---

## Decision Ledger

| Finding | Source | Status |
|---|---|---|
| Signer/broker seam, adapter never holds a secret | all 5, independently | **Adopt** |
| Durable job row + leased worker, two bounds | all 5 | **Adopt** |
| Closed, non-Turing-complete vocabulary as the config/code test | Codex | **Adopt as a hard rule** |
| Code-as-config (`DeclarativeRestAdapter` class) over a JSON DSL | Pro | **Adopt** (Primary dropped its own Tier A/B for this) |
| **5 stores sealed without AAD, not 3 or 1** | Sonnet (traced `.seal()` call sites) | **Verified; FIXED** in `ffb5ce44` |
| `adminExecutionCredentials` = 2-key scope + no AAD ⇒ **cross-principal** ciphertext transplant | **Gemini 3.1 Pro**, from the packet alone | **Verified; demonstrated exploitably** — RED test returned admin-B's key through admin-A's row |
| `Unknown(reconciliation)` state for the crash gap; retry safety gated on idempotency | Codex | **Adopt** — refutes the Primary's unqualified retry-once rule |
| OAuth grants are acquisition flows, not runtime credential types | Codex | **Adopt** |
| Flash's engine leaks the provider Bearer token to an asset host via the authenticated client in `parseSubmitResponse` | Pro | **Real flaw in a peer's design**; needs an auth-stripping `fetchPublicAsset` |
| MCP-first as the organizing principle | Primary proposed | **Rejected** 4–1 |
| Composio "cannot be foundational because single-process" | Primary's framing | **Wrong** — constrains connection *initiation*, not credential *usage*. Propagated into Flash's R2 ranking. |
| **`imagerouter` video is "already async"** | **Primary — FALSE** | **Retracted.** Verified: `buildRequest → one fetch → parseResponse`, no poll loop. `source-map.md:96` files async-polling vendors as deferred. Sonnet R2 said "cut the video route *over to* submit-then-poll"; the Coordinator strengthened it to "already-async" and 4 participants built a slice on the mischaracterization. |

**Coordinator error tally (kept deliberately):** AAD count wrong twice (trusted a stale doc comment
over call sites), MCP-first, unqualified retry-once, the Composio framing, the Defect-3 hypothesis,
and the `imagerouter` "already-async" fabrication. Each was caught by a peer or subagent with
evidence. The adversarial structure earned its cost primarily by correcting the Coordinator.

---

## Final Recommendation

**Build order, revised after the `imagerouter` retraction:**

1. **Run the five AAD backfill scripts** (dry-run first). `ffb5ce44` binds AAD on *new* writes, but
   the three live rows are still `aad_version = 0` and protected only by the legacy read path. The
   cross-principal case (`adminExecutionCredentials`) is demonstrated exploitable. This is cheap and
   it is an open door. **Coordinator's position, against the four-way consensus that put the
   architecture slice first.**
2. **Build submit/poll for one currently-blocking vendor.** `imagerouter` video is the right target —
   but the framing is "build a poll loop for a vendor that blocks for up to 10 minutes on one fetch,"
   **not** "fix an already-async path." The `kill -9`-mid-poll test only becomes meaningful once the
   poll loop exists.
3. **Then** the credential-model consolidation, via the `dual-read.ts` strangler, smallest AAD-having
   table first (`customCredentialSets`) as the generalization probe.

**Coordinator's own strongest opinion, which no packet ever asked about:** in this single session,
Codex fabricated a completed tool call, an agent reported a file write that never happened, and five
mid-flight messages silently vanished. **None of the five designs says anything about verifying that
a claimed action actually occurred.** That is a demonstrated failure class in this product, and it
received zero design attention because it was never put in a packet.

---

## Open Threads

- ~~Sonnet R3's provider census~~ **DELIVERED — see The Census above.** Remaining from it: — the only *empirical* evidence on config-vs-code:
  of 12 provider files, how many could have been pure configuration and what specifically defeated
  it in each case that could not. Its R3 report arrived truncated; the remainder was requested.
- The five AAD backfill scripts exist, are dry-run-by-default with restore points, and have **not
  been run**.
- Whether `Aider` / `Antigravity` / `Pi` have any MCP tool wiring at all — all three are selectable in
  the runtime picker today and may give a user an agent with zero Tovu tools.

## Artifacts

- `responses/` — every participant's verbatim answer, all three rounds, plus raw Codex JSONL.
- `packets/` — the four dispatched packets (R1, R2-informed-unused, R2-blind, R3).
- `responses/primary-r*-frozen.md` — the Coordinator's positions, each frozen **before** dispatch.
- `responses/primary-r2-implementation.md` — the Coordinator's sealed implementation sketch.

**Known artifact defect:** `responses/sonnet-r2.txt` is the Coordinator's transcription, not the
verbatim original — the subagent reported a 41,459-byte write that produced no such file. All
sections and load-bearing arguments are present; code detail and prose length are thinner. R3 was
therefore informed by an abridged version of one participant.

---

## RESOLUTIONS TO THE FOUR OPEN QUESTIONS (Sonnet 5, post-census)

### 1. One canonical table vs. nine — **column, not schemas; and the priority just dropped**

The urgency case for consolidation was mostly a *security* argument: nine tables meant nine
inconsistently-audited AAD policies. **`ffb5ce44` closed AAD uniformly across all nine today**, so
that argument is largely moot. What remains is developer experience and long-run consistency — real,
but sequence it **after** the async/durability work rather than racing it.

**The concrete recommendation:** the AAD fix used exactly the strangler mechanism this debate
independently converged on — an `aad_version` discriminator column, `open()` branching on it, a
per-store idempotent dry-run-by-default backfill, and an adversarial transplant test. **Reuse that
mechanism verbatim for the table consolidation. Do not design a second migration playbook.** The AAD
fix is now this codebase's reference implementation for this class of change; treat it as precedent,
not a one-off.

### 2. Composio — **run both, permanently, as a first-class variant**

Delegated custody (the product never holds the secret) is a genuinely different trust model, not a
degraded OAuth2. It belongs as one variant in the credential union (`kind: "brokered"`), never as a
competing subsystem callers choose between up front.

The single-process constraint is real but **narrow**: it pins only the *OAuth handshake* — "connect a
new account," which touches an in-process pending-connection map. Steady-state **use** of an
already-connected account, which is what happens on every actual tool call, has no such constraint; a
horizontally-scaled worker hands Composio an opaque connection id and gets a result. So "Composio
can't be foundational because it's single-process" is **false for the 99% case** and true only for the
naturally-rare one. Design for that split: initiation stays pinned or goes through a small dedicated
handshake service; **use is stateless and runs anywhere.**

### 3. Sync-UI / async-job impedance — **persist the row BEFORE the fetch, then race a grace window**

The best resolution produced in three rounds. There is no separate sync path and async path.

1. Caller invokes the operation port with no knowledge of sync vs. async.
2. The runtime **persists the operation row first** — `status: 'submitted'`, `deadlineAt`,
   `maxAttempts` — *before attempting any HTTP call*.
3. Each adapter declares a static `expectedLatencyClass: 'fast' | 'slow'`.
   - `'fast'` → attempt inline against a **short** deadline (3-5 s, not the 10-minute GENERATE-class
     timeout). Resolves in time ⇒ mark `succeeded`, return `{done: true, result}` in the same HTTP
     round trip. Indistinguishable from today's behavior for the ~17/18 registrations that really are
     fast.
   - `'slow'`, or a `'fast'` call that overruns ⇒ row moves to `'polling'` and the caller gets
     `{done: false, operationId}` on that same first round trip instead of hanging on an open socket.
4. **Human UI and agent get the identical contract** — a result, or an `operationId` to check back on.
   The split that matters is fast-class vs. slow-class *vendors*, a data property declared per
   adapter, not a caller property.
5. **Crash safety is free, not bolted on:** because the row exists before the fetch, a crash during
   the "trying synchronously" phase leaves the same recoverable row an async job would have.
   *The grace window is a race, not a fork.*

This answers Gemini 3.1 Pro's objection without accepting its implied conclusion — durability and a
responsive UI are only in tension if row creation happens *after* a timeout instead of before the
fetch.

### 4. Pagination — **a third shape, deliberately NOT the job table**

A paginated read is a sequence of independent synchronous calls sharing one credential resolution,
possibly crossing a mid-stream expiry. Neither submit-then-poll nor a single request/response.

```ts
export interface PaginatedServiceAdapter<Item, Cursor = unknown> {
  readonly requireCredential?: VendorCredentialGuard;
  buildPageRequest(cursor: Cursor | null, credentials: ProviderCredentials): VendorRequest;
  parsePageResponse(resp: Response): Promise<{
    readonly items: readonly Item[];
    readonly nextCursor: Cursor | null;   // null = exhausted
  }>;
}
```

It **reuses the same credential-resolver seam** — each page re-resolves, covering mid-stream expiry
for free via the same per-tick rule as polling ("never persist material in `state_json`").

It deliberately does **not** reuse `external_operations`: a paginated read is bounded by the caller's
own attention (a UI scrolling, an agent iterating), not a durable background operation with a lease
and a deadline surviving restart independent of its caller. Persisting it as a leaseable row would
model a lifecycle it does not have. A full-catalog sync that must survive restart is a *different
feature* — a durable job whose body calls a `PaginatedServiceAdapter` in a loop — not a change to this
port.

---

## THE TIER BOUNDARY — the actual design rule, sharper than the 12/18 headline

> **The boundary is NOT "does a second network call happen."** Five of the ~7 registrations with a
> second call are already Tier-A-shaped, via the shared `bytesFromOpenAICompatibleData` helper.
>
> **The boundary IS: does the response require checking more than one independent, uncorrelated
> failure signal before you know whether the second call is even safe to make?**

That is falsifiable and mechanical, unlike "this vendor feels complicated." Carry *this* into design,
not the 12/18 number — the number sizes the opportunity; this rule decides each case.

### Tier B needs nothing new

The existing `VendorAdapter<Meta>` (`requireCredential?`, `buildRequest`, `parseResponse`) already IS
the minimum typed adapter surface, proven across all 18 live registrations including both hard-defeat
cases. **Do not touch it.** Tier A is purely additive: a spec compiled into that same interface and
registered into the same `mediaVendorRegistry`, indistinguishable to `dispatchVendorRequest` from a
hand-written adapter.

### The spec shape (abridged — full source in `responses/`)

```ts
export interface DeclarativeVendorSpec {
  readonly providerId: string;
  readonly routeKey: string;
  readonly baseUrl: { readonly default: string };
  readonly request: {
    readonly path: string;                        // '/v1/text-to-speech/{voice}'
    readonly auth:
      | { readonly kind: 'bearerHeader' }
      | { readonly kind: 'apiKeyHeader'; readonly header: string }
      // The ONE conditional primitive, earned by openai's Azure branch and nanobanana's
      // Google-vs-gateway branch. A closed predicate shape, NOT an expression language.
      | { readonly kind: 'headerByHostname'; readonly whenHostname: string;
          readonly thenHeader: string; readonly elseHeader: string };
    readonly body: Readonly<Record<string, DeclarativeValue>>;
  };
  readonly result:
    | { readonly kind: 'rawBytes'; readonly zeroBytesMessage: string; readonly suggestedExt: string }
    | { readonly kind: 'openaiCompatibleData'; readonly errorTag: string }   // reuses the existing shared helper
    | { readonly kind: 'hexEnvelope'; readonly errorTag: string };
  readonly validate?: ReadonlyArray<
    | { readonly kind: 'nonEmptyPrompt' }
    | { readonly kind: 'maxPromptChars'; readonly max: number }
    | { readonly kind: 'clampNumber'; readonly field: 'duration'; readonly min: number; readonly max: number }>;
}
```

`DeclarativeValue` is a closed union: `literal`, `fromContext`, `fromCredentials`, or a `lookup`
table with passthrough fallback. No expressions, no callbacks — satisfying Codex's
non-Turing-complete test by construction.

### THE EROSION TRIPWIRE — adopt this as a written rule

`headerByHostname` is the **one** conditional primitive, earned by two real vendors. **If a third,
unrelated conditional shape is needed for the next vendor, that vendor graduates to Tier B.** The
tripwire is not "the config got complicated" — it is "we are about to add a second unrelated
conditional kind," which is a bright line someone can enforce in review.

### Worked failure case — SenseAudio image, deliberately NOT expressible

Included because a spec that only demonstrates its successes proves nothing about where the boundary
is. SenseAudio breaks exactly at `result`: there is no way to say *"fetch this JSON, check field A for
one failure mode AND separate uncorrelated field B for a different one, then — only once both pass —
make a SECOND request through an SSRF-guarding fetcher"* without the `result` union growing a nested
conditional-and-sequencing sublanguage. **That is the erosion path all four Round 1 participants
predicted, reachable in exactly one step from this spec shape.** It stays Tier B, unchanged:

```ts
if (data.base_resp && data.base_resp.status_code !== 0) throw ...    // signal 1
if (typeof data.error_message === 'string' && data.error_message) throw ...  // signal 2, uncorrelated
const imgResp = await assertAndFetchExternalAsset(url, withRequestInit(ctx));  // SSRF-guarded 2nd fetch
```

Two independent failure signals plus a guarded second call is not a declarative result-kind. **It is
control flow, and control flow is what "typed adapter" exists for.**

---

## STATUS: COMPLETE

All three rounds dispatched, all five participants' answers captured verbatim in `responses/`, the
census delivered and independently verified, and all four open questions resolved. Remaining work is
execution, tracked in **Open Threads** above.
