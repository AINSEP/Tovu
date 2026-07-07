# Feature Spec: Plugin System — Artifact, Capability-Scoped Loader, One Hook, `ext.*` Fields (v1 Walking Skeleton)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:4b8a8ce77579383517c544de3de577a33ce9afedb4cf7d321d74a3c4ce0d94ea |
| feature_name | FEAT-005-plugin-system |
| last_edited | 2026-07-07T04:10:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

---

## Overview

The first end-to-end plugin loop, deliberately **thin**: prove that a prebuilt plugin **artifact** can be verified, loaded through a **capability-scoped SDK**, attach to **one typed hook point**, contribute one **`ext.{pluginId}` field** (no DDL), and be **enabled/disabled through the SPEC-001 gateway** so rollback is free — dogfooded by one bundled example plugin (`word-count`). This is the walking-skeleton slice of the extension surface (tovu-v2-design §3 kernel registries, tier 4), implementing the accepted decisions in ADR-003 (no plugin DDL; `ext.{pluginId}` JSON), ADR-004 (prebuilt ESM + signed manifest artifact, versioned side-by-side install), and ADR-005 (SDK is the public API).

> **⚠️ COME BACK TO THIS LATER (owner-directed 2026-07-07).** This slice intentionally builds the *smallest* substrate that proves the loop. The full extension surface — admin extension-manager UI, the AI-tool registry bridge, the admin-surface registry, a rich hook catalog, queryable/searchable `ext` fields with generated columns, cross-plugin dependency resolution, ed25519 signature verification, the marketplace/provenance pipeline, and a worker-thread/isolate sandbox — is **deferred to follow-on specs** (tracked as OQ-01…OQ-08 below). None of those are cut; they are sequenced after the skeleton stands. Every deferral keeps the *artifact and SDK contracts forward-compatible* so the later specs extend, never rewrite.

**v1 boundary calls (all logged as OQs where deferred):**
- *Capability enforcement is API-surface-level, not a sandbox* (ADR-004): an in-process ESM module can still touch `fs`/`process.env`/network. Acceptable for v1 (first-party + local installs); never marketed as sandboxing. Stricter isolation is OQ-06.
- *One hook point only.* Core declares exactly `content.entry.beforeSave` in v1 (a typed filter). The typed-hook registry is real; its catalog is one entry (OQ-03 grows it).
- *`ext` fields are store-only in v1.* Declared fields must be `queryable: false`; the generated-column/index promotion path (ADR-003) is deferred (OQ-04).
- *Integrity required, signature optional* (ADR-004 rule 6): per-file SHA-256 integrity is enforced from day one; ed25519 provenance signatures are parsed-but-not-required (OQ-05).
- *No admin UI in this slice.* Enable/disable is an API + gateway operation; the extension-manager UI is OQ-02 (ui.spec.md omitted).

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
- The `.tovu-plugin` artifact envelope + `tovu.plugin.json` manifest (v1 required-field subset) — REQ-01 (ADR-004)
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

**Out of scope (deferred — see OQs; the "come back later" surface):**
- Admin extension-manager UI (install/enable/disable/settings screens) — OQ-02 (ui.spec.md omitted)
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

