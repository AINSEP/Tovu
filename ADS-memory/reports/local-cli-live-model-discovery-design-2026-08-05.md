# Design: live model discovery for the Local CLI picker

**Date:** 2026-08-05
**Agent:** Software Architect (design pass — no production code written)
**Status:** Design only. Implementation blocked on user sign-off for one open item (see §6).
**Governs:** Tovu only. No Jini source changes required (see §4, rejected alternative B).

## 0. What this replaces

Two prior sessions closed the discovery question down to a decision, not a bug fix:
- `Jini/ADS-memory/reports/chat-pane-model-list-discovery-findings-2026-08-05.md` — traced all
  four candidate discovery seams (`loadMmdRouteModels`, CLI `listModels` probe, ACP probe, a raw
  API call) and found no credential reachable from the Local CLI path.
- `Jini/ADS-memory/reports/chat-pane-model-list-open-design-precedent-2026-08-05.md` — confirmed
  Open Design has the identical gap for its own CLI-agent picker, and that its one working live
  mechanism (`provider-models.ts`) is BYOK-shaped: a required, non-optional, user-supplied
  `apiKey`, no ambient fallback.

The user decided: build that BYOK-shaped live call anyway, accepting the picker gains a
"live when a key is available, static otherwise" behavior rather than staying uniformly static.
This document is the design for that decision. It does not re-litigate either closed report.

## 0.1 Independent verification received mid-design (Coordinator, two messages, both addressed below)

**Msg #1 — pointed at Tovu's `development/e2e/byok-*.spec.ts` cluster** (`byok-model-discovery-
self-heal`, `byok-ssrf-guard`, `byok-hostile-provider`, `byok-key-handling`,
`byok-credential-persistence`, plus five more). Read all headers, one full spec
(`byok-model-discovery-self-heal.spec.ts`), read-only, nothing under `development/e2e/` touched.
**Finding: this cluster does not shrink the task to "wire the Local CLI picker through an
already-connected path."** Every one of these specs targets the SAME thing: `@jini-ai/ui`'s
`ExecutionTab` (the Settings dialog's BYOK tab) or `AssistantDock.tsx`'s `useByokRuntime`
discovery effect, both hitting `.../assistant/execution/models` — i.e., the `byok` execution
mode's OWN model dropdown, not the `local-cli` mode's. The Local CLI picker is not mentioned in
any of these specs. What the cluster DOES establish, and what changes in this document below:
`listProviderModels`/`.../execution/models` is not merely functionally correct, it is
adversarially battle-tested — SSRF-guarded (`byok-ssrf-guard.spec.ts`: RFC1918, link-local,
metadata, CGNAT, 0.0.0.0, DNS-rebinding all blocked; loopback allowed by documented design), and
proven to hold against a real hostile provider (`byok-hostile-provider.spec.ts`: malformed/
truncated JSON, 10k-model floods, XSS-shaped ids, hangs — "no bypass, everything held"). §3.1's
design calls `listProviderModels` directly (not through the HTTP route), and that function is
where both the SSRF guard (`validateBaseUrlResolved`) and the hostile-payload handling live —
so this design inherits all of it for free, with no additional code. Confirmed explicitly, per
the caution in msg #1: **a Max-subscription admin with no stored key sees exactly today's
`CLAUDE_FALLBACK_MODELS` array, unchanged, `modelsSource: 'fallback'`, zero added latency** — the
credential-resolution branch in §3.1 step 3 never attempts a network call when
`resolveExecutionCredential` returns `null`, which is what happens by construction when no row
exists.

**Msg #2 — independently verified the SEC-001 claim and found one gap: principal mismatch.** The
citation and phrasing corrections it flagged (SEC-001's code site being `Jini`'s
`agent-executor.ts`, not Tovu's; `@anthropic-ai/sdk` being fetch-avoided, not "already wired" as a
dependency) were already stated correctly in §3.4 and §4 of this document as first written — those
were errors in the dispatch brief and my own chat summary, not in this file. The substantive
finding, which this revision addresses in §3.1 and the new §3.5 below: **the admin's own BYOK API
key and the locally-spawned `claude` CLI's OAuth session are two different auth principals against
two different account entitlements.** A model the API key can list is not guaranteed to be one the
OAuth-authenticated CLI process can actually run, and vice versa. See §3.5 for the resolution
(union, not replace) and why it doesn't introduce a new class of failure.

## 1. Where the stale list actually comes from — traced past where the closed reports stopped

Both closed reports examined `@jini-ai/agent-runtime`'s dispatcher (`detection.ts`) and
`claude.ts`'s `fetchModels`/`listModels`/`fallbackModels` in the abstract. Neither traced which
function on Tovu's side the browser's Local CLI dropdown actually calls. It matters, because the
answer is narrower than "the dispatcher has no live path":

```
apps/admin/src/components/AssistantDock.tsx  fetchAgents()  →  GET /api/agents
  → src/server/modules/assistant.ts:398-400 (requireAdminSession, then proxyPassthrough — a raw
    streaming byte relay, never parses the body)
  → Jini daemon: registerAgentRoutes(app, { listAgents: listAssistantAgents }, adapter)
    (@jini-ai/http-kit's agents.ts, unchanged)
  → src/assistant/agents.ts: listAssistantAgents()
```

`listAssistantAgents()` (`src/assistant/agents.ts:23-40`) is the actual, single, unconditional
source of every `AgentSummary` the browser receives. Read in full — it does **not** call
`detection.ts`'s dispatcher, `fetchModels`, or `listModels` at all. Every def gets:

```ts
models: def.fallbackModels,
modelsSource: "fallback",
```

unconditionally. So the picker isn't hitting a dispatcher that *tries* live discovery and falls
back — nothing on the Tovu side attempts live discovery today. That's a materially simpler starting
point than "wire around a failing live path"; it's "add a live path where none exists."

One thing this trace surfaces that neither closed report mentions, because neither read
`@jini-ai/http-kit`'s wire contract: **`AgentSummary.modelsSource?: 'live' | 'fallback'`
(`packages/http-kit/src/agents.ts:39`) already exists in the transport type.** Nothing produces
`'live'` anywhere in either repo today (`grep -rn "modelsSource" — only the one declaration and
the one hardcoded `'fallback'` write). This is a pre-built extension seam, not something to invent.

