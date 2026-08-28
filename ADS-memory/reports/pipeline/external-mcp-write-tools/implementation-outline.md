# Implementation Outline: External MCP write tools — operator override + discoverability

- Spec: NONE (brownfield, Agent Direct Mode — no spec package, no Planning Preflight; gap noted per `AI-Dev-Shop/AGENTS.md` Agent Direct Mode, not blocking)
- ADR: NONE — deliberate. Owner rule: build a slice before writing an ADR. This outline IS the pre-slice design record.
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity
- Date: 2026-08-26
- Author: Software Architect

---

## 0. Corrections to the Coordinator's brief

Every architect this session has found something in the brief that was wrong. Four here, two of them load-bearing.

### C-1 (LOAD-BEARING). R3 does not block write tools. It blocks **honest** write tools.

`refusalForRemoteToolHints` (`src/assistant/mcp-federation/trust.ts:275-279`):

```ts
if (annotations?.destructiveHint === true) return "remote-declares-destructive";
if (annotations?.readOnlyHint === false) return "remote-declares-not-read-only";
return null;
```

Both checks are `=== true` / `=== false` against an **optional** field. A remote that publishes `annotations: undefined`, or `annotations: {}`, or `annotations: { title: "…" }` and nothing else, passes the gate untouched. This is asserted as intended behaviour today — `mcp-federation.trust.test.ts:165-181` has two cases: *"a remote that declares no annotations at all is admitted normally"* and *"a remote that declares an empty annotations object … is also admitted normally"*.

So the Coordinator's statement **"no external MCP server can do anything that writes, ever"** is false as written. The accurate statement is narrower and worse:

> A server that **declares** its write tools is blocked. A server that stays silent about them is admitted with no override, no marking, and no operator awareness that a write just entered the catalog.

This changes the design. The override list is not only about unblocking Higgsfield; it is also the only place a **silent** write could ever be surfaced, and the discoverability work (§3) is what makes silent writes visible at all. Any design that only adds an unblock path and skips the surfacing leaves the larger hole open.

### C-2 (LOAD-BEARING). Tovu now HAS a human-confirmation transport. The comment saying otherwise is stale.

`src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts:99-103` states:

> "`--read-only` is ALWAYS passed and is not operator-configurable. A federated write path needs a confirmation transport Tovu does not have — the same gap that keeps `database_execute_migrate_forward` unwired … Offering federated writes before native ones would be the wrong order."

That was true when written. It is not true now:

- `src/core/tool-surface-exchanges.ts` is a channel-agnostic, held-open, multi-message human exchange inside one tool call (its own header, lines 5-19).
- `ToolExecutionContext.emitSurface` is real and is forwarded **verbatim** through the audit wrapper (`src/assistant/tool-executor-audit.ts:149-162`).
- `content_post_delete` is described as *"the one production tool that reads `ctx.emitSurface` today"* (`src/assistant/byok-tool-surface.ts:27`).
- `src/assistant/pending-confirmations.ts:8-12` records that its own token mechanism was superseded by that exchange shape for exactly this class of problem.

This belongs in the committed false-comment register. **Fixing that comment is in scope for this slice** (it is the file whose reasoning the whole R3 posture rests on). It also opens a third design candidate, evaluated and rejected-for-now in §2.

### C-3. Line-number drift in the brief (minor, corrected here)

| Brief says | Actual |
|---|---|
| `FederatedAdmissionReport` at `trust.ts:~162-181` | `trust.ts:175-182` |
| `FederatedMcpConnectionConfig` at `ports.ts:128-135` | `ports.ts:128-144` |
| empty allowlist at `external-mcp-store.ts:408-414` | `external-mcp-store.ts:411-414` (doc), function at `:420-439` |

### C-4. "Is a 'fetch tools now' admin action feasible without violating R5?" — yes, and it is not close.

R5 is a property of **the daemon's** admitted set: computed once, from one `tools/list`, inside `federateSession`, which `registrations.ts:169-171` calls *"the one place `listTools` is called, so trust.ts R5's 'frozen at connect' is a property of the code rather than a convention."*

A probe that runs **in the admin web server process**, registers into **no `ToolRegistry`**, and returns a read-only description cannot un-freeze anything the daemon holds. R5 stays exactly as true afterwards. Details and the wiring evidence are in §3.1. The brief's framing ("or must it be a persisted artifact of the last boot?") presents a false choice — the answer is *both, for different questions*, and neither touches R5.

---

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Spans `assistant/mcp-federation` (pure trust tier), `assistant/external-mcp-store.ts` (persistence), `db/schema.ts` (migration), `server/routes/admin/external-mcp` (HTTP), `server/agent-daemon` (daemon process), `apps/admin` (React). Six ownership domains, three OS processes. | this outline §5 |
| Contract Change | yes | New exported `FederatedMcpConnectionConfig.writeAllowedToolNames`, new exported `describeRemoteToolSurface`, new `ToolRefusalReason` members, new admin `POST …/mcp-servers/:id/probe`, new daemon `GET /api/federation/admissions`, new `AdminExternalMcpServerInput.writeAllowedToolNames`. | C-001…C-010 |
| System Wiring | yes | Admin web server must open its own outbound MCP session; admin web server must reach the daemon over the existing authenticated HTTP channel (`server/modules/assistant-daemon-client.ts:24-25,39`). | W-001…W-005 |
| Data And Persistence | yes | New column on `external_mcp_servers`, described in `db/schema.ts:2052` as *"a SECURITY column, not a convenience"*; a sibling column inherits that status. Migration required. | §8 |
| Brownfield Dependency | yes | Four suites exist specifically to pin the behaviour being loosened. `trust.ts`'s header is the security argument of record and every rule in it is a test. | §11 |
| Reverse-Spec Or Migration | no | No source-to-target behavioural mapping; the existing behaviour is preserved and extended. | — |
| Critical Cross-Boundary Invariant | yes | INV-001…INV-006 — a remote must remain unable to promote itself across every new code path, including the new probe and the new report route. | §10 |
| Parallelization Ambiguity | yes | Two lists, two processes, and a UI that must agree with a pure gate. Without an explicit file map, slices that look independent both want `trust.ts`. | §12 |

