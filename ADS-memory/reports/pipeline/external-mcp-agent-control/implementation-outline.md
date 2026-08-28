# Implementation Outline: external-mcp-agent-control

- Spec: **NONE** — no spec package exists for this work. Brownfield, Agent Direct Mode. See "Gate Record" below.
- ADR: **NONE** — deliberately not written. Owner rule: build a slice before writing an ADR.
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity (7 of 8)
- Date: 2026-08-26
- Author: Software Architect

> Structure only — module boundaries, exported contracts, wiring, data boundaries, invariants. No pseudo-code, no private helper inventories, no task sequencing beyond the phase map.

---

## Gate Record (read first)

**No spec package.** No `feature.spec.md`, no Planning Preflight, no Red-Team pass, no `system-blueprint.md`, no `research.md`. Per AGENTS.md Agent Direct Mode: proceeding with available context, gap noted, not blocking.

**The cited prior art does not exist.** The dispatch named `ADS-memory/reports/swarm-consensus/runs/2026-08-26T005706Z-consensus-report.md` as a settled 5-model debate. **That file is not on disk** — `ADS-memory/reports/swarm-consensus/runs/` contains no 2026-08-26 entry (newest is `2026-08-23-tovu-capability-manifest-fork/`). Every design claim attributed to it in the dispatch is therefore **UNVERIFIED as a consensus decision**. Substituted prior art, both read in full:

- `ADS-memory/reports/continuity/2026-08-26-mini-handoff-external-mcp-agent-control.md` — state, owner's own words, settled decisions, traps.
- `ADS-memory/docs/architecture/reference/external-mcp-server-federation.md` — the federated trust tier R1–R8, the core/preset split, the frozen-at-connect rule.

Where the dispatch's claims about the consensus report (device grant first-class, `needs_reauth`, single-flight refresh, fail-loud-no-retry) coincide with what is **already implemented and documented in code**, this outline cites the code, not the missing report. Every one of those four is in fact already built — see the Brownfield table.

**Every dispatch claim was re-verified against source.** Four were materially incomplete or wrong; each correction is marked **[CORRECTION]** below and is load-bearing for the design.

---

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Spans `apps/admin` (React), `src/features/external-mcp/` (new tool domain), `src/assistant/` (store + OAuth service + allowlist), `src/server/` (3 composition roots). | File Map |
| Contract Change | yes | 3 new `api.ts` client methods; 5 new agent tools; `ExternalMcpOAuthView` gains `endpoints`; `MCP_UI_REDEEMABLE_TOOL_IDS` gains one id. | C-001…C-012 |
| System Wiring | yes | New contributor registered into `installFirstPartyToolContributors()`; deps threaded through 3 composition roots with a **different capability flag per process**. | W-001…W-006 |
| Data And Persistence | yes | `oauthEndpointsJson` / `sealedOAuth` / `oauthStatus` are being silently destroyed today. Fix changes the write path's tri-state semantics. | INV-001, INV-002 |
| Brownfield Dependency | yes | Backend OAuth subsystem complete and hardened; three untracked WIP files exist; a live data-loss defect ships the moment the button lands. | Brownfield table |
| Reverse-Spec Or Migration | no | No source-to-target behavior mapping. Additive to a live subsystem. | — |
| Critical Cross-Boundary Invariant | yes | Token/secret preservation across a save (INV-001); allowlist closed-set property (INV-003); provider-agnostic rule (INV-004). | Critical Invariants |
| Parallelization Ambiguity | yes | Phase 1 (bug fix) must land before Phase 3 (button) or the button ships a data-loss path. Phases 2 and 4 are genuinely independent. | Phase Map |

---

## Verified Findings — corrections to the dispatch

Read this section before writing any code. Four of these change the design.

### [CORRECTION 1] The data-loss bug is far wider than "custom endpoints", and has a second cause the obvious fix misses

The dispatch's causal chain is correct as far as it goes. Verified end to end:

1. `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts:93-95` — `toItem` hardcodes all three endpoint fields to `""`.
2. `:117-124` — `toOAuthWriteBody` **always** sends `providerId` and all three endpoints, blank or not.
3. `src/assistant/external-mcp-store.ts:1010` — `touchedIdentity = oauth.providerId !== undefined || oauth.tokenEndpoint !== undefined`. Both are always present, so this is **always true**.
4. `:1011` → `buildOAuthEndpoints(oauth)`; `:870-882` drops empty values → `{}`.
5. `:1046` → `oauthEndpointsJson: null`.
6. `:895-903` — `oauthBindingFingerprint` **includes** `oauthEndpointsJson`.
7. `:1233` — fingerprint differs → `oauthStatus: "disconnected"`, `keepToken: false`.
8. `:1368` → `resolveSealedOAuthBlob(deps, undefined, null)`; `:1334` returns `null` when both are empty → **`sealedOAuth: null`**.

Net: the access token, the refresh token **and** the DCR-minted client secret are all destroyed.

**What the dispatch missed — two things:**

**(a) The blast radius is every connection that ever authorized, not just hand-typed ones.** `src/assistant/external-mcp-oauth.ts:511` (`persistSelfConfiguration`) writes `oauthEndpointsJson: JSON.stringify(identity.endpoints)` on **every** connect that runs discovery or dynamic client registration. `selfConfigureConnection` (`:538-561`) runs DCR for any row with no `oauthClientId`. A row that started with a bare provider id and null endpoints therefore has **non-null** endpoints the moment it connects. The Higgsfield case has no registered provider and no client id (`ADS-memory/reports/continuity/2026-08-26-mini-handoff-external-mcp-agent-control.md` §6), so it is guaranteed to take the DCR path and guaranteed to be hit.

