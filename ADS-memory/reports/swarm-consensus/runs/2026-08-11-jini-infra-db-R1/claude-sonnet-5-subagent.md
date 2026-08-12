ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.

> **Recovery note (Coordinator):** this participant went idle without delivering. Response recovered
> via SendMessage. It confirmed it read files under both repos and cited them; position is grounded,
> not packet-only. It also caught a factual error in the packet — see the correction at the bottom.

## What I found in the actual code

`@jini-ai/infra` today has exactly one real capability: `db/core/ports.ts` defines `DbOpsPort` (capability discovery, restore-point capture, restore-from-artifact) and `db/sqlite/db-ops.ts` implements it against `better-sqlite3` — online backup, atomic rename-swap, WAL/SHM sidecar cleanup. It's wired into Tovu today at `src/db/sqlite/db-ops.ts`, which wraps the infra class only to widen its `RestoreCapability` union (Tovu's port also admits `"unavailable"`/`"external"`). That's the *only* consumer of `@jini-ai/infra` in Tovu right now — I grepped for it.

The Postgres side, `src/db/postgres/db-ops.ts`, is a pure function, `evaluatePostgresRestoreCapability`, that computes a capability answer from four *booleans a caller supplies* (`pgDumpBinaryPath`, `credentialsPresent`, etc.). Its own docstring says "no actual `pg_dump`/blue-green execution." There is no `pg` client, no Postgres schema, nowhere in either repo. This is a stub with one caller, not a backend.

Meanwhile domain repo adapters (`src/db/sqlite/media-repo.sqlite.ts`) implement ports defined not in infra but in `@jini-ai/cms/media` — so the codebase has already drawn one boundary line for me: cross-cutting DB *mechanics* (backup/restore) live in `infra`; domain *shape* (media, posts) lives in the CMS package; Tovu-only shape (commerce, newsletters, per the current git status) stays in Tovu. That's a real precedent, not a hypothetical, and it should anchor the answer below.

## 1. What agent-driven migration actually needs

Separate two things the ask conflates: "Tovu supports more than one backend" and "an agent can pull a WordPress site into Tovu." They share the word "database" and nothing else. Migration needs:

- **A narrow, read-only source connector** to WordPress's MySQL — introspect `wp_posts`, `wp_postmeta`, `wp_users`, `wp_terms`, `wp_term_relationships`. This is not "MySQL support for Tovu"; Tovu never runs on MySQL. It's a one-directional reader.
- **A declared, human-reviewable mapping spec**: `wp_post_type → Tovu content type`, `wp_users → members/users`, taxonomy tree → categories/tags, serialized-PHP `wp_postmeta` blobs → typed fields. This must be data the agent is *handed*, not something it infers per-row. Ambiguous cases (a custom post type with no obvious Tovu analog, HTML entity/shortcode content) need a human decision recorded once, not re-litigated by the agent on every run.
- **Writes through existing domain ports, never raw SQL.** Tovu already enforces this discipline for everything else — 19 `*-repo.sqlite.ts` adapters sit behind ports, domain code never touches SQLite directly. An agent-driven importer that INSERTs directly into `content.db` bypasses every invariant (uniqueness, workspace scoping) those adapters exist to enforce. This is the single most important guardrail: the agent gets a `write` capability that is already-validated domain operations, never a SQL execution tool.
- **Restore-point-before, dry-run-first, resumable.** `DbOpsPort.captureRestorePoint` already exists and is exactly the right primitive — capture before the agent touches anything, let it run in a dry-run/diff mode first, checkpoint so a crash mid-import doesn't require starting over or leaves partial, undetectable state.
- **Workspace scoping threaded through by the tool, not by the agent's judgment.** `content.db` is multi-tenant (per the packet, confirmed by schema.ts's pervasive `workspaceId` columns). WordPress has no concept of "workspace." If the importer doesn't hard-code which workspace every row belongs to, an agent can silently attach an entire migrated site to the wrong tenant, and nothing SQL-level will complain since it's a plain foreign key, not a security boundary.

What must never be agent judgment: taxonomy/type mapping decisions, whether to skip vs. transform malformed rows, and whether a restore point exists before writes begin. Those are policy, and policy goes in the tool's contract, not the prompt.

## 2. Jini/Tovu boundary