---

## 1. The problem, restated precisely

Higgsfield advertises 85 tools. The operator allowlisted 7. Every read tool registered; the one write tool did not. Verified cause: `classifyRemoteTool` (`trust.ts:281-313`) runs the operator allowlist at `:293` and then the remote's own hints at `:295`, and `refusalForRemoteToolHints` removes anything declaring `readOnlyHint: false`.

R3's justification (`trust.ts:70-74`) is sound and is not in dispute:

> "The untrusted party is given exactly one power over its own privileges — the power to reduce them — so lying is never profitable, only self-defeating."

The defect is not in that sentence. It is that **the trusted party was never given the matching power to restore**. R2 (`trust.ts:65-68`) establishes that the human is the trusted classifier; R3 then overrides the human with the untrusted party's own declaration. The two rules disagree about who decides, and R3 wins by accident of ordering.

The fix restores R2's precedence without weakening R3's one-way property, by giving the trusted party a **second, separate, explicit** statement. R3 keeps its exact meaning for every tool the operator has not named twice.

---

## 2. Candidate evaluation

| Candidate | Shape | Fit | Verdict |
|---|---|---|---|
| **A. Blanket `allowWrites: boolean` per connection** | One flag disables `refusalForRemoteToolHints` for the whole connection. | Poor | **REJECTED** (also pre-rejected by the Coordinator, correctly). It discards R3 wholesale for every tool the connection ever advertises, including ones added after the operator looked. It is the rug-pull R5 exists to close, re-opened at the policy layer. |
| **B. Second operator list — `writeAllowedToolNames`** | A tool may write only if the operator named it in BOTH lists. | Strong | **SELECTED.** Per-tool, default-deny, symmetric with the mechanism already in place, and the remote gains nothing it did not have. |
| **C. Per-call human confirmation via surface exchange** | Admit write tools with no second list; hold the call open and ask a human each time (`core/tool-surface-exchanges.ts`). | Partial | **DEFERRED, not rejected.** See below. |

### Why C is not the answer for this slice (but is the right follow-on)

C is genuinely attractive against the owner's stated concern — there is no setting to discover, so nobody can fail to discover it. Three reasons it cannot replace B:

1. **It moves the classification back onto the untrusted party's terms.** R2's premise (`trust.ts:65-68`) is that admission is decided *"by someone other than the thing being classified"*, in advance. A confirmation dialog is authored per-call from the model's chosen arguments. A human clicking "yes" for the fortieth time is not a classifier; it is a rubber stamp with a UI.
2. **It fails closed with a confusing error in exactly the case the owner named.** `byok-tool-surface.ts:75` records that a handler reading `ctx.emitSurface` *"fails closed rather than parking when it is [absent]"*. Every headless run, every CLI-driven run, every channel without a live surface loses federated writes — and the failure arrives as a tool error mid-conversation, which is precisely the *"they start getting errors and it's not gonna make sense"* outcome the owner is trying to avoid.
3. Cost is an order of magnitude above a column.

**They compose, and should.** B decides *"may this tool ever write"*; C decides *"may it write this time"*. Ship B, ship the surfacing in §3, and record C as a re-evaluation trigger once a write tool is actually being used in anger. Correct C-2's stale comment now so the next reader does not re-derive a blocker that no longer exists.

---

## 3. Discoverability — the headline half

The mechanism in §2 is roughly one day of work. This section is the rest of the feature and is where the owner's actual concern lives:

> *"somebody's not gonna know about these settings, and trying to protect them is going to be very frustrating. Wouldn't we have to manually add every allowed operation? When they start getting errors, it's not gonna make sense."*

They are right on all three counts. Today the operator types names into a comma-separated `kind: "text"` field (`apps/admin/src/features/settings/rules.ts:144-150`) with placeholder *"comma-separated — nothing runs unless it is listed here"*, having never been shown a single name. A wrong name produces **silence** — the tool is absent and nothing anywhere in the admin UI says so. The only existing report goes to daemon stderr (`bootstrap.ts:141-148`) and is discarded.

### 3.1 Q1 — How does the operator see what a server offers?

**Answer: a live probe run by the admin web server, on demand, plus a separate read of what the daemon actually admitted at its last boot. Two different questions, two different sources, both cheap.**

**Source A — the probe ("what does this server offer right now?").** The admin web server already holds every dependency needed:

- the roster repo, sealer and keyring (`src/server/routes/admin/external-mcp/deps.ts:17-20`);
- the OAuth service, already narrowed to required on this route family (`routes/admin/external-mcp/oauth.ts:40`);
- `readEnabledExternalMcpConfigs` and `toResolvedFederatedConnections`, both exported through `src/assistant/agent-daemon-port.ts:26-28`;
- transport-agnostic connect functions (`mcp-federation/adapter.http.ts`, `adapter.stdio.ts`) already dispatched on launch-spec shape by `bootstrap.ts:223-235`.

The probe connects, calls `listTools()`, describes the surface, closes, and registers nothing. **R5 untouched** — see C-4. It is also *strictly better* for the rug-pull threat than not probing: the operator sees the surface at the moment they choose, and the daemon re-applies the allowlist against a fresh `tools/list` at connect regardless.

Not persisted in v1. It is a cache of third-party data, and a cache of third-party data sitting on the `external_mcp_servers` row is an invitation to the exact mistake `db/schema.ts:2052-2056` forbids in writing (*"this must never be backfilled from what a server advertises about itself"*). Held in React state for the dialog's lifetime. Persisting is a clean follow-on if a second surface ever needs it.

