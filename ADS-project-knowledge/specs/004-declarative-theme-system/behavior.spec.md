# Behavior Rules Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| feature_name | FEAT-004-declarative-theme-system |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T02:35:00Z |

**Purpose:** Deterministic rules for template resolution, validation ordering, discovery precedence, activation guarding, and render fallback. All rules use EARS syntax.

---

## 1. Template Resolution (BR-01)

- BR-01: WHEN rendering a route, the system shall resolve the template in this exact chain, first hit wins:
  - home route: `home.json` (required — always hits)
  - entry route, `kind "post"`: `post.json` → `entry.json`
  - entry route, `kind "page"`: `page.json` → `entry.json`
  - unmatched slug: `not-found.json` → built-in 404 markup
  The chain shall never consult another theme (no cross-theme inheritance in v1).

## 2. Validation Ordering (BR-02…BR-03)

- BR-02: WHEN validating a theme package, the system shall evaluate in this order and collect ALL errors (not first-failure): (1) package-level (size, disallowed files, code files), (2) manifest (presence, parse, schema, id/folder match, engine, class), (3) identity (duplicate ids, built-in shadowing), (4) tokens, (5) templates (parse, vocabulary, complexity, component references), (6) CSS (sanitization, size). The error list order follows this sequence for determinism.
- BR-03: WHEN any error exists, the status shall be `invalid`; there is no warning-only tier in v1 (a rule that doesn't fail validation doesn't exist).

## 3. Discovery Precedence and Ordering (BR-04, TB-01)

- BR-04: WHEN discovering, the system shall enumerate built-ins first, then site `themes/` directories; a site id colliding (case-insensitively) with a built-in shall be marked `SHADOWS_BUILT_IN` and the built-in record shall be unaffected (INV-03).
- TB-01: `THEMES_LIST` ordering shall be: built-ins by id ascending, then site themes by id ascending.

## 4. Activation Guarding (BR-05)

- BR-05: WHEN activation is requested, the system shall evaluate: (1) body shape (`VALIDATION_ERROR`), (2) id present in discovery (`THEME_NOT_FOUND`), (3) fresh re-validation of that package (`THEME_INVALID`) — and only then enter the SPEC-001 gateway. No change set or event shall exist for a request failing 1–3.

## 5. Render Fallback (BR-06)

- BR-06: WHEN loading the active theme fails at render time (missing folder, re-validation failure, unreadable file), the system shall render the response with the default built-in (`paper`), log one structured error naming the theme id and cause, and shall NOT modify `presentation_settings` (repair is an explicit operator/agent action — EC-09).

## 6. Default Values

| Field | Default | Why |
|---|---|---|
| Fallback theme | `paper` | Deterministic, always-present built-in; matches current `pageShell` fallback |
| `typography.headingFontFamily` | `typography.fontFamily` | Most themes share one stack; optional override |
| `component.props` | `{}` with component defaults | EC-08 — v1 components never throw on props |
| Discovery in legacy mode | built-ins only | No `themes/` dir exists (EC-07) |
| `not-found.json` absent | built-in 404 markup | Themes shouldn't be forced to design error pages |

## 7. Limits and Bounds

| Constraint | Value | Enforcement |
|---|---:|---|
| `styles.css` size | ≤ 128 KiB | validator ⇒ `CSS_TOO_LARGE` |
| Package total size | ≤ 10 MiB | validator ⇒ `PACKAGE_TOO_LARGE` |
| Template depth / node count | ≤ 50 / ≤ 5000 | validator ⇒ `TEMPLATE_TOO_COMPLEX` |
| Theme id length | 1…50 chars `^[a-z0-9-]+$` | validator ⇒ `MANIFEST_MALFORMED` |
| Allowed asset types | images (png/jpg/webp/svg/gif/avif), fonts (woff/woff2) | validator ⇒ `FILE_NOT_ALLOWED` (svg is sanitized as text: no scripts) |

## 8. Deduplication Rules

- DUP-01: Two theme records are duplicates iff their ids match case-insensitively. Site-vs-site duplicates mark both `ID_DUPLICATE`; site-vs-built-in marks the site one `SHADOWS_BUILT_IN` (BR-04).

## 9. Edge Case Handling (EARS)

- IF `theme.json.id` differs from its folder name, THEN the theme shall be `invalid` with `ID_FOLDER_MISMATCH` (EC-01).
- IF `tokens.json` omits any required token, THEN validation shall fail with `TOKENS_MISSING` naming the key (EC-03).
- IF a non-directory entry sits in `themes/`, THEN discovery shall ignore it (EC-06).
- IF the runtime serves without an install dir, THEN discovery shall return built-ins only and all other behavior is unchanged (EC-07).
- IF a component receives unknown or missing props, THEN it shall ignore unknowns and default the missing — rendering shall never throw for props (EC-08).
- IF the persisted `activeThemeId` references a nonexistent theme at boot, THEN boot shall succeed and BR-06 fallback shall apply per-response until repaired (EC-09).
- WHEN the active theme's folder is edited to an invalid state while serving, the next render shall fall back per BR-06 and the next scan shall mark it `invalid` (EC-05).
