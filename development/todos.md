# Todos — Tovu (website product)

> **Scope.** This is the **Tovu website-product** backlog (CMS runtime: kernel,
> data layer, content model, theme/plugin systems, admin UI, SEO/AEO/GEO plugins,
> WordPress/Payload/Directus/Ghost parity). It moved here in the 2026-07-06 repo
> split. Cross-references to `src/…` and `apps/…` now refer to code in **this
> repository**; they are no longer merely Tovu-Runner port candidates.
> Operator-shell / media-generation / agent-detection / the operator chat profile
> remain tracked in **Tovu-Runner**.
>
> `START-HERE.md` remains the architecture orientation document, but its greenfield
> status language is historical. Verify every backlog claim against current source
> before treating it as open.

**Reference (added 2026-07-14):** competitive positioning vs. WordPress/Strapi/Directus/Payload/Ghost
(where Tovu is ahead vs. genuinely behind) + an agentic-control-plane/MCP-WebMCP-A2UI-MCP-UI readiness
gap analysis, written right after ADR-041/043/044/045 (Storage/Collections/Categories&Tags/Backups-Recovery)
were accepted. Informal, not debated/audited — a reference to revisit during future parity work and
before building the eventual agent tool catalog. See
`ADS-memory/reports/strategy/20260714-competitive-positioning-and-agentic-mcp-readiness.md`.

---

## 🎯 DIRECTION, owner call 2026-08-29 — Tovu-Runner becomes an EXTERNAL MCP SERVER to Tovu

**The problem this solves.** Today an operator embedded in Tovu-Runner sees **two separate assistant
chats**: Runner's own fleet chat (owns projects — list/create/start/stop/delete) and Tovu's admin
assistant (owns one site's content). They cannot see each other. Tonight's `TOVU_ADMIN_ASSISTANT=off`
work addressed that by *killing* one of the two chats. **The owner's decision is to merge them
instead**: expose Runner's fleet capabilities to Tovu's assistant over MCP, so there is ONE chat that
reasons about both the fleet and the site.

**Why this is tractable — the pieces already exist, verified 2026-08-29:**
- **Runner already ships an MCP server.** `Tovu-Runner/src/main/runner-mcp-server.ts` is a standalone
  **stdio** MCP process; `runner-mcp-bridge.ts` exposes `runner.*` tools (`fleet.status`,
  `project.list`, `create_site`, `project.start/stop/restart/open/delete`, `navigate`) over a
  loopback HTTP bridge, bearer-token scoped per run. It already has a win32 `.cmd` launcher branch
  (`runner-mcp-bridge.ts:118`).
- **Tovu already federates external MCP servers.** `agent-daemon-server.ts`'s `start()` calls
  `attachFederatedMcpTools` unconditionally, with OAuth device flow
  (`createExternalMcpOAuthService`) and admission reporting (`routes/external-mcp/admissions.ts`).
  A stdio adapter exists: `assistant/mcp-federation/adapter.stdio.ts`.
- So this is plausibly **configuration + trust plumbing**, not new protocol work. Confirm before
  estimating — see the caution below.

**Open questions to settle before building:**
1. **Scoping/authority — the crux.** Runner's tools are deliberately fleet-wide under a single
   `RUNNER_OPERATOR_PRINCIPAL` ("one operator, not N users"); its agent prompt says "You own the
   FLEET, not the contents of any site." Tovu's assistant is **site-scoped** (`workspaceId` fixed at
   boot). Handing fleet-wide destructive tools (`project.delete`) to a site-scoped assistant needs an
   explicit authorization decision, not just a connection.
2. **Direction of trust.** Runner spawns Tovu. Making Tovu a *client* of Runner inverts the usual
   direction — work out how the child authenticates to the parent, and what stops one site's
   assistant acting on another site.
3. **What happens to Runner's own chat?** Removed entirely, or kept as an operator surface? If
   removed, `runner-daemon.ts`/`runner-agent-prompt.ts` and the fleet-chat UI become deletable.
4. **Does this obsolete `TOVU_ADMIN_ASSISTANT=off`?** That flag was built 2026-08-29 to solve the
   two-chats problem by disabling one. If merging succeeds its original motivation is gone — though
   it may still be wanted as a plain security/posture switch. Decide rather than keeping both by
   default.
5. **Per-site vs per-fleet daemon.** Each site's daemon would separately federate Runner's MCP
   server — N daemons, N connections to one Runner. Check the bridge tolerates that.

**Caution carried from tonight:** size this from the **call sites**, not from file sizes — an
inflated estimate on this repo already manufactured an unnecessary redesign once.

---

## ✅ DONE, 2026-08-29 — SonarQube set up in `development/sonarqube/`

The parked evaluation question is answered and built: `development/sonarqube/README.md` covers the
decisions (self-hosted Community over SonarCloud — this repo is private; reporting not blocking —
same reasoning as `check:architecture`'s red status; what it adds over `code-metrics.py` honestly,
which is less than a generic pitch would claim) plus a `docker-compose.yml` + `scan.sh` local-run
path. Nothing was started (Docker stays off until asked). One correction made along the way: the
real hard-enforced complexity ceiling verified in `eslint.config.mjs` is **9**, not 10 as stated
above — the "10" here was stale.

---

## ✅ FIXED 2026-08-30 (was: 🐛 BUG, filed 2026-08-29) — `tovu serve` never starts an agent daemon
**Verified fixed.** `apps/website/src/cli/commands/serve.ts:178` now calls `startAssistantDaemon(...)`
with `registerProcessSignalHandlers: false`, and per-instance port resolution lives in
`server/runtime/lifecycle/agent-daemon-port.ts` (whose doc names the exact fixed-4319 collision
described below). Shipped in commit `6da030b1`. Original report follows.

**Found while running Tovu-Runner against a real instance**, verified directly (not just reported):
`startAssistantDaemon` only runs from `apps/website/src/index.ts`'s `main()` — the same `main()` that
mints the daemon's auth token. `tovu serve` (the packaged CLI path, what Runner actually spawns) runs
neither. Confirmed on a live Runner process (PID 41725): zero child processes.

The website proxies `/api/agents` to `AGENT_DAEMON_URL`, which defaults to a **fixed**
`http://127.0.0.1:4319` — there is no per-instance port. A running Runner instance was found silently
proxying its assistant traffic to a *different*, unrelated Tovu dev instance's daemon (`npm run dev` on
:3000, daemon on the same fixed :4319). It 401'd only because that other daemon minted its own token and
rejected Runner's — **had the tokens happened to match, Runner's admin assistant would have silently
executed tools against the wrong site's data**, not errored.

**Why an env var alone can't fix it**: the daemon port is hardcoded to 4319 on both ends (the daemon
that binds it, and the website that proxies to it). Runner's whole model is one-project-per-process,
but daemons are a shared, unscoped singleton port — three concurrent Runner projects would all collide
on the same daemon. This needs a **Tovu-side fix**: `tovu serve` must start its own daemon, on a
per-instance port (derived from the site dir or an assigned port, not a fixed default).

**Priority note from the owner (2026-08-29): logged here first, comes after the architecture-debate
fixes already in flight** (see `ADS-memory/reports/swarm-consensus/runs/2026-08-28T2358-apps-website-architecture-debate-consensus-report.md`).
Related memory: `reference_tovu_serve_thinner_than_npm_start` (this bug directly answers that memory's
open question — "whether this divergence is deliberate or a gap, nobody has checked" — it is a real gap).

---

## ✅ RESOLVED (2026-08-18) — Retrofit the assistant transport onto AG-UI + CopilotKit

**Superseding ADR written**: `ADS-memory/reports/architecture/ADR-059-assistant-transport-ag-ui-canary.md`.
Scope narrowed from this entry's original sketch: this slice stays fully hand-rolled (no
`@ag-ui/core`/`client`/`encoder`, no `@copilotkit/*`, no parallel rendering component —
`AssistantDock`'s existing rendering is reused). The CopilotKit headless-mode rendering swap
(step 4 below) is explicitly deferred pending a real licensing conversation — `useCopilotChatHeadless_c`
turned out to be a paid Early Access Premium feature. See the ADR for the full decision and consequences.

**Original entry, kept for context below.**

