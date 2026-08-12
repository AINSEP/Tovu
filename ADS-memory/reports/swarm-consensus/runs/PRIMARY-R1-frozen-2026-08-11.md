# Primary (Claude Opus 5) — Round 1 frozen first-pass

Written BEFORE dispatching peers and before reading any peer response. Withheld from the Round 1 packet.

## Q1 — What the system actually needs

**The load-bearing insight: the agent must produce a reviewable mapping document, not database writes.**

If "an agent migrates WordPress" means the agent issues SQL against the live database, this is unsafe and untestable at any scale. The correct shape is that the agent's *output* is a declarative artifact, and deterministic engine code executes it. That single decision drives the whole capability list:

1. **Source introspection, read-only** — connect to a foreign MySQL/Postgres/SQLite, enumerate tables, columns, types, keys, row counts, sample rows. Must be physically incapable of writing.
2. **A mapping document schema** — source table/column → target *domain entity/field*, plus named transforms. Human-reviewable, diffable, version-controllable. This is the unit the agent authors and a human approves.
3. **A deterministic executor** for that document. The agent never touches rows.
4. **Target writes go through domain ports, never raw SQL** — you migrate into "post"/"term"/"media"/"user" concepts, not into table names. This is what makes the target backend swappable and the importer safe.
5. **External-id correspondence table** (`wp_posts.ID` → Tovu entry id) so runs are idempotent and resumable, and so a second pass can fix up references.
6. **Dry-run against a scratch database** with a count/sample diff, mutating nothing live.
7. **Validation pass** — referential integrity, required fields, unresolved media, orphaned terms.
8. **Restore point before commit + atomic rollback.** Tovu already has exactly this in `db-ops` (online backup + atomic rename restore).

**What must never be left to the agent's judgement:** raw SQL against the live database, any DDL, credential handling, and the commit decision. The agent proposes; a human approves; deterministic code executes.

## Q2 — Where the boundary belongs

**Jini gets the mechanisms:** connection lifecycle, pragma/config application, backup/restore, the migration *runner* (not the migrations), foreign-source introspection, the mapping-document schema + executor, the correspondence table, batch/resume machinery, the validation framework.

**Tovu keeps the meaning:** the 64 table declarations, the 35 migrations, the domain ports, the repo adapters, and what a "post" is.

- *Too little moves* → every future product re-writes backup/restore, the migration runner, and the importer. Those are the subtle, expensive, easy-to-get-wrong parts. That is the whole reason to have an engine.
- *Too much moves* → Jini learns what a "post" is. Then it is not a reusable engine, it is Tovu with extra indirection, and every other product has to pretend to be a CMS.

## Q3 — Internal structure, and whether storage should mirror it

```
infra/db/
  core/        ports, types, pure helpers      (no driver, no ORM)
  sqlite/      driver
  postgres/    driver (only when a real consumer needs it)
  introspect/  foreign-source readers          (READ-ONLY by construction)
  migrate/     mapping schema, planner, executor, resume, validation
```

**Storage should mirror this only partially, and saying otherwise is the trap.** `core/` + `<provider>/` maps cleanly onto storage (local fs, S3, R2, Backblaze). `introspect/` and `migrate/` do **not**: migrating media is copying bytes and rewriting URLs, which is a fundamentally different problem shape from mapping relational rows. Mirror the core+drivers pattern; do not mirror the whole tree. A structure duplicated by symmetry rather than by need is how you get an empty `storage/introspect/` folder that confuses everyone for a year.

## Q4 — Is multi-backend worth building?

**Separate multi-SOURCE from multi-TARGET. They are not the same requirement and only one is justified.**

- **Multi-source is mandatory and already paid for.** The WordPress requirement *is* a foreign-MySQL-reader requirement. You cannot deliver it without introspecting a non-SQLite database. Build it.
- **Multi-target is speculative.** 64 `sqliteTable` declarations, zero `pgTable`, one developer, no user asking. Building a Postgres target now means maintaining two schema definitions and two migration chains forever, to serve nobody.

So: build the multi-source path now because the requirement forces it; keep the *target* side behind ports so Postgres remains possible; do not implement a Postgres target until a real consumer exists.

## Q5 — Failure modes at 12 months

1. **The mapping layer becomes a general-purpose ETL framework.** This is the most likely death. Every new source tempts one more generic feature. A solo developer cannot maintain an ETL framework and a CMS.
2. **The real WordPress pain is not schema mapping.** `wp_postmeta` holds PHP-serialized values; content holds shortcodes and Gutenberg block comments; ACF/theme fields are arbitrary. Schema mapping is maybe 10% of the work; content transformation is the rest. A design that treats this as a table-mapping problem will look done and deliver garbage content.
3. **Abstraction with one implementation is wrong by default.** `db/core` currently has exactly one driver behind it. Interfaces derived from a single case encode that case's accidents. The second real backend will require reshaping it anyway.
4. **Two-repo drift.** Local path-linking and published-package resolution behave differently; the design gets validated under one and shipped under the other.

## Confidence

0.72. Weakest points: I have not verified how much of WordPress's content transformation burden can be deferred to the agent rather than engine code, and I may be underrating multi-target if the developer's actual goal is selling Tovu to users who already run Postgres.