## 2. What 558d6a3 already provides vs. what remains

558d6a3 built a real, tested, encrypted-at-rest, per-`(workspace, admin)` BYOK credential store
(`admin_execution_credentials`) plus a live model-discovery route
(`POST /api/admin/v1/workspaces/:id/assistant/execution/models`, `list-models.ts`) that already
calls `@jini-ai/agent-runtime`'s `listProviderModels` — the exact OD-derived, `fetch`-based,
`x-api-key`-header function this task's brief pointed at. Confirmed directly in
`packages/agent-runtime/src/providers/model-catalog.ts:300` — no `@anthropic-ai/sdk` involved, and
its return shape is already `{id, label}[]` (label from `display_name`), which maps onto
`AgentModelSummary` with no translation.

**But this infrastructure powers a different execution mode than the one reported broken.** Tovu
has three modes: `local-cli` (spawns installed CLIs via the operator's own OAuth/subscription, no
key — the one with the stale list), `byok` (Tovu calls the provider API directly, bypassing the
CLI, using the 558d6a3 admin key), and a third, unrelated SITE-scoped BYOK for the public visitor
assistant (ADR-058, pre-existing). `list-models.ts` resolves its live-fetch credential from only
two places today: a key typed in the request body, or the SITE's stored credential
(`resolveSiteAssistantApiKey`) — **never** the ADMIN's own `admin_execution_credentials` row
558d6a3 just added. `execution-deps.ts`'s `AssistantExecutionRouteDeps` doesn't carry
`adminExecutionCredentialRepo` at all yet.