**(b) `clientAuth` is a fourth endpoint key the admin form cannot express at all.** `external-mcp-oauth.ts:272-287` declares `StoredOAuthEndpoints` with `authorizationEndpoint`, `tokenEndpoint`, `deviceAuthorizationEndpoint` **and `clientAuth`**. `:560` writes `clientAuth` from DCR. `buildOAuthEndpoints` (`external-mcp-store.ts:870-882`) only ever builds the first three. **So "just round-trip the three endpoints" does not fix this** — `clientAuth` would still be dropped, the fingerprint would still differ, and the token would still be destroyed. Its own doc (`:276-285`) says a refresh six weeks later has nothing else to read it from.

This is why the fix below is three changes, not one.

### [CORRECTION 2] The daemon is architecturally forbidden from starting a handshake — and the codebase already says so, and already ships the answer

`src/server/agent-daemon/agent-daemon-server.ts:775-797` constructs the daemon's own OAuth service. Its doc is explicit:

> "Not `routeDeps.externalMcpOAuth` — that one lives in the web server, and this is a different process. The two share the only thing they must: the database row… **Its pending-authorization and device-authorization stores are constructed and never used: this process serves no connect route and no callback route, so no handshake can start here. Only the refresh half of the service is reachable from the daemon.**"

`src/oauth/pending-authorizations.ts:26-33` states the same constraint from the other side, and names durability as actively harmful, not merely unimplemented.

**And the answer already exists in code.** `src/assistant/external-mcp-oauth.ts:112-128` defines `externalMcpSettingsDeepLink(serverId)`, whose doc reads:

> "A plain link into Settings is the whole of what an in-chat 'connect' affordance should be. A full OAuth redirect through the MCP-UI sandboxed iframe is rejected… **The device grant is the exception that proves the rule — it has no return leg at all, so its user code and verification URL are safe to render anywhere.**"

Decision (a) is therefore not an open architectural question. It is written down, exported, and currently uncalled. The design below uses it.

### [CORRECTION 3] `DOMAIN_SLICES` is the LEGACY seam — do not add an entry to it

The dispatch says to note that `DOMAIN_SLICES` has no external-mcp entry, implying one should be added. `src/assistant/tool-registrations.ts:246-256` calls `DOMAIN_SLICES` "the LEGACY seam (domains not yet converted to the registry)". Twenty-eight domains have already migrated off it to `registerToolContributor` + `contribute<Domain>Tools()`, installed by `src/server/tool-catalog-manifest.ts:157-187`. Only four demo/UI domains remain (`:490-501`).

**A new domain must use the contributor registry.** Adding to `DOMAIN_SLICES` would create an `assistant → features/external-mcp` static edge that `check:architecture` is actively being cleaned of. Precedent to copy verbatim: `src/features/site-inspection/tool-registrations.ts:178-184`.

### [CORRECTION 4] `external_mcp_save` does **not** yet hold up the allowlist rule

The dispatch says `save-form.ts:215-226` "already uses the park-and-answer protocol, so `external_mcp_save` plausibly qualifies". Verified: `:215-226` builds `baseParams` carrying `SURFACE_EXCHANGE_ID_PARAM` and a cancel action carrying `SURFACE_DISMISSED_PARAM`. That is the **form half**.

The admission rule at `src/assistant/mcp-ui-tool-calls.ts:23-31` is a rule about the **handler**: "it opens a `SurfaceExchangeStore` exchange and parks on the answer". `src/features/external-mcp/tool-registrations.ts` **does not exist**, so no handler parks on anything. As of today `external_mcp_save` does **not** qualify. It qualifies only once the handler lands. See Decision (b).

### Also found — one false code comment

`src/server/routes/oauth/callback-page.ts:22-23` states "the external-MCP tab listens for `EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE`". It does not — `grep -rn "oauth/connect\|oauth/device/poll" apps/admin/src packages/` returns zero hits, and no admin file references that constant. The comment describes intent, not fact. Phase 3 makes it true; until then it belongs in `ADS-memory/reports/2026-08-20-false-code-comments-register.md`.

---

## Decisions

### (a) Cross-process OAuth store — **grant-aware split, declared as a composition-root capability**

**Chosen.** `external_mcp_oauth_connect`'s handler branches on the row's grant and on one declared dep flag:

| Grant | Process serves the public callback? | Behavior |
|---|---|---|
| `device_code` | irrelevant | Full flow in-process. Begin + poll are both owned here; there is no callback leg. Returns `{ kind: "device_code", userCode, verificationUri, … }`. |
| `authorization_code` | **yes** (web server: `app.ts`, `deps.ts`) | Calls `beginConnect`, returns `{ kind: "redirect_required", authorizationUrl, expiresAt }` **as text for the human to open in their own browser**. No iframe, no popup driven by the model. |
| `authorization_code` | **no** (agent daemon) | Does **not** call `beginConnect`. Returns `{ kind: "operator_action_required", settingsLink: externalMcpSettingsDeepLink(id), reason }`. The human clicks Authorize in Settings, where the popup bridge runs in the process that owns the callback. |

The process capability is **declared, never sniffed**: a new optional `externalMcpOAuthRedirectCapable?: boolean` on `ExternalMcpToolDeps`, set `true` only by the two web-server composition roots and omitted by `agent-daemon-server.ts`. No `process.env` check, no global detection — the composition root already knows the answer, so it states it.

Note this converges with the product path: per the admin-chat architecture, real operator chat runs through the daemon, so the realistic path is the deep link — exactly what `externalMcpSettingsDeepLink` was written for and has never been called from.

**Rejected alternatives:**

