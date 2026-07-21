# Feature Spec: Plugins Admin Section — SCOPING DRAFT, NOT SPEC-READY

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-045 |
| version | 0.1.0 |
| status | DRAFT — **blocked on an owner scope decision, not just a checkpoint** (see below) |
| feature_name | FEAT-045-plugins-admin |
| last_edited | 2026-07-21T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Coordinator (dispatched slice — Spec Agent persona) |
| spec_mode | brownfield (against a foundation that turns out not to exist yet — see below) |

**This file is deliberately not a complete, implementable spec.** Per this dispatch's own framing
("the highest-risk, most under-specified item... flag clearly if you think it needs an owner
decision on scope before it's spec-ready, rather than guessing") and this project's Spec Agent
guardrail ("Never hand off with unresolved `[NEEDS CLARIFICATION]` markers — escalate to human"), the
right artifact here is a findings-and-options memo with one blocking clarification, not a
premature full package. Forcing a complete spec into existence for an admin screen over a backend
that (per the research below) does not exist yet would produce something that reads as
implementation-ready but isn't — worse than admitting the gap plainly.

---

## Overview (of the investigation, not a shipped feature)

The task as framed — "admin view of installed plugins and their state: enable/disable, capability
tier, any config surface" — assumes there is a set of installed, loadable plugins with discoverable
state for an admin screen to surface. **That assumption does not hold in this codebase today.**

---

## What Actually Exists (evidence, not inference)

1. **`nav.ts` has a `plugins` entry** (`id: "plugins"`, `href: "#/section/plugins"`, in the "Design &
   System" group) — **note:** this entry does **not** currently carry `soon: true` (a minor
   discrepancy from this dispatch's framing, checked directly against
   `apps/admin/src/nav.ts` — worth flagging in case that's a recent, unrelated edit, not something to
   read into). Regardless, **`App.tsx`'s section-route switch has no `case "plugins":`** — grep
   confirms zero matches — so it falls through to the generic `<Placeholder sectionId={route.sectionId} />`.
   No `Plugins.tsx` file exists anywhere under `apps/admin/`.
2. **`src/features/plugins/`** contains exactly: `data-module.ts`, `disk-headroom.ts`,
   `migration-journal.ts`, `migration-recovery.ts`, `plugin-identity.ts`, `restore.ts`,
   `snapshot.ts`, `store/store-plugin.ts`. Reading every one of them: **this entire directory
   implements ADR-023's core-mediated `dataModule` DDL-mediation engine** — the mechanism that lets a
   *first-party, compiled-in* feature (newsletter, SEO, the `store` spike) declare tables and have
   *core* run the DDL safely (snapshot-before-change, crash recovery, namespace-adoption guard). It is
   not a loader for third-party plugin *code* — nothing here discovers, verifies, imports, enables,
   or disables an installed artifact. `store/store-plugin.ts`'s own header calls itself a "SPIKE...
   exploratory spike beyond ADR-023 §12's v1 disposition," not a real installed plugin.
3. **SPEC-005 ("Plugin System — Artifact, Capability-Scoped Loader, One Hook, `ext.*` Fields")** is
   `APPROVED`, `v1.0.0`, and **already fully specifies** exactly the admin-list/enable/disable surface
   this task asked for: REQ-10 — `GET /api/admin/v1/workspaces/:workspaceId/plugins` returning
   `id`/`name`/`version`/`source`/`status`/`enabled`/`errors[]`, plus a gateway-backed enable/disable
   mutation, certified by AC-11/AC-02/AC-13. REQ-01..03/07/08/09 specify the artifact envelope, load
   pipeline, capability-scoped SDK, enable/disable-through-the-gateway lifecycle, and a bundled
   `word-count` dogfood plugin. **None of it is implemented.** Grepping the entire `src/` tree for
   `word-count`, `definePlugin`, `content.entry.beforeSave`, `@tovu/sdk`, `plugin_activations`, or any
   `/plugins` HTTP route returns nothing outside SPEC-005's own spec text. SPEC-005 itself explicitly
   deferred the admin UI as its own **OQ-02** ("Admin extension-manager UI... `ui.spec.md` omitted") —
   so even if REQ-10 existed in code, SPEC-005 never claimed a UI came with it.
4. **ADR-024 (plugin execution & trust model, ACCEPTED)** and **ADR-025 (plugin client/admin JS
   isolation, ACCEPTED)** are *planning* ADRs describing a tiered trust model and a not-yet-built
   iframe/postMessage isolation mechanism for any plugin-contributed admin UI. ADR-024's own Open
   section lists "settings storage + migration, uninstall/data-lifecycle... signing/provenance" as
   "designed-for, not built now." ADR-025 exists specifically because a plugin's *own* admin panel
   would be dangerous to render same-origin — but there is no plugin admin-panel mechanism at all yet
   for that isolation to protect (OQ-07, "admin-surface/extension-panel registry," is explicitly
   "blocked until it lands").
5. **The `_plugin_identity` table** (`plugin-identity.ts`) does record a `pluginId` +
   provenance + mint-timestamp row for every internal module that has ever called the dataModule
   engine (newsletter, SEO, `store`, …) — but these are compiled-in core features using a shared
   internal mechanism, not toggleable/removable third-party installs. Relabeling this table as "your
   installed plugins" in an admin screen would be actively misleading (an operator could not disable
   "newsletter" from it — it isn't a plugin in any user-facing sense).

**Conclusion:** the backend concept this task's admin screen would surface — an installed,
loadable, toggleable plugin with discoverable state — does not exist in this codebase's
implementation, only in an approved-but-unbuilt spec (SPEC-005) and a set of planning ADRs for the
tiers/isolation around it.

---

## Why This Blocks a Normal Spec Pass

The Spec Agent's own functional-model completeness gate requires stopping when "the blueprint
includes unresolved `[OWNERSHIP UNCLEAR]`" or the underlying feature depends on unbuilt foundations
being silently assumed. This is exactly that case: writing REQ/AC for "list installed plugins,
show capability tier, enable/disable" would either (a) silently assume SPEC-005's loader gets built
as a prerequisite — a much larger, unscoped project this dispatch never authorized — or (b) invent a
narrower, dishonest substitute (e.g., dressing up the `_plugin_identity` table as a plugin list) that
doesn't match what an operator would reasonably expect a "Plugins" screen to do. Neither is a
defensible spec to hand to a Software Architect.

`[NEEDS CLARIFICATION: which of the three options below should this spec target — Option A
(implement SPEC-005's own still-unbuilt REQ-01/02/03/07/10 as this feature's real prerequisite, then
a thin list+toggle UI on top), Option B (an honest placeholder — leave `nav.ts`'s Plugins entry as
`soon: true` and do nothing further this round), or Option C (something narrower I haven't
considered)? This is a scope/priority call, not something inferable from the code or specs alone.]`

---

## Options (for the owner, not a recommendation baked into a spec)

### Option A — Treat this as "finish SPEC-005," then add the thin admin UI SPEC-005 always intended
SPEC-005 is already `APPROVED` and already specifies exactly the REQ-10 surface this task wants.
Under this option, SPEC-045 would not be a new spec at all — it would be a **SPEC-005 amendment**
(parallel in shape to the SPEC-006 amendment produced alongside this memo) that: (1) implements
REQ-01/02/03/07/08/09/10/11 as written (the artifact loader, capability-scoped SDK, the one hook
point, `word-count`, the `plugins` table + list/enable/disable route), and (2) resolves SPEC-005's
own OQ-02 by adding a `ui.spec.md` for a list+toggle screen. **This is the option that actually
produces a truthful "Plugins admin" screen** — but it is substantially larger than the other two
items in this dispatch: it's a loader/artifact/hook/SDK system, not a CRUD screen. Rough shape: this
would itself warrant its own TDD→Programmer pass at SPEC-005's scale, likely multiple sessions.

### Option B — Honest placeholder, defer everything
Leave (or restore) `nav.ts`'s `plugins` entry as `soon: true`, add nothing else. Zero implementation
risk, zero false promise to the operator. The cost: the nav item sits inert until Option A (or some
future option) is chosen and resourced. **This is the low-risk default if the owner does not want to
greenlight SPEC-005's implementation right now.**

### Option C — Narrower interim: surface the dataModule registry, relabeled honestly
Build a small, honestly-scoped admin screen — **not called "Plugins"** — that lists the
`_plugin_identity` registry's rows (module id, provenance, mint date) as something like "Data
Modules" or "Installed Extensions (core)," read-only, no enable/disable (these aren't toggleable).
This gives the nav slot *something* real to show without pretending third-party plugin support
exists. Judged **not recommended** by this memo: it satisfies the letter of "show something under
Plugins" while likely confusing an operator who reads "Plugins" as "things I installed," which none
of these are. Documented as an option because it's cheap, not because it's good.

**This memo's own read:** Option A is the only one that actually delivers what "Plugins admin" means
to a user, but it's a different-shaped, larger project than this dispatch's other two items; Option B
is the safe default absent an explicit go-ahead to start SPEC-005's implementation. Option C is
listed for completeness, not endorsed.

---

## Risk / Scope Assessment (explicit, as requested)

**Relative risk vs. the other two items in this dispatch: highest, by a wide margin.** The
users/roles/policies amendment (SPEC-006) and workspace administration (SPEC-044) are both CRUD
completions over foundations that already exist and are already exercised in production code. This
item has no such foundation — the honest options are "build the foundation first" (a materially
larger project) or "don't build the screen yet" (zero new risk, zero new value). There is no
CRUD-shaped middle path here the way there was for the other two items — this memo tried to find one
(Option C) and does not think it is worth building.

---

## Implementation Readiness Gate

- [ ] status set to APPROVED — **blocked.** Not a checkpoint-pending DRAFT (unlike SPEC-044/the
      SPEC-006 amendment) — this is a genuine open scope decision that changes the shape of the work
      by an order of magnitude depending on the answer (Option A vs. B).
- [ ] Zero `[NEEDS CLARIFICATION]` markers — **one remains, by design** (see above); it is the
      entire point of this artifact.
- [x] Evidence for every claim above is cited against actual repo paths/spec sections, not inference
      or memory (anti-hallucination policy)
- [x] Options are concrete enough to greenlight directly — if the owner picks Option A, the next step
      is dispatching Spec Agent work against SPEC-005 (an amendment, not a new number) with an
      implementation-outline-level Software Architect pass given its size; if Option B, this file's
      job is done and no further work is needed this round; if Option C, a from-scratch small spec
      would still be needed (not written here, to avoid producing spec content for a not-recommended
      path)

**Gate result:** BLOCKED — this artifact's job is to present the fork clearly, not to guess past it.
No further spec work should proceed on this item until the owner picks a direction.
