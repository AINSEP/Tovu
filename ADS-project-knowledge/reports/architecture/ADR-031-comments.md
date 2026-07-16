# ADR-031: Comments — Bundled Tier-3 Plugin, Own Tables via Core-Mediated dataModule, Ingress-Gated Moderation Queue

- Status: ACCEPTED 2026-07-10 (autonomous Opus 4.8 sweep agent, design-only draft → cleared `/audit-work` gate: 3-round audit under `TM-admin-sweep-001`, Codex + Gemini/agy + Fable internal verifier; round 1 FAIL → Round-3 fold → round 2 FAIL (1 converged blocker) → Round-4 fold → round 3 unanimous PASS, scores 9.1-10.0, zero blockers)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **§3.5** (comments = Tier-3 bundled module `plugins/comments`, not a core library), **ADR-024** (delivered as the deliberate SDK stress test / demand plugin), **ADR-023** (first real consumer of the core-mediated plugin-own-tables path)
- Relates: ADR-021 (`authorize()` + flat `comments.*` strings), ADR-022 (attaches to `entries`; write-chokepoint + revision discipline), ADR-025 (comment widget + moderation panel origin isolation), ADR-026 (atomic status-flip + audit-log write), ADR-009 (hooks/outbox events), ADR-007 (workspace scoping), ADR-006 (`SpamCheckPort` rule-of-two), ADR-028 (settings), ADR-027 (depth/pattern benchmark — ingress-policy + trash→purge lineage)

## Context

Tovu needs comments: reader-authored notes attached to an entry, held in a moderation queue,
threadable, and defensible against spam. WordPress ships comments in core; a meaningful fraction of
sites disable them and Ghost dropped them entirely (§3.5). That fact is the whole placement argument
and the reason the brief names comments a **deliberate SDK stress test**: it is the smallest real
subsystem that exercises *every* extension seam at once — **plugin-owned relational tables** (ADR-023),
**typed hooks** (ADR-009/ADR-024 §7), a **contributed admin surface** (ADR-025), a **public write
ingress** with no operator session, and a **multi-table both-or-neither write** (ADR-026). If the SDK
can carry comments, it can carry the ecosystem; where it can't, comments surfaces the exact gap.

The governing constraints are inherited, not reopened: comments attach to ADR-022 `entries`; every row
is workspace-scoped (ADR-007); plugin data may exist only through the core-mediated dataModule path
(ADR-023) with never-brick recoverability; and no plugin JS — including the public comment widget —
may run same-origin with the operator session (ADR-025). This ADR is **design-only** (no peer debate,
no external audit); its open questions are written for the human's morning audit.

## Decision

### 1. Placement — Tier-3 *bundled* plugin `plugins/comments`, authored to the Tier-2 SDK contract

Comments ships **first-party, bundled, enabled-by-default but disableable**, living at `plugins/comments`
— **not** a Tier-2 core library. This is §3.5's placement rule applied literally: tier-2 is what ≥80% of
sites need and plugins build *on* (content, identity, media); tier-3 is what a meaningful fraction of
sites *disable or replace* (comments, feeds, search). Comments is squarely the latter.

The tier decision has two axes that must not be conflated (the ADR-024 lesson):

- **Trust tier it *runs* at, today: Tier-3.** Because ADR-024 §4 per-site isolation has not shipped, a
  bundled plugin executes **in-process with full machine access**. That is honest for *first-party*
  code (ADR-024 §1: "local / first-party / explicitly sideloaded"); it is **never listed in the public
  marketplace** (ADR-024 §2) and never marketed as sandboxed.
- **Contract it is *authored* to: Tier-2.** Comments is written using **only the SDK seams a
  third-party plugin will get** — dataModule declarations, serializable async hooks, a postMessage RPC
  admin panel — precisely so the SDK's gaps surface now (§3.5 dogfood rule: "if first-party code needs
  an escape hatch the SDK doesn't offer, the SDK is wrong — fix the SDK, don't take the hatch"). This
  makes comments the **concrete demand plugin** ADR-023 §12 says the dataModule engine should be built
  against, alongside the store checkout spike.

### 2. Data model — two plugin-owned tables via the ADR-023 core-mediated path

Comments declares its schema **as data** (`COMMENTS_DATA_MODULE`, `src/comments/types.ts`); **core alone
executes the DDL** (snapshot→`CREATE`, `src/features/plugins/data-module.ts`). The plugin never authors
a migration and never holds a raw DB handle (ADR-023 §2). Two tables under the reserved namespace
(ADR-023 §5):

