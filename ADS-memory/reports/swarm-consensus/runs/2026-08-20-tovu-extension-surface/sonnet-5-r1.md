# Round 1 — Claude Sonnet 5 (adversarial reviewer, non-voting)

Role: adversarial reviewer. Excluded from agreement math per `skills/swarm-consensus/SKILL.md`
(same model family as the primary; same-family peers weaken independence).

**Independence check (self-reported):** did not read either forbidden file. Did read
`ADS-memory/reports/architecture/ADR-057-site-glue-tier.md` in full — explicitly fair game.

**Packet verification (self-reported):** checked theme tiers, both capability vocabularies, the
ADR-057 dispatch table, integrity-before-import ordering, `COMPONENTS`' 12 entries, embed marker
rules, `plugin-identity` string-comparison signing, the three "no install/uninstall route"
citations, INV-03, and `outputEscape: "escape"`. Reported **no wrong rows**.

**Primary's independent verification of the two load-bearing new claims (2026-08-20):**
- `ADS-memory/reports/architecture/ADR-057-site-glue-tier.md` exists. Line 3:
  `Status: **DRAFT — not accepted.** Written for owner review; not self-approved.` Line 52 contains
  the quoted text verbatim, including "no marketplace, ever" and "Tier-3 execution semantics,
  forever local." **CONFIRMED.**
- `src/widgets/registry.ts:11` reads: *"core-owned code in v1, ADR-024 Tier-2/3-gated for any
  future plugin-contributed dynamic type"*. `src/widgets/resolvers/index.ts` defines
  `CORE_RESOLVERS`. **CONFIRMED.**

---

## Position

Keep the two mechanisms separate — not for a vague "two audiences" reason, but because
`plugin-runtime` and `site-glue` sit on two *orthogonal* trust axes (distribution/execution trust
vs. authorship/reviewability trust), and site-glue is architecturally barred from ever being
marketplace-distributed. "Merge them, gate by tier" is not a live option once ADR-057 is read.

For Q-B, Tovu already shipped a closed, tiered, data-driven contribution model for exactly this
problem (the widget IR/resolver system) — the honest answer is "extend that," not invent a sixth
thing. Taxonomy should stay capability-strings, but every capability needs a published payload
JSON Schema before its call site is called "wired."

## Q-A — Separate

ADR-057 Decision 1 states it directly: site-glue's code "is never distributed (REQ-18 is explicit:
no marketplace, ever)," so on ADR-024's ladder it has "exactly one, permanently fixed answer:
Tier-3 execution semantics, forever local." What varies for glue is a second, orthogonal axis
ADR-024 never needed — authorship/reviewability (`staged → approved-active → quarantined/disabled`,
per-module in a `site_glue_activations` row) — because "Site Glue's code has no publisher — an
agent wrote it, in place, for one site."

Tier therefore **cannot** be the join: site-glue never varies on the tier axis at all.

**Caveat it flagged itself:** ADR-057 is `DRAFT — not accepted`. Real, sourced, well-reasoned
prior work, but not ratified. Treating it as settled would be an error in the other direction.

**Mechanical argument against merging:** `site-glue/manifest.ts:44-48` and `capability-gate.ts`
re-declare the three shared capability strings as independent literals *specifically so the module
carries no dependency on the sibling mechanism* — stated in two file headers. Integrity hashing
(`loader.ts:167`) makes sense against a distributed artifact of unknown provenance; it is a no-op
against code shipping in the same deploy as core. Forcing glue through it either hashes files
against themselves for no benefit, or reintroduces a conditional inside one merged system.

**Principled boundary: distribution origin, not capability surface.** But the capability
*vocabulary* should still be unified — collapse the duplicated 3-string literal into one shared
imported type, since glue's 8-member set is already a superset.

## Q-B — Extend the widget registry; do not invent a shape