**Source B — the daemon's live admissions ("what is loaded right now?").** `logFederatedAdmissionReport` already walks the full accounting and throws it at stderr. Keep it in memory on the daemon and serve it on `GET /api/federation/admissions`, read by the admin web server over the channel that already exists and is already authenticated: `AGENT_DAEMON_URL` + `AGENT_DAEMON_TOKEN_ENV_VAR` (`src/server/modules/assistant-daemon-client.ts:19-25,39`).

This is the single highest-value item in the whole outline, because it is the only thing that can state the truth the operator needs: **"you ticked 3 tools; the assistant is running with 1."** Everything else is inference.

### 3.2 Q2 — How is a write tool marked so ticking it is an informed act?

The existing report cannot support this. `AdmittedFederatedTool` carries `declaredAnnotations` (`trust.ts:170`) but a **refused** entry is only `{ remoteName, reason }` (`trust.ts:177`) — and a write tool is, by definition, in the refused set. The data needed to mark it is discarded at the moment it matters.

**New pure contract in `trust.ts`: `describeRemoteToolSurface({ tools, config })`.** One record per **advertised** tool:

| Field | Meaning | UI use |
|---|---|---|
| `remoteName` | the vendor's name | row label |
| `description` | R6-processed, control-stripped, capped (`describeFederatedTool`, `trust.ts:372-379`) | row body |
| `declaredAnnotations` | verbatim, may be `undefined` | badge source |
| `writeDeclared` | `annotations?.readOnlyHint === false` | "WRITES" badge |
| `destructiveDeclared` | `annotations?.destructiveHint === true` | "DESTRUCTIVE" badge |
| `hintsAbsent` | no annotations object, or no hint fields set | "the server does not say" badge |
| `allowlisted` / `writeAllowed` | the two operator decisions | the two checkboxes |
| `admitted` | would clear the gate today | row state |
| `refusalReason` | `ToolRefusalReason \| null` | inline explanation |

It **must** be built on the same `classifyRemoteTool` path the gate uses. Two implementations of "would this be admitted" is how a UI ends up confidently lying. INV-005 pins that.

**Copy discipline, and it is load-bearing.** `hintsAbsent` must never render as "read-only". Per C-1, absent hints mean the server said nothing, and a tool with no annotations that writes is admitted today with no override. The badge must read *"the server does not say what this tool does"* — the honest statement, and the one that makes the silent-write hole visible instead of dressing it as safety.

### 3.3 Q3 — What does the user see when it goes wrong?

| Failure | Today | Designed |
|---|---|---|
| Allowlisted name the server never offers | stderr only (`bootstrap.ts:145-147`) | inline on the picker: the typed name, struck through, *"this server does not offer a tool by that name"* |
| Empty allowlist | legitimate value, zero tools, no warning (`external-mcp-store.ts:411-414`) | card warning state: *"0 of 85 tools enabled — this connection contributes nothing"* |
| Write tool refused | absent, silent | row shows WRITES badge + *"Tick 'may write' to enable this tool."* |
| Destructive tool refused | absent, silent | row disabled + *"The server marks this tool as destructive. Tovu does not enable destructive external tools."* |
| Name in write list but not in allowlist | nothing (inert) | reported as its own drift entry — see INV-004 |
| Probe cannot connect | n/a (no probe) | *"Could not reach this server. You can still type tool names by hand."* — the text field never disappears |
| OAuth callback failure | one generic page; cause is `console.error` only (`routes/external-mcp/oauth-callback.ts:82-86`) | see below |

**OAuth callback.** `renderOAuthCallbackPage({ ok: false, … })` collapses rate-limit, missing-`state`, and every exchange failure into one page. Fix: a **closed Tovu-authored reason vocabulary** (`rate_limited | no_state | state_expired | provider_denied | exchange_failed | server_unknown`) rendered on the page and included in the `postMessage` payload so the opener tab can show a specific message. The provider's response body must never reach the caller — that rule already exists one file over (`routes/admin/external-mcp/oauth.ts:44-47`) and is simply being extended to the public callback. Independent slice, no coupling to the write-tool work.

### 3.4 Q4 — The restart trap. Should R5 be revisited?

**Verdict: no — not in this slice, and the blocker is not R5.**

The Coordinator asked for an argument rather than an assumption, so here is the honest version, including the part that cuts against my own conclusion:

**R5 is weaker than its own header implies.** `trust.ts:81-85` concedes it: *"the swapped-in tool is not in the frozen set, and would still have to clear R2 even if the set were recomputed."* By its own text, R5 is defence-in-depth over R2, not the primary control. So "R5 forbids hot-reload" is not a claim the codebase actually makes, and a future hot-reload is not architecturally prohibited.

**The real blocker is one layer down, and it is hard.** Nothing in this subtree can *unregister* a tool. `registrations.ts:57-63` states it plainly: `buildToolCatalogQuery` snapshots `registry.list()` into a **one-shot FTS index** at boot, so a tool removed from the registry afterwards *"would still be discoverable by `search_tools`/`describe_tool` while no longer being executable — strictly worse than leaving it registered."* `agent-daemon-server.ts:827-843` is ordered around that snapshot deliberately.

Therefore a hot-reload of the allowlist could only ever **widen** it and never **narrow** it. A security allowlist whose live enforcement is monotonically increasing is a worse mechanism than a restart, not a better one. Closing that means making the FTS index rebuildable in `tool-catalog-query.ts` — a real piece of work, a different feature, and one that should be justified on its own.

**What the UI must say instead — and it can be exact, not vague.** The restart route already exists: `POST /api/admin/v1/workspaces/:workspaceId/system/assistant-daemon/restart` (`src/server/routes/admin/system/assistant-daemon.ts:54`). Combined with §3.1's Source B, the tab can state the actual drift rather than a boilerplate warning:

> **Saved. The assistant is still running with its previous tool list.**
> Live now: 5 tools. Saved: 7 tools — `generate_image`, `edit_image` are not loaded.
> **[Restart the assistant]** This ends any conversation in progress.