**Owner call, overriding ADR-049's conclusion.** ADR-049 (Accepted, 2026-07-28) explicitly rejected
CopilotKit + AG-UI (ADR-013's original 2026-07-05 choice) in favor of building on `@jini-ai/chat-react`
+ `@jini-ai/daemon`'s own hand-rolled event vocabulary, reasoning that AG-UI would be "duplicate work
against a real, tested, versioned kit already one `npm install` away." **Owner has now decided the
opposite, explicitly**: AG-UI is a rock-solid, stable **public** protocol with a real ecosystem
(CopilotKit's React client, framework integrations, a growing tool list) — worth having over a
hand-rolled one, even at the cost of some duplicate plumbing. This entry supersedes ADR-049's
transport conclusion; ADR-013's original choice was directionally right, just too early.

**What exists today that this retrofits:**
- `apps/admin/src/lib/assistant-transport.ts` — Tovu's current hand-rolled SSE transport. Implements
  `ChatTransport` (from `@jini-ai/chat-react`) over two paths (Local CLI via `@jini-ai/protocol`'s
  `RunProtocolEvent`; BYOK via a raw held-open POST), translating both into `chat-core`'s `AgentEvent`
  vocabulary (`text_delta`, `tool_use`, `tool_result`, `usage`, plus two custom generative-UI channels,
  `mcp-ui` and `a2ui`).
- **Correction already confirmed (2026-08-17)**: Tovu's `a2ui` channel is **not** AG-UI-related despite
  the similar name — it's Jini's own unrelated generative-UI protocol (`@jini-ai/agentic`'s
  `agentic/src/a2ui`). No accidental overlap to reconcile; `mcp-ui`/`a2ui` are a separate concern from
  this retrofit and need their own explicit decision about whether they ride alongside AG-UI or stay
  Jini-native.

**Approach (owner's own framing, 2026-08-17): port-and-adapter, not a hard cutover.**
1. Define a transport-neutral port (if `ChatTransport` from `@jini-ai/chat-react` isn't already narrow
   enough, wrap it) so the wire protocol is swappable without touching `ChatPane`/UI code.
2. Build an AG-UI adapter behind that port: translate Tovu's existing backend events
   (`RunProtocolEvent`/`AgentEvent`) into `@ag-ui/core`'s event vocabulary (`RUN_STARTED`,
   `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`/`ARGS`/`END`, etc.), OR have the backend emit AG-UI
   natively if that's cleaner once scoped.
3. Stand it up as a **canary path** — selectable/flagged, running alongside the existing transport, not
   replacing it outright.
4. Once proven, the frontend can drop the hand-rolled `AssistantDock` rendering in favor of CopilotKit's
   **headless mode** (`useCopilotChatHeadless_c` — full behavior reuse: streaming, generative UI,
   tool-call rendering, human-in-the-loop interrupts; zero UI opinions, so Tovu keeps its own look).
5. Keep the old transport intact until the canary is trusted — explicit fallback, not a one-way door.

**Before real implementation work starts:** this reverses an Accepted ADR, which per this repo's own
governance convention (see the "Canonical Architecture Decisions" section below) should get its own
ADR superseding ADR-049's transport decision, not just a todo checkbox — even ADR-049 itself flagged
that it skipped `/debate`/`/audit-work` and recommended running that before implementation proceeds
past a first slice. That bar applies at least as much here.

**Ecosystem reference** (found 2026-08-17): `@ag-ui/core` (protocol package), **CopilotKit**
(flagship React client, built AG-UI), **AG-UI Dojo** (reference demo app), **create-ag-ui-app** (CLI
scaffold). Framework-side integrations (LangGraph, CrewAI, Mastra, etc.) aren't relevant here — Tovu
launches CLI agents directly, not one of those frameworks.

**Stale cross-reference to fix when this lands**: Master Build Inventory §12 (below, line ~642) still
says "ADR-013 names AG-UI as the protocol; no implementation yet" without noting ADR-049 superseded
that choice, and without noting THIS entry now supersedes ADR-049 back toward AG-UI. Update both when
the new ADR is written.

---

## ✅ RESOLVED — Users/Roles/Policies + Plugins admin surface (was the 2026-07-17 overnight-run item)

**Superseded 2026-07-28.** The original 2026-07-16 overnight-run ask (unaudited spec+build+test for
these two items) was overtaken by far more rigorous work: both went through the full formal pipeline
(Red-Team → Software Architect ADR → TDD certification → Programmer → TestRunner) as **SPEC-005**
(plugin system) and **SPEC-006** (identity/authorization, API-key issuance).
- **Plugins admin surface**: Phase 1 (loader/SDK/hook core + HTTP routes + admin UI screen) is built
  and test-verified — `Plugins.tsx` implemented, nav wired, 16/16 admin tests green.
  `ADS-memory/reports/pipeline/005-plugin-system/pipeline-state.md`. **Not fully done**:
  Phase 2 (sample plugin), Phase 3 (wiring into the real post-save flow — has a real, proven security
  finding that needs deliberate handling, not a drive-by fix), Phase 4 (polish) haven't started.
- **Users/Roles/Policies backend gaps**: closed via SPEC-006's 0.6.0 amendment
  (`ENABLE_PRINCIPAL`/`UPDATE_USER`/`UPDATE_ROLE`/`UPDATE_POLICY`/`DELETE_ROLE`/`DELETE_POLICY` etc.)
  plus the 0.7.0 amendment resolving the `CREATE_PRINCIPAL` HTTP-surface gap for API-key issuance.
  `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md`.
  **Not fully done**: still needs a Red-Team pass over the 0.6.0+0.7.0 material, an owner DRAFT→APPROVED
  spec checkpoint, and separate architecture sign-off on the API-key issuance ADR (ADR-PIPE-006) before
  TDD/Programmer can build the actual `api_keys` plumbing.
- The original `/audit-work` instruction no longer applies in its original form — there's no informal
  overnight-run output left to audit; sign-off now runs through the normal pipeline gates above instead.

---

## 🔧 IN PROGRESS 2026-07-28 — finish SPEC-003 recertification + Code Inspection (resume here)

**SPEC-003** (`tovu init`/`tovu serve`/`tovu --help` CLI surface) is implementation-complete and has
been through one full TDD recertification round this session, but is not yet through Code Inspection:
- TestRunner found 3 blockers; TDD fixed 2 for real (both independently re-verified by direct test
  runs, not just trusted): the `EC-05` locked-db test's broken lock-priming fixture, and the
  `serve-command` port-boundary test's indefinite hang (no timeout on a synchronous CLI spawn).
- **One decision still owed from the owner, not yet made**: branch-coverage gates read below the
  98%/90% bar as measured (83.72% unit / 81.68% integration), but TDD mechanically proved 100%/90.64%
  of *real, reachable* source branches are covered — the residual is esbuild/tsx's auto-generated
  CommonJS interop scaffolding, which the coverage tool counts but no test can ever reach. Three
  concrete remedies on the table (switch to a source-map-accurate coverage tool; mechanically exclude
  the transpiler-prelude ranges from the count; or a profile-override waiver as a last resort) — see
  `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md`'s "Coverage
  Gates" section for the full mechanical breakdown.
- **Coverage-gate decision (made 2026-07-28, owner):** accepted TDD's real-arms evidence as
  satisfying the gate — the residual is esbuild/tsx CJS-interop scaffolding injected into every
  transpiled module (not Tovu source, nothing to refactor). Logged as a real follow-up, not blocking:
  evaluate swapping to a source-map-accurate coverage tool (c8/istanbul) so measured numbers match
  real numbers going forward, instead of needing this same real-arms argument re-litigated per feature.
- **Next steps**: clean TestRunner re-verification pass (in progress), then Code Inspection + Security
  dispatch (`/code-inspection`), then this feature is genuinely commit-ready.

---

## ⚠️ OWED — `/audit-work` + `/code-inspection` across this session AND the previous (uncommitted) session

**Added 2026-07-28.** Nothing from either session has gone through a real review pass yet — this
session's SPEC-003/005/006 work AND the prior long session's work (repo-wide signature refactor,
snapshot-leak fix, posts/pages create-time validation fix, the 002/004/007 drift-fix sweep) are all
still uncommitted and unreviewed beyond in-house TestRunner/TDD verification. Run both before treating
any of it as mergeable:
- `/code-inspection` — internal pipeline gate (Code Inspection + Security agents) per feature.
- `/audit-work` — external multi-LLM audit (needs peer CLIs with pinned exact model versions; check
  availability before assuming it can run).
Do not skip either just because TestRunner/TDD reported green — those are necessary, not sufficient
(see this repo's own Code Inspection Agent charter: "Green tests are necessary but not sufficient").

---

## ⚠️ OWED — specs/ADRs/tests for the 2026-08-05 embeds work (built quick-and-dirty, deliberately)

**Added 2026-08-05.** Owner explicitly asked to skip spec/ADR-first process for this batch ("get
something quick and dirty, make sure it works, and we can go back, fix the architecture, get the
spec, and lock it down") — this entry is that promised follow-up, not a surprise gap. Four pieces
landed this session with no spec, no ADR, and only ad hoc/mechanical test coverage (no red-team,
no architecture sign-off):

- **Posts can now render widgets/menus/forms** (`fix(embeds)` commit `571b11a`) — fixed
  `resolvePageWidgets` resolving its host page via the generic `entries` table when Posts live in
  a separate `posts` table, so an inline `widgetEmbed` node always fell back to a placeholder.
  Real product question still open, now practically answered by building it but never formally
  decided: **should widget/menu/form embedding be in Posts at all**, or should "Pages compose,
  Posts stay prose" have been the answer? See `[[project_pages_vibecoding]]`/
  `[[project_tovu_media_pipeline_gaps]]` memory for the prior open-question framing.
- **Media gets per-asset width/height/cssClass** (same commit, plus paired Jini commit
  `72f3a110`) — new DB columns, new migration `0027_bumpy_blockbuster.sql`, threaded into
  `render.ts`'s public `<img>` output. No ADR on where per-asset display-size metadata *should*
  live (per-asset default vs. per-insertion override was explicitly punted, not decided).
- **Unified "Embed" control in the Post editor toolbar** (`feat(admin)` commit `8011bff`) — Media
  / Form / Menu / Widget… in one menu. Pure UI, no spec.
- **Taxonomy watermark stamping fixed** (`fix(taxonomy)` commit `b4c76b4`) — unrelated to embeds
  but landed in the same session under the same "just fix it" instruction; also never spec'd.

**CORRECTION (re-verified 2026-08-30): the "still separately unimplemented" claim below is now
FALSE — do not re-derive it.** The generic `data-embed-type`/`data-embed-id` contract for Pages'
`body_html` IS implemented: `apps/website/src/contracts/core/embeds/marker.ts`'s own header names
`widgets/html-embeds.ts` as the module handling `data-embed-type`/`data-embed-id` in a Page's
`body_html`, and `rg` for `data-widget-embed`/`data-form-embed` across `apps/website/src/features/post`
returns **zero hits**. This landed via **ADR-047 (widgets region + embed placement, debate-cleared
2026-07-21)** and its implementation, **SPEC-043** (`apps/website/src/features/widgets/`,
`resolvers/`, `resolver-service.ts`, `write-service.ts`, `html-embeds.ts`) — commits `03a87816`
(build), `285bbfc1` (external audit: FAIL, 3 blocker/high), `cf41bf14` (fix + implement the
routes/UI/AI-tools slice). Per `ADR-INDEX.md` line 54, ADR-047 itself still shows "Debate cleared…
owes `/audit-work` before ACCEPTED" — so the ADR's formal acceptance may still be open even though
the code is live; verify that gate before treating ADR-047 as fully closed. Historical text follows.
The generic `data-embed-type`/`data-embed-id` contract for Pages' `body_html`
(`[[project_tovu_generic_embed_contract]]` memory, decided 2026-08-05, rules settled) — today Pages
still uses the older bespoke `data-widget-embed`/`data-form-embed` attributes. Fold this into
whichever spec covers the Posts-embed work above, since both are "how do embeds work across
Posts+Pages" and splitting them would re-litigate the same scanner/resolver architecture twice.

**Next session should:** run the CodeBase Analyzer → System Design → Spec → Red-Team → Software
Architect pipeline over what's now live (not from a blank slate — the working code + this todo
entry + the two linked memory files are the input), and write real tests (unit + integration) for
the render-path fix and the media sizing, since what exists today is whatever the implementing
subagents added ad hoc, not designed-in coverage.

---

## Admin Section Spec Sweep — implementation reconciliation (2026-08-10)

**The former next-session blocker is substantially complete.** The original sweep contained
17 sections, not 18. Current source under `src/**` and `apps/**` was reconciled against the
admin panel registry, HTTP routes, focused tests, and accepted ADR index.

> **Status legend:** ✅ implemented admin screen · 🟡 real screen with material deferred scope ·
> ⬜ admin screen remains a placeholder. **Progress: 9 implemented · 7 partial · 1 placeholder.**

| Section | Status | Current evidence | What is still not done |
|---|---|---|---|
| Database / Storage | 🟡 Partial | Real Database screen plus timeline, restore-point, and migrate-forward routes; ADR-041 Accepted. | Wire the drift banner, pending-migration boot banner, and Tier-3 browser. |
| Collections | ✅ Implemented | Collection, entries, and entry-editor screens with content-type/entry routes and tests; ADR-043. | No material admin-screen gap found. |
| Categories & Tags | 🟡 Partial | Real Taxonomy screen and CRUD/assign/merge routes; ADR-044. | Reparent, deprecate, and term-slug controls. |
| User management | ✅ Implemented | Users screen supports create/update, assignments, password reset, disable, and enable; ADR-021/SPEC-006. | Hard delete is intentionally excluded by the disable-only identity model. |
| Roles & Permissions | ✅ Implemented | Role/policy create, rename, delete, and permission writes are wired and tested. | Removing one permission still requires delete/recreate. |
| Forms | ✅ Implemented | Forms list/editor, fields, status, notifications, submissions, and routes are built. | Add the SPEC-010/ADR-PIPE-010 cross-link to the central ADR index. |
| Media | 🟡 Partial | Real Media screen and upload/list/edit/trash/purge/original/provider routes; ADR-027. | Replace Images/Videos filter placeholders; confirm remaining origin-isolation, where-used protection, ingress, and GC behavior now owned by Jini. |
| Menus | ✅ Implemented | Menu list/editor, tree update, delete, and location routes; ADR-029. | Drag-and-drop is deferred; reorder controls exist. |
| Members | ✅ Implemented | List/detail/disable/resend-sign-in-link plus public sign-in flows; ADR-030. | Pagination and billing remain deferred. |
| Comments | ✅ Implemented | Moderation queue/settings and approve/spam/trash/restore/purge flows; ADR-031. | Remove the stale `soon` badge/unfinished copy in the panel registry. |
| SEO | ✅ Implemented | Defaults, robots, sitemap regeneration, per-entry overrides, and analysis; ADR-032. | No material admin-screen gap found. |
| Redirects | ✅ Implemented | CRUD/tombstone, bulk import, and lazy hit statistics; ADR-033. | No material admin-screen gap found. |
| Newsletter | ⬜ Admin UI open | Backend is substantial: campaign/list/subscriber/send-log routes and domain tests; ADR-034. | Build the admin client/types and campaigns, lists, subscribers, and send-log screens. |
| Analytics | 🟡 Partial | Real recent-hits screen and authenticated route; ADR-035. | Aggregation, trends, breakdowns, goals, export, and stale “in memory” copy. |
| Integrations / API | 🟡 Partial | Webhook subscription CRUD/pause and delivery history are wired; ADR-036. | API-key issuance/ADR-048, outbound credentials, and rotation surfaces. |
| Backups / Recovery | 🟡 Partial | Recovery supersedes Backups; restore-point creation and plan→confirm→execute restore are built; ADR-045. | Import/export, interrupted-migration unblock route, and complete write-window counts. |
| Settings | 🟡 Partial | Real Settings UI plus ledger/effective/raw/value/reset/event routes; ADR-028/050. | Five of 13 tabs still have no Tovu backend and remain inert/fake-port mounts. |

**Evidence caveat:** panel/route/test existence was verified against current source, but tests were
inventoried rather than executed during this reconciliation. Several domains now re-export their
core implementation from `@jini-ai/cms`; those Jini internals need a separate cross-repo audit before
claiming complete runtime behavior.

**Historical process note:** the original competitor teardown → debate → audit → ADR → spec cycle
has already produced Accepted ADRs for 16 of these 17 areas. Do not repeat that full cycle for an
implemented section. Use its current ADR/spec and route only the explicit remaining slice through the
appropriate planning/test gates. Newsletter needs an admin-UI-only spec check, not a new backend ADR.

> **Still separately wanted:** an Accessibility ADR and the coverage/parity ADR + matrix described
> below.

### 2026-08-10 Commerce, Authentication, and Agent Plugins slice

- [x] Replace the Payments placeholder with a provider-neutral Commerce overview informed by
  Open SaaS pricing, checkout, subscriptions, orders, and revenue information architecture.
- [ ] Implement Commerce write paths and provider adapters. Stripe and PayPal remain planned
  labels only; checkout, billing, subscriptions, reconciliation, and revenue data are not wired.
- [x] Replace the Authentication placeholder with honest Google, Facebook, and LinkedIn
  credential schemas (client/app IDs plus write-only secret fields).
- [ ] Implement the approved Jini `@jini-ai/capability-providers/visitor-auth` boundary, provider
  adapters, callback/state/PKCE lifecycle, Tovu sealed stores, identity linking, and local session
  issuance. The current admin fields are disabled previews and do not persist or enable OAuth.
- [x] Package AI Dev Shop's `ui-ux-design` material as the source-bundled
  `ui-ux-design` Agent Plugin (`plugin.json` + `skills/ui-ux-design/SKILL.md` + references).
- [x] Build the Agent Plugins screen with `Installed` first, a read-only allowlisted package-source
  inspector, and a second inert `Marketplace` tab for future wiring.
- [x] Add generic Jini Composer discovery and Tovu catalog wiring for attachments/images,
  regular plugins, Agent Plugins, singular skills, and MCP, shared by the `+` menu and bare-`/`
  autocomplete. `/mcp` currently routes to existing External MCP settings; there is no server-id
  argument because that settings route has no argument consumer.
- [ ] Replace the bounded source catalog with real installed/enabled inventories when the
  corresponding plugin, Agent Plugin, skills, and MCP backends expose trustworthy discovery APIs.
- [ ] Build the Agent Plugin loader/installer, validation, trust/permission review, lifecycle,
  sandboxing, and execution boundaries. The package catalog must not imply these exist today.
- [ ] Wire the Agent Plugin Marketplace backend and installation flow. The tab currently performs
  no fetch and shows no fake inventory or install action.
- [ ] Extend the Tovu daemon attachment contract beyond `image/*` before presenting general file
  upload as supported in the Composer.

**Coverage-gap note (surfaced 2026-07-07 audit-of-parity):** the parity map lives in
`tovu-v2-design.md §3.5` (mutable design doc) and the corpus `coverage-audit.md` files —
**it is NOT reconciled into ADRs or the specs.** Recommended first artifact next session: a
**coverage/parity ADR + matrix** mapping each competitor subsystem → {v1 / bundled-plugin /
deferred / dropped} with the owning ADR, so "are we implementing everything the others have?"
has one authoritative answer instead of being spread across four docs.

---

## Active Working Items (merged from `TODO.md`, 2026-07-09)

> These were the standalone `TODO.md` (now folded here so there is one backlog). They are near-term
> bugs + build tasks, distinct from the Admin Section Spec Sweep above and finer-grained than the
> Master Build Inventory (§8 Theme System / §9 Plugin System overlap — de-dupe later if needed).
> The ⭐ item (sample plugins) is the current **build-next**.

### AW-1. Fix the mobile nav drawer (header) — via a visual regression test
**Status: STALE / DOES NOT REPRODUCE (re-verified 2026-08-30).** This entry described theme
`tovu-official`, which no longer exists in the repo. The live theme is `basic`, and `basic`'s mobile
CSS (`content/themes/static/basic/css/theme.css`, `@media (max-width: 640px)`) already uses
`.main-nav { position:absolute; top:100% }` inside the sticky header — i.e. the very "candidate fix"
below. The cited selectors (`.nav-menu`, hard-coded `top: 3.7rem`) return ZERO hits repo-wide.
Verified with real geometry assertions at 390x844, not screenshots: drawer top >= header bottom,
every nav link clear of the header, CTA reachable, closes on toggle — all passed with no CSS change.
Guarded now by the `AW-1` block in `development/e2e/theme-visual.spec.ts`. Historical text follows.
**Status:** known bug, intentionally left unfixed until AW-2 (VRT) exists, so the test proves the bug
and guards the fix. On narrow viewports (`< 52rem`) tapping the hamburger opens the drawer but its top
edge doesn't line up with the sticky header bottom — first item ("Product") is clipped. Cause (confirm
with the test): `.nav-menu` uses a hard-coded `top: 3.7rem` offset in `themes/tovu-official/styles.css`
(`@media (max-width: 52rem)` block, ~line 226), which doesn't match real header height at every
font-size/zoom. Candidate fixes: full-height drawer (`top:0;bottom:0`) w/ its own close affordance; or
drive the offset from real header height (drawer inside sticky header + `top:100%`, or a CSS var); add a
scrim + body-scroll-lock. **Acceptance:** 390×844 — hamburger opens a drawer whose top meets the header
cleanly, no clipped items, all items+CTA reachable, closes on toggle; VRT captures it and stays green.

### AW-2. Learn visual regression testing (the skill that fixes AW-1 + AW-4)
**CORRECTION 2026-08-30: the "all 4 pass clean" claim below was FALSE on this repo layout.** The
harness never booted: `development/playwright.config.ts` pointed at `src/index.ts`, which moved to
`apps/website/src/index.ts` in the apps/website restructure. **39 OTHER `playwright.*.config.ts`
files had the same dead path — the entire e2e suite was non-functional on this branch.** All 40 are
now repointed and one was re-run end to end to confirm the server boots (1 passed, 25s). Separately,
the 4 original baselines (`home-desktop`, `home-wide`, `home-mobile-390`, `post-welcome`) now FAIL
against fresh renders — real content/CSS drift since capture, deliberately NOT regenerated. That
needs its own look. Historical text follows.
**Status: SETUP DONE (2026-07-15).** `@playwright/test` + chromium installed; `playwright.config.ts`
boots a fresh `PORT=3999 TOVU_DB=memory node --import tsx src/index.ts` per run (`reuseExistingServer`
left off, so a stale long-running dev server can never serve these tests — confirmed the fresh-boot
gotcha below doesn't apply). `e2e/theme-visual.spec.ts` + committed baselines under
`e2e/theme-visual.spec.ts-snapshots/`: `home-desktop.png` (1280, full page), `home-wide.png` (2560, full
page — guards the band rhythm), `home-mobile-390.png` (390, full page, **drawer CLOSED only** — AW-1's
open-drawer clipping bug was deliberately NOT baselined, per this section's own plan; add an
open-drawer baseline once AW-1 is fixed), `post-welcome.png` (`/welcome`, 1280). Anti-flake: reuses the
theme's own baked-in `prefers-reduced-motion` CSS via `page.emulateMedia`, bounded `document.fonts.ready`
wait, pinned viewport/deviceScaleFactor, `maxDiffPixelRatio: 0.02`, headless. `npm run test:visual` runs
the suite; all 4 pass clean against their own baselines. **New finding while building this (not
fixed, test-infra only):** the mobile-390 baseline needed `clip` (not a bare `fullPage` shot) because
the *closed* drawer (`position:fixed; transform:translateX(110%)`) still contributes to
`document.documentElement.scrollWidth` at mobile widths (confirmed 742px vs 390px clientWidth) — an
unclipped screenshot bled the off-canvas "Product" dropdown into the "closed drawer" baseline. This is a
separate, previously-undocumented mobile horizontal-overflow quirk from AW-1's clipping bug; worth a
look whenever AW-1 is picked up. Also flagging the still-open follow-up this surfaced: **add theme
hot-reload in dev** (the server caches the theme at boot with no hot-reload of `themes/**` — VRT's fresh
per-run `webServer` boot sidesteps it, but dev iteration still eats a manual restart per theme edit).
Next: AW-1 and AW-4 fixes are now safely guardable by this suite but neither was done here (both stay
their own separate items). Stretch, still open: cross-platform baseline drift (Mac vs CI Linux) → pinned
Docker image or hosted service (Chromatic/Percy/`reg-suit`).

### AW-3. Theme trust model + theme bundles — **DECIDED** (pointer)
**ADR-019 ACCEPTED** (theme bundles / plugin deps) + **ADR-020 ACCEPTED** (theme capability tiers:
Declarative / Templated=LiquidJS / Code via `theme.json.tier`). Themes stay pure data; behavior lives in
plugins. **Still open:** the standalone spec slices (theme bundles; theme tiers + LiquidJS renderer +
sandbox — see AW-5a C6 hardening).

### AW-4. Fix content-page (entry) wide-screen layout — via a visual regression test
**Status: STALE / DOES NOT REPRODUCE (re-verified 2026-08-30).** Same stale-theme problem as AW-1.
In `basic`, `.wrap` and `.post-detail` sit on the SAME element (`<article class="post-detail wrap">`)
and `.post-detail` carries `margin: 0 auto` — there is no un-centered inner box. Verified across
2 page types x 3 widths (1280/1920/2560): left and right gutters within 20px, column not collapsed.
All 6 passed with no CSS change. Guarded by the `AW-4` block in `development/e2e/theme-visual.spec.ts`.
GAP: a true non-post `page-shell.html` page could not be tested (none seeded under TOVU_DB=memory);
inferred safe from byte-identical CSS, not directly run. Historical text follows.
**Status:** known bug, intentionally left unfixed until AW-2 (write the test first). On a content page
(`/about`, any `/:slug`) at ≥~1600px (obvious at 2560px), nav + footer go full-width but the article
column is anchored left with the right half empty — stretching just grows white space. Cause (verified):
`tovu/entry-content` renders `.wrap`(max-width 75rem, centered) → `article.entry` → `.prose`(max-width
42rem, **no auto margins**, `themes/tovu-official/styles.css` ~line 187), so the article is left-aligned
inside the centered wrap. Candidate fixes: `article.entry { max-width:46rem; margin:0 auto }` (and/or a
`.wrap--narrow`); optional full-bleed band to match home rhythm; check `column` theme too. **Acceptance:**
at 1280/1920/2560 the article is a centered readable column with balanced gutters (no dead right half),
baselined per theme. Lesson: **verify a fix on every page type + width it claims to cover, not just the
one page you were looking at** (home looked fixed; content pages were never checked).

### AW-5. Build a theme at each capability tier (owner roadmap)
- **Tier 1 — basic declarative theme: DONE.** `column` is the barebones starter; `tovu-official` the
  flagship. (`signal` removed 2026-07-08 as redundant.)
- **AW-5a. Tier-2 LiquidJS theme — SPIKE DONE (2026-07-08).** Renderer (LiquidJS 10.27.1, pin ≥10.26.0)
  wired into `src/server/http/site/render.ts` behind `theme.json.tier:"templated"`, over the existing
  component registry via `{% render_block %}` + `{{content|raw}}`; autoescape ON + zero fs = the safety
  baseline; loader (`src/features/theme/theme.ts`) reads `tier` + discovers `.liquid`. Demonstrator
  `themes/dispatch/` verified live (home + `/welcome` 200, no unrendered tags, titles escaped, content
  raw, C7 link-sanitization intact). **C6 HARDENING DONE (2026-07-15).** Tag/filter allowlist
  (`src/features/theme/liquid-allowlist.ts`, AST-walked, enforced at `loadTheme()` publish-time lint and
  again defensively at render time) + render isolation (`liquid-worker.ts` runs in a `worker_threads`
  worker spawned per render by `liquid-sandbox.ts`, bounded by a wall-clock timeout and V8
  `resourceLimits`, with an explicit no-op `fs` adapter closing LiquidJS's default real-filesystem
  access) + template lint-before-publish, all wired and covered by tests (nested-loop CPU timeout and
  heap-limit termination both verified to actually fire, not just compile). Still add a VRT baseline for
  the `render_block` seam once AW-2 lands.
- **AW-5b. Tier-3 JS-in-theme (Framer Motion) — LATER.** Framework-agnostic (Astro or Next); client-side
  islands under strict CSP, build-time compiled → static HTML + hydrated islands. **Blocked on the
  Tier-3 isolation design (its own future ADR):** separate cookie-less origin + CSP `connect-src 'none'`
  (ADR-020 §6 amendment — same-origin theme JS can steal the admin session). Trust-based tier, explicit
  "this runs JS on your site" consent.

### AW-6. Plugin extensibility ceiling (plugins owning tables) — **DECIDED** (pointer)
**CORRECTION (re-verified 2026-08-30): ADR-023 is Accepted, not Proposed.** `ADR-INDEX.md` line 31
reads "Accepted 2026-07-11 (extends 003/022; relates 024/015/021/008/011; resolves TODO §6; from
2-round swarm debate + 3-round `/audit-work` `TM-adr023-dataModule-001`, round-3 unanimous PASS Codex
9.0/agy 10.0)" — the owner DRAFT→ACCEPTED sign-off this entry says is still owed already happened.
Historical text follows, evidence-corrected: ADR-023 (Core-Mediated Plugin Data Modules) — **Accepted**
(2-round swarm debate picked core-mediated declarative tables + consent model; split-finalized per
ADR-024). Plugins may own real `p_{pluginId}__*` tables via schema-as-data core executes;
snapshot-before-DDL; retain-on-uninstall. **Remaining, not reverified this pass:** owed evidence for
"commerce-grade" = a ~50k-product faceted-catalog benchmark on end-user SQLite.

### ⭐ AW-7. HIGH PRIORITY — build one sample plugin at each tier (build-next)
Approved 2026-07-08. Prove the plugin design (ADR-024 accepted; ADR-023/025 proposed) in real running
code, the way the Tier-2 LiquidJS spike surfaced real seams. Each sample is genuinely wanted *and*
stress-tests a different part of the design.

| Tier | Sample | Why users want it | What it stress-tests |
|---|---|---|---|
| **1 — declarative** | **Contact form** (submissions as core entries; email/webhook on submit) | forms = top-3 install category | the zero-code surface **and** forces ADR-024 audit-condition #1: it can't send/notify until core ships the **core-mediated primitives** (mail adapter, webhook dispatch, form-submission sink) |
| **2 — sandboxed code** | **SEO / content analyzer** (readability, TOC, reading-time) | SEO = biggest plugin category | running stranger code safely: pure computation, no fs/network → cleanest test of the frozen async/serializable ABI. Build the **ABI-boundary slice (worker/RPC), NOT the real `utilityProcess` sandbox** (deferred, ADR-024 §4) |
| **3 — trusted, full access** | **Store / commerce** (products→cart→orders→checkout→payments) | the CMS-choice driver; Tovu's thesis | everything: a plugin that **owns real tables** (ADR-023 `dataModule`), external network, heavy work — if "plugins can own tables" has a flaw, a store finds it |

**Build order:** (1) **Tier-3 thin store slice** = products → own table → listed on site (tests the
irreversible foundation — the plugin↔Tovu ABI + plugin-owned tables w/ snapshot-before-schema-change —
on ~200 lines); (2) **Tier-1 contact form** (exposes the missing core-mediated primitives as a concrete
"dead without them"); (3) **Tier-2 content analyzer** (proves stranger-code survives the frozen contract,
no sandbox). Optional pre-check: a ~1hr throwaway Tier-3 plugin against the ABI to feel whether the frozen
contract is painful. **Acceptance:** three plugins run + live-verified (hand owner the commands, don't
auto-run); Tier-3 slice proves owned-tables end-to-end w/ snapshot-before-change; Tier-1 yields the
written list of core-mediated primitives core must build; Tier-2 runs over the ABI via worker/RPC with a
written note on any DX pain.

**UNVERIFIED against this item's own acceptance criteria (checked 2026-08-30).** Real code exists that
covers similar ground, but through a different subsystem than the one this item specifies, so its status
is left as-is rather than marked done or stale from a partial look: `apps/website/src/features/plugins/`
now has `store/` (Tier-3, `store-plugin.ts` + tests), `lipay/`, `deploy/`, and `supabase-mcp/` — real
plugin-system code, not stubs. But `features/widgets/resolvers/contact-form.ts` shows the Contact Form
piece shipped as a **widget resolver** under ADR-047/SPEC-043 ("Contact Form ships in v1 (thin adapter
over the already-built `src/forms/`+`MailerPort`)" per `ADR-047`'s own text) — the **widgets** system, not
the **plugins**/`dataModule` system AW-7 is specifically about. No Tier-2 sandboxed-code
content-analyzer/SEO plugin was found (`rg` for `readability|content.analyzer` under `features/plugins`:
zero hits). Whether `store/` satisfies this item's Tier-3 acceptance bar (owned tables, snapshot-before-
schema-change, live-verified) was not checked line-by-line — that needs its own look before this item's
⭐ HIGH PRIORITY status changes.

---

## Completed (WordPress Specs)
All WordPress spec work is complete. See `wordpress_specs/` for the full library (53 files).
- ✓ wp-includes (20 specs)
- ✓ wp-content (overview)
- ✓ wp-admin (12 specs including users)
- ✓ wp-root (3 condensed specs + 12 originals archived)
- ✓ Plugin & Theme Authoring Structure
- ✓ Headless CMS paradigm

## Completed (Architecture)
- ✓ `tovu-architecture.md` — combined, renamed Forge→Tovu, includes appendix of all general patterns
- ✓ `competitor-analysis.md` — Ghost, Payload, Directus breakdown
- ✓ `tovu/` scaffold initialized (TypeScript, Express, tests, modular structure)
- ✓ `tovu/` conventions captured (`PROJECT_MEMORY.md`, local `AGENTS.md`, module `INFO.md`)

Prioritization source: `tovu-architecture.md` section 13 (User Friction Coverage).

---

## Canonical Architecture Decisions (ADRs)

This checklist is the **capability backlog**, not the decision record. Where an ADR
exists, it is the source of truth and supersedes the loose wording below. Index:
`ADS-memory/reports/architecture/ADR-INDEX.md`.

Which ADR owns which inventory area:
- **§1 Kernel / §10 Server** — ADR-001 (agent-native modular monolith), ADR-009
  (decoupling: sync calls + outbox + hooks).
- **§3 Data Layer** — ADR-006 (ports need two adapters), ADR-007 (`workspaceId`
  everywhere). **Site content lives in a per-site `content.db` behind
  `SiteStorePort`** (better-sqlite3 now → Supabase later) — ADR-012 + ADR-013.
- **§5 Storage/Media** — media blobs under the site folder's `uploads/`, metadata
  rows in that site's `content.db` (ADR-012).
- **§7 Feature Modules** — the `features/*` slices are the site content model
  (post/page/media/presentation), scoped per ADR-007/012.
- **§8 Theme System** — ADR-010 (declarative themes by default; code = trusted
  mode), ADR-002 (React blessed renderer). Two planes: site theme vs app chrome —
  see `admin-sitemap.md §1`.
- **§9 Plugin System** — ADR-003 (plugins never run DDL), ADR-004 (prebuilt ESM +
  signed manifest), ADR-005 (SDK compatibility).
- **§11 Admin UI** — IA in `admin-sitemap.md`; per-screen UI brief in
  `docs/design/admin-sections-ui-brief.md`; rail pages in
  `docs/design/rail-pages-ui-brief.md`.
- **§12 Agentic UI / AI Layer** — **ADR-013**: one CopilotKit client + one AG-UI
  daemon agent; `tools.ts` registry with an execution `surface` (frontend/data);
  agent detection ported from open-design; composer rebuilt headless. Paradigm note:
  `ADS-memory/docs/architecture/appendices/A12-tool-use-first-architecture.md`.
- **§13 Protocols** — ADR-011 (two deployment topologies; open-design desktop host),
  ADR-013 (AG-UI/MCP surface, tool exposure).

A "site" everywhere below = **a folder (install dir) with its own `content.db` +
`uploads/` + themes/plugins**, instantiated from a versioned template (ADR-012).

---

## Learn (What You Need to Understand)

### Core architecture fundamentals
- Ports/adapters and dependency inversion (how core stays swappable)
- Hybrid sync command + outbox flow (what is synchronous vs asynchronous)
- Vertical slice architecture (feature-by-feature development)
- Contract testing vs integration testing

### Platform and runtime choices
- Express vs Fastify vs Hono tradeoffs for Tovu
- Outbox implementations (in-memory now, Postgres later)
- Queue/event delivery options (retries, backoff, dead-letter strategy)

### Product + ecosystem
- Directus internals (especially AI layer)
- WordPress pain clusters and how each maps to Tovu capabilities
- Spec-first workflow (Spec Kit commands and artifacts)

---

## Accomplish (What We Need to Build)

### Foundation (active)
- [ ] Split `src/contracts/core/ports.ts` into domain-focused port files (including `core/events/ports.ts`)
- [ ] Add server route tests in `src/server/__tests__/` (status code + payload assertions)
- [ ] Add first persistent adapter set (DB-backed repo + DB-backed outbox)
- [ ] Add structured logging + request IDs

### First real capabilities
- [ ] Workspace management beyond create (read/list/update/delete)
- [ ] Basic auth boundary (identity extraction + role checks)
- [ ] Plugin/module registration skeleton
- [ ] Feature flag support (for safe rollout)

### Reliability and safety
- [ ] Outbox retry policy with exponential backoff
- [ ] Idempotency strategy for event handlers
- [ ] Error taxonomy + standardized API error responses
- [ ] Safe-mode/rollback concept draft (from architecture section 13)

### Agent capability surface (added 2026-07-27)

Backed by a source-level survey of ten shipped products; full reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/`. Design written up in
`tovu-v2-design.md` §9 and `Jini/ai-control-plane.md` §29. Build in this order.

- [ ] **Split control plane from retrieval plane.** One capability registry, two postures: agent/admin
      writes go through authorize → confirm → execute → audit; end-user search runs as the *user*,
      read-only, no confirmation. A retrieval-plane capability must be structurally incapable of
      holding a write handler. (Directus shares 12 tools across both and the weaker path — a
      client-declared, server-trusted approval — defines the security of both.)
- [ ] **Fail-closed at registration.** Throw at boot if a capability declares no auth policy, so
      "registered with no auth check" is unreachable rather than discouraged. (Strapi,
      `McpCapabilityDefinitionRegistry.define()`.) ~20 lines; do this first.
- [ ] **Entity as a parameter, not tool-per-entity.** One tool per *operation* with the entity slug
      as an argument — `findDocuments({ collectionSlug })` rather than `findPosts`/`findProducts`.
      Keeps the tool count flat as content types grow. (Payload, `buildMcpServer.ts:126-151`.)
- [ ] **Make the entity discriminator a per-principal enum**, not a free string. Kills the extra
      discovery round trip and puts least privilege in the contract. Neither Payload nor Strapi
      shipped this combination — it's ours to get right. Cache keys must include principal +
      permission version; execution-time authorization stays mandatory regardless.
- [ ] **Two-sided conformance test**, taken verbatim from Strapi's suite: *a read-only principal
      cannot see write tools and cannot invoke them.* One test, both halves of the anti-pattern.
- [ ] **Kill-switch completeness test.** Verify that disabling the AI feature stops artifacts the
      agent already created, not just new invocations. Directus (agent-authored Flow with an `exec`
      step) and novamira (agent-written sandbox PHP) both fail this — two of ten products.
- [ ] **Actor kind in the event envelope.** Record agent-vs-human on every mutation. Directus knows
      the OAuth client on every request and never writes it to the activity row, so its audit trail
      can't tell them apart. Relates to W6 (change-set primitive); retrofitting provenance is the
      same class of error as retrofitting tenancy (W7).
- [ ] **Decide per-integration credential storage.** Nothing in the current design covers it. Two
      shipped references: WordPress's Connectors API (env → constant → DB precedence,
      validate-before-persist, mask-on-every-read) and Directus's inversion where the *absence* of a
      principal is the read capability, so admins cannot read provider keys through the API at all
      (`api/src/services/payload.ts:169-195`). Multi-tenant makes this load-bearing early.
- [ ] **Validate capability *output*, not just input.** Every WordPress ability validates what it
      returns against a declared output schema (`class-wp-ability.php:677`); Jini validates input
      only. Cheap now, awkward once handlers exist. Relates to `ai-control-plane.md §19.4`, which
      already asks for it under output safety but has no implementation.
- [ ] **Ship schema-on-error before collapsing tools.** When validation fails, return the entity's
      full schema in the error so the model self-corrects in one turn. It is a one-line change to an
      error path and it is what makes a deliberately loose wire schema affordable — collapsing tools
      to `findDocuments({ collectionSlug })` without it turns every mistake into a dead end.
- [ ] **Derive risk independently of the tool author's declaration.** Treat `requiresConfirmation`
      and `readonly` as *claims*, not facts: require `readonly === true` explicitly (absent ⇒
      confirmation required) and OR in danger flags derived from the capability's own service
      binding and risk class. Matters most for plugin-contributed capabilities, where the registrant
      is not you.
- [ ] **Do not build a tool catalog / search layer yet.** With entity-as-parameter the count lands in
      the dozens, not hundreds. Build discovery when the *measured* count justifies it. Watch the
      ratio of distinct-outcome capabilities (which never collapse) to CRUD ones (which do) — when
      the former dominates, discovery stops being premature.

**Where the evidence lives.** Ten canonical per-repo reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/` (`<repo>.md` + `<repo>.metrics.json`), merged from
22 independent analyses across three models; raw passes preserved under `passes/<repo>/`. Design
rationale with `file:line` citations is in `Jini/ai-control-plane.md` §29 and `tovu-v2-design.md` §9.
Caveat when reading a single-pass report (`ghost`, `medusa`, `open-saas`, `jini`): measured across
this corpus, **68–70% of findings came from exactly one pass**, so one pass is roughly a third of
what is findable.

---

## Backlog: Directus Research (Still Needed)

Directus is still valuable for reference and can run in parallel with implementation.

- [ ] General Directus architecture map
- [ ] Directus AI layer deep spec (priority)
- [ ] Directus admin UI extension model spec

## Backlog: Admin IA Research (Needed Before Admin Build)

Placeholder admin structure exists at `tovu/apps/admin/sections/` (one INFO.md per section, WordPress-derived). It is a DRAFT until this research lands.

- [ ] Capture the admin information architecture of Directus, Ghost, Payload, Strapi, and WordPress (specs already in `other-repos-specs/wordpress_specs/wp-admin/`): sidebar taxonomy, screen inventory per section, navigation depth, and where each puts settings vs content vs system surfaces. CBM indexes exist for all five repos.
- [ ] Capture each CMS's admin *extension* pattern (how plugins contribute panels/menu items/dashboard widgets): WP menu/meta-box registration, Directus extensions-sdk app surfaces, Payload admin components, Strapi admin plugin API, Ghost admin-x apps.
- [ ] Synthesize into a Tovu admin IA spec: confirm/adjust the `apps/admin/sections/` placeholder set, define the surface-descriptor types each section needs (feeds Master Build Inventory §11 Admin UI), and mark which sections are core vs registry-contributed vs plugin-shipped.

## Backlog: Shopify Research (Still Needed)

Shopify capture work has a detailed checklist in `other-repos-specs/shopify_specs/TODO.md`.

- [ ] Review and execute the Shopify research TODO before restarting Shopify decomposition or agent-build-packet work.

## Backlog: Medusa Research (Still Needed)

Medusa follow-on decomposition notes live in `other-repos-specs/medusa_specs/TODO.md`.

- [ ] Review the Medusa research TODO before adding deeper Medusa internals, route DTO inventories, admin SDK notes, telemetry notes, or hosted-cloud caveats.

## Backlog: Commerce Platform Crosswalk (Still Needed)

Shopify + Medusa synthesis notes live in `other-repos/TODO.md`.

- [ ] Review the Shopify + Medusa follow-on TODO before turning commerce research into a Tovu capability map or V1 commerce platform architecture.

---

## Master Build Inventory (Everything)

**Reconciliation pass (2026-07-15):** cross-referenced every item below against
`ADR-INDEX.md` (46 ADRs), real code in `src/`/`apps/admin/src/`, and the
spec-016-020 gated-mutations progress ledger. Of 361 checklist items: **86 DONE**
+ **5 SUPERSEDED** (real ADR + shipped code, or overtaken by a since-made
decision), **129 STILL OPEN with a scoping ADR/pointer** noted inline, **141
STILL OPEN, UNSCOPED** (mostly the aspirational §19-25 parity/research/tooling
lists, which remain largely unbuilt). Biggest surprise: the admin UI (§11) is far more built
than the checklist assumed (`apps/admin/src/sections/` has 26 real screens —
Collections, Media, Settings, Roles, Users, Storage, Recovery, Redirects, Seo,
Menus, Integrations, Analytics, Forms — not the Next.js/Zustand shell originally
imagined). Conversely, the Agentic UI/AI layer (§12) and all AEO/GEO/AI-surface
work (§22) are still almost entirely unbuilt — no CopilotKit/AG-UI/MCP code
exists anywhere in `src/` yet, only a stub FAB.

### 1) Core Runtime / Kernel
- [ ] Define final kernel responsibilities (lifecycle, DI, service registry) — no dedicated kernel/DI module exists; ADR-046 (Proposed, pending debate) partially scopes composition-root/module-status concerns
- [x] Split core ports into module-level files (`events`, `auth`, `storage`, `search`, etc.) — de facto done: every feature/infra module now owns its own `ports.ts` (`identity/ports.ts`, `media/ports.ts`, `mail/ports.ts`, `http/ports.ts`, `core/gated-mutations/ports.ts`, etc.); `core/ports.ts` retains only the shared kernel primitives (147 lines)
- [ ] Add core error model (typed errors + error codes) — pervasive per-domain typed error classes exist (`ForbiddenError`, `ValidationError`, etc.) but no centralized core error taxonomy; `src/server/error-mapping/` is a placeholder folder (INFO.md only, no code yet)
- [ ] Add config system with typed schema + env validation
- [ ] Add feature flag system (runtime + env + workspace scope)
- [x] Add capability/permission policy engine primitives — ADR-021 (`identity/authorize.ts`, `permissions.ts`, `grant-service.ts`)
- [ ] Add module loader contract (for plugins/themes/providers) — Tier-1 declarative plugin data-modules are built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); a general load/init/stop lifecycle contract for Tier-2/3 code plugins is scoped by ADR-024 but not built
- [ ] Add architecture boundary enforcement (lint/import rules) — no eslint/dependency-cruiser config in the repo; see §24's still-open dependency-cruiser/knip evaluation items
- [ ] Add core observability hooks (metrics/log/tracing abstractions) — no metrics/tracing port exists; ADR-046 (Proposed) touches boot readiness/module-status exposure, not full observability

