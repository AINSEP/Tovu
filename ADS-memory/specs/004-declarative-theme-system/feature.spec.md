# Feature Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| version | 1.1.0 |
| status | APPROVED |
| content_hash | sha256:1f07ca7501f8e5f7b8f3c8b8a5816107cdcdd93e5fe99e82bf8a7758c280cd66 |
| feature_name | FEAT-004-declarative-theme-system |
| last_edited | 2026-07-07T18:05:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

---

## Overview

The ADR-010 theme contract, v1: themes become **data packages** — a `theme.json` manifest, design tokens, block-tree templates bound to a template-hierarchy ID set, and sanitized CSS — discovered from the runtime's built-ins and the site's `themes/` dir (SPEC-003), validated Ghost-gscan-style, and activated through the existing presentation feature (so activation is gateway-audited and revertible for free). The three built-in themes (`tovu-official`, `column`, `signal`) ship in the declarative format as the expressiveness proof (`tovu-official` is the default). Rendering stays server-side: the renderer resolves route → template ID → block tree → HTML, with interactivity only via **registered components** referenced by id — never code shipped by the theme.

**v1 boundary calls (all logged as OQs where deferred):**
- *Declarative class only.* Code themes (full TSX, trusted mode) are entirely deferred — no manifest `class` other than `declarative` is accepted in v1 (OQ-01).
- *Installation = file drop.* A theme is installed by placing its folder in `<install-dir>/themes/<id>/`; validation runs at discovery (boot) and again at activation. The signed-artifact install pipeline (ADR-004 envelope, marketplace provenance) is deferred to the extension-artifact spec (OQ-02). ADR-010's "install-time validation" is satisfied at these two checkpoints.
- *No preview, no settings UI.* Ghost-style preview-before-activate and theme settings surfaces are deferred (OQ-03); v1 activation safety comes from validation + change-set revert (SPEC-001).
- *Renderer implementation.* The current dependency-free server renderer (`server/http/site/render.ts`) grows into the template-tree renderer; the contract (template IDs, block vocabulary, component registry) is renderer-agnostic per ADR-002, so the blessed React renderer can replace the implementation without touching themes.

---

## Problem Statement

**Current state:** "Themes" are three hardcoded CSS strings in `render.ts` plus a hardcoded `ALLOWED_THEME_IDS` list in the presentation feature. Layout is fixed in code; nothing is installable; the ADR-010 contract exists only on paper. The `themes/` dir SPEC-003 creates is empty and meaningless.

**Desired state:** A theme is a folder of validated data. Built-ins ship with the runtime in that same format; a third-party declarative theme dropped into a site's `themes/` dir appears in the admin, validates, activates through the gateway, and renders the site — with zero theme code executing.

**Why now:** Phase 3 of the build order (tovu-v2-design §6) and step 3 of the v1 first slice. The theme format is the second ecosystem compatibility surface after the install dir; ADR-010's bet ("declarative is expressive enough") must be proven by porting the built-ins *before* third parties are invited. It is also the AI story: declarative themes are data an agent can generate/modify under change sets.

**Success signal:** All three built-ins render **token- and structure-equivalent** (same CSS custom properties, same DOM structure — the automatable bar; not pixel diffing, RT-002) through the declarative pipeline; a hand-made test theme dropped into `themes/` activates and renders; an invalid theme (bad CSS, unknown component) is rejected at validation with actionable errors; theme activation revert (SPEC-001) restores the prior theme.

---

## User Journey

1. **Trigger:** A user downloads a declarative theme (`midnight/`) and drops the folder into their site's `themes/` directory, then reloads the admin's Appearance section.
2. **Steps:**
   1. Discovery scans `themes/`, validates `midnight`, and lists it alongside the built-ins with a `valid` status.
   2. The user activates it. The route validates the id against discovered valid themes and runs the existing presentation mutation through the gateway (change set recorded).
   3. The site now renders through `midnight`'s templates and tokens.
   4. The user dislikes it and reverts the change set (or activates the previous theme) — the old look returns.