**Jini-worthy:** driver-neutral ports and driver mechanics that have zero knowledge of a specific schema — exactly what `db-ops.ts` already is (injected `readWatermark`, no import of Tovu's tables). A generic MySQL *schema introspector* (list tables/columns/types from an arbitrary connection) is also genuinely reusable — any future migration into any future Jini-based product needs "look at what's in this foreign database," independent of what WordPress specifically means.

**Tovu-only, and would poison Jini if moved in:** the WordPress→Tovu field mapping. It's the intersection of two product-specific schemas (WordPress's and Tovu's own 63-table `schema.ts`), and it's useless to anything that isn't Tovu. If this lands in `@jini-ai/infra`, the package's own "zero runtime deps, driver-isolation-guarded" premise (enforced by `scripts/check-driver-isolation.ts`, per the ports.ts docstring) breaks for every other consumer — a hypothetical third product now drags in WordPress-mapping code it never asked for.

Drawn wrong toward Jini: bloats the reusable package with single-consumer, single-use code, and a MySQL client dependency for a capability nothing else uses. Drawn wrong toward Tovu: strands the one piece with genuine reuse value (a working second-driver + real ETL orchestration) in the product repo, defeating the developer's stated motive.

## 3. Structure, and should storage mirror it

Keep `db/core` (ports) / `db/<driver>` (mechanics) — it's proven. Add migration as a **separate namespace**, not nested under `db/`: `migrate/core` (checkpoint/resume, dry-run diffing — generic orchestration) and product-owned source connectors (WordPress mapping) staying in Tovu. Migration operates on two databases at once (source + sink); folding it into `db/` would break `db/core`'s "zero deps" guarantee, since a source connector needs a driver dependency unrelated to what Tovu itself runs on.

Storage should mirror the **principle** — injected host facts, isolated driver folders, an architectural guard test — not the **port shape**. `DbOpsPort`'s methods (`captureRestorePoint`, `restoreFromArtifact`) are backup/restore-shaped; storage's hard problems (streaming, content-addressing, CDN URLs, transform pipelines — already partly modeled by `assetRenditions`/`transformDefinitions` in `schema.ts` and `@jini-ai/cms/media`) are a different shape. Cargo-culting the method names would force-fit a mismatch.

## 4. Is multi-backend worth it?

Against: 63 SQLite tables, zero Postgres tables, one developer, and the existing Postgres file is a stub whose own comment admits "adapter deferred." Building a real second driver plus dual-dialect Drizzle config against zero current demand is engineering for a market of one hypothetical migration. For: the WordPress requirement means *some* non-SQLite code is coming regardless — but that's a source-connector, not "Tovu runs on Postgres." My recommendation: keep `DbOpsPort` (already paid for, and it forced the useful watermark-injection decoupling) but do not build a second real driver until an actual second Jini product needs it. Evidence that would flip me: a concrete second product on Jini with a live Postgres requirement, not "if somebody switches."

## 5. 12-month failure modes

Most likely: chasing "reusability," the developer builds `db/mysql` as a peer to `db/sqlite`, but the WordPress migration turns out to be 80% mapping logic (serialized meta, taxonomy trees, shortcode conversion) that lives entirely outside driver abstraction — so the generic work doesn't shorten the real task, and `@jini-ai/infra` ends up with two driver folders with no real caller, bit-rotting under dependency bumps with no test pressure. Second: time pressure makes the migration ship as a script that writes `content.db` directly, bypassing the port discipline every other adapter follows — and becomes the template copied for the *next* migration. Third: workspace scoping gets silently dropped inside migration code specifically, since WordPress has no such concept, and content only visibly bleeds across tenants once a second workspace exists to notice.

<<SWARM_END>>

---

## Coordinator correction, verified

This participant reported **63** `sqliteTable(` declarations, not the 64 stated in the Round 1 packet. Verified:

```
lines containing "sqliteTable":  64
actual "sqliteTable(" calls:     63
line 2: import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
```

The packet's figure came from `grep -c`, which counted the import line. **63 is correct**; the erroneous 64 was sent to all four participants and is carried into Round 2 as an explicit correction.

Its `@jini-ai/cms/media` claim also verified: `media-repo.sqlite.ts` imports its port types from `@jini-ai/cms/media` (line 19) and `@jini-ai/cms/core` (line 6), and `@jini-ai/infra`'s `db/core/ports.ts` contains no media concepts. The three-way boundary precedent is real.