### 2) Eventing / Hybrid Sync + Async
- [x] Finalize domain event envelope schema + versioning — `(workspaceId, aggregateId, actorId, occurredAt, metadata)` envelope in `core/ports.ts`, ADR-007/009
- [ ] Define event naming conventions and ownership — a consistent `domain.verb` convention is used pervasively in code (`entry.created`, `content_type.tombstoned`, etc.) but it isn't written down as a standalone conventions doc
- [ ] Implement persistent outbox adapter (DB-backed) — scoped by ADR-046 Phase 1 (pending debate); only an in-memory outbox exists today (`core/events/memory-bus.ts`, `outbox-worker.ts`)
- [ ] Implement outbox poller/worker with retries and backoff — an in-memory worker exists (`core/events/outbox-worker.ts`); no durable poller with retry/backoff — scoped by ADR-046 Phase 1
- [ ] Add idempotency support for handlers — idempotency exists for gated mutations (`core/gated-mutations/token.ts`'s idempotency keys, `core/operation-lock.ts`) but not specifically for event-handler/outbox consumption
- [ ] Add dead-letter strategy for repeatedly failing events — ADR-036 built dead-letter handling for outbound webhook delivery specifically (`integrations/delivery.ts`); the core domain-event outbox has no DLQ yet
- [ ] Add event replay strategy for recovery/backfill — explicitly deferred by ADR-022 ("Defers the replay engine")
- [x] Add event contract tests — `core/events/__tests__/`, `core/events/__specs__/`

### 3) Data Layer / DB / ORM
- [x] ~~Choose primary DB strategy for early stage (Postgres first)~~ — superseded: went SQLite-behind-ports first (better-sqlite3, ADR-015), Postgres deferred to a later adapter swap (ADR-006 rule-of-two)
- [x] Choose ORM/query layer (Drizzle/Kysely/Prisma decision) — Drizzle (ADR-015)
- [x] Define migration strategy and tooling — `drizzle-kit generate`, committed migrations (ADR-015); a second independent migration set exists for the storage-journal sidecar DB (ADR-041)
- [x] Define schema naming conventions and table ownership — ADR-022/023/026 namespace/identifier grammar (`p_{pluginId}__*`, closed lowercase-alphanumeric-plus-hyphen grammar), `infra/db/schema.ts` ownership per feature
- [x] Implement workspace/tenant isolation strategy at DB level — ADR-007 (`workspaceId` everywhere) + ADR-021 composite `(workspace_id,id)` FKs
- [x] Add transactional unit-of-work patterns for commands — `core/commands/command.ts`, `core/gated-mutations/gateway.ts` (same-tx write+revision pattern used pervasively)
- [x] Add repository adapter conventions — `repo.memory.ts`/`repo.sqlite.ts` pairs (ADR-006 rule-of-two) pervasive; shared `findOneBy` base (ADR-042 item 1, `infra/sqlite/repo-helpers.ts`)
- [x] Add seed/fixtures strategy for local and tests — `server/seed.ts` (ADR-042 item 3 fixed the `content-db.ts` → `server/seed.ts` dependency direction)
- [x] Add backup/restore and rollback strategy — ADR-041 (Storage Timeline) + ADR-045 (Recovery), fully built (`features/storage`, `features/recovery`)

### 4) Auth / Identity / Permissions
- [x] Define identity model (user, service account, workspace membership) — ADR-021 (one `principals` table: user/agent/api_key/system)
- [x] Define RBAC model (roles, permissions, scopes) — ADR-021, `identity/permissions.ts` catalog
- [x] Define policy evaluation model (resource/action/context) — ADR-021 `authorize()` is ordinary core code, flat permission strings, no separate PolicyPort
- [x] Add auth middleware contract for server layer — `server/inbound/admin-http/dev-auth.ts`, `getAuthedPrincipal`/`deps.authorize()` pattern used across every admin route
- [x] Add session/token strategy — `identity/auth-service.ts` (`SESSION_TTL_MS`, SHA-256-hashed session tokens, argon2id password hashing)
- [x] Add audit trail for security-sensitive actions — change-sets (ADR-008), append-only revisions with actor+monotonic seq (ADR-022), the storage/migration/restore ledger (ADR-041)
- [x] Add permission test matrix — `identity/__tests__/permissions.test.ts`, `permission-migrations.test.ts`

### 5) Storage / Media
- [x] Define media object model and metadata schema — ADR-027 (seeded `media` entry + `asset_blobs`/`asset_renditions` sidecars)
- [x] Define upload pipeline contract (validation, transforms, derivatives) — ADR-027, `media/media-service.ts`, `image-transformer.ts`, `rendition-service.ts`
- [x] Add signed URL strategy and expiry model — ADR-027 frozen immutable URL scheme, mint-only signed URL on a cookie-less origin
- [x] Add media lifecycle policies (retention, deletion, restore) — ADR-027 GC policy (`media/blob-gc.ts`, grace period, 2-phase journaled delete)
- [x] Add media quality checks (format, size, accessibility metadata) — ADR-027 `MediaIngressPolicy` (SSRF/pixel-bomb/magic-byte/MIME allowlist) + `alt` field in `media/types.ts`
- [x] Add content-media relationship model — ADR-027 `entry_refs`, `bodyJson` stores refs not URLs

### 6) Search / Indexing
- [ ] Define search document schema and indexing boundaries — not built; note ADR-022's core-provisioned expression indexes (`content-types/index-provisioning.ts`) are DB query-performance indexes, not a search subsystem, and don't satisfy this item
- [ ] Define indexing triggers from domain events
- [ ] Implement index upsert/remove handlers
- [ ] Define hybrid search strategy (keyword + semantic optional)
- [ ] Add search relevance tuning strategy
- [ ] Add search contract tests and latency budgets

### 7) Feature Modules (Initial Core Features)
- [ ] Workspace module full CRUD + lifecycle events — create-only today (`features/workspace/create.ts`); read/update/delete/lifecycle not yet built (matches the still-open "Workspace management beyond create" item in the Accomplish section above)
- [x] User + membership module — ADR-021 (`identity`, principals) + ADR-030 (`src/members`, audience directory)
- [x] Content model module (types, fields, validation) — ADR-022/043 (`features/content-types`)
- [x] Content entry module (CRUD, status transitions) — ADR-022/043 (`features/entries`: create/update/publish/unpublish)
- [x] Revision/version module — ADR-022 append-only revisions (entries, content-types, taxonomy all revision)
- [ ] Publishing workflow module — basic publish/unpublish exists (`features/entries`); no draft→review→scheduled multi-stage workflow yet
- [x] Taxonomy/relations module — ADR-044 (`features/taxonomy`)
- [x] Settings module (workspace/system) — ADR-028 (`features/settings`)

### 8) Theme System
- [x] Define theme manifest schema — `theme.json` (`ThemeManifest`, ADR-020 `tier` field), `features/theme/theme.ts` — spike-level implementation per its own docstring, not yet the full SPEC-004 validation pipeline
- [ ] Define template hierarchy and route mapping — route→template-id resolution exists as a spike (`server/http/site/render.ts`); the full template-hierarchy/fallback design is ADR-017 (Proposed, blocked on theme system)
- [ ] Define slots/regions injection model — ADR-020 Tier-2 `render_block`/`{{ content|raw }}` seams exist as a SPIKE only (per project memory: "C6 hardening still open")
- [ ] Add theme versioning and compatibility checks — ADR-019 covers theme-declared plugin dependencies; theme-to-engine versioning/compat checks not built
- [ ] Add theme lifecycle hooks (install/enable/disable/update)
- [ ] Add theme safety checks and rollback strategy — no theme-specific safety/rollback; ADR-041 (DB migration rollback) and ADR-023 (plugin snapshot-before-DDL) are the closest analogs for other domains

### 9) Plugin System
- [x] Define plugin manifest schema and capability declaration — ADR-024 (capability manifest namespace, frozen now/contents iterate) + ADR-004 (signed manifest artifact format)
- [ ] Define plugin lifecycle API (install/load/init/stop/uninstall) — Tier-1 dataModule install/uninstall built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); full load/init/stop lifecycle for Tier-2/3 code plugins deferred
- [ ] Define plugin dependency graph and conflict rules — ADR-019 covers theme→plugin declared dependencies only; general plugin-to-plugin conflict/dependency graph not built
- [ ] Define plugin sandbox/permission enforcement — capability-gating model decided and Accepted (ADR-024 default-deny manifest); the actual Tier-2 sandbox isolation mechanism ("first rung" per-site Electron `utilityProcess`) is not yet built
- [ ] Define plugin UI extension points — ADR-025 decided the mechanism (sandboxed cross-origin iframe + `postMessage` RPC) but it isn't built yet; unblocks OQ-07 (admin-surface/extension-panel registry, itself still open)
- [ ] Define plugin server extension points (routes/hooks/events) — ADR-024 decided the hook-priority model conceptually; no general-purpose hook/route extension-point registry exists beyond feature-specific hooks (e.g. `newsletter/hooks.ts`)
- [x] Add plugin compatibility/versioning policy — ADR-005/024 (SDK compat surface, semver, deprecation ladder, frozen transport-agnostic ABI)
- [ ] Add plugin observability and fault isolation