3. **Outcome:** Third-party look-and-feel with no third-party code execution; the activation is audited and revertible.
4. **Alternate paths:** If `midnight/theme.json` is malformed or its CSS fails sanitization, Appearance lists it as `invalid` with the validation errors, and activation attempts are refused with `THEME_INVALID`. If the active theme's folder is deleted mid-flight, rendering falls back to the default built-in and logs the failure instead of serving 500s.

---

## Scope

**In scope:**
- Declarative theme package format: `theme.json`, `tokens.json`, `templates/*.json`, `styles.css`, `assets/` — REQ-01, REQ-02
- Template-hierarchy ID set v1 (`home`, `post`, `page`, `entry`, `not-found`) + resolution rules — REQ-03
- Block-template vocabulary: content doc nodes + `slot` + `component` nodes; core component registry v1 — REQ-04
- Theme discovery (runtime built-ins + site `themes/` dir) with id-collision rules — REQ-05
- Validation pipeline (manifest, templates, tokens, CSS sanitization, component references) — REQ-06
- Built-ins ported to the declarative format (dogfood proof) — REQ-07
- Activation integration: dynamic theme ids replace `ALLOWED_THEME_IDS`; `GET …/themes` admin endpoint — REQ-08, REQ-09
- Render-time fallback safety — REQ-10
- Appearance UI additions (installed themes + validation status) — REQ-11 (ui.spec.md)

**Out of scope:**
- Code themes / trusted mode (OQ-01); theme preview and settings UI (OQ-03)
- **Theme bundles** — themes that declare plugin dependencies (`requires`) resolved and installed in one consented step (ADR-019 — OQ-06). v1 keeps the ADR-010 rule that components come only from core or already-installed plugins; the dependency-resolution + consented-install flow is a later slice.
- Signed theme artifacts, marketplace, provenance (ADR-004 pipeline — OQ-02); admin-driven upload/install/uninstall endpoints
- Theme settings *values* editing (schema field is parsed and stored but unused in v1 — OQ-03)
- Child themes / theme inheritance; per-entry template selection (SPEC-002 OQ-03)
- Navigation menus, widgets/regions beyond the v1 slot set; asset fingerprinting/CDN
- React renderer swap (ADR-002 blessed renderer — contract-compatible, separate slice)

---

## Requirements

