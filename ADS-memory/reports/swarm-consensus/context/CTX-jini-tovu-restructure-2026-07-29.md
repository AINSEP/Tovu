# Swarm Consensus Context Packet

**Date:** 2026-07-29
**Slug:** jini-tovu-restructure
**Project Type:** brownfield
**Question:** Narrowly a server/composition-layer question: how should Tovu's server process and Jini's server process be aligned — who should be the "host" process, and how should Jini expose its route/feature surface to a host — given Jini must remain a reusable engine across at least three separate downstream products (Tovu, Open Marketing, Zana), not just Tovu? This is NOT a request to redesign either product's application layer as a whole.
**Intended Consumers:** Primary model (Claude Sonnet 5) + peer CLIs (Gemini 3.1 Pro High, Gemini 3.6 Flash High via `agy`, Codex GPT-5.6-sol xhigh) + two added in-host Claude subagent participants (fresh Sonnet 5, fresh Opus 5) — all six as blind, independent Round 1 participants

## Goal

**This is narrowly a server/composition-layer question — not a request to redesign Tovu's or Jini's applications as a whole.** Produce a resolved recommendation on two coupled decisions, and nothing beyond them:

1. **Host topology** — should Jini's process become the "host" (with Tovu's ~50 non-AI CMS routes riding in as an extension or successor mechanism), should Tovu remain the host with a tighter/different Jini integration than today, or is there a third shape? Must explicitly reason about two hard constraints already discovered in production use (see Architecture Summary) and about Jini's obligation to serve Open Marketing and Zana as well as Tovu.
2. **Buffet-style route/feature activation** — a concrete design for how a host picks which of Jini's route/feature families to activate, with sensible defaults, so hosts stop hand-rolling registrar calls one at a time. The user's own framing: "I want to use the Jini engine for as much as possible but it should be a buffet of stuff I can pick PLUS defaults that make it easy to wire stuff up from, rather than us hand-rolling" — and, on reflection when asked to name what's missing from this framing, added: "I want to make sure this is modular and flexible enough to change back if something is wrong with the architecture. Remember Jini has to be a highly flexible reusable engine for Open Marketing, Zana (a bolt.diy and open-lovable-like system). It should be like Spring Boot right, where we just pick and choose what we want (but don't over-index on Spring Boot as it's just an example)."

## Scope

