# External Audit Packet — Round 6 (Compliance Inspector pass, final)

## Ask

- **User request:** Run round 6 of `/audit-work` on ADR-043 (Collections) and ADR-044 (Categories & Tags) — a confirming compliance pass on the round-5 fold (Fable's final internal close-out fixes), since those fixes have not yet been independently checked by anyone else. ADR-045 excluded — round 5 found zero issues on it, no changes were made.
- **Audit focus:** Do the round-5 fold edits actually satisfy what Fable's round-5 close-out asked for? Did any edit introduce a new problem? (Note: round 5 also fixed two genuine markdown bold-marker balance bugs the Coordinator introduced while applying earlier fixes — verify the text reads correctly, not just that markers are balanced.)
- **Scope:** custom (diff-only compliance pass, no code)
- **Suggested changes mode:** patches
- **Audit target:** the unified diff described below, plus full current text of both files for context
- **Planned auditors:** codex, agy (gemini) — external peers, matching round 4's pattern. No internal-verification re-run (Fable's own round-5 findings are what's being reconciled).
- **Authoring packet:** `ADS-memory/reports/external-audit/packets/20260714-adr-043-044-round6-audit-packet.md`
- **Dispatch packet:** same as authoring packet

## Threat Model & Scope Contract (frozen, unchanged from rounds 2-5)

- **Threat model id:** `TM-ADR-CONTENT-ADMIN-005`
- **Audit round:** 6
- **Intended use / deployment context:** unchanged — pre-implementation ADR design text for Tovu
- **Allowed actors & capabilities:** unchanged
- **In-scope blocking failure domains (ALLOWLIST):** unchanged, same 5 domains
- **Mandatory invariants:** unchanged, same 5
- **Blocking impact threshold:** unchanged
- **Risk tier & score floor:** unchanged — medium/high, floor 8.5
- **Gate formula:** unchanged
- **Explicit non-goals:** unchanged, plus: ADR-045 is out of scope this round (no changes since round 3, which both external auditors already cleared).

## Prior-Round Disposition Ledger (round 5 findings, all from Fable's internal close-out)

| ID | Finding | Disposition | Evidence / rationale |
|---|---|---|---|
| F1 | ADR-044 term lifecycle (reparent, deprecate) named by validation/revisioning bullets but not representable — op enum missing `reparent`, `terms` missing `status` | `fixed` | Added `reparentTerm` to write-service interface + op enum (`create\|rename\|reparent\|merge\|deprecate`); added `terms.status`; extended outbox/watermark obligation bullet to name `reparentTerm` |
| F2 | ADR-043 outbox obligation named entry transitions only; tombstone lifecycle step (mass-unpublish semantics) fired no event | `fixed` | Extended outbox obligation to `content_types` lifecycle transitions (`content_type.deprecated`/`content_type.tombstoned`) |
| F3 | ADR-043 §5 mis-cited `bodyJson`/`createdAt` to ADR-022 §4a (actually §2 and not-named-at-all respectively) | `fixed` | Corrected both citations inline |
| F4 | Stale "audited three times" count after round 4 made it four | `fixed` | Corrected to "four times" in both ADR-043/044 status lines, with a round legend |
| F5 | Round-numbering drift across the batch (same pass labeled "round 2" in some files, "round 3" in others) | `fixed` | Addressed via the round legend added for F4 |
| F6 | ADR-045 status block didn't record round 4 or 5 | `fixed` | Not in this round's scope (ADR-045 excluded) — was fixed directly in ADR-045 itself, verify only if you happen to notice it, not a required check this round |
| F7 | ADR-022 §3's index-name template has no workspace component, while `content_types` keys are only unique per-workspace | `fixed` | Added round-5 correction to ADR-043 §4 requiring workspace-scoped index identity |
| (unlabeled) | Two genuine markdown bold-marker balance bugs introduced while applying round-3/round-4 fixes (a merged closing+opening marker in ADR-043's grammar bullet; a missing closing marker in ADR-044's status line) | `fixed` | Found via full open/close state trace (not just even/odd counts) and corrected; both files verified fully closed by sequential trace |

## What changed since round 5 (the diff to audit)

**ADR-043-collections.md:**
1. §4 outbox-discipline bullet — appended text extending the obligation to `content_types` lifecycle transitions (F2).
2. §4 grammar bullet — fixed a markdown bug (missing `**` between the round-3 and round-5 correction paragraphs) and added the round-5 workspace-scoped-index-identity correction (F7).
3. §5 sample — recited `bodyJson`/`createdAt` comments correctly (F3).
4. Status line — updated round count to "four," added round legend, fixed a trailing unpaired `**`.

**ADR-044-categories-and-tags.md:**
5. Sample — added `reparent` to the `taxonomyRevisions` op enum comment; added `terms.status` column (F1).
6. Wiring section outbox/watermark bullet — added `reparentTerm` to the named methods (F1).
7. write-service.ts sample interface — added `reparentTerm` method (F1).
8. Status line — fixed a missing closing `**` after the round legend, updated round count, fixed a trailing unpaired `**`.

## Full current text — ADR-043 (post-round-5-fold)

```markdown
# ADR-043: Collections — operator-defined content types

- Status: **PROPOSED** — emerged from a 4-round swarm `/debate` (2026-07-14, Primary Sonnet host +
  Fable subagent + Codex gpt-5.5 + Gemini 3.1 Pro via agy). All three external/subagent participants
  converged closely on the overall shape from Round 1. The storage-shape sub-question (below) did
  **not** converge through Rounds 1-3 — each of the three participants held a different final position
  after Round 3 — and was resolved only in **Round 4**, after the Coordinator (which had not run a
  genuine blind first pass through Round 3 — a disclosed process gap, see Process Note) contributed an
  explicit optionality/reversibility argument. All three participants revised to unanimous agreement in
  Round 4 (Fable 0.85, Codex 0.86, agy 0.95). **Audited four times across two threat models — debate-round
  numbers above and audit-round numbers below are independent counters, disambiguated only by threat-model id
  (round legend, added round 5: `TM-ADR-STORAGE-CONTENT-004` round 1 → `TM-ADR-CONTENT-ADMIN-005` rounds
  1(internal)/3(external)/4(external)/5(internal, final)):** round 1 under `TM-ADR-STORAGE-CONTENT-004`
  (2026-07-14, Coordinator-overridden FAIL, 4 fixes folded — see §6 below); an internal-verification round
  under `TM-ADR-CONTENT-ADMIN-005` (2026-07-14, cross-ADR hard-blocker root cause + a DDL-grammar gap, both
  fixed); external peer re-dispatch (2026-07-14, Codex GPT-5.6 Terra + Gemini 3.1 Pro, same TM id) which
  found one further blocker (the grammar fix covered field names but not field *kind*, also interpolated
  into cast DDL — fixed this fold, see §4) plus a low-severity vacuous-index finding (fixed, see §5); a
  compliance-inspector pass (2026-07-14, same external auditors) — unanimous PASS, Codex 9.6, agy 9.8, zero
  findings on this ADR; and a final internal close-out pass (2026-07-14, Fable, `TM-ADR-CONTENT-ADMIN-005`)
  — PASS 9.0, two substantive findings (outbox coverage gap on content-type lifecycle transitions, §4; a
  mis-citation in §5) plus cosmetic provenance cleanup, all fixed this fold. Audit-adversarial review is
  complete; still requires human owner sign-off before Accepted.
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

**Corrected by round-1 `/audit-work` (2026-07-14 — see §6): the sample below was found to omit fields ADR-022 §4a
names as universal/mandatory (`bodyJson`, `createdAt`, revision `pluginId` attribution) and to omit a revision
ledger for the registry itself, which ADR-022 §4a explicitly names alongside entries and `entry_terms`. Both are
fixed in the sample below — additions marked `// added, round-1 audit fold`.**

\`\`\`ts
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
\`\`\`

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
- **Fixed (this fold):** schema sample didn't conform to what Accepted ADR-022 §4a actually requires —
  `bodyJson`/`createdAt` added to `entries`, `pluginId` attribution added to `entry_revisions`, and a
  `content_type_revisions` ledger added for the registry itself (§5).
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

```

## Full current text — ADR-044 (post-round-5-fold)

```markdown
# ADR-044: Categories & Tags — shared taxonomy system

- Status: **PROPOSED** — emerged from the same 3-round swarm `/debate` as ADR-043 (2026-07-14). Unlike
  ADR-043's storage-shape question, **this topic converged closely across all three participants and all
  three rounds** — there is no persistent disagreement to tie-break here. **Audited four times across two
  threat models (round legend, added round 5: `TM-ADR-STORAGE-CONTENT-004` round 1 →
  `TM-ADR-CONTENT-ADMIN-005` rounds 1(internal)/3(external)/4(external)/5(internal, final)):** round 1 under
  `TM-ADR-STORAGE-CONTENT-004` (2026-07-14, unanimous FAIL — the only one of
  the four originally audited ADRs all three auditors failed independently — 4 fixes folded, see Round 1
  audit fold below); an internal-verification round under `TM-ADR-CONTENT-ADMIN-005` (2026-07-14, escalation
  findings on cross-ADR consistency and merge reversibility); and external peer re-dispatch (2026-07-14,
  Codex GPT-5.6 Terra + Gemini 3.1 Pro, same TM id) which independently converged on the SAME core defects
  (allow-list timing contradiction, false merge-reversibility claim, missing `taxonomy_revisions` sample,
  missing outbox/watermark obligations) — all now fixed this fold. One additional auditor finding (a
  kind-mutation cascade concern) was checked against the live code and found not applicable: `posts.kind` is
  fixed at creation with no post↔page conversion path in v1. **Round 4 (2026-07-14, same auditors,
  compliance-inspector pass) — unanimous PASS, Codex 9.6, agy 9.8; agy caught one more low-severity
  consistency gap in the just-added `taxonomy_revisions` sample (missing `perTaxonomySeq`, mirroring
  ADR-043's round-3 fix), fixed this fold.** **Round 5 (2026-07-14, Fable, final internal close-out) — PASS
  9.0. One substantive finding: the term lifecycle (reparent, deprecate) wasn't fully wired into the op
  vocabulary/outbox obligation/`terms` schema despite being named by the `parentId`-validation and
  revisioning bullets — `reparentTerm` added, `terms.status` added, both fixed this fold. Remaining findings
  were provenance/citation cleanup, also fixed this fold.** Audit-adversarial review is complete; see the
  external-audit run for full cross-auditor reasoning and disposition. Still requires human owner sign-off
  before Accepted.
- Date: 2026-07-14
- Relates: ADR-022 §5 (the design this ADR finally implements — its `taxonomies`/`terms`/`entry_terms`
  scaffold is a design placeholder, confirmed absent from the shipped schema by all three debate
  participants independently), ADR-043 (Collections — content types opt into taxonomies), ADR-041
  (Storage — precedent for the soft cross-table reference this ADR relies on), ADR-007 (workspace scoping)

## Context

There is currently no shared taxonomy system in Tovu: no way to categorize or tag `posts`/`pages` (or,
per ADR-043, future Collections entries) and browse/filter by that categorization across content types.
ADR-022 §5 sketches a `taxonomies + terms(parentId) + entry_terms` mechanism, but — like ADR-022's
`entries` table — it was never actually built. All three debate participants confirmed this directly
against the schema.

## Decision

### 1. One shared taxonomy mechanism, not two

Categories and tags are two **instances** of the same underlying primitive — a named term attached to
content — differing only in whether terms nest. A `taxonomies` table carries a `hierarchical` boolean:
`category` = hierarchical (`terms.parentId` populated), `tag` = flat (`terms.parentId` always null). This
was unanimous across all three participants across all rounds: modeling them as two separate subsystems
would duplicate CRUD, UI, rename/merge logic, and the reverse-index for no real gain.

### 2. Real relational tables, never JSON arrays

Relations live in `terms` + `entry_terms` real tables, not as a JSON array on the content row. This
matches ADR-022 §5's own explicit text ("relations live in real tables, not JSON") and is required for
the two queries that justify taxonomy's existence: "all content tagged X" (a reverse lookup a JSON array
can't answer efficiently) and "rename/merge tag X everywhere" (referential integrity a JSON array
can't provide).

### 3. The join is a soft polymorphic reference, ships independently of Collections

`entry_terms` references content by `(workspaceId, contentType, contentId)` — a **soft** tuple, not a
hard foreign key to any single table. This is the decision that lets Categories & Tags ship **now,
against the existing `posts` table, without waiting for ADR-043's Collections/`entries` engine to exist**:
the same join mechanism attaches to `posts` rows today and to `entries` rows (ADR-043) later, with zero
schema change when Collections lands.

This soft-reference pattern is not a novel risk: **ADR-041's sidecar ops journal already uses an
identical pattern** (composite actor identity referenced across a physical file boundary that cannot
carry a real foreign key), for the same underlying reason — a reference that must cross a boundary a
hard FK cannot span. Orphaned `entry_terms` rows (from content deleted through a path that doesn't clean
up the join) are inert on read (an inner join simply drops them) and swept by a periodic/boot reconcile,
matching this codebase's established tolerance for soft cross-boundary references.

### 4. Opt-in per content type

A content type (built-in `post`/`page`, or an ADR-043 Collection) declares which taxonomies apply to it.
**Corrected by round-3 `/audit-work` (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy
independently converged on this defect): `post`/`page` opt in via a small hardcoded allow-list in the
taxonomy library, permanently for as long as they remain on the legacy `posts` table — not "until ADR-043
ships," which was internally contradictory (ADR-043 permanently rejects `post`/`page` as registry keys, so
they can never move into `content_types` when ADR-043 ships; only a future, separate migration ADR could
change this). ADR-043's `content_types` registry carries the per-type taxonomy allow-list for Collections
`entries` only.**

## Rejected alternatives (converged)

- **Separate tables/subsystems for categories vs. tags.** Rejected — same underlying shape, differing
  only by a boolean; two subsystems would be pure duplication.
- **JSON array of tag strings on the content row.** Rejected — breaks efficient reverse lookup and
  referential integrity on rename/merge; the exact postmeta-shaped trap ADR-022 exists to avoid.
- **Hard FK from `entry_terms` to a single content table.** Rejected for this pass — would either block
  taxonomy behind ADR-043's `entries` engine landing first, or strand it against `posts` only, forfeiting
  the independent-shipping property that makes this decision valuable.

## Wiring into the existing codebase

- **ADR-022 §5** is the design being implemented.
- New Tier-2 library `src/features/taxonomy/`, following the same shipped-feature template as every
  other feature this year: `ports.ts`, `types.ts`, `write-service.ts` (single write chokepoint + an
  append-only `taxonomy_revisions` ledger — renames/merges are consequential and must be revisioned),
  `repo.memory.ts` + `repo.sqlite.ts` (rule-of-two), admin routes under `/api/admin/v1/taxonomy`, React
  screen `apps/admin/src/sections/Taxonomy.tsx`.
- **ADR-043's `content_types` registry** carries the per-type taxonomy allow-list for Collections
  `entries`. **Corrected by round-3 `/audit-work` fold (2026-07-14):** `post`/`page` use a hardcoded
  allow-list permanently for this pass, not "until ADR-043 ships" — see §4 above.
- **ADR-007** workspace scoping on every table and port method.
- **ADR-009 outbox discipline + ADR-041 §5 watermark stamping (added, round-3 `/audit-work` fold,
  TM-ADR-CONTENT-ADMIN-005 — Codex and agy independently flagged this omission).** Every mutating taxonomy
  write (`assignTerms`, `mergeTerm`, `renameTerm`, `reparentTerm`, and `taxonomies`/`terms` create/deprecate)
  must enqueue an
  outbox event and increment-and-stamp the authoritative `storage_write_watermark`, both in the same
  transaction as the write — the identical same-transaction obligation ADR-043 §4 already requires for
  Collections. Without the outbox event, taxonomy changes are silently invisible to every downstream
  event-driven consumer (search indexing, webhooks); without the watermark stamp, taxonomy writes are never
  countable in ADR-045's discarded-window disclosure, repeating the exact coverage gap that ADR-043's
  original text left open (see ADR-043 §4's own watermark-stamping bullet for the precedent).
- **Explicit dependency on ADR-043 (added, round-1 audit fold).** This ADR's `entry_terms.(workspaceId,
  contentType, contentId)` soft reference composes cleanly against both the legacy `posts` table and ADR-043's
  `entries` table **only because ADR-043 §4 now rejects `content_types.key ∈ {'post','page'}` at registry-write
  time.** Without that reservation, an operator-created Collection named "post" would make `contentType='post'`
  ambiguous between a `posts` row and an `entries` row — this ADR's polymorphic join is not injective on its own;
  it is injective only in composition with ADR-043's reserved-key guarantee. This dependency must hold even if
  ADR-043 or ADR-044 ship independently of each other in time.
- **Workspace-scoped join resolution (added, round-1 audit fold; extended round 3).** The soft `(workspaceId,
  contentType, contentId)` reference is acceptable only if `assignTerms`/every taxonomy write validates that
  the target term and the target content row belong to the **same** `workspaceId` before writing — never
  trusting a caller-supplied `workspaceId` alone. The write chokepoint must resolve both `terms.workspaceId`
  and the content row's own workspace ownership and reject the write (not just the read) on any mismatch.
  Cross-workspace term/content pairing is otherwise a direct tenant-isolation violation of ADR-007. Contract
  tests must prove a cross-workspace assignment is rejected, not merely untested. **Round-3 correction
  (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — internal verification): workspace-match alone leaves a lens-level
  gap — `contentType='page'` plus a `posts` row whose actual `kind='post'` would pass every check above
  (same table, same workspace). The chokepoint must additionally verify the resolved row's own type/lens
  equals the supplied `contentType` (`posts.kind` for `post`/`page`; `entries.type` for Collections keys),
  rejecting on mismatch, with a contract test alongside the cross-workspace one. Note this is a write-time
  validation gap, not a mutation-cascade concern: `posts.kind` is fixed at creation with no post↔page
  conversion path in v1 (`src/features/post/post.ts`; `UpdatePostInput` has no `kind` field), so no cascade
  obligation is needed — only the write-time lens check above.**
- **`parentId` hierarchy validation (added, round-1 audit fold).** The write chokepoint must validate, transactionally,
  before accepting a `parentId` update: (a) the parent belongs to the **same** `taxonomyId` as the child — a term
  cannot parent across taxonomies; (b) `parentId` is rejected (must be `null`) when `taxonomies.hierarchical = 0`
  (tags never get a parent); (c) the existing cycle-detection check (Failure modes, below) still applies. The
  original decision named cycle detection only; same-taxonomy and hierarchy-mode validation were unstated gaps.

## Concrete sample implementation

\`\`\`ts
// src/infra/db/schema.ts
export const taxonomies = sqliteTable("taxonomies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),                    // "category" | "tag" | operator-defined
  label: text("label").notNull(),
  hierarchical: integer("hierarchical").notNull().default(0),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [uniqueIndex("taxonomies_workspace_key_unique").on(t.workspaceId, t.key)]);

// added, round-3 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy independently
// found this table missing from the sample despite being load-bearing for §4's revisioning claims and
// mergeTerm's revised reversibility disclosure below).
export const taxonomyRevisions = sqliteTable("taxonomy_revisions", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  taxonomyId: text("taxonomy_id").notNull(),
  // added, round-4 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — agy) — mirrors the same fix
  // ADR-043's content_type_revisions got in round 3: a global seq-only index doesn't give a gapless
  // per-taxonomy sequence the way entryRevisions'/contentTypeRevisions' perEntrySeq/perContentTypeSeq do.
  perTaxonomySeq: integer("per_taxonomy_seq").notNull(),
  workspaceId: text("workspace_id").notNull(),
  stateJson: text("state_json").notNull(),      // full pre-operation term/taxonomy state
  actorId: text("actor_id").notNull(),
  pluginId: text("plugin_id"),                  // ADR-022 §4a origin-plugin attribution; null for core/operator writes
  // extended, round-5 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005, Fable F1) — `reparent` was missing:
  // the parentId hierarchy-validation bullet above explicitly governs "accepting a parentId update," but the
  // original enum had no way to record that mutation.
  op: text("op").notNull(),                     // create|rename|reparent|merge|deprecate
  recordedAt: text("recorded_at").notNull(),
}, (t) => [uniqueIndex("idx_taxonomy_revisions_taxonomy_seq").on(t.taxonomyId, t.perTaxonomySeq)]);

export const terms = sqliteTable("terms", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taxonomyId: text("taxonomy_id").notNull().references(() => taxonomies.id, { onDelete: "restrict" }),
  parentId: text("parent_id"),                   // self-ref; null for tags & top-level categories
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  // added, round-5 audit fold (2026-07-14, TM-ADR-CONTENT-ADMIN-005, Fable F1) — the op enum above and the
  // outbox/watermark obligation bullet both claimed terms support `deprecate`, but nothing recorded that
  // state; without a `status` column a term cannot actually be deprecated as drawn.
  status: text("status").notNull().default("active"), // active|deprecated
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
}, (t) => [
  uniqueIndex("terms_workspace_taxonomy_slug_unique").on(t.workspaceId, t.taxonomyId, t.slug),
  index("idx_terms_workspace_parent").on(t.workspaceId, t.parentId),
]);

export const entryTerms = sqliteTable("entry_terms", {
  workspaceId: text("workspace_id").notNull(),
  contentType: text("content_type").notNull(),   // "post" | "page" | a content_types.key — POLYMORPHIC
  contentId: text("content_id").notNull(),        // soft ref: posts.id today, entries.id (ADR-043) later
  termId: text("term_id").notNull().references(() => terms.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
  addedAt: text("added_at").notNull(),
}, (t) => [
  uniqueIndex("entry_terms_unique").on(t.workspaceId, t.contentType, t.contentId, t.termId),
  index("idx_entry_terms_by_term").on(t.workspaceId, t.termId),          // "all content tagged X"
  index("idx_entry_terms_by_content").on(t.workspaceId, t.contentType, t.contentId),
]);
\`\`\`

\`\`\`ts
// src/features/taxonomy/write-service.ts
export interface TaxonomyWriteService {
  assignTerms(req: { workspaceId; actorId; contentType; contentId; termIds: string[] }): Promise<void>; // NOT revisioned — see round-1 audit fold below
  mergeTerm(req: { workspaceId; actorId; fromTermId; intoTermId }): Promise<void>; // one tx, revisioned (term metadata only — membership dedup is destructive, see round-3 fold below)
  renameTerm(req: { workspaceId; actorId; termId; label; slug }): Promise<void>; // one tx, revisioned
  reparentTerm(req: { workspaceId; actorId; termId; newParentId: string | null }): Promise<void>; // one tx, revisioned (added, round-5 audit fold) — the `parentId` hierarchy-validation checks below run inside this call
}
\`\`\`

**`entry_terms` revisioning — explicit narrowing of ADR-022 §4a (added, round-1 audit fold, 2026-07-14; wording
corrected round 2).** ADR-022 §4a names `entry_terms` explicitly among the mutations requiring a same-transaction
revision under its CI canary. Round-1 audit correctly found that `assignTerms` (adding/removing a term from a
content row) was neither revisioned nor explicitly exempted — a direct, undisclosed conflict with an Accepted
invariant. This ADR now **explicitly narrows ADR-022 §4a for `entry_terms` membership changes only** (not for
`terms`/`taxonomies` themselves, which keep full revisioning via `taxonomy_revisions`): term-assignment membership
is treated as **high-churn relational state whose historical audit trail is judged low-value** — the same basis
`redirect_hits` and `asset_renditions` already use, both disclosed as "deliberately non-revisioned (narrows
ADR-022 INV-3)." **Corrected by round-2 `/audit-work` (Fable): the original justification claimed membership is
"reconstructable from a table scan of `entry_terms` itself" — that only shows *current* membership is queryable,
not that a *removed* assignment is recoverable after the fact, which is what a revision ledger actually provides.
Unlike `redirect_hits` (regenerable from access telemetry) or `asset_renditions` (regenerable from the source
asset), a deleted `entry_terms` row has no upstream source to rebuild from. This ADR now states plainly: a removed
term assignment is NOT independently recoverable, and that is an accepted, disclosed loss of audit granularity —
not a claim that the data is safe because it's reconstructable.** The ADR-022 §4a CI canary must be taught this
exception (an explicit allow-list entry for `entry_terms`, not a silent gap it fails to notice).

Permissions: `admin.taxonomy.manage` (ADR-021 flat-string convention).

## Failure modes

- **Orphaned `entry_terms` on content deletion outside the taxonomy chokepoint.** Mitigation: content
  deletion emits an event the taxonomy library subscribes to for cleanup; orphans are inert on read; a
  periodic/boot reconcile sweeps them — never a brick, at worst a slow leak of dead join rows.
- **Destructive term merge losing history or corrupting counts.** Merge is a single transaction writing a
  `taxonomy_revisions` row capturing the pre-merge term metadata mapping (`fromTermId`→`intoTermId`); the
  `entry_terms_unique` index guarantees dedup when merging terms that already share content; counts are
  always derived from the reverse index, never cached-and-drifted. **Corrected by round-3 `/audit-work`
  (2026-07-14, TM-ADR-CONTENT-ADMIN-005 — Fable, Codex, and agy independently converged on this defect):
  merge is NOT reversible, and the original "(reversible narrative)" claim contradicted this ADR's own
  `entry_terms` non-recoverability disclosure above. When the merge's deduplication step drops an
  `entry_terms` row for content already assigned to both `fromTermId` and `intoTermId`, that dropped
  assignment is permanently lost — `taxonomy_revisions` records what the term metadata mapping was, not
  which individual `entry_terms` rows existed before the merge, so it cannot reconstruct them. This is the
  same accepted, disclosed loss of audit granularity `entry_terms` membership already carries generally;
  merge does not get a special exemption from it. Operators should be warned before merging that assignment
  history for deduplicated rows cannot be recovered.**
- **Hierarchy cycles.** A category set as its own ancestor. Mitigation: the write-service chokepoint
  checks for cycles before accepting a `parentId` update, enforcing a strict DAG.

## Consequences

- Ships independently of, and can land before, ADR-043's Collections engine.
- The soft polymorphic join means no database-enforced referential integrity between `entry_terms` and
  its content — an accepted, precedented tradeoff (see ADR-041), not an oversight.
- `post`/`page`'s taxonomy opt-in is a hardcoded allow-list, permanently for as long as they remain on the
  legacy `posts` table (corrected round-3 `/audit-work` fold — see §4) — a small, disclosed interim step
  pending any future migration ADR, not something ADR-043 shipping changes on its own.

## Round 1 audit fold (2026-07-14), amended by round 2

**Round 2 update:** Fable (in-host, round 2) found the entry_terms revisioning-exemption justification (below)
used a weak analogy — "reconstructable from itself" doesn't actually make a deleted assignment recoverable.
Reworded to state the real basis (accepted loss of audit granularity for high-churn state) plainly.

Audited under `TM-ADR-STORAGE-CONTENT-004` by three independent auditors (Codex gpt-5.6-terra/high, agy/Gemini 3.1
Pro High, Fable/Opus in-host). **Unanimous FAIL — the only one of the four audited ADRs all three auditors failed
independently.** agy and Fable independently found the identical namespace-collision defect by different reasoning
paths; Codex and Fable independently found different-but-related write-chokepoint gaps (workspace-scoping,
revisioning). This is the strongest convergent evidence in the whole audit run.

- **Fixed (this fold):** `entry_terms` writes were neither revisioned nor explicitly exempted from ADR-022 §4a,
  which names `entry_terms` directly — now explicitly narrowed with a stated justification (above), matching the
  `redirect_hits`/`asset_renditions` precedent.
- **Fixed (this fold):** namespace collision with ADR-043's `content_types.key` — resolved by ADR-043's
  reserved-key fix; this ADR's dependency on that fix is now stated explicitly (Wiring section).
- **Fixed (this fold):** no workspace-scoped validation on the term/content join — write chokepoint now required
  to validate same-workspace ownership before writing, with mandatory cross-workspace-rejection contract tests.
- **Fixed (this fold):** `parentId` hierarchy validation only checked cycles — now also requires same-taxonomy and
  hierarchy-mode (`parentId=null` for tags) validation.

## Open Questions

- Whether operator-defined custom taxonomies (beyond the seeded `category`/`tag`) are in scope for v1 or
  a later pass — the schema supports them (any `taxonomies` row), but the admin UI for defining new
  taxonomies (vs. just managing terms within `category`/`tag`) is not scoped here.
- Per-content-type taxonomy limits (e.g., max taxonomies per type) — not addressed.

## Process Note

Converged across all three participants and all three debate rounds — no Coordinator tie-break was
needed for this topic, unlike ADR-043.

```

## Auditor Instructions

Round 6 — act as a Compliance Inspector. Reconcile the ledger above (verify each `fixed` entry actually resolves what it claims), audit the 8 numbered diff items plus minimum context for behavioral effects, and separately confirm the two ADRs read coherently (no leftover markdown artifacts, no dangling cross-references to text that no longer says what an earlier fold claimed it says). Do not re-audit untouched sections for new issue classes; a finding not tied to the diff needs a `round_1_miss_justification`.

Return exactly ONE JSON object (no other JSON blocks) in this shape:

```json
{
  "threat_model_accepted": true,
  "rejection_reason": "",
  "auditor_scope_check": "what you audited, active scope/target, files reviewed, any mismatch",
  "ledger_updates": [{"id": "...", "verified": true, "note": "...", "causal_claim": "..."}],
  "findings": [{
    "id": "...", "severity": "blocker|high|medium|low",
    "in_scope_domain": "<allowlist domain 1-5 or null>",
    "adr": "ADR-043|ADR-044|cross-ADR",
    "diff_causal_link": "<which of the 8 numbered changes, or which ledger entry, this concerns>",
    "round_1_miss_justification": "<only if genuinely new, not tied to the diff>",
    "rationale": {"checked": "...", "expected": "...", "observed": "...",
                  "why_it_matters": "...", "recommended_fix": "...", "confidence": "high|medium|low"}
  }],
  "out_of_scope_fatal_warnings": [],
  "score": 0,
  "score_rationale": "one sentence",
  "blocking_gate": "PASS|FAIL — set FAIL if ANY validated blocker is unresolved OR score is below the contract score_floor (8.5)",
  "closure": "COVERAGE_COMPLETE — round-6 compliance coverage finished under TM-ADR-CONTENT-ADMIN-005; see blocking_gate for the pass/fail outcome."
}
```

Then prose: what looks solid; `Suggested Changes` + `Proposed File Changes` (patches mode) for anything you'd still change.

End your response with exactly: <<AUDIT_END>>
