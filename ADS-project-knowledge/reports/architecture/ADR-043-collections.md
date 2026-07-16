# ADR-043: Collections — operator-defined content types

- Status: **Accepted** (2026-07-14, human owner sign-off — Leon Aburime) — emerged from a 4-round swarm `/debate` (2026-07-14, Primary Sonnet host +
  Fable subagent + Codex gpt-5.5 + Gemini 3.1 Pro via agy). All three external/subagent participants
  converged closely on the overall shape from Round 1. The storage-shape sub-question (below) did
  **not** converge through Rounds 1-3 — each of the three participants held a different final position
  after Round 3 — and was resolved only in **Round 4**, after the Coordinator (which had not run a
  genuine blind first pass through Round 3 — a disclosed process gap, see Process Note) contributed an
  explicit optionality/reversibility argument. All three participants revised to unanimous agreement in
  Round 4 (Fable 0.85, Codex 0.86, agy 0.95). **Audited six times across two threat models — debate-round
  numbers above are independent of audit rounds: audit round 1 used `TM-ADR-STORAGE-CONTENT-004`; audit
  rounds 2–6 used `TM-ADR-CONTENT-ADMIN-005` (internal verification, external re-dispatch, compliance
  inspection, final internal close-out, and fix-compliance re-check respectively):** round 1 under `TM-ADR-STORAGE-CONTENT-004`
  (2026-07-14, Coordinator-overridden FAIL, 4 fixes folded — see §6 below); an internal-verification round
  under `TM-ADR-CONTENT-ADMIN-005` (2026-07-14, cross-ADR hard-blocker root cause + a DDL-grammar gap, both
  fixed); external peer re-dispatch (2026-07-14, Codex GPT-5.6 Terra + Gemini 3.1 Pro, same TM id) which
  found one further blocker (the grammar fix covered field names but not field *kind*, also interpolated
  into cast DDL — fixed this fold, see §4) plus a low-severity vacuous-index finding (fixed, see §5); a
  compliance-inspector pass (2026-07-14, same external auditors) — unanimous PASS, Codex 9.6, agy 9.8, zero
  findings on this ADR; and a final internal close-out pass (2026-07-14, Fable, `TM-ADR-CONTENT-ADMIN-005`)
  — PASS 9.0, two substantive findings (outbox coverage gap on content-type lifecycle transitions, §4; a
  mis-citation in §5) plus cosmetic provenance cleanup, all fixed this fold; and a round-6 fix-compliance
  re-check (2026-07-14, same TM id) — external PASS (Codex GPT-5.6 Terra 9.0, agy 9.9; two nits fixed:
  this audit-count legend, and §5/§6's residual §4a-citation prose — the "citations corrected round 6"
  markers below), plus internal re-verification (Fable) — PASS, all prior fixes verified against ADR-022's
  actual text, no new findings. Audit-adversarial review is
  complete.