**What remains, concretely:**
1. `list-models.ts` / `execution-deps.ts` need to be able to resolve from the ADMIN's stored
   credential, not just the SITE's (small, additive — see §3.2).
2. `listAssistantAgents()` — or something upstream of it — needs to attempt a live call for
   `claude` and merge the result with `modelsSource: 'live'`, falling back to today's unconditional
   `def.fallbackModels`/`'fallback'` on any absence or failure (§3.1).
3. Nothing in Jini needs to change. `listProviderModels`, `AgentSummary.modelsSource`, and the
   `agent-runtime` registry are already shaped for this.

## 3. Recommended design

### 3.1 Where the live attempt is made: a new enrichment step on Tovu's `GET /api/agents` proxy, not inside the daemon

`src/server/modules/assistant.ts:398-400` currently proxies `/api/agents` with `proxyPassthrough`
— `forwardToAgentDaemon` + `relayResponse`, a byte-for-byte streaming relay
(`relayResponse`, `assistant.ts:76-97`) that never parses the response body. That's the wrong place
to leave this route: parsing and rewriting JSON needs a dedicated (non-streaming) handler for this
one route, which is a small, self-contained addition — not a modification of the generic proxy
machinery every other route still uses.

**New handler**, registered in place of `proxyPassthrough` for `GET /api/agents` (and, for
consistency, `POST /api/agents/rescan`):
1. Resolve the daemon's JSON body the same way `forwardToAgentDaemon` does today (fetch, but
   `await upstream.json()` instead of streaming).
2. `getAuthedPrincipal(res)` — already available at this layer; `requireAdminSession` runs first
   in the same middleware chain `list-models.ts`'s sibling routes use.
3. For the one entry whose `id === "claude"` (see §3.3 for why only this def), attempt:
   `resolveExecutionCredential({repo: deps.adminExecutionCredentialRepo, sealer}, {workspaceId, principalId})`.
   - `null` (no row, no key, decrypt failure) → leave the daemon's `fallback` entry untouched.
     This is the by-construction "never a gate" property: the code path that would produce a live
     result simply doesn't run when there's nothing to run it with.
   - A resolved credential with `protocol !== "anthropic"` → also leave it untouched (an admin who
     configured BYOK for e.g. `openai` has no bearing on Claude's own model list).
   - `protocol === "anthropic"` → call `listProviderModels({protocol: "anthropic", baseUrl: stored.baseUrl ?? "https://api.anthropic.com", apiKey: stored.apiKey})`.
     - `ok: true` → **union** that entry's `models` with `def.fallbackModels` (dedupe by `id`,
       fallback entries always kept — see §3.5 for why this is a union, not a replace),
       `modelsSource: "live"`.
     - `ok: false` (auth rejected, network error, timeout) → leave the daemon's `fallback` entry
       untouched. Same non-gating property — a bad/expired key degrades to exactly today's
       behavior, never to an empty or broken picker.
4. Return the (possibly enriched) JSON via `res.json(...)`, not the raw stream.

**Why here and not the daemon (`listAssistantAgents`) or the browser (`useByokRuntime`-style hook):**
this is a Runner-Up Comparison, not an arbitrary pick — see §4 for the two rejected alternatives
and why each loses to this one specifically in the current tree.

**Caching.** Unlike `detectLocalAgents`/`rescanLocalAgents` (which spawn ~24 processes and are
already cached client-side, `execution-settings.ts:449-464`), `listAssistantAgents()` itself is
cheap today — a `PATH` resolution per def, no spawn, no network. Adding a live HTTPS call changes
that profile for every `/api/agents` load (dock mount, tab switch back to the dock, etc.), so this
needs its own short-TTL, in-memory, `(workspaceId, principalId)`-keyed cache at the new handler —
a smaller version of the same in-flight-promise-sharing idea `cacheDetection` already uses, just
server-side and with a TTL (a few minutes is plenty; installing/rotating a key is a deliberate
admin action, not something that needs sub-minute staleness). This is new code, but it's a single
`Map` with a timestamp check, not a new subsystem.