- **`p_comments__comments`** — one row per comment: identity (`id` ULID), `workspace_id` (ADR-007),
  `entry_id` (the ADR-022 entry it attaches to), `parent_id` (threading), `thread_root_id` + `depth`
  (cheap subtree fetch + bounded nesting), `status`, author fields (`author_principal_id` nullable for
  anonymous, `author_name`, `author_email` PII-tagged, `author_url`, `author_ip_hash` — never a raw IP),
  `body_text` (sanitized by the core `text` library), `spam_score`/`spam_provider`, timestamps, and a
  `version` OCC counter (mirrors `posts.version`).
- **`p_comments__moderation_log`** — append-only moderation audit (`comment_id`, `actor_principal_id`,
  `action`, `from_status`→`to_status`, `at`, `note`).

**Why a log table instead of entry revisions.** A comment is not an ADR-022 entry — attaching it to the
`entries` revision spine would drown editorial history in machine status flips. Instead comments carry
their own append-only log, the same move ADR-027 §2 makes for its media sidecars: *narrow the
revision-per-write discipline for operational writes, but keep attribution*. The comment body itself is
lightly versioned (`version`), and full body-revision history is a named deferral (§8).

**Referential integrity is chokepoint-validated, not FK-enforced (v1).** `entry_id` and `parent_id` are
validated against core `entries` / sibling comments **at the typed write chokepoint** — the current
dataModule seam materializes columns only. See OQ-1.

### 3. Writes are typed and core-owned; the status flip is one ADR-026 atomic envelope

All comment writes go through `CommentRepoPort` (`src/comments/ports.ts`) — the typed, core-owned
repository ADR-023 §7 requires, so the ADR-022 chokepoint (revision + `pluginId` attribution) is
preserved and no raw plugin write SQL exists. `applyModeration()` flips a comment's status **and**
appends its `moderation_log` row as **one all-or-nothing unit** — exactly the multi-table,
both-or-neither invariant ADR-026's write envelope exists for (core executes it in a single
transaction; the plugin never holds a tx handle). **Bulk moderation** (approve/spam N selected) is one
envelope over N ops, all-or-nothing. Conflicts return as serializable data (`{ ok: false, reason:
"conflict", currentVersion }`), never a thrown live object (ADR-024 §3).

### 4. Public submission is a core-mediated ingress, not an `authorize()` call

Anonymous visitors are **not principals** and do not fit ADR-021 RBAC. So the public write path is a
single **`CommentIngressPolicy`** — the direct analogue of ADR-027's one `MediaIngressPolicy` — the only
route a hostile visitor can reach. It enforces, in order: comments-enabled + entry-open + parent-exists
+ depth-cap (ADR-028 settings); **rate-limit** by `author_ip_hash` (salted, raw IP never stored);
**honeypot** + body size cap + link cap; **sanitization** via the core `text` library; then **spam
classification** (§5). The result is a `pending` row (or `spam` when the score exceeds
`spamAutoRejectScore`). **Spam is stored silently, never rejected at the boundary** — a rejection is an
oracle a spammer tunes against. `comments.submit` exists as a capability so a future member-only mode
can gate it, but the anonymous path is ingress-governed, not `authorize()`-gated.

**Moderation actions, by contrast, ARE `authorize()`-gated** operator mutations through the ADR-018
command gateway with flat `comments.*` strings (§6).

### 5. Anti-spam seam — `SpamCheckPort` (ADR-006 rule-of-two)

Spam checking is a **port with two plausible adapters, one built now** (ADR-006): a **local heuristic
adapter** (keyword/link-ratio/rate signals — no network, ships now) and an **external-service adapter**
(Akismet/OOPSpam-style, plausible next). `check()` is async + serializable (ADR-024 §3); a network-backed
adapter's egress is a **core-mediated capability, never a raw `fetch` from plugin code** (ADR-025 §3).
The port also carries an optional `report()` for moderator ham/spam corrections (Akismet feedback; no-op
locally). Classification attaches at the `comments.beforeSubmit` hook so it composes with other filters.

### 6. Authorization — flat `comments.*` strings (ADR-021 §3), one catalog

Moderation is governed by flat dotted permission strings registered in the code-side catalog (ADR-021
§3), enforced by `authorize()` at the gateway:

`comments.read`, `comments.moderate` (approve / spam / trash / restore), `comments.reply` (operator
reply), `comments.delete` (trash), `comments.delete.force` (purge), `comments.submit` (public/member
submission gate), `comments.configure` (settings). The four seed roles map naturally
(viewer→`read`; editor→`read`+`moderate`+`reply`; admin adds `delete.force`+`configure`; owner `*`).
Capabilities stay a **separate axis** from these human permissions (ADR-021 §1) — the plugin's
`dataModule`, `ui.adminPanel`, and network capabilities are enforced at the SDK boundary, not through
`authorize()`.

### 7. Origin isolation — widget AND moderation panel (ADR-025)

Both pieces of comment client JS run **cross-origin, cookie-less, sandboxed** (ADR-025 §1):

