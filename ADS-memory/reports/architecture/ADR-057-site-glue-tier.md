# ADR-057: Site Glue — the Call-Site Contract, the Authorship-Trust Axis, and the Agent-Author Control Loop

- Status: **DRAFT — not accepted.** Written for owner review; not self-approved. Do not add to `ADR-INDEX.md` until a human accepts it.
- Amended: 2026-08-20 (2-round multi-model swarm consensus, `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`) — **Decisions 2 and 6's premise (Site Glue is a second, composed-onto mechanism) is superseded, unanimous 4/4**: no `site-glue/loader.ts` exists, `GlueHostPort` has zero non-test implementations, and `attachment-points/*` has zero production callers. Decision 1's authorship-trust axis **survives** as a policy constraint on the merged system. See Amendment below.
- Date: 2026-08-04
- Spec: `ADS-memory/specs/048-extension-glue-tier/spec.md` (SPEC-048, DRAFT — 2 of 4 `[NEEDS CLARIFICATION]` markers unresolved; see Open below)
- Author: Claude Opus 5 (1M context), Software Architect (dispatched slice)
- Extends: **SPEC-005** (plugin artifact/loader/capability-SDK/hook pipeline — reused, not forked), **ADR-024** (plugin execution & trust model — composed with, not superseded)
- Relates: ADR-003 (plugins never get DDL), ADR-006 (rule-of-two), ADR-008 (change sets), ADR-009 (decoupling), ADR-021 (identity/authz separate axis), ADR-025 (plugin client JS isolation — REQ-6's blocker), ADR-027 (content-addressed blob storage — REQ-15's reusable precedent), ADR-047 (widgets — REQ-27/28's fail-isolation precedent)
- Supersedes: nothing. Adds a new extension tier alongside SPEC-005's plugin tier; touches `hook-registry.ts`'s `Attachment.source` union (additive) and extracts two lines of dead-but-documented logic out of `loader.ts`'s comment block into real code (see Decision 2.1). No other existing file's behavior changes.

## Context

SPEC-048 records the owner's ask precisely: an AI agent needs "free reign" to write glue code bridging vibecoded apps and admin functionality, for a **non-technical owner who cannot read the code**. Phase 1 recon and the spec both establish that this is an extension of SPEC-005's plugin pipeline, not a fourth mechanism — reuse is a hard constraint, not a preference (spec §2: "Nothing here invents a second artifact format, a second loader, or a second capability-checking mechanism").

Two things do not exist yet and are this ADR's actual content:

1. **A call-site vocabulary broad enough to matter.** SPEC-005 ships exactly one hook. `packages/sdk/src/index.ts:45` (`HOOK_CONTENT_ENTRY_BEFORE_SAVE`) and `:104-106` (`addFilter` typed against that one literal, `HOOK_UNKNOWN` on anything else) confirm this is enforced by the type system, not merely convention.
2. **An authorship-trust posture ADR-024 never had to define.** ADR-024's tiers answer "how much do we trust the *publisher*." Glue code has no publisher — an agent wrote it, in place, for one site, and the accountable human cannot read it.

**A pre-existing gap, verified directly, not inherited on faith.** `loader.ts:140-146`'s own comment states steps 4–5 of `loadPlugin()` — invoking a loaded plugin's `setup()` and attaching its hook via `hookRegistry.attach()` — are "deliberately NOT wired here." I confirmed independently: `grep -rn "hookRegistry\.attach\|\.attach(" src --include=*.ts` (excluding tests) returns exactly one hit, `hook-registry.ts:9`'s own doc comment claiming `loader.ts` calls it. That claim is false — `loader.ts` contains no call to `.attach()` anywhere in its body. So today, an enabled plugin is integrity-checked, sdk-range-checked, and `import()`-ed, but **its hook never fires in production.** Decision 2.1 below states how Site Glue relates to this gap; it does not assume it away.

## Constitution Check

*Completed before any other section, per `<AI_DEV_SHOP_ROOT>/skills/constitution-compliance/SKILL.md`.*

| Article | Status | Notes |
|---|---|---|
| I — Library-First | COMPLIES | No new library needed. The plain-language diff (REQ-13) is agent-generated prose, not a diff-rendering library problem; the snapshot store reuses ADR-027's content-addressed pattern, not a new dependency. |
| II — Test-First | N/A at ADR stage | Contracts below are TDD-certifiable seams (mirrors `loadPlugin`/`capability-sdk.ts`'s existing "design-frozen signature, body throws until certified" convention). No implementation code is proposed or written here. |
| III — Simplicity Gate | **EXCEPTION**, justified below | The general six-category call-site contract exceeds what the three v1-wired categories alone would require. See Complexity Justification. |
| IV — Anti-Abstraction Gate (rule-of-two) | COMPLIES | The category-adapter pattern (Decision 2) has three real adapters in v1 (content-lifecycle, tool-registration, events) — comfortably past rule-of-two. The new `GlueHostPort` seam (Decision 6) has one real adapter now (Tovu) and a named, concrete second (a future Jini host), recorded per ADR-006's "documented plan naming the second" allowance — see Complexity Justification. |
| V — Integration-First Testing | N/A at ADR stage | Every wired call site (content-lifecycle, tool-registration, events) already has a real HTTP/cross-module boundary in the host mechanism it extends; TDD stage owns asserting through those boundaries. |
| VI — Security-by-Default | **EXCEPTION (standing v1)**, carried forward | Same standing exception SPEC-005/ADR-024 carry: no sandbox exists. Site Glue does not weaken this — it adds a second gate (approval) on top of the same capability-gate mechanism. Named-action authz (`admin.site-glue.approve`, `.revert`, `.quarantine.clear`) must exist before non-local deployment, per Article VI's existing condition. |
| VII — Spec Integrity | COMPLIES | This ADR cites `ADS-memory/specs/048-extension-glue-tier/spec.md` directly; no committed content hash exists yet for this draft spec (consistent with ADR-055's precedent of citing the file path when no `pipeline-state.md` hash has been recorded). |
| VIII — Observability | COMPLIES, with a requirement | Every state transition in Decision 5's control loop (`propose`, `approve`, `revert`, `quarantine`) must emit a domain event carrying the module id as its correlation id — mirrors ADR-024's write-attribution amendment to ADR-022. Recorded as a wiring requirement in the Module Boundaries section. |

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, hexagonal boundaries where external I/O or swappable providers justify them.
- Alignment: **FOLLOWS.** Site Glue is a new module (`src/features/site-glue/`) inside the existing modular monolith, with an explicit port (`GlueHostPort`, Decision 6) isolating the product-neutral mechanism from Tovu-specific wiring — exactly the hexagonal-boundary-inside-a-slice pattern the default heuristic recommends when a future host swap (Jini) is a named, near-term concern rather than speculative.

## Decision

**Site Glue is composed onto SPEC-005's plugin lineage along two axes ADR-024 never needed — authorship trust and call-site breadth — through one general manifest/attachment contract, dispatched via category-specific adapters that reuse existing mechanisms rather than replacing them. Failure containment splits by call-site category from day one, not deferred, because one of the three v1-wired categories already requires the stronger posture.**

Pattern(s) selected: **Category-specific attachment adapters over one shared manifest vocabulary** (Decision 2), inside a **hexagonal port** (`GlueHostPort`) separating product-neutral mechanism from Tovu-specific wiring (Decision 6).

---

## Decision 1 — Authorship trust composes with ADR-024 as an orthogonal, second axis, not a fourth tier

ADR-024's ladder answers one question: **how much of the machine does this code get, and who vouches for it being here at all** (Tier-1 declarative / Tier-2 sandboxed / Tier-3 trusted-in-process, gated by *distribution* — install-from-marketplace vs local/first-party/sideloaded). Site Glue's code is never distributed (REQ-18 is explicit: no marketplace, ever), so on that axis it has exactly one, permanently fixed answer: **Tier-3 execution semantics, forever local, forever excluded from ADR-024 §2's marketplace-eligibility question.** It is not a new rung on that ladder — the ladder doesn't need editing, because Site Glue only ever occupies the leaf ADR-024 already carved out for local/first-party code, and simply never leaves it.

What varies is a second, orthogonal axis ADR-024 had no reason to define, because it assumed a human either wrote the code or chose to sideload someone else's: **authorship/reviewability state.** Site Glue expresses this as the control loop's own status field (Decision 5), not a manifest-declared "trust level":

| Axis | Question it answers | Site Glue's value | Where it's recorded |
|---|---|---|---|
| Execution/distribution trust (ADR-024) | How much of the machine, from whom? | Fixed: Tier-3-shaped, local-only, never marketplace-eligible | Not stored per-module — implied by "this is Site Glue," never variable |
| Authorship/reviewability trust (this ADR) | Has a human who understands the change looked at it? | Variable: `staged` → `approved-active` → `quarantined` (system) / `disabled` (owner) | `site_glue_activations` row, change-set-gated (Decision 5) |

The composed trust story: **fixed-and-honest execution posture, gated by a variable-and-durable authorship state.** The two axes multiply, not add — a `staged` module never executes regardless of how narrow its capability declaration is, and an `approved-active` module still runs with exactly Tier-3's disclosed honesty (capability-gated at the interface, not sandboxed) regardless of how much the owner trusts the agent that wrote it. This is the concrete mechanism that discharges ADR-024's own invariant — *"no feature ships whose failure mode exceeds the current recovery rung"* — for a trust rung this weak: the trust rung stays at Tier-3 (weak, honestly labeled), and Decision 5's recovery machinery (snapshot+rewind, fail-isolated admin call sites, auto-quarantine) is sized to match, not to compensate for a stronger trust claim that isn't actually being made.

**Disclosure language, carried into the approval UI (REQ-3), matches ADR-024's own discipline exactly:** *"this code runs with the same privileges as the rest of your site once approved — capability declarations are enforced at the interface it's given, not by a sandbox around it. Approving it is a judgment about whether the plain-language summary matches what you asked for, not a safety judgment about what the code can do."* "Recoverable," never "safe" — per the dispatch brief's own instruction, and consistent with ADR-024's "never marketed as safe" for Tier-3.

---

## Decision 2 — The general call-site contract (the central decision)

### Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| **Category-specific attachment adapters over one shared manifest vocabulary** | Strong fit | High | prior_art (mirrors SPEC-005's "one validator, two surfaces" precedent, `manifest.ts:10-11`) | Each category keeps its native mechanism's semantics (fail-closed hook merge, fail-fast-vs-fail-isolated tool registration, outbox retry) exactly as-is; adding a category later is "write one adapter," not a schema change | Six categories means up to six adapters to maintain, not one | Real per-category correctness (a hook's merge/validate step is not squeezable into a generic list-append) traded for a small amount of adapter-count sprawl | **SELECTED** |
| A single generic `AttachmentRegistry<T>` reusing `DOMAIN_SLICES`'s list-append shape for every category | Weak fit | Medium | analogical | One runtime abstraction, less code to read | `DOMAIN_SLICES` is fail-fast by construction (`tool-registrations.ts:194-195,283-302`); content-lifecycle already has its own fail-closed merge-and-validate step (BR-06) a generic list-append cannot replicate without reimplementing `hook-registry.ts` inside a "generic" registry — "generic" collapses to "hook-registry with extra indirection" for that one category | Forcing one shape onto six categories with genuinely different failure semantics (sync-merge vs async-subscribe vs HTTP-handler) either breaks the category's own invariants or the abstraction becomes six special cases wearing one name | Not selected — the abstraction would not actually be generic once every category's real constraint is honored |
| A universal event bus / mediator: glue publishes intents, core categories subscribe | Weak fit | Medium | analogical | Decouples glue from every category's concrete API | Content-lifecycle needs a **synchronous return value merged into the save** (BR-06's field validation), not a fire-and-forget event; HTTP routes need a real handler bound to a router, not an event consumer. Forcing these into pub-sub either breaks the categories that need a return value or requires a second, non-pub-sub path anyway | Not selected — two of six categories cannot be modeled as async events without losing the property that makes them useful |
| A second, glue-only plugin runtime (fork `loader.ts`/`hook-registry.ts`/`capability-sdk.ts`) | Rejected | Low | prior_art (this is exactly what §2 of the spec forbids) | None weigh against the cost | Duplicates a manifest format, a loader, and a capability-checking mechanism SPEC-005 already owns; violates Article I and the spec's own explicit constraint | Not selected — violates spec §2 and Article I directly |

### The contract

One manifest vocabulary, closed and complete now; a dispatch table with three real entries and three typed placeholders — this is the concrete shape of "design general, wire narrow":

```
GlueCallSite =
  | "content.entry.beforeSave"   // WIRED v1
  | "assistant.tools"            // WIRED v1
  | "events.subscribe"           // WIRED v1
  | "admin.nav"                  // accepted at validation, UNWIRED_CALL_SITE if attempted
  | "render.contribute"          // accepted at validation, UNWIRED_CALL_SITE if attempted
  | "http.routes"                // accepted at validation, UNWIRED_CALL_SITE if attempted

GlueCapability =
  | PluginCapability              // "content.read" | "content.extend" | "hooks.attach" — reused verbatim
  | "tools.register" | "events.subscribe" | "admin.nav.register"
  | "render.contribute" | "http.route.register"

GlueManifest = {
  id: string; version: string; sdkRange: string;
  capabilities: readonly GlueCapability[];
  attachments: readonly { callSite: GlueCallSite; /* per-call-site payload, category-owned shape */ }[];
}
```

`GlueCapability` is a **glue-owned superset type**, not an edit to `@tovu/sdk`'s exported surface — it re-uses the three real `PluginCapability` string values but is declared in `site-glue/manifest.ts`, never in `packages/sdk/src/index.ts`. This matters concretely: ADR-005/024 froze the SDK's hook ABI (async-only, serializable, capabilities by handle) precisely so it is nearly irreversible once third parties depend on it; widening that exported type to carry five glue-only capability strings would touch the frozen surface for no reason, since only the content-lifecycle category actually uses the SDK's `addFilter`/`HOOK_CONTENT_ENTRY_BEFORE_SAVE` mechanism. The other five capability strings are pure Site Glue vocabulary and never cross the SDK boundary.

`validateGlueManifest()` rejects any `callSite` string outside the six-member union (same `HOOK_UNKNOWN`-shaped rejection SPEC-005's `validateManifest` already applies at `manifest.ts:239-241`) — but accepts all six, unlike the SDK's own hook vocabulary which has exactly one member. An attachment declared against one of the three unwired call sites passes validation and fails later, at load/dispatch time, with a distinct `UNWIRED_CALL_SITE` code — never a silent no-op, never a schema-level rejection. **This is what "admits all six without redesign" cashes out to concretely**: turning on `admin.nav` later is "write the adapter, flip one dispatch-table entry" — zero manifest-schema change, and any glue module that already declared an `admin.nav` attachment while it was unwired starts working the moment the adapter ships, with no re-authoring.

### The three wired adapters

| Category | Underlying mechanism | Adapter responsibility | Containment |
|---|---|---|---|
| Content lifecycle | `hook-registry.ts`'s `HOOK_CONTENT_ENTRY_BEFORE_SAVE` | Calls `hookRegistry.attach(moduleId, "glue", filter, declaredFields)` — reuses `runBeforeSave`'s existing merge/validate logic verbatim, including BR-06's field-declaration check | Fail-closed, unchanged (inherited, not rebuilt) |
| Agent tool registration | `assistant/tool-registrations.ts`'s `DOMAIN_SLICES` composition | Runs **after**, not inside, `buildAssistantToolRegistrations()` — merges glue-contributed registrations onto the already-fail-fast-validated core list, wrapping each glue module's own registration call in try/catch | **Fail-isolated (new, required in v1 — see Decision 4)** |
| Async "this happened" | The outbox (`core/events`) | `outbox.subscribe(eventName, glueHandler)` | Inherited — outbox retry/dead-letter semantics already require idempotent handlers |

`admin.nav`, `render.contribute`, `http.route.register` accept manifests today and reject dispatch with `UNWIRED_CALL_SITE`. When wired, `render.contribute`'s adapter should reuse `resolver-service.ts:62,92`'s existing "never throws, isolated placeholder" pattern verbatim (REQ-27/28's precedent) rather than inventing a new one — the fail-isolated shape this ADR requires for admin-surface call sites already has one working implementation in this codebase.

### 2.1 — How Site Glue relates to `loader.ts`'s dangling steps 4–5

Site Glue does not fork `loadPlugin()`. It calls the same function, with one structural fact making REQ-10's "skip the integrity-hash check" free: `loader.ts:116` iterates `Object.entries(manifest.integrity)` — an empty `integrity: {}` map (mirroring the `word-count` built-in's own precedent, `built-ins/word-count/index.ts:34`) makes step 1 a no-op with **zero changes to `loadPlugin()` itself.** Step 2 (sdkRange) is reused verbatim. Step 3 (dynamic import) is reused verbatim.

Steps 4–5 are where Site Glue must supply what SPEC-005 never wired — and it does so by **extracting** that logic out of `loader.ts`'s comment block into a small, real, shared function (call it `attachLoadedPlugin(pluginId, source, sdk, hookRegistry)`, living in `plugin-runtime`, source discriminant widened to include `"glue"`), rather than writing it glue-private. Site Glue's own loader becomes the **first real caller** of this function; SPEC-005's own end-to-end plugin activation fix is thereby reduced to "call this same function from the real activation path," strictly smaller than the gap it inherits today. This satisfies Article IV's rule-of-two for the extracted function itself (Site Glue is the first real implementation; SPEC-005's own fix is the named, concrete second, not a speculative one — the gap is already tracked, not hypothetical) and Article I (Site Glue does not reimplement hook attachment; it completes a partially-built one). **Site Glue is not blocked by SPEC-005's gap and does not silently inherit it** — this is the direct answer to the dispatch's instruction not to assume the pipeline runs end-to-end.

---

## Decision 3 — Load order and discovery

- **Directory**: `<install-dir>/site-glue/`, sibling to wherever `plugin-runtime`'s discovered `installDir` plugin folder already lives (the same install-dir tier ADR-012 defines) — never under `src/`, never under `apps/admin/dist`, never inside anything a core upgrade writes to. REQ-9's binding invariant (core upgrade never touches this directory) is satisfied structurally by placement, the same way plugin-runtime's own site-plugin directory already is.
- **Order — content lifecycle**: extends `hook-registry.ts`'s existing `compareTb01`/`sourceRank` (`hook-registry.ts:83-88`) with a third rank (`glue` = 2, after `built-in` = 0 and `site` = 1), id-ascending within rank — one additional branch in an existing, already-deterministic comparator, not a new ordering mechanism.
- **Order — tool registration**: `DOMAIN_SLICES`'s own order is explicitly documented as **not load-bearing for correctness** (`tool-registrations.ts:194-195`). There is no existing discipline to extend. Glue's contributions are appended after the full core list, id-ascending among themselves — deterministic (REQ-7) without contradicting a discipline core itself says doesn't matter for it.

---

## Decision 4 — Failure containment: fail-isolated is a v1 requirement, not a deferred one

The dispatch brief asked whether fail-isolated containment can wait until the admin-surface categories (nav, routes) are wired. **It cannot, and this is a correction to the brief's own framing, not a guess.** REQ-8 categorizes *tool registration* as an admin-surface/boot-time call site requiring fail-isolated containment. REQ-5's table lists *tool registration* as one of the three v1-wired categories. Both are true of the same category simultaneously: **one of v1's three wired categories is itself an admin-surface/boot-time category by the spec's own classification.** Fail-isolated containment therefore ships in v1, because v1 cannot avoid needing it — not because a broader admin-surface wiring wave arrived later.

The mechanism (§Decision 2's adapter table) achieves this **without touching `tool-registrations.ts`'s existing fail-fast discipline at all**: glue's contributions never enter the array `buildAssistantToolRegistrations()` governs. They are merged afterward, each glue module's contribution independently try/catch-wrapped; a throw or a duplicate id (against core or against another glue module) drops and auto-quarantines that one module (Decision 5) and nothing else. Core's own domains keep their deliberate "duplicate registration stops daemon boot" property exactly as `tool-registrations.ts:283-302` intends — that property is not weakened, because glue never becomes a `DOMAIN_SLICES` entry.

Content-lifecycle stays fail-closed, unchanged, inherited from `hook-registry.ts`'s existing behavior (Decision 2's table). Outbox events stay contained by existing retry/dead-letter semantics — no new mechanism (spec's own REQ-8 conclusion, confirmed correct). Rendering and nav, when wired later, reuse `resolver-service.ts`'s existing fail-isolated pattern (§Decision 2).

---

## Decision 5 — The agent-author control loop, as a state machine

```
staged → pending-approval → approved-active ⇄ disabled(owner)
                                    ↓
                              quarantined(system) → [owner clears] → approved-active
                                    ↓
                              reverted (snapshot restore, any state → prior state)
```

- **Propose (REQ-11)**: the agent writes to a staged location the loader **never discovers** — not merely a `status:"staged"` flag on a scanned module, but structural invisibility, matching ADR-047 Amendment 2's own discipline that an unapproved contribution renders as absent, not as a labeled-but-present error. This is a Binding constraint (CIC-2 below): if staging were "present but flagged," any bug in the flag check is a silent activation of unreviewed agent code — the strongest available property is "the loader's directory scan structurally cannot see it."
- **Validate before a human ever sees it (REQ-12)**: `validateGlueManifest()` runs at propose-time, before the diff/summary UI renders at all — one step earlier than CIC U-001's "validate before code runs," applied to "validate before a human's attention is even spent."
- **Plain-language diff (REQ-13)**: core's obligation is fixed and small — render whatever the proposing agent supplies against a fixed schema (`{summary, capabilitiesRequested: {new, existing}, callSites}`). Core does not interpret code; the agent, which has the context, does. This keeps the mechanism itself simple (Article III) and does not require core to solve "explain arbitrary code to a non-technical reader," a problem this ADR is not equipped to solve generically.
- **Approve (REQ-14)**: `site_glue_activations` (mirrors `plugin_activations`) — `staged → approved-active` is an ordinary `executeCommand()` call, `captureInverse`/`rollback` identical in shape to `plugins_set_enabled` (`tool-registrations.ts:104-135`). Confirmed: zero new mutation-safety mechanism needed, the spec's own claim holds.
- **Revert restores code (REQ-15)**: `site_glue_snapshots`, content-addressed — `(moduleId, turnId, fileContentHash) → blob`, directly reusing ADR-027's `BlobStorePort` content-addressed dedup shape, already proven in this codebase for exactly "store prior bytes, restore on demand." The snapshot write **must** complete before the file write it protects (Required Ordering Constraint, CIC-4 below).
- **No-brick invariant (REQ-16)**: the composition of Decision 4's fail-isolated tool-registration adapter, this section's auto-quarantine, and snapshot+rewind. None of the three alone is sufficient; together they discharge REQ-16 (matches the spec's own framing).
- **Auto-quarantine (REQ-17)**: mechanism decided, threshold left open (see Open, below — owner call). The failure counter is **in-memory, per module per call-site category, and resets on daemon restart** — a module that fails once around a redeploy boundary should not be permanently punished for an unrelated restart. The quarantine **outcome**, once tripped, is a durable `site_glue_activations` row via the same gateway REQ-14 uses, system-attributed — it does survive restart, and remains owner-visible and owner-clearable.

---

## Decision 6 — Where it lives: Tovu now, Jini-portable by construction

The owner's decision (deferred physical move, port-shaped mechanism now) is operationalized as a concrete module boundary, not left as an aspiration:

- **`GlueHostPort`** — the seam: `attachContentLifecycleFilter`, `registerTools`, `subscribeEvent`, `registerAdminNav` (unwired stub), `contributeRender` (unwired stub), `registerHttpRoute` (unwired stub), `runChangeSet` (delegates to the change-set gateway), `snapshotBlob`/`restoreBlob`. Tovu's composition root supplies the one real adapter, wired to today's `plugin-runtime`/`tool-registrations`/`core/events`/`panels.tsx`/`widgets`/`server/routes`.
- **Product-neutral core** (manifest schema, `validateGlueManifest`, the loader, the capability-gate extension, the control-loop state machine): carries **zero Tovu vocabulary**, satisfying Jini's `R5-neutrality` guard rule preemptively (`Jini/scripts/check-engine-boundaries.ts:9,70` — substring-matches `'Tovu'` even in comments) even though this code is not moving yet. A later Jini extraction is `git mv` of this directory plus a tsconfig-strictness pass — the owner's own framing, now literally true of the file boundary, not just the intent.
- **Stays in Tovu, permanently, regardless of extraction**: the approval UI, diff/summary rendering, nav entries, and quarantine notices — inherently tied to Tovu's own admin shell (matches spec §9's own conclusion).
- **Rule-of-two for `GlueHostPort`**: one real adapter (Tovu) now, a named concrete second (a future Jini host — spec §9 cites Jini's own app-builder product as a second consumer with the identical shape of problem) on the roadmap, not speculative. Recorded in Complexity Justification per ADR-006.

---

## Quality Attribute Scorecard

| Axis | Definition | Score | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing/extending behavior | 4 | prior_art | Adding a 4th wired category is one adapter + one dispatch-table flip, no schema change (Decision 2) | Six categories means six adapters to keep correct as underlying mechanisms evolve independently | Directly traced to the "admit all six, wire three" requirement | Adapter count stays proportional to categories actually wired, not to theoretical vocabulary size | always-on | A 4th category takes >1 adapter to wire cleanly | +1 over the generic-registry runner-up, which would require touching the registry itself per category |
| modularity | Clean partitioning into stable boundaries | 4 | measured | `GlueHostPort` isolates product-neutral mechanism from host wiring; verified zero existing files need behavioral changes outside `hook-registry.ts`'s additive union widen | The port adds one more seam to reason about vs. calling host mechanisms directly | Directly required by Decision 6's Jini-portability mandate | Port stays thin (delegation only, no logic) | always-on | Port grows business logic instead of staying a thin delegator | +1 — the generic-registry runner-up would have concentrated logic in one place, easier short-term, harder to extract |
| scalability | Handles growth in load/data/org scale | 3 | assumed | Per-module failure counters and snapshots are O(module count), not O(site content) | No latency budget specified for glue attachment execution, same disclosed gap `hook-registry.ts` already carries for real plugins (`runBeforeSave`'s own complexity note) | Inherited gap, not a new one — but genuinely open | A glue module with pathological cost inside a fail-closed content-lifecycle attachment can still slow every save; no new mitigation proposed here | always-on | A production save-latency regression traced to a glue filter | 0 — same posture as the runner-up, both inherit the same unaddressed gap |
| reliability | Tolerates faults, degrades safely, recovers | 4 | measured | Fail-isolated tool-registration (Decision 4) verified NOT to touch `tool-registrations.ts`'s existing throw path; snapshot+revert gives a real recovery action, not a hope | Auto-quarantine threshold is unspecified (open clarification) — until set, "repeatedly failing" has no operational definition | Directly traces to REQ-16's three-part composition, each part verified against real source | The in-memory failure counter resetting on restart is the right default; owner may want it to persist instead | always-on | Owner sets a threshold implying persisted-counter semantics are actually wanted | +2 — the rejected generic-registry pattern could not achieve fail-isolated tool registration without also weakening core's fail-fast property |
| security | Secure boundaries, access control, secrets, attack surface | 3 | prior_art | Same capability-gate mechanism as real plugins (`CapabilityDeniedError`, always-present-never-omitted); approval gate adds a second, independent barrier before any code runs | No sandbox exists — capability enforcement is API-surface-level, identical to Tier-3's existing honest disclosure, not stronger | Directly traces to Decision 1's composed-axis argument; this is the axis the spec's own §12 concern targets | The approval step is assumed to actually be read by the owner, not rubber-stamped — a UX risk this ADR cannot close architecturally | mitigation: REQ-3's honest disclosure language; owner: Product/UX; enforcement: approval UI copy review; deadline: before any glue module reaches `approved-active` in a real deployment | A security incident traced to an approved-but-unread glue module | -1 vs. a hypothetical sandboxed design that does not exist yet (Tier-2 is unbuilt, named honestly rather than pretended) |
| operability | Deploy, monitor, debug, roll back, run | 4 | analogical | Quarantine notices, snapshot/rewind, and change-set-gated activation are all observable, owner-visible operations reusing existing admin patterns | A new admin surface (`SiteGlue.tsx`-equivalent) is required, not free | Directly required by REQ-13/16/17 | The plain-language summary UI is buildable with existing admin patterns (mirrors `Plugins.tsx`'s shape plus a diff view) | always-on | Owner reports confusion distinguishing "disabled" from "quarantined" in the UI | +1 vs. the generic-registry runner-up, which has no natural place to surface per-category failure attribution |
| cost | Total ownership cost, infra + ops | 4 | assumed | No new infrastructure — reuses SQLite tables, the change-set gateway, and existing blob-storage precedent | Six-category vocabulary is more surface to document/maintain than a narrower v1-only design would be | Traded deliberately per the owner's explicit "general design, narrow wiring" instruction | The unwired-category surface (schema-only) costs little to maintain since it has no runtime behavior to break | always-on | Unwired categories start accumulating real demand before being wired, and the backlog grows stale | +1 vs. building three category-specific one-off mechanisms with no shared vocabulary at all (the implicit zero-design alternative) |
| testability | Supports unit/integration/contract/system verification | 4 | prior_art | Each adapter is independently testable against its host mechanism's existing test seams (`loadPlugin`'s injectable `importModule`/`computeFileHash`, `hook-registry.ts`'s pure `runBeforeSave`) | The control loop's state machine (Decision 5) is new and has no existing test seam to inherit | Directly follows from reusing already-TDD-certified mechanisms for 3 of the 4 major pieces | New CIC units (below) declare observable verification surfaces for the state machine specifically because it's the genuinely new part | always-on | The staged/approved boundary cannot be asserted through an observable surface once implemented | +1 vs. the generic-registry runner-up, which would need new tests for logic hook-registry.ts already has certified tests for |
| compliance_auditability | Legal/regulatory/audit-trail/evidentiary requirements | 4 | measured | Every state transition routes through the change-set gateway (`captureInverse`/`rollback`), giving a durable, revertible audit trail for a non-technical owner by construction | Audit trail covers *state* transitions; it does not itself prove the plain-language summary accurately described the code | Activated because REQ-13/14/17 are explicitly evidentiary requirements for an owner who cannot read code | The gateway's existing audit shape is sufficient; no new audit mechanism invented | REQ-13 (plain-language disclosure for an unreadable-to-the-owner artifact), REQ-14 (approval trail) | An owner disputes that an approved change matched its summary | N/A — no runner-up addressed this axis at all |
| tenant_isolation | Multi-tenant / customer isolation | 4 | analogical | `site-glue/` sits inside one workspace's install-dir (ADR-012/ADR-007's existing per-workspace boundary); no cross-tenant code path introduced | Relies entirely on the existing install-dir-per-workspace structural boundary; this ADR does nothing new to enforce it | Activated because Tovu is structurally multi-workspace (ADR-007) even though Site Glue itself is single-site by design (spec REQ-18) | The install-dir boundary is not bypassed by any glue mechanism (glue never takes a raw filesystem handle, Decision 1's honest-disclosure framing) | Multi-workspace structural boundary (ADR-007/012) | A future Electron multi-site host (ADR-011) is found to share one `site-glue/` directory across sites | N/A — inherited, not compared |
| data_consistency | Distributed writes, async workflows, critical invariants | 3 | assumed | Snapshot-before-write and validate-before-run are both Required Ordering Constraints with clear single-writer semantics | No transactional guarantee spans the snapshot write and the subsequent file write — a crash between the two leaves a snapshot with no corresponding "current" version to diff against, though it never leaves data in a *worse* state than before the write started | Activated because REQ-15 introduces a new write-then-restore workflow with a real ordering invariant | A crash between snapshot and write is rare and recoverable (the snapshot is still valid, just orphaned) rather than corrupting | mitigation: treat orphaned snapshots as inert, never as an error condition; owner: Programmer stage; enforcement: CIC-4 below; deadline: before REQ-15 ships | A crash-recovery test finds an orphaned snapshot causing an incorrect diff | -1 vs. a fully transactional design this ADR does not propose, judged not worth the complexity for file-content (not row-data) recovery |

## Overall Strengths

- Reuses three already-certified, already-tested mechanisms (hook-registry, DOMAIN_SLICES composition, outbox) rather than inventing parallel ones — the single biggest cost driver in a design like this is avoided by construction.
- The general/narrow split (Decision 2) is not aspirational — it's a concrete, verifiable dispatch-table property: an unwired category fails at load-time with a distinct code, not silently, and wiring it later touches zero existing manifests.
- The Jini-portability instruction is operationalized as an actual module boundary (`GlueHostPort`), not a stylistic promise.

## Overall Weaknesses

- Security remains honestly weak (score 3) — this is a disclosed, not hidden, property, and it is the correct score given no sandbox exists anywhere in this codebase yet.
- The control loop (Decision 5) is the one genuinely new mechanism with no existing test seam to inherit — it carries the most implementation risk of everything in this ADR.
- Two of four `[NEEDS CLARIFICATION]` markers remain open and materially affect the approval UI's shape (raw-source visibility) and the reliability story's completeness (quarantine thresholds).

## Tradeoff Tension

**We are trading a wider, six-category manifest vocabulary today for the ability to wire the remaining three categories later without a schema break — accepting Article III friction now (an EXCEPTION, justified below) to avoid a second manifest-versioning problem in a system that already has one (ADR-005's frozen SDK ABI) later.**

## Why This Won

The category-adapter pattern won because it is the only candidate that does not force a false choice between "one clean abstraction" and "each category keeps the correctness properties its own mechanism already earned." The generic-registry alternative reads as simpler on paper but is not actually simpler once `hook-registry.ts`'s fail-closed merge-and-validate logic is accounted for — it would have to either reimplement that logic inside the "generic" registry (not actually generic) or leave content-lifecycle's correctness unenforced (not acceptable, BR-06 exists for a reason). The event-bus alternative fails on a harder constraint: two of six categories need something pub-sub structurally cannot give them (a synchronous return value, a bound HTTP handler).

## Runner-Up Comparison

- Runner-up: the single generic `AttachmentRegistry<T>` reusing `DOMAIN_SLICES`'s shape for every category.
- Why it lost: it is only generic until the first category with a real invariant (content-lifecycle's merge/validate step) is honored correctly, at which point it becomes hook-registry.ts with an extra layer of indirection for that one category and a false "generic" label for the rest.

---

## Consequences

**Positive:**
- Zero behavioral change to `tool-registrations.ts`'s existing fail-fast discipline, `DOMAIN_SLICES`, or `loadPlugin()`'s statement order — Site Glue is additive everywhere except one union-type widening in `hook-registry.ts`.
- SPEC-005's dangling steps 4–5 gap gets a real, shared fix path instead of remaining a comment-documented dead end — a strictly smaller problem for SPEC-005 to close than it was before this ADR.
- The unwired-category placeholder pattern means the next three call sites (nav, render, routes) are a wiring exercise, not a redesign, when the owner is ready for them.

**Negative / Tradeoffs:**
- Six capability strings and six call-site strings exist in the vocabulary before three of them have any runtime behavior — a real, accepted Article III cost (see Complexity Justification).
- The control loop introduces new stateful concepts (`staged`, `quarantined`) that have no precedent in this codebase's existing plugin `enabled`/`disabled` binary — genuinely new design and test surface, not a reuse.

**Risks:**
- Risk: the plain-language summary (REQ-13) is agent-generated and this ADR does not verify its accuracy — plan: Product/UX must decide whether any raw-source affordance exists (open clarification #3) before the approval UI ships, since an inaccurate summary with no raw-source escape hatch is a real trust gap.
- Risk: auto-quarantine with no set threshold (open clarification #2) means REQ-16's "no-brick invariant" is architecturally complete but operationally unfinished until a number is chosen.

## Mitigations Required

- Weak axis: security (score 3).
  - Mitigation: REQ-3's honest disclosure language, verbatim, in the approval UI; no UI copy implying sandboxing.
  - Owner: Product/UX (approval UI copy) + Software Architect (review before implementation).
  - Enforcement: copy review gate before any glue module can reach `approved-active` in a real deployment.
  - Deadline/trigger: before implementation of the approval UI ships.
- Weak axis: data_consistency (score 3).
  - Mitigation: treat an orphaned snapshot (crash between snapshot-write and file-write) as inert, never as an error state that blocks future operations — encoded as CIC-4 below.
  - Owner: Programmer stage.
  - Enforcement: CIC-4's declared verification surface.
  - Deadline/trigger: before REQ-15 (snapshot+rewind) implementation.

## Re-evaluation Triggers

- Calendar trigger: 12 months with zero exceptions recorded against the Article III EXCEPTION below — re-check whether the three unwired categories were ever demanded.
- Scale trigger: if a glue-attached content-lifecycle filter is measured causing a save-latency regression, the scalability axis (score 3) needs a real budget, not a disclosed gap.
- Topology trigger: if ADR-052's Tovu-Runner multi-site host ever shares one `site-glue/` directory across sites (it should not, per tenant_isolation's rationale above) — re-verify the install-dir boundary holds.
- Dependency trigger: if SPEC-005 ships its own fix for `loadPlugin()` steps 4–5 independently, re-verify Decision 2.1's `attachLoadedPlugin` extraction still matches the shape that fix lands in.

---

## Module / Service Boundaries

```
src/features/site-glue/                    # product-neutral core (Decision 6) — zero Tovu vocabulary
  manifest.ts                              # GlueManifest, GlueCapability, GlueCallSite, validateGlueManifest()
  loader.ts                                # discovery + validate-before-import, calls plugin-runtime's loadPlugin()
  capability-gate.ts                       # gate() extension over GlueCapability, reuses capability-sdk.ts's shape
  attachment-points/
    content-lifecycle.ts                   # wraps hook-registry.ts's attach()
    tool-registration.ts                   # post-DOMAIN_SLICES merge, fail-isolated
    events.ts                              # wraps core/events outbox subscribe
    unwired.ts                             # admin.nav / render.contribute / http.routes → UNWIRED_CALL_SITE
  control-loop/
    propose.ts, diff-summary.ts, approve.ts, snapshot.ts, quarantine.ts
  ports.ts                                 # GlueHostPort — the Jini-extraction seam
  __tests__/unit/, __tests__/integration/  # mirrors plugin-runtime's own split

apps/admin/src/sections/SiteGlue.tsx        # Tovu-only: approval UI, diff/summary render, quarantine notices — stays in Tovu regardless of extraction (Decision 6)

# Additive touches to existing files:
src/features/plugin-runtime/hook-registry.ts   # Attachment.source: "built-in" | "site" → + "glue"; compareTb01 sourceRank +1 branch
src/features/plugin-runtime/loader.ts          # extract attachLoadedPlugin(pluginId, source, sdk, hookRegistry) from the documented-but-unwired steps 4-5
```

## API / Event Contract Summary

- `GlueHostPort` (Decision 6) — the interface `site-glue/`'s core depends on; Tovu's composition root implements it against real subsystems.
- `attachLoadedPlugin(pluginId, source, sdk, hookRegistry)` (Decision 2.1) — new shared export from `plugin-runtime`, first called by Site Glue, later by SPEC-005's own fix.
- Domain events (Article VIII): `site-glue.module.staged`, `.approved`, `.reverted`, `.quarantined` — each carries `moduleId` as correlation id, mirrors ADR-022's write-attribution amendment.
- `UNWIRED_CALL_SITE` — new error code, same shape as `HOOK_UNKNOWN`, returned at load/dispatch time for the three unwired categories.

## Directory Structure Decision

Feature-based / vertical-slice: co-locate `__tests__/unit/` and `__tests__/integration/` under `src/features/site-glue/`, mirroring `plugin-runtime`'s own existing split (evidenced by `loader.ts` and `hook-registry.ts`'s own JSDoc references to `__tests__/unit/...` and `__tests__/integration/...`). No top-level `specs/` folder — this codebase's convention for feature modules keeps specs at `ADS-memory/specs/<NNN>-...` and tests co-located with the module, and Site Glue should not diverge from its own closest sibling.

## Enforcement

- CI: no import of `site-glue/` internals from `apps/admin/src/sections/SiteGlue.tsx` except through `GlueHostPort`'s exported surface — same discipline `plugin-runtime`'s own module boundary already implies.
- Code Review: any PR touching `hook-registry.ts`'s `compareTb01` or `Attachment.source` union must show the `glue` rank was added additively (existing `built-in`/`site` ranks unchanged).
- Governance ADR candidate: the `GlueHostPort` shape and the "general vocabulary, narrow dispatch-table" pattern are durable enough to outlive this feature (any future extension-point work should reuse the pattern) — flagged for `adr-governance` promotion evaluation once this ADR is accepted, not promoted preemptively while still DRAFT.

## Complexity Justification

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|---|---|---|---|
| III — Simplicity Gate | The six-category manifest vocabulary exceeds what the three v1-wired categories alone justify | A three-category-only manifest, extended later with a schema version bump when nav/render/routes are wired | The owner's explicit instruction is design-general/wire-narrow specifically to avoid a second manifest-versioning problem layered on top of ADR-005's existing frozen-ABI discipline; a v2 schema bump for glue would be the exact kind of ecosystem-wide breaking change ADR-024 §3 exists to prevent for the SDK, and glue would be reinventing that mistake one layer up |
| IV — Anti-Abstraction Gate | `GlueHostPort` has one real adapter (Tovu) today | Wire Site Glue directly against Tovu's concrete modules, no port, add the port only when Jini extraction actually starts | The owner's explicit instruction is to build port-shaped now so the later move is `git mv` + a strictness pass, not a rewrite; ADR-006 explicitly allows a documented rule-of-two plan naming a concrete (not speculative) second adapter, and Jini's own app-builder product is that named second, not a hypothetical one |

## Related Decisions

- Extends: SPEC-005 (plugin pipeline), ADR-024 (plugin trust model — composed with, Decision 1)
- Relates to: ADR-006 (rule-of-two, Decision 6), ADR-008 (change-set gateway, Decision 5), ADR-009 (decoupling — outbox reuse), ADR-021 (authorization as separate axis, referenced in Decision 1's composition argument), ADR-025 (client JS isolation — the reason REQ-6 excludes admin-panel contribution from this ADR's v1 scope entirely), ADR-027 (content-addressed blob storage — REQ-15's reused pattern), ADR-047 (widgets — REQ-27/28's fail-isolation precedent, `resolver-service.ts:62,92`)

---

## Critical Internal Constraints

**Cross-Feature Persistence — prior designations consulted:** `ADS-memory/reports/pipeline/005-plugin-system/critical-internal-constraints.md` exists and is referenced directly by the source comments this ADR verified (`capability-sdk.ts:9-19` cites CIC U-003; `loader.ts:2,15-20` cites CIC U-001; `hook-registry.ts:2,12-19` cites CIC U-004). Units CIC-1 and CIC-2 below **re-affirm and extend** U-003 and U-001 respectively to Site Glue's new vocabulary/loader path, rather than re-deriving them from scratch. CIC-3, CIC-4, CIC-5 are new designations with no prior unit to consult.

Candidate units checked against all seven triggers: (a) `GlueHostPort` — no trigger fires; it is pure delegation with no internal logic of its own, correctly excluded per the CIC artifact boundary's "ordinary CRUD, glue, mapping" exclusion. (b) `validateGlueManifest` — Algorithmic Correctness checked (bounded, pure, same shape as `validateManifest`'s already-certified pattern) — not designated; it is a straightforward extension of an existing, non-designated validator. (c) The five units below.

| Unit | Trigger | Plausible Wrong Implementation | Broken Property | Required Constraint | Escalation | Verification Surface |
|---|---|---|---|---|---|---|
| CIC-1: `GlueCapability` gate extension (`capability-gate.ts`) | Security-Critical Sequencing (re-affirms U-003) | Omit ungranted capability positions from the returned SDK object instead of always returning a present-but-throwing stub | A plugin calling an ungranted glue capability gets a bare `TypeError` on `undefined`, not a classified `CapabilityDeniedError` | Every one of the eight `GlueCapability` positions is always present on the returned handle; granted delegate, ungranted synchronously throw `CapabilityDeniedError` | `ESCALATE_SECURITY` (default per trigger) | Observable: unit test asserting `typeof sdk.<eachPosition>` is always `"function"` regardless of grant set |
| CIC-2: Loader validate-before-import ordering, extended to staging (`loader.ts` extension + `control-loop/propose.ts`) | Security-Critical Sequencing (re-affirms U-001, extended one step earlier) | Render the plain-language diff UI (REQ-13) before `validateGlueManifest()` has run against the staged manifest | A malformed or capability-invalid proposal reaches a human's approval decision, and possibly the loader, before static validation ever rejects it | `validateGlueManifest()` must complete successfully before (a) the diff/summary UI is populated and (b) `loadPlugin()`'s step 3 (code import) ever runs for a staged module | `ESCALATE_SECURITY` (default per trigger) | Observable: integration test proving a manifest failing validation never reaches the diff-render call, via an injectable diff-renderer test seam |
| CIC-3: Tool-registration fail-isolation wrapper (`attachment-points/tool-registration.ts`) | Failure / Recovery Constraint | Let a throwing or duplicate-id glue tool registration propagate into `buildAssistantToolRegistrations()`'s existing throw path | Core admin tool registration (all of `DOMAIN_SLICES`) fails to boot because one glue module is broken — the exact brick REQ-16 exists to prevent | A glue module's registration-building call is individually try/catch-wrapped; any throw or id collision (against core or another glue module) drops and auto-quarantines only that module, never propagates past the wrapper | `ESCALATE_IRREVERSIBLE` (added beyond default — a boot-blocking failure here strands the owner outside admin, functionally unrecoverable without out-of-band intervention, a more severe blast radius than hook-registry's own per-save CIC U-004, which explicitly declines this marker on a bounded-blast-radius argument that does not hold here) | Observable: integration test registering one deliberately-throwing glue module alongside real core domains, asserting the full core tool list still assembles and the broken module is absent, not the whole registration call throwing |
| CIC-4: Snapshot-before-write ordering (`control-loop/snapshot.ts`) | Failure / Recovery Constraint | Write the glue module's new file content, then snapshot the "old" content, or snapshot without confirming durability before the write proceeds | A crash between the file write and the snapshot leaves REQ-15's revert with no valid restore point — the exact case snapshot+rewind exists to prevent | The snapshot write for a glue module's prior content must complete and be confirmed durable before the corresponding new-content write is issued; a snapshot failure aborts the write (fail-closed for this one operation), never proceeds silently | `ESCALATE_IRREVERSIBLE` (default per trigger — content mutation without a durable prior-state backup) | Observable: fault-injection test killing the process between snapshot-confirm and file-write, asserting the resumed state always has a valid restore point for the last successful write |
| CIC-5: Quarantine transition attribution (`control-loop/quarantine.ts`) | Stateful Protocol Constraint | Flip the `site_glue_activations` row directly (a bespoke write) instead of routing the system-initiated quarantine through the same `executeCommand()` gateway REQ-14's owner-initiated approval uses | Quarantine becomes an untracked, unrevertible state change — the audit trail (compliance_auditability axis, scored 4 above) silently develops a gap for exactly the transition most likely to need it | Every quarantine transition, system- or owner-initiated, is an `executeCommand()` call through the same gateway, differing only in actor attribution (`system` vs the approving owner's principal id) | None (Binding, no escalation — mirrors REQ-14's own "reuse, no new mechanism" framing; the risk is audit-completeness, not security or irreversibility, since the gateway's existing revert path already covers it) | Observable: integration test asserting a system-triggered quarantine produces a `changeSetId`-correlated row identical in shape to an owner-triggered `disabled` transition, differing only in `actorId` |

**Required Ordering Constraints:**

| Ordering | Property Protected | Verification Surface | Trace |
|---|---|---|---|
| `validateGlueManifest()` before diff/summary render, before `loadPlugin()` step 3 | No unreviewed, invalid, or capability-non-compliant code is ever shown to a human for approval or ever evaluated | CIC-2 | REQ-12, CIC U-001 (re-affirmed) |
| Snapshot-write-confirm before new-content-write | A revert always has a valid restore point for the last successful write | CIC-4 | REQ-15 |
| Tool-registration try/catch wrap before merge into the final registration list | Core's fail-fast domains never observe a glue-caused throw | CIC-3 | REQ-8, REQ-16 |

---

## Implementation Outline (embedded — see note)

*Note on process adaptation: this project's convention for this workstream places ADRs at `ADS-memory/reports/architecture/ADR-NNN-*.md` directly, not under the generic `reports/pipeline/<NNN>-<feature>/` structure the Implementation Outline skill assumes as a separate file. Per the dispatch's single-file deliverable, this section fulfills the outline's artifact boundary inline rather than as a second file, consistent with how ADR-024/025/047/055 in this same folder already carry this level of structural detail in-ADR.*

**Trigger check:** Boundary Cross (yes — crosses `plugin-runtime`, `assistant`, `apps/admin`, `widgets`, `core/events`, `server/routes` ownership domains), Contract Change (yes — `GlueManifest`, `GlueHostPort`, `attachLoadedPlugin`), System Wiring (yes — Decision 2's dispatch table), Critical Cross-Boundary Invariant (yes — REQ-16's no-brick invariant spans admin boot + tool registration), Parallelization Ambiguity (yes — three wired categories can be built in parallel once `GlueManifest`/`GlueHostPort` are frozen). **Produced, not skipped.**

- **Module responsibilities**: as listed in Module/Service Boundaries above; `site-glue/` owns the product-neutral mechanism, `apps/admin/src/sections/SiteGlue.tsx` owns Tovu-specific presentation, `plugin-runtime` owns the one additive extraction (`attachLoadedPlugin`).
- **Parallelizable slices for `tasks.md`**: (1) `manifest.ts` + `validateGlueManifest` + `capability-gate.ts` — no dependencies, build first, blocks everything else. (2) content-lifecycle adapter + `attachLoadedPlugin` extraction — depends on (1). (3) tool-registration adapter + fail-isolation wrapper — depends on (1), independent of (2). (4) events adapter — depends on (1), independent of (2)/(3). (5) control loop (propose/validate/diff/approve/snapshot/quarantine) — depends on (1), independent of (2)/(3)/(4) except for the `GlueHostPort.runChangeSet`/`snapshotBlob` seam. (6) `SiteGlue.tsx` admin UI — depends on (5)'s contract, not its implementation (can build against a stub).
- **Data ownership**: `site_glue_activations` (owned by `site-glue/control-loop`, mirrors `plugin_activations`), `site_glue_snapshots` (owned by `site-glue/control-loop`, content-addressed per ADR-027's pattern). Neither touches any existing table.
- **Observability**: `site-glue.module.{staged,approved,reverted,quarantined}` events, each `moduleId`-correlated, per Article VIII compliance above.

---

## Concerns

**Engaging with the spec's own §12 concern directly, not restating it.** The spec says the trust story is "honest, not strong" and leans on recovery to compensate. I agree with the diagnosis and want to sharpen one part of it: **the recovery machinery this ADR designs is only as strong as the auto-quarantine threshold, which is explicitly undetermined.** REQ-16's "no-brick invariant, concretely" names three mechanisms acting together — but two of the three (fail-isolated containment, snapshot+rewind) are unconditional once built, while the third (auto-quarantine) is conditional on a number nobody has chosen yet. Until that number exists, a glue module that fails *just below* whatever threshold eventually gets picked can degrade a call site indefinitely without ever tripping the safety net REQ-16 promises. This isn't a flaw in the architecture — it's a genuine gap between "the mechanism exists" and "the mechanism is tuned," and I want it visible rather than implied-solved by the mechanism's existence.

**A second concern the dispatch brief didn't ask about, worth raising anyway**: Decision 2.1's extraction of `attachLoadedPlugin` out of `loader.ts`'s dead comment means Site Glue becomes the first code path in this entire codebase to actually exercise `hookRegistry.attach()` and `runBeforeSave()` in production. That is good — it retires a real gap — but it also means the first real-world exposure of `runBeforeSave`'s previously-only-tested logic happens via agent-authored code, not via a human-reviewed plugin. If `runBeforeSave` has a latent bug no test caught (its own doc comment discloses an unbounded per-plugin-filter cost with no latency budget), Site Glue is the mechanism that will surface it first, in production, attached to code a non-technical owner approved without reading. I don't think this blocks the design — SPEC-005's mechanism should work regardless of who calls it — but it is a reason to treat `hook-registry.ts`'s existing certified test suite as a gate that must stay green through this ADR's implementation, not an assumption to wave past.

## What I could not verify

- Whether the daemon's tool-registration boot failure (`DOMAIN_SLICES` throwing on collision) is process-fatal or caught further up the boot sequence — the spec itself flagged this as unverified, and I did not trace the daemon's top-level boot/catch behavior either. Decision 4's design does not depend on the answer (glue never enters that throw path regardless), but the *severity* of CIC-3's `ESCALATE_IRREVERSIBLE` marker would be worth re-checking against the real answer once known — if the existing behavior is already caught and non-fatal, CIC-3's marker could arguably relax; I chose to keep it conservative given the uncertainty.
- Whether `plugin-runtime`'s `installDir` is currently wired anywhere in the server composition root — `grep` for `installDir` outside `discovery.ts` and its tests returned nothing, meaning I could not confirm the exact real filesystem path `site-glue/` should sit alongside today, only that it should be structurally parallel to wherever that resolves once it exists. This is a real open wiring question for the Programmer stage, not resolved here.
- The exact shape SPEC-005's own eventual fix to `loader.ts` steps 4-5 will take, and whether it will actually call the `attachLoadedPlugin` extraction this ADR proposes rather than something else — I designed the extraction to be the natural shared point, but SPEC-005's own future implementer could reasonably choose differently; this ADR's Decision 2.1 is not binding on that future work, only on Site Glue's own use of it.

## Open — `[NEEDS CLARIFICATION]`, not resolved here

1. **Auto-quarantine thresholds** (spec §11.2, REQ-17) — failure count, window, timeout. No precedent in this codebase to derive from. **Does not block implementation of everything except the quarantine trip condition itself** — the mechanism (counter, gateway-routed system-attributed flip) can be built with a placeholder default and tuned later; but per the Concerns section above, REQ-16's invariant is incomplete until a real number lands. Recommend: ship with a conservative documented placeholder (e.g., 3 failures in 5 minutes) explicitly marked as a placeholder pending owner input, rather than blocking the rest of the feature on this one number.
2. **Raw source visibility** (spec §11.3) — whether a technically-curious owner or support engineer gets any raw-diff affordance beyond REQ-13's plain-language summary. **Blocks the approval UI's final shape** (Decision 5's `SiteGlue.tsx`), but not the underlying mechanism — the control loop's data model (staged manifest + code, diff-summary schema) supports either answer without rework; only the UI's rendering choice depends on it.

Both were left open by the spec deliberately and are owner calls, not evidence gaps this ADR could close.

---

## Handoff Contract

- **Inputs used:** `ADS-memory/specs/048-extension-glue-tier/spec.md` (full, all 18 REQs), `ADS-memory/reports/recon/2026-08-04-spec-048-phase1-recon.md`, `ADS-memory/governance/constitution.md`, `ADR-024`/`ADR-025`/`ADR-055` (read in full as precedent/context), `ADR-INDEX.md` (scanned for related decisions — 003/006/008/009/012/021/027/047); source verified directly: `src/features/plugin-runtime/{manifest,loader,hook-registry,capability-sdk,discovery}.ts`, `src/features/plugin-runtime/built-ins/word-count/index.ts`, `src/features/plugin-runtime/tool-registrations.ts:104-135`, `src/assistant/tool-registrations.ts` (DOMAIN_SLICES + `buildAssistantToolRegistrations`), `apps/admin/src/panels.tsx`, `src/widgets/resolver-service.ts:62,92`, `src/core/events/*.ts`, `packages/sdk/src/index.ts:45,104-106`, `Jini/scripts/check-engine-boundaries.ts:9,66-70,351-369`; `grep`-verified zero production call sites of `hookRegistry.attach()` and no `installDir` wiring outside `discovery.ts`.
- **Output summary:** Site Glue composes onto SPEC-005/ADR-024 via a new orthogonal authorship-trust axis (Decision 1) and a general six-category manifest vocabulary dispatched through three real, mechanism-reusing adapters plus three typed unwired placeholders (Decision 2). Fail-isolated containment is a v1 requirement, not deferred — corrected from the dispatch brief's framing, because tool registration is simultaneously v1-wired and admin-surface-categorized (Decision 4). The agent-author control loop (Decision 5) is the one genuinely new mechanism, given five designated Critical Internal Constraints. The whole mechanism is Jini-portable by construction via `GlueHostPort` (Decision 6), operationalizing the owner's deferred-move instruction as a real module boundary rather than an aspiration.
- **Decisions made, one-line rationale each:**
  - Authorship trust is a second axis composed with, not added to, ADR-024's ladder — because ADR-024 answers a different question (distribution) than the one Site Glue needs answered (reviewability).
  - Category-specific adapters over one generic registry — because content-lifecycle's fail-closed merge/validate step cannot be honored by a shape generic enough to also fit tool registration and outbox events.
  - Fail-isolated containment ships in v1 — because tool registration is both v1-wired and admin-surface-categorized per the spec's own classification; this is a correction, not a judgment call.
  - `loadPlugin()`'s steps 4-5 gap is closed via a shared extraction (`attachLoadedPlugin`), not forked or assumed fixed elsewhere — because Site Glue would otherwise either duplicate hook-attachment logic or silently depend on unfixed SPEC-005 code.
  - `GlueHostPort` exists now, with one real adapter — because the owner's explicit instruction was to build port-shaped ahead of the deferred Jini move, and ADR-006 permits this given a named, non-speculative second adapter.
- **What I overturned from the spec:** the dispatch brief's framing that fail-isolated containment "may not be needed yet" for v1 — verified false against the spec's own REQ-5/REQ-8 tables; tool registration is in both v1 and the admin-surface-category list simultaneously, so the containment work is not deferrable.
- **The two remaining clarification markers and whether they block implementation:** auto-quarantine thresholds (does not block most of the feature; blocks REQ-16's invariant being *complete*, not its mechanism being *buildable* — ship with a documented placeholder); raw-source visibility (blocks only the approval UI's final rendering choice, not the underlying data model or control loop).
- **Concerns:** the quarantine-threshold gap is a real, currently-open hole in the no-brick invariant's completeness (not its design); Site Glue will be the first production exerciser of `hook-registry.ts`'s previously-untested-in-production `runBeforeSave` path, via agent-authored rather than human-reviewed code.
- **Could not verify:** whether `DOMAIN_SLICES`'s existing boot-failure throw is process-fatal (inherited uncertainty from the spec, not resolved here); the real filesystem location `installDir` will resolve to, since no composition-root wiring exists yet to inspect; whether SPEC-005's own eventual fix will actually reuse `attachLoadedPlugin` as designed here.
- **Suggested next assignee:** owner, for the two remaining `[NEEDS CLARIFICATION]` markers (auto-quarantine threshold, raw-source visibility) and for DRAFT→ACCEPTED sign-off on this ADR itself; then Implementation Outline consumers (TDD/Programmer) for the five designated CIC units and the parallelizable slice plan above.

---

## Amendment — 2026-08-20 (2-round multi-model swarm consensus: Tovu extension surface)

A 2-round multi-model architecture debate (Primary Claude Opus 5; peers `gpt-5.6-sol` at xhigh,
Gemini 3.1 Pro and Gemini 3.7 Flash, both owner-downweighted; non-voting adversarial review by
Claude Sonnet 5) re-examined the whole extension surface, not just this ADR. Full record:
`ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`. Round 1
was 3–1 on the question below; round 2, after a correction preamble, was **unanimous, including
the peer that had argued to keep two mechanisms.** This amendment does not itself move this ADR's
Status out of DRAFT — the finding below is written for the same owner sign-off Decisions 1–6
already require, exactly as the rest of this document already is.

### 1. SUPERSEDED — Decision 2 and Decision 6's premise that Site Glue is a real, composed-onto second mechanism

Decision 2 and Decision 6 were written against an assumption this amendment's own source-verification
disproves: that Site Glue is a working adapter layer sitting beside `plugin-runtime`, connected
through a real `GlueHostPort` adapter. It is not. Verified directly against the current tree, not
inferred:

- **No runtime exists.** `src/features/site-glue/` has no `loader.ts` — the directory holds
  `manifest.ts`, `capability-gate.ts`, `ports.ts`, and three `attachment-points/*.ts` files, all of
  which are schema/type/delegation code with no discovery, activation, or dispatch mechanism behind
  them.
- **`GlueHostPort` has zero non-test implementations anywhere in `src`.** `ports.ts:23-24` states
  this in its own header comment — *"this interface is pure delegation with no internal logic — no
  implementation lives in this file, only the contract shape"* — and `ports.ts:27-28` — *"No
  implementation is provided here — the one real adapter is later, out-of-slice work."* A repo-wide
  search for `implements GlueHostPort`, `: GlueHostPort =`, and `satisfies GlueHostPort` returns
  nothing. The "one real adapter" the ADR's own text anticipated was never built.
- **Zero production callers of `attachment-points/*`.** `attachGlueContentLifecycle` in
  `attachment-points/content-lifecycle.ts`, and the equivalent functions in
  `attachment-points/tool-registration.ts` and `attachment-points/events.ts`, each take an injected
  `hostPort: Pick<GlueHostPort, ...>` parameter (e.g. `content-lifecycle.ts:34`, `events.ts:31`,
  `tool-registration.ts:49`) that is never supplied outside `__tests__/`. A repo-wide search for
  `attachment-points` imports outside `site-glue/__tests__/` returns nothing.
- **`plugin-runtime` is the one working substrate.** `src/features/plugin-runtime/` has real
  `loader.ts`, `activation.ts`, `quarantine.ts`, `discovery.ts`, and `hook-registry.ts`, and is
  composed into the server: `src/server/plugin-runtime.ts`,
  `src/server/routes/admin/plugins/set-enabled.ts`, and `src/server/boot/plugin-sdk-resolver.ts` all
  call into it in production. This is the system that actually loads, activates, and quarantines
  code today.

**Conclusion:** Site Glue is *one working substrate (`plugin-runtime`) plus an unfinished design*,
not two systems. Decision 2's category-adapter pattern and Decision 6's `GlueHostPort` seam are not
wrong as designs — they are simply unbuilt, and the premise that they already compose onto a working
mechanism (stated throughout the Decision 2/6 prose and in the Module Boundaries listing) does not
hold. Continuing to build a second loader/discovery/activation path under `site-glue/` would
duplicate `plugin-runtime`'s existing, production-composed mechanism for no reason this ADR
identified — Article I (Library-First) and the spec's own §2 constraint ("nothing here invents a
second artifact format, a second loader, or a second capability-checking mechanism," quoted in this
ADR's own Context) argue against it as strongly as they argued against a fork in the first place.
The merge target is `plugin-runtime`: extend its manifest/loader/activation vocabulary to carry
glue's call-site and authorship concerns, rather than finishing `site-glue/` as a parallel path.

### 2. SURVIVES — Decision 1's authorship-trust axis, recast as metadata on one extension record

Decision 1's diagnosis was not wrong, only its packaging. ADR-024's tier ladder answers "how much of
the machine, from whom" (execution/distribution trust); Decision 1 correctly identified a second,
orthogonal question ADR-024 never had to answer: "has a human who understands the change looked at
it" (authorship/reviewability trust). That axis is real and does not disappear because the two
mechanisms merge — it becomes a constraint the merged system enforces, not a justification for a
second runtime.

Concretely: `origin` and `authorship` become **installer-recorded fields on one extension record**,
alongside `tier` (ADR-024's existing execution ladder) and the `kind`/`capabilities` split the same
debate converged on independently (RESULT 3 of the synthesis — not restated in full here, out of
this amendment's scope):

```
origin:       "built-in" | "marketplace" | "upload" | "local-agent"
authorship:   "publisher" | "operator" | "agent"
tier:         tier-1 | tier-2 | tier-3        (how code runs — ADR-024's ladder, unchanged)
kind:         render.component | http.route | …  (where it attaches)
capabilities: [...]                             (what authority the handler gets)
```

"Never distributed" (Decision 1's fixed answer for glue-authored code) stays true regardless of what
runtime executes it. What changes is that this is now expressed as one closed `origin` value on a
shared record type, not as a separate tier-ladder leaf carved out for a separate mechanism.

### 3. Binding invariant — `origin` must be installer-assigned and un-promotable

**No migration and no admin action may promote a `local-agent`-origin extension to
marketplace-eligible.** Doing so would let code with no publisher acquire a publisher's distribution
rights — precisely the failure this ADR's trust axis exists to prevent (Decision 1's own framing:
"Site Glue's code is never distributed... Tier-3 execution semantics, forever local").

This is not merely a policy assertion — it is mechanically supported by code already in this
codebase. `src/features/plugins/plugin-identity.ts` permanently retires a `pluginId`'s provenance the
moment it is first minted:

- `mintPluginIdentity()` is documented "First-write-wins. Never called again for a `pluginId` once
  minted" (`plugin-identity.ts:69`).
- `checkNamespaceAdoption()` "Does NOT mutate the identity record on anything but first mint — a
  provenance mismatch never silently overwrites the record on record (permanent retirement)"
  (`plugin-identity.ts:84-87`). A provenance change on an already-minted id (e.g. `local-agent` →
  `marketplace`) without a matching signature returns `{ allowed: false, track: "consent-required" }`
  (`plugin-identity.ts:106-110`) — it is refused, not silently accepted, and even with operator
  consent the mechanism as written does not overwrite the stored provenance.

This mechanically supports treating "a glue-authored module becomes a marketplace plugin" as **a new
extension with a new id and a fresh `origin: "marketplace"` record**, never a promotion of the
existing `local-agent` record. No new enforcement code is required to uphold the invariant for
identity/provenance — it already exists; it needs to be carried into whatever manifest/loader
extension the merge in §1 produces, so the invariant is checked at the same chokepoint for every
`origin`, not re-implemented per call site.

### 4. Integrity hashing stays installer-scoped — this does not reopen §1

Integrity hashing (this ADR's Decision 2.1 discussion of `loadPlugin()`'s `integrity: {}` map)
applies in the distributed-artifact installer only. Local, co-deployed glue code has no artifact
distinct from itself to verify — hashing it against itself is a no-op, not a weaker security
posture. This policy difference between distributed and local-origin code is real and should be
preserved in the merged manifest shape (§2's `origin` field is exactly the discriminator it needs),
but it is a difference in *what one field's value implies*, not a reason to keep two loaders. §1's
conclusion stands regardless of this difference.

### 5. Flagged, not resolved here — ADR-024 §2's Tier-3 marketplace-listing reversal

During the same debate, the owner decided that **Tier-3 code is now marketplace-listable**,
reversing ADR-024 §2's *"Tier-3 plugins are never listable in the public marketplace... the catalog
physically cannot offer executable third-party code until Tier-2 isolation exists."* This is recorded
here as context, per the dispatch instruction, not re-litigated by this amendment.

**This ADR's own Decision 1 text is directly touched by that reversal** — it states Site Glue is
"forever excluded from ADR-024 §2's marketplace-eligibility question," which was true because ADR-024
§2 categorically excluded all Tier-3 code from the marketplace. With that categorical exclusion gone,
the sentence needs to be read as: Site-Glue-authored code specifically stays excluded, not because
Tier-3 code in general can never be listed, but because of §3 above's `origin: "local-agent"`
invariant — a narrower, identity-based exclusion rather than a tier-based one. The two mechanisms
(tier-based exclusion, now removed; origin-based exclusion, this amendment's §3) happened to produce
the same practical answer for Site Glue, which is why the merge doesn't collapse under the reversal —
but they are no longer the same rule, and future readers of Decision 1 should not assume ADR-024 §2
still forbids Tier-3 listing in general.

**Recommendation: this reversal wants its own ADR-024 amendment, not a paragraph here.** The rule it
changes — §2's marketplace forcing function — is ADR-024's own textual home, is load-bearing for
ADR-024's Consequences section (the "shipping the marketplace is shipping the sandbox" argument) and
its Open/Debate-record sections, and affects the whole plugin trust model, not just glue-authored
code. Folding it into this ADR would bury an ADR-024-scoped decision inside an ADR-057-scoped
amendment, and a future reader auditing ADR-024's marketplace-gating logic would not find it here.