### 3.2 The credential-resolution delta in `list-models.ts` / `execution-deps.ts`

**Recommended name for the new opt-in flag, since this was explicitly asked for: `useStoredAdminCredential`.**
Not a second `useStoredCredential` overload and not a rename of the existing flag (that would be a
breaking change to a route two other callers — the Settings tab and the AI Assistant tab — already
depend on with the SITE-scoped meaning). `useStoredAdminCredential` names the scope explicitly in
the flag itself, so a future reader never has to trace which store `useStoredCredential` meant on a
given call site the way this session had to.

Needed regardless of §3.1's exact shape, because it's the same gap either way: thread
`adminExecutionCredentialRepo` (already on `RouteDeps`, confirmed at `routes/types.ts:185`,
`server/deps.ts:569`, `server/app.ts:400`) and its sealer into `AssistantExecutionRouteDeps`
(`execution-deps.ts`), and give `list-models.ts` a second opt-in flag — the existing
`useStoredCredential` boolean is now ambiguous between "the SITE's stored credential" and "the
ADMIN's stored credential" now that both exist; don't overload it. Either a second boolean
(`useStoredAdminCredential`) or, since the new §3.1 handler calls `resolveExecutionCredential`
directly rather than going through this HTTP route at all, this delta may turn out to be needed
only for hygiene/consistency (a future caller wanting the same capability over HTTP) rather than
being on the critical path for §3.1. Flagged as a task either way (§7) since `resolveExecutionCredential` is exported from `execution-credential-store.ts` and importable directly — the new
`/api/agents` handler does not have to round-trip through `list-models.ts`'s HTTP route to use it.

### 3.3 Scope: `claude` only, v1

`claude` is the one def in the 24-entry `AGENT_DEFS` registry whose `fetchModels` is a structural
no-op (`loadMmdRouteModels`, proxy-routing config, never calls a live API — confirmed in the closed
discovery report). Every other def either has no live mechanism either (plain static
`fallbackModels`) or already has one that works without a stored key (`listModels` CLI-stdout probe
for codex; ACP probe for 8 others) — none of those are the reported bug, and none benefit from this
change. Scoping to `id === "claude"` keeps the enrichment step a single, named special case rather
than a generic "try live discovery for anything with `protocol: anthropic`" mechanism that doesn't
exist yet in the registry's own type (`AgentDef` has no `protocol` field — inventing one to
generalize this now would be speculative generality for a registry this design doesn't otherwise
touch).

### 3.4 SEC-001 position — stated, not deferred

`Jini/packages/daemon/src/agent-executor.ts:535-547` forbids the spawned agent CLI's subprocess
env from reading `process.env` implicitly; credentials must be explicitly delegated per run
(`credentialEnv`). **This design does not touch that boundary at all**, and I'm stating that as a
verified fact, not asking for a call on it:

- The live call in §3.1 is Tovu-server-to-`api.anthropic.com`, using a credential resolved from a
  Postgres/SQLite row via `resolveExecutionCredential` + the existing sealer/keyring — never
  `process.env`, never `buildAgentEnv`, never `agent-executor.ts`'s `run()` at all.
- The spawned `claude` CLI subprocess itself is completely unaffected: it still authenticates via
  its own OAuth/Max-subscription session exactly as it does today. This design changes what the
  *picker's dropdown shows*, not how the CLI process that later runs is authenticated.
- These are two independent credentials for two independent purposes (asking "what models exist"
  vs. "run this prompt"), and this design keeps them independent — the same separation
  `execution-settings.ts`'s own header already enforces between the SITE and ADMIN BYOK stores.

So, contrary to the dispatch brief's framing that this call might need to be made and flagged for
sign-off: it doesn't arise. There is no SEC-001 exception, deviation, or violation to record.

### 3.5 Principal mismatch — resolved as UNION, not replace, and why that's not a new failure mode

