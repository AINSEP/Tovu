# State Contract Spec: Site Install Dir — Instantiate a Template, Serve the Folder

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-003`
- Feature: `FEAT-003-site-install-dir`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:20:00Z`

## Purpose
Defines the durable state this feature owns: the install-dir layout, the two JSON file schemas, the template package format, and the schema-version stamp. `content.db` table shapes are owned by SPEC-002/earlier and are unchanged here.

## 1) State Shape (filesystem layout)

```
<install-dir>/                     # ADR-011/ADR-012 "site is a folder"
  config.json                      # static site identity (schema §2) — REQUIRED
  content.db                       # SQLite site store (existing schema) — REQUIRED
  uploads/                         # media blobs (empty until media spec) — REQUIRED, may be empty
  themes/                          # theme artifacts (SPEC-004 defines contents) — REQUIRED, may be empty
  plugins/                         # plugin artifacts (SPEC-005 defines contents) — REQUIRED, may be empty
  overrides/                       # site-specific custom pages/components (future) — REQUIRED, may be empty
  .site-meta.json                  # provenance + schema stamp (schema §2) — REQUIRED; init's commit marker
```

| Item | Type | Created By | Mutated By | Description |
|---|---|---|---|---|
| `config.json` | file (JSON) | init | operator (manual, out of scope) | Static identity; never written by `serve` |
| `content.db` | file (SQLite) | init | serve (all content mutations) | The site store; only file `serve` routinely writes (INV-04) |
| `uploads/` `themes/` `plugins/` `overrides/` | dirs | init | future specs | Contract placeholders; empty at init |
| `.site-meta.json` | file (JSON) | init (last step) | serve (`schemaVersion` + `schemaTag` update only, both together) | Commit marker + provenance |

## 2) Entity Contracts (file schemas)

```yaml
ConfigJson:                        # config.json — static identity only (design call, feature.spec.md Overview)
  name: string                     # required, 1..200 chars after trim
  domain: string|null              # optional; informational until routing/deploy specs
  port: integer|null               # optional; 2nd in port precedence (BR-02)
  # NOTE: no activeThemeId, no enabledPlugins — runtime-mutable settings live in
  # content.db behind the SPEC-001 gateway (refinement of ADR-012's sketch)

SiteMetaJson:                      # .site-meta.json — provenance + compatibility stamp
  siteId: string (uuid)            # generated at init; host-level identity (relationship to workspaceId: OQ-04)
  templateId: string               # "starter" in v1
  templateVersion: string (semver) # from template.json at init time
  schemaVersion: integer           # latest applied migration INDEX; monotonically non-decreasing (INV-05)
  schemaTag: string                # latest applied migration TAG/hash (identity) — divergence detection (REQ-05, RT-005)
  createdAt: string (date-time)

TemplateJson:                      # templates/<id>/template.json — repo data, read-only at runtime
  id: string                       # "starter"
  version: string (semver)
  name: string                     # human label ("Starter Site")
  defaultConfig:                   # merged under CLI flags at init
    name: string|null              # usually null — name comes from flag/basename
    port: integer|null

TemplateSeedContent:               # templates/<id>/seed-content.json — declarative, no code
  workspace: { id, name, slug, createdAt }
  entries: array<PostRecord-shaped objects>      # incl. kind (SPEC-002); welcome + glass-demo posts, about page
  presentation: { activeThemeId, updatedAt }     # version stamped per SPEC-001 REQ-05 at insert
```

## 3) Action Catalog (state-changing operations)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `INIT_SITE` | dir, name?, template (fixed: starter) | target absent or empty dir | creates full §1 layout; db created + migrated + seeded from template; `.site-meta.json` written last | any failure ⇒ remove everything created, exit nonzero (INV-02, AC-03) |
| `SERVE_SITE` | dir, port? | §1 layout valid; `schemaVersion` ≤ runtime | forward-migrates db if older; updates `schemaVersion` + `schemaTag` together after migration; starts listener | validation miss ⇒ exit 3/4/5 with nothing written except completed idempotent migrations (EC-09) |
| `STOP_SITE` | signal | serving | listener closed; WAL checkpoint via better-sqlite3 close | n/a |