- REQ-01: A plugin artifact is a `.tovu-plugin` tarball (ADR-004) containing `tovu.plugin.json` (manifest) and `server/index.mjs` (prebuilt ESM `definePlugin()` entry). v1 **required** manifest fields: `id` (`^[a-z0-9-]+$`, 1–50 chars, equal to its install folder name), `name`, `version` (semver), `sdkRange` (semver range for `@tovu/sdk`), `capabilities` (subset of the v1 vocabulary, REQ-04), `hooks` (declared points consumed), `fields` (`ext` field declarations, REQ-06), and `integrity` (SHA-256 per packaged file). Fields **parsed-and-stored but unused in v1** (forward-compat, no behavior): `adminSurfaces`, `contentTypes` (net-new types), `provenance.signature`, `dependencies`. Unknown top-level manifest keys fail validation.
- REQ-02: Installed plugins live at `<install-dir>/plugins/<id>/<version>/` (the unpacked artifact). Multiple versions of one id may coexist; an **active pointer** (persisted in `content.db`, REQ-07) names the enabled version. Rollback between installed versions is a pointer flip, never a migration (ADR-004 rule 4, ADR-003).
- REQ-03: The load pipeline (run at boot for enabled plugins, and on enable) is, in order: (1) verify every file against `integrity` (mismatch ⇒ `INTEGRITY_FAILED`); (2) check `sdkRange` satisfies the runtime `@tovu/sdk` version (miss ⇒ `SDK_RANGE_UNSATISFIED`/`incompatible`); (3) dynamic `import()` `server/index.mjs`; (4) invoke `definePlugin` with a **capability-scoped SDK** exposing only the manifest's granted surface; (5) attach the plugin's declared hooks. Any step failing short-circuits: the plugin is not loaded and its status records the reason.
- REQ-04: The manifest declares `capabilities`; the SDK object handed to the plugin exposes **only** the granted surface. A plugin invoking a surface it did not declare fails at the SDK boundary (`CAPABILITY_DENIED`). v1 capability vocabulary (exactly these three): `content.read` (read entries in a hook), `content.extend` (declare + write `ext` fields), `hooks.attach` (attach to declared hook points). A manifest declaring any other capability is `invalid` with `CAPABILITY_UNKNOWN`.
- REQ-05: Core declares exactly one typed hook point in v1: `content.entry.beforeSave` — a **filter** with the typed signature `(entry: ContentEntryDraft, ctx: HookContext) => ContentEntryDraft`. Plugins attach via `addFilter("content.entry.beforeSave", fn)` and may attach **only** to declared points; attaching to any other name marks the plugin `invalid` with `HOOK_UNKNOWN` (anti-hook-soup: no dynamic string hooks). Declared points are enumerable via `tovu hooks list`.
- REQ-06: A plugin declares extension fields in `fields[]`, each `{ path: "ext.{pluginId}.{field}", type, queryable: false }`. Core's schema registry validates each declaration (path must be namespaced to the plugin's own id; `queryable` must be `false` in v1) and validates written values against the declared `type`. Field data is stored in a namespaced JSON **`ext` column** on the owning record (SQLite: validated JSON text; Postgres later: `jsonb`). **No DDL is ever run for a plugin** (ADR-003 INV). Disabling/removing a plugin never deletes `ext` data.
- REQ-07: Enabling or disabling a plugin executes as a **command through the SPEC-001 gateway**: exactly one applied change set per transition; disable is the inverse of enable (reverting the enable change set disables, and vice versa). Enabled state + active version live in `content.db` (a `plugin_activations` row per plugin), not in the install dir or `config.json` — consistent with SPEC-003's runtime-mutable-settings-in-the-db rule and SPEC-004's `activeThemeId`. A disabled plugin is not loaded, its hooks do not fire, and its `ext.{pluginId}` data is retained inert.
- REQ-08: A minimal `@tovu/sdk` package exports exactly: `definePlugin`, the capability-scoped SDK surface **type**, the `content.entry.beforeSave` hook-point name + typed signature, and the three capability tokens (REQ-04). `@tovu/core` internals are private: `package.json` `exports` maps block deep imports (ADR-005 rule 1). A **public-API snapshot test** pins the SDK surface (types + runtime exports); changing it fails CI unless acknowledged (ADR-005 rule 4). Hook names, capability names, and manifest fields are part of this public surface and follow the ADR-005 deprecation ladder.
- REQ-09: `word-count` ships **built into the runtime** in the artifact format (dogfood proof): manifest declares `capabilities: ["content.read","content.extend","hooks.attach"]`, one field `ext.word-count.count: integer` (`queryable: false`), and one hook attachment to `content.entry.beforeSave`. Its filter computes the word count of the entry's `bodyJson` text nodes and writes `ext.word-count.count`. It is discovered even in legacy mode (no install dir).
- REQ-10: `GET /api/admin/v1/workspaces/:workspaceId/plugins` returns every discovered plugin: `id`, `name`, `version`, `source` (`built-in` | `site`), `status` (`valid` | `invalid` | `incompatible`), `enabled` boolean, `errors[]` (empty when valid). Enable/disable is a gateway-backed admin mutation (`PLUGIN_ENABLE` endpoint, REQ-07). No admin UI in this slice.
- REQ-11: Admin and content entry DTOs gain an additive optional `ext` object (`{ [pluginId]: { …fields } }`), present only when a plugin has written fields; all pre-feature response fields are unchanged.