The admin's stored `admin_execution_credentials` row authenticates as an **Anthropic Developer API
account** (metered, `x-api-key`). The spawned `claude` CLI the picker's selection actually drives
authenticates separately, as a **claude.ai Max-subscription OAuth session**
(`authMethod: "claude.ai"`, `apiProvider: "firstParty"` — verified directly against the installed
binary in the closed discovery report). These are two different principals with potentially
different entitlements: a model `GET /v1/models` reports for the API account is not guaranteed to
be one the OAuth session's CLI process can run, and a model the CLI could run under its
subscription might not appear in the API account's catalog at all (e.g. it may not be
API-metered-billing-eligible under that plan).

**Decision: the live result is UNIONED into the fallback list, never replaces it.**
`def.fallbackModels` (the full `CLAUDE_FALLBACK_MODELS` array, including the bare `sonnet`/
`opus`/`haiku` ALIASES) is always present in the response, unconditionally. Live-discovered ids
not already in that set are appended, deduped by `id`. Rationale:

- The bare aliases are resolved BY THE CLI ITSELF at spawn time, under whatever account is
  actually authenticated — they are the one entry class in this whole system guaranteed to track
  entitlement correctly and never go stale (confirmed: `claude.ts`'s `buildArgs` passes them
  through unresolved; the CLI's own `--model sonnet` resolution is what maps the alias to a
  concrete id at run time, not anything Tovu computes). A REPLACE strategy would risk dropping
  these in favor of an API-account-scoped list that might not even contain them (aliases aren't
  API catalog entries) — turning today's "slightly stale but always-correct" picker into a
  "fresh-looking but sometimes-wrong" one. That is a strictly worse regression than the bug being
  fixed.
- A live-discovered pinned id that turns out not to be runnable under the CLI's OAuth account
  fails at spawn/run time with a CLI-reported error — the SAME failure mode a stale pinned id in
  today's static fallback already carries (nothing in the current design guarantees
  `CLAUDE_FALLBACK_MODELS`'s pinned entries are valid for every account either). Union does not
  introduce a new *class* of failure, only a marginal chance of one additional non-working pinned
  entry appearing in the list — bounded, not open-ended, and no worse than the status quo's own
  risk on its pinned entries.
- This directly reframes constraint 1, per the Coordinator's own sharpening: **live discovery is
  enrichment layered on top of a list that is already correct, not a corrected list arriving
  late.** The no-key path isn't a degraded fallback case relative to the live path — for the
  alias entries specifically, it may be the MORE reliable of the two, and union preserves that
  property unconditionally rather than trading it away.

`modelsSource` (the existing binary `'live' | 'fallback'` field) is set to `'live'` whenever the
call succeeded and contributed at least one entry — even though fallback entries are still fully
present, so this is not misleading, it signals "this response carries live-verified data in
addition to the static set." No change to `@jini-ai/http-kit`'s type is needed either way; this is
a semantic choice on Tovu's side, not a protocol change.

## 4. Rejected alternatives

**(A) Fix it in Jini — give `claude.ts`'s `fetchModels` a real live call, threading a credential
down through `detection.ts`'s dispatcher.** Rejected. `AGENT_DEFS`/`detection.ts` are deliberately
host-agnostic and stateless — shared by every host that consumes `@jini-ai/agent-runtime`, not
Tovu-specific. Threading a per-`(workspace, admin)`, DB-backed, sealer-encrypted credential into
that stateless dispatch chain would smear a Tovu-specific persistence concern into a package other
hosts depend on, and would duplicate credential-resolution plumbing 558d6a3 already built correctly
at the Tovu layer. It would also reopen the `@anthropic-ai/sdk` dependency question the OD
reference and 558d6a3 both already avoided by using a plain `fetch` (`model-catalog.ts`) — no
reason to reintroduce that cost when the Tovu-layer design needs no new dependency at all.