`src/widgets/registry.ts` + `src/widgets/resolvers/index.ts` already solved this. A
`WidgetTypeRegistration` is JSON-serializable data (schema, `capability`, `placementContexts`,
cost `clamps`, a `resolverId` string) — Tier-1-safe by construction, because *registration* is
data while *behavior* resolves through a closed core-owned `CORE_RESOLVERS` map: "the ONE place a
`resolverId` string resolves against real, executable code... never used as a dynamic import path,
`eval`-style reference, or arbitrary function lookup anywhere else."

Concretely: `render.contribute` returns a `WidgetRenderIR`-shaped `{ componentId, props }`.
- **Tier-1** may only reference *existing* `componentId`s in `COMPONENTS` with schema-validated
  props — pure parametrization, zero code.
- **Tier-2/3** needing a new `componentId` ship a resolver running in the generic `worker_threads`
  sandbox, returning pre-escaped HTML.

Satisfies "genericity belongs in the scanner, not the renderer" exactly: the scanner becomes
pluggable; `COMPONENTS` grows only through a reviewed, sandboxed resolver.

**Rejects** React SSR (zero `react-dom/server` today; a sixth tier is a large new maintenance
surface) and a bare HTML string (defeats per-resolver escaping, reintroduces the four-scanner
drift the embed-marker unification just fixed).

## Q-C — Keep capability strings, not Directus kinds

Not stylistic: WP's fatal flaw is hooks aren't enumerable. Tovu's capability strings already are —
closed TS unions validated against `Set`s at parse time. That gives Directus's enumerability
through a flatter syntax. **Requirement to add:** every new capability string ships with a data
record in the `WidgetTypeRegistration` shape (schema + placement + clamps + resolver pointer).

| Gap | Proposed capability | Min tier | Notes |
|---|---|---|---|
| `render.contribute` | existing | tier-1 for props into existing `componentId`; tier-2 to register new | Reuses widget seam |
| `admin.nav` | `admin.nav.register` (existing) | tier-1 | Pure data. Highest leverage, lowest risk in the table |
| `http.routes` | `http.route.register` (existing) | tier-2 | See Q-E item 4 |
| Cron | `jobs.schedule` (new) | tier-2 | Needs durable-across-restart story; real infra work |
| Field editors | `fields.editor.register` (new) | tier-1 for closed primitive set; tier-2 for custom | |
| Field displays | `fields.display.register` (new) | tier-1 closed formatters; tier-2 custom | |
| Dashboard panels | `admin.panel.register` (new) | tier-2 | Async data + free layout can't be honestly declarative at tier-1 |
| Collection layouts | `content.layout.register` (new) | tier-2 | **Recommends deliberately deferring, possibly permanently** — Directus needs `layout` because it is headless; Tovu's block trees + real site already cover it |
| Plugin i18n | `i18n.contribute` (new) | tier-1 | Pure `{locale:{key:value}}` merged into existing dictionaries |
| Automation steps | `automation.step.register` (new) | **tier-3 only** | Highest blast radius; route through existing command-gateway/change-set revert |

## Q-D — Derive the contract, don't hand-write it

Apply the pattern `tovu introspect` already uses (`src/cli/introspect.ts:82` — `introspectProgram()`
walks the live `commander` tree, so it "has zero drift risk by construction," vs. a hand-kept
`api.spec.md` that "has already drifted once"). Derive from the closed constants already in code
(`GLUE_CAPABILITIES`, `VALID_CALL_SITES`, `CORE_RESOLVERS` keys, `COMPONENTS` keys); expose via
`tovu introspect --format mcp-plugins`.

**The sharper gap than the packet's WP framing:** Tovu's call sites *are* enumerable — but their
**payload shape is not**. `site-glue/manifest.ts:66-69`'s `GlueManifestAttachment` is
`{ callSite, [payloadKey: string]: unknown }` — untyped beyond the call-site name, "owned by
whichever attachment-point adapter eventually reads this call site... **and not yet built for the
three unwired call sites**." An AI reading the current manifest type cannot know what to put in an
`admin.nav` attachment. **Publish a JSON Schema per call site, generated from the TS type the
adapter consumes, BEFORE marking the call site wired** — otherwise "add one member" quietly becomes
a breaking change for anyone who guessed the payload from prose.