- Date: 2026-07-14
- Relates: ADR-022 (content model — this ADR is the first real implementation of its deferred `entries`/
  `content_types` design), ADR-023 (core-mediated plugin data modules — explicitly rejected as the storage
  mechanism for this feature), ADR-024 (expression-totality — governs the field-validation language),
  ADR-041 (Storage/Timeline — this feature's index-provisioning events feed that Timeline), ADR-044
  (Categories & Tags — the taxonomy layer Collections entries opt into), ADR-007 (workspace scoping)
- Process note: this ADR's Primary/host participant did not run a genuine blind first pass before
  peer dispatch (see Process Note at the end) — a process gap, disclosed rather than hidden.

## Context

Tovu's content model today is a single bespoke `posts` table with a `kind` column (`post`|`page`).
ADR-022 (accepted 2026-07-08) describes a generic `entries` table + a content-type-as-data registry +
a validated JSON field-extension bag + core-provisioned expression indexes — but **that design was never
implemented**. All three debate participants independently verified this directly against
`src/infra/db/schema.ts` (not from prose), and two existing code comments in the shipped codebase already
say so explicitly ("not the generic ADR-022 `entries` model, which doesn't exist in this repo").

There is currently no admin-facing way for a site operator to define their own content type (e.g.
"Recipe," "Product," "Event") with its own fields, without a developer writing code and running a
migration. This ADR designs that capability — "Collections" — as the first real build of ADR-022's
deferred engine.

## Decision

### 1. Collections is a UI over a real content-type registry, not a database builder

Operator-defined content types are **data, not code, not DDL**. Creating a Collection inserts a row into
a `content_types` registry (schema: field names, kinds, validation rules, which fields are `queryable`)
and, for queryable fields, issues a core-mediated `CREATE INDEX` on a JSON path — **never**
`CREATE TABLE`/`ALTER TABLE`. This is ADR-022 §1–§4's design, finally implemented as intended.

### 2. Storage shape: a new `entries` table, coexisting with the untouched `posts` table

**This point took 4 rounds to converge, and did not settle until the Coordinator actually contributed an
argued position of its own in Round 4** (see Process Note) — the journey there matters as much as the
final unanimous answer:

- **Round 1**: Fable proposed a new `entries` table, explicitly leaving `posts` untouched, citing
  migration-risk-aversion toward live content. Codex and agy's illustrative sketches leaned toward
  reusing `posts` directly, though neither had committed to this as a deliberate position.
- **Round 2 (disclosed)**: Fable reversed — re-reading ADR-022 §1's literal text ("`post`/`page` ship as
  seeded registry rows"), Fable proposed instead an **additive-only evolution of `posts`** (one nullable
  `fields_json` column + a registry-checked `type` replacing the bare `kind` enum), arguing the migration
  risk it originally feared was smaller than assumed (zero existing-row mutation, fully reversible via
  `DROP COLUMN`). Codex explicitly reversed *toward* Fable's original coexistence stance. agy sided with
  coexistence but proposed a third option: a thin **identity-anchor** supertype table (`nodes`/`entities`
  holding just `id`/`created_at`/`type`), with both `posts` and a new `entries` table as FK children —
  giving taxonomy one real join target without touching `posts`'s own columns.
- **Round 3 (testing the anchor)**: no convergence yet. Fable moved to recommend the anchor
  pattern (0.78 confidence). Codex rejected the anchor (citing a new dual-write-chokepoint coupling risk
  it introduces) and returned to plain coexisting tables (0.78). agy **abandoned its own anchor proposal**
  after weighing its cost (a permanent write-path coordination tax and a join-hop on every read) and
  moved to recommend Fable's Round 2 additive-`posts`-evolution position instead (0.90). Three
  participants, three different final answers — the signature of a genuinely balanced tradeoff.
