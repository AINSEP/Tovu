# Implementation Outline: skills-composer-typeahead

- Spec: NONE — brownfield Agent Direct Mode dispatch. No spec package, no Planning Preflight, no Red-Team, no ADR (owner rule: build a slice before writing an ADR). Gap noted per AGENTS.md Agent Direct Mode; proceeding with available context, not blocking.
- ADR: none (deliberate)
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity
- Date: 2026-08-26
- Author: Software Architect

**Goal.** Make installed standalone Agent Skills (`infra/skills/ws/<workspaceId>/<dir>/SKILL.md`) appear in the admin chat composer's `/` typeahead and do something real when selected.

---

## 0. Corrections to the dispatch brief

Three of the brief's premises are wrong. Everything downstream in this outline is built on the corrected versions.

### C1 — `skill:ui-ux-design` has NO `resolve`. There is no binding to match.

The brief says "The bundled Skill-flavored entry (`skill:ui-ux-design`, `composer-capabilities.ts:270-282`) already has one — match its binding."

It does not. Verbatim, `apps/admin/src/features/plugins/composer-capabilities.ts:270-282`:

```ts
  {
    groupId: "skills",
    groupLabel: "Skills / Design toolbox",
    item: {
      id: "skill:ui-ux-design",
      label: "UI/UX Design (Skill)",
      description: "Portable skill from the ui-ux-design Agent Plugin",
      kind: "skill",
      keywords: ["skill", "design", "ui", "ux"],
      insertText: "UI/UX Design skill",
    },
  },
```

No `resolve`, no `pluginRefId`, no `command`. Selecting it types the literal string `UI/UX Design skill` into the draft and nothing else. It is **inert** — the exact failure the owner fixed on its sibling row on 2026-08-21 (`composer-capabilities.ts:100-107`: "previously `insertText` typed an inert label string into the draft; the agent had no way to tell that apart from the user having typed the same words themselves").

The only *working* binding precedent in the bundled catalog for skill-shaped content is `pluginRefId` on `agent-plugin:ui-ux-design` (`composer-capabilities.ts:268`). Q2 is answered against that, not against `skill:ui-ux-design`.

### C2 — `ui-ux-design` is an Agent Plugin, not an installed standalone Skill. There is no collision today.

The brief says "`ui-ux-design` exists both as a hand-written row AND as a real installed thing, so a naive add creates duplicates."

The two trees are separate and neither contains a `ui-ux-design` *standalone skill*:

- `infra/agent-plugins/ws/workspace-local/packages/sha256/f64f7a62…/plugin.json` → `"name": "ui-ux-design"` — an Agent **Plugin** bundling 7 skill folders (`frontend-accessibility`, `gstack-design`, `interface-design`, `shadcn-ui`, `ui-ux-design`, `vercel-web-design-guidelines`, `web-compliance`).
- `infra/skills/ws/workspace-local/` → contains exactly one entry: `incident-response`.

`loadInstalledSkillToolSources` (`src/features/skills/tool-registrations.ts:243`) reads only the second tree (`resolveSkillLayout()`, `src/features/skills/layout.ts:83`). It will produce **one** row today: `incident-response`. It cannot produce `ui-ux-design`.

So there is no duplicate to dedupe **today**. There is still a real latent hazard (§Q3 / INV-001) — the id-collision *class* is live even though no instance of it is — and the design must close it, because the blast radius is the entire menu, not one row.

### C3 — `/api/tools/search` already reaches installed skills from the browser. It is still the wrong source.

The brief implies the browser has no path to `infra/skills/…`. It does, indirectly, and it has since the skill-tool registrar landed:

- `registerInstalledSkillTools(registry, …)` runs at `src/server/agent-daemon/agent-daemon-server.ts:887`, **before** `buildToolCatalogQuery(registry)` at `:927` — placement the code comments as deliberate (`:877-880`: "a tool registered after it is executable but INVISIBLE to `search_tools`").
- `sourceForToolId` (`src/assistant/tool-catalog-query.ts:36`) derives `source` from the id prefix, so `skill_incident_response` lands in the catalog with `source: "skill"`.
- `app.get("/api/tools/search", …)` at `src/server/modules/assistant.ts:433`, gated by `requireAdminSession` at `:432`, proxies that catalog to a signed-in admin's browser.

So a `/api/tools/search?q=incident` from the admin page **would** return the incident-response skill today. That route is nonetheless rejected as the menu's source — see §Q1 for the six reasons, each with a line cite. The point of stating it here is that "no transport exists" is not the reason a new route is needed; "the existing transport cannot answer the question the menu asks" is.