- **Public comment widget** — served origin-isolated so that when a logged-in *operator* views the
  public site, the widget's JS has no admin session to steal. It submits through the core
  `CommentIngressPolicy` public route (a plain form POST / mediated RPC), never a same-origin admin
  `fetch`. Strict CSP with `connect-src` locked (ADR-025 §3).
- **Admin moderation panel** — a sandboxed iframe (ADR-025 §1) talking to core only via `postMessage`
  RPC; every privileged verb (approve/spam/delete) is a **capability-gated, `authorize()`-checked** RPC
  the host mediates (ADR-025 §2/§4), aligned with the ADR-024 §3 serializable ABI.

### 8. Hooks + events (ADR-009)

- **Typed hook points** (declared owner + signature; ADR-009 §3, ADR-024 §7 async/serializable/
  explicit-priority/fail-closed): `comments.beforeSubmit` (filter — transform or veto; spam adapters
  attach here) and `comments.statusChanged` (action).
- **Outbox domain events** (async side effects; ADR-009 §2): `comments.submitted`, `comments.approved`,
  `comments.marked_spam`, `comments.trashed`, `comments.purged` — consumed for author notification (the
  core `MailerPort`, §3.5), rendered-page cache invalidation, and search/AI-memory feeds. Handlers stay
  idempotent (outbox retries, ADR-009).

### 9. Never-brick — trash→purge ladder + retain-on-uninstall

Deletion is a ladder mirroring ADR-027 §5: **trash** (soft, logged, `comments.delete`) → **purge**
(hard, `comments.delete.force`). Disabling or uninstalling the comments plugin **retains its tables and
rows** (ADR-023 §6); re-enable reconciles against retained data; purge is the only destructive act and
is separate + explicit. Recoverability is unconditional (core snapshots before any DDL, ADR-023 §4/§0).

### 10. v1 scope

**IN v1:** the two plugin tables via the dataModule path; typed core-owned writes; threaded read +
moderation queue (keyset-paginated); the `CommentIngressPolicy` (rate-limit + honeypot + caps +
sanitize + spam); `SpamCheckPort` heuristic adapter (+ external adapter named); flat `comments.*` +
gateway wiring; the two hook points + five outbox events; ADR-026 atomic status-flip+log write; trash→
purge ladder; origin-isolated widget + moderation panel; `authorize()`-gated moderation.

**DEFERRED (each a named seam):** full comment-body revision history (OQ-4); denormalized approved-count
column (the ADR-026 seam is reserved; v1 counts by query); the external `SpamCheckPort` adapter; member-
only / social-login commenting; comment reactions/votes; email-reply-to-comment ingestion; the dataModule
index/FK declaration the schema needs (OQ-1 — an SDK gap, not a comments feature).

## Consequences

- **The SDK is stress-tested against a real subsystem, not a toy.** Comments drives ADR-023 (own
  tables), ADR-026 (atomic multi-write), ADR-025 (contributed UI), ADR-009 (hooks/events), and ADR-021
  (permissions) simultaneously — and OQ-1 is a concrete SDK gap the exercise surfaced, exactly as the
  dogfood rule intends.
- **Never-brick holds** — the only irreversible act (purge) is explicit + permissioned; DDL is
  core-executed and snapshot-anchored; uninstall retains data.
- **One ingress + one origin story** — the public write path reuses ADR-027's ingress-policy pattern and
  ADR-025's origin isolation rather than inventing comment-specific variants.
- **A visible tension with `admin-sitemap.md`** (it lists `features/comment` / `admin.comments.*` under
  a core "content" home) is left for reconciliation (OQ-2) — this ADR does not edit that doc.

## Open

- **OQ-1 (SDK gap — the headline stress-test finding).** The v1 dataModule seam
  (`data-module.ts` `ColumnDecl`) declares only name/type/notNull/primaryKey. Comments needs **composite
  indexes** (`workspace_id, entry_id, status`; `thread_root_id`), a **self-referential `parent_id`**, and
  the **`(workspace_id, id)` composite FK to `entries`** (ADR-021 §4). Options: (a) grow the seam's
  declaration grammar with core-provisioned indexes/declared-FKs (ADR-023 §2 already says "declared FKs");
  (b) rely on ADR-022 expression indexes on a JSON projection instead. Recommend (a) — it is the demand
  ADR-023 §12 wants to build the engine against. **This must not be silently worked around.**
- **OQ-2 (doc reconciliation).** `admin-sitemap.md` (line 86) and `admin-section-architecture-outline.md`
  predate the §3.5 tier decision and place comments as `features/comment` core. Reconcile to
  `plugins/comments` / bundled-plugin, or record why the sitemap stays as-is. (Flagged, not edited.)