| Alternative | Why rejected |
|---|---|
| **Shared/persisted pending+device store** (new table, cross-process) | `pending-authorizations.ts:26-33` argues durability is *harmful*: "durability would only preserve a redeemable secret past the point where anyone is waiting on it." It also does not solve the real problem — the daemon still cannot put a browser in front of a human. Cost: a migration for state worthless after 10 minutes, plus a new redeemable-secret-at-rest surface. |
| **Delegate to the web server** (daemon HTTP-calls `POST .../oauth/connect`) | Requires a daemon→admin privileged channel that does not exist. The daemon holds `TOVU_AGENT_DAEMON_TOKEN`, not an admin session; `guard.ts` evaluates `admin.integrations.manage` against a **principal**, so the daemon would have to impersonate one. That is a new trust edge, in the direction `external-mcp-server-federation.md` §3 explicitly refuses for the inverse grant. |
| **Run the public callback route in the daemon too** | The callback must be reachable from the public internet at the operator's own origin. The daemon is not the public web tier. Doubles the anonymous, rate-limited attack surface for zero gain. |
| **Device-only from the daemon, hard error on `authorization_code`** | Nearly right, and is the dispatch's suggestion — but it reports a dead end where a real one-click path exists. Returning the deep link costs one existing function call and turns a failure into a completed handoff. |

### (b) `MCP_UI_REDEEMABLE_TOOL_IDS` — exactly one addition, and only conditionally

The rule (`mcp-ui-tool-calls.ts:23-31`): a tool belongs **only** if its handler opens a `SurfaceExchangeStore` exchange and parks on `ctx.emitSurface`, **or** does legacy TTL-bound token redemption. Two documented carve-outs exist: a tool that *does nothing* (`assistant_demo_choices`), and a pure read reaching only what the admin session already exposes (`content_post_search`).

| Tool | Verdict | Rule-by-rule justification |
|---|---|---|
| `external_mcp_save` | **ADD — but only in the same commit as its parking handler** | The form half is built (`save-form.ts:215-226`: `SURFACE_EXCHANGE_ID_PARAM` in `baseParams`, `SURFACE_DISMISSED_PARAM` on cancel). The rule is about the handler, which does not exist yet ([CORRECTION 4]). Once the handler opens `surfaces.surfaceExchanges.open(...)` and parks via `askOnce` with a fail-closed `ctx.emitSurface` guard, it holds up the rule identically to `deployment_propose_custom_provider_credential`, whose handler at `publish-agent-tools.ts:1576-1606` is the template. Consequence matches too: this writes a row whose `command` is spawned as a real child process at daemon boot — at least as consequential as saving an S3 credential. **If the handler is written any other way, do not add the id.** |
| `external_mcp_list` | **NO** | Plain read, opens no exchange. Same disposition as `deployment_get_static_publish_capabilities` and `source_control_get_capabilities`, both deliberately absent with that reasoning recorded in the module. Does **not** qualify under the `content_post_search` carve-out either: that carve-out turns on the tool reaching only what the admin session's own `content.read` already exposes. This one is gated on `admin.integrations.manage`, a strictly higher bar, and admitting it would let untrusted agent-rendered HTML enumerate the workspace's integration roster. |
| `external_mcp_test_connection` | **NO** | Read-only, opens no exchange, same permission argument as `external_mcp_list`. |
| `external_mcp_oauth_connect` | **NO — and this is the one to be careful about** | `sideEffects: "mutates-durable-state"`. It writes `oauthStatus: "pending"` and, through `selfConfigureConnection` → `mintClientForConnection` (`external-mcp-oauth.ts:459-483`), performs **dynamic client registration against a third-party authorization server** and persists a minted client id and secret. It opens no exchange. Admitting it would let any HTML an agent's tool result can render trigger an outbound DCR and start an authorization with no human in the loop — precisely the "remote execution for a tool that DOES something" the module header forbids. |
| `external_mcp_oauth_poll_device` | **NO** | `mutates-durable-state`; each call is an outbound token-endpoint request. Opens no exchange. A loop driven from untrusted HTML is a self-inflicted RFC 8628 `slow_down` / rate-limit problem at the provider, on the operator's own client credentials. |

**Net: `EXPECTED_ALLOWLIST` goes 6 → 7.** `src/assistant/__tests__/mcp-ui-tool-calls.test.ts:65-72` must be edited in the same commit — it is the tripwire, and editing it is meant to be a deliberate act. Add these four ids to the near-miss probe list at `:78-105` so the closed-set property is exercised against them: `external_mcp_list`, `external_mcp_oauth_connect`, `external_mcp_oauth_poll_device`, `external_mcp_test_connection`.

### (c) The failing-first regression test — see C-013/C-014 and INV-001

Level: the **store**, because that is where destruction happens and the root runner is fast. File: `src/assistant/__tests__/external-mcp-store.test.ts` (existing harness at `:54` `makeDeps()`, `InMemoryExternalMcpServerRepo`, `AesGcmSecretSealer`). Verified no existing test covers this: no test in that file asserts token survival across a save.

### (d) Restart semantics — **nothing about federation changes; the copy stops being ambiguous**

Boot-only federation is R5 (`external-mcp-server-federation.md` §4), load-bearing against the rug-pull, and stays. What changes is that the surfaces tell the truth about two *different* states people currently conflate:

- **Saving a row** → not live until daemon restart. `put.ts:122` already returns `restartRequired: true`. `external_mcp_save`'s result must carry it through, and its description must say so.
- **Authorizing an already-federated row** → live immediately; the daemon's token refresher (`agent-daemon-server.ts:789-797`, sharing the DB row) picks it up on the next call. No restart needed.
- **Authorizing a row saved this session** → still needs the restart, for the *save*, not the *auth*.

UI rule: the panel's existing `saveStatusLabel` restart pill (`ExternalMcpSettingsPanel.tsx:216-220`) is the single source of that message, and a successful connect must **not** clear it.