**Caveat that must be designed for, not discovered:** that route is `system.write`-gated (`assistant-daemon.ts:64`), while this whole tab is `admin.integrations.manage`-gated (`routes/admin/external-mcp/guard.ts`). An operator with integration rights but not system rights will get a 403 from a button that looked available. The button must be gated on a capability the client already knows, or hidden with an explanatory line — never allowed to fail at click time. That is an owner decision (§9, D-4) because the alternative is widening the restart route's permission.

### 3.5 Q5 — Does the two-list model survive contact with this UI?

**Yes, and the UI argues for it rather than against it.** But the answer to the second half of the question is a firm no: this cannot be a Jini field.

**Why the record model (`[{name, allowWrite}]`) loses:**

1. **The element type is load-bearing across a second consumer.** `FederatedMcpConnectionConfig.allowedToolNames: readonly string[]` (`ports.ts:135`) is consumed by the preset path too — `supabase-mcp-plugin.ts:208` and `mcp-federation/config.ts:64`. Changing the element type forces every preset to change. Adding `writeAllowedToolNames?: readonly string[]` defaults to empty, and Supabase keeps its documented no-writes posture with zero edits.
2. **Permanent dual-shape reader.** `parseJsonArray` (`external-mcp-store.ts:315`) is shared by `args`, `envNames` and `allowedToolNames`. A record-shaped column needs a branch that accepts both shapes forever, because old rows exist.
3. **Auditability.** Two columns answer *"which writes has this operator ever enabled?"* by reading one column. The record shape buries that decision inside rows that also encode an unrelated one.
4. **They are genuinely two decisions.** "Available to the model" and "allowed to write" are independent; a record with one boolean either conflates them or needs two booleans anyway, at which point it is two sets with extra syntax.

**The UI's per-tool record is a VIEW, assembled from three sources** — advertised tools (probe) × allowlist × write-override. That is `describeRemoteToolSurface`'s job (§3.2), and it is exactly where a view belongs.

**Why the picker cannot be a Jini field kind.** `SourceFieldKind` is `'text' | 'url' | 'password' | 'select' | 'textarea' | 'secret-textarea'` (`Jini/packages/ui/src/features/source-config-list/types.ts:32`) — no checkbox, no multi-select — and `SourceFieldValues` is `Record<string, string>` (`types.ts:57`), so a record carrying a description, two hint flags and a refusal reason cannot be a field value at all. Adding a kind means editing Jini, and Jini source edits need a rebuild before Tovu sees them.

**Design:** a Tovu-owned `ExternalMcpToolPicker` rendered **beside** the card, writing back into the two existing string fields. Zero Jini change. **The two text inputs stay** as the advanced/fallback path — an operator whose server is unreachable, or who already knows the names, must still be able to type. The picker is a superset affordance that degrades gracefully, not a replacement.

**One live seam worth knowing about:** Jini derives `capabilities.canTest` from `Boolean(port.testSource)` (`Jini/packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:187`). Tovu's `useExternalMcp` port supplies `fetchSources`/`addSource`/`removeSource`/`updateSource` only (`hooks/use-external-mcp.hooks.ts:186-237`), so the "Test" button is currently hidden. Wiring `testSource` to the probe lights up an existing, already-agent-driveable control for free. Recommended, but it does **not** replace the dedicated picker: `SourceTestResult` is `{ ok, message?, latencyMs? }` (`types.ts:70-74`) and cannot carry a tool list.

---

## 4. Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `assistant/mcp-federation` (trust tier) | R1–R8, the admission decision | Pure functions. Decides admission and describes a surface. No I/O, no registry, no persistence. | C-001, C-002, C-003, C-004 | types only | `trust.ts`'s header is the security argument of record. Every rule in it is a test. Any new rule added here gets a header paragraph and a test, or it does not go in. |
| `assistant/external-mcp-store` | the operator's roster row | Validates and persists operator input; resolves rows into federation's connection shape. Never adjudicates trust (`external-mcp-store.ts:32-35`). | C-005, C-006 | repo, sealer, keyring, clock | Second security column joins the first. |
| `db` | the `external_mcp_servers` table | Column definition + migration. | — | drizzle | `schema.ts:2052-2056` is the governing comment; the new column inherits its status verbatim. |
| `server/routes/admin/external-mcp` | operator HTTP surface | Roster CRUD + the new probe + the new admissions proxy. `admin.integrations.manage`. | C-007, C-008 | `ExternalMcpRouteDeps` | Probe makes an outbound call on the operator's credentials → rate-limited in front of the guard, per `oauth.ts:21-27`. |
| `server/agent-daemon` | the live federated catalog | Holds the boot admission report in memory and serves it. | C-009 | `requireAgentDaemonToken` | Separate OS process. Reached only over `AGENT_DAEMON_URL` + token. |
| `server/routes/external-mcp` (public) | the OAuth callback page | Reports a closed-vocabulary failure reason. | C-010 | — | Public, anonymous, rate-limited. No provider text may cross this boundary. |
| `apps/admin/features/settings` | the tab | Renders the picker, the drift banner, the restart prompt. | — | `@jini-ai/ui` (unchanged) | Zero Jini edits — see §3.5. |