---

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Browser app (`apps/admin`) must read a server-side filesystem tree (`infra/skills/`) — three packages: admin SPA, Tovu express server, agent daemon | `apps/admin/src/features/plugins/composer-capabilities.ts:118-122`; `src/features/skills/layout.ts:83` |
| Contract Change | yes | New public HTTP contract `GET /api/admin/v1/workspaces/:workspaceId/skills`; new exported `ComposerCapabilitySource` | `src/server/routes/admin/plugins/list.ts:22` (convention being mirrored) |
| System Wiring | yes | New server module registered in the composition root; new source added to `projectComposerCapabilities`'s source list | `src/server/app.ts:1009`; `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:601` |
| Data And Persistence | no | Read-only filesystem enumeration. No schema, no table, no migration, no write path. | `src/features/skills/tool-registrations.ts:243` (`readdir`/`readFile` only) |
| Brownfield Dependency | yes | Must not break the five existing bundled rows, the `pluginRefId` chip rail, or `/mcp`'s route macro | `composer-capabilities.ts:221-331`; `AssistantDock.hooks.tsx:868-911` |
| Reverse-Spec Or Migration | no | No source-behavior mapping; nothing is being rewritten | — |
| Critical Cross-Boundary Invariant | yes | A duplicate discovery item id **throws** and takes the WHOLE composer menu down, not one row | `composer-capabilities.ts:164-171` + `AssistantDock.hooks.tsx:604-607` |
| Parallelization Ambiguity | yes | Server and browser halves look coupled through `api.ts` but need not be — see §Phase Map for the decoupling that makes them true `[P]` | `apps/admin/src/features/plugins/tool-catalog-composer-source.ts:130-152` |

---

## Q1 — Where does the list come from?

**Answer: a new route must be added.** No route exposes installed standalone Skills today (`src/server/routes/admin/` has no `skills/` directory; nothing under `src/server/routes/` references the skills feature). `/api/tools/search` exists, reaches skills, and is still the wrong source.

### Why not `/api/tools/search`

| # | Reason | Evidence |
|---|---|---|
| 1 | **No enumeration shape.** The backing query refuses an empty query and has no `source` filter, so "list every installed skill" is unexpressible. Any `q` is a guess. | `Jini/packages/sqlite/src/db/tool-catalog/tool-catalog.ts:130` (`if (terms.length === 0) return []`); `:134-138` (no `source` predicate) |
| 2 | **Hard result cap.** Results are `LIMIT`-ed; the existing browser source already pins the endpoint's own ceiling at 25. A workspace with more skills than the cap silently loses rows, with no signal. | `tool-catalog.ts:139`; `apps/admin/src/features/plugins/tool-catalog-composer-source.ts:57` |
| 3 | **Rank contamination.** The FTS index covers `id` and `description`, terms are OR'd, and `id` carries a 6.0 BM25 weight — so `q=skill` matches every tool whose *description* mentions skills, not just `skill_*` tools. False rows in an operator-facing menu. | `tool-catalog.ts:58-63`, `:127`, `:134` |
| 4 | **Provenance is missing.** The catalog stores only `{id, description, input_schema_json, source}`. It does not carry `skillName` — the unsanitized frontmatter `name` — which is exactly the string a menu row should show as its label. | `tool-catalog.ts:50-56` vs `src/features/skills/tool-registrations.ts:224-227` (`SkillToolSource.skillName`) |
| 5 | **Boot-snapshot staleness.** `buildToolCatalogQuery` seeds an in-memory SQLite index once from `registry.list()` at daemon startup. Dropping a new skill folder on disk does not appear in the menu until the daemon restarts. | `src/assistant/tool-catalog-query.ts:44-49`, `:64-80`; called once at `agent-daemon-server.ts:927` |
| 6 | **Daemon coupling.** `/api/tools/*` is a proxy to the agent daemon; a booting or unreachable daemon returns 503/502. The skills tree is plain filesystem the Tovu express server can read with no daemon involved at all. | `src/server/modules/assistant.ts:425-431` |

Reasons 1, 2 and 5 are individually disqualifying for a menu that must be *complete* and *current*. Reason 4 is disqualifying for one that must be *labelled*.

### The route

`GET /api/admin/v1/workspaces/:workspaceId/skills` — the same path grammar, workspace guard, and authorize/handle/project shape as `PLUGINS_LIST` (`src/server/routes/admin/plugins/list.ts:22-26`), mounted through a new server module registered next to `createPluginsModule` (`src/server/app.ts:1009`).

It reads disk **per request** via the existing `loadInstalledSkillToolSources` (`src/features/skills/tool-registrations.ts:243`), which is the same function the daemon uses at boot — so the menu and the agent's tool registry can never disagree about which skills exist or what their ids are.

---

## Q2 — What `resolve` should each entry carry?

Per C1, there is no existing skill binding to match. The design space is the two verified `ComposerHostBinding` kinds (`composer-capabilities.ts:41-64`) plus the `pluginRefId` pin rail (`:100-117`).

| Candidate | Verdict | Reason |
|---|---|---|
| `allowlisted-tool-call` → `skill_<name>` | **Rejected** | The allowlist is a static, per-tool, operator-owned set (`MCP_UI_REDEEMABLE_TOOL_IDS`). Skill tool ids are minted from disk at runtime, so they can never be pre-allowlisted; every selection would 403 with `TOOL_NOT_ALLOWLISTED`. Also wrong surface: the result would land in the MCP-UI tool-call response path, not in front of the agent. |
| `compose-text` with the full `SKILL.md` markdown | **Rejected for v1** | This is what `toTovuComposerCapability` does for Agent-Plugin skills (`agent-plugin-capability-adapter.ts:96-104`). It defeats progressive disclosure, which `tool-registrations.ts:26-34` names as the whole point of the format ("discovery sees only `name`/`description`; the full body is read only once the task actually matches"), and it forces the route to ship every skill's full body to the browser on every menu open. |
| `compose-text` **pointer** naming the real tool id | **SELECTED for v1** | ~1 line of text naming `skill_<name>`, which is a real, registered, executable tool proven live. Zero daemon changes, zero new state, zero new wire fields. This is not an invented shape: `resolve-agent-plugin-refs.ts:70-73` already defines a first-class `pointer` delivery mode as "~400 bytes naming the exact tool call that returns that SAME SKILL.md", currently under an active A/B (`TOVU_AGENT_PLUGIN_DELIVERY`, `:78-84`) where "nobody yet knows which wins." |
| `skillRefId` pin rail (sibling of `pluginRefId`) | **Deferred — OWNER DECISION D-2** | Structurally strongest and matches the most recent live decision (2026-08-21). But it costs a new `contextRef` wire field, a new server resolver, a new daemon call site, new browser state, and a second chip tray — ~8 files across three packages, for a *stickiness* property the owner has not asked for on skills. See §Owner Decisions. |