## 4) Status Lifecycle (install dir)

```
(absent) ──init──▶ initializing (no .site-meta.json — invalid to serve)
                        │ all steps ok
                        ▼
                    complete ◀──────serve (validate, migrate, run)────┐
                        │ schemaVersion < runtime                     │
                        └──serve: migrate + bump stamp────────────────┘
crashed init: stays "initializing" ⇒ serve refuses (SITE_DIR_INVALID); cleanup removed dirs never reach this state
```

Illegal states (must be impossible or rejected): `.site-meta.json` present without `content.db`; `schemaVersion` decreasing; a bumped `schemaVersion` beside a stale `schemaTag` (the two must be stamped together after migration — INV-04); serving a dir without the commit marker.

## 5) Selector Contracts (reads)

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `readSiteDir` | dir path | `{config: ConfigJson, meta: SiteMetaJson}` or validation error | missing/corrupt file ⇒ `SITE_DIR_INVALID` detail |
| `resolveWorkspace` | open db | the single `WorkspaceRecord` | 0 rows ⇒ `SITE_CORRUPT`; >1 rows ⇒ `SITE_CORRUPT` ("multi-workspace sites are not supported in v1") |
| `readTemplate` | template id ("starter") | `{template: TemplateJson, seed: TemplateSeedContent}` | missing/invalid ⇒ init aborts before any write |
| `runtimeSchemaVersion` | — | `{ index: integer, tag: string }` of the latest Drizzle migration bundled under `drizzle/` (from `drizzle/meta/_journal.json`), exported beside the migrator wiring | — |

## 6) Invariants (state-level)

- `.site-meta.json` exists ⇔ every init step completed (commit-marker semantics).
- `schemaVersion` is monotonically non-decreasing and never exceeds the runtime's version after a successful serve.
- No file in the install dir contains an absolute path (portability, AC-10).
- `content.db` row shapes are exactly the SPEC-002 schema — this feature adds no tables or columns.
- The `workspaces` table of a v1 site contains exactly one row from init onward.
- Template files under `templates/` are never written at runtime.

## 7) Persistence Notes

- **Schema version source of truth:** the latest Drizzle migration the runtime bundles under `drizzle/` (read from `drizzle/meta/_journal.json`), exposed as `runtimeSchemaVersion = { index, tag }` beside the migrator wiring. Every `drizzle-kit generate` adds one migration (a higher index + a unique tag) — SPEC-002's `kind` migration is one such increment. The `.site-meta.json` stamp records both `schemaVersion` (index, for ordering) and `schemaTag` (identity, for divergence). This install-dir stamp is distinct from Drizzle's per-db `__drizzle_migrations` journal (which records *which* migrations a given `content.db` has applied); the stamp answers "is this site newer than, or divergent from, this runtime?" (REQ-05). Comparing the tag — not just the index/count — is what catches two runtime builds that share an index but bundle different migrations (RT-005).
- **Seed provenance:** `templates/starter/seed-content.json` replaces the hardcoded `server/seed.ts` as the seed source for install dirs; the legacy memory/dev boot keeps using the module. A unit test asserts the JSON and the module stay content-equal until `seed.ts` is retired (AC-02, OQ under SPEC-002's ContentEntry rename).
- **Atomicity:** JSON files are written via temp-file + rename (best-effort atomic on POSIX); the db uses the WAL pragma set in `openContentDb` (Drizzle over better-sqlite3).
- **Desktop-host forward-compat:** the host (ADR-011 topology 2) will create/serve the same layout via its own process management; nothing here may assume a TTY beyond argv parsing.
