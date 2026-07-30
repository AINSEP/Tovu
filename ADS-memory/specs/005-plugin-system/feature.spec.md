# Feature Spec: Plugin System — Artifact, Capability-Scoped Loader, One Hook, `ext.*` Fields (v1 Walking Skeleton)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| version | 1.1.2 |
| status | APPROVED |
| content_hash | sha256:1e496a69afc3df0992ed5dc69989dc1e86fd9910551501c78c3120425e2305b8 |
| feature_name | FEAT-005-plugin-system |
| last_edited | 2026-07-28T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |
| revision_note | **1.1.2 (2026-07-28) — AMENDMENT: adds REQ-18 (plugin list row displays its trust-tier badge), resolving Red-Team finding RT-010** (`reports/pipeline/005-plugin-system/red-team-findings-v1.1.1-amendment.md`). RT-010 flagged that `ui.spec.md` §9's "Capability tier" disclosure item discussed only the `capabilities` array, never the new `plugin.tier` field 1.1.1 added to REQ-01 — leaving undisclosed whether ADR-024 §1's stated operator-facing install/trust-consent purpose for `tier` was met or deliberately deferred (unlike `capabilities`, which is explicitly deferred to OQ-11). **Owner decision (Leon Aburime, 2026-07-28): show it.** ADR-024 §1 states `plugin.tier` exists specifically to inform an operator's install/trust decision, exactly as `theme.json.tier` does (ADR-020); displaying it on the one plugin admin surface that exists is a direct, low-effort extension of that already-stated purpose, not a new feature idea. **Fix:** REQ-10's response gains one additive field, `tier` (`api.spec.md` §5, `state.spec.md`'s `PluginDiscoveryRecord.tier`), projected verbatim from the already-required `PluginManifest.tier` (REQ-01/ADR-024 §1) — mirroring exactly how `enabled` is already projected from `plugin_activations` into the same record; no other field changes. New REQ-18 (`ui.spec.md` §3.1/§5) renders that value as a per-row badge, mirroring the existing `status`/`source` badge convention verbatim (`Redirects.tsx`: the enum string itself is always the visible text, color never the sole signal) rather than inventing new label copy — grounded in ADR-024 §1's own tier vocabulary, not a fresh design decision. New AC-26 [P2] requires the badge to render whichever of `tier-1`/`tier-2`/`tier-3` a given record actually carries (synthetic test fixtures permitted, exactly as AC-11's "invalid site plugin" fixture already is), not merely assert today's universal `tier-3` value. `ui.spec.md` §9's "Capability tier" disclosure item is retitled to disambiguate it from this now-built `tier` field — the `capabilities` array itself remains deferred (OQ-11), unchanged. `errors.spec.md`/`behavior.spec.md` are content-unchanged (package-level version bump only): no new error code or validation rule is introduced — `tier` is already a required, validated manifest field as of 1.1.1; this amendment only threads its already-validated value through an existing read path. **Red-Team disposition (this pass's own call, not a re-dispatch):** `red-team-findings-v1.1.1-amendment.md`'s RT-010 already reviewed this exact fork as ADVISORY and pre-cleared either resolution (fold into OQ-11, or display now) without demanding further adversarial review of either path; given this change is additive-only (one new response field, mirroring an existing projection pattern; the badge mirrors the existing `status` badge convention verbatim; no new component, error code, or state transition), a dedicated fresh Red-Team round is judged unnecessary — mirroring how this session's RT-002-style micro-fixes proceeded straight to TDD. TDD may certify AC-26 as a small addendum alongside (or immediately after) its certification of REQ-12..17/AC-18..25/EC-11. **Constraint honored:** spec content only — no production/frontend code was written; `apps/admin/src/sections/Plugins.tsx` (not yet built) implements REQ-18 alongside REQ-12..17 when Programmer work proceeds. **Prior history: 1.1.1 (2026-07-28) — FIX: adds ADR-024's `plugin.tier` field to REQ-01; clears the 1.1.0 DRAFT→APPROVED human checkpoint.** While reviewing the backend, the Software Architect's ADR (`reports/pipeline/005-plugin-system/adr.md`) flagged a genuine spec-content gap: ADR-024 (Plugin Execution & Trust Model, ACCEPTED 2026-07-08 — one day after this spec's original 2026-07-07 approval) introduces a `plugin.tier` manifest field ("drives onboarding and install consent, exactly as `theme.json.tier` does") that had no home in REQ-01's required-field list, and REQ-01 rejects unknown top-level manifest keys — the same shape as the earlier RT-002 `engine` fix. **Fix:** REQ-01 now requires `tier`, one of `tier-1` \| `tier-2` \| `tier-3` — the literal vocabulary SPEC-032/ADR-023 already established for this same ADR-024 tier taxonomy (ADR-024's own text names the tiers "Tier-1"/"Tier-2"/"Tier-3" but does not itself spell a JSON literal; SPEC-032's `DataModuleDecl.pluginTier: "tier-1" | "tier-2" | "tier-3"` is the existing, approved encoding of the identical ADR-024 concept, cited there against "Tier-2 and Tier-3 plugins only (ADR-024)"). v1's in-process ESM loader is exactly what ADR-024 itself calls Tier-3 ("Today's in-process ESM reality... Local / first-party / explicitly sideloaded only"), so every v1 manifest — including the bundled `word-count`, REQ-09 — declares `tier: "tier-3"`; a missing or out-of-vocabulary value fails validation under the existing `MANIFEST_MALFORMED` code, exactly like every other required field (no new error code invented: ADR-024 does not specify a distinct runtime-enforcement error for a non-Tier-3 declaration in v1 — that is Tier-2 sandbox-rung work, OQ-06/ADR-024 §4 — so this stays a minimal, mechanical field addition). `state.spec.md` (`PluginManifest.tier`) and `behavior.spec.md` (BR-02 validation order + §10 Default Values) are updated to match, mirroring exactly how `engine` is threaded through those same two files; `errors.spec.md`/`api.spec.md`/`ui.spec.md` are content-unchanged (package-level version bump only). **Human checkpoint:** owner Leon Aburime approved building SPEC-005 in full, including the 1.1.0 UI amendment (Option A; recorded in `reports/pipeline/005-plugin-system/pipeline-state.md`, 2026-07-28) — **DRAFT→APPROVED human checkpoint cleared** by owner Leon Aburime. The coupled approval-gate markers are flipped: Implementation Readiness Gate CONDITIONAL → PASS; DoD B-03 (status) and B-32 (readiness gate) FAIL → PASS; Overall DoD FAIL → PASS. **This does not mean Red-Team has reviewed the new material** — REQ-12..17/AC-18..25/EC-11/`ui.spec.md` and this REQ-01 `tier` change still require a Red-Team pass before TDD may certify tests against them; Coordinator routes to Red-Team next, per standard pipeline order — do not skip ahead to Software Architect/TDD on this new material. The canonical content_hash is recomputed (`--update-hash`) to absorb both the REQ-01 content change and the in-body gate-marker flips. **Prior history:** 1.1.0-DRAFT (2026-07-28) — AMENDMENT: resolves OQ-02 by adding the admin plugins list+toggle UI. Per the SPEC-045 scoping memo's Option A (owner-greenlit 2026-07-28), this amendment adds `ui.spec.md` — a plugins list+enable/disable admin screen (`apps/admin/src/sections/Plugins.tsx`, route `#/section/plugins`) consuming REQ-10's already-approved `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract (api.spec.md §1/§5) as a black box; it invents no new backend surface. New: REQ-12 (list screen renders every `PLUGINS_LIST` record: id/name/version/source/status/enabled/errors), REQ-13 (the enable/disable toggle's in-flight, success, and failure interaction), REQ-14 (empty state), REQ-15 (loading/initial-fetch-error states), REQ-16 (per-row inline display of a plugin's own `errors[]`), REQ-17 (un-marking `nav.ts`'s `soon: true` `plugins` entry and wiring `App.tsx`'s `case "section"` dispatch to render the new screen); AC-18..25; EC-11 (double-activation single-flight guard). OQ-02 is marked RESOLVED for the list+enable/disable slice this amendment covers; the remainder of OQ-02's original scope (install-via-upload, per-plugin settings/config UI) is not covered — REQ-02's filesystem-only install path is unchanged and no HTTP endpoint or manifest field exists for a config surface — carried forward as new OQ-11. v1.0.0's approved core is byte-unchanged: REQ-01..11, AC-01..17, INV-01..07, EC-01..10, the artifact/manifest format, the capability/hook/ext contracts, and the `@tovu/sdk` surface were untouched by that amendment (REQ-01 changes only now, at 1.1.1, per the fix above). Status reverted APPROVED → DRAFT at 1.1.0 because REQ-12..17/AC-18..25/EC-11 were new material that had not been through Red-Team or an owner DRAFT→APPROVED checkpoint — the same two-step gate the original v1.0.0 approval went through, mirroring the SPEC-006 v0.6.0 amendment precedent exactly; that checkpoint is what 1.1.1 above formally clears. |

---

## Overview

The first end-to-end plugin loop, deliberately **thin**: prove that a prebuilt plugin **artifact** can be verified, loaded through a **capability-scoped SDK**, attach to **one typed hook point**, contribute one **`ext.{pluginId}` field** (no DDL), and be **enabled/disabled through the SPEC-001 gateway** so rollback is free — dogfooded by one bundled example plugin (`word-count`). This is the walking-skeleton slice of the extension surface (tovu-v2-design §3 kernel registries, tier 4), implementing the accepted decisions in ADR-003 (no plugin DDL; `ext.{pluginId}` JSON), ADR-004 (prebuilt ESM + signed manifest artifact, versioned side-by-side install), and ADR-005 (SDK is the public API).

> **⚠️ COME BACK TO THIS LATER (owner-directed 2026-07-07).** This slice intentionally builds the *smallest* substrate that proves the loop. The full extension surface — admin extension-manager UI, the AI-tool registry bridge, the admin-surface registry, a rich hook catalog, queryable/searchable `ext` fields with generated columns, cross-plugin dependency resolution, ed25519 signature verification, the marketplace/provenance pipeline, and a worker-thread/isolate sandbox — is **deferred to follow-on specs** (tracked as OQ-01…OQ-08 below). None of those are cut; they are sequenced after the skeleton stands. Every deferral keeps the *artifact and SDK contracts forward-compatible* so the later specs extend, never rewrite.

**v1 boundary calls (all logged as OQs where deferred):**
- *Capability enforcement is API-surface-level, not a sandbox* (ADR-004): an in-process ESM module can still touch `fs`/`process.env`/network. Acceptable for v1 (first-party + local installs); never marketed as sandboxing. Stricter isolation is OQ-06.
- *One hook point only.* Core declares exactly `content.entry.beforeSave` in v1 (a typed filter). The typed-hook registry is real; its catalog is one entry (OQ-03 grows it).
- *`ext` fields are store-only in v1.* Declared fields must be `queryable: false`; the generated-column/index promotion path (ADR-003) is deferred (OQ-04).
- *Integrity required, signature optional* (ADR-004 rule 6): per-file SHA-256 integrity is enforced from day one; ed25519 provenance signatures are parsed-but-not-required (OQ-05).
- *Admin UI (list + enable/disable) ships as of 1.1.0.* `ui.spec.md` resolves OQ-02 for that slice — plugin install-via-upload and any per-plugin settings/config UI remain out of scope (new OQ-11); REQ-02's filesystem install path and REQ-10's response shape are unchanged by this amendment.

---

## Problem Statement

**Current state:** Tovu has no plugin concept. There is no artifact format, no loader, no SDK package, no hook system, no `ext` column, and no capability model — the `plugins/` directory SPEC-003 creates is empty and meaningless, exactly as `themes/` was before SPEC-004. The kernel registries (v2-design §3) that extensions hang off are mostly "Not built."

**Desired state:** A prebuilt plugin artifact dropped into a site (or shipped as a built-in) is verified, loaded behind a capability-scoped SDK, and can extend content — proven by `word-count`, which on save stamps a word count into `ext.word-count.count` and stops cleanly when disabled, with the enable/disable recorded as revertible change sets.

**Why now:** Phase framing (v2-design §3.5 tier 4): the plugin loop is the third ecosystem compatibility surface after the install dir (SPEC-003) and the theme format (SPEC-004). ADR-005 is explicit that the SDK compatibility *promise* must exist **before the first third-party plugin** — so the SDK and its snapshot test have to land with the first loader, not after. It is also the AI story: `ext` fields and typed hooks are the substrate an agent later extends.

**Success signal:** From a fresh boot, `word-count` is discovered as a built-in valid plugin; enabling it (one change set) makes saved entries carry `ext.word-count.count`; disabling it (one change set, revertible) stops new writes while retaining prior values; a tampered artifact is refused with `INTEGRITY_FAILED`; an `sdkRange`-incompatible artifact is refused with `PLUGIN_INCOMPATIBLE`; the `@tovu/sdk` public-API snapshot test passes and a deep import of `@tovu/core` from a plugin fails to resolve.

---

## User Journey

1. **Trigger:** A developer builds a declarative plugin artifact (or uses the bundled `word-count`) and a site operator enables it from the API.
2. **Steps:**
   1. At boot, discovery scans built-ins + `<install-dir>/plugins/*/`, verifies each artifact's integrity and `sdkRange`, and lists them (`GET …/plugins`) with `status` and `enabled`.
   2. The operator enables `word-count`. The request validates the plugin, then runs the enable mutation through the SPEC-001 gateway (change set recorded); the loader `import()`s `server/index.mjs` and registers it through a capability-scoped SDK that exposes only `content.read`, `content.extend`, and `hooks.attach`.
   3. The plugin attaches to the typed hook point `content.entry.beforeSave`. Saving an entry runs the filter, which computes the word count from `bodyJson` and writes `ext.word-count.count`.
   4. The operator dislikes it and disables it (or reverts the enable change set) — the hook stops firing; existing `ext.word-count.count` values remain readable but inert.
3. **Outcome:** Third-party behavior with no third-party DDL and no private-API back doors; enable/disable is audited and revertible.
4. **Alternate paths:** A tampered or incompatible artifact never loads and is listed with its error. A plugin that attaches to an undeclared hook, declares an out-of-vocabulary capability, or declares a `queryable` field is `invalid` and cannot enable. A plugin hook that throws fails the save (fail-closed) and leaves the entry unchanged.

---

## Scope

**In scope:**
- The `.tovu-plugin` artifact envelope + `tovu.plugin.json` manifest (v1 required-field subset) — REQ-01 (ADR-004, ADR-024 `plugin.tier`)
- Install-dir layout `plugins/<id>/<version>/` + active pointer; versioned side-by-side install — REQ-02 (ADR-004)
- Load pipeline: integrity → `sdkRange` → dynamic import → capability-scoped registration — REQ-03
- Capability model (minimal vocabulary) enforced at the SDK boundary — REQ-04 (§3 registry 5)
- Typed hook system with exactly one declared point, `content.entry.beforeSave` — REQ-05 (§3 registry 4)
- `ext.{pluginId}` extension fields, store-only, no DDL — REQ-06 (ADR-003)
- Enable/disable lifecycle through the SPEC-001 gateway; disable retains data — REQ-07
- Minimal `@tovu/sdk` package + public-API snapshot test — REQ-08 (ADR-005)
- Bundled `word-count` example plugin (dogfood proof) — REQ-09
- `GET …/plugins` list + gateway-backed enable/disable mutation — REQ-10
- Additive `ext` exposure on entry DTOs — REQ-11
- **(1.1.0)** Admin plugins list + enable/disable screen (`Plugins.tsx`, `#/section/plugins`),
  consuming REQ-10's `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract as a black box — REQ-12..17
  (`ui.spec.md`, resolves OQ-02 for this slice)
- **(1.1.2)** Plugin list row displays its trust tier as a badge (`ui.spec.md` §5) — REQ-18,
  resolving Red-Team finding RT-010 (owner decision: show it, per ADR-024 §1)

**Out of scope (deferred — see OQs; the "come back later" surface):**
- ~~Admin extension-manager UI (install/enable/disable/settings screens) — OQ-02 (ui.spec.md
  omitted)~~ — **OQ-02 partially RESOLVED (1.1.0):** the list+enable/disable slice now ships
  (`ui.spec.md`, REQ-12..17). Install-via-upload and per-plugin settings/config UI remain deferred
  (new OQ-11) — REQ-02's filesystem-only install path is unchanged and REQ-10's response shape
  carries no config surface.
- AI-tool registry bridge (MCP/AG-UI) and admin-surface registry contributions — OQ-01, OQ-07
- Hook catalog beyond the single point; new hook points *offered* by plugins — OQ-03
- Queryable/searchable `ext` fields, generated columns, promotion path — OQ-04 (ADR-003 indexing policy)
- ed25519 signature verification, marketplace, provenance trust — OQ-05
- Cross-plugin `dependencies` resolution / lockfile install — OQ-08
- Worker-thread/isolate sandboxing (stricter than API-surface enforcement) — OQ-06
- Plugin-owned tables via tier-promotion (ADR-003 consequence) — not in a walking skeleton
- `tovu plugin build` CLI depth beyond stamping integrity for the bundled example
- Uninstall/purge flow (v1 covers enable/disable; hard uninstall + explicit purge is a follow-on)

---

## Requirements

- REQ-01: A plugin artifact is a `.tovu-plugin` tarball (ADR-004) containing `tovu.plugin.json` (manifest) and `server/index.mjs` (prebuilt ESM `definePlugin()` entry). v1 **required** manifest fields: `id` (`^[a-z0-9-]+$`, 1–50 chars, equal to its install folder name), `name`, `version` (semver), `engine` (integer plugin-contract version, 1 in v1; a value newer than the runtime supports ⇒ `ENGINE_UNSUPPORTED`), `tier` (the plugin's trust tier under ADR-024's tiered execution/trust model — exactly one of `tier-1` \| `tier-2` \| `tier-3`, the same literal vocabulary SPEC-032/ADR-023 already established for this identical ADR-024 taxonomy; `plugin.tier` drives onboarding and install consent exactly as `theme.json.tier` does per ADR-020, per ADR-024 §1. v1's loader is exactly the in-process ESM reality ADR-024 itself designates Tier-3 ("Today's in-process ESM reality... Local / first-party / explicitly sideloaded only"), so every v1 manifest — including the bundled `word-count`, REQ-09 — declares `tier: "tier-3"`; a missing or out-of-vocabulary `tier` value fails validation like any other missing required field, `MANIFEST_MALFORMED`), `sdkRange` (semver range for `@tovu/sdk`), `capabilities` (subset of the v1 vocabulary, REQ-04), `hooks` (declared points consumed), `fields` (`ext` field declarations, REQ-06), and `integrity` (SHA-256 per packaged file). Fields **parsed-and-stored but unused in v1** (forward-compat, no behavior): `adminSurfaces`, `contentTypes` (net-new types), `provenance.signature`, `dependencies`. Unknown top-level manifest keys fail validation.
- REQ-02: Installed plugins live at `<install-dir>/plugins/<id>/<version>/` (the unpacked artifact). Multiple versions of one id may coexist; an **active pointer** (persisted in `content.db`, REQ-07) names the enabled version. Rollback between installed versions is a pointer flip, never a migration (ADR-004 rule 4, ADR-003).
- REQ-03: The load pipeline (run at boot for enabled plugins, and on enable) is, in order: (1) verify every file against `integrity` (mismatch ⇒ `INTEGRITY_FAILED`); (2) check `sdkRange` satisfies the runtime `@tovu/sdk` version (miss ⇒ `SDK_RANGE_UNSATISFIED`/`incompatible`); (3) dynamic `import()` `server/index.mjs`; (4) invoke `definePlugin` with a **capability-scoped SDK** exposing only the manifest's granted surface; (5) attach the plugin's declared hooks. Any step failing short-circuits: the plugin is not loaded and its status records the reason.
- REQ-04: The manifest declares `capabilities`; the SDK object handed to the plugin exposes **only** the granted surface. A plugin invoking a surface it did not declare fails at the SDK boundary (`CAPABILITY_DENIED`). v1 capability vocabulary (exactly these three): `content.read` (read entries in a hook), `content.extend` (declare + write `ext` fields), `hooks.attach` (attach to declared hook points). A manifest declaring any other capability is `invalid` with `CAPABILITY_UNKNOWN`.
- REQ-05: Core declares exactly one typed hook point in v1: `content.entry.beforeSave` — a **filter** with the typed signature `(entry: Readonly<ContentEntryDraft>, ctx: HookContext) => ExtPatch`. The entry is passed **read-only**; the filter returns an `ExtPatch` (`{ [field: string]: value }`) that core merges into `ext.{pluginId}` after validating it per BR-06. A v1 filter **cannot mutate core entry fields** (`title`, `slug`, `status`, `bodyJson`) — the contract only permits contributing to the plugin's own `ext` namespace, matching the `content.extend` capability. Any returned key targeting a core field is rejected (`FIELD_PATH_INVALID`). Plugins attach via `addFilter("content.entry.beforeSave", fn)` and may attach **only** to declared points; attaching to any other name marks the plugin `invalid` with `HOOK_UNKNOWN` (anti-hook-soup: no dynamic string hooks). Declared points are enumerable via `tovu hooks list`. (Core-field transformation — rewriting title/slug/status — is deferred to a distinct future capability + hook that re-validates through SPEC-002's rules — OQ-09.)
- REQ-06: A plugin declares extension fields in `fields[]`, each `{ path: "ext.{pluginId}.{field}", type, queryable: false }`. Core's schema registry validates each declaration (path must be namespaced to the plugin's own id; `queryable` must be `false` in v1) and validates written values against the declared `type`. Field data is stored in a namespaced JSON **`ext` column** on the owning record (SQLite: validated JSON text; Postgres later: `jsonb`). **No DDL is ever run for a plugin** (ADR-003 INV). Disabling/removing a plugin never deletes `ext` data. Because `ext` is written in the same transaction as the entry (BR-06), it is part of the entry's audited state: the SPEC-001 gateway's inverse pre-image for a content-entry save captures the pre-edit `ext` alongside the core fields, so reverting a content-save change set restores `ext` together with them (BR-08, AC-17). Restoring a stored `ext` snapshot is a pure data write and does **not** require the contributing plugin to be enabled — or even installed — at revert time.
- REQ-07: Enabling or disabling a plugin executes as a **command through the SPEC-001 gateway**: exactly one applied change set per transition; disable is the inverse of enable (reverting the enable change set disables, and vice versa). Enabled state + active version live in `content.db` (a `plugin_activations` row per plugin), not in the install dir or `config.json` — consistent with SPEC-003's runtime-mutable-settings-in-the-db rule and SPEC-004's `activeThemeId`. A disabled plugin is not loaded, its hooks do not fire, and its `ext.{pluginId}` data is retained inert.
- REQ-08: A minimal `@tovu/sdk` package exports exactly: `definePlugin`, the capability-scoped SDK surface **type**, the `content.entry.beforeSave` hook-point name + typed signature, and the three capability tokens (REQ-04). `@tovu/core` internals are private: `package.json` `exports` maps block deep imports (ADR-005 rule 1). A **public-API snapshot test** pins the SDK surface (types + runtime exports); changing it fails CI unless acknowledged (ADR-005 rule 4). Hook names, capability names, and manifest fields are part of this public surface and follow the ADR-005 deprecation ladder.
- REQ-09: `word-count` ships **built into the runtime** in the artifact format (dogfood proof): manifest declares `capabilities: ["content.read","content.extend","hooks.attach"]`, one field `ext.word-count.count: integer` (`queryable: false`), and one hook attachment to `content.entry.beforeSave`. Its filter computes the word count by concatenating all `text`-node string values in `bodyJson` (depth-first) with single spaces, trimming, splitting on `/\s+/`, and counting non-empty tokens, then returns `{ count }` as its `ext` patch. It is discovered even in legacy mode (no install dir).
- REQ-10: `GET /api/admin/v1/workspaces/:workspaceId/plugins` returns every discovered plugin: `id`, `name`, `version`, `source` (`built-in` | `site`), `tier` (`tier-1` | `tier-2` | `tier-3` — **(1.1.2)** additive field, projected verbatim from the plugin's already-required `PluginManifest.tier`, REQ-01/ADR-024 §1), `status` (`valid` | `invalid` | `incompatible`), `enabled` boolean, `errors[]` (empty when valid). Enable/disable is a gateway-backed admin mutation (`PLUGIN_ENABLE` endpoint, REQ-07). No admin UI consumed this contract in v1.0.0; **(1.1.0)** REQ-12..17/`ui.spec.md` add one; **(1.1.2)** REQ-18 renders the new `tier` field as a per-row badge.
- REQ-11: Admin and content entry DTOs gain an additive optional `ext` object (`{ [pluginId]: { …fields } }`), present only when a plugin has written fields; all pre-feature response fields are unchanged.
- REQ-12 **(1.1.0)**: The admin app gains a plugins list screen at route `#/section/plugins`
  (`nav.ts`'s existing `plugins` entry, currently `soon: true`) that renders every record
  `GET …/plugins` (REQ-10) returns — `id`, `name`, `version`, `source`, `status`, `enabled`,
  `errors[]` — in the exact order the endpoint returns it (TB-01: built-ins first by id ascending,
  then site plugins by id ascending); no client-side re-sort. Full component/prop/event contract:
  `ui.spec.md`.
- REQ-13 **(1.1.0)**: Each row exposes a single enable/disable toggle control that calls
  `PATCH …/plugins/:pluginId` (`PLUGIN_SET_ENABLED`, REQ-10) with `{ enabled: <the opposite of the
  row's current enabled value> }`. While that row's request is in flight, its control is disabled
  and shows an in-flight label; other rows remain interactable (independent per-row in-flight state,
  not a single screen-wide lock). On a 200 response the full list is re-fetched — the server is the
  source of truth, not a locally-mutated value — matching this codebase's established toggle
  convention (`Roles.tsx`, `Redirects.tsx`: await, then reload; no client-side pre-flip of the value
  ahead of confirmation). On a non-2xx response the row's displayed `enabled` value is left exactly
  as it was before the click (nothing was ever speculatively changed, so there is nothing to roll
  back) and an error message is surfaced. A row whose `status` is not `"valid"` never offers a
  control that can request `enabled: true` (REQ-10/BR-05 already know this would 422); the row's
  existing `enabled: true` → disable path is unaffected by `status`, since disabling has no validity
  precondition (BR-05). Full interaction/error contract: `ui.spec.md` §§4-5/8.
- REQ-14 **(1.1.0)**: When `GET …/plugins` returns zero records, the screen renders an explicit
  empty-state notice instead of an empty table (matches this codebase's existing empty-list idiom,
  e.g. `Roles.tsx`'s "No roles yet.", `Redirects.tsx`'s "No redirect rules yet."). In practice
  REQ-09's bundled `word-count` plugin means this state is not reachable in v1 (discovery always
  yields at least one built-in record) — this requirement exists so the contract stays true if that
  ever changes, not because the empty case is expected in normal operation.
- REQ-15 **(1.1.0)**: The screen has an explicit loading state (rendered while the initial
  `GET …/plugins` call is in flight) and an explicit error state (rendered in place of the table when
  that call rejects), matching the existing convention across this admin app's list screens (a
  `<div className="notice">…</div>` / `<div className="notice error">…</div>` pair, no dedicated
  retry control — reloading the page is how an operator retries, same as every sibling screen).
- REQ-16 **(1.1.0)**: A row whose `status` is `"invalid"` or `"incompatible"` renders its own
  `errors[]` entries (`code` + `message`) inline on that row, not only inside a shared/global banner
  — an operator diagnosing one broken plugin among many must not have to guess which row a global
  error refers to.
- REQ-17 **(1.1.0)**: `nav.ts`'s existing `plugins` entry gains its `href: "#/section/plugins"` back
  and drops `soon: true`; `App.tsx`'s `case "section":` dispatch gains a
  `route.sectionId === "plugins"` branch rendering the new screen (mirroring its existing `"roles"`/
  `"redirects"` branches) so the entry no longer falls through to `<Placeholder>`. This requirement
  is the one place this amendment touches files outside `ADS-memory/specs/` in effect —
  the actual edits are Programmer work, not Spec Agent work; this REQ records the contract those
  edits must satisfy.
- REQ-18 **(1.1.2)**: Each row in the plugins list (REQ-12) additionally displays that plugin's
  declared trust tier as a badge, using REQ-10's additive `tier` field verbatim (one of `tier-1` |
  `tier-2` | `tier-3` — REQ-01's required manifest field, ADR-024 §1). Rendering mirrors the existing
  `status` badge convention exactly (`<span className="status status-${plugin.status}">{plugin.status}</span>`,
  `ui.spec.md` §5, `Redirects.tsx`): the tier string is always the visible badge text, never conveyed
  by color alone — no new label copy is invented beyond the literal manifest value already frozen by
  REQ-01. This directly implements ADR-024 §1's stated purpose for `plugin.tier` — informing an
  operator's install/trust decision — on the one plugin admin surface that exists in v1 (resolves
  Red-Team finding RT-010; owner decision 2026-07-28: show it). Full contract: `ui.spec.md` §3.1/§5.