- **OQ-3 (anonymous author identity vs ADR-021).** Anonymous commenters are non-principals; the ingress
  is their only authority. Confirm this is the intended model (vs. seeding a `public`/`anonymous`
  principal) so the `moderation_log.actor_principal_id` on an ingress auto-classification (`system`) is
  well-defined.
- **OQ-4 (comment-body edit history).** v1 lightly versions the body (`version`) with no full history.
  Decide whether comment edits need the append-only completeness ADR-022 §4b gives entries, or whether
  operational logging is sufficient.
- **OQ-5 (spam auto-reject threshold governance).** `spamAutoRejectScore` silently files to `spam`.
  Confirm the default and whether it belongs in ADR-028 settings with an audit trail on change.

## Record

Design-only sweep artifact (autonomous Opus 4.8), no peer debate and no external audit — the depth/
structure bar was ADR-027 (media) and ADR-022 (content model). Companion design report:
`ADS-project-knowledge/reports/section-designs/20260710-comments-design.md`. Typed interfaces:
`src/comments/types.ts` + `src/comments/ports.ts` (compile clean against the real repo types;
`COMMENTS_DATA_MODULE satisfies DataModuleDecl`). **Owes a peer debate + external audit before ACCEPTED.**

**Note:** this Record section's "owes a peer debate + external audit before ACCEPTED" line is
inconsistent with this ADR's own header Status line (which already records the round-3
`TM-admin-sweep-001` audit PASS as of 2026-07-10) — a pre-existing inconsistency in this document,
not introduced or resolved by the implementation status note below; flagged here rather than
silently left for a future reader to trip over.

**v1 backend status (2026-07-16, SPEC-033): built and tested.** §10's IN-v1 list is implemented
except the two pieces explicitly named as blocked-on-missing-infrastructure: the origin-isolated
widget + moderation panel (§7, no ADR-025 host exists yet) and author-notification email (§8,
round-3 fold's own verified-recipient requirement has no consent-challenge flow to satisfy it
against). OQ-1 (dataModule index grammar) is RESOLVED — `TableDecl` now supports declared composite
indexes; `COMMENTS_DATA_MODULE` declares the moderation-queue and thread-lookup indexes this design
needs. The round-3 fold's blocking condition ("Comments' two tables have no available creation path
in v1... do not treat this ADR as Wave-2-ready until [the ADR-023 engine ships]") is satisfied —
SPEC-032 (2026-07-16) made that engine real. Full record: `ADS-project-knowledge/specs/033-comments-v1-backend/feature.spec.md`.

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-031 + round-2. PROPOSED; owes per-ADR audit.
- **Dependencies:** proceed once ADR-023 grammar-growth + ADR-026 land (+ ADR-025 for the widget/panel UI).
- Pin the anonymous-ingress `system` actor as a **seeded principal ULID**.
- **Round-2 (GDPR erasure):** Comments stores member-attributed PII → implement a `principal.erasure.requested` handler (decisions §E) that anonymizes/purges on receipt.
- **Permission namespace:** `feature.comments.post` (runtime) / `admin.comments.moderate` (management).
- **Wave 2.**

---

## Round-3 audit fold (TM-admin-sweep-001, 2026-07-10)
External audit found the plugin-owned-tables Wave gate understates what ADR-023 actually requires, and found the public-ingress-sourced author-notification email is an unguarded abuse vector. Folded:

1. **dataModule gate corrected (Codex AS-002 — BLOCKER fix).** The "proceed once ADR-023 grammar-growth... lands" gate is corrected: ADR-023 v1 does not merely lack the grammar — it **actively rejects every `dataModule` declaration** until its reconciliation/backfill engine ships (ADR-023 §12). Comments' two `p_comments__*` tables therefore have **no available creation path in v1** under the current ADR-023 text. This ADR's Wave-2 readiness is gated on **whichever comes first**: (a) ADR-023's reconciliation engine shipping, or (b) a fully specified first-party, core-executed interim table-creation path (with its own snapshot-before-DDL, write-chokepoint, and re-home-to-plugin-DDL rule) added to this ADR by name. Neither exists today; do not treat this ADR as Wave-2-ready until one does.
2. **Notification mail gated on verified recipients (Fable F7).** §8's "author notification (the core `MailerPort`)" is corrected: import ADR-037 (`sourceContext:{module:'comments'}`, required `idempotencyKey`). Notification mail is sent **only** to a verified recipient — a member-attributed commenter, or an anonymous `author_email` **after** a confirm-link challenge (reusing the Members/D1c consent-challenge shape) — default OFF for unconfirmed anonymous addresses. Without this, an anonymous visitor can enter a victim's address as `author_email` and farm reply-notification emails at them through the public, rate-limited-but-otherwise-open ingress — a backscatter/abuse channel ADR-037's suppression ledger only helps *after* a complaint, not before.