**(B) Browser calls the existing BYOK `list-models.ts` route directly and merges client-side,
mirroring `useByokRuntime`'s already-proven pattern (`AssistantDock.tsx:334-407`).** This is a
real, architecturally valid alternative, not a strawman — it reuses tested code and an established
idiom (gate on mode + credential presence, silent-fail-to-empty, cancel-on-unmount). Rejected as
*primary* for one concrete reason specific to right now: `AssistantDock.tsx` and
`execution-settings.ts` are exactly the two files the still-unapplied
`local-cli-model-dropdown-fix-patch-2026-08-05.md` (a separate, already-designed, ready-to-apply
fix for a *different* Local CLI bug — the picker's selection not reaching the run) is staged
against, with an mtime-pinned pre-apply safety check. Landing a second, unrelated new hook into the
same hot component ahead of that patch increases merge/collision risk in a file this session
observed to have been under concurrent, actively-changing ownership. §3.1's design confines all new
logic to `src/server/modules/assistant.ts` (not touched by that pending patch) and a direct import
of `execution-credential-store.ts`'s existing export — smaller footprint, same "smallest diff
against a moving target" principle that patch doc itself argues for. **Note for the record:** a
live re-check just before writing this (`git status --short` on the specific files) shows
`AssistantDock.tsx`/`execution-settings.ts` are currently clean against `HEAD` — the other
session's dirty state referenced in the dispatch brief and the patch doc has since resolved (likely
committed). That improves Option B's case somewhat, but the pending-patch collision risk is about
the *next* change to land in that file, not the file's state at this instant — Option A's smaller,
better-isolated footprint stands regardless.

**(C) Accept `claude` stays fallback-only, matching Open Design's own posture for this exact
path.** This was the live option before the user's override; recorded here only because it's the
`(a)` branch both closed reports left open. Superseded by the user's explicit decision to build the
live call — not re-litigated.

## 5. Risks

- **Anthropic API latency/availability now affects `/api/agents` load time** for admins with a
  stored key, gated by the §3.1 TTL cache. Mitigation: cache; also the failure mode is silent
  fallback, never a blocked or errored dropdown.
- **Cache staleness after a key rotation/deletion.** An admin who deletes their stored key sees
  `'live'` models for up to the TTL window after deletion. Low severity (worst case: a stale-but-
  recently-valid model list for a few minutes) and bounded by the TTL choice.
- **`baseUrl` trust.** `stored.baseUrl` is admin-supplied (via the existing `PUT execution-credential`
  route, unrelated to this design) and flows into `listProviderModels`'s own SSRF-guarded URL
  builder (`validateBaseUrlResolved`, already exercised by `test-connection.ts`/`list-models.ts`
  today) — no new trust boundary, reusing an already-hardened path.
- **Silent-failure debuggability.** Because every failure mode degrades to the pre-existing fallback
  with no user-visible error, an admin with a broken/expired stored key gets no signal that live
  discovery isn't working — they just keep seeing the (now-correct, freshened) static list. This is
  the deliberate tradeoff constraint 1 required (never a gate, never a hard failure); flagging it
  as a known, accepted UX gap rather than a defect, since diagnosing it is exactly what "Test
  connection" (an existing, unrelated control) already does for the BYOK mode's own credential.
- **Principal mismatch (§3.5).** Resolved by union, not left open — see that section for the full
  reasoning. Residual risk after the union decision: a live-discovered pinned id could still be
  unrunnable under the CLI's OAuth account and fail at spawn time. Bounded and not new in kind —
  today's static pinned entries already carry this exact risk with no discovery step involved at
  all.
- **SSRF/hostile-provider surface, inherited not introduced.** `stored.baseUrl` flowing into
  `listProviderModels` means the Local CLI enrichment call is now a second consumer of the same
  loopback-allowed-by-design behavior `byok-ssrf-guard.spec.ts` documents (RFC1918/link-local/
  metadata/CGNAT/0.0.0.0/DNS-rebinding blocked; loopback intentionally open for local LLM
  servers). Not a new risk — verified via the e2e battery (§0.1) that this exact function already
  holds against malformed/truncated/oversized/adversarial responses with "no bypass."