---

## Acceptance Criteria

- AC-01 (REQ-09) [P1]: Given `word-count` is enabled, when an entry with a 5-word `bodyJson` is saved, then the stored record and the admin read payload carry `ext.word-count.count == 5`, and a change set exists for the save.
- AC-02 (REQ-07) [P1]: Given `word-count`, when it is enabled then disabled, then each transition records exactly one applied change set, and after disable a subsequent save does not write `ext.word-count.count` while the previously written value is retained.
- AC-03 (REQ-03) [P1]: Given a plugin whose `server/index.mjs` bytes don't match its `integrity` hash, when discovered, then it is listed `status "invalid"` with `INTEGRITY_FAILED`, it is not loaded, and its hooks never fire.
- AC-04 (REQ-03) [P1]: Given a plugin whose `sdkRange` excludes the runtime `@tovu/sdk` version, when discovered, then it is `status "incompatible"` with `SDK_RANGE_UNSATISFIED`, and enabling it returns 422 `PLUGIN_INCOMPATIBLE` with no change set.
- AC-05 (REQ-04) [P1]: Given a plugin that calls an SDK surface outside its declared capabilities, when a content save triggers that call, then the SDK boundary throws `CAPABILITY_DENIED`, the save returns 500 `PLUGIN_HOOK_FAILED`, and the entry is unchanged (no partial write, no change set).
- AC-06 (REQ-05) [P1]: Given a plugin attached to `content.entry.beforeSave` that returns an `ext` patch, when an entry is saved, then the persisted entry's `ext.{pluginId}` reflects the patch; given a filter that returns a key targeting a core field (e.g. `slug` or `status`), then that key is rejected with `FIELD_PATH_INVALID` and the core field is unchanged; given a plugin manifest attaching to `content.entry.afterEverything`, when discovered, then it is `invalid` with `HOOK_UNKNOWN`.
- AC-07 (REQ-06) [P1]: Given a plugin declaring `ext.word-count.count`, when an out-of-type value is written, then validation rejects it; given a manifest field path `ext.other-plugin.x`, when validated, then the plugin is `invalid` with `FIELD_PATH_INVALID`; and no schema DDL is executed for the plugin at any point.
- AC-08 (REQ-06) [P2]: Given a manifest field declared `queryable: true`, when validated, then the plugin is `invalid` with `QUERYABLE_UNSUPPORTED_V1` (deferred capability, OQ-04).
- AC-09 (REQ-02) [P2]: Given two installed versions of one plugin id, when the plugin is enabled, then exactly one version — the latest installed by semver — is loaded, and the other version's `server/index.mjs` is never imported. (Operator-chosen version *switching* between coexisting installs is deferred — OQ-09b; v1 install coexistence exists so a future switch is a pointer flip, but the enable API selects the latest, not an arbitrary version.)
- AC-10 (REQ-08) [P1]: Given the `@tovu/sdk` public-API snapshot test, when the SDK surface is unchanged, then it passes; given a plugin `import`ing `@tovu/core/internal`, when it is loaded, then resolution fails (blocked by `exports`).
- AC-11 (REQ-10) [P1]: Given built-in `word-count` plus one valid and one invalid site plugin, when `GET …/plugins` is called, then all three appear with correct `source`, `status`, `enabled`, and `errors`.
- AC-12 (REQ-01) [P1]: Given an artifact missing `server/index.mjs`, when validated, then it is `invalid` with `CODE_ENTRY_MISSING`; given an artifact missing a required manifest field, then it is `invalid` with `MANIFEST_MALFORMED`.
- AC-13 (REQ-07) [P1]: Given `word-count` enabled via a change set, when that change set is reverted (SPEC-001), then the plugin is disabled and its `ext` data is untouched throughout.
- AC-14 (REQ-11) [P2]: Given an entry with no contributing plugin, when its DTO is read, then no `ext` object is present; given `word-count` has written to it, then the DTO carries `ext.word-count.count` and all pre-feature fields are unchanged.
- AC-15 (REQ-05) [P2]: Given the running system, when `tovu hooks list` is invoked, then it enumerates `content.entry.beforeSave` with its typed signature and declared owner.
- AC-17 (REQ-06 / SPEC-001 REQ-07) [P1]: Given `word-count` enabled and an entry saved twice so `bodyJson` word count — and thus `ext.word-count.count` — goes 5 → 9, when the second save's change set is reverted (SPEC-001), then in one revert both `bodyJson` and `ext.word-count.count` return to their pre-second-edit values (count 5), the `content.entry.beforeSave` hook does **not** re-fire during the revert, and the entry `version` increments by 1. Given the contributing plugin has since been disabled or uninstalled, the same revert still restores the pre-edit `ext` snapshot verbatim (the restore is pure data and needs no plugin). Given the reverted save was the one that first created the plugin's `ext` namespace, revert restores the pre-image in which that `ext` is absent.
- AC-16 (REQ-09) [P1]: Given a runtime with no install dir (legacy mode), when plugins are discovered, then built-in `word-count` is listed and can be enabled; site plugins are simply absent.
- AC-18 (REQ-12) [P1] **(1.1.0)**: Given built-in `word-count` plus one valid and one invalid site plugin (the AC-11 fixture), when an operator navigates to `#/section/plugins`, then the screen renders exactly three rows, each showing that record's `id`/`name`/`version`/`source`/`status`/`enabled`, in API response order (built-ins first, id ascending — TB-01).
- AC-19 (REQ-13) [P1] **(1.1.0)**: Given a valid, disabled plugin, when its "Enable" control is activated, then `PATCH …/plugins/:id {enabled:true}` is sent, the control shows an in-flight state until the response arrives, and on 200 the list is re-fetched and the row shows `enabled:true`; given a valid, enabled plugin, the symmetric "Disable" path holds.
- AC-20 (REQ-13) [P1] **(1.1.0)**: Given a toggle request that returns a non-2xx response (`404 PLUGIN_NOT_FOUND`, `422 PLUGIN_INVALID`, `422 PLUGIN_INCOMPATIBLE`, or `500`), when the response is received, then an error message is shown, the row's displayed `enabled` value is unchanged from its pre-click value, and the control returns to its normal (non-in-flight) state so another attempt can be made.
- AC-21 (REQ-13) [P1] **(1.1.0)**: Given a plugin with `status: "invalid"` or `status: "incompatible"` and `enabled:false`, when its row renders, then no control capable of requesting `enabled:true` is offered; given the same plugin with `enabled:true` (a plugin that became invalid after being enabled), when its row renders, then a "Disable" control is still offered and remains functional.
- AC-22 (REQ-14) [P2] **(1.1.0)**: Given `GET …/plugins` returns an empty array, when the screen renders, then the empty-state notice is shown and no `<table>` element is rendered.
- AC-23 (REQ-15) [P1] **(1.1.0)**: Given the initial `GET …/plugins` call is in flight, the screen shows its loading notice; given that call rejects, the screen shows its error notice instead of a table and renders no partial/stale data.
- AC-24 (REQ-16) [P2] **(1.1.0)**: Given a plugin with `status: "invalid"` and a non-empty `errors[]`, when its row renders, then every entry's `code` and `message` appear on that specific row.
- AC-25 (REQ-17) [P1] **(1.1.0)**: Given this amendment has shipped, when the admin sidebar renders, then the "Plugins" nav entry is an active link (not disabled/`soon`); when activated, the route renders the plugins screen, not `<Placeholder>`.
- AC-26 (REQ-18) [P2] **(1.1.2)**: Given a set of discovered plugin records whose manifests declare different `tier` values (e.g. one record `tier: "tier-1"`, one `tier: "tier-3"` — synthetic test fixtures are permitted here exactly as AC-11's "invalid site plugin" fixture already is; no shipped v1 manifest other than `tier-3` need exist for this test), when `#/section/plugins` renders, then each row's tier badge shows that record's own `tier` value verbatim — a `tier-1` record renders `tier-1`, a `tier-2` record renders `tier-2`, a `tier-3` record renders `tier-3` — the badge is never hardcoded to always show `tier-3` regardless of the underlying record.

---

## Invariants

- INV-01: A plugin must never execute DDL — only core creates/alters tables (ADR-003). Any plugin attempt to alter schema is refused (`DDL_ATTEMPTED`).
- INV-02: A plugin must never reach an SDK surface it did not declare a capability for — enforced at the SDK boundary, not by trust.
- INV-03: Disabling or removing a plugin must never run a destructive migration; `ext.{pluginId}` data is retained inert until an explicit future purge (ADR-003).
- INV-04: A plugin must never load if integrity verification or the `sdkRange` check fails.
- INV-05: Every enable/disable transition must be gateway-audited (SPEC-001 INV-01 applies unchanged).
- INV-06: A plugin may attach only to hook points declared with a typed signature — no dynamic string hooks (anti-hook-soup, §3 registry 4).
- INV-07: The public plugin API is exactly the `@tovu/sdk` exports; a plugin importing `@tovu/core` internals is unsupported and blocked by `package.json` `exports` (ADR-005; the Gutenberg private-API back door is an explicit failure condition).

---

## Edge Cases

- EC-01: What happens when `tovu.plugin.json.id` differs from the install folder name?
  Expected behavior: `invalid` with `ID_FOLDER_MISMATCH` (prevents rename drift; parity with SPEC-004 themes).
- EC-02: What happens when `sdkRange` excludes the runtime SDK version?
  Expected behavior: `incompatible` with `SDK_RANGE_UNSATISFIED`; not loaded; enable returns 422 `PLUGIN_INCOMPATIBLE` (AC-04).
- EC-03: What happens when a packaged file's bytes don't match its `integrity` hash (tamper)?
  Expected behavior: `invalid` with `INTEGRITY_FAILED`; not loaded (AC-03).
- EC-04: What happens when a manifest declares a `queryable: true` field?
  Expected behavior: `invalid` with `QUERYABLE_UNSUPPORTED_V1` — the generated-column path is deferred (OQ-04, AC-08).
- EC-05: What happens when a plugin attaches to an undeclared hook name?
  Expected behavior: `invalid` with `HOOK_UNKNOWN`; not loaded (AC-06).
- EC-06: What happens when a plugin calls an undeclared capability at runtime?
  Expected behavior: the SDK boundary throws `CAPABILITY_DENIED`; the triggering content op fails `PLUGIN_HOOK_FAILED`, entry unchanged (AC-05).
- EC-07: What happens to a disabled plugin's `ext` data on read?
  Expected behavior: retained and still returned in the entry's `ext` object (inert); the plugin simply stops writing new values (AC-02/AC-14).
- EC-08: What happens when two installed versions of the same id exist?
  Expected behavior: the latest installed version by semver loads; the other is dormant on disk (AC-09). Operator-chosen version switching is deferred (OQ-09b).
- EC-09: What happens when serving in legacy mode (no install dir)?
  Expected behavior: only built-in plugins (`word-count`) are discovered; everything else behaves identically (AC-16).
- EC-10: What happens when a `content.entry.beforeSave` filter throws inside the plugin?
  Expected behavior: fail-closed — the save fails with `PLUGIN_HOOK_FAILED`, the entry is unchanged, no change set is recorded, and a structured error is logged. **Recovery:** because a throwing filter blocks *all* content saves while the plugin is enabled, and `PLUGIN_SET_ENABLED` is independent of the content-write path, the operator disables the offending plugin via `PATCH …/plugins/:id {enabled:false}` to restore saves. (Automatic quarantine / safe-mode that disables a repeatedly-throwing plugin without operator action is deferred to the `recovery` library — OQ-06.)
- EC-11 **(1.1.0)**: What happens when an operator activates a row's enable/disable toggle a second
  time before the first request's response has arrived?
  Expected behavior: the second activation is a no-op — the control is already in its disabled/
  in-flight state (REQ-13), so no second `PATCH` request is sent; the SPEC-001 gateway's optional
  `Idempotency-Key` support (api.spec.md §4) is available as a defense-in-depth backend guard but
  this UI does not send one in v1 (no admin screen in this codebase sends that header today), so the
  client-side single-flight discipline is the operative guard, not a server-side dedupe key.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-001 gateway + change sets | Audited, revertible enable/disable | Gateway not wired ⇒ unaudited activation | SPEC-001 implementation precedes (already required by SPEC-002/004) |
| SPEC-002 `PostRecord` + `updatePost`/`createEntry` | The content write path the `beforeSave` hook wraps; the record the `ext` column hangs on | Write path drift breaks hook insertion point | SPEC-002 precedes; hook fires inside the feature layer, not the route |
| SPEC-003 install dir (`plugins/` dir) | Site-installed plugin location | Legacy mode has no dir | Built-ins only (EC-09) |
| SPEC-004 discovery/validation pattern | Reused shape for discover → validate → list → enable | Divergence duplicates logic | This spec mirrors SPEC-004's validator/registry structure |
| `src/infra/db/schema.ts` + `drizzle/` (Drizzle, adopted 2026-07-06) | The `ext` column on `posts` + `plugin_activations` table land as schema edits + generated migrations | Non-additive migration corrupts sites | Additive columns/tables only; `drizzle-kit generate`; Drizzle journal idempotency |
| `@tovu/sdk` (new package) | The public plugin API + snapshot test | Missing SDK ⇒ plugins bind to core internals (ADR-005 failure) | REQ-08 stands up the minimal SDK first |
| `src/features/presentation` activation pattern | Model for gateway-backed enable/disable | — | `plugin_activations` mirrors `presentation_settings` |

---

## Open Questions

- OQ-01: AI-tool registry bridge — exposing plugin-contributed tools to MCP/AG-UI, RBAC-gated (Strapi `services/mcp/*` is the reference; competitor-analysis "MCP tool surface gated by RBAC") — Owner: Leon Aburime — Resolve by: assistant/tool-surface spec (ADR-013/014)
- OQ-02: ~~Admin extension-manager UI (list/install/enable/disable/settings)~~ — **RESOLVED
  (1.1.0), partially:** the list+enable/disable slice ships via `ui.spec.md` (REQ-12..17).
  Install-via-upload and per-plugin settings/config UI are not covered — carried forward as OQ-11. —
  Owner: Leon Aburime — Resolve by: shipped 2026-07-28 (list+toggle slice)
- OQ-03: Hook catalog growth + plugins *offering* new typed hook points; action vs filter taxonomy — Owner: Leon Aburime — Resolve by: second bundled plugin (comments/feeds) demand
- OQ-04: Queryable/searchable `ext` fields → core-generated columns + expression indexes + promotion path (ADR-003 indexing policy) — Owner: Leon Aburime — Resolve by: first plugin needing to filter/sort on an `ext` field
- OQ-05: ed25519 signature verification, publisher keys, marketplace provenance (`.tovu-plugin` envelope signing) — Owner: Leon Aburime — Resolve by: extension-artifact/marketplace spec (pairs with SPEC-004 OQ-02)
- OQ-06: Stricter isolation (worker threads / isolates) + `recovery` safe-mode plugin quarantine — Owner: Leon Aburime — Resolve by: security hardening pass / `recovery` library spec
- OQ-07: Admin-surface registry contributions (panels/menu items/editor extensions) from plugins — Owner: Leon Aburime — Resolve by: admin-surface registry spec
- OQ-08: Cross-plugin `dependencies` resolution + lockfile-style install ordering — Owner: Leon Aburime — Resolve by: first plugin with a declared dependency
- OQ-09: Core-field transformation hook — a distinct capability + hook letting a plugin rewrite `title`/`slug`/`status`/`bodyJson`, re-validated through SPEC-002's rules and gateway before persist (v1's `content.entry.beforeSave` is `ext`-delta only, RT-001) — Owner: Leon Aburime — Resolve by: first plugin needing to transform core content (e.g. an auto-slug or SEO-title plugin)
- OQ-09b: Operator-chosen plugin version switching (a `version` selector on enable across side-by-side installs; v1 loads the latest installed) — Owner: Leon Aburime — Resolve by: first site needing to pin/rollback to a non-latest installed version
- OQ-11 **(1.1.0)**: Admin UI for plugin install-via-upload (an HTTP alternative to REQ-02's
  filesystem-only install path) and per-plugin settings/config screens (no config surface exists in
  REQ-10's response shape or anywhere else in `state.spec.md` today) — Owner: Leon Aburime — Resolve
  by: first plugin needing an admin-configurable setting (`word-count` has none)

---

## Constitution Compliance

Note: `ADS-memory/governance/constitution.md` still not bootstrapped; toolkit default articles applied (same as SPEC-001…004). Flagged to Coordinator.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Loader/validator/registry are core code; the SDK is a thin public surface over core. Integrity + capability enforcement are justified owned code (security-critical). |
| II — Test-First | COMPLIES | TDD before Programmer; fixture plugins (valid, tampered, incompatible, bad-hook, bad-field, queryable) + the SDK snapshot test are the corpus. |
| III — Simplicity Gate | COMPLIES | New modules (artifact reader, validator, loader, capability-scoped SDK builder, hook registry, schema-registry `ext` validator, `plugin_activations` repo) each trace to REQ-01…REQ-11. **(1.1.0)** The new `Plugins` screen traces to REQ-12..17 and introduces no new component beyond `Plugins`/`PluginRow` (`ui.spec.md` §2). **(1.1.2)** REQ-18's tier badge introduces no new component either — it is one added `<span>` inside the existing `PluginRow` (`ui.spec.md` §2/§5). |
| IV — Anti-Abstraction Gate | COMPLIES | One hook point, one capability vocabulary, one `ext` column — no speculative registries beyond what `word-count` exercises. The hook registry is a plain typed map; a `PluginStorePort` is not introduced (filesystem read in core-adjacent code, rule-of-two fails). |
| V — Integration-First Testing | COMPLIES | P1 ACs at HTTP/gateway/render level (enable → save entry → assert `ext`; tamper → assert refusal). |
| VI — Security-by-Default | EXCEPTION (carry-over) + COMPLIES (new surface) | Auth exception unchanged. The new attack surface (third-party code) is the spec's core concern: integrity verification, capability-surface enforcement, no-DDL rule, fail-closed hooks (INV-01/02/04, REQ-03/04). Explicitly *not* marketed as a sandbox (ADR-004). |
| VII — Spec Integrity | COMPLIES | Implements ADR-003/004/005; references SPEC-001/002/003/004 as dependencies. **(1.1.0)** `ui.spec.md` added; all package files bumped to 1.1.0 together. **(1.1.2)** REQ-10/`api.spec.md`/`state.spec.md` gain the additive `tier` field and `ui.spec.md` gains REQ-18/§5's badge rule; all package files bumped to 1.1.2 together. |
| VIII — Observability | COMPLIES | Plugin validation errors are machine-readable + persisted on discovery records; hook failures log structured errors (EC-10); enable/disable inherit gateway audit. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-005)
- [x] version set to correct semver (1.1.2 — patch: adds REQ-18's tier badge + REQ-10's additive
      `tier` response field, resolving RT-010; 1.1.1's `plugin.tier` REQ-01 fix and human-checkpoint
      status flip are otherwise unchanged)