### (e) BYOK blindness — **documented constraint, not fixed here**

**VERIFIED.** `attachFederatedMcpTools` is called at exactly one site: `agent-daemon-server.ts:827`. `assistant-byok.ts:280` composes tools via `createByokToolSurface(routeDeps)` and never federates. A BYOK-mode chat can never see a federated tool.

Out of scope: fixing it means running MCP client sessions (child processes, or long-lived HTTP sessions) inside the request tier, with their own lifecycle, shutdown and fail-open story. That is a separate architectural change.

**But it creates a real trap this work must not walk into.** Because the five tools register through the contributor registry, they land in **both** surfaces. In BYOK mode the agent can fully configure a server it will never be able to use. Mitigation, in scope: `external_mcp_save` and `external_mcp_oauth_connect` descriptions state that a configured server's tools become available to the assistant **after the agent daemon restarts**. No behavior gate — a false "you can't do that" would be worse than an honest note. Flagged for the owner below.

---

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `src/features/external-mcp/` | agent-tool domain | The five tools: catalog, deps slice, MCP-UI form, handlers | C-006…C-010 | `#src/assistant/index`, `@jini-ai/cms/core`, `src/core/tool-surface-exchanges` | Must not import `src/server/**` — `deps.ts:11-14` |
| `src/assistant/` (store) | `external_mcp_servers` row | Validation + tri-state write semantics + OAuth binding fingerprint | C-011, C-012 | `src/db`, `src/webhooks` sealer/keyring | Where the data-loss fix lands |
| `src/assistant/` (allowlist) | MCP-UI redemption gate | Closed-set admission | C-005 | none | SECURITY-CRITICAL tripwire |
| `apps/admin/src/lib/api.ts` | admin HTTP client | Typed transport for the three OAuth routes | C-001…C-003 | none | |
| `apps/admin/src/features/settings/` | External MCP tab | Authorize control, popup bridge, status rendering | C-004 | `@jini-ai/ui`, `api.ts` | `SourceConfigItemCard` is Jini's — do not edit it |
| `src/server/*` (3 roots) | composition | Threads deps + declares the redirect capability | W-004…W-006 | — | `app.ts`, `deps.ts`, `agent-daemon-server.ts` |

---

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Why This Separation Exists |
|---|---|---|---|---|
| `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` | admin | **changes** | C-011 (client half of the fix) | Owns the write body; the tri-state violation is here |
| `src/assistant/external-mcp-store.ts` | store | **changes** | C-012 | Owns `resolveOAuthEndpoints` + the fingerprint |
| `src/assistant/__tests__/external-mcp-store.test.ts` | store | **changes** | C-013, C-014 | Failing-first regression home |
| `apps/admin/src/lib/api.ts` | admin | **changes** | C-001, C-002, C-003 | Single typed client surface |
| `apps/admin/src/features/settings/external-mcp-oauth-port.ts` | admin | **creates** | C-004 | New file, mirroring `connectors-port.ts`: popup + `postMessage` bridge + focus fallback. Keeps browser-only concerns out of the hook |
| `apps/admin/src/features/settings/hooks/use-external-mcp-oauth.hooks.ts` | admin | **creates** | C-004 | Connect/poll/disconnect state machine + per-row status |
| `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx` | admin | **changes** | — | Renders the Authorize control *beside* each card |
| `apps/admin/src/features/settings/rules.ts` | admin | **changes** | C-015 | Pure `resolveExternalMcpConnectAffordance(...)` — testable without React |
| `src/features/external-mcp/tool-registrations.ts` | tool domain | **creates** | C-006…C-010 | The five handlers + `contributeExternalMcpTools()` |
| `src/features/external-mcp/deps.ts` | tool domain | **changes** | — | Adds `externalMcpOAuthRedirectCapable?: boolean` |
| `src/features/external-mcp/agent-tools.ts` | tool domain | **changes** | — | Description edits only (restart note, `operator_action_required`) |
| `src/features/external-mcp/save-form.ts` | tool domain | unchanged | — | Verified complete as written |
| `src/server/tool-catalog-manifest.ts` | composition | **changes** | W-003 | One `contributeExternalMcpTools()` line |
| `src/server/app.ts`, `src/server/deps.ts` | composition | **changes** | W-004 | Declare `externalMcpOAuthRedirectCapable: true` |
| `src/server/agent-daemon/agent-daemon-server.ts` | composition | **changes** | W-005 | Pass daemon's own `externalMcpOAuth`; **omit** the capability flag |
| `src/assistant/mcp-ui-tool-calls.ts` | allowlist | **changes** | C-005 | +1 id, with a dated comment matching the file's convention |
| `src/assistant/__tests__/mcp-ui-tool-calls.test.ts` | allowlist | **changes** | — | `EXPECTED_ALLOWLIST` + 4 new near-miss probes |

---

## Contract Map