---

## Acceptance Criteria

- AC-01 (REQ-09) [P1]: Given `word-count` is enabled, when an entry with a 5-word `bodyJson` is saved, then the stored record and the admin read payload carry `ext.word-count.count == 5`, and a change set exists for the save.
- AC-02 (REQ-07) [P1]: Given `word-count`, when it is enabled then disabled, then each transition records exactly one applied change set, and after disable a subsequent save does not write `ext.word-count.count` while the previously written value is retained.
- AC-03 (REQ-03) [P1]: Given a plugin whose `server/index.mjs` bytes don't match its `integrity` hash, when discovered, then it is listed `status "invalid"` with `INTEGRITY_FAILED`, it is not loaded, and its hooks never fire.
- AC-04 (REQ-03) [P1]: Given a plugin whose `sdkRange` excludes the runtime `@tovu/sdk` version, when discovered, then it is `status "incompatible"` with `SDK_RANGE_UNSATISFIED`, and enabling it returns 422 `PLUGIN_INCOMPATIBLE` with no change set.
- AC-05 (REQ-04) [P1]: Given a plugin that calls an SDK surface outside its declared capabilities, when a content save triggers that call, then the SDK boundary throws `CAPABILITY_DENIED`, the save returns 500 `PLUGIN_HOOK_FAILED`, and the entry is unchanged (no partial write, no change set).
- AC-06 (REQ-05) [P1]: Given a plugin attached to `content.entry.beforeSave` that mutates the draft, when an entry is saved, then the persisted entry reflects the mutation; given a plugin manifest attaching to `content.entry.afterEverything`, when discovered, then it is `invalid` with `HOOK_UNKNOWN`.
- AC-07 (REQ-06) [P1]: Given a plugin declaring `ext.word-count.count`, when an out-of-type value is written, then validation rejects it; given a manifest field path `ext.other-plugin.x`, when validated, then the plugin is `invalid` with `FIELD_PATH_INVALID`; and no schema DDL is executed for the plugin at any point.
- AC-08 (REQ-06) [P2]: Given a manifest field declared `queryable: true`, when validated, then the plugin is `invalid` with `QUERYABLE_UNSUPPORTED_V1` (deferred capability, OQ-04).
- AC-09 (REQ-02) [P2]: Given two installed versions of one plugin id, when one is enabled, then only that version's `server/index.mjs` is loaded; enabling the other version flips the active pointer and swaps which module loads, with no migration.
- AC-10 (REQ-08) [P1]: Given the `@tovu/sdk` public-API snapshot test, when the SDK surface is unchanged, then it passes; given a plugin `import`ing `@tovu/core/internal`, when it is loaded, then resolution fails (blocked by `exports`).
- AC-11 (REQ-10) [P1]: Given built-in `word-count` plus one valid and one invalid site plugin, when `GET …/plugins` is called, then all three appear with correct `source`, `status`, `enabled`, and `errors`.
- AC-12 (REQ-01) [P1]: Given an artifact missing `server/index.mjs`, when validated, then it is `invalid` with `CODE_ENTRY_MISSING`; given an artifact missing a required manifest field, then it is `invalid` with `MANIFEST_MALFORMED`.
- AC-13 (REQ-07) [P1]: Given `word-count` enabled via a change set, when that change set is reverted (SPEC-001), then the plugin is disabled and its `ext` data is untouched throughout.
- AC-14 (REQ-11) [P2]: Given an entry with no contributing plugin, when its DTO is read, then no `ext` object is present; given `word-count` has written to it, then the DTO carries `ext.word-count.count` and all pre-feature fields are unchanged.
- AC-15 (REQ-05) [P2]: Given the running system, when `tovu hooks list` is invoked, then it enumerates `content.entry.beforeSave` with its typed signature and declared owner.
- AC-16 (REQ-09) [P1]: Given a runtime with no install dir (legacy mode), when plugins are discovered, then built-in `word-count` is listed and can be enabled; site plugins are simply absent.

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
  Expected behavior: only the active-pointer version loads; the other is dormant on disk (AC-09).