## 5. File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Why This Separation Exists |
|---|---|---|---|---|
| `src/assistant/mcp-federation/ports.ts` | trust tier | changes | C-001 | The config shape is the whole contract between a preset and core federation (`config.ts:28-30`). The new field must live beside `allowedToolNames` and inherit its "no safe default at this layer" doc rule (`ports.ts:121-127`). |
| `src/assistant/mcp-federation/trust.ts` | trust tier | changes | C-002, C-003, C-004 | The one place admission is decided. `describeRemoteToolSurface` goes here, not in a UI module, so the picker and the gate cannot disagree (INV-005). |
| `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` | vendor preset | changes | — | Must state its position on the new required field explicitly (empty — Supabase writes stay off, as its header argues). Also carries the C-2 comment correction. |
| `src/assistant/__tests__/mcp-federation.trust.test.ts` | trust tier | changes | — | One or more cases per numbered rule; R3's section grows a sub-section for the override. |
| `src/assistant/__tests__/mcp-federation.registrations.test.ts` | trust tier | changes | — | Fixture `CONFIG` (`:44-52`) needs the new required field. **`tsc` does not check test files in this repo** — the compiler will not find these. Grep every `FederatedMcpConnectionConfig` literal. |
| `src/db/schema.ts` | db | changes | — | `write_allowed_tool_names TEXT` beside `allowed_tool_names` (`:2096`), with its own doc paragraph in the table header. |
| `src/db/drizzle/00NN_<name>.sql` + `meta/` | db | creates | — | **Generate with drizzle-kit; never hand-write.** A hand-written migration desynchronizes the journal hash. |
| `src/db/sqlite/external-mcp-repo.sqlite.ts` | db | changes | — | Column read/write. |
| `src/assistant/external-mcp-store.ts` | store | changes | C-005, C-006 | Record, config, view, save input, parse, and the subset assertion. |
| `src/assistant/external-mcp-store.memory.ts` | store | changes | — | The double must carry the column or every route test lies. |
| `src/assistant/__tests__/external-mcp-store.test.ts` | store | changes | — | Round-trip through the REAL `admitRemoteTools`, mirroring `:276-298`. |
| `src/server/routes/admin/external-mcp/probe.ts` | admin routes | creates | C-007 | A route that opens an outbound session is a different risk class from the roster CRUD beside it; it gets its own file and its own limiter. |
| `src/server/routes/admin/external-mcp/admissions.ts` | admin routes | creates | C-008 | Proxy to the daemon. Separate from `probe.ts` because one asks the vendor and the other asks our own daemon — different failure modes, different copy. |
| `src/server/routes/admin/external-mcp/deps.ts` | admin routes | changes | — | Needs `externalMcpOAuth` + a limiter + the daemon client. |
| `src/server/modules/external-mcp.ts` | admin routes | changes | — | Registrar wiring. |
| `src/assistant/mcp-federation/bootstrap.ts` | daemon | changes | C-009 | `AttachFederatedToolsResult` (`:57-62`) grows the reports it already builds and currently discards. |
| `src/server/agent-daemon/agent-daemon-server.ts` | daemon | changes | C-009 | `:827` currently ignores the return value. Capture it; serve it. |
| `src/server/routes/external-mcp/oauth-callback.ts` | public routes | changes | C-010 | Closed reason vocabulary. |
| `apps/admin/src/lib/api.ts` | admin client | changes | — | Two new calls + the new input/view field. |
| `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` | admin feature | changes | — | `toItem`/`toWriteBody` gain the field; `testSource` wired to the probe. |
| `apps/admin/src/features/settings/ExternalMcpToolPicker.tsx` | admin feature | creates | — | The checklist. Tovu-owned because no Jini `SourceFieldKind` can express it (§3.5). |
| `apps/admin/src/features/settings/rules.ts` | admin feature | changes | — | Second text field spec + i18n keys. |
| `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx` | admin feature | changes | — | Mounts the picker, the drift banner, the restart button. |

## 6. Contract Map

| ID | Name | File | Kind | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity | Trace | Test Seam |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 | `FederatedMcpConnectionConfig.writeAllowedToolNames` | `mcp-federation/ports.ts` | exported interface field | Name the remote tools the operator has separately authorized to write. | `readonly string[]` | — | — | — | pure data | O(1) | §2 B | every fixture; a preset that omits it must not compile |
| C-002 | `ToolRefusalReason` (+ meaning change) | `mcp-federation/trust.ts` | exported union | Say why a tool was not admitted. | — | — | — | — | pure | O(1) | §3.3 | `remote-declares-not-read-only` **keeps its string** and narrows its meaning to "declares write AND is not write-authorized". Keeping the literal keeps existing log greps and test names true. |
| C-003 | `admitRemoteTools` (behaviour change) | `mcp-federation/trust.ts` | exported function | Apply R2+R3+R4+R6 to one server's surface. | `{ tools, config }` | `FederatedAdmissionReport` | write-override consulted **only** after the allowlist passes | none (pure) | pure | O(t) | §2 B | INV-001…INV-004 |
| C-004 | `describeRemoteToolSurface` | `mcp-federation/trust.ts` | **new** exported function | Describe every ADVERTISED tool as an operator-facing record. | `{ tools, config }` | `readonly RemoteToolSurfaceEntry[]` (§3.2 table) | must be built on `classifyRemoteTool` | none (pure) | pure | O(t) | §3.2 | INV-005: for every tool, `entry.admitted === admitRemoteTools(...).admitted.some(name match)` |
| C-005 | `ExternalMcpServerRecord/Config/View.writeAllowedToolNames` | `external-mcp-store.ts` | exported interface fields | Carry the second list through storage and the read model. | `string \| null` (record), `string[]` (config/view) | — | — | — | pure data | O(1) | §8 | view round-trip test |
| C-006 | `SaveExternalMcpServerInput.writeAllowedToolNames` + subset assertion | `external-mcp-store.ts` | exported field + validation | Reject a write entry that is not also in the allowlist. | raw comma-separated `string` | `string[]` | `REMOTE_TOOL_NAME_PATTERN`, `MAX_ALLOWED_TOOLS`, **and ⊆ allowlist** | `ExternalMcpValidationError(field: "writeAllowedToolNames")` naming the offending tool | pure | O(n) | §8 note | rejects at save; precedent is `parseAllowedToolNames`' own doc (`:414-416`) |
| C-007 | `POST …/mcp-servers/:serverId/probe` | `routes/admin/external-mcp/probe.ts` | HTTP | Connect once, list, describe, close. | path params | `{ tools: RemoteToolSurfaceEntry[], probedAt }` | `admin.integrations.manage`; limiter **in front of** the guard | 400 unknown server, 502 unreachable, 409 `needs_reauth`, 429 | **outbound network call**; registers nothing | one handshake, bounded by `connectTimeoutMs` | §3.1 A | INV-006: response carries no env value, no token, no header, no client secret |
| C-008 | `GET …/mcp-servers/admissions` | `routes/admin/external-mcp/admissions.ts` | HTTP | Report what the running daemon actually admitted. | — | `{ connections: [{ connectionId, admitted, refused, allowlistedButAbsent, writeAllowedButNotAllowlisted }] }` | same guard | 503 when the daemon is unreachable — **say so**, never return an empty list | proxies to the daemon | O(c·t) | §3.1 B | a stopped daemon yields 503, not `{connections: []}` |
| C-009 | `AttachFederatedToolsResult.reports` + `GET /api/federation/admissions` | `mcp-federation/bootstrap.ts`, `agent-daemon-server.ts` | exported field + daemon HTTP | Retain and serve the report already built at `bootstrap.ts:171`. | — | `readonly { connectionId, report }[]` | `requireAgentDaemonToken` (fail-closed) | 401 | in-memory only, boot-scoped | O(c) | §3.1 B | boot capture asserted without a live daemon |
| C-010 | `renderOAuthCallbackPage({ reason })` | `routes/external-mcp/oauth-callback.ts` | HTTP + `postMessage` payload | Name the failure from a closed Tovu vocabulary. | `rate_limited \| no_state \| state_expired \| provider_denied \| exchange_failed \| server_unknown` | HTML + message | — | — | none | O(1) | §3.3 | a provider error body must never appear in the response — same rule as `routes/admin/external-mcp/oauth.ts:44-47` |