| ID | Name / File | Kind | Job | Inputs | Outputs | Errors | Effect | Trace | Test Seam |
|---|---|---|---|---|---|---|---|---|---|
| C-001 | `api.startExternalMcpOAuth` — `apps/admin/src/lib/api.ts` | exported client method | Begin one authorization | `serverId: string` | `{ auth: AdminExternalMcpConnectStart }` discriminated on `kind` | rethrows `ApiError`; 409 `EXTERNAL_MCP_REAUTH_REQUIRED`, 429 `RATE_LIMIT_EXCEEDED` w/ `retryAfterSeconds` | one POST | `oauth.ts:111` | fetch double |
| C-002 | `api.pollExternalMcpOAuthDevice` — same | exported client method | One device poll, never a loop | `serverId: string` | `{status:"pending",retryAfterSeconds}` \| `{status:"connected"}` | rethrows; terminal errors are terminal, **never retried** | one POST | `oauth.ts:140` | fetch double |
| C-003 | `api.disconnectExternalMcpOAuth` — same | exported client method | Drop the stored authorization, keep the row | `serverId: string` | `{disconnected:true, restartRequired:true}` | rethrows | one DELETE | `oauth.ts:162` | fetch double |
| C-004 | `useExternalMcpOAuth()` — `hooks/use-external-mcp-oauth.hooks.ts` | exported hook | Own the connect state machine and per-row status | `{ onConnected(serverId) }` | `{ statusById, connect(id), pollingById, cancel(id), disconnect(id), error }` | never throws; surfaces `error` as state | popup open, `postMessage` listen, focus re-check, timer | Decision (a) | hook test w/ fake port |
| C-005 | `MCP_UI_REDEEMABLE_TOOL_IDS` — `src/assistant/mcp-ui-tool-calls.ts:36` | exported `ReadonlySet<string>` | Closed admission set | — | 7 ids | — | none | Decision (b) | tripwire test |
| C-006 | `external_mcp_list` handler | tool handler | Read the roster, never a secret | `{}` | `{ servers: ExternalMcpServerView[] }` | `requireToolPermission` throws | one read | `agent-tools.ts:160` | registry+executor |
| C-007 | `external_mcp_save` handler | tool handler | Propose a write, **park** for the human, then write | `SAVE_INPUT_SCHEMA` + `SURFACE_EXCHANGE_ID_PARAM` | `{saved:true,server,restartRequired:true}` \| `{saved:false,cancelled:true}` \| `{saved:false,reason:'expired'\|'abandoned'\|'invalid',…}` | throws if `ctx.emitSurface` absent (**fail closed**); no-answer is a *result*, not an exception | opens exchange, then one write | `agent-tools.ts:171`; template `publish-agent-tools.ts:1576-1606` | exchange double |
| C-008 | `external_mcp_test_connection` handler | tool handler | Readiness check only — never a network probe | `{id}` | `{ok:true}` \| `{ok:false,reason}` | throws on unknown id | one read + unseal | `agent-tools.ts:183` | store double |
| C-009 | `external_mcp_oauth_connect` handler | tool handler | Start an authorization, or hand over the deep link | `{id}` | `{kind:"device_code",…}` \| `{kind:"redirect_required",…}` \| `{kind:"operator_action_required",settingsLink,reason}` | throws if `externalMcpOAuth` absent (**fail closed**); `OAuthError` propagates, never retried | outbound discovery/DCR + status write, **only on the two real branches** | Decision (a) | oauth-service double |
| C-010 | `external_mcp_oauth_poll_device` handler | tool handler | Exactly one poll | `{id}` | `{status:"pending",retryAfterSeconds}` \| `{status:"connected"}` | throws on declined/expired/provider failure — terminal | one outbound token request | `agent-tools.ts:207` | oauth-service double |
| C-011 | `toOAuthWriteBody` — `use-external-mcp.hooks.ts:113` | module function (changed) | Build the OAuth write block **honouring tri-state** | `Record<string,string>` | `AdminExternalMcpOAuthInput \| undefined` | none | pure | INV-001 | direct unit test |
| C-012 | `resolveOAuthEndpoints` — `external-mcp-store.ts:1006` | module function (changed) | Resolve endpoints, **always carrying `clientAuth` forward** | `(oauth, existing)` | `Record<string,string>` | none | pure | INV-002 | via `saveExternalMcpServer` |
| C-013 | regression test: token survives a toggle | node:test | Pin INV-001 | — | — | — | — | Decision (c) | **must fail first** |
| C-014 | regression test: `clientAuth` survives a save | node:test | Pin INV-002 | — | — | — | — | [CORRECTION 1b] | **must fail first** |
| C-015 | `resolveExternalMcpConnectAffordance` — `rules.ts` | exported pure fn | Decide which control a row shows | `{authMode, oauthGrant, oauthStatus, hasStoredToken}` | `"none"\|"authorize"\|"reauthorize"\|"connected"\|"pending"` | none | pure | Decision (d) | table-driven unit test |

### Contract detail — C-011 (the primary fix)

**Job.** Send only what the operator actually supplied.

`apps/admin/src/lib/api.ts:119-123` already declares the intended contract: *"an absent key keeps whatever is stored, a string replaces it."* The current implementation violates its own declared contract for four fields. Change: `providerId`, `authorizationEndpoint`, `tokenEndpoint`, `deviceAuthorizationEndpoint` become **omit-when-blank**, the identical convention `clientSecret` already uses on `:125` and `env` uses on `:152`.

Then `touchedIdentity` (`external-mcp-store.ts:1010`) is correctly `false` for an untouched row, `:1011` preserves `existing.oauthEndpointsJson` **verbatim including `clientAuth`**, the fingerprint matches, `keepToken` stays `true`, and the sealed blob survives.

Delete the now-false claim in the doc comment at `:107-111` that blank strings are treated as keep-what's-stored — that is true for `firstTrimmed` identity fields but **not** for the endpoints, and believing it is what produced this bug.

### Contract detail — C-012 (defense in depth)

**Job.** Never let a save author or destroy `clientAuth`.

`clientAuth` is server-owned runtime state written only by DCR (`external-mcp-oauth.ts:560`, doc at `:276-285`). No operator can type it and no form can express it. `resolveOAuthEndpoints` must carry it forward from `existing` unconditionally, on both branches.

This deliberately **preserves** the documented re-derivation semantics at `:999-1000` for the three operator-typed endpoints — clearing a provider id and typing endpoints still cannot leave half the old pairing behind. Only the one key no human authors is exempted.

**Both C-011 and C-012 are required.** C-011 alone fixes today's client. C-012 alone is insufficient (the three real endpoints would still be nulled). C-012 is what stops any future client re-opening the hole.