- **Round 4 (final — resolved, unanimous)**: the Coordinator, prompted directly by the project owner to
  actually contribute an opinion rather than only dispatch and synthesize, offered an explicit
  optionality/reversibility argument (below) as a disclosed Coordinator position, not a tie-break dressed
  up after the fact. All three participants revised in response: Fable moved from the anchor pattern to
  plain coexisting tables (0.85), naming the same asymmetry as decisive ("which option is easiest to
  walk back if I'm wrong," not just "which best serves taxonomy's needs"). Codex held its Round 3
  position, now with the optionality framing as additional support (0.86). agy moved from additive
  `posts` evolution to plain coexisting tables (0.95), citing the same live-data-entanglement risk.
  **Unanimous, all three, final.**

**Final decision (Round 4, unanimous): plain coexisting tables.** A new `entries` table holds Collections
content; `posts` is not touched in any way (no new columns, no write-path changes, no join dependency).
The Coordinator's Round 4 argument, now adopted by all three participants:

- **Optionality, not just blast-radius or elegance, is the deciding criterion: which choice keeps the
  most future paths open, and which one forecloses paths the moment it's made?** Plain coexistence
  changes nothing about `posts` — every other path (unify later, add an anchor later) remains exactly
  as buildable in six months as today, because both are additive/backfill operations regardless of
  when they happen. Additive `posts` evolution is the one option that forecloses paths: the moment
  operator-defined Collections content is created via `posts`, it is physically interleaved with live,
  real editorial content on a brownfield, self-hosted site (ADR-011) — reversing that later means
  *untangling already-mixed live production data*, not adding a table. The identity-anchor's specific
  benefit (a hard-FK taxonomy join) is itself deferrable at zero cost — nothing about waiting to build
  it later makes it harder to build than building it now — so paying its dual-write/join-tax cost
  today buys optionality that's available for free later, if it's ever needed at all.
- Every participant who evaluated the identity-anchor pattern in depth — including agy, its own
  author — ultimately rejected it once the cost was fully reasoned through: it adds a permanent
  dual-write transaction to every post/entry create and a join-hop to every cross-type read, purely to
  avoid one nullable column. That is a worse trade than the problem it solves.
- The real objection to plain coexistence — "taxonomy needs a genuine join target, not a polymorphic
  soft reference" — has an existing, proven answer already in this codebase: **ADR-041's sidecar ops
  journal already uses exactly this kind of soft cross-table reference** for actor identity, for the
  identical reason (a physical/module boundary that can't carry a real foreign key). This codebase
  already tolerates and reconciles soft references where a hard FK isn't available; it is not a novel
  risk introduced here.
- This codebase's single most repeated architectural value, across nearly every accepted ADR
  (ADR-011, ADR-015, ADR-023, ADR-041), is protecting live, real content from anything new and unproven.
  Plain coexistence gives Collections the cleanest possible abort path relative to the other two options — no
  effect on `posts` either way. **Corrected by round-1 `/audit-work` (2026-07-14 — see §6): the original debate
  record framed this abort path as "`DROP TABLE entries` and walk away," which is destructive to any operator
  content already created. The actual abort path this ADR now requires is a non-destructive disable/retain
  lifecycle — see §6 item 2.** Neither the additive-`posts` evolution nor the identity-anchor pattern preserves
  the *no-effect-on-`posts`* property as cleanly, which remains the real, correct basis for this decision.

**`post`/`page` are NOT migrated onto `entries` in this pass.** They remain on `posts`, unaffected.
Migrating them is explicitly deferred to a future pass, once the `entries` engine has proven itself in
production on lower-stakes custom types — mirroring ADR-023's own "engine against real demand, not
speculatively" doctrine.

### 3. Rejected alternatives (converged, all three participants agreed)

- **Directus/Contentful-style physical tables per Collection** (`CREATE TABLE` per operator-defined
  type). Rejected — this is squarely ADR-023 `dataModule` territory (plugin code, capability-gated,
  snapshot-before-every-DDL, disk-headroom preflight, boot-blocking crash recovery), and ADR-023 §3's
  tier matrix explicitly rejects zero-code/Tier-1 declarations. Handing that ceremony to an operator's
  "New Collection" button is a direct never-brick violation, not a shortcut.
- **Entity-Attribute-Value (EAV) tables.** Rejected — known anti-pattern for SQLite performance; the
  namespaced JSON extension bag (ADR-022 §2) plus core-provisioned expression indexes is the better fit
  this codebase already designed for exactly this problem.
- **JSON array of arbitrary fields with no registry/validation.** Rejected — this is the WordPress
  postmeta trap ADR-022 exists to avoid; every field must be declared and validated against the
  `content_types` registry before it can be written.

### 4. Wiring into the existing codebase

- **ADR-022 §1–§4** is the design being implemented, not extended: content-types-as-registry-data,
  universal typed columns + namespaced `fields.ext.{owner}.*`, expression-index query surface, single
  write chokepoint, complete append-only revisions with actor + monotonic sequence.
- **ADR-024's expression-totality amendment** governs the field-validation predicate language — bounded
  cost, never Turing-complete. Operator-authored validation rules ride this same trust primitive.
- **ADR-023 is explicitly NOT the storage path** — named here to foreclose the instinct to route
  Collections through `dataModule`.
- **ADR-041's `index.provision`/`index.drop` ledger events** fire when a Collection's queryable field
  indexes are created/dropped, so this shows up on the Storage Timeline like any other schema-adjacent
  operation, using the carve-out ADR-041 §4 already defined (no restore point needed for index-only
  operations).
- **ADR-007** workspace scoping on every `content_types`/`entries`/`entry_revisions` row and port method.
- **ADR-009 outbox discipline (added, round-1 audit fold; corrected round 2).** `write-service.ts`'s entry-transition
  writes (`entry.created`/`entry.updated`/`entry.published`/`entry.unpublished`) must enqueue an outbox event in
  the same transaction as the entry/revision write — this is how downstream integrations (SEO overrides, webhooks,
  search indexing) learn about Collection content at all; without it, Collections entries would be silently
  invisible to every event-driven consumer in the system. **Corrected by round-2 `/audit-work`: round 1 claimed
  this "mirrors `src/features/post/post.ts`'s existing pattern exactly," which Codex (gpt-5.5, high) verified false
  — `post.ts`'s `updatePost` saves the post first, then separately calls `outbox.enqueue` afterward, non-atomically.
  Event names/payload shape should follow `post.ts`'s convention; the same-transaction requirement itself is new
  and must NOT be implemented by copying `post.ts`'s current non-atomic sequencing.** **Extended, round-5 audit
  fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005, Fable F2): this bullet named entry transitions only. §6's
  disable→tombstone→cleanup lifecycle (item 2) has mass-unpublish semantics at the tombstone step — "entries no
  longer served publicly" — but nothing enqueued an outbox event for it, so search indexes/webhooks that learned
  of those entries via `entry.published` would never learn to drop them; the ADR-041 ledger row §4 already
  requires for index teardown is the Storage Timeline, not the outbox, and doesn't substitute for it. The outbox
  obligation now also covers `content_types` lifecycle transitions (`content_type.deprecated`,
  `content_type.tombstoned`), same-transaction, same chokepoint.**
- **Reserved content-type keys (added, round-1 audit fold).** `content_types` definition-time validation MUST
  reject `key ∈ {'post', 'page'}` — these are permanently reserved for the legacy `posts` table. Without this, an
  operator-created Collection named "post" makes ADR-044's `entry_terms.contentType` polymorphic reference
  ambiguous between a `posts` row and an `entries` row (see §6 item 1 — the single most serious cross-ADR finding
  from round-1 audit). This is a cheap, additive validation rule at registry-write time, not a schema change.
- **ADR-041 §5 watermark stamping (added, round-2 `/audit-work` fold, TM-ADR-CONTENT-ADMIN-005).** Every
  entry/registry mutation through `write-service.ts` increments-and-stamps the authoritative
  `storage_write_watermark` in the same transaction as the write, exactly like the same-transaction outbox
  and revision obligations already required above. Collections is a brand-new write chokepoint designed
  *after* ADR-041's six-pass inventory saga proved retrofitting watermark coverage onto existing code does
  not converge — it is born watermark-covered rather than joining ADR-041's uncovered-paths backlog.
  ADR-045's discarded-window disclosure may not count `entries` rows as a covered category until this
  obligation is actually implemented; see ADR-045 §3's round-2 fold.
- **Key/field-name grammar (added, round-2 `/audit-work` fold, TM-ADR-CONTENT-ADMIN-005; extended round 3).**
  Definition-time validation additionally pins a strict grammar for `content_types.key` and every field name
  (e.g. `^[a-z][a-z0-9_]{0,63}$`): these operator-supplied strings are interpolated into core-issued
  `CREATE INDEX` identifiers and JSON-path literals (ADR-022 §3's index template), which cannot take bound
  parameters. Without a pinned grammar, an operator-authored name containing quotes or path metacharacters
  reaches raw DDL text — the exact "operator-defined content type triggers raw DDL" failure this ADR's
  first decision exists to forbid, reached via injection rather than by design. ADR-044's `taxonomies.key`
  should carry the same rule for symmetry, though the stakes are lower there (no DDL interpolation).
  **Round-3 correction (2026-07-14, external audit — Codex): the round-2 fold constrained key/field* names*
  but not field* kind*, which ADR-022 §3's template also interpolates directly into
  `CAST(json_extract(...) AS {type})`. A field `kind` is not free text: it is a closed core enum (e.g.
  `text|integer|real|boolean|datetime`), never an operator-supplied SQL fragment. The index provisioner maps
  that enum through a fixed, core-owned lookup table to SQL cast literals — it never interpolates an
  operator-supplied kind, namespace, collation, or sort expression directly. Any namespace used by the JSON
  path is core-assigned and grammar-validated the same way before index construction.** **Round-5 correction
  (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable F7): ADR-022 §3's index-name template
  (`q_{type}_{ns}_{field}`) has no workspace component, while `content_types` is unique per
  `(workspaceId, key)` — two workspaces defining the same `key` with a different field `kind` would collide
  on index name. Index identity must include workspace scoping (e.g. a workspace-derived namespace segment
  or a workspace-qualified index name), not just the type/ns/field tuple, whenever the underlying registry
  key isn't itself globally unique.**

### 5. Concrete sample implementation

**Corrected by round-1 `/audit-work` (2026-07-14 — see §6): the sample below was found to omit `bodyJson` (an
ADR-022 §2 universal entry column), a standard `createdAt` completeness column, and revision `pluginId`
attribution (ADR-022 §4a), and to omit a revision ledger for the registry itself, which ADR-022 §4a explicitly
names alongside entries and `entry_terms`. All are fixed in the sample below — additions marked `// added,
round-1 audit fold` (citations corrected round 6, see §4's grammar bullet history for the same class of fix).**

```ts
// src/infra/db/schema.ts — additive, coexists with the untouched `posts` table
export const contentTypes = sqliteTable("content_types", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),                   // "recipe" — VALIDATED at write time: key NOT IN ('post','page')
  label: text("label").notNull(),
  fieldsSchemaJson: text("fields_schema_json").notNull(), // field defs: name, kind, queryable, required
  status: text("status").notNull(),             // active|deprecated|tombstone
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [uniqueIndex("content_types_workspace_key_unique").on(t.workspaceId, t.key)]);

// added, round-1 audit fold — ADR-022 §4a names "the registry itself" as requiring a same-transaction revision;
// content_types previously had only an OCC version counter, not an append-only ledger.
export const contentTypeRevisions = sqliteTable("content_type_revisions", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  contentTypeId: text("content_type_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  // added, round-3 audit fold (Codex + agy independently) — `seq` is a global autoincrement PK, so a
  // unique index on (contentTypeId, seq) was vacuous (already implied by seq alone). perContentTypeSeq
  // gives the composite index a real constraint, matching entryRevisions' perEntrySeq pattern.
  perContentTypeSeq: integer("per_content_type_seq").notNull(),
  stateJson: text("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  op: text("op").notNull(),                     // register|deprecate|tombstone|field-change
  recordedAt: text("recorded_at").notNull(),
}, (t) => [uniqueIndex("idx_content_type_revisions_seq").on(t.contentTypeId, t.perContentTypeSeq)]);

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),                 // soft ref to content_types.key
  slug: text("slug").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  bodyJson: text("body_json"),                  // added, round-1 audit fold — ADR-022 §2 universal entry column (re-cited round 5, was mis-cited to §4a)
  fieldsJson: text("fields_json").notNull(),    // { ext: { site: {...} } }, validated against content_types
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),       // added, round-1 audit fold — standard completeness column (re-cited round 5: ADR-022 does not actually name `createdAt`; §2's universal entry columns are `publishedAt`/`updatedAt`)
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [
  uniqueIndex("entries_workspace_type_slug_unique").on(t.workspaceId, t.type, t.slug),
  index("idx_entries_workspace_type").on(t.workspaceId, t.type),
]);

export const entryRevisions = sqliteTable("entry_revisions", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  entryId: text("entry_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  perEntrySeq: integer("per_entry_seq").notNull(),
  stateJson: text("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  pluginId: text("plugin_id"),                  // added, round-1 audit fold — ADR-022 §4a origin-plugin attribution; null for core/operator writes
  op: text("op").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [uniqueIndex("idx_entry_revisions_entry_seq").on(t.entryId, t.perEntrySeq)]);
```

New Tier-2 library `src/features/entries/` (+ `src/features/content-types/`), mirroring every shipped
feature this year: `ports.ts`, `types.ts`, `write-service.ts` (the chokepoint — validates against the
registry, writes entry + revision in one transaction), `repo.memory.ts` + `repo.sqlite.ts` (rule-of-two),
admin routes under `/api/admin/v1/content-types` and `/api/admin/v1/entries`, React screen
`apps/admin/src/sections/Collections.tsx`. Permissions: `admin.collections.read`, `admin.collections.manage`
(ADR-021 flat-string convention).

## Consequences

- The deferred ADR-022 engine finally gets built, but scoped to new content only — `posts`/`pages`
  carry zero migration risk from this pass.
- Collections and Categories & Tags (ADR-044) can ship independently of each other — the taxonomy join
  doesn't depend on Collections existing, and Collections doesn't depend on taxonomy existing.
- A future decision (not this ADR) is still owed: whether/when to migrate `posts`/`pages` onto `entries`
  to fully realize ADR-022 §1's "post/page are seeded registry rows" text. This ADR explicitly defers
  that, accepting `posts` as a permanent-for-now bespoke exception.
- Taxonomy's join to `entries` (and to `posts`, for existing content) uses a soft polymorphic reference,
  not a hard FK — an accepted, precedented tradeoff (see ADR-044), not a design gap.

## Failure modes

- **Queryable-index sprawl.** An operator marks many fields `queryable` across many Collections,
  degrading write performance. Mitigation: a per-type cap on `queryable` fields enforced at
  `content_types` definition time.
- **Schema drift / dangling fields.** An operator removes a field from a type definition, leaving old
  entries with orphaned JSON keys. Mitigation: validation is strict on write, tolerant on read (unknown
  keys are ignored, not fatal); field removal is a tombstone, never a destructive drop.

## 6. Round 1 audit fold (2026-07-14), amended by round 2

**Round 2 update:** the outbox fix below (item 4) originally cited `post.ts` as already doing same-transaction
enqueue. Codex (gpt-5.5, high) verified this false against the live code in round 2 — `post.ts` saves then
enqueues non-atomically. Corrected in item 4's text above to require the same-transaction behavior as a genuinely
new requirement, not an existing pattern to copy.

Audited under `TM-ADR-STORAGE-CONTENT-004` by three independent auditors (Codex gpt-5.6-terra/high, agy/Gemini 3.1
Pro High, Fable/Opus in-host). Fable passed this ADR at the auditor level (9.0); the Coordinator overrode that PASS
to FAIL given the accumulated weight of distinct real defects agy and Codex independently found (below) — see the
external-audit run for full cross-auditor reasoning.

- **Fixed (this fold):** missing `content_types`/`posts`/`pages` key-collision guard — `content_types.key ∈
  {'post','page'}` is now rejected at registry-write time (§4).
- **Fixed (this fold):** schema sample omitted `bodyJson` (ADR-022 §2), a standard `createdAt` completeness
  column, `pluginId` attribution (ADR-022 §4a), and the ADR-022 §4a-required registry revision ledger — all
  four now present in the sample (§5; citations corrected round 6).
- **Fixed (this fold):** the stated abort path (`DROP TABLE entries`) was destructive to any operator content
  already created. The abort/rollback lifecycle for a Collection is now: **disable** (content type flips to
  `status='deprecated'`, existing entries remain readable/queryable but new-entry creation is refused) →
  **tombstone** (flips to `status='tombstone'`, entries no longer served publicly, indexes torn down via `db-ops`
  with an ADR-041 ledger record) → a separately confirmed, **export-backed destructive cleanup** only after an
  explicit retention window elapses. Entries and revisions are retained at every step except the final, explicitly
  confirmed cleanup. This mirrors `features/settings/write-service.ts`'s existing deprecate/tombstone precedent
  rather than inventing a new lifecycle shape.
- **Fixed (this fold):** `write-service.ts` now required to enqueue an ADR-009 outbox event in the same
  transaction as every entry state transition (§4).
- **Deferred, not fixed this fold:** whether/when `posts`/`pages` migrate onto `entries` remains explicitly out of
  scope (unchanged from the original decision) — no auditor treated this as a blocker.

## Open Questions

- Whether/when `posts`/`pages` migrate onto `entries` — deliberately out of this ADR's scope.
- Exact per-type `queryable` field cap — not benchmarked here.
- Whether the additive-`posts`-evolution or identity-anchor alternatives should be revisited once
  Collections has real production usage data. Both were credible positions each participant held at some
  point across Rounds 2-3 before Round 4's unanimous convergence — this decision is not fragile, but it
  is worth re-checking against real usage rather than treated as permanently closed.

## Process Note

This ADR's Primary/host participant (Claude, this session) did not run a true blind first pass before
dispatching peers in Rounds 1-3, contrary to the debate protocol's own requirement that Primary form and
freeze an independent position before peer synthesis. The project owner noticed this gap directly and
asked about it mid-session — it was not caught by the Coordinator's own process discipline. In Round 4,
the Coordinator corrected course and contributed an actual argued position (the optionality/reversibility
framing above), disclosed openly as a Coordinator contribution rather than a tie-break dressed up after
the fact. All three participants found it persuasive and converged on it independently. The final
storage-shape decision is therefore a genuine 4-round unanimous consensus, reached only after the
Coordinator's own participation gap was corrected — not a tie-break imposed over an unresolved split.