**In scope:** host-process topology; Jini's route/feature activation config surface; how Tovu's daemon-child integration specifically should change (if at all) to use it; reversibility/modularity of whatever is chosen; how the same design would (or wouldn't) serve Open Marketing and Zana at a server/composition level (not their full product design).

**Explicitly out of scope — do not produce recommendations, required sections, or implementation outlines for any of these; mention only in passing if directly load-bearing for the two decisions above:** migration/rollout planning for Tovu's whole product; Tovu's multi-workspace data model; unifying Tovu's session-cookie auth with Jini's `Principal`/`ToolPolicy` model as its own project; testing/CI strategy; re-litigating whether Tovu should use Jini at all (already decided, ADR-049); the unrelated, already-isolated `claude` CLI env-var "Not logged in" bug; in-page DOM agent control (`@jini-ai/agentic`'s `page.*` verbs — explicitly deferred per ADR-049 Decision 6). If the daemon's own request-level auth gap (see below) is relevant to the host-topology answer, a brief note is fine — a full auth-model redesign is not being asked for.

## Architecture Summary

### Jini (`/Users/la/Programming/Jini`), published as `@jini-ai/*` on npm

Layered packages: `protocol` (wire vocabulary) → `core` (`ToolRegistry` + DI kernel) → `daemon` (`RunLifecycle`, durable `EventLog`, `ToolExecutor`, `AgentExecutor`, `FrontendSessionRegistry`) → `http-kit` (formerly `http`), `cli`, `mcp`, `sidecar` (transport bindings) → `server` (formerly `node-host`; Node/Express composition preset) → `agent-runtime` (24 coding-agent CLI adapters) → `agentic` (DOM/frontend capability vocabulary) → `chat-core`/`chat-react`/`renderers-react`/`ui` (chat UI).

The one existing "host preset," `createLocalNodeDaemon` (`packages/server/src/create-local-node-daemon.ts:430-871`), boots its **own** Express app and TCP listener, and unconditionally wires 13-14 route/feature families in this order (verified against source, lines 748-799): `installRouteRegistrationGuard` → `registerHealthRoutes` → `express.json()` → `registerApiBearerAuthMiddleware` → `registerApiOriginGuardMiddleware` → `registerRunRoutes` → `registerAgentRoutes` → `registerHostToolsRoutes` → `registerModelProxyRoutes` → `registerActiveContextRoutes` → `registerTerminalRoutes` (real `node-pty` shell spawn, plus registers `jini.terminal.create` into the internal zero-config `ToolRegistry` at line 594) → `registerDaemonDbRoutes` (raw sqlite inspect/verify/vacuum, plus registers `daemon.db.*` into the same registry at 605-607) → `registerToolCatalogRoutes` → `registerDelegatedToolRoutes` (the door onto that SAME zero-config `ToolRegistry` — this matters, see the Route-vs-Tool Gap Warning below) → `registerConnectorsRoutes` (5 provider slots, 503 until configured) → `registerResearchRoutes` → `registerXaiRoutes` (OAuth loopback) → **`config.httpExtensions` loop** (a host's own routes bolt on here: `(app, {adapter, lifecycle: runLifecycle, dataDir}) => void`) → `mountPackHttp` → `registerDaemonStatusRoutes`.

`CreateLocalNodeDaemonConfig`'s full option list (`create-local-node-daemon.ts:247-361`) has **no flag that disables any single route family** (the one partial exception: `discoveryFile: false` does disable the discovery-record write specifically) — every other option customizes a feature that is already being mounted (which agent detector, which workspace-root resolver, which token env var name, a `bindings` callback for DI extension, `toolRegistrations` to add host tools into the *same* internal registry the preset's own gated tools use, `resolveDelegatedPrincipal`, etc.), none gates whether a feature is mounted at all.

**Route-vs-Tool Gap Warning (a real design trap, not just a naming nit):** a "feature" here is not just a route family — it is routes **plus** `ToolRegistration`s **plus** DI deps. `registerTerminalRoutes`/`registerDaemonDbRoutes` mount HTTP endpoints, but `createTerminalToolRegistrations`/`createDaemonDbToolRegistrations` separately register `jini.terminal.create`/`daemon.db.*` into the shared `zeroConfigToolRegistry` (lines 594, 605-607) — reachable via `registerDelegatedToolRoutes`/`/api/delegated-tool-calls`, which is **always** mounted. A naive buffet flag that only gates the route registrar call (e.g. `terminal: false`) would close the front door while the same capability stays reachable through the side door. Any buffet-config proposal must account for this — it's the same class of problem as Jini's own admitted anti-pattern ("deny-by-default is convention, not kernel-enforced").

`Users-la-Programming-Jini-packages` is indexed in the local codebase-memory graph (17,475 nodes / 48,799 edges as of this session) if a participant with graph-tool access wants structural queries instead of raw reads.

### Tovu (`/Users/la/Programming/Tovu`), headless CMS

Currently **two OS processes**:

1. **Main process** (`src/index.ts` → `src/server/app.ts`) — Tovu's own Express app, ~50 admin routes across `server/modules/*.ts` (content-types, entries, media, members, roles, users, taxonomy, redirects, seo, newsletter, forms, widgets, database, recovery, integrations, comments, analytics, workspace, settings...), session-cookie auth (`requireAdminSession`). `src/index.ts:118-159`: after `app.listen()`'s callback fires, explicitly awaits `Promise.all([identityReady, settingsReady, seoReady, commentsReady, commentsSettingsReady])` (independent, un-awaited side effects of `createSqliteRouteDeps()`) before calling `spawnAgentDaemon()`, which `child_process.spawn`s the daemon below with `stdio:"inherit"` and the full parent env, killed on parent exit. `server/modules/assistant.ts` (91-108) is a **thin authenticated reverse proxy only**: `requireAdminSession` in front of `/api/runs*`/`/api/agents*`; `POST /api/runs` decodes the client's `contextRef`, stamps the session-authenticated principal's id into it, re-encodes, forwards; every other route is `proxyPassthrough`; `forwardToAgentDaemon` (`assistant.ts:49-64`) does a server-to-server `fetch()` that sets `Content-Type` only — it does **not** forward the browser's `Origin` header.

2. **Agent daemon** (`src/assistant/agent-daemon-server.ts`, new, ~135 lines) — standalone `express()`, own `express.json()`, listens on `127.0.0.1:<JINI_AGENT_DAEMON_PORT, default 4319>`. Opens its **own second connection** to the same `content.db` SQLite file (`createSqliteRouteDeps()`, WAL-mode-safe, verified working). Composes exactly **3 of Jini's ~16 route families** directly from `@jini-ai/http`, skipping `createLocalNodeDaemon` entirely: `registerRunRoutes`, `registerAgentRoutes`, `registerDelegatedToolRoutes`. No bearer-auth or origin-guard middleware call. `principalByRunId` Map (filled in `onStarted`, read by `resolvePrincipal`) fails closed — throws on an untracked `runId` rather than fabricating a principal (a real bug caught and fixed earlier in this integration).

`Users-la-Programming-Tovu-src` is indexed in the local codebase-memory graph (12,524 nodes / 30,423 edges as of this session, freshly re-indexed to include `src/assistant/`).

### Two hard constraints already discovered in production use (from `/Users/la/Programming/Jini/tovu-learnings.md`, read in full — do not re-derive, verify against the doc)

- **§1a — `ToolExecutor`/`RunLifecycle` co-location is mandatory, not a design choice.** `@jini-ai/daemon`'s `DelegatedToolBridge.execute()` calls `lifecycle.emit()` directly (`delegated-tool-bridge.ts:91,108,119`) to record `tool_use`/`tool_result` into the run's own event log — the same log a client's SSE subscription watches. There is **no HTTP endpoint for remote event injection**. `ToolExecutor`/`ToolRegistry`/`registerDelegatedToolRoutes` **must** live in the same process as the real `RunLifecycle`/`EventLog` instance a run is using, or the chat UI silently never shows tool calls at all (no error — just nothing).
- **§1b — first-boot DB-seeding race across two processes sharing one sqlite file.** If two processes each independently call a host's own DB-composition entrypoint that does first-boot seeding as a fire-and-forget side effect, both can race the same `INSERT` and one loses with `UNIQUE constraint failed`. Reproduced directly, twice. Fixed in Tovu today by explicitly awaiting the host's own readiness promises before spawning the second process — a sequencing discipline any future topology must preserve or re-solve.
- **§1c — no selective route activation exists (added to `tovu-learnings.md` this session, at the user's request)** — `createLocalNodeDaemon` is all-16-or-none; a host that wants only a handful has no supported path except abandoning the preset entirely, which is what Tovu's daemon does today, re-deriving from scratch everything the preset would have given for free.
- **§2** — `@jini-ai/http`'s route registrars hardcode fixed, non-prefixable paths (`/api/runs`, `/api/agents`, `/api/delegated-tool-calls`) with no auth-hook slot in their deps shapes; a host with its own auth has to apply `app.use(exact-fixed-path, hostAuthMiddleware)` before calling the registrar, coupling host auth wiring to Jini's internal path constants.

### Confirmed this session: the browser-origin risk from an earlier handoff cannot be reached the way it originally was — but a more serious, previously-unflagged gap sits right next to it

Every Jini route mounted via `mountJsonRoute` with `requireSameOrigin: true` (4 routes, confirmed via `grep -n requireSameOrigin` in `packages/http-kit/src/{runs,agents,delegated-tools}.ts`: `runStartRoute`, `runCancelRoute`, the `agents` rescan route, `delegatedToolExecuteRoute`) calls `guardSameOrigin` → `isLocalSameOrigin` (`packages/http-kit/src/origin-validation.ts:172-198`), which reads `JINI_ALLOWED_ORIGINS` via `configuredAllowedOrigins(env)`. `grep -rn "JINI_ALLOWED_ORIGINS\|TOVU_ADMIN_DEV_PROXY_URL\|ensureDevProxyOriginAllowed" Tovu/src` returns **zero** hits — that env-derivation genuinely is not present in Tovu's code. Tovu's proxy's `forwardToAgentDaemon` never forwards the browser's `Origin` header, so `isLocalSameOrigin`'s no-Origin-header branch runs, which checks the request's `Host` header against the daemon's own bind host:port — which always matches, since Tovu's own `fetch()` targets the daemon directly. So the browser's real cross-origin `Origin` (`http://localhost:5173` in dev) never reaches the daemon and cannot trigger the old 403.

**But — verified by pre-dispatch review — this means the same-origin guard is effectively neutralized for this path, not satisfied.** Any local process that can reach `127.0.0.1:<JINI_AGENT_DAEMON_PORT>` directly (no Origin header, matching Host header) passes `isLocalSameOrigin` the same way Tovu's own proxy does. Combined with the fact that Tovu's daemon (`agent-daemon-server.ts`) calls **none** of `registerApiBearerAuthMiddleware`/`registerApiOriginGuardMiddleware`, the daemon's only real protection is binding to loopback (`127.0.0.1`) — any other local process (or a compromised dependency, or another agent/tool running on the same machine) could `POST /api/runs` with a forged `contextRef.principalId` and start a real agent run, or hit `/api/delegated-tool-calls` directly, with **no bearer token and no origin check actually gating it**. This is directly relevant to the auth-unification question below — peers should weigh in on whether the recommended topology should add real request-level auth on this port, not just rely on loopback binding. (Static-read confidence on the mechanism; not yet re-verified with a live dev-mode smoke test or an actual same-machine attack attempt.)

## Relevant Files And Artifacts

| Path | Why it matters |
|---|---|
| `/Users/la/Programming/Jini/tovu-learnings.md` | Canonical friction log from integrating the two — §1, 1a, 1b, 1c, 2, 3, 9 are load-bearing. Read in full. |
| `/Users/la/Programming/Jini/packages/server/src/create-local-node-daemon.ts` | The one existing host preset — full composition order, `CreateLocalNodeDaemonConfig`'s option surface, the `httpExtensions` seam. |
| `/Users/la/Programming/Jini/packages/http-kit/src/{runs,agents,delegated-tools,adapter,origin,origin-validation}.ts` | Individual route registrars, `mountJsonRoute`, same-origin guard mechanics. |
| `/Users/la/Programming/Tovu/src/index.ts`, `src/server/app.ts`, `src/server/modules/assistant.ts` | Tovu's main process, boot ordering, the thin-proxy module. |
| `/Users/la/Programming/Tovu/src/assistant/agent-daemon-server.ts`, `tool-registrations.ts`, `mcp-injection.ts`, `agents.ts` | The daemon child process — what it hand-composes today. |
| `/Users/la/Programming/Tovu/ADS-memory/reports/architecture/ADR-049-assistant-adopts-jini-kit-supersedes-copilotkit-agui.md` | Governance record for "adopt Jini's kit" — describes the superseded first (in-process) architecture; not yet updated for the daemon-process-split shape. Explicitly not audited (`/audit-work`/`/debate`) yet per its own Consequences section. |
| `/Users/la/Programming/OSS-Repos/AI-Capabilities/{bolt.diy,directus,ghost,jini,medusa,novamira,open-saas,payload,strapi,wordpress}.md` and matching `.metrics.json` | 10-product AI-capability research corpus, including one report **on Jini itself** (what Jini should borrow from the other 9). Canonical, synthesized, multi-pass-attributed. Read these first. Note `jini.metrics.json antipatterns`: "Built HTTP route surfaces exported but not wired into the reference daemon composition" — `registerMemoryRoutes`/`registerRoutineRoutes`/`registerMediaRoutes` are exported from `http/src/index.ts` but absent from `create-local-node-daemon.ts`'s registrar calls. This is corpus evidence, from Jini's own self-analysis, that the current preset already under- *and* over-exposes relative to what a host might want — directly relevant to the buffet-config question. |
| `/Users/la/Programming/OSS-Repos/AI-Capabilities/passes/<repo>/` | Raw, blind, per-pass analysis underlying each canonical report — available if a participant wants primary evidence for a specific claim rather than the synthesized summary. Not required reading for every claim; use when verifying something load-bearing. |
| `/Users/la/Programming/OSS-Repos/AI-Capabilities/_prep/{AGENT-BRIEF-V3.md,REPORT-TEMPLATE.md,SYNTHESIS-BRIEF.md}` | Corpus methodology — explains section numbering (§10 "What is borrowable", §11 "Anti-patterns", etc.) and attribution tags (`[p1]`, `[p3-opus]`, ...) used in the per-repo reports. |
| `/Users/la/Programming/Tovu/AI-Dev-Shop/AGENTS.md` | This repo's own governing agent instructions — not architecturally relevant to the Jini/Tovu question, background only. |

## Constraints

- **Jini must remain a reusable, embeddable engine across at least three separate downstream products**: Tovu (headless CMS), Open Marketing (`/Users/la/Programming/Open-Marketing`), and Zana (a bolt.diy/open-lovable-like AI app-builder product — no local checkout path given). A design that is optimal for Tovu alone but hard to reuse or reverse for the other two is a red flag. Whatever is recommended must be justified against this constraint explicitly, not just against Tovu's needs.
- **Reversibility** — the user wants confidence that if the chosen topology turns out wrong, it can be changed back without a rewrite. Modularity and an escape hatch matter as much as the immediate design.
- **The two hard constraints above (§1a co-location, §1b boot-ordering) must be respected by any recommended topology**, or the recommendation must explicitly state how it re-solves them.
- **No embedded coding-agent CLI spawn from Tovu's own main process** — firm architectural constraint from an earlier correction this session (ADR-049), not just a preference. Any recommendation must preserve "Tovu never spawns a coding-agent CLI itself" or explicitly argue for revisiting that constraint.
- **Not required, but worth a brief mention if relevant:** the daemon's own routes currently have no bearer-token or origin check of their own, relying only on loopback binding (see finding below) — if the recommended topology naturally changes that answer, say so in a sentence; a full auth-model redesign is out of scope for this round.

## Provenance Note — Rename Applied Mid-Session

The repo owner renamed Jini's `packages/node-host` to `packages/server` and `packages/http` to
`packages/http-kit` while this packet was being prepared (confirmed applied via `ls
/Users/la/Programming/Jini/packages/` — `node-host`/`http` no longer exist; `server`/`http-kit` do).
This packet has been updated to use the **new** paths throughout (`packages/server/src/...`,
`packages/http-kit/src/...`). Internal file names inside those packages are unchanged
(`create-local-node-daemon.ts`, `runs.ts`, `agents.ts`, `delegated-tools.ts`, `origin.ts`,
`origin-validation.ts`, `adapter.ts` all still exist under their new parent directories, verified by
line count match against the pre-rename read). Any re-architecture proposal should use the current
package names (`server`, `http-kit`), not `node-host`/`http`.

## Known Unknowns

- Whether Zana or Open Marketing have any concrete, already-written requirements beyond "AI app-builder like bolt.diy/open-lovable" and "marketing product" respectively — none were supplied this session; reason from the stated category/analogy, not fabricated specifics.
- Whether `@jini-ai/server`'s `createLocalNodeDaemon` is meant to be the *only* host-composition surface Jini ever ships, or whether a second preset (e.g. `mountLocalKernel(app, config)`, suggested in `tovu-learnings.md` §1) is already planned — treat as an open design question, not a given.
- Whether the browser-origin finding above (the specific old failure mode is no longer reachable, but the underlying same-origin guard is neutralized rather than satisfied) has been reproduced with a live dev-mode browser test or an actual same-machine attack attempt — it has not, as of this packet.

## Source-of-Truth Inputs

| Source | Notes |
|---|---|
| `tovu-learnings.md` | Primary friction log — read in full before answering. |
| `ADR-049` | Governance record, superseded-description caveat noted above. |
| AI-Capabilities corpus (10x `.md`/`.metrics.json` + `_prep/`) | Cross-product evidence; cite `product + finding-type (borrowable/antipattern) + file:line` for any corpus-derived claim, per this corpus's own attribution discipline. |
| Direct source reads this session (cited inline above with file:line) | `create-local-node-daemon.ts`, `agent-daemon-server.ts`, `assistant.ts`, `index.ts`, `origin-validation.ts`, `origin.ts`, `adapter.ts`, `runs.ts`/`agents.ts`/`delegated-tools.ts` | Structural facts already verified — a participant may re-verify independently but should not need to re-derive from zero. |

## Shared Prompt Payload

```text
Repo paths (read these directly — do not answer from this summary alone):
- Tovu: /Users/la/Programming/Tovu (headless CMS; relevant: src/index.ts, src/server/app.ts,
  src/server/modules/assistant.ts, src/assistant/*)
- Jini: /Users/la/Programming/Jini (relevant: packages/server/src/create-local-node-daemon.ts,
  packages/http-kit/src/{runs,agents,delegated-tools,origin,origin-validation,adapter}.ts,
  packages/daemon/src/delegated-tool-bridge.ts)
- Jini's own friction log: /Users/la/Programming/Jini/tovu-learnings.md (read in full)
- AI-Capabilities research corpus: /Users/la/Programming/OSS-Repos/AI-Capabilities/ — 10 canonical
  <repo>.md + <repo>.metrics.json files (bolt.diy, directus, ghost, jini, medusa, novamira,
  open-saas, payload, strapi, wordpress) plus raw per-pass evidence under passes/<repo>/ and
  methodology under _prep/ (read passes/ only if you need primary evidence for a specific claim
  beyond the synthesized summary)

Need: this is narrowly a server/composition-layer question, not a request to redesign either
product as a whole. Tovu (a headless CMS) currently integrates Jini (a separate, published
AI-agent-execution engine) via two OS processes: Tovu's own ~50-route admin server, plus a small
hand-composed daemon child process that picks exactly 3 of Jini's 13-14 available route/feature
families and skips Jini's one existing all-in-one host preset (createLocalNodeDaemon) entirely.
Jini itself must remain a reusable, embeddable engine for at least three separate products — Tovu,
Open Marketing (a marketing product), and Zana (a bolt.diy/open-lovable-like AI app-builder) — not
something optimized for Tovu alone. We need a server-architecture design that resolves, together,
ONLY: (a) who (if anyone in particular) should be the "host" process for the AI/agent-execution
surface, and whether that answer should even be uniform across all three downstream products; and
(b) whether and how a host should be able to select which of Jini's route/feature families are
active, versus hand-rolling registrar calls or inheriting everything unconditionally — modular and
reversible enough that if a choice turns out wrong, it can be changed back without a full rewrite.

Constraints: must respect two already-discovered hard technical constraints (ToolExecutor/
RunLifecycle must co-locate in one process per run — no remote event injection exists in Jini
today; first-boot DB-seeding races if two processes independently seed the same database without
sequencing). Must preserve "Tovu never spawns a coding-agent CLI directly" (a firm constraint from
an earlier correction, not just a preference) or explicitly argue for revisiting it. Also account
for the Route-vs-Tool Gap: a "feature" in Jini's current preset is routes PLUS ToolRegistrations
PLUS DI deps, not just a route family — e.g. disabling registerTerminalRoutes alone would not stop
the terminal tool from being reachable via the always-mounted delegated-tool-calls route, since the
tool registration and the route registration are currently separate mounting steps into a shared
registry. Do NOT produce separate deliverables on migration/rollout planning, Tovu's multi-workspace
data model, unifying Tovu's and Jini's auth models as a project of their own, or testing/CI strategy
— those are explicitly out of scope for this round; a one-sentence aside is fine if directly
load-bearing for the host-topology or route-activation answer, nothing more.

Options to evaluate (evaluate all of these adversarially — none is the presumed answer; each has
genuine costs, not just benefits):
A. Jini's process becomes the literal host: Tovu's ~50 non-AI CMS routes ride in as an
   httpExtension (or a successor mechanism) on Jini's own createLocalNodeDaemon-composed process.
B. Tovu remains the host process; the Jini integration gets tighter/different than today's
   hand-picked-3-registrars daemon child (e.g. in-process composition, a different process
   boundary, or a different mounting mechanism) but Tovu's Express app is still the outer shell.
C. Neither Jini nor the product is fixed as host; instead Jini ships a documented, opt-in
   composition surface (a caller-supplied Express app plus a config that selects which
   routes/tools/deps are active) that different consumers can use to build either shape A or B for
   themselves, chosen per-consumer rather than mandated once for all three products.
D. Something else — a topology not described by A, B, or C.

Adversarial task: identify the best design among these (or a genuine variant), and for EVERY
option — including the one you end up favoring — state its concrete failure modes and hidden costs,
not just its benefits. Reject weak options with specific reasoning, not just preference, and explain
what evidence would change your answer. For the route/feature-activation design specifically,
propose a concrete config shape (what's default-on vs. opt-in, and why, and how it avoids the
Route-vs-Tool Gap above) that a real Jini PR could implement — evaluated against ALL THREE
downstream products (Tovu, Open Marketing, Zana), not just Tovu's current shape. Cite
AI-Capabilities corpus findings (product + borrowable/antipattern + file:line, read directly from
the files at the path above) wherever they inform a specific recommendation, not as generic
architecture-reasoning color.

Is there a strong option, shift, or decomposition not listed above that you believe is better or
that the framing has missed? If yes, describe it and explain why it's stronger than the presented
options.

Blind Spots (required): name (a) an option this packet did not list, (b) a question we should be
asking but aren't (a reframe, not just a new answer to the stated questions), (c) the single
assumption baked into this framing that is most likely to be wrong, and why.

Output format required: a clearly labeled position on Options A-D (or your own D-variant) with
explicit failure modes/hidden costs for each option considered, explicit citations for every
corpus-derived claim, and the required Blind Spots section. In addition, produce a genuine
re-architecture proposal, not just an abstract position: a concrete implementation outline covering
(1) the exact new/changed files and functions in Jini (e.g. what `mountJiniKernel`-style primitive,
if any, you propose, with a real TypeScript interface sketch for its config shape), (2) exactly what
changes in Tovu's `src/index.ts`/`src/server/app.ts`/`src/assistant/agent-daemon-server.ts` to adopt
it, and (3) sample code or pseudocode for the route/tool-activation mechanism specifically (not
prose alone) — this is deliberately asked of every participant in this round, independently, so
Round 2 can adversarially critique concrete proposals against each other rather than abstract
positions. Independent proposals first — do not coordinate with or reference any other
participant's answer, since none of you can see one another's response in this round.
```