- EC-09: What happens when serving in legacy mode (no install dir)?
  Expected behavior: only built-in plugins (`word-count`) are discovered; everything else behaves identically (AC-16).
- EC-10: What happens when a `content.entry.beforeSave` filter throws inside the plugin?
  Expected behavior: fail-closed — the save fails with `PLUGIN_HOOK_FAILED`, the entry is unchanged, no change set is recorded, and a structured error is logged. (Automatic plugin quarantine / safe-mode is deferred to the `recovery` library — OQ-06.)

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
- OQ-02: Admin extension-manager UI (list/install/enable/disable/settings) — Owner: Leon Aburime — Resolve by: admin IA spec / Phase-4 review
- OQ-03: Hook catalog growth + plugins *offering* new typed hook points; action vs filter taxonomy — Owner: Leon Aburime — Resolve by: second bundled plugin (comments/feeds) demand
- OQ-04: Queryable/searchable `ext` fields → core-generated columns + expression indexes + promotion path (ADR-003 indexing policy) — Owner: Leon Aburime — Resolve by: first plugin needing to filter/sort on an `ext` field
- OQ-05: ed25519 signature verification, publisher keys, marketplace provenance (`.tovu-plugin` envelope signing) — Owner: Leon Aburime — Resolve by: extension-artifact/marketplace spec (pairs with SPEC-004 OQ-02)
- OQ-06: Stricter isolation (worker threads / isolates) + `recovery` safe-mode plugin quarantine — Owner: Leon Aburime — Resolve by: security hardening pass / `recovery` library spec
- OQ-07: Admin-surface registry contributions (panels/menu items/editor extensions) from plugins — Owner: Leon Aburime — Resolve by: admin-surface registry spec
- OQ-08: Cross-plugin `dependencies` resolution + lockfile-style install ordering — Owner: Leon Aburime — Resolve by: first plugin with a declared dependency

---

## Constitution Compliance

Note: `ADS-project-knowledge/governance/constitution.md` still not bootstrapped; toolkit default articles applied (same as SPEC-001…004). Flagged to Coordinator.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Loader/validator/registry are core code; the SDK is a thin public surface over core. Integrity + capability enforcement are justified owned code (security-critical). |
| II — Test-First | COMPLIES | TDD before Programmer; fixture plugins (valid, tampered, incompatible, bad-hook, bad-field, queryable) + the SDK snapshot test are the corpus. |
| III — Simplicity Gate | COMPLIES | New modules (artifact reader, validator, loader, capability-scoped SDK builder, hook registry, schema-registry `ext` validator, `plugin_activations` repo) each trace to REQ-01…REQ-11. |
| IV — Anti-Abstraction Gate | COMPLIES | One hook point, one capability vocabulary, one `ext` column — no speculative registries beyond what `word-count` exercises. The hook registry is a plain typed map; a `PluginStorePort` is not introduced (filesystem read in core-adjacent code, rule-of-two fails). |
| V — Integration-First Testing | COMPLIES | P1 ACs at HTTP/gateway/render level (enable → save entry → assert `ext`; tamper → assert refusal). |
| VI — Security-by-Default | EXCEPTION (carry-over) + COMPLIES (new surface) | Auth exception unchanged. The new attack surface (third-party code) is the spec's core concern: integrity verification, capability-surface enforcement, no-DDL rule, fail-closed hooks (INV-01/02/04, REQ-03/04). Explicitly *not* marketed as a sandbox (ADR-004). |
| VII — Spec Integrity | COMPLIES | Implements ADR-003/004/005; references SPEC-001/002/003/004 as dependencies. |
| VIII — Observability | COMPLIES | Plugin validation errors are machine-readable + persisted on discovery records; hook failures log structured errors (EC-10); enable/disable inherit gateway audit. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-005)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file (v1 slice boundary owner-approved 2026-07-07; deferred surface is OQ-01…OQ-08)
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

**Gate result:** PASS

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