## 7. Wiring Map

| ID | Source | Transport | Target | Payload | Ordering / Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | admin tab | HTTP `POST` | `probe.ts` | server id | not idempotent (outbound call); rate-limited | probe failure → picker falls back to the text fields, never disappears | §3.1 A |
| W-002 | `probe.ts` | MCP over stdio/HTTP | the vendor's server | `initialize` + `tools/list` | one handshake, bounded; session closed in `finally` | fail-open to a 502 with an operator-readable reason | §3.1 A |
| W-003 | admin tab | HTTP `GET` | `admissions.ts` → daemon | — | idempotent | daemon down → 503 with copy that says the assistant is not running | §3.1 B |
| W-004 | `admissions.ts` | HTTP + bearer | agent daemon | — | idempotent | reuses `AGENT_DAEMON_URL`/`AGENT_DAEMON_TOKEN_ENV_VAR` (`server/modules/assistant-daemon-client.ts:19-25,39`) | §3.1 B |
| W-005 | admin tab | HTTP `POST` | existing `system/assistant-daemon/restart` (`assistant-daemon.ts:54`) | — | not idempotent | `system.write`-gated — see D-4 | §3.4 |

## 8. Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Consistency Rule | Migration Path |
|---|---|---|---|---|---|
| `external_mcp_servers.write_allowed_tool_names` | `external-mcp-store.ts` | store read paths + probe route | `saveExternalMcpServer` only | Must be a subset of `allowed_tool_names` at write time (C-006). **Never backfilled from anything a server advertises** — `schema.ts:2052-2056`, applied verbatim to the new column. | New nullable column. `NULL` and `'[]'` both mean "no writes authorized", which is every existing row's correct value. **No data backfill.** |
| daemon in-memory admission reports | `agent-daemon-server.ts` | `GET /api/federation/admissions` | boot only | Boot-scoped; lost on restart, which is correct — it describes this process's frozen set (R5). | N/A |
| probe result | React state | the picker | — | Not persisted in v1 (§3.1). | N/A |

## 9. Observability

| Surface | Signals | Logs | Privacy | Trace |
|---|---|---|---|---|
| boot admission | existing per-refusal `logger.warn` (`bootstrap.ts:142-147`) | **new:** one `logger.warn` per tool admitted with `writeAuthorized: true` — `"'<conn>' admitted WRITE tool '<name>' (operator-authorized)"`. Warn, not info: an operator-authorized write entering the model's catalog is a security-relevant boot event. | tool names only | §3.1 B |
| boot admission | **new:** one `logger.warn` per `writeAllowedButNotAllowlisted` entry | sibling of the existing `allowlistedButAbsent` line (`:145-147`) | tool names only | INV-004 |
| probe route | log the connection id + advertised count + duration | never the URL's query, never any header, never a tool's arguments | R6 processing applied before any description is logged or returned | C-007 |
| OAuth callback | existing `console.error` retained for the operator's own logs | the closed reason code also goes to the response | provider body stays server-side | C-010 |

## 10. Critical Invariants

| ID | Rule | Reason | Enforcement | Test |
|---|---|---|---|---|
| INV-001 | A remote cannot promote itself by ANY hint value. `readOnlyHint: true` still grants nothing. | R3's load-bearing property. | `classifyRemoteTool` — hints are read only to demote or to be matched against the operator's list. | extend `trust.test.ts:144-161` (the `drop_all_tables` case) to also assert it stays refused with a write list that does not name it |
| INV-002 | The write override is consulted **only after** the allowlist passes. A tool in the write list but not the allowlist is `not-in-operator-allowlist`, never admitted. | Two lists must not become a bypass. Preserves the deliberate check order (`trust.ts:232-236`). | `classifyRemoteTool` ordering. | direct case |
| INV-003 | `destructiveHint: true` is refused **regardless** of both lists in this slice. | Justified in D-1. | `refusalForRemoteToolHints` runs its destructive check before any override is consulted. | a tool on BOTH lists declaring `destructiveHint: true` is still `remote-declares-destructive` |
| INV-004 | Write-list drift is reported, never silent. | `trust.ts:150-151`: *"Every refusal is reportable, never silent."* Sibling of `allowlistedButAbsent` (`:178-181`). | new `FederatedAdmissionReport.writeAllowedButNotAllowlisted` | direct case |
| INV-005 | `describeRemoteToolSurface` and `admitRemoteTools` agree, per tool, for every input. | A picker that disagrees with the gate teaches operators the wrong model and is worse than no picker. | shared `classifyRemoteTool`. | property-style: for a mixed fixture, `entries.filter(admitted).map(name)` deep-equals `admitRemoteTools(...).admitted.map(remoteName)` |
| INV-006 | The probe response carries no secret. | Mirrors the property `list.ts:8-11` already asserts for the roster route. | probe response built only from `tools/list` + the two name lists. | assert no env value, no bearer token, no client secret appears in a serialized probe response |

