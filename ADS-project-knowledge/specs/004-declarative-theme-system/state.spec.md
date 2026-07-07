# State Contract Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-004`
- Feature: `FEAT-004-declarative-theme-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:35:00Z`

## Purpose
Defines the theme package format (the durable, ecosystem-facing state), the in-process discovery record, and the token/template schemas. `presentation_settings` rows are owned by SPEC-001 and unchanged in shape.

## 1) State Shape

| Item | Type | Durability | Description |
|---|---|---|---|
| Theme package | folder of files (§2) | durable (runtime built-ins; site `themes/<id>/`) | The ecosystem compatibility surface, versioned by `engine` |
| Discovery record | in-process array<ThemeDiscoveryRecord> | rebuilt per scan (boot + each `THEMES_LIST` call + activation) | Validation cache; never persisted to db in v1 |
| `presentation_settings.active_theme_id` | existing db column | durable | Now any valid theme id (REQ-08); shape unchanged |

## 2) Entity Contracts

### Theme package layout (REQ-01)

```
<theme-id>/
  theme.json          # required — manifest (below)
  tokens.json         # required — design tokens (below)
  templates/
    home.json         # required
    entry.json        # required
    post.json         # optional (falls back to entry)
    page.json         # optional (falls back to entry)
    not-found.json    # optional (falls back to built-in 404 markup)
  styles.css          # optional — sanitized per REQ-06
  assets/             # optional — images/fonts only
```

```yaml
ThemeJson:                       # theme.json
  id: string                     # ^[a-z0-9-]+$, 1..50, == folder name (EC-01), case-insensitively unique (EC-02)
  name: string                   # 1..100 chars
  version: string (semver)
  class: "declarative"           # only accepted value in v1 (OQ-01)
  engine: integer                # theme-contract version; 1 in v1; > runtime supported ⇒ invalid
  description: string|null
  settingsSchema: object|null    # parsed + retained; unused in v1 (OQ-03)
  # unknown top-level keys ⇒ validation error (REQ-02)

TokensJson:                      # tokens.json — required keys enumerated (EC-03)
  colors:
    bg: string                   # CSS color or gradient value → --bg
    ink: string                  # → --ink
    accent: string               # → --accent
    card: string                 # → --card
  typography:
    fontFamily: string           # body font stack → body font-family
    headingFontFamily: string|null   # optional; defaults to fontFamily
  # values are CSS-value-sanitized (same rules as styles.css: no url(javascript:), no external url())

TemplateNode:                    # templates/*.json — recursive tree (REQ-04)
  oneOf:
    - <content doc nodes>        # doc/paragraph/heading/text/bulletList/orderedList/listItem/blockquote/codeBlock/horizontalRule
    - { type: "slot", name: enum[title, content, entry-list] }
    - { type: "component", id: string, props: object|null }   # id must exist in the component registry
  bounds: depth ≤ 50, total nodes ≤ 5000 per template (EC-04)

ThemeDiscoveryRecord:            # in-process
  id: string
  source: enum[built-in, site]
  status: enum[valid, invalid]
  errors: array<{ code: string, file: string|null, message: string }>
  manifest: ThemeJson|null       # null when unreadable
  path: string                   # absolute at runtime; never persisted (SPEC-003 portability)
```

### Component registry v1 (core-owned, in-process map)

| Component id | Renders | Context consumed |
|---|---|---|
| `tovu/site-header` | site title + home link | site name |
| `tovu/entry-list` | published post cards (title, link, excerpt) | published `kind "post"` entries |
| `tovu/entry-content` | the current entry's rendered `bodyJson` | route entry |
| `tovu/site-footer` | footer line | site name |

## 3) Action Catalog (state-changing operations)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `DISCOVER_THEMES` | — | — | rebuilds the in-process discovery records (read-only on disk, INV-04) | unreadable candidate ⇒ recorded `invalid`, never throws |
| `ACTIVATE_THEME` (existing, extended) | workspaceId, activeThemeId | id discovered AND re-validated `valid` at this moment (INV-02) | per SPEC-001: presentation row updated via gateway, change set + event | unknown ⇒ `THEME_NOT_FOUND` (no gateway entry); invalid ⇒ `THEME_INVALID` (no gateway entry) |

No install/uninstall actions exist in v1 — installation is a file drop (feature.spec.md Overview; OQ-02).

## 4) Status Lifecycle (discovery record)

```
(folder appears) ──scan──▶ valid ⇄ invalid   (status recomputed every scan; no persisted state machine)
active theme deleted/corrupted ──render──▶ fallback to built-in default (persisted activeThemeId unchanged, EC-09/AC-11)
```

## 5) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `listThemes` | — | `ThemeDiscoveryRecord[]` ordered TB-01 | built-ins only in legacy mode (EC-07) |
| `getValidTheme` | id | loaded theme package (manifest + tokens + templates + css) or null | null for unknown/invalid; render path maps null → fallback (REQ-10) |
| `resolveTemplate` | theme, route context (`home` \| entry with kind \| `not-found`) | template tree | fallback chain per BR-01 |
| `validThemeIds` | — | `string[]` | feeds `availableThemeIds` + activation guard |

## 6) Invariants (state-level)

- A theme package is read-only to the runtime; no scan, validation, or render writes inside it (INV-04).
- `active: true` appears on exactly one discovery record per workspace at serialization time.
- A `valid` status implies every REQ-06 check passed at the most recent scan of that folder.
- Built-in ids resolve to built-in packages regardless of site-folder contents (INV-03).
- `presentation_settings` schema is unchanged by this feature (no migration).
- Discovery records never persist absolute paths beyond process memory (SPEC-003 portability contract).

## 7) Persistence Notes

- **Built-ins live in the runtime** (repo `themes/paper|atlas|glassmorphic/` per the v2-design layout), loaded from the installed package path — never copied into site dirs at init (ADR-012: runtime is shared; site `themes/` is for site-installed themes only).
- **No db changes.** Theme identity in the db remains the string `active_theme_id`. Validation state is deliberately not persisted — it must be recomputed (INV-02), and persisting it would create a second source of truth.
- **Engine versioning:** `engine` (integer) gates package-format evolution; the runtime declares its supported engine and rejects newer ones at validation — same posture as SPEC-003's `schemaVersion` guard.
- **Future:** the ADR-004 artifact envelope (signatures, integrity hashes) wraps this package format without changing it — the folder contents above are what gets signed (OQ-02).