- REQ-01: A declarative theme is a folder containing exactly: `theme.json` (required), `tokens.json` (required), `templates/` with at minimum `home.json` and `entry.json` (required), `styles.css` (optional), `assets/` (optional). No JS/TS files are permitted anywhere in the package; their presence fails validation.
- REQ-02: `theme.json` carries: `id` (`^[a-z0-9-]+$`, 1–50 chars, equal to its folder name), `name`, `version` (semver), `class` fixed to `"declarative"`, `engine` (integer theme-contract version, 1 in v1), optional `description`, optional `fonts` (array of managed webfont specs, e.g. `"Inter:wght@400;600"`), optional `settingsSchema` (parsed, stored, unused in v1). Unknown top-level manifest keys fail validation (forward-compat is by `engine` bump, not silent tolerance). **`fonts` is the sanctioned way a theme requests external webfonts:** the runtime loads them via a managed `<link>`, so a theme never needs — and REQ-06 still forbids — an `@import` or external `@font-face src` inside its CSS.
- REQ-03: Template resolution is deterministic per route: home → `home.json`; a `kind "post"` entry → `post.json` else `entry.json`; a `kind "page"` entry → `page.json` else `entry.json`; unmatched slug → `not-found.json` else built-in default 404 markup. Missing optional templates fall through exactly this chain (BR-01).
- REQ-04: Templates are JSON block trees using (a) the content doc node vocabulary already supported by the renderer (`doc`, `paragraph`, `heading`, `text`, lists, `blockquote`, `codeBlock`, `horizontalRule`), (b) `{"type":"slot","name":<slot>}` where slot ∈ `title`, `content`, `entry-list` (context-filled by the renderer), and (c) `{"type":"component","id":<componentId>,"props":{…}}` where the id must exist in the component registry. v1 registry (core-owned): `tovu/site-header`, `tovu/entry-list`, `tovu/entry-content`, `tovu/site-footer`. Unknown node types, slots, or component ids fail validation.
- REQ-05: Discovery lists themes from (1) runtime built-ins and (2) `<install-dir>/themes/*/` (skipped when serving without an install dir). A site theme whose id collides with a built-in id is marked `invalid` (`shadows built-in`) and cannot activate; built-ins are never shadowed.
- REQ-06: Validation runs at discovery and again at activation, and rejects: malformed/missing required files (REQ-01/02), template JSON that violates REQ-04, `tokens.json` violating the token schema (state.spec.md §2), CSS larger than 128 KiB, any file outside the allowed set, and total package size over 10 MiB. **CSS sanitization uses a positive-allowlist posture** (RT-001): CSS is tokenized with a real parser and only a permitted set of at-rules/properties/values passes; in particular it rejects `@import`, any `url()` that is external (non-relative origin) **or** a `data:` URI (forbidden in v1 to close the SVG-in-`data:`-URL script vector), `@font-face` with an external `src`, and any script-bearing construct (`javascript:` URLs, legacy `expression()`, `-moz-binding`). Validation produces a machine-readable error list retained on the discovery record.
- REQ-07: `tovu-official`, `column`, and `signal` ship as declarative packages built into the runtime (each with `theme.json`, `tokens.json`, `templates/`, `styles.css`), exposing the theme token custom properties (`--bg`, `--ink`, `--accent`, `--card`); the hardcoded `THEME_STYLES` map is deleted. These supersede the earlier plan to port the hardcoded `paper`/`atlas`/`glassmorphic` CSS themes — they are new declarative themes, not ports, so no "equivalent-to-old-CSS" equivalence is asserted. `tovu-official` is the default active theme.
- REQ-08: The presentation feature's `ALLOWED_THEME_IDS` hardcode is replaced by "ids of discovered themes with status `valid`"; `setActiveTheme` refuses unknown ids (`THEME_NOT_FOUND`) and invalid ones (`THEME_INVALID`) before entering the gateway; activation otherwise keeps its SPEC-001 gateway/change-set behavior unchanged.
- REQ-09: `GET /api/admin/v1/workspaces/:workspaceId/themes` returns every discovered theme: `id`, `name`, `version`, `source` (`built-in` | `site`), `status` (`valid` | `invalid`), `errors[]` (empty when valid), `active` boolean. The existing presentation endpoints' `availableThemeIds` becomes the valid subset.
- REQ-10: If the active theme fails to load or re-validate at render time (folder deleted/corrupted after activation), the renderer falls back to the default built-in (`tovu-official`) — or, if it is unavailable, the first valid discovered theme — for that response and logs a structured error; public responses are never 500 for theme-data reasons. If even the built-in `tovu-official` fails to load (corrupt runtime install), the renderer falls back to a **code-level last-resort shell** (minimal hardcoded HTML using no theme data), so INV-05 holds absolutely (RT-003).
- REQ-11: The Appearance section lists all discovered themes with status and validation errors, and only offers activation for valid, non-active themes (contracts in ui.spec.md).

---

## Acceptance Criteria