## 11. Test Expectations

Runners: root → `node --import tsx --test --experimental-test-module-mocks "<path>"`. `apps/admin` → `cd apps/admin && npx vitest run <path>`. **Always scoped — never a bare full-suite run.**

Every case below is **red first**. Owner rule: a bug fix ships a regression test that failed before the fix.

**`src/assistant/__tests__/mcp-federation.trust.test.ts`** — new R3 sub-section:

- (a) **still refused**: a tool declaring `readOnlyHint: false`, on `allowedToolNames` only, is refused `remote-declares-not-read-only`. *This is the existing behaviour and must survive the change.* Equivalent to `:135-142`.
- (b) **admitted**: the same tool, on `allowedToolNames` **and** `writeAllowedToolNames`, is admitted, and `declaredAnnotations` still round-trips.
- (c) **no self-promotion**: `drop_all_tables` with `{ readOnlyHint: true, destructiveHint: false }` and an empty write list is `not-in-operator-allowlist`; with a write list naming it but an allowlist that does not, still `not-in-operator-allowlist` (INV-002).
- (d) **destructive stays refused**: a tool on both lists declaring `destructiveHint: true` is `remote-declares-destructive` (INV-003).
- (e) **drift reported**: a write list naming a tool absent from the allowlist yields `writeAllowedButNotAllowlisted: ["<name>"]` (INV-004).
- (f) **the silent-write hole, documented**: a tool with `annotations: undefined` on `allowedToolNames` only is admitted with `writeAuthorized: false`. Titled so it reads as the finding it is: *"a remote that declares nothing writes without an override — R3 only catches honest servers"* (C-1).
- (g) **surface agrees with gate** (INV-005).

**`src/assistant/__tests__/external-mcp-store.test.ts`**:

- (h) both lists round-trip through save → `readEnabledExternalMcpConfigs` → `toResolvedFederatedConnections` → the real `admitRemoteTools`, and the write tool is admitted. Mirrors the existing `:276-298`.
- (i) a write entry not in the allowlist is rejected at save with `field === "writeAllowedToolNames"` and the offending name in the message.
- (j) a `NULL` column and a `'[]'` column both yield `[]` — the pre-existing-row case. Mirrors `:381-400`.
- (k) the admin read model exposes the second list and still exposes no env value (extend the existing property).

**`src/assistant/__tests__/mcp-federation.registrations.test.ts`**: fixture update + one case that a write-authorized tool's handler still runs the liveness gate and `requireToolPermission` **before** any network call (`registrations.ts:118-131`). Write authorization must not shorten the gate chain.

**`mcp-federation.stdio-adapter.test.ts`**: no behavioural coupling to R3 — `:132-139` only asserts annotations round-trip through the transport verbatim. **Correction to the brief: this suite does not pin R3 and should need no change.** Run it to confirm.

**New route tests**: probe returns entries for a scripted server; probe on an unknown id → 400; probe with a `needs_reauth` row → 409, not a hang; INV-006. Admissions with a down daemon → 503 with a distinguishable code.

**`apps/admin`**: picker renders WRITES / DESTRUCTIVE / "the server does not say" badges from a fixture; ticking write auto-ticks enabled; a destructive row is disabled with its reason; the drift banner appears when live ≠ saved; the restart button is absent (not 403-ing) without `system.write`.

## 12. Phase map

Sized for Sonnet 5 programmers. `[P]` = safe to run concurrently; **zero file overlap within each phase**. Max concurrency: **3**.

### Phase 0 — starts immediately, shares no file with anything (1 programmer) `[P]` with Phase 1

- **0A — OAuth callback failure reasons.** `src/server/routes/external-mcp/oauth-callback.ts` + its render helper + test. Closed vocabulary, `postMessage` payload, no provider text. Independent of the entire write-tool mechanism; included because it is the same "the user sees nothing when it goes wrong" defect.

### Phase 1 — the gate (1 programmer, BLOCKING)

- `mcp-federation/ports.ts`, `mcp-federation/trust.ts`, `supabase-mcp-plugin.ts` (new field + C-2 comment fix), `__tests__/mcp-federation.trust.test.ts`, `__tests__/mcp-federation.registrations.test.ts` (fixtures).
- Deliverables: C-001…C-004, INV-001…INV-005, tests (a)–(g).
- **Warning to carry into the prompt:** `tsc` in this repo does not check test files, so a missing required field on a `FederatedMcpConnectionConfig` literal in a fixture will **not** be a compile error — it will be a runtime `TypeError`. Grep every literal.

### Phase 2 — three parallel slices (3 programmers)

- **[P] 2A — persistence.** `db/schema.ts`, new drizzle migration + `meta/`, `db/sqlite/external-mcp-repo.sqlite.ts`, `assistant/external-mcp-store.ts`, `assistant/external-mcp-store.memory.ts`, `__tests__/external-mcp-store.test.ts`, `db/sqlite/__tests__/external-mcp-repo.sqlite.test.ts`. Deliverables: C-005, C-006, tests (h)–(k). **Generate the migration with drizzle-kit.**
- **[P] 2B — daemon admissions.** `mcp-federation/bootstrap.ts`, `server/agent-daemon/agent-daemon-server.ts`, new daemon route file + test. Deliverables: C-009 + the new warn-level log lines (§9).
- **[P] 2C — i18n keys + copy.** All new admin strings, added as new keys across the locale set. Separated because a string is its own i18n key in this codebase: editing an existing string in place reverts it to English in 21 locales. This slice **only adds**, never edits.