**v1 contract, per discovered skill:**

```
resolve: () => ({ kind: "compose-text", text: <pointer text naming source.toolId and source.name> })
```

Why `compose-text` here is genuinely non-inert, unlike `skill:ui-ux-design`: the 2026-08-21 fix was about a *label* string ("UI/UX Design skill") that the agent could not distinguish from user typing. A pointer naming a real, callable tool id is an instruction the agent can act on — it is the same content the `pointer` arm delivers server-side, just delivered through the draft.

**The pointer text is a new admin copy string and therefore its own i18n key.** It must be added, never edited in place (an in-place edit reverts the string across 21 locales). It passes through `props.t(...)` at render time only for *labels/descriptions* (`Jini/packages/chat/src/react/components/ComposerDiscovery.tsx:85`, `:87`, `:98`); the draft text does not, so it needs the dock's own translator at build time.

A discovered skill's **label** and **description** come verbatim from author frontmatter (`SkillToolSource.skillName` / `.description`). They are content, not admin chrome — they pass through `t()` and fall through untranslated by that function's documented two-step fallback. Correct; add no keys for them.

---

## Q3 — Do the five hardcoded entries stay, get replaced, or get deduped?

**Four stay. One is proposed for deletion. Dedupe is replaced by namespace separation.**

| Bundled id | Disposition | Reason |
|---|---|---|
| `regular-plugin:word-count` | **Stays** | Plugin-runtime plugin, not a skill. No overlap. |
| `agent-plugin:ui-ux-design` | **Stays unchanged** | The one working row. Its `pluginRefId: "ui-ux-design"` already injects `skills/ui-ux-design/SKILL.md` via `resolveAgentPluginRefs` (`resolve-agent-plugin-refs.ts:33-36`). Do not touch. |
| `skill:ui-ux-design` | **DELETE — OWNER DECISION D-1** | (a) Inert: no `resolve`, no `pluginRefId` (C1). (b) Redundant: the content it gestures at is *already delivered* by the row above it, working. It is a duplicate delivery path minus the working part. (c) Ambiguous: once a "Skills" group means `infra/skills/`, a second row in it meaning "a skill inside an Agent Plugin" makes the group mean two things. |
| `mcp:settings` | **Stays** | Client-local route macro, resolved before capabilities (`AssistantDock.hooks.tsx:873-877`). Untouched. |
| `tool:content-search` | **Stays** | The only live `allowlisted-tool-call`. Untouched. |

### Instead of dedupe: a namespace that cannot collide

Discovered rows get id `installed-skill:<toolId>` — e.g. `installed-skill:skill_incident_response`. This is not cosmetic. It is the enforcement surface for INV-001:

- `projectComposerCapabilities` **throws** on a duplicate item id across sources (`composer-capabilities.ts:164-171`).
- `useComposerCapabilities`'s `.catch` logs and leaves the projection at the **empty** one (`AssistantDock.hooks.tsx:604-607`, `emptyComposerCapabilityProjection`, `composer-capabilities.ts:141-146`).
- Therefore **one** colliding id erases the entire menu — `/search`, `/mcp`, the plugin pin, all of it. Not a degraded row: a dead feature.

With the `installed-skill:` prefix, a future `infra/skills/ws/workspace-local/ui-ux-design/` folder mints `installed-skill:skill_ui_ux_design`, which cannot equal `skill:ui-ux-design`. Internal uniqueness *within* the discovered set is already guaranteed server-side: `loadInstalledSkillToolSources` throws on two folders declaring the same frontmatter `name` (`tool-registrations.ts:280-285`).

Two independent guarantees, and no cross-source lookup is needed — which matters because a `ComposerCapabilitySource` cannot see the other sources' output by contract (`composer-capabilities.ts:124-127`).

**Do not use `skill:<name>` for discovered rows.** It is the one prefix that can collide with a bundled row, and it is the prefix a naive implementation will reach for first.

---

## The 2026-08-21 decision on `createToolCatalogComposerCapabilitySource` — re-read and HONOURED

Re-read in full at `AssistantDock.hooks.tsx:571-579` and `tool-catalog-composer-source.ts:11-25`. Verbatim reasoning:

> "the menu's job is to let a user point the assistant at a Skill or Agent Plugin whose instructions it should follow, not to hand it a raw tool name (the assistant already picks its own tools once it understands the goal)."

**This design does not contradict that decision and does not reverse it.** Three points, stated explicitly so nobody later reads this outline as a quiet reversal:

1. The tool-catalog source stays unwired. This outline adds a **third** source; it does not re-add the second. `AssistantDock.hooks.tsx:601` becomes a two-element array, not three.
2. The decision's own words carve out exactly what this ships: "point the assistant at a **Skill** … whose instructions it should follow." An installed standalone Skill is that thing, named. The thing it excluded was "a raw tool name."
3. The decision's second stated reason — "structurally inert — every capability it produces carries no `resolve`" — is the failure mode this design is built to avoid (§Q2). The new source's rows carry a real `resolve`.

**One tension, flagged rather than buried.** A skill's *transport* to the agent in v1 is a pointer at a `skill_*` tool id, and a `skill_*` tool id is a tool name. The distinction that keeps this inside the decision: the operator selects and sees **"Incident Response"** (the skill's own name, its own description); the tool id appears only inside generated draft text, never as a row label the operator has to recognise. If the owner reads that as violating the spirit rather than the letter, the fallback is D-2 (the `skillRefId` pin rail), which routes the same content with no tool id in the browser at all.

---

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `features/skills` (existing, server) | `infra/skills/` tree, `skill_*` tool ids, frontmatter parsing | Already owns loading + tool registration. **Unchanged by this work.** | `loadInstalledSkillToolSources`, `SkillToolSource` | `node:fs/promises`, `@jini-ai/cms/core` | New route consumes it read-only; do not modify |
| `server/http/admin/skills` (new) | Wire projection | Pure `SkillToolSource[] → SkillSummary[]`. No I/O. | C-002 | none | Mirrors `server/http/admin/plugins.ts` |
| `server/routes/admin/skills` (new) | HTTP surface | Workspace guard → authorize → load → project → JSON | C-001 | `features/skills`, `AuthorizeFn` | Mirrors `routes/admin/plugins/list.ts` |
| `server/modules/skills` (new) | Mount point | Registers the route on the express app | C-003 | route registrar | Mirrors `modules/plugins.ts` |
| `features/plugins` (existing, admin) | Composer capability projection | Gains a third source; `BUNDLED_CAPABILITIES` loses one entry | C-004, C-005 | `@jini-ai/chat/react` | Same-layer; no new admin feature slice |
| `components/AssistantDock` (existing) | Source list wiring | One-line change to the projected source array | — | `features/plugins` | Do not add the tool-catalog source |