### 10) HTTP/API Server
- [x] Keep current Express baseline stable — still the transport, no migration since ADR-001
- [ ] Define transport-agnostic route/handler shape — a consistent route-handler pattern is used pervasively in practice (`getAuthedPrincipal` → `deps.authorize()` → domain call → `res.json()`) but no formal transport-agnostic contract layer has been decided
- [ ] Decide Fastify vs Hono migration path — no decision made; Express remains
- [ ] Add request validation and response schema enforcement — ad hoc per-route validation exists (typed `ValidationError` classes); no schema-enforcement library adopted (see §24's still-open Zod evaluation)
- [ ] Add error mapping strategy (domain -> HTTP) — `src/server/error-mapping/` exists only as a placeholder (INFO.md, no code); mapping is currently ad hoc per route
- [ ] Add rate limiting and security headers — per-feature rate limiting exists (`forms/rate-limit-profile.ts`, ADR-030 magic-link rate limit) and per-surface CSP exists (ADR-025 plugin iframe, ADR-038 egress policy), but no app-wide security-headers/rate-limit middleware
- [x] Add API versioning strategy — de facto `/api/admin/v1/...` prefix convention in place across all admin routes
- [ ] Add OpenAPI generation strategy

### 11) Admin UI (Headless Admin Client)
- [x] Define admin API contract and client SDK boundaries — `apps/admin/src/lib/api.ts`
- [x] ~~Choose baseline stack (Next.js + React + Zustand)~~ — superseded: actual stack is Vite + React (`apps/admin/`), not Next.js/Zustand, per the lean-rebuild decision
- [x] Build shell layout (navigation, module registry, auth guard) — `apps/admin/src/App.tsx`, `panels.tsx`, and `nav.ts`
- [x] Build workspace management screen — `apps/admin/src/features/workspace/Workspace.tsx` is registered and tested; backend lifecycle remains narrower than the UI shell
- [x] Build content type builder UI — `apps/admin/src/features/collections/Collections.tsx`
- [x] Build content editor UI (forms, validation, revisions) — `features/posts/PostEditor.tsx` and `features/collections/CollectionEntryEditor.tsx`
- [x] Build media manager UI — `apps/admin/src/features/media/Media.tsx` (Images/Videos filtering remains partial; see sweep matrix)
- [x] Build settings and permissions UI — `features/settings/SettingsUi.tsx`, `features/roles/Roles.tsx`, and `features/users/Users.tsx`
- [ ] Build extension point rendering in admin — site-plugin and Agent Plugins management screens now exist, but ADR-025's sandboxed plugin-contributed panel runtime is not built
- [ ] Build admin notification center

### 12) Agentic UI / AI Layer
- [ ] Define AI interaction model (assistant panel + task execution) — the stub has been replaced by `apps/admin/src/components/AssistantDock/` using Jini `ChatPane`, attachments, BYOK/local execution selection, and daemon integration; the complete task/capability contract and hardening remain open
- [ ] Define tool registry contracts and tool safety policy — Jini runtime/tool registration is present, but fail-closed per-principal capability discovery and the control/retrieval-plane split in the Agent Capability Surface backlog remain open
- [ ] Define structured outputs and tool-call protocol — ADR-013/024 ABI (async + serializable-only, no live objects) sets the constraints; no concrete implementation yet
- [ ] Define context assembly pipeline (system/site/task/history)
- [ ] Define memory policy (session, episodic, semantic boundaries)
- [ ] Define guardrails and human-in-the-loop checkpoints — ADR-016 (propose→review→accept/reject→revert change-sets for agentic document editing) scopes this pattern generally; not implemented as an AI guardrail system yet
- [ ] Define AI audit trail and explainability logging
- [ ] Define AG-UI event/state model for streaming interactions — ADR-013 names AG-UI as the protocol; no implementation yet

### 13) Protocols and Integrations
- [ ] Define MCP exposure model for tools/data — no MCP code exists in `src/`; related future planning lives in §22's "Agentic Web / Playground MCP Backlog" (also still open)
- [ ] Define A2A support boundaries
- [x] Define webhook/event subscription model for external systems — ADR-036 Integrations/webhooks (`src/webhooks`)
- [ ] Define import/export contracts for interoperability
- [ ] Define AI WordPress database ingestion agent: connect read-only to a WordPress MySQL/MariaDB database, extract posts/pages/custom post types, body content, metadata, taxonomies, authors, revisions, attachments, and image assets, map them into Tovu content/media schemas, and run dry-run validation, permalink/redirect mapping, resumable import jobs, audit logs, and rollback/compensation planning before writes.
- [x] Define provider adapter lifecycle contracts — ADR-006 rule-of-two adapter pattern implemented pervasively (mail: ADR-037, http: ADR-038, blob-store: ADR-027, db-ops)

### 14) Testing Strategy
- [ ] Define test pyramid expectations per module — no written doc; consistent unit+integration split exists in practice
- [x] Add `__tests__` baseline in all modules — 34 `__tests__` directories across the codebase
- [ ] Add `__specs__` baseline in all modules — only 10 modules have `__specs__/` (post, presentation, workspace, forms, headless, redirects, settings, server); most newer feature modules (content-types, entries, taxonomy, storage, recovery, media, members, navigation, etc.) don't yet
- [ ] Add contract tests for every core port — 8 rule-of-two ports have `*.contract.test.ts` today (forms, settings, identity, integrations×2, redirects, members, newsletter); content-types/entries/taxonomy still lack a SQLite adapter at all (in-memory only, per the spec-016-020 progress ledger), so no contract test exists for them yet
- [x] Add integration tests for command + outbox flow — `core/commands/__tests__/command-atomicity.test.ts`, `core/events/__tests__/`
- [x] Add API route tests — `server/__tests__/routes/*.test.ts`, 18+ admin routes covered as of the 2026-07-15 backend session
- [ ] Add regression suite for high-risk flows — no dedicated regression-suite label; the full `npm test` run (1400+ tests) effectively serves this role today
- [ ] Add performance smoke tests

### 15) DevEx / Tooling / CI
- [ ] Standardize project scripts (dev/build/typecheck/test/lint) — dev/build/typecheck/test/db:generate scripts exist in `package.json`; no lint script
- [ ] Add lint + formatter + architecture lint — no eslint/prettier config in the repo
- [ ] Add commit/PR conventions — no CONTRIBUTING.md/commit-convention doc in the repo itself
- [ ] Add CI pipeline with required gates — no `.github/workflows/` in the repo
- [x] Add local dev bootstrap docs — `START-HERE.md` + `npm run setup` (note: `START-HERE.md` itself is now stale — it claims "there is no code yet" — but the doc exists and is the intended bootstrap entry point; refreshing it is outside this reconciliation's scope)
- [ ] Add environment matrix docs (dev/staging/prod)
- [ ] Add codegen strategy for typed clients if needed

### 16) Reliability / Ops / Security
- [ ] Add structured logging + correlation IDs
- [ ] Add metrics and tracing
- [ ] Define SLOs and operational dashboards
- [ ] Define incident response runbooks
- [x] Define backup/restore runbooks — superseded by a real shipped feature, not just a runbook: ADR-041 (Storage Timeline) + ADR-045 (Recovery screen)
- [ ] Add secrets management policy — explicitly deferred by ADR-028 itself ("secret gate: reject `secret:true` until secret-store ADR")
- [ ] Add dependency and supply-chain scanning
- [ ] Add vulnerability response policy

### 17) Product Safety (From WordPress Pain Clusters)
- [ ] Update preflight checks and safe rollout design — ADR-041's cost-gated boot migration policy (`evaluateBootMigrationPolicy`) is a preflight-check-shaped mechanism for one domain (DB migrations); no general preflight/safe-rollout framework
- [ ] Incident analysis and guided remediation design — ADR-045's Recovery screen (itemized discarded-write-window disclosure before restore) is the closest built analog; general incident-analysis tooling isn't built
- [ ] Conflict isolation and quarantine strategy
- [ ] Performance attribution and budgets
- [ ] Authoring safety and template recovery — ADR-016 (propose→review→accept/reject→revert change-sets) is the closest scoped analog; not built as a UI yet
- [ ] Migration/portability strategy — ADR-041 covers DB schema migration; content import/export portability (e.g. the WordPress ingestion agent, §13) is still open
- [ ] Governance/trust and provenance strategy

### 18) Documentation / Knowledge Retention
- [x] ~~Keep `PROJECT_MEMORY.md` updated each session~~ — superseded: the actual mechanism is `ADS-memory/memory/project_memory.md` plus the AI-Dev-Shop continuity-ledger workflow, not a root-level `PROJECT_MEMORY.md`
- [x] Keep module `INFO.md` accurate as files evolve — 26 `INFO.md` files maintained across modules
- [ ] Keep module `__specs__` synced with implementation — only 10 of the many feature modules have `__specs__/` (see §14)
- [x] Maintain ADR log for major architecture decisions — `ADR-INDEX.md`, 46 ADRs, actively maintained
- [ ] Maintain glossary of domain terms — no standalone glossary doc; terms are defined inline within individual ADRs
- [ ] Maintain roadmap by milestone (M0, M1, M2...) — `todos.md` itself is the closest thing but there's no formal M0/M1/M2 milestone doc

### 19) WordPress Parity Gap Checklist (Detailed)

#### Content + publishing
- [x] Post/page/custom-type parity (authoring + APIs + permissions) — `features/post` (post/page) + `features/content-types` (custom types, ADR-043 Collections), full authz via ADR-021
- [ ] Draft/review/published/future/private status model parity — draft/published exists (`features/entries`, `features/post`); scheduled ("future") and private-visibility states not confirmed built
- [ ] Scheduled publishing with timezone correctness
- [ ] Revisions + restore + compare views — append-only revisions exist (ADR-022); restore-to-a-past-revision and compare-views UI not built
- [ ] Autosave and crash recovery
- [x] Slug/permalink management and uniqueness handling — ADR-039 routing + slug-uniqueness guard in `entries/write-service.ts` + ADR-033 redirects capture on slug change
- [ ] Trash/restore/delete lifecycle — content-type deprecate/tombstone/cleanup lifecycle is built (ADR-043); a per-entry trash/delete lifecycle is not confirmed
- [ ] Sticky/featured content behavior

#### Taxonomy + navigation
- [x] Categories/tags/custom taxonomies — ADR-044 (`features/taxonomy`)
- [ ] Term archives and filtering behavior — taxonomy backend/admin is built (ADR-044); public-facing term-archive/filter pages are not confirmed
- [x] Menu builder (hierarchical) + assignment to theme locations — ADR-029 (`src/navigation`, `MenuEditor.tsx`)
- [ ] Breadcrumb/navigation helper model — ADR-039 routing (`urlFor`/`isActive`) provides the primitive; no breadcrumb helper built on top yet

#### Editor + design system
- [ ] Block editor equivalent (or strict alternative) with schema safety — a TipTap-based rich-text editor exists (`apps/admin/src/sections/PostEditor.tsx`, `CollectionEntryEditor.tsx`); not a block-based, schema-safe editor per ADR-016/017's fuller vision
- [ ] Reusable blocks/patterns/templates
- [ ] Full-site editing equivalents (template parts, global styles) — ADR-017 (Proposed, blocked on theme system)
- [ ] Media embed blocks and short content primitives (quote/code/table/etc.)
- [ ] WYSIWYG parity between editor and rendered output

#### Theme system parity
- [ ] Template hierarchy and fallback rules — same gap as §8 item 2 (ADR-017 Proposed, blocked)
- [x] Theme manifest and settings UI — `theme.json` manifest (ADR-020) + `apps/admin/src/sections/Appearance.tsx`
- [ ] Child-theme equivalent strategy
- [ ] Theme update compatibility checks and rollback
- [ ] Theme preview and activation flow — activation flow exists (`Appearance.tsx`'s `activate()`); a preview-before-activate step wasn't found

#### Plugin ecosystem parity
- [ ] Plugin install/activate/deactivate/update/uninstall flows — Tier-1 install/uninstall is built (ADR-023, `features/plugins/data-module.ts`); activate/deactivate/update flows and UI not confirmed
- [ ] Plugin dependency + compatibility checks — ADR-019 covers theme→plugin declared deps only; general plugin-to-plugin checks not built
- [ ] Hook/filter-like extension model — ADR-024 decided the hook-priority model conceptually; no general-purpose registry beyond feature-specific hooks
- [ ] Plugin settings registration and UI mounting — ADR-025 decided the iframe/`postMessage` mechanism; not built yet
- [ ] Plugin conflict detection and safe disable/quarantine

#### Admin + operations
- [x] Users/roles/capabilities management UI — `Users.tsx` + `Roles.tsx` (ADR-021)
- [ ] Comments/moderation system (if in scope) — ADR-031 Accepted, but backend NOT built yet (blocked on ADR-023's dataModule engine per ADR-INDEX); only `comments/ports.ts`/`types.ts` exist today
- [x] Settings pages parity (general/reading/writing/permalinks-like) — ADR-028 (`features/settings`) + `Settings.tsx`
- [ ] Update center and update history
- [ ] Built-in site health diagnostics — ADR-041's drift banner (`features/storage/drift.ts`) is a partial analog, but no route/UI is wired for it yet (deliberately deferred in the 2026-07-15 backend session)
- [ ] Import/export tooling and migration helpers

#### SEO + discovery
- [x] XML sitemap generation + controls — ADR-032 (`src/seo/sitemap.ts`)
- [x] Canonical/meta/schema controls — ADR-032/040, `seo/seo.ts`, `seo/page-head-contributor.ts`
- [x] Robots and indexing controls — ADR-032 (`buildRobots` in `seo/sitemap.ts`)
- [x] Redirect rules + canonicalization strategy — ADR-033 (`src/redirects`)

#### Media + files
- [x] Media library parity (search/filter/metadata) — ADR-027 + `Media.tsx`
- [x] Image derivatives and responsive sizes — ADR-027 (`media/transform-registry.ts`, `rendition-service.ts`)
- [x] ~~File replacement/versioning behavior~~ — superseded: ADR-027 deliberately rejects in-place file replace; source-replace mints a new media entry instead (write-once `bodyJson.$.source.sha256`)
- [ ] Bulk media operations

#### Infrastructure + reliability
- [ ] Cron/scheduler equivalent
- [ ] Caching strategy (page/data/object) with invalidation — one narrow cache exists (SEO sitemap cache, `seo/sitemap.ts`'s `regenerateSitemapCache`/`invalidateSitemapCache`); no general page/data/object caching strategy
- [x] Backup/restore UX — ADR-041/045, `Storage.tsx`/`Recovery.tsx`
- [ ] Safe update/rollback flows — ADR-041's migrate-forward state machine is the closest analog for DB schema changes; app/plugin/theme update rollback isn't built
- [x] Multisite/tenant strategy (if parity target includes multisite) — ADR-007 (workspace scoping) + ADR-011/012 (deployment topology; Tovu-Runner as the multi-site host)

### 20) Payload/Directus/Ghost Parity and Strategic Additions

#### Payload-like capabilities
- [x] Field-level schema builder parity (rich field types + validation) — ADR-022/043 (5-entry field-kind enum, validated on write)
- [ ] Relationship and nested/document modeling parity — taxonomy relations (ADR-044) + media `entry_refs` (ADR-027) exist; ADR-022's flat-typed-columns + JSON-ext-bag model is deliberately not a Payload-style deep nested/relational document model
- [ ] Access control at collection/field/doc level — collection/doc-level access control is built (ADR-021 permissions); field-level ACL is not built
- [ ] Hooks lifecycle parity (`beforeChange`, `afterRead`, etc. equivalent)
- [x] Local API equivalent (server-side direct invocation) — every feature module exposes direct typed functions (`write-service.ts` etc.) callable server-side without HTTP, matching Payload's Local API pattern (an architectural property of the whole codebase, not a discrete build item)
- [x] Draft/publish + versioning parity — `features/entries` publish/unpublish + ADR-022 revisions
- [ ] Uploads with focal points/transforms and ACL — transforms + ACL are built (ADR-027); focal-point cropping is not confirmed

#### Directus-like capabilities
- [x] ~~Database-first introspection mode (optional strategy)~~ — superseded/rejected: ADR-043 explicitly rejects Directus-style per-collection tables/DB-first introspection for operator-defined content types in favor of a data-driven registry
- [ ] Data Studio-like admin configurability — a basic registry UI exists (`Collections.tsx`); full Directus-style Data Studio configurability isn't a stated goal or built
- [ ] Flows/automation builder equivalent
- [ ] Realtime subscriptions and event streams
- [x] Granular permissions matrix (role/policy/filter-based) — ADR-021 (roles→policies→permissions, explicitly "Directus-shaped" per the ADR's own text)
- [ ] Extension types parity (interface/display/layout/module/hook/endpoint/op/panel analogs)
- [ ] Marketplace/distribution model for extensions (if in scope) — ADR-024 sets the trust-tier forcing function for a future marketplace ("shipping the marketplace is shipping the sandbox") but the marketplace itself isn't built

#### Ghost-like capabilities
- [ ] Writer-first editing experience quality target
- [x] Membership/subscription primitives — ADR-030 (`src/members`: directory, consent, magic-link) — note subscription tiers/paywall specifically are still open, see the Membership/Paywall plugin items in §22
- [x] Newsletter/email publishing primitives — ADR-034 (`src/newsletter`), domain layer built; routes/UI intentionally parked per explicit owner request (not a gap — deferred indefinitely by choice)
- [x] Publication settings and audience segmentation — `newsletter/lists.ts` + ADR-034
- [ ] SEO + canonical + social cards defaults — canonical/meta is done (ADR-032); social-card (OG/Twitter card) defaults are not confirmed built
- [ ] Performance-first defaults for publishing surfaces

#### Strategic additions (beyond parity)
- [ ] AI-native operations assistant (safe tool-calling) — same gap as §12, nothing built yet
- [ ] Guided incident remediation — ADR-045's Recovery screen is the closest built analog
- [ ] Preflight update risk checks + canary + rollback — ADR-041's migrate-forward cost-gating is a partial analog, scoped to DB migrations only
- [ ] Policy-based governance and provenance controls
- [x] Contract-first plugin security model — ADR-023/024/025/026 collectively are this: capability-gated typed writes, a frozen transport-agnostic ABI, and cross-origin iframe isolation for plugin JS

### 21) Big Missing Items to Explicitly Track
- [ ] Billing/licensing domain model (if SaaS)
- [ ] Tenant provisioning lifecycle (create/suspend/delete/archive) — create/instantiate is built (ADR-012 site template instantiation); suspend/archive/delete lifecycle is not built
- [ ] Rate limits and abuse prevention — per-feature rate limits exist (forms, ADR-030 magic-link); no platform-wide abuse-prevention layer
- [ ] Legal/compliance requirements (audit, retention, privacy workflows) — consent (ADR-030 D1c) and erasure-handler patterns (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope) exist per-domain; no unified compliance/retention framework
- [ ] Data portability + exit tooling guarantees
- [ ] Disaster recovery objectives (RPO/RTO targets) — ADR-041/045 build the restore mechanism itself; no stated RPO/RTO numeric targets
- [ ] Internationalization/localization strategy
- [ ] Accessibility baseline and regression checks — an `alt` field exists on media (ADR-027, `media/types.ts`); no broader accessibility baseline or regression testing
- [x] Analytics/event taxonomy and data governance — ADR-035 (`src/analytics`, PII-death-at-sink ingest design)
- [ ] Support/admin tooling for operations team

### 22) AEO / GEO / AI Surfaces (First-Class)

#### AEO (Answer Engine Optimization)
- [ ] Define AEO content model (Q&A entities, canonical answer blocks, evidence links)
- [ ] Add structured data generation for answer engines (schema consistency + validation) — a JSON-LD serialization primitive already exists (`server/http/site/page-head.ts`'s `serializeJsonLd`, ADR-032 `seo/page-head-contributor.ts`); full per-content-type auto-generation is not confirmed complete
- [ ] Build answer freshness workflow (staleness checks + auto-review queue)
- [ ] Add answer quality scoring (accuracy, completeness, citation confidence)
- [ ] Add AEO analytics surface (answer impressions, citation wins, decay signals)

#### GEO (Generative Engine Optimization)
- [ ] Define GEO entity graph model (brand, product, docs, features, relationships)
- [ ] Add machine-readable knowledge packaging (LLM-ready endpoint/doc bundles)
- [ ] Create an AI-readable site guide/template pack for Next.js, Vite, and other frontend users covering semantic HTML, structured data, canonical metadata, sitemaps, content hierarchy, and LLM-readable source pages
  Starter links to review later (not exhaustive):
  - Search Engine Land: `https://searchengineland.com/google-publishes-guide-on-optimizing-for-generative-ai-features-477671`
  - Google Search Central: `https://developers.google.com/search/docs/fundamentals/ai-optimization-guide`
- [ ] Add citation-safe source-of-truth pages and canonical mapping
- [ ] Add GEO monitoring (model mention tracking, citation drift, hallucination risk)
- [ ] Add remediation workflows for weak/missing entity representation

#### AIO/GEO Sitemap Plugin
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo` (Dead Internet / Search Heist / Zero-Click analysis)

##### Visibility (GEO-era sitemap as knowledge declaration)
- [ ] Define "knowledge sitemap" schema — entity graph, canonical answer anchors, authority claims, not just URLs
- [ ] Add structured content relationship mapping (topics → pages → evidence → citations)
- [ ] Generate machine-optimized sitemap variants for AI crawlers (beyond XML — structured data, entity bundles)
- [ ] Add per-page "citability" metadata (canonical answers, freshness date, authorship, source chain)
- [ ] Integrate with existing GEO entity graph model (section above)

##### Defense (Anti-Heist / Anti-Clone)
- [ ] Add sitemap topology monitoring — detect when a competing domain mirrors your URL structure
- [ ] Add selective sitemap exposure — full graph for trusted crawlers, minimal for unknowns
- [ ] Add content fingerprinting and first-publication timestamping (prove original authorship)
- [ ] Add domain lapse / zombie page alerting — warn before dormant pages expire and become cloneable
- [ ] Add lookalike domain detection (variations on site name appearing with mirrored content)
- [ ] Add crawler pattern analysis — detect mass-export behavior vs normal crawling

##### Intelligence (Citation & Displacement Tracking)
- [ ] Track which pages are being cited in AI overviews / answer engines
- [ ] Track content staleness signals (pages going stale = ripe for displacement by competitors)
- [ ] Track competitor topology mirrors and content overlap drift
- [ ] Add alerting for citation loss / decay (you were cited, now you're not)
- [ ] Add dashboard: citation wins, displacement risks, heist attempts, freshness scores

#### Content Provenance & Defense (Platform-Level)
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo`

- [ ] [Optional-Weak] Content provenance as a first-class CMS feature — content signing, timestamping, editorial process declaration at platform level (proves human authorship + original pub date in a model-collapse world)
- [ ] Add intelligent crawler policy management beyond robots.txt — per-crawler rules, welcome citation bots, throttle scrapers, detect mass-export patterns
- [ ] Add "human-first" signal packaging — editorial process metadata, authorship chains, source citations, signals that quality-focused engines will reward
- [ ] Add content originality scoring — flag when published content looks AI-generated or duplicative before it damages site authority

#### AEO Plugin (Tovu-Native — replaces Yoast/RankMath)
Source research: AI engine crawler/indexing patterns (Google AI Overviews, ChatGPT Search, Claude, Perplexity, Bing Copilot)

##### Per-page auto-generated outputs
- [ ] Auto-generate JSON-LD structured data from typed content model (Article, HowTo, Product — context-dependent)
- [ ] Auto-generate "direct-answer block" (2-3 sentence extractable answer) placed at top of page
- [ ] Auto-generate clean `.md` mirror of each page at `<url>.md` for LLM-friendly consumption
- [ ] `data-nosnippet` zone management — let editors mark sections excluded from AI extraction
- [ ] Meta description generation optimized for extraction (complete sentences, factual, 150-160 chars)

##### Site-level outputs
- [ ] Auto-generate `/llms.txt` from site structure and key pages (low-cost future bet)
- [ ] IndexNow integration — ping Bing instantly on publish/update (only proven instant-discovery signal)
- [x] Sitemap.xml with accurate `<lastmod>` dates (freshness signal across all engines) — ADR-032 (`seo/sitemap.ts`)
- [ ] robots.txt builder — per-bot allow/block config (OAI-SearchBot, GPTBot, PerplexityBot, Googlebot, bingbot, ChatGPT-User) — a generic `RobotsPolicy`/`buildRobots` exists (ADR-032, `src/seo/`); per-bot granularity (OAI-SearchBot/GPTBot/etc.) not confirmed

##### Engine-specific optimizations
- [ ] Google AI Overviews: "nugget in the mine" content structure (long-form with extractable direct answers per section)
- [ ] ChatGPT Search: ensure pages indexed in Bing (OAI-SearchBot uses Bing's index); separate GPTBot (training) vs OAI-SearchBot (search) controls
- [ ] Perplexity: freshness-first strategy — auto-flag stale content, surface recency signals, original research/data emphasis
- [ ] Bing Copilot: IndexNow for real-time discovery + `data-nosnippet` for fine-grained control
- [ ] Claude: clean semantic HTML that converts well to text/markdown, minimal JS-dependent content

##### Content quality signals (agent-assisted)
- [ ] Claim + evidence pair detection — AI suggests adding citations/data to unsupported claims
- [ ] Heading hierarchy validation — flag broken H1>H2>H3 structure
- [ ] "Citability score" per page — how extractable/quotable is this content for AI engines?
- [ ] Freshness monitoring — alert when pages go stale and become displacement targets

##### Forms plugin (TanStack Form-based)
- [x] Define form schema model compatible with TanStack Form's typed API (agent-manipulable field definitions, validation rules, nested structures) — `src/forms` (`forms.ts`, `types.ts`, `manifest.ts`)
- [x] Form builder capability contracts (agent can create/modify/validate forms via typed commands) — `forms/write-service.ts` + `apps/admin/src/sections/FormEditor.tsx`/`FormsList.tsx`
- [ ] Submission routing, conditional logic, payment integration — submission handling + notification is built (`forms/submit-service.ts`, `notify-subscriber.ts`); conditional logic and payment integration are not confirmed built
- [x] Notification/webhook triggers on submission — `forms/notify-subscriber.ts` + ADR-036 integrations webhooks

##### Multilingual plugin
- [ ] Locale model + fallback chains (per-content-type locale config)
- [ ] Agent-driven translation workflow (auto-translate on publish, human review queue)
- [ ] URL slug per locale, hreflang generation, locale switcher component
- [ ] Translation memory / glossary for consistency across content
- [ ] Parity tracking — surface which locales are out of sync

##### Membership/Paywall plugin
- [ ] Subscription tier model (plans, entitlements, content access rules)
- [ ] Content restriction rules (per-page, per-section, per-content-type)
- [ ] Drip/scheduled content release
- [ ] Payment gateway integration (Stripe primary)
- [x] Member directory, login/registration flows, profile management — ADR-030 (`src/members`)

#### AI Surfaces (User + Employee)
- [ ] Define end-user AI surface (assistant panel for guided site changes)
- [ ] Define employee/internal AI surface (operations console with elevated tooling)
- [ ] Define tool permission tiers (user-safe vs staff-only vs admin-only)
- [ ] Add approval flows for destructive/high-impact tool actions
- [ ] Add audit logs for all AI tool calls and resulting mutations
- [ ] Add simulation/dry-run mode before applying front-end or back-end changes
- [ ] Add rollback checkpoints for AI-applied changes
- [ ] Add dual-surface UX contracts (what users can self-serve vs what staff can perform)

#### AI Tooling for Frontend + Backend Mutation
- [ ] Tooling: frontend layout/style/content mutation tools
- [ ] Tooling: backend schema/config/workflow mutation tools
- [ ] Tooling: safe migration tools (preview diff, impact analysis, revert plan)
- [ ] Tooling: test-and-verify tools (run checks before apply)
- [ ] Tool orchestration policy: require tool-use-first and structured outputs
- [ ] Add guardrails to prevent unbounded or cross-tenant mutations

#### Agentic Web / Playground MCP Backlog
Source prompts:
- Automattic: `https://automattic.com/2026/04/21/wordpress-operating-system-agentic-web/`
- WordPress Playground MCP: `https://make.wordpress.org/playground/2026/03/17/connect-ai-coding-agents-to-wordpress-playground-with-mcp/`

- [ ] Evaluate the "WordPress as operating system of the agentic web" thesis against Tovu's strategy: governed web operating layer exposing content, admin, extensions, jobs, diagnostics, and site state as safe agent capabilities.
- [ ] Track the agentic-web challenge set as explicit risks to solve later: legacy/technical-debt drag, inconsistent extension quality, abandoned/insecure extensions, performance overhead, extension-order complexity, fragmented runtimes, and missing ecosystem quality signals.
- [ ] Define a Tovu agent capability catalog for content, media, themes, plugins, settings, jobs, migrations, diagnostics, and recovery, with descriptors reusable by admin UI, AI assistant, MCP, and future protocols.
- [ ] Define a WordPress Playground-style Tovu Playground: disposable local/browser sandbox for AI coding agents to test site, content, theme, plugin, and schema changes without production writes.
- [ ] Add a local-only MCP bridge for Tovu Playground with token/origin protection, explicit user-scoped enablement, and no production credentials by default.
- [ ] Expose sandbox tools for HTTP requests, admin navigation, content mutation, theme/plugin file operations, migration dry-runs, test execution, job inspection, snapshot reset, and export/import.
- [ ] Add an AI coding agent integration contract covering sandbox creation, patch application, preview URL, diff review, human approval, audit log, and rollback checkpoint linkage.
- [ ] Add contract tests proving MCP/playground actions cannot exceed equivalent authenticated admin permissions or bypass safe-mode/recovery policy.

### 23) Platform Gaps Still Missing

#### Governance, data, and compliance
- [ ] Define data classification policy (PII, sensitive business data, public data)
- [ ] Define retention and deletion policy per data class
- [ ] Implement data subject request workflows (export/delete/correction) — erasure-handler patterns exist per-domain (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope); no unified data-subject-request workflow/UI
- [ ] Map controls for SOC2-style audit readiness
- [ ] Map GDPR/CCPA requirements to concrete product behaviors
- [ ] Define evidence collection workflow for audits (logs, approvals, controls)

#### Reliability and global operations
- [ ] Define multi-region strategy (active/passive or active/active)
- [ ] Define data residency controls by workspace/tenant
- [ ] Define disaster failover playbook and trigger criteria
- [ ] Define latency and availability SLOs by region
- [ ] Run recurring restore drills to validate RPO/RTO goals

#### Commercial platform capabilities
- [ ] Define billing domain model (plans, subscriptions, invoices)
- [ ] Define entitlement model (feature access by plan)
- [ ] Define quota model (API, storage, AI usage, seats)
- [ ] Define overage handling and enforcement behavior
- [ ] Define billing/audit reconciliation workflows

#### API and ecosystem lifecycle
- [x] Define API versioning lifecycle and sunset/deprecation policy — ADR-005 (semver, deprecation ladder)
- [ ] Define SDK generation and release process
- [x] Define backward-compatibility guarantees for core APIs — ADR-005 (SDK compatibility promise, API snapshot tests)
- [x] Define extension API stability policy (what can break and when) — ADR-005/024 (ABI frozen now, capability manifest namespace frozen/contents iterate)

#### Marketplace and supply chain trust
- [ ] Define plugin/theme submission and review workflow
- [x] Define package signing and integrity verification model — ADR-004 (prebuilt ESM + signed manifest)
- [ ] Define extension trust scoring (security, maintenance, quality)
- [ ] Define malicious package response workflow (disable/quarantine/notify)

#### Release management and support operations
- [ ] Define release channels (stable, beta, canary) and promotion rules
- [ ] Define rollback playbooks per release type
- [ ] Define customer-facing status page and incident communication templates
- [ ] Define support tooling (safe impersonation, diagnostics bundle export)
- [ ] Define runbooks for top recurring incidents

#### Product growth and safety operations
- [ ] Define experimentation framework (A/B testing + guardrails)
- [ ] Define onboarding wizard and activation milestone tracking
- [ ] Define migration assistant UX with success/failure checkpoints
- [ ] Define cost telemetry by module/feature and budget alerts
- [ ] Define analytics taxonomy governance and ownership
- [ ] Define UGC moderation/safety policy if user-generated content is enabled

### 24) Architecture Tooling Evaluation (added 2026-06-30)

Source: competitor-analysis session. See `claude-tovu-competitor-findings.md`, `gemini-tovu-competitor-findings.md`, `codex-tovu-competitor-findings.md`.
Goal: evaluate/adopt tooling that keeps the codebase modular, maintainable, and flexible (enforces the ports/adapters + spec-first constraints). Ties into existing items 1) "architecture boundary enforcement" and 15) "architecture lint".

Recommended starting five (highest ROI):
- [ ] Evaluate **dependency-cruiser** — enforce "core never imports adapters" as CI-failing rules (makes the inward-dependency rule real)
- [ ] Evaluate **knip** — find unused files/exports/deps across the workspace (keeps plugin-heavy platform lean)
- [ ] Evaluate **Zod** at all boundaries — runtime validation + single source of truth for types (fits SQLite JSON-text ↔ jsonb strategy) — not adopted; relates to §10's still-open request-validation item
- [ ] Evaluate **ArchUnitTS / ts-arch** — architecture rules as unit tests (fits spec-first / M3 test-contract framework)
- [ ] Evaluate **Testcontainers** (+ **Pact**) — contract-test each DB/storage/payment adapter against a real backend

Adopt when splitting `src/` into `packages/`:
- [ ] Evaluate **Nx** vs **Turborepo** — workspace + module-boundary tags + affected graph + caching — moot for now, `src/` has not been split into `packages/`
- [ ] Evaluate **Sheriff** / **good-fences** — lighter encapsulation if not going full Nx

Understanding / codegen / docs:
- [ ] Evaluate **Madge** — fast circular-dependency detection (cheap complement to Graphify/CBM)
- [x] Evaluate **ts-morph** — TS AST manipulation for `migration-generator.ts`, plugin `sdk-builder`, typegen (how Payload does config/typegen) — adopted (`package.json` devDependency), in active use in `scripts/write-path-inventory.ts` for the ADR-042 structural graph-audit tooling
- [ ] Evaluate **ts-rest / tRPC** — compiler-checked contracts for the headless packet (Next/Vue shells)
- [ ] Evaluate **Structurizr DSL / C4 model** (+ PlantUML) — diagrams-as-code living architecture docs (pairs with ADR log in item 18) — the ADR log itself (`ADR-INDEX.md`) serves the living-decision-record role in prose form; no diagrams-as-code tooling adopted
- [ ] Evaluate **OpenTelemetry** (later) — runtime coupling/traces once modules talk via events

### 25) Reference Codebases to Study (added 2026-06-30)

Goal: study exemplary OSS repos for architecture/design patterns Tovu needs (ports/adapters, DDD, plugin systems, theme systems, provider adapters, monorepo layout). Consider cloning + graphifying the high-priority ones like the existing OSS-Repos set.

Ports/adapters + DDD references (TS):
- [ ] **Sairyss/domain-driven-hexagon** — canonical TS DDD + hexagonal + CQRS reference (closest to Tovu's intended core)
- [ ] **CodelyTV/typescript-ddd-example** — DDD/CQRS skeleton in TS
- [x] **medusajs/medusa** — modular monolith, module container + module links, provider pattern (already partly in specs; graphify it) — cloned to `OSS-Repos/medusa` and graphified (465 files in `OSS-Repos/graphify-out/manifest.json`)

Plugin-system gold standards:
- [ ] **microsoft/vscode** — contribution points, extension host, activation events (the canonical extensible-platform design)
- [ ] **backstage/backstage** — plugin framework at scale, well-documented plugin API
- [ ] **grafana/grafana** — plugin + data-source-provider architecture

Theme + plugin + content tooling (TS, directly relevant):
- [ ] **facebook/docusaurus** — theme + plugin + preset lifecycle in TS (strong theme-system reference)
- [ ] **withastro/astro** — integrations API, content collections, deploy adapters (modern content-tool adapter pattern)

Provider/adapter + modular monorepo references (TS):
- [ ] **novuhq/novu** — NestJS modular monorepo, notification provider adapters (like Strapi providers)
- [ ] **twentyhq/twenty** — modern NestJS + React modular monorepo (CRM)
- [ ] **calcom/cal.com** — large Next.js app + packages monorepo, feature modularity
- [ ] **nestjs/nest** — DI/modules/providers = canonical TS ports/adapters + DI reference

Curated lists to mine:
- [ ] **mehdihadeli/awesome-software-architecture** and **donnemartin/system-design-primer** — patterns catalog

---

## Admin skins (Studio → Appearance) — planned, not started

Goal: switch the ADMIN's own look — `basic` (today's), `glassmorphic`, `ultramodern` — from a
Studio → Appearance tab. Same mechanism the public themes use, aimed at the admin instead.

This is already half-true: `apps/admin/src/styles.css` defines 77 design tokens and every
component references them (`var(--link)`, `var(--surface)`), with dark mode implemented as
`:root[data-theme="dark"]` overriding the same token names. A skin is the identical trick one
axis over — `:root[data-skin="glassmorphic"]` re-declaring those tokens.

**Two things must hold or skins are unreachable, and both are cheaper to honor now than to
retrofit across 76 components:**

1. **No literal visual values in components.** This is the binding constraint on the Tailwind
   adoption below. Tailwind's theme must map utilities onto the CSS variables
   (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto its default
   palette. A component written as `bg-blue-500 shadow-md` is invisible to every skin, because
   there is no variable for a skin to override.

2. **The token vocabulary needs axes beyond color.** Glassmorphism is translucency, backdrop
   blur, and a different border/elevation treatment — a skin that can only change hues cannot
   express it. Needs tokens along the lines of `--surface-alpha`, `--surface-blur`,
   `--elevation-shadow`, `--border-weight` before the look is reachable at all.

Note the symmetry with the public theme work: site themes carry `tokens.json` + `tokens.light.json`
and swap by writing `data-theme`. Admin skins are the same shape. Worth keeping the two token
vocabularies deliberately similar rather than letting them drift into two unrelated systems.

## Theme marketplace — local fixture only

`content/themes/__marketplace__/` stands in for a remote marketplace so the download flow can be
exercised end to end. No network, no search, no publisher identity, no versioning or update
checks, no signing. A real one needs all of those, plus a stable upstream identity on `lineage`
(local folder ids are per-install and mean nothing on another machine).

## Tailwind + shadcn/ui — owner wants both, deferred (2026-08-11)

Owner: *"Remind us to download shadcn and Tailwind later because I wanna be able to use the
components from it."* Wanted specifically for shadcn's component library, not just utilities.

Order matters: shadcn generates components built on Radix primitives **and Tailwind classes**, so
Tailwind lands first. Neither is installed today — `apps/admin` has 27 deps, no Tailwind, no Radix,
no shadcn; all UI comes from `@jini-ai/ui`.

**Do not migrate the existing 4,687 lines / 541 selectors.** Add Tailwind with `preflight` DISABLED
(preflight's reset would clobber the current stylesheet) and use it for NEW surfaces only.

**The binding constraint**, from the admin-skins section above: Tailwind's theme must map onto the
existing CSS variables (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto
its default palette. Same rule applies to whatever shadcn generates — a component shipping
`bg-blue-500 shadow-md` is invisible to every skin, because there is no variable to override. Budget
time to rewrite shadcn's generated classes onto the token bridge as each component is pulled in;
that is the real cost of adopting it here, not the install.

Known cost either way: two styling systems coexisting, and nothing tells a newcomer which to reach
for. Needs a written rule — new components use Tailwind, do not convert old ones.

## JSON-column tripwire + theme write-gate — 3 known-open items (2026-08-12 external audit)

All three are **latent and non-blocking**, recorded here so they are not rediscovered from scratch.
Context: a 4-auditor panel (Terra `gpt-5.6-terra`@xhigh, Gemini 3.1 Pro, Gemini 3.6 Flash, Sonnet)
reviewed the session diff over two rounds. Everything blocking was fixed and mutation-proven —
commits `3cd312d`, `57d5d65`, `697d97e`, `f763bb9`, `3fead5a`, `169b74a`. These three were
deliberately deferred.

**1. The JSON-mention regex fires on phrasing that means "not JSON."**
`/(?<!\.)\bjson\b(?!\.(?:stringify|parse)\b)/i` in `src/platform/db/__tests__/migration-manifest.test.ts`
matches `"non-JSON"`, `"JSON Web Token (JWT)"`, `"JSON:API"`, `"GeoJSON-style … NOT parsed JSON"`.
No such phrasing exists in `schema.ts` today (grep-confirmed). It fails **loud** — the suite breaks
and someone rewords a comment or adds a `REVIEWED_JSON_COLUMNS` entry — so it cannot pass bad data
silently. Same accepted risk class as the `theme.json` filename false positive the `(?<!\.)`
lookbehind already handles. *Fix only if actually hit*, with a narrow `(?<!non-)` exclusion.

**2. A trailing same-line comment is invisible to the tripwire.**
`col: text("x"), // JSON blob` attaches to neither column — `ts.getLeadingCommentRanges` does not
see it. **Pre-existing, not a regression**: the auditor traced the old regex scanner and confirmed
identical behaviour (its backward walk never inspected same-line trailing text either). A column
documented *only* that way carries a JSON signal the tripwire cannot read. Same applies to a shared
section-header comment above a group of columns — only the immediately-following column inherits it.

**3. No install-time rule forbids a theme declaring `build.sourceDir: "preview"`.**
That manifest is what made `preview/` paths resolve `"editable"` and sent PUT down the sourceDir
branch (fixed in `9e75c4a`). The narrow fix is in place; the deeper one — a `build-conformance.ts`
check refusing a `sourceDir` that names a `GENERATED_THEME_DIRS` entry — was not attempted.
Unreachable today: no theme on disk sets `build.source: "compiled"`. Noted in `explore.ts` where a
maintainer would look.

**The lesson worth keeping, above any of the three:** a gate and the writer it guards must resolve a
name the same way. `isGeneratedThemePath()` compared paths as spelled while `resolveThemeFilePath()`
normalized them, so `PUT {"path":"css/../preview/app.css"}` returned 200 and overwrote generated
output — walking around the rule on every route. Two resolvers for one string is a bypass waiting to
be spelled differently.

## First-run onboarding wizard — deferred, but load-bearing (2026-08-15)

**Not being built now. Recorded because the deployment work will be shaped wrong without it.**

The idea: when someone first installs Tovu, ask them what they are actually building before they
make choices they cannot see the consequences of. Roughly — what kind of site (blog / brochure /
store), what database (if any), and do you need payments, forms, members, comments.

Why this is not cosmetic: those answers **determine which deployment targets can ever work**, and the
constraints are invisible to a non-technical user. Someone who picks "store" cannot deploy to a
static host — checkout and `payments-webhook.ts` need trusted compute — but nothing in the product
tells them that until it fails. The wizard is where "you said you want payments, so Cloudflare Pages
alone will not work for you" gets said, at the one moment the user is receptive to hearing it.

**The hard requirement, and the reason this needs design rather than a form:** people will answer
wrong. They will pick "blog" and then want to sell something six months later. **Every answer must be
reversible**, and reversing must not mean a migration the user has to understand. Do not build a
wizard that writes a one-way decision into config. The likely shape is: answers set defaults and
surface warnings, but the underlying capability stays present and re-derivable from what the site
actually uses — i.e. **detect eligibility from real feature usage, and treat the wizard answers as a
hint, never as the source of truth.**

Read `development/docs/deployment/deployment-constraints.md` before designing this — §6 lists exactly
which features force a stateful host, and §9 explains why the target user never sees a provider at
all.

Related open blocker: onboarding a *customer* (as opposed to a developer) is gated on multi-workspace
hosting, which does not exist yet — one running app resolves exactly one workspace at boot
(`src/platform/site-dir/resolve-workspace.ts:15-21`). See constraints doc §4.1.

## ✅ RESOLVED (2026-08-24) — template shells were their own reachable URL (found 2026-08-15)

**Fixed, with one addition the original entry did not catch: `/404` had the same defect.**
`isMarketingPageSlug` (`pages.ts`) excluded only `index`, so a static theme's own `pages/404.html`
was ALSO served at `/404` with a **200 OK** — a soft 404, indexed by search engines as real content.
`route-manifest.ts` already excluded it; the live route did not. Same root cause, same one-line fix,
so it was closed in the same pass rather than left as a second entry.

**What landed:** a single shared predicate, `isStandaloneThemePage(theme, pageId)`, in
`src/features/theme/theme.ts` (next to `validateTemplateDeclarations`, which already owns `templates`
semantics), exported via the theme barrel. It answers "is `GET /<pageId>` a real standalone page"
once — excluding `index` (served at `/`), `404` (the error document), and every
`manifest.templates` stem. Both call sites now import it instead of spelling their own answer:
`server/routes/site/pages.ts`'s `isMarketingPageSlug` and `export/route-manifest.ts`'s
`buildThemePageRoutes`.

**Verified:** 2 regression tests in `src/server/routes/site/__tests__/pages.route.test.ts`, both
confirmed RED first (200 where 404 was required) — one covering the template shells with a passing
`/about` control proving the fixture was genuinely reachable, one covering `/404`. Scoped runs green
afterwards: `src/features/theme/**` 464 pass, `src/platform/export/**` + `src/server/routes/site/__tests__/**`
102 pass, `npx tsc -p tsconfig.json --noEmit` clean.

**Real-world blast radius closed:** 6 themes on disk declare `templates` — `basic`, `portfolite`,
`gracious-timing`, and all three `tailark-*`. On each, `/blog-post`, `/page-shell` (and, on any theme
shipping one, `/404`) were publicly reachable 200s.

**The lesson, same family as the `isGeneratedThemePath` one recorded above:** two resolvers answering
one question will drift, and the drift is invisible because each is internally consistent. The
exporter was right and the live server was wrong for nine days, and nothing failed loudly — the
export output simply disagreed with the running site.

**Original entry, kept for context below.**

**Not being fixed now — recorded so it is not lost, per the deployment-work session's own tracking
convention.** Found while building `src/platform/export/route-manifest.ts` (the static-site exporter's route
enumeration).

A static theme's `pages/*.html` folder (`DiscoveredTheme.pages`, `src/features/theme/theme.ts:290-297`)
holds two different kinds of file in the SAME `Record<string, string>`, keyed identically by filename
minus `.html`: real standalone pages (`about.html`, `pricing.html`, …) AND content-embedding template
shells a Post/Page picks via `templateChoice` (`page-shell.html`, `blog-post.html`,
`blog-sidebar-template.html` for the `basic` theme — declared in `theme.manifest.templates`, the
`ThemeManifest.templates?: string[]` field, `theme.ts:161-176`). Nothing in the loaded theme shape
distinguishes the two by TYPE, only by which OTHER list names a given key.

`src/server/routes/site/pages.ts`'s `GET /:slug` handler (the `theme.pages[slug] !== undefined` check
around line 762) has no exclusion for `theme.manifest.templates` entries. The result: `/page-shell`,
`/blog-post`, and `/blog-sidebar-template` are live, publicly reachable URLs on the `basic` theme
today, each returning the shell's raw HTML directly via `renderStaticPage` — a document that expects a
Post's content to be substituted into its `{"type":"content"}` marker, served instead with no
substitution ever having run. A broken/incomplete page, reachable by anyone who guesses or is handed
the URL.

**Why the exporter doesn't just fix it inline:** the fix belongs in `pages.ts`, a file two other
agents were actively working in during this same session — touching it beyond the one already-landed
`export` keyword addition risked exactly the kind of conflict this session's dispatch briefs were
written to avoid. `route-manifest.ts` instead excludes `theme.manifest.templates` stems from the
theme-page route candidate set (see that file's own header comment), so the STATIC EXPORT never ships
this broken output as if it were a real page — but the underlying live-site reachability is unrelated
to export and remains open on the running server.

**The narrow fix, when someone picks this up:** exclude `theme.manifest.templates` stems in the SAME
`theme.pages[slug] !== undefined` check `pages.ts`'s `GET /:slug` handler already runs, mirroring what
`route-manifest.ts` already does for export purposes — one shared exclusion list (or a small named
helper) rather than two independently-maintained copies of "which page ids are template shells."

---

## Security page (credential inventory) under Operations — owner wants this, deliberately deferred (2026-08-15)

Owner's question, verbatim: *"Should we have, like, a Security tab under Operations and then an Access
Tokens tab? In case we need it in more than one place, or is that too messy?"* Answer: not messy, and
not speculative — the scattering already exists. Owner asked for it to be recorded and revisited, not
built now.

**The measured state.** Eight sealed-credential stores exist (or are landing) in this repo:

| Store | Repo file |
|---|---|
| Site / BYOK credentials | `src/platform/db/sqlite/site-credential-repo.sqlite.ts` |
| Publish targets | `src/platform/db/sqlite/publish-credential-repo.sqlite.ts` |
| Composio connector credentials | `src/platform/db/sqlite/composio-connector-credential-repo.sqlite.ts` |
| Composio config | `src/platform/db/sqlite/composio-config-repo.sqlite.ts` |
| Admin execution credentials | `src/platform/db/sqlite/execution-credential-repo.sqlite.ts` |
| External MCP servers | `src/platform/db/sqlite/external-mcp-repo.sqlite.ts` |
| Media provider credentials | `src/platform/db/sqlite/media-provider-credential-repo.sqlite.ts` |
| Source control (in flight this session) | `source_control_credential_sets` |

And five admin screens already accept a token: `features/settings/SettingsUi.tsx`,
`features/settings/ComposioKeyField.tsx`, `features/ai-assistant/AiAssistant.tsx` (BYOK),
`features/deployment/StaticSiteTab.tsx`, `features/source-control/SourceControl.tsx`.

**Scope it to READ + REMOVE. Never a second place to enter a token.** Two entry points for one secret
is the "which row is authoritative" bug, and it would also undo work already paid for: the Static Site
tab's redesign specifically pulled the credential OUT of an "Advanced" disclosure to make it Step 1
inline, on the owner's own direct read that hiding a mandatory first step was backwards
(`PublishCredentialsSection`'s header comment records the three passes it took). A Security page that
re-hosts the connect form re-hides that step one room further away.

The two jobs are genuinely different, and only one of them is built:
- **Connect** — task-shaped, belongs in the flow that needs it. Already correct on Static Site.
- **Inventory** — "what secrets does this install hold, when were they saved, kill that one."
  Cross-cutting. **Nothing does this today.** That is the entire gap this page exists to close.

**The load-bearing constraint — do not get this wrong.** A button that deletes Tovu's row does NOT
revoke the credential at the provider. It stays live on GitHub/Vercel/Cloudflare until someone revokes
it there. Label it **"Remove from Tovu"**, never "Revoke", and link out to the provider's own
revocation page. Calling it "Revoke" ships exactly the defect the owner caught on the connected-
credential row the same day — copy asserting an action the system never performed (see U3 in
`ADS-memory/reports/continuity/2026-08-15-session-4-handoff.md`, and `CredentialStepDone`'s doc
comment for why that timestamp says "saved" and not "updated"). Same family of bug, higher stakes.

**Shape.** One plain page under Operations, no tab bar — a tab bar with a single tab in it is noise.
Add tabs when a second concern actually arrives; obvious candidates already exist (Activity Log is a
`soon: true` placeholder in this same group, and Roles & Permissions sits over in People). One row per
stored credential: provider, what it is for, when it was saved, and a deep link back to the screen
that owns it.

**Known cost when someone picks this up:** a complete inventory means reading from all eight stores,
and two of those surfaces — BYOK and Composio — are already flagged as broken or unfinished elsewhere
in the backlog. Either confront them or scope the first pass to the stores that are healthy and say so
on screen, rather than silently listing a subset as if it were everything.

---

## HTML-format Pages render in the fallback shell, not the theme — and nothing can change that

Filed 2026-08-30, from a live admin-assistant session auditing tovu-com. Diagnosis independently
verified against source before filing; the assistant's line references were all correct.

**Symptom the owner sees:** five authored pages (`/quickstart`, `/documentation`, `/faq`,
`/how-tovu-works`, `/about`) come back cream-and-peach while Posts render correctly in the full Basic
theme. The peach is NOT a theme bug. Those pages are served by Tovu's built-in fallback shell
(`SITE_TITLE = "Tovu Demo Site"`, `server/inbound/public-http/routes/site/pages.ts:137`) — no theme
CSS is requested at all and no theme toggle appears. With the theme's tokens never emitted, the
author's own CSS fallbacks win, and `pages_write_html`'s contract specifies those as
`var(--accent, #8a4b2a)` (burnt orange) over `var(--surface-2, #f6f2ef)` (cream). That is the peach.

**The actual gap.** An `"html"`-format Page should be able to render through the active theme's
`page-shell` template. It cannot, because **there is no per-page template selection anywhere in the
system** — verified: every `templateId` in the codebase is site-level provenance (`"starter"`,
`platform/site-dir/*`), never a page's shell choice. `contracts.ts:126` documents a theme's
`templates` array (`["blog-post.html", "page-shell.html"]`) but nothing selects one for a Page.
This also means **no catalog tool can exist for it yet** — the assistant correctly reported it cannot
fix this from chat. It is a Tovu code change first, a tool second.

Related, already known: this is the same family as the three-diverging-render-paths problem. Confirm
which of the three the fix belongs in before writing code.

**Second finding — theme pages have no "don't publish" switch.** Public routing for a static theme is
driven purely by file presence: any `.html` under the theme's `render/pages/` that is not declared as
a template shell becomes a public URL automatically (`isStandaloneThemePage`,
`features/theme/theme.ts:650`). There is no draft/unpublished state for a theme page. The assistant
worked around this for `/pricing` by moving `pricing.html` into `_unpublished/` inside the theme and
dropping it from `theme.json` — reversible, bytes intact, but a convention it invented, not a feature.
**Decide whether that convention becomes real** (an ignore rule or a declared `unpublished` list) or
whether theme pages get a genuine publish flag. Until then `_unpublished/` is undocumented and the
next person to touch that theme will not know it means anything.

**Smaller, independent:**
- Footer menu still links `/team`, which is a draft page — a live dead link. Fix or drop the link.
- Open question the assistant raised and the owner has not answered: re-skin those five pages to a
  neutral white/grey fallback palette (~15 min) as a stopgap. That hides the peach where it is
  visible but does not fix the shell problem. Do it only if the real fix is not being picked up now.

**Already landed in that session** (theme edits, live, uncommitted): `/pricing` unpublished as above;
header nav rewritten to How It Works / Quickstart / Docs / FAQ / About with all five verified
resolving; the header's Legal dropdown dropped (Terms/Privacy remain in the footer); the theme's demo
Pricing/Changelog/Download/Blog links removed; and a light-mode fix,
`:root[data-theme="light"] .site-header { background: #ffffff; }`, replacing an 82%-blended tinted strip.

---

## Deployment — the owner's 3-session-running goal is more built than it looks (verified 2026-08-30)

**Filed as a todos-audit correction, not a fresh gap report.** The dispatch brief for this audit
described deployment as the owner's stated goal for three sessions running "with essentially no work
done" and "not appear[ing] as an actionable backlog item at all." **That premise is wrong when checked
against current source** — real, substantial, committed code exists on both sides:

- **Admin UI** (`apps/admin/src/features/deployment/`): 6,354 lines across `Deployment.tsx` (tab
  shell), `OverviewTab.tsx`, `StaticSiteTab.tsx` (1,568 lines), `DockerfileTab.tsx` (439 lines),
  `FullSiteTab.tsx`, `HistoryTab.tsx`, plus a `hooks/` directory of port/dependency/use-* pairs
  (`use-static-publish.hooks.ts`, `use-static-export.hooks.ts`, `use-dockerfile-source.hooks.ts`,
  `use-publish-credentials.hooks.ts`) and their own unit tests.
- **Backend** (`apps/website/src/`): `platform/export/site-exporter.ts` (872 lines, real static
  exporter — timeout-bounded, per-route failure isolation, fixed in commit `355ccbbb` 2026-08-28),
  `features/deployments/static-publish/` (S3-compatible publish target at 832 lines, a 693-line
  `verify.ts` post-publish check, `publish-run.ts`, `publish-history.ts`, `credentials.ts`,
  `adapter.ts`), `features/deployments/dockerfile.ts` + a real repo-root `Dockerfile`/
  `Dockerfile.dockerignore`, and admin HTTP routes `publish-site.ts`, `export-site.ts`,
  `deployment-overview.ts`, `publish-credentials.ts`. 23 test files under
  `features/deployments/`+`platform/export/`. All of this is **committed** (landed by 2026-08-28,
  `git log` on the key files, no uncommitted working-tree changes in either directory) — not
  in-progress scaffolding.
- Confirmed real, not a stub: `git status --porcelain` on both directories is clean, and
  `deployment-constraints.md` itself (see below) is dated *before* the exporter/publish work landed,
  which is why its own §3 table is now stale.

**What is genuinely still open, from `development/docs/deployment/deployment-constraints.md`** (the
2026-08-13/15 debate-sourced doc, `194` lines, last touched 2026-08-27 — **now itself partly stale**:
its §3 table row "Static exporter: Does not exist… `grep` for `StaticExporter`/`exportSite` returns
nothing" is **false** as of current source; re-verify the rest of that table before trusting it):
- **§4.1 — multi-workspace hosting does not exist.** One running process resolves exactly one
  workspace at boot (`src/platform/site-dir/resolve-workspace.ts:15-21`). This is the doc's own
  stated gate for any *hosted-SaaS* deployment product (§9) — self-host/export/publish-to-a-bucket
  paths (what the code above actually builds) don't need it, but "click Deploy, get a URL" for a
  non-technical user does.
- **§9 — the product question is still unanswered**: hosted SaaS (Deploy panel nearly empty:
  Publish/domain/status) vs self-hosted (Providers tab with credentials) serve different users, and
  the doc says the existing stub was shaped for the wrong one. Whether the *current* `Deployment.tsx`
  UI (Overview/StaticSite/Docker/FullSite/History tabs) resolved this question one way or just built
  through it was not checked in this pass — worth a direct look before assuming it's settled.
- **Not independently verified this pass**: whether the built pipeline actually succeeds end-to-end
  against a real host (S3-compatible bucket, a live Docker build) — code existing and tests passing is
  not the same claim as "the owner can click Deploy and get a working live site," and no live
  deploy was attempted here (would need real credentials and is outside a todos-audit's scope).

---

## `content/themes/` vs `sites/` have drifted in load-bearing ways — an upgrade would silently break the live site (verified 2026-08-30)

**This is the gap the project memory `[[project_tovu_upgrade_destroys_themes]]` describes from the
other direction** (upgrading Tovu destroys live theme edits because `sites/` is gitignored and themes
live inside the install dir) — this entry documents the CURRENT, concrete drift on `tovu-com`'s
`basic` theme, verified with `diff -rq content/themes/static/basic sites/tovu-com/themes/static/basic`:
`css/theme.css`, `render/pages/404.html`, `render/pages/index.html`, `render/pages/pricing.html`,
`render/partials/footer.html`, `render/partials/nav.html`, `theme.json`, `tokens.light.json` all
differ.

Two of those differences are functionally load-bearing, not cosmetic:

- **`render/partials/nav.html`** — live carries `data-embed-config='{"type":"menu",
  "id":"menu-header-nav","variant":"tree"}'` on the header menu; tracked has the same marker
  **without** `"variant":"tree"`. This is not stylistic: `static-render.ts:267` picks
  `renderMenuTree` only when `marker.config.variant === "tree"`, else the flat `renderMenuLinks`
  (`static-render.ts:168`), and `renderMenuLinks`'s own doc comment (`static-render.ts:188`) says it
  drops every nested-menu hook "on the floor." Confirmed live: `nav.html` already carries an inline
  comment recording this exact reasoning (added this session). **An upgrade that copies the tracked
  theme over the live one would silently delete the Docs dropdown** (or whatever menu currently
  relies on the tree variant) with no error — the flat renderer degrades gracefully, so nothing
  breaks loudly.
- **`render/partials/footer.html`** — live footer's "Product" column drops the Pricing link tracked
  still ships, and its "Resources" column points Docs at `/documentation` (absolute path, bypassing
  the `<name>.html`→`/<name>` rewrite) where tracked still links `docs.html`. Live already carries
  inline comments (added this session) recording that the "Pricing removed because pricing.html was
  unpublished" note is **no longer true** — `pricing.html` is back in `render/pages/`, listed in
  `publishedPages`, and `/pricing` returns 200 — and that `docs.html` 404s because `docs` was never
  added to `publishedPages`, while `/documentation` is the real, separately-published page. An
  upgrade would restore the dead `docs.html`/absent-Pricing-caveat link shape.

`sites/` is gitignored (confirmed: `git status` shows no `sites/` changes despite the diffs above), so
**the tracked copy under `content/themes/` is what any future `tovu init`/theme-reinstall/upgrade
path would deploy** — reverting these live fixes with no warning. No fix attempted here (out of
scope for a todos audit); flagging so the next theme-sync or upgrade-safety pass knows this drift
exists and isn't cosmetic.

---

## Footer dead links on the live site — re-verified 2026-08-30 against a running `:3000`

**Corrects/narrows the version of this claim carried into this audit's dispatch brief.** Curled every
link the rendered homepage footer actually emits (`curl :3000/`, extracted via regex, then checked
each individually — not inferred from `theme.json` alone):

| Link | Status | Why |
|---|---|---|
| `/download` | **404** | `download` is in `basic`'s `theme.json` `pages` list but not in `publishedPages` (`["about","blog","pricing","signin"]`) |
| `/changelog` | **404** | same — in `pages`, not in `publishedPages` |
| `/signup` | **404** | same — in `pages`, not in `publishedPages` |
| `/team` | **404** | **different root cause** — not a theme page at all; it comes from the `menu-footer-nav` embedded menu, and `/team` is a **draft Page entity** in the DB (see the "HTML-format Pages render in the fallback shell" entry above, which independently found this same link). Fixing `publishedPages` will not fix this one. |
| `/blog` | 200 | now live — `blog` **is** in `publishedPages` today (this has changed since the brief was drafted; do not assume it's still dead) |
| `/documentation`, `/about`, `/signin`, `/contact`, `/faq`, `/terms-of-service`, `/privacy-policy` | 200 | all fine |

**Root cause for the theme-allowlist ones (`download`/`changelog`/`signup`):** `basic`'s
`theme.json.publishedPages` is an explicit allowlist separate from `pages` (the full set of `.html`
files the theme ships) — a page can exist, render fine if hit directly... actually does not: confirmed
by curl, an unlisted page 404s outright, it is not merely "unlinked." The footer partial links to all
of them unconditionally regardless of `publishedPages`, so the footer is generating guaranteed 404s by
construction. Either add `download`/`changelog`/`signup` to `publishedPages`, or stop linking pages
that aren't published — the current combination is the bug.

---

## 🐛 BUG, filed 2026-08-30 — opening the assistant dock corrupts the Visitor's AI Assistant form state

**Reproduced twice in a real browser** (per this audit's dispatch brief, which this entry files
verbatim plus a source-level lead): opening the admin `AssistantDock` flips a working, saved Gemini
key's status from `Key works — 39 models available` to `API key not valid. Please pass a valid API
key.` plus `Not saved yet — press Save.` A page reload restores it, so nothing is actually persisted —
but the **Save button is left enabled over a bad value**, which is the dangerous part: an operator who
doesn't reload and just presses Save could overwrite a good stored key with garbage.

**Not fully root-caused this pass** (would need a live repro session, which this audit didn't run —
see `[[feedback_live_agent_tests_via_browser_not_cli]]`), but a concrete lead worth checking first:
`AiAssistant.tsx`'s `VisitorCredentialForm` (`apps/admin/src/features/ai-assistant/hooks/
use-visitor-credential-form.hooks.ts`) owns this exact string pair (`ai-assistant-i18n.ts`: `"Key
works — {count} models available."` / `"Not saved yet — press Save."`) and has a "discovery on load"
effect (`useEffect` keyed on `[stored?.isSet, baseUrl, protocol]`) that re-probes the provider with
`{ ...config, apiKey: "" }` whenever `stored.isSet` flips — relying on the server substituting the
already-saved key. Separately, `AssistantDock.hooks.tsx`'s `useLocalCliSelection` (line ~511) reads
and, on a change, writes+broadcasts `EXECUTION_NAMESPACE = "core.execution"` via
`publishSettingsRefresh([EXECUTION_NAMESPACE])` — the same namespace `execution-settings.ts`'s header
comment says drives a `useSettingsSlice.refresh()` that "replaces the WHOLE in-memory value with
whatever `loadExecutionConfig` returns" on **any** out-of-band settings-changed signal, including a
same-tab echo. That mechanism is documented there as specifically an ADMIN-BYOK-key problem
(`reconcileExecutionConfigRefresh`), and `execution-settings.ts`'s own header says "Settings →
Execution mode deliberately does NOT opt in [to the stored-credential probe] — different key" from the
Visitor's site credential — so it's not a proven match. Flagging it because it's the only shared
mechanism found by grep in the time available (`EXECUTION_NAMESPACE`, `publishSettingsRefresh`,
`reconcileExecutionConfigRefresh`), not because it was confirmed to fire on the Visitor form. Next
step: reproduce with the browser devtools Network tab open on the Visitor's AI Assistant screen while
opening the dock, and see whether a `listModels`/discovery call fires with an empty or stale key at
the moment the dock opens.