## 6. Item needing user sign-off

None on SEC-001 (§3.4 resolves that by construction). None on the union-vs-replace question either
(§3.5) — that has a defensible, made call: union, aliases always kept. One smaller item, genuinely
a product rather than architecture call: **should `modelsSource: 'live'` be surfaced in the picker
UI** (e.g., a small badge distinguishing which entries came from the live call), or is silently
enriching the array sufficient? The wire field already exists and this design populates it either
way; whether the UI reads it is out of scope for this pass unless the user wants it folded in.

## 7. Implementation task list

1. `src/assistant/execution-credential-store.ts` — no changes needed; `resolveExecutionCredential`
   already has the right shape and never-throws contract.
2. **New:** a small in-memory TTL cache module (e.g. `src/assistant/live-model-cache.ts`), keyed on
   `(workspaceId, principalId)`, wrapping one `listProviderModels` call. No new dependency.
3. **`src/server/modules/assistant.ts`:** replace `proxyPassthrough` for `GET /api/agents` (and
   `POST /api/agents/rescan`) with a new handler implementing §3.1 steps 1-4 and the §3.5 union
   (dedupe-by-`id`, fallback entries always retained — a small pure helper is the cleanest unit to
   test this in isolation, e.g. `unionModels(fallback, live): AgentModelSummary[]`). Needs
   `routeDeps.adminExecutionCredentialRepo` and a sealer — both already present on `RouteDeps`.
   **No `npm install` required** — `listProviderModels` is already exported from
   `@jini-ai/agent-runtime`, already a Tovu dependency, and does not use `@anthropic-ai/sdk` (it is
   `fetch`-based — confirmed at `packages/agent-runtime/src/providers/model-catalog.ts:300`, and
   `@anthropic-ai/sdk` is not a dependency of Tovu root, Tovu `apps/admin`, or Jini, checked
   directly in every relevant `package.json`).
4. Tests: a unit test for the new handler covering the four branches — no credential (untouched
   fallback), wrong protocol (untouched), live call `ok:false` (untouched), live call `ok:true`
   (unioned `models`, aliases still present, `modelsSource: 'live'`) — plus the `unionModels` dedupe
   helper's own table-driven test (overlapping ids, alias entries never dropped) and a
   cache-hit/TTL-expiry test. Mirror the existing `execution-credential-repo.sqlite.test.ts` /
   `admin-assistant-execution-credential-routes.test.ts` fixture style already in this codebase
   from 558d6a3.
5. `execution-deps.ts` / `list-models.ts` (§3.2) — optional, do only if a future caller needs the
   admin-credential-resolution capability over the existing HTTP route; not required for §3.1 to
   work, since the new handler imports `resolveExecutionCredential` directly. If done, name the new
   flag `useStoredAdminCredential` (§3.2).
6. No Jini changes. No `@anthropic-ai/sdk`. No `npm install` / `pnpm install` at any step.

## 8. Verification note

`AGENT_DEFS`/`resolveAgentLaunch`/`AgentSummary`/`listProviderModels` signatures above were all
read directly from source at the paths cited, not recalled — per this session's instruction to
verify load-bearing claims in comments/prior reports rather than trust them. Added mid-design:
read the `development/e2e/byok-*.spec.ts` cluster (read-only, per explicit instruction not to
touch anything under `development/e2e/`) — see §0.1 for what it did and did not change. The one
claim I did not independently re-verify against a live network call: whether `listProviderModels`'s
`extractAnthropicModels`-equivalent path in `model-catalog.ts` correctly parses a real
`api.anthropic.com/v1/models` response shape today — that function already has its own test
coverage (`providers/__tests__/model-catalog.test.ts`) from when 558d6a3 landed it, and re-deriving
that here would be redundant with tests that already exist.