### Contract detail — C-004 (the Authorize control)

Three browser facts drive the shape, all from the `connectors-port.ts` precedent:

1. **Two gestures, not one.** `connectors-port.ts:20-27`: opening a popup *after* an awaited request spends the user activation and the popup is blocked. So: click Authorize → `POST oauth/connect` → render "Continue in browser" → **that** click calls `window.open` synchronously.
2. **No `noopener`.** `connectors-port.ts:141-147`: the callback page reports completion by `postMessage`-ing `window.opener`; `noopener` nulls it and the flow appears to hang.
3. **The focus fallback is mandatory.** `callback-page.ts:25-30`: `window.opener` is absent in a system browser and the `try/catch` swallows the cross-origin case. The bridge must **also** re-check status on focus/`visibilitychange`. An abandoned popup must resolve as "still not connected", never as an error.

Listen for `EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE` (`"tovu:external-mcp-connected"`), and **check `event.origin` independently** — the page targets `window.location.origin`, and the receiver re-checks (`callback-page.ts:15-16`).

Device-code path: no popup. Render `userCode` + `verificationUri` inline; poll on a timer at `retryAfterSeconds`, never faster; give the operator a visible Cancel (`oauth.ts:129-133` puts the loop on the client deliberately).

---

## Wiring Map

| Flow | Source | Transport | Target | Contract | Ordering / Retry / Idempotency | Failure Handling |
|---|---|---|---|---|---|---|
| W-001 | admin panel | HTTPS POST | `oauth.ts:111` | C-001 | Not idempotent — a second connect mints a new `state`/device code and overwrites the prior attempt. Never auto-retried. | 429 → honour `Retry-After`; 409 → surface reauth copy |
| W-002 | admin panel | HTTPS POST on a timer | `oauth.ts:140` | C-002 | One poll per request. Interval from `retryAfterSeconds`, never faster. **Only `pending` is retryable** (`external-mcp-oauth.ts:772-775`). | Terminal → stop, clear device state, tell the human |
| W-003 | provider browser redirect | GET (public, anonymous) | `oauth-callback.ts:60` | — | Single-use `state`; replay fails | Failure logged server-side, browser sees one of two fixed strings |
| W-004 | callback page | `postMessage` → `window.opener` | admin bridge (C-004) | `EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE` | At-most-once, unreliable **by design** | Focus re-check is the recovery path, not an optimization |
| W-005 | `tool-catalog-manifest.ts` | direct call | `contributeExternalMcpTools()` | C-006…C-010 | Idempotent; must run before `buildToolCatalogQuery` snapshots the registry (`agent-daemon-server.ts:753-757`) | A tool registered after the snapshot is executable but invisible to `search_tools` |
| W-006 | composition roots | dep object | `ExternalMcpToolDeps` | — | `externalMcpOAuthRedirectCapable: true` in `app.ts`/`deps.ts`; **omitted** in `agent-daemon-server.ts` | Absent ⇒ `false` ⇒ deep-link branch. Fail-safe default |

---

## Data And Side-Effect Boundaries

