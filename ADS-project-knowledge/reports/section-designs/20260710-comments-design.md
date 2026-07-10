# Comments — Section Design (bundled Tier-3 plugin, SDK stress test)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; **no peer debate, no external audit** — owes both before the companion ADR is ACCEPTED)
- Companion ADR: `ADR-031-comments.md`
- Typed interfaces: `src/comments/types.ts`, `src/comments/ports.ts` (compile clean; `COMMENTS_DATA_MODULE satisfies DataModuleDecl`)
- Depth bar: ADR-027 (media) + ADR-022 (content model)

---

## 1. Competitor-lite orientation

Grounded in the corpus (`other-repos-specs/wordpress_specs/wp-includes/comments.md`,
`.../wp-admin/comments-admin.md`, `.../wp-root-original-specs/wp-comments-post.md`) plus general
knowledge of the category. Not a deep mine — enough to place the decisions.

| System | How comments work | What Tovu should take / avoid |
|---|---|---|
| **WordPress** | Comments in **core**, one `wp_comments` table + `wp_commentmeta` EAV; `comment_approved` is an overloaded flag (`0`/`1`/`spam`/`trash`/`hold`); public POST to `wp-comments-post.php`; Akismet is the near-universal anti-spam plugin; threading via `comment_parent` + a `comment_type`. | **Take:** the moderation-state machine, threading by parent, Akismet-as-pluggable. **Avoid:** comments in *core* (many sites disable), `commentmeta` EAV (Tovu's whole content-model thesis is "no meta swamp", ADR-022), the overloaded approval flag (Tovu uses an explicit `status` enum). |
| **Ghost** | **Dropped native comments**, then re-added a minimal members-only comment system; heavily rate-limited, member-identity-based, no anonymous. | **Take:** the strongest evidence for §3.5's "meaningful fraction disable/replace → tier-3" placement; the member-identity path as a *deferred* mode. |
| **Disqus / Commento / Hyvor** | Third-party embedded widget on a **separate origin**, iframe-isolated, talks back over its own API; moderation dashboard is a separate app. | **Take:** the origin-isolated widget model is exactly ADR-025 — Tovu gets it "for free" from an accepted boundary rather than a bespoke embed. |
| **Directus** | Activity/comments/notifications/revisions as first-class collections with an audit trail (`.../activity-comments-notifications-and-revisions.md`). | **Take:** the append-only moderation/audit-log instinct (Tovu's `p_comments__moderation_log`). |

**The one-line reading:** comments is a *solved* domain with a clear state machine and a clear
anti-spam seam — its value here is not novelty but that it touches every Tovu extension seam at once,
which is why the brief makes it the SDK stress test.

---

## 2. Tier rationale (§3.5)

**Decision: Tier-3 bundled plugin `plugins/comments`, authored to the Tier-2 SDK contract.**

§3.5's placement rule is a two-line test: *tier-2 = what ≥80% of sites need and plugins build on
(content, identity, media, routing, settings); tier-3 = what a meaningful fraction of sites disable or
replace (comments, feeds, search); when in doubt, start as a bundled plugin — promotion to core is
easy, demotion is a breaking change.* Comments fails the tier-2 test on both clauses (a large minority
disable it; nothing else builds *on* comments) and §3.5 already names `plugins/comments` in the tier-3
row. So the placement is not a judgment call — it's reading the rule.

The subtle part is the **two axes of "tier"** (the ADR-024 lesson, made explicit so the audit can check
it):

- **Runs at Tier-3 today** — in-process, full machine access — because ADR-024 §4 per-site isolation
  hasn't shipped. That's honest for *first-party* bundled code (ADR-024 §1) and it is **never listed in
  the public marketplace** (ADR-024 §2). "Bundled" = shipped-with-core = first-party, so Tier-3 is the
  correct *current* trust level, not a compromise.
- **Authored to the Tier-2 contract** — built with only the SDK seams a third-party plugin gets
  (dataModule, serializable async hooks, postMessage RPC panel). This is the point: it makes the SDK's
  gaps *visible now* (§3.5 dogfood rule) and makes comments the **concrete demand plugin** ADR-023 §12
  wants the dataModule engine built against, next to the store-checkout spike.

If these axes are conflated — "it's Tier-3, so just reach into core directly" — the stress test is
defeated and the SDK never gets exercised. The design deliberately refuses the in-process escape hatch.

---

## 3. The design in prose

A comment is a small reader-authored record attached to an ADR-022 `entry`. It is **not** an entry
itself — attaching it to the entry revision spine would bury editorial history under status churn — so
comments live in their own two plugin-owned tables, declared as data and created by core through the
ADR-023 dataModule path (`src/features/plugins/data-module.ts`): `p_comments__comments` (the comments)
and `p_comments__moderation_log` (an append-only audit of every status flip). Every row carries
`workspace_id` (ADR-007); identity is a ULID; a `version` column gives optimistic concurrency exactly
as `posts.version` does.

**Threading** is a `parent_id` self-reference plus a denormalized `thread_root_id` + `depth`, so the
widget fetches a whole thread with one indexed range read and enforces a depth cap without recursion.
**Moderation** is an explicit four-state machine — `pending → approved`, `pending → spam`,
`approved → trash`, `trash → (restore | purge)` — never WordPress's overloaded approval flag. Trash is
soft and logged; purge is the single destructive act, separately permissioned. Disable/uninstall
retains the tables (ADR-023 §6); recoverability is unconditional because core snapshots before any DDL
(ADR-023 §4).

Two write paths, deliberately asymmetric:

1. **Public submission** — a visitor is not a principal, so this cannot ride `authorize()`. It enters
   the single **`CommentIngressPolicy`** (the direct analogue of ADR-027's `MediaIngressPolicy`): the
   only route a hostile visitor can reach, enforcing enabled/open/parent/depth checks, IP-hash
   rate-limit (raw IP never stored), honeypot, body-size + link caps, sanitization via the core `text`
   library, then spam classification. It writes a `pending` row — or `spam` when the score crosses
   `spamAutoRejectScore`. **Spam is stored silently, never rejected at the boundary**, because a
   rejection is an oracle a spammer tunes against.
2. **Operator moderation** — this *is* `authorize()`-gated through the ADR-018 command gateway with flat
   `comments.*` strings. A status flip writes the comment row **and** its `moderation_log` row as one
   ADR-026 atomic envelope (core executes both-or-neither in one transaction; the plugin never holds a
   tx handle). Bulk moderation is one envelope over N ops.

**Anti-spam** is a real ADR-006 port — `SpamCheckPort` with a local heuristic adapter shipping now and
an external Akismet-style adapter as the named second adapter. Classification attaches at the
`comments.beforeSubmit` hook so it composes with other filters, and a network-backed adapter's egress is
a core-mediated capability, not a raw plugin `fetch` (ADR-025 §3).

**Client JS is origin-isolated on both ends** (ADR-025): the public widget is served cookie-less and
cross-origin so an operator browsing the public site can't have their admin session stolen by comment
JS, and the admin moderation panel is a sandboxed iframe talking to core only over capability-gated,
`authorize()`-checked `postMessage` RPC verbs. **Async side effects** ride the outbox (ADR-009 §2):
`comments.submitted/approved/marked_spam/trashed/purged` drive author notification via the core
`MailerPort`, page-cache invalidation, and search/AI-memory feeds.

---

## 4. Alternatives considered

- **Comments as a core library (tier-2).** Rejected on the §3.5 rule (large minority disable; nothing
  builds on it) and because demotion later is a breaking change while promotion is cheap.
- **Comments as `entries` (content-type-as-data, ADR-022).** Tempting — free revisions/taxonomy/refs.
  Rejected: (a) it would route reader-authored, spam-prone, high-volume writes through the editorial
  content chokepoint and revision spine; (b) it hides the *whole point* — the brief wants the
  **own-tables** exercise (ADR-023), and modeling comments as entries dodges it. The `moderation_log`
  captures the audit need without the entry-revision weight (the ADR-027 §2 sidecar move).
- **Anti-spam as an inline heuristic, no port.** Rejected: it fails ADR-006 rule-of-two by pretending
  there's only one implementation when Akismet is the obvious, real second adapter, and it would bury a
  network call inside plugin code instead of a core-mediated capability.
- **Public submission gated by a seeded `anonymous` principal + `authorize()`.** Considered; deferred as
  OQ-3. The ingress-policy model matches ADR-027 and keeps anonymous writes off the RBAC evaluator, but
  the actor identity on an ingress auto-classification needs the human to confirm the `system`-actor
  convention.
- **Threading via a recursive CTE only (no `thread_root_id`/`depth`).** Rejected for v1: the
  denormalized root+depth gives one-read thread fetch and a cheap depth cap; the current dataModule seam
  can't even declare the index a CTE-heavy read would need (OQ-1), so denormalization is also the
  pragmatic choice.
- **Denormalized `approved_count` on the entry.** Deferred: v1 counts by query. The ADR-026 envelope is
  the reserved seam for when "approve + increment count" must be atomic.

---

## 5. Implementation proposal

### 5.1 Phased plan

- **Phase 0 — seams + types (this sweep).** `src/comments/types.ts` + `ports.ts` land as
  interface/type-only files, compiling against the real repo (`DataModuleDecl`, `core/ports`). No
  behavior. This is the artifact of the design pass.
- **Phase 1 — read path + tables.** Declare `COMMENTS_DATA_MODULE` through `declareDataModule`
  (core-executed, snapshot-anchored); implement `InMemoryCommentRepo` + `SqliteCommentRepo` (rule-of-
  two); threaded read for the widget; register `comments.*` in the permission catalog. **Blocked on
  OQ-1** for real indexes/FKs (interim: column-only + app-side validation).
- **Phase 2 — ingress + moderation.** `CommentIngressPolicy` (rate-limit + honeypot + caps + sanitize);
  `HeuristicSpamCheck`; `applyModeration` as an ADR-026 envelope; gateway wiring for operator actions;
  the `comments.beforeSubmit` / `comments.statusChanged` hook points + the five outbox events.
- **Phase 3 — surfaces (blocked on ADR-025 host).** Origin-isolated public widget + sandboxed admin
  moderation panel with the postMessage RPC verb subset (`list`, `approve`, `spam`, `trash`, `restore`).
  AI moderation tools (`comments.search`, `comments.moderate` HITL) as clients of the *same* gateway
  handlers (no back door — §3.5 dogfood).
- **Phase 4 — deferred adapters.** External `SpamCheckPort` adapter; member-only mode; body-revision
  history; reactions/votes; email-reply ingestion.

### 5.2 `src/` modules to add

```
src/comments/
  types.ts            # [Phase 0 ✓] row/domain types + COMMENTS_DATA_MODULE (schema-as-data)
  ports.ts            # [Phase 0 ✓] CommentRepoPort, SpamCheckPort, CommentIngressPolicy, hooks, events
  index.ts            # [Phase 1] public surface (ADR-009 §1 module boundary)
  comments.ts         # [Phase 1/2] submit/moderate application logic (no raw SQL)
  ingress.ts          # [Phase 2] CommentIngressPolicy implementation
  spam.heuristic.ts   # [Phase 2] SpamCheckPort local adapter (ships now)
  spam.external.ts    # [Phase 4] SpamCheckPort Akismet-style adapter (named 2nd adapter)
  repo.memory.ts      # [Phase 1] InMemoryCommentRepo (rule-of-two adapter A)
  repo.sqlite.ts      # [Phase 1] SqliteCommentRepo over the dataModule tables (adapter B)
  __specs__/comments-moderation.spec.md
```

### 5.3 Schema / DDL sketch

Declared as data (`COMMENTS_DATA_MODULE`), executed by core. The **column set** below is what the v1
seam can express today; the **indexes + FKs** are what the design needs and the seam cannot yet declare
(OQ-1 — the headline SDK gap).

```sql
-- p_comments__comments  (namespace ADR-023 §5)
CREATE TABLE p_comments__comments (
  id                  TEXT PRIMARY KEY,          -- ULID
  workspace_id        TEXT NOT NULL,             -- ADR-007
  entry_id            TEXT NOT NULL,             -- → entries (chokepoint-validated; FK is OQ-1)
  parent_id           TEXT,                      -- threading self-ref (FK is OQ-1)
  thread_root_id      TEXT NOT NULL,
  depth               INTEGER NOT NULL,
  status              TEXT NOT NULL,             -- pending|approved|spam|trash
  author_principal_id TEXT,                      -- null = anonymous
  author_name         TEXT NOT NULL,
  author_email        TEXT,                      -- PII-tagged
  author_url          TEXT,
  author_ip_hash      TEXT,                      -- salted hash; never a raw IP
  body_text           TEXT NOT NULL,             -- sanitized (core `text` lib)
  spam_score          REAL,
  spam_provider       TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  version             INTEGER NOT NULL
);
-- p_comments__moderation_log (append-only audit)
CREATE TABLE p_comments__moderation_log (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL,
  comment_id          TEXT NOT NULL,
  actor_principal_id  TEXT NOT NULL,             -- 'system' for ingress auto-classify (OQ-3)
  action              TEXT NOT NULL,             -- submit|approve|mark_spam|unspam|trash|restore|purge
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  at                  TEXT NOT NULL,
  note                TEXT
);

-- NEEDED, NOT YET DECLARABLE via the seam (OQ-1 — core-provisioned):
--   CREATE INDEX idx_comments_queue   ON p_comments__comments (workspace_id, status, created_at, id);
--   CREATE INDEX idx_comments_thread  ON p_comments__comments (workspace_id, entry_id, thread_root_id, id);
--   composite (workspace_id, id) FK entry_id → entries (ADR-021 §4);  self-FK parent_id.
```

### 5.4 Permission strings (flat, ADR-021 §3)

`comments.read` · `comments.moderate` · `comments.reply` · `comments.delete` (trash) ·
`comments.delete.force` (purge) · `comments.submit` (public/member gate) · `comments.configure`.
Seed-role mapping: viewer→`read`; editor→`read,moderate,reply`; admin→+`delete.force,configure`;
owner→`*`. Plugin capabilities (`dataModule`, `ui.adminPanel`, network) stay a **separate axis**
(ADR-021 §1), enforced at the SDK boundary — not through `authorize()`.

### 5.5 Hooks + events

- Hook points (declared owner + typed signature; async/serializable/priority/fail-closed — ADR-024 §7):
  `comments.beforeSubmit` (filter — spam + custom vetoes attach here), `comments.statusChanged` (action).
- Outbox events (ADR-009 §2, workspace-stamped, idempotent handlers): `comments.submitted`,
  `comments.approved`, `comments.marked_spam`, `comments.trashed`, `comments.purged`.

### 5.6 v1 scope cut + named deferred seams

**IN:** two dataModule tables; typed core-owned writes; threaded read + keyset moderation queue;
`CommentIngressPolicy`; `HeuristicSpamCheck`; ADR-026 atomic status-flip+log; flat `comments.*` +
gateway; two hooks + five events; trash→purge ladder; origin-isolated widget + panel.

**DEFERRED (named seams):** external `SpamCheckPort` adapter · member-only / social-login commenting ·
full comment-body revision history (OQ-4) · denormalized approved-count (ADR-026 seam reserved) ·
reactions/votes · email-reply ingestion · **the dataModule index/FK declaration grammar the schema
needs (OQ-1 — an SDK gap, tracked as core work, not a comments feature)**.

---

## 6. Top open questions for the human audit

1. **OQ-1 — SDK gap (headline).** The dataModule seam declares columns only; comments needs
   core-provisioned composite indexes + the `(workspace_id,id)` FK to `entries` + a `parent_id` self-FK.
   Grow the seam grammar (recommended — the ADR-023 §12 demand) or fall back to ADR-022 expression
   indexes on a JSON projection? Must not be silently worked around.
2. **OQ-2 — doc reconciliation.** `admin-sitemap.md`/`admin-section-architecture-outline.md` place
   comments as `features/comment` core; §3.5 + this design say `plugins/comments`. Reconcile (not edited
   here).
3. **OQ-3 — anonymous author identity.** Ingress-only authority for non-principal visitors vs a seeded
   `anonymous` principal; pins the `system` actor convention on ingress auto-classification.
4. **OQ-4 — comment-body edit history.** Light `version` vs full append-only history (ADR-022 §4b) for
   edited comments.
5. **OQ-5 — spam auto-reject governance.** Default `spamAutoRejectScore` + whether it lives in ADR-028
   settings with a change audit trail.