---

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/server/http/admin/skills.ts` | http/admin | creates | C-002 | Wire-shape projection | Pure/testable half, split from the route — the split every `http/admin/*.ts` already keeps | Never emits `markdown` or `bundledFiles` |
| `src/server/routes/admin/skills/deps.ts` | routes/admin/skills | creates | C-003a | Narrow `RouteDeps` slice | `routes/admin/plugins/deps.ts` convention — narrow, never widen | Type-only |
| `src/server/routes/admin/skills/list.ts` | routes/admin/skills | creates | C-001 | The route handler | Route boundary | Must catch the duplicate-name throw |
| `src/server/modules/skills.ts` | server/modules | creates | C-003 | Module handle | ADR-046 Phase 3 server-module convention | Mirrors `modules/plugins.ts` |
| `src/server/app.ts` | composition root | changes (2 lines) | — | Mounts the module | Composition root | Import + `mountRoutes` beside line 1009 |
| `apps/admin/src/features/plugins/installed-skills-composer-source.ts` | features/plugins | creates | C-004 | Live `ComposerCapabilitySource` over C-001 | Sibling of `tool-catalog-composer-source.ts`; one source per transport | Must degrade to `[]` on ANY failure |
| `apps/admin/src/features/plugins/composer-capabilities.ts` | features/plugins | changes | C-005 | Removes `skill:ui-ux-design` + its group (D-1) | Existing owner of the bundled catalog | No contract change to the file's exported types |
| `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx` | AssistantDock | changes (1 line + doc) | — | Adds the new source at `:601` | Existing wiring site | Update the `:571-579` doc block; do NOT delete it |
| `apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts` | AssistantDock | changes (additive only) | — | New keys for the group label + pointer text | Dock's own dictionary | **Add** keys; never edit an existing string |

`apps/admin/src/lib/api.ts` is deliberately **NOT** in this list — see §Phase Map.

---

## Contract Map

### C-001 — `GET /api/admin/v1/workspaces/:workspaceId/skills`

| Field | Value |
|---|---|
| File | `src/server/routes/admin/skills/list.ts` |
| Kind | Admin HTTP API (read) |
| Why needed | Q1: the only browser-reachable, complete, current, labelled enumeration of installed standalone Skills |
| Job | List every installed standalone Agent Skill for one workspace |
| Inputs | Path param `workspaceId`; admin session cookie |
| Outputs | `200 { skills: SkillSummary[] }`, `SkillSummary = { toolId: string; name: string; description: string }` |
| Validation | `workspaceId !== deps.workspaceId` → `404 { error: "workspace was not found" }` (mirrors `routes/admin/plugins/list.ts:23-26`) |
| Errors | `403 { error, code: "FORBIDDEN", details }` on authorize deny; `500 { error, code: "INTERNAL_ERROR" }` on any throw — **including** the duplicate-frontmatter-name throw at `tool-registrations.ts:280-285`, whose message names both offending folders and must be surfaced verbatim, not swallowed |
| Effect boundary | Reads disk per request. No writes, no events, no daemon call |
| Complexity | O(d·f) — `loadInstalledSkillToolSources`'s own stated cost (d skill folders × f bundled files each) |
| Aggregate-risk | Reuses `loadInstalledSkillToolSources` as-is, which also reads full markdown and walks `references/`/`scripts/`/`assets/` (`tool-registrations.ts:196-201`). Wasted I/O for a list endpoint. Acceptable at today's d=1; if it becomes hot, add a `listInstalledSkillSummaries` that skips `listBundledFiles`. **Do not optimise pre-emptively** — reuse keeps the route and the agent registry provably in sync on ids |
| Trace | Q1; `routes/admin/plugins/list.ts:22` |
| Test seam | Integration test over the express app: 200 shape, 404 wrong workspace, 403 unauthorized, 500-with-message on duplicate names, `{ skills: [] }` on a missing tree (`tool-registrations.ts:250-253` ENOENT fast path) |

**Permission — VERIFY BEFORE CODING.** Recommend `admin.assistant.use`: it is the permission the skill tools themselves declare (`src/features/skills/tool-registrations.ts:333`), and the composer is the assistant surface. `AuthorizeFn.permission` is `string` (`src/core/gated-mutations/ports.ts:28-34`), so this is type-valid — but that proves nothing about whether the identity backend **grants** it to a browser admin principal. It is proven granted for the *agent* principal (the live `skill_incident_response` run). If the admin session is denied, fall back to `admin.plugins.read`, which the working Plugins screen proves is granted. Confirm with a real request before building on it.

**Security — do NOT serialize `bundledFiles`.** `SkillToolSource.bundledFiles` holds **absolute host filesystem paths** (`tool-registrations.ts:176-179`), justified there only because the consumer is a spawned CLI agent with real filesystem access. The browser is a different trust context; the sibling feature states the rule plainly — "no absolute host path ever reaches a tool id, description, schema, or handler output" (`tool-registrations.ts:71-73`, quoting `agent-plugins/tool-registrations.ts`). C-002 is the enforcement point.

### C-002 — `toInstalledSkillsResponse(sources: readonly SkillToolSource[]): SkillSummary[]`

| Field | Value |
|---|---|
| File | `src/server/http/admin/skills.ts` |
| Kind | Exported pure function |
| Why needed | Enforces the wire boundary — the one place that decides what leaves the server |
| Job | Project loaded sources to the three wire fields |
| Inputs | `readonly SkillToolSource[]` |
| Outputs | `{ toolId, name, description }[]` — `toolId` from `source.id`, `name` from `source.skillName`, `description` from `source.description` |
| Validation | none (inputs already validated by the loader) |
| Errors | none — total function |
| Effect boundary | Pure |
| Complexity | O(n) |
| Aggregate-risk | **The drop of `markdown` and `bundledFiles` is load-bearing** (INV-002), not incidental field selection |
| Trace | C-001; `server/http/admin/plugins.ts`'s `toAdminPluginResponse` |
| Test seam | Unit: given a source with non-empty `markdown` + absolute-path `bundledFiles`, assert the output object has exactly the three keys |

### C-003 / C-003a — `createSkillsModule(deps: RouteDeps): ServerModuleHandle` / `SkillsRouteDeps`

| Field | Value |
|---|---|
| File | `src/server/modules/skills.ts` / `src/server/routes/admin/skills/deps.ts` |
| Kind | Exported factory / type |
| Why needed | The composition root's only handle on this route |
| Job | Register C-001 |
| Inputs | `RouteDeps`; `SkillsRouteDeps` narrows to `{ workspaceId, authorize }` |
| Outputs | `ServerModuleHandle` |
| Effect boundary | Pure construction; route registration is the effect |
| Trace | `modules/plugins.ts:24-33`; mounted at `app.ts:1009` |
| Test seam | Covered via C-001's integration test |

### C-004 — `createInstalledSkillsComposerCapabilitySource(): ComposerCapabilitySource`

| Field | Value |
|---|---|
| File | `apps/admin/src/features/plugins/installed-skills-composer-source.ts` |
| Kind | Exported factory implementing the existing `ComposerCapabilitySource` contract (`composer-capabilities.ts:124-127`) |
| Why needed | The browser half; the second real implementation of that interface |
| Job | Fetch C-001, map each summary to one `TovuComposerCapability` |
| Inputs | none (`list()` takes no args) |
| Outputs | `Promise<readonly TovuComposerCapability[]>`, each with `groupId: "installed-skills"`, `item.id: "installed-skill:" + toolId`, `item.label: name`, `item.description: description`, `item.kind: "skill"`, `item.keywords`, `item.insertText: ""`, and a `resolve` returning `{ kind: "compose-text", text: <pointer> }` |
| Validation | Runtime shape-guard every element of `body.skills`; a non-array or a malformed element yields `[]` / is skipped (same posture as `isToolCatalogSearchHit`, `tool-catalog-composer-source.ts:81-89`) |
| Errors | **Never rejects.** Non-2xx, network failure, unparseable body → `console.error` + `return []` |
| Effect boundary | One `fetch` per `list()` call, `credentials: "same-origin"` |
| Complexity | O(1) round trip, O(n) mapping |
| Aggregate-risk | **INV-001.** `projectComposerCapabilities` awaits all sources through one `Promise.all` (`composer-capabilities.ts:160`); a single **rejecting** source takes the whole projection down, including `/search` and `/mcp`. `tool-catalog-composer-source.ts:117-125` states this as load-bearing, not defensive polish. Same rule applies verbatim here |
| Trace | Q1, Q2, Q3 |
| Test seam | Vitest over `list()` with a mocked `fetch`: happy path shape, `resolve` output text, 500 → `[]`, network reject → `[]`, malformed body → `[]`, id prefix is `installed-skill:` |

**`insertText: ""`, not omitted.** An absent `insertText` on the slash path falls back to `label`, typing the row's label into the draft (`composer-capabilities.ts:257-267` documents this exact trap, and the bug it caused on 2026-08-21). The `""` clears the slash trigger while staying falsy for the "+" menu's guard. The `resolve` binding is what produces the draft text.

**No `command` field in v1.** A `command` is a stable untranslated slash word (`Jini/packages/chat/src/react/slots.ts:100-107`). Skill names are author-supplied and could collide with `search`/`mcp`/`ui-ux-design`. Fuzzy matching over label/description/keywords already makes `/inc` find Incident Response (`filterComposerDiscovery`). Adding per-skill `command`s is a follow-up that needs a collision rule first.

### C-005 — `BUNDLED_CAPABILITIES` (changed)

| Field | Value |
|---|---|
| File | `apps/admin/src/features/plugins/composer-capabilities.ts:221` |
| Kind | Module-private const behind `createBundledComposerCapabilitySource()` (`:337`) |
| Job | Drop the `skill:ui-ux-design` entry and the now-empty `skills` group (lines 270-282), per D-1 |
| Effect boundary | Pure data |
| Aggregate-risk | User-visible removal of a menu row → **owner decision D-1**, not a programmer's call |
| Trace | Q3, C1 |
| Test seam | Existing `composer-capabilities` unit tests; update any that assert the row count or the `skills` group |

---

## Wiring Map

| Flow ID | Source | Transport | Target | Payload | Ordering / Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | `AssistantDock` mount effect | direct call | `projectComposerCapabilities([bundled, installedSkills])` | `ComposerCapabilitySource[]` | Once per mount, `cancelled` guard | Outer `.catch` → empty projection | `AssistantDock.hooks.tsx:598-609` |
| W-002 | C-004 `list()` | `fetch` GET, same-origin | C-001 | `{ skills: SkillSummary[] }` | Idempotent read | Degrade to `[]`, never reject (INV-001) | C-004 |
| W-003 | C-001 | direct call | `loadInstalledSkillToolSources` | `{ workspaceId }` | Per-request disk read | ENOENT → `[]`; duplicate name → throw → 500 | `tool-registrations.ts:243-303` |
| W-004 | Composer selection | direct call | `resolveComposerDiscoveryOutcome` | `ComposerDiscoverySelection` | Route check → `pluginRefId` → `resolve` | Unknown id → `undefined` (documented no-op) | `AssistantDock.hooks.tsx:868-911` |
| W-005 | `compose-text` outcome | draft replacement | Jini `Composer` | `{ draft: text }` | User reviews and sends | none | `AssistantDock.hooks.tsx:903` |
| W-006 | Sent message | run start | agent → `skill_<name>` tool | prompt text | Agent chooses to call it | Agent may ignore the pointer — see R-1 | `tool-registrations.ts:340-352` |

**W-004 has no new branch.** The existing `if (!capability?.resolve) return;` / `if (binding.kind === "compose-text") return { draft: binding.text };` path (`AssistantDock.hooks.tsx:901-903`) already handles this end to end. Do not add a case.

---

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency Rule | Migration |
|---|---|---|---|---|---|---|
| `infra/skills/ws/<workspaceId>/` | `features/skills` | C-001 route (per request); daemon (once at boot) | nobody in this slice | `console.warn` on a bad folder | Route reads live disk; daemon reads a boot snapshot. **They may disagree** — see R-2 | N/A |
| Composer projection (in-memory) | `AssistantDock` | `byItemId`, `byPluginRefId` lookups | mount effect only | none | Item ids globally unique or the projection throws | N/A |

**No schema, no table, no migration.** The Data And Persistence trigger is `no`.

---

## Observability And Operational Expectations

| Surface | Required Signals | Correlation | Metrics | Logs | Alert / Runbook | Privacy | Trace |
|---|---|---|---|---|---|---|---|
| C-001 route | Existing express request logging | Admin session principal | none new | On 500, log the underlying error message (it names the offending skill folders and is the operator's only actionable signal) | N/A — admin-only read, no external I/O, no async job | Never log absolute skill paths beyond the folder name the loader's own warn already emits (`tool-registrations.ts:265`) | C-001 |
| C-004 source | `console.error` on degrade | none | none | `[installed-skills-composer-source] …` prefix, matching `tool-catalog-composer-source.ts:145-148` | N/A | none | C-004 |

Nothing here warrants a metric or an alert: one admin-triggered filesystem read, no queue, no external call, no async job.

---

## Critical Invariants

| ID | Scope | Rule | Reason | Enforcement Surface | Test | Trace |
|---|---|---|---|---|---|---|
| **INV-001** | All `ComposerCapabilitySource`s | The projection must never throw. No two sources may mint the same `item.id`, and no source's `list()` may reject. | `projectComposerCapabilities` throws on a duplicate id (`composer-capabilities.ts:164-171`) and `Promise.all` (`:160`) propagates any rejection; `AssistantDock.hooks.tsx:604-607` then leaves the projection **empty**. One bad row erases the whole menu. | (a) `installed-skill:` prefix cannot equal `skill:`; (b) server-side duplicate-name throw (`tool-registrations.ts:280-285`) guarantees intra-source uniqueness; (c) C-004 catches everything | Unit: two sources, one bundled `skill:ui-ux-design` + one discovered `ui-ux-design` folder → projection succeeds, both rows present, distinct ids | Q3 |
| **INV-002** | C-002 wire projection | `markdown` and `bundledFiles` never cross the HTTP boundary. | `bundledFiles` are absolute host filesystem paths (`tool-registrations.ts:176-179`); the sibling feature's stated security rule forbids absolute host paths reaching any browser-visible surface (`:71-73`). `markdown` would defeat progressive disclosure (`:26-34`). | C-002 is the single projection point | Unit: assert the output object's key set is exactly `{toolId, name, description}` | C-002 |
| **INV-003** | `agent-plugin:ui-ux-design` | Its `pluginRefId` rail must keep working unchanged. | It is the only currently-working composer row; the 2026-08-21 fix. | Do not touch `composer-capabilities.ts:264-268`; `byPluginRefId` collision guard (`:184-191`) stays intact | Existing `composer-capabilities` + `AssistantDock` tests stay green | C2 |

`[internal-invariant]` units: none designated. No algorithmic correctness, stateful protocol, concurrency/ordering, or characterization-parity surface in this slice.

---

## Brownfield Mapping

| Source behavior | Target | Preserve / Change | Evidence | Safety note |
|---|---|---|---|---|
| Five hardcoded rows, one source | Four rows + a live second source | Change (D-1 removes one) | `composer-capabilities.ts:221-331` | Reversible: re-add the object literal |
| Tool-catalog source unwired | Still unwired | **Preserve** | `AssistantDock.hooks.tsx:571-579` | Explicitly not reversed |
| `skill_*` tools in the agent registry | Unchanged | Preserve | `agent-daemon-server.ts:887` | This slice adds no tool and changes no registration |
| `pluginRefId` chip rail | Unchanged | Preserve | INV-003 | — |

---

## Phase Map

Two phases. Phase 1 splits cleanly into **two programmers with zero file overlap and zero symbol dependency**; Phase 2 is one programmer and is serial after both.

### Phase 1A — Server route `[P]` (Sonnet 5, size M)

Files (exclusively owned):
- `src/server/http/admin/skills.ts` (new)
- `src/server/routes/admin/skills/deps.ts` (new)
- `src/server/routes/admin/skills/list.ts` (new)
- `src/server/modules/skills.ts` (new)
- `src/server/app.ts` (2 lines: import + `mountRoutes` beside `:1009`)
- `src/server/routes/admin/skills/__tests__/…` (new)

Deliverable: C-001, C-002, C-003. Verify live with `curl` against the already-running `:3000` — the route is additive and needs no restart of anything the owner is using **only if** the server hot-reloads; if it does not, **report that and stop** rather than restarting anything.

Tests: `node --import tsx --test --experimental-test-module-mocks "<path>"` (Tovu root has no vitest). Scoped runs only.

### Phase 1B — Browser source `[P]` (Sonnet 5, size S/M)

Files (exclusively owned):
- `apps/admin/src/features/plugins/installed-skills-composer-source.ts` (new)
- `apps/admin/src/features/plugins/__tests__/installed-skills-composer-source.unit.test.ts` (new)

Deliverable: C-004, fully unit-tested against a mocked `fetch`. Ships green with **no** Phase 1A code present.

**How the overlap is eliminated.** The obvious design routes this through `apps/admin/src/lib/api.ts`'s `request()` helper (`:1625`) and a new `api.listInstalledSkills()` — which would make 1A and 1B fight over `api.ts` and force a build-order dependency. Do not do that. C-004 issues its **own inline `fetch`**, exactly as `tool-catalog-composer-source.ts:130-152` does, importing only the already-exported `WORKSPACE_ID` (`api.ts:3`) to build the path. This is not a shortcut around the convention — it is required by INV-001: `request()` **throws** an `ApiError` on any non-2xx (`api.ts:1634-1652`), and a throwing `list()` takes the whole projection down through `Promise.all`. Degrade-to-empty is not optional here.

Both programmers must agree the C-001 JSON shape **before** starting. That is the only coordination point.

### Phase 2 — Wiring, removal, i18n (Sonnet 5, size S) — serial, after 1A **and** 1B

Files:
- `apps/admin/src/features/plugins/composer-capabilities.ts` — remove lines 270-282 (D-1)
- `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx` — add the source at `:601`; **update, do not delete**, the `:571-579` decision doc to record that the tool-catalog source stays out
- `apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts` — **add** keys for the `"Installed Skills"` group label and the pointer text
- Update affected existing tests in `apps/admin/src/features/plugins/__tests__/` and `AssistantDock/__tests__/`
- Add the INV-001 regression test (two sources, near-colliding ids)

Tests: `cd apps/admin && npx vitest run <path>`.

**Programmer count: 2.** Phase 1A ‖ Phase 1B, then either one takes Phase 2.

### Deliberately out of scope
- Wiring `createToolCatalogComposerCapabilitySource` back in (2026-08-21 decision stands)
- Any change to `src/features/skills/*` or the daemon
- Per-skill `command` slash words (needs a collision rule first)
- A `skillRefId` pin rail (D-2)

---

## Owner Decisions Required

**D-1 — Delete the `UI/UX Design (Skill)` row?** *(blocks Phase 2 only; Phase 1 proceeds regardless)*
It is inert (C1), and its content already reaches the agent through the working `agent-plugin:ui-ux-design` row above it. Keeping it puts two different meanings of "skill" in one menu. **Recommend: delete.** If the owner says keep — keep it exactly as-is under a *distinct* group label. Do **not** "fix" it by giving it `pluginRefId: "ui-ux-design"`: that trips the duplicate-`pluginRefId` guard (`composer-capabilities.ts:184-191`) and throws, erasing the entire menu.

**D-2 — v1 binding: `compose-text` pointer, or build the `skillRefId` pin rail?**
Pointer: 2 programmers, ~10 files, no daemon change, ships this week; a one-shot draft the user reviews and sends. Pin rail: ~8 more files across three packages (`run-start-context.ts`, a new `resolve-skill-refs.ts`, a new daemon prefix module, `agent-daemon-server.ts`, new browser state, a second chip tray), and gives a chip that stays pinned across every turn until removed. **Recommend: pointer first.** It is a sanctioned delivery shape already under measurement (`resolve-agent-plugin-refs.ts:70-84`), and the pin rail can be added later without discarding any Phase 1 work — C-001, C-002 and C-004's fetch/mapping are all reused unchanged; only C-004's `resolve` is swapped for a `skillRefId` field.

**D-3 — Which permission gates C-001?** `admin.assistant.use` (matches the skill tools' own declaration, `tool-registrations.ts:333`) vs `admin.plugins.read` (proven granted to browser admins by the working Plugins screen). **Recommend `admin.assistant.use`, with a real request to confirm the grant before building on it.** This is a small security-boundary call, not a style one.

---

## Test Expectations

- **Contract tests:** C-001 — 200 shape, 404 wrong workspace, 403 unauthorized, 500 on duplicate frontmatter names (message names both folders), `{skills: []}` on a missing tree.
- **Unit:** C-002 key-set assertion (INV-002). C-004 — happy path, `resolve` output text, non-2xx → `[]`, reject → `[]`, malformed body → `[]`, `installed-skill:` prefix.
- **Invariant:** INV-001 — bundled + discovered sources with near-colliding ids project successfully with both rows present.
- **Regression (mandatory, must FAIL first):** with `incident-response` installed, the projection contains a row whose label is `Incident Response` and whose `resolve` returns a `compose-text` binding naming `skill_incident_response`. Assert the **exact** thrown-error text wherever a throw is asserted.
- **Characterization:** existing `composer-capabilities` and `AssistantDock` suites must stay green (INV-003).
- **N/A:** performance (one admin-triggered filesystem read), property-based (no algorithmic surface).

---

## Downstream Handoff Notes

- **Coordinator:** 1A ‖ 1B are true `[P]` — disjoint file sets, no shared symbol. Phase 2 is serial after both. Do not let either programmer touch `apps/admin/src/lib/api.ts`; that is what would collapse the parallelism.
- **TDD:** lead with INV-001. It is the only failure in this slice whose blast radius is the entire feature rather than one row, and it is invisible until a second skill folder happens to be named badly.
- **Programmer audit focus:** (1) C-004 never rejects; (2) C-002 never emits `markdown`/`bundledFiles`; (3) the id prefix is `installed-skill:`, not `skill:`; (4) the `:571-579` decision comment is updated, not deleted.
- **Do not touch** (other sessions own these): `apps/admin/src/features/comments/Comments.tsx`, `apps/admin/src/features/media/media-provider-catalog.ts`, `apps/admin/src/features/pages/**`, `apps/admin/src/styles/pages.css`, `package.json`, `src/server/http/site/render.ts` + tests, `src/themes/static/basic/css/theme.css`, `src/widgets/html-embeds.ts` + tests, `development/scripts/check-theme-replaced-elements.*`, `coverage/`, `apps/admin/.certs.disabled/`.
- **Do not start, stop, restart or kill any process.** A dev server is live on `:3000`/`:5173` plus the agent daemon and the owner is using the browser.

### Open risks

- **R-1 — The pointer is advisory.** A `compose-text` pointer asks the agent to call `skill_<name>`; nothing forces it. This is precisely the uncertainty the `TOVU_AGENT_PLUGIN_DELIVERY` A/B exists to measure (`resolve-agent-plugin-refs.ts:78-84`). Mitigation: D-2's pin rail, if the pointer measures badly.
- **R-2 — Menu/registry skew.** C-001 reads disk live; the daemon's tool catalog is a boot snapshot (`tool-catalog-query.ts:44-49`). A skill folder added after daemon boot appears in the menu but its `skill_*` tool does not exist yet, so the pointer names a tool the agent cannot call until the next daemon restart. Low frequency, confusing when it hits. Mitigation options, none built here: a "restart required" hint on rows whose tool id is absent from `/api/tools/:id`, or daemon-side re-seeding on skills-tree change. Flagged, not solved.
- **R-3 — D-3 unverified.** If `admin.assistant.use` is not granted to browser admin principals, C-001 403s for everyone and the menu silently shows no skills (C-004 degrades to `[]` by design). Verify with a real request in Phase 1A before writing the rest of the route.
- **R-4 — UNVERIFIED.** Whether `src/server/app.ts` hot-reloads a newly mounted module on the running dev server. If it does not, Phase 1A cannot be verified live without a restart, which is forbidden this session. Report and stop rather than restarting.