### Phase 3 — two parallel slices (2 programmers). Gated on 2A + 2B.

- **[P] 3A — admin routes.** `routes/admin/external-mcp/probe.ts` (new), `admissions.ts` (new), `deps.ts`, `server/modules/external-mcp.ts`, tests. Deliverables: C-007, C-008, INV-006.
- **[P] 3B — admin client + hook.** `apps/admin/src/lib/api.ts`, `features/settings/hooks/use-external-mcp.hooks.ts` (adds the field to `toItem`/`toWriteBody`, wires `testSource` → probe), `hooks/__tests__/use-external-mcp.unit.test.ts`. Written against the C-007/C-008 shapes defined above, so it does not have to wait for 3A to merge.

### Phase 4 — UI (1 programmer). Gated on 3B.

- `features/settings/ExternalMcpToolPicker.tsx` (new), `rules.ts`, `ExternalMcpSettingsPanel.tsx`, `__tests__/ExternalMcpSettingsPanel.unit.test.tsx`, `__tests__/rules.unit.test.ts`, new picker test. Includes the drift banner and the restart button.
- Owner preference: delegate UI work to a subagent; make the UI change before the tests so the owner can watch `:5173`.

**Files owned by other sessions — none of the above collides.** Verified against the exclusion list in the brief.

## 13. Owner decisions required

| ID | Decision | Recommendation |
|---|---|---|
| **D-1** | **Does the override cover `destructiveHint: true`?** | **No, not in this slice.** Rationale: (i) the verified live blocker is `generate_image` — a write, not a destructive one; (ii) Tovu's own native tier still withholds irreversible operations on purpose and records the exclusions (`trust.ts:33-36`), and admitting a federated irreversible operation while `database_execute_migrate_forward` stays unwired inverts the ordering `supabase-mcp-plugin.ts:99-103` argues for — an argument that C-2 weakens for ordinary writes but leaves fully intact for irreversible ones; (iii) leaving it out keeps the change to one predicate, so covering it later is additive. **Known cost, and it is real:** a vendor that conservatively marks every write `destructiveHint: true` stays fully blocked with no operator route. If a real server behaves that way, D-1 reopens immediately. |
| **D-2** | Should the per-call confirmation exchange (Candidate C) be built on top of the list? | **Not now.** Ship B, use it, then decide. Recorded as a re-evaluation trigger, not a rejection — and C-2's comment fix is what stops the next reader concluding it is impossible. |
| **D-3** | Persist the probe result? | **No in v1.** It is a cache of third-party data and putting it on the security table invites the backfill `schema.ts:2052-2056` forbids. Session-scoped React state. Revisit if a second surface needs it. |
| **D-4** | The restart button is `system.write`-gated (`assistant-daemon.ts:64`) but the tab is `admin.integrations.manage`-gated. | **Hide the button when the principal lacks `system.write`, with a line explaining a restart is needed and who can do it.** The alternative — widening the restart route's permission so integration managers can restart the assistant — is a real permission change and is the owner's call, not mine. |
| **D-5** | Wire `testSource` so Jini's existing "Test" button appears? | **Yes.** It is already built, already agent-driveable, and costs one port method (`useSourceConfigList.ts:187`). It complements the picker; it cannot replace it, since `SourceTestResult` is `{ok, message?, latencyMs?}` and carries no tool list. |
| **D-7** | Restrict the v1 probe to `streamable_http` rows, skipping `stdio`? | **Yes, recommended.** It removes child-process spawning from the web server entirely, and the motivating connection (Higgsfield) is hosted. `stdio` operators keep the text-field path, which is exactly what they have today — no regression. Revisit when a local-command server actually needs it. |
| **D-6** | Fix the false comment at `supabase-mcp-plugin.ts:99-103` in this slice? | **Yes** — it is the file whose reasoning the entire read-only posture rests on, and the repo keeps a committed false-comment register. Folded into Phase 1 at no extra cost. |

## 14. Downstream handoff notes

- **Coordinator:** Phase 0 and Phase 1 start together. Phase 2 is 3-wide. Phase 3 is 2-wide. Phase 4 is 1. Peak concurrency 3.
- **TDD focus:** cases (a), (c), (d) are the ones that must keep the security argument true; write them first and confirm (b) fails red before the predicate exists.
- **Programmer architecture audit focus:** INV-002 (check order), INV-005 (single classification path), INV-006 (no secret in the probe).
- **Open risks:**
  - **R-1.** The write-override predicate is one condition inside a function whose own doc calls its ordering deliberate (`trust.ts:248-257`). Ordering churn there is how the gate quietly stops meaning what its header says. The header paragraph for R3 must be edited in the same commit as the predicate.
  - **R-2.** `tsc` does not check test files; a required field addition will not surface as a compile error in fixtures.
  - **R-3.** Task #30 (PUT silently discards an array `allowedToolNames`) is a live logged bug on the same route. The new field travels the same `asStringField` path (`put.ts:12-14,79`) and would inherit it. Out of scope to fix here — but the new field must not make it worse, and the two should land in a known order.
  - **R-4.** The probe makes the web server process **spawn a child process** for a `stdio` connection. Outbound HTTP is not new there (the OAuth token exchange already does it), but spawning is. Its timeout and its `finally`-close are the whole safety story; a leaked stdio child in the web server is a worse failure than in the daemon, which at least has `bootstrap.ts:180-185`'s catch-and-close. Consider restricting the v1 probe to `streamable_http` rows and reporting "probe is not available for local-command servers yet" for `stdio` — the motivating case (Higgsfield) is hosted, and it removes the spawn risk entirely. **Owner decision D-7.**