## Q-F — Plugin UI in the React admin

- **Mount points:** enumerable as data, same `WidgetTypeRegistration` record pattern.
- **Isolation:** **iframe by default for tier-2/3, not React error boundaries.** A boundary catches
  render-phase throws only — nothing for an infinite loop, a memory leak, or a React-version
  mismatch corrupting the host module graph. Only a separate JS realm contains those, and those are
  exactly the white-screen modes.
- **Version coupling:** ship *compiled, framework-agnostic* output (iframed bundle with its own
  React, or a web component) over module-federation host-React sharing — priority #2 (future
  flexibility) outranks payload size.
- **Tier-1 declarative admin UI:** yes for `admin.nav`, constrained field editors/displays, i18n.
  **No, plainly, for dashboard panels** or anything needing free layout / async composition.

**Sharpest finding:** constraints 1 and 2 intersect worst here. Tier-3 is marketplace-listable;
signing is a string comparison (`plugin-identity.ts:20`; ADR-023 §6 admits the unsigned consent
path "is the load-bearing path"). A Tier-3 admin-panel plugin runs as **same-origin JS inside the
admin React tree with live session/cookie access.** Highest-consequence combination of
already-decided constraints in the packet, and specifically an admin-UI problem — not a
render.contribute or content problem.

**MCP-UI / A2UI / gen-ui: red herring for this surface.** Confirmed live, but it renders UI for an
AI agent's chat session — a different audience than a plugin's admin-nav entry or field editor,
which must exist whether or not a chat session ever starts. Coupling ordinary CRUD-admin plugin UI
to the assistant runtime's versioning buys nothing.

## Q-E — Sequencing

1. Unify the capability type + **publish JSON Schemas for the three unwired call sites before
   wiring their adapters.** Cheap, zero runtime risk, directly serves AI-legibility.
2. `admin.nav` + i18n — both tier-1, pure data, highest leverage, cheapest.
3. `render.contribute` via the existing widget seam — extend, don't invent.
4. `http.routes` — genuinely new design: namespace under `/api/plugins/<pluginId>/...` mirroring
   the `ext.{pluginId}.{field}` namespacing at `manifest.ts:256-262`; default-deny auth; **per-plugin
   token-bucket rate limiting, not per-route**, so one plugin can't exhaust capacity via many
   cheap routes.
5. Defer: cron, dashboard panels, collection layouts, automation steps.
6. **Before ANY of this ships with Tier-3 marketplace-listability live: land install/update/
   uninstall routes (Q-G).** There is currently no route to revoke a bad install at all. Not a
   sequencing nicety — it means "Tier-3 listable in marketplace" is not deployable today.

## Q-G (addressed inline)

`post.ts:64` INV-03 + `plugin-identity.ts` permanent-id-retirement already imply the answer: purge
deletes files + activation state, **never `ext` data or DB tables, never frees the id.** Finishing
the policy is mostly building the missing routes, not inventing new rules.

## Strongest objection to its own position

Its Q-B answer (route new componentIds through the worker sandbox) "sounds elegant but I did not
verify its performance shape." `liquid-sandbox.ts`'s own doc says **one Worker spawn/teardown per
call, no pooling.** A page with N plugin-contributed regions could mean N worker spawns per render
— a cost cliff absent from today's in-process `COMPONENTS` call. Self-identified as the most
load-bearing unverified assumption in its answer.

## What it would need to verify

- Worker sandbox perf/pooling under N contributed components per page (above).
- Whether draft payload schemas for the three unwired call sites exist somewhere (searched
  `site-glue/` only).
- ADR-057 Decisions 2-6 (read the header and Decision 1 closely, not full depth).
- **Scope question: there are THREE plugin-shaped systems in the repo, not two.** The packet
  frames it as two; `src/features/agent-plugins/` (agent-plugins.org format for Skills/MCP servers,
  content-addressed per-workspace isolation) is a third. It treated this as legitimately out of
  scope based on a prior debate decision cited in `capability-projection.ts`'s header — but flags
  that as **its inference, not something the packet confirmed.** Worth checking explicitly.