- [x] status set to APPROVED (not DRAFT or REVIEW) — **DRAFT→APPROVED human checkpoint cleared
      2026-07-28** by owner Leon Aburime (Option A: build SPEC-005 in full, including the 1.1.0 UI
      amendment — recorded in `reports/pipeline/005-plugin-system/pipeline-state.md`). This 1.1.1
      pass also lands the `plugin.tier`/REQ-01 fix (ADR-024) alongside the checkpoint flip. **This
      does not mean Red-Team has reviewed the new material** — REQ-12..17/AC-18..25/EC-11/
      `ui.spec.md` and the `tier` addition to REQ-01 still require a Red-Team pass before TDD may
      certify tests against them; Coordinator routes to Red-Team next, per standard pipeline order.
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file (v1 slice boundary owner-approved 2026-07-07; deferred surface is OQ-01…OQ-08; the 1.1.0 amendment adds no new clarification marker either — its two judgment calls are disclosed readings in `ui.spec.md` §9, not blocking ambiguities)
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (load pipeline, capability enforcement, hook firing, enable/disable, `ext` validation, fail-closed)
- [x] traceability.spec.md complete (marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] `spec_mode` is `brownfield`: evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS — the owner's 2026-07-28 DRAFT→APPROVED human checkpoint (Option A, build
SPEC-005 in full) clears the status/readiness-gate items, and the `plugin.tier` fix closes the one
genuine REQ-01 content gap the Software Architect flagged. **This PASS covers spec-package
readiness, not Red-Team review:** REQ-12..17/AC-18..25/EC-11/`ui.spec.md` and the `tier` addition to
REQ-01 have not yet been through Red-Team — that pass is the next required step before TDD may
certify tests against this new material (Coordinator → Red-Team). The pre-existing v1.0.0 scope
(REQ-01..11 apart from the `tier` addition, AC-01..17, INV-01..07, EC-01..10) remains
APPROVED-quality and Red-Team-clean from its 2026-07-07 pass. **(1.1.2)** REQ-18/AC-26 (the tier
badge) were added after Red-Team's `red-team-findings-v1.1.1-amendment.md` pass, which already
reviewed this exact fork as ADVISORY finding RT-010 and pre-cleared either resolution (fold `tier`
into OQ-11's deferral, or display it now) without requiring further adversarial review of either
path. Given REQ-18/AC-26 are a small, additive, well-precedented change (one new response field,
mirroring how `enabled` is already projected from `plugin_activations`; the badge mirrors the
existing `status` badge convention verbatim; no new component, error code, or state transition),
this pass judges a dedicated fresh Red-Team round unnecessary — mirroring how this session's earlier
RT-002-style micro-fixes proceeded straight to TDD without a fresh round. TDD may certify AC-26
directly, as a small addendum alongside (or immediately after) its certification of the rest of
REQ-12..17/AC-18..25/EC-11.

---

## Agent Directives (optional)

Always:
- Treat plugin artifacts as untrusted input: verify integrity and `sdkRange` before importing anything; enforce capabilities at the SDK boundary.
- Keep the hook-point signature, capability tokens, and manifest field set in the `@tovu/sdk` public surface, pinned by the snapshot test — this is the ADR-005 promise.
- Store enabled state in `content.db` behind the gateway; the install dir holds artifacts, not runtime-mutable flags.
- Run `ext` writes through the schema-registry validator; never let a plugin field escape its `ext.{pluginId}` namespace.

Ask before:
- Adding a hook point, a capability token, or a manifest field beyond the v1 set (each is ecosystem surface under the ADR-005 ladder).
- Relaxing integrity verification or the no-DDL rule.

Never:
- Execute DDL on behalf of a plugin (ADR-003's line — hold it).
- Expose `@tovu/core` internals to a plugin (ADR-005's line — the Gutenberg anti-pattern).
- Let a plugin hook failure corrupt an entry or surface as a silent partial write (EC-10, fail-closed).
