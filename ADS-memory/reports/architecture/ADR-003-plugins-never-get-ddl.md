# ADR-003: Plugins Never Run DDL; Extension Fields Live in Namespaced JSON

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W2)

## Context

Payload generates migrations for a developer at build time. Tovu plugins
install/update/uninstall at runtime on end-user sites, on SQLite (weak
`ALTER TABLE`). If plugins can alter schema, then UF-01 ("routine update broke
production") is architecturally unsolvable, and plugin rollback requires
reversing arbitrary migrations. This decision also covers core upgrades: with
plugins out of the DDL business, all schema risk concentrates on core's own
centrally tested migration paths.

## Decision

1. **DDL is reserved for core.** Only core libraries and the core migration
   engine create/alter tables, on core upgrade paths that are tested centrally.
2. **Plugin-contributed fields live in a namespaced JSON column** on the owning
   record: `ext.{pluginId}.{field}` inside the record's extension column
   (SQLite: validated JSON text; Postgres: `jsonb`). The schema registry
   validates shape; the plugin manifest declares the fields.
3. **Uninstall retains data.** Disabling/uninstalling a plugin never runs a
   destructive migration; its `ext.{pluginId}` data stays inert until the user
   explicitly purges it.

## Indexing and query policy (so JSON doesn't become an unqueryable blob)

- A plugin field declared `queryable: true` gets a **generated column + index**
  created by the *core* engine from the registry declaration (SQLite generated
  columns / Postgres expression indexes on `jsonb`). The plugin declares intent;
  core owns the DDL. Budgeted (e.g. max N queryable fields per plugin per type).
- Fields declared `searchable: true` are fed to the search port's indexer.
- **Promotion path:** if a plugin field becomes core-critical (high-frequency
  filter/sort), core may promote it to a real column in a core migration, with
  the registry mapping old JSON path → new column so plugin code is unaffected.
- Portability: the JSON layout and generated-column strategy must map 1:1 to
  Postgres `jsonb` + expression indexes (verified by adapter contract tests).

## Consequences

- Core upgrades own all schema risk; plugin updates are code-swap only, so
  rollback = swap code back, data untouched. This is what makes UF-01 tractable.
- Plugins cannot own whole tables in v1. If a plugin genuinely needs its own
  tables (e.g. commerce orders per ADR-001), that is a *tier promotion*
  decision: the tables enter core's migration engine under the plugin's
  namespace — a deliberate, reviewed act, not an install-time side effect.