- AC-01 (REQ-07) [P1]: Given the built-in themes, when each is activated and the home + one post are rendered, then the output uses that theme's tokens (its `--bg`/`--ink`/`--accent`/`--card` custom properties are present in the emitted styles) and the `THEME_STYLES` hardcode no longer exists in the renderer.
- AC-02 (REQ-05) [P1]: Given a valid theme folder `midnight/` in the site's `themes/` dir, when discovery runs, then `GET …/themes` lists it with `source "site"`, `status "valid"`, and it appears in `availableThemeIds`.
- AC-03 (REQ-08) [P1]: Given valid theme `midnight`, when it is activated via the existing presentation endpoint, then the site renders through it and a change set was recorded (SPEC-001 behavior unchanged); reverting that change set restores the prior theme.
- AC-04 (REQ-06) [P1]: Given a theme whose `styles.css` contains `@import url("https://evil.example/x.css")`, when discovery validates it, then its status is `invalid` with a CSS-sanitization error, and activation attempts return 422 `THEME_INVALID` with that error list.
- AC-05 (REQ-04) [P1]: Given a theme template referencing component id `stranger/widget`, when validated, then the theme is `invalid` with an unknown-component error naming the id and template file.
- AC-06 (REQ-01) [P1]: Given a theme folder containing any `.js`/`.ts`/`.mjs`/`.cjs`/`.tsx` file, when validated, then the theme is `invalid` with a no-code error (ADR-010's core rule).
- AC-07 (REQ-03) [P1]: Given a theme with `home.json` and `entry.json` but no `post.json`/`page.json`, when a post and a page are rendered, then both use `entry.json`; given the theme adds `page.json`, then pages use it while posts still use `entry.json`.
- AC-08 (REQ-03) [P2]: Given an unmatched public slug, when rendered, then `not-found.json` is used if present, else the built-in 404 markup — status 404 either way.
- AC-09 (REQ-05) [P1]: Given a site theme with id `tovu-official`, when discovered, then it is `invalid` (`shadows built-in`), activation of `tovu-official` still resolves to the built-in, and the site theme's files are never read at render time.
- AC-10 (REQ-08) [P1]: Given an activation request for an id absent from discovery, when handled, then the response is 404 `THEME_NOT_FOUND`, no change set is recorded, and the active theme is unchanged.
- AC-11 (REQ-10) [P1]: Given active site theme `midnight` whose folder is then deleted, when the site is rendered, then the response uses `tovu-official`, returns 200, and a structured error is logged; the persisted `activeThemeId` is not silently rewritten.
- AC-12 (REQ-09) [P2]: Given built-ins plus one valid and one invalid site theme, when `GET …/themes` is called, then all five appear with correct `source`, `status`, `errors`, and exactly one `active: true`.
- AC-13 (REQ-04) [P2]: Given a template using slot `content` on an entry route and slot `entry-list` on home, when rendered, then `content` receives the entry's rendered `bodyJson` and `entry-list` the published posts list — matching today's rendered output for the ported themes.
- AC-14 (REQ-11) [P1]: Given the Appearance section, when it loads, then themes render grouped by source with status badges; activating a valid theme calls the existing patch endpoint; invalid themes show their error list and no activate control.

---

## Invariants

- INV-01: No theme-shipped code must ever execute — validation must reject packages containing executable files, and the renderer must never `import`/`require`/`eval` from a theme folder.
- INV-02: A theme must never activate without passing validation at that moment (discovery status alone is insufficient — re-validate at activation).
- INV-03: Built-in theme ids must always resolve to the runtime's built-in package, regardless of site `themes/` contents.
- INV-04: Theme validation and rendering must never write inside a theme folder (themes are read-only data).
- INV-05: A public route's response status must be independent of theme-data health (fallback, never 500 — REQ-10).
- INV-06: Every activation mutation must remain gateway-audited (SPEC-001 INV-01 applies unchanged).

---

## Edge Cases

- EC-01: What happens when `theme.json.id` differs from the folder name?
  Expected behavior: `invalid` — id/folder mismatch error (prevents rename drift).
- EC-02: What happens when two site themes declare the same id (impossible as folders, but via case-variant folders on case-insensitive filesystems)?
  Expected behavior: ids are compared case-insensitively at discovery; the collision marks BOTH `invalid` with a duplicate-id error.
- EC-03: What happens when `tokens.json` omits a token the base stylesheet consumes (e.g. `--card`)?
  Expected behavior: validation fails with a missing-required-token error (the token schema enumerates required keys).
- EC-04: What happens when a template file contains valid JSON but a cyclic/oversized tree?
  Expected behavior: depth > 50 or nodes > 5000 fail validation with a template-complexity error (render cost bound).
- EC-05: What happens when the active theme is invalidated by an edit while the server is running?
  Expected behavior: render-time load failure triggers the REQ-10 fallback; the next discovery marks it `invalid`; activation of it is refused until fixed.
- EC-06: What happens when `themes/` contains a non-directory entry (a stray zip or file)?
  Expected behavior: ignored by discovery (only directories are candidates); logged at debug level.
- EC-07: What happens when serving in legacy mode (no install dir, SPEC-003 REQ-10)?
  Expected behavior: discovery lists built-ins only; everything else behaves identically.
- EC-08: What happens when a component node's `props` don't match the component's expected props?
  Expected behavior: v1 components ignore unknown props, apply defaults for missing ones, and treat a present-but-wrong-type prop as missing (default it) — rendering never throws for any prop shape (props schemas are an OQ-04 hardening; RT-004 pins the wrong-type case).
- EC-09: What happens to a site whose persisted `activeThemeId` references a theme that no longer exists at boot?
  Expected behavior: boot succeeds, rendering falls back per REQ-10, Appearance shows the broken state; the operator (or an agent) activates a valid theme to repair.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-003 install dir (`themes/` dir) | Site-installed theme location | Legacy mode has no dir | Built-ins only (EC-07) |
| SPEC-001 gateway + presentation wiring | Audited, revertible activation | Gateway not wired ⇒ unaudited activation | SPEC-001 implementation precedes; SPEC-002 already requires it |
| `src/features/presentation` (`ALLOWED_THEME_IDS`, `setActiveTheme`) | Activation feature to generalize | Hardcode conflicts with dynamic ids | Replaced by REQ-08 (this feature modifies it) |
| `src/server/http/site/render.ts` | Node renderer + page shell to grow into the template renderer | Structural drift breaks ported built-ins | AC-01 pins CSS-variable equivalence |
| SPEC-002 `kind` field | post/page distinction driving REQ-03 resolution | Missing kind collapses hierarchy | SPEC-002 precedes |
| `src/headless/contracts.ts` (`HeadlessThemeId` union) | Wire type currently hardcoded to 3 ids | Type too narrow for installed themes | Becomes `string` with the valid-ids list served at runtime (REQ-09) |

---

## Open Questions

- OQ-01: Code themes (trusted mode) — activation UX for the trust acknowledgment, and whether v1.x ever needs them before the marketplace era — Owner: Leon Aburime — Resolve by: first real demand (agency/self-built site request)
- OQ-02: Theme/plugin artifact envelope (signing, integrity hashes, `.tovu-theme` packaging, upload endpoint) — Owner: Leon Aburime — Resolve by: extension-artifact spec (pairs with SPEC-005/ADR-004)
- OQ-03: Theme preview-before-activate and settings surfaces (Ghost lifecycle parity; settings schema is already parsed) — Owner: Leon Aburime — Resolve by: admin IA spec / Phase 3 completion review
- OQ-04: Component props schemas + versioned component registry (needed before plugins contribute components) — Owner: Leon Aburime — Resolve by: SPEC-005 plugin extension points
- OQ-05: Rendered-output caching + invalidation on theme/content change — Owner: Leon Aburime — Resolve by: performance pass after walking skeleton
- OQ-06: Theme bundles (ADR-019) — a declarative theme declares plugin dependencies (`requires: [{pluginId, versionRange, optional?}]`) that install/activation resolves and installs in one permission-consent step; referenced deps primary, vendored allowed; catalog labels "pure theme" vs "theme + plugins (requests permissions)". The theme package stays zero-code (INV-01 holds); behavior lives in the referenced plugins. — Owner: Leon Aburime — Resolve by: theme-bundle spec slice (pairs with SPEC-005 plugin system + OQ-02 artifact envelope)
- OQ-07: Theme capability tiers (ADR-020, Accepted) — formalizes the ADR-010 spectrum as three tiers set by `theme.json.tier`: **declarative** (this spec's v1 scope), **templated** (a NEW middle tier using **LiquidJS** for sandboxed logic — loops/conditionals/includes/filters — with no JS execution), and **code** (OQ-01 trusted mode, where JS/framework components/motion libs like GSAP/Framer live). LiquidJS renders over the same component registry (`{% render_block %}` = today's `component` nodes) and injects TipTap content at the `{{ content }}` seam. Tier-2 adds mandatory guardrails that EXTEND REQ-06 validation to templates: pin LiquidJS ≥ 10.26.0, isolated render process (CPU/memory timeouts, restricted FS), allowlisted tags/filters, no arbitrary plugin filters in public themes, lint-before-publish. v1 requirements unchanged; declarative stays the default and only shipped tier. — Owner: Leon Aburime — Resolve by: theme-tiers + LiquidJS renderer spec slice (pairs with SPEC-005; supersedes the "declarative class only" framing of OQ-01 with an explicit tier ladder)

---

## Constitution Compliance

Note: `ADS-memory/governance/constitution.md` still not bootstrapped; toolkit default articles applied. Flagged to Coordinator.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Validation + rendering are core code on existing modules; CSS sanitization is custom by design (security-critical, ADR-010 names it as owned code in `lib/text`'s future home). |
| II — Test-First | COMPLIES | TDD before Programmer; fixture themes (valid, each invalid class) are the test corpus. |
| III — Simplicity Gate | COMPLIES | New modules (theme package reader, validator, resolver, component registry) each trace to REQ-01…REQ-11. |
| IV — Anti-Abstraction Gate | COMPLIES | No new ports: discovery reads the filesystem directly in core-adjacent server code; a `ThemeStorePort` fails rule-of-two (one source pair, one consumer). Component registry is a plain in-process map until plugins arrive. |
| V — Integration-First Testing | COMPLIES | P1 ACs at HTTP/render level (activate → fetch HTML → assert variables/structure). |
| VI — Security-by-Default | EXCEPTION (carry-over) + COMPLIES (new surface) | Auth exception unchanged. The new attack surface (third-party theme data) is the spec's core concern: no-code rule, CSS sanitization, size/complexity bounds, read-only enforcement (INV-01/04, REQ-06). |
| VII — Spec Integrity | COMPLIES | References SPEC-001/002/003 as dependencies; ADR-010 is the governing decision. |
| VIII — Observability | COMPLIES | Validation errors are machine-readable and persisted on discovery records; render fallback logs structured errors (REQ-10). |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-004)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file (v1 boundary calls documented in Overview; deferred items are OQ-01…OQ-05)
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
- [x] behavior.spec.md complete (resolution chain, validation order, discovery precedence, fallback)
- [x] traceability.spec.md complete (marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] `spec_mode` is `brownfield`: evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat theme folders as untrusted input: validate before reading anything beyond the manifest; enforce the no-code rule by extension AND by never importing from theme paths.
- Re-validate at activation (INV-02); discovery status is a cache, not an authority.
- Keep the template vocabulary in one exported schema shared by validator and renderer (drift here is the top bug risk).
- Build CSS sanitization on a **vetted CSS parser** (tokenize, then apply the positive allowlist), not string/regex matching — a regex denylist over CSS is the classic bypass. The Architect must record a build-vs-adopt decision for the sanitizer as an Article I + Article VI justification (RT-005); prefer adopting a maintained parser over a from-scratch one.

Ask before:
- Adding a slot, node type, or core component beyond the REQ-04 set (each is ecosystem surface).
- Weakening any CSS-sanitization rule.

Never:
- Execute, import, or eval anything from a theme package (ADR-010's line — hold it).
- Let a theme-data failure surface as a 5xx on a public route (REQ-10).
- Reintroduce a hardcoded theme-id list anywhere.