| Boundary | Owner | Writes | Consistency rule | Notes |
|---|---|---|---|---|
| `external_mcp_servers.sealedOAuth` | store + OAuth service | `saveExternalMcpServer`, `persistTokens`, `persistSelfConfiguration`, `setOAuthStatus` | **Read-modify-write, always.** `external-mcp-store.ts:1288-1292`: a writer that seals `{tokens}` alone silently deletes the client secret. | The blob this work is currently destroying |
| `external_mcp_servers.oauthEndpointsJson` | store (operator's three) **+ OAuth service (`clientAuth`)** | `:1387`, `external-mcp-oauth.ts:511` | Two writers, **different key sets**. C-012 is what keeps them from clobbering each other. | The root of [CORRECTION 1] |
| `external_mcp_servers.oauthStatus` | both processes | `setOAuthStatus`, `carryOAuthRuntimeState` | Plaintext on the row **on purpose** — the only thing daemon and web server can both see (`external-mcp-oauth.ts:158-165`) | Do not cache it |
| `oauthRefreshLeaseUntil` | both processes | `tryClaimOAuthRefreshLease` | Cross-process single-flight; stops one rotating refresh token being redeemed twice | Already correct — do not touch |
| `pending` / `devices` in-memory stores | whichever process holds them | in-process only | **Never persist.** `pending-authorizations.ts:26-33` | Decision (a) exists because of this |

---

## Observability And Operational Expectations

| Surface | Signals | Metrics | Logs | Privacy |
|---|---|---|---|---|
| `POST .../oauth/connect` | outcome by `code` | attempts, failures by code, 429s | Already: `oauth.ts:77`. Add nothing that echoes a provider body | **Never** log `state`, `code`, `device_code`, tokens, client secret |
| `POST .../oauth/device/poll` | pending-vs-terminal | poll count per authorization | terminal reason only | as above |
| Public callback | success/failure | anonymous hit rate (429 signal) | `oauth-callback.ts:84` — reason to log, **fixed string to browser** | Nothing request-derived reaches the response (`callback-page.ts:7-13`) |
| `external_mcp_save` handler | confirmed / cancelled / expired / abandoned | outcome counter | tool id + outcome | **Never** log any field value — the form carries secrets |
| DCR (`mintClientForConnection`) | registered / no-registration-endpoint | counter | registration endpoint host only | **Never** log the minted `client_secret` |

---

## Critical Invariants

| ID | Scope | Rule | Reason | Enforcement | Test |
|---|---|---|---|---|---|
| **INV-001** | store write path × admin client | A save that changes **only** `enabled` or `label` **must** preserve `oauthStatus`, the access/refresh tokens, and the client secret. | Today it destroys all three. Silent credential loss — the operator sees "saved", then a dead connection at the next daemon boot. | C-011 primary, C-012 backstop | C-013, **fails first** |
| **INV-002** | `oauthEndpointsJson` | No save may drop or author `clientAuth`. | Written only by DCR; a refresh weeks later has nothing else to read it from (`external-mcp-oauth.ts:276-285`). A client authenticating as `none` at a server that issued it a secret gets `invalid_client` on every token request. | C-012 | C-014, **fails first** |
| **INV-003** | MCP-UI redemption | `isMcpUiToolCallAllowed` admits an id **iff** it is in the literal set. No prefix, substring, case-insensitive or separator-normalizing match. | Otherwise the endpoint becomes general remote execution reachable by any agent-rendered HTML. | `mcp-ui-tool-calls.ts:113` | existing 25-probe suite + 4 new probes |
| **INV-004** | `src/oauth/**` | Nothing outside `providers.ts` names a provider **in code**. Connecting a new server needs **zero** code change. | `providers.ts:5-26`; operator-defined providers are the normal case (`:14-20`). | code review + grep | grep gate: non-test `higgsfield` hits stay at **5**, all prose comments — see note below |
| **INV-005** | federation | Admitted tool set frozen at connect; roster read at boot only. | R5 — closes the rug-pull (`external-mcp-server-federation.md` §4). | unchanged | do not modify |
| **INV-006** `[internal-invariant]` | `resolveSealedOAuthBlob` | Read-modify-write only. Never seal a partial payload. | Sealing `{tokens}` alone deletes the client secret (`external-mcp-store.ts:1288-1292`). | function-local | covered by C-013 |

**INV-004 baseline, measured not assumed.** `grep -rni "higgsfield" src/ apps/admin/src --include="*.ts" --include="*.tsx"` excluding tests returns **5**, not the 4 the dispatch cited — the extra is `apps/admin/src/features/settings/rules.ts:255`, outside the `src/`-only scope the dispatch presumably used. All 5 are prose comments; none is code. The rule holds. Separately, `src/oauth/device-code.ts:154` names Google in a comment explaining a pre-RFC `verification_url` spelling — prose about a wire format, not a registered provider, so it does not breach the rule either. **Baseline to hold: 5 prose hits, 0 code hits.** Any new hit must be prose or the rule is broken.

---

## Brownfield / Migration Mapping

| Source behavior / contract | Target | Preserve / Change | Evidence |
|---|---|---|---|
| `src/oauth/` PKCE, device grant, discovery, DCR, refresh, `needs_reauth` | unchanged | **Preserve** — complete and hardened | `src/oauth/*` + 7 test files |
| Three OAuth admin routes + public callback | unchanged | **Preserve** — rate-limited, XSS-safe, state-bound | `oauth.ts`, `oauth-callback.ts` |
| `externalMcpSettingsDeepLink` | **first caller** | Preserve, start calling | `external-mcp-oauth.ts:127` — exported, zero callers |
| `agent-tools.ts` (catalog, 5 tools) | keep, 2 description edits | **Preserve** — complete and well-reasoned | verified in full |
| `save-form.ts` | keep as-is | **Preserve** — verified complete | verified in full |
| `deps.ts` | +1 optional field | Change | `:51-60` |
| `tool-registrations.ts` | **create** | New | does not exist |
| Admin panel `agentHandle` tagging | unchanged | **Preserve** — §4's open decision was resolved as Option A and shipped | `ExternalMcpSettingsPanel.tsx:176,197` |
| `TOVU_ENABLE_DEMO_TOOLS` gate | already removed | **No work** — done 2026-08-26 | `mcp-ui-tool-calls.ts:87-92` |

**Two `§5` items from the handoff are already done.** The demo-tool gate is gone and the allowlist entry is unconditional. Do not redo them.

---

## Test Expectations

**Runners — pick by path.** Tovu root: `node --import tsx --test --experimental-test-module-mocks "<path>"`. `apps/admin`: `cd apps/admin && npx vitest run <path>`. Always scoped; never bare `npm test`.

- **Failing-first regression (C-013, C-014)** — `src/assistant/__tests__/external-mcp-store.test.ts`. Must be **written and observed red before the fix**. Shape:
  1. Save an `authMode:"oauth"` row: own `tokenEndpoint` + `authorizationEndpoint`, `grant:"authorization_code"`, a `clientId`, a `clientSecret`.
  2. Reproduce a completed connect by upserting the record as `persistSelfConfiguration` + `persistTokens` leave it: `oauthEndpointsJson` containing all three endpoints **plus `clientAuth`**, `oauthStatus:"connected"`, `sealedOAuth` sealing `{clientSecret, tokens}`.
  3. Re-save through `saveExternalMcpServer` with **exactly the body the admin form sends today**: all three endpoints `""`, `providerId` round-tripped, `clientSecret` omitted, only `enabled` flipped.
  4. Assert `oauthStatus === "connected"`, `hasStoredToken === true`, and the opened payload still carries **both** `clientSecret` and `tokens`.
  5. C-014 asserts specifically that `clientAuth` is still present in `oauthEndpointsJson`.

  Expected red today: step 4 gets `"disconnected"` and `sealedOAuth === null`.
- **Client contract (C-011)** — `apps/admin/.../__tests__/use-external-mcp.unit.test.ts`: `toOAuthWriteBody` **omits** blank `providerId`/endpoints and **includes** non-blank ones. This is the mirror of C-013 on the client side; both are needed.
- **Allowlist (C-005, INV-003)** — `mcp-ui-tool-calls.test.ts`: `EXPECTED_ALLOWLIST` updated to 7; the four rejected ids added as probes.
- **Handlers (C-006…C-010)** — against a **real** `ToolRegistry`/`ToolExecutor` pair, matching the precedent named at `mcp-ui-tool-calls.ts:82-83`. Specifically pin: `ctx.emitSurface` absent ⇒ `external_mcp_save` **throws** (fail-closed, never a silent write); `externalMcpOAuthRedirectCapable` absent + `authorization_code` ⇒ `operator_action_required` and **`beginConnect` is never called**; `device_code` ⇒ full flow regardless of the flag.
- **Affordance rules (C-015)** — table-driven, pure, no React.
- **Bridge (C-004)** — `postMessage` with a **wrong origin is ignored**; focus re-check resolves an abandoned popup as not-connected; `window.open` returning `null` surfaces "popup blocked".
- **Explicitly N/A** — live network tests against a real provider (no real Higgsfield endpoints exist; `mini-handoff §6`: do not invent URLs). E2E is deferred to a later pass; if one is written it must be committed to `development/e2e/`.

---

## Phase Map (parallel slices marked)

| Phase | Work | Depends on | `[P]`? |
|---|---|---|---|
| **1** | **Data-loss fix.** C-013 + C-014 red → C-011 → C-012 → green. Delete the false doc claim at `use-external-mcp.hooks.ts:107-111`. | — | no — **must land first** |
| **2a** | `tool-registrations.ts`: the 5 handlers, `contributeExternalMcpTools()`, `deps.ts` +1 field, wire into `tool-catalog-manifest.ts` + 3 composition roots. | Phase 1 (`external_mcp_save` writes through the fixed path) | `[P]` with 2b |
| **2b** | Allowlist: +1 id, `EXPECTED_ALLOWLIST` → 7, +4 probes. **Same commit as 2a's `external_mcp_save` handler** — the id must not exist without the parking handler. | 2a's handler | `[P]` with 2a, merged at commit |
| **3a** | `api.ts` C-001…C-003. | Phase 1 | `[P]` with 3b |
| **3b** | `rules.ts` C-015 + its unit test. Pure, no deps. | — | `[P]` — can start immediately |
| **3c** | `external-mcp-oauth-port.ts` + `use-external-mcp-oauth.hooks.ts` + panel wiring. Add `endpoints` to `ExternalMcpOAuthView`/`AdminExternalMcpOAuthView` and populate in `toItem` (closes the disclosed gap at `use-external-mcp.hooks.ts:87-92`). | 3a, 3b | no |
| **4** | Description edits: restart note, `operator_action_required`, BYOK note. Log the false comment at `callback-page.ts:22-23` to the register. | 2a | `[P]` with 3 |

Sizing for a Sonnet 5 programmer: Phase 1 is **S** (3 files, highest value — do it alone, commit it alone). 2a is **L** (the only genuinely new module). 3c is **M**. 3b and 4 are **XS**.

**Owner rule: commit at the end of every phase.** A report is not durable; a commit is.

---

## Downstream Handoff Notes

- **Coordinator.** Phase 1 is a hard barrier. Phases 2 and 3 parallelize after it; 3b can start immediately. 2a and 2b must land in **one** commit.
- **TDD.** Prioritize C-013/C-014 (**observe red first**), then INV-003's widened probe set, then the two fail-closed handler cases.
- **Programmer audit focus.** (i) `resolveSealedOAuthBlob` is read-modify-write on every path (INV-006). (ii) No new import from `src/features/external-mcp/` into `src/server/**` (`deps.ts:11-14`). (iii) No provider name anywhere in `src/oauth/` outside `providers.ts` (INV-004). (iv) `contributeExternalMcpTools()` is called **before** the catalog snapshot (W-005).
- **Constraints.** No worktrees. No branches. No commits by the architect. Do not touch the paths owned by the two other live sessions. Filter `.claude/worktrees/` out of every search. Do not start, stop or restart any process — a dev server is live on `:3000`/`:5173` plus the daemon.
- **i18n.** Every new admin string is its own i18n key. **Add new keys; never edit an existing string in place** — editing one reverts it to English across 21 locales.

---

## Open risks and owner decisions

| # | Item | Recommendation |
|---|---|---|
| **1** | **The cited consensus report does not exist.** Design was re-derived from code + the two real prior-art docs. | Confirm the report was never written (vs. lost). Nothing here depends on it, but the dispatch's four attributed claims are unverified as *decisions* — all four are, independently, already true in code. |
| **2** | **BYOK cannot see federated tools** (verified: `attachFederatedMcpTools` called only at `agent-daemon-server.ts:827`). The five tools land in **both** surfaces, so a BYOK chat can configure a server it can never use. | Ship the honest description note (Phase 4). Do **not** gate the tools. Fixing federation-in-BYOK is a separate architectural task — needs an owner decision on whether it is wanted at all. |
| **3** | **No real Higgsfield endpoints exist.** DCR discovery is the only path that can work. | An information gap, not a coding one. **Do not invent URLs** (`mini-handoff §6`). The DCR path is already built and is what makes this reachable. |
| **4** | `external_mcp_save` becomes the 7th allowlisted id — a real widening of a security-critical surface. | Justified and bounded (Decision (b)). Owner should sign off on the 6→7 change explicitly, since the tripwire exists to force exactly that conversation. |
| **5** | Adding `endpoints` to `ExternalMcpOAuthView` (Phase 3c) surfaces stored endpoint URLs to the admin client. | Not secret — a client id and endpoints travel in the authorization URL by design (`use-external-mcp.hooks.ts:78-80`). `clientAuth` should be **excluded** from the view: it is server-owned and no UI needs it. |
| **6** | Two other live sessions hold uncommitted work in this shared tree. | Commit with `git commit -F <msgfile> -- <explicit paths>` only. Never `git stash`/`checkout --`/`restore`/`reset --hard`/`clean`. |
