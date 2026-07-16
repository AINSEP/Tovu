# Feature Spec: Comments v1 Backend (ADR-031)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-033 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-033-comments-v1-backend |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed — v1 backend only, not the full ADR-031 v1 list)

ADR-031's round-3 audit fold named its Wave-2 blocking condition explicitly: Comments' two tables
have no creation path until ADR-023's engine ships or an interim path is specified. SPEC-032
(2026-07-16) closed that — the engine is real. This spec builds the backend surface ADR-031 §10
lists as v1, MINUS the two pieces this session cannot responsibly build right now:

- **Origin-isolated widget + moderation panel (§7, ADR-025).** Investigated: ADR-025 is ACCEPTED
  but its origin-isolation HOST (sandboxed iframe + postMessage RPC infrastructure) does not exist
  anywhere in this codebase yet — there is nothing to build the widget/panel against. Deferred
  until that host exists; the backend routes this spec builds are the origin-isolated widget's
  eventual data source, unaffected by when the UI itself lands.
- **Author-notification email (§8, round-3 fold item 2).** The fold's own requirement is that
  notification mail must be gated on a verified recipient (member-attributed, or a confirmed
  anonymous email via a challenge flow) — that confirm-link challenge infrastructure does not
  exist. Rather than build a half-safe notification path, this spec wires the
  `comments.statusChanged`/outbox events (the seam future notification logic needs) but does NOT
  send any notification email in v1 — the safe default the fold itself names ("default OFF for
  unconfirmed anonymous addresses").

Also explicitly out of v1 per ADR-031 §10 itself (unchanged, not this spec's decision):
external `SpamCheckPort` adapter, member-only/social-login commenting, reactions/votes,
email-reply ingestion, full comment-body revision history (OQ-4). The GDPR erasure handler
(round-2 fold) is also deferred — disclosed, not silently dropped, matching every other deferred
item's treatment: no `principal.erasure.requested` handler infrastructure exists anywhere else in
this codebase yet for this spec to hook into.

OQ-1 (dataModule index grammar) is RESOLVED as part of this spec — see the dataModule engine
changes below.

## Problem Statement

**Current state:** `src/comments/ports.ts`/`types.ts` fully specify the contracts (a prior
sweep-agent design pass, ACCEPTED via 3-round audit). No implementation exists — no adapters, no
ingress policy, no write-service, no routes, no permission catalog entries, no capability
inventory entry.

**Desired state:** a working, tested Comments backend: visitors can submit comments through a
rate-limited, spam-checked, sanitizing public ingress; operators can read a threaded view and a
paginated moderation queue and take moderation actions (approve/spam/trash/restore/purge) through
an authorize()-gated admin surface; every moderation action is atomically logged.

## Requirements

- REQ-01 (dataModule grammar): `data-module.ts`'s `TableDecl` gains an optional
  `indexes: readonly IndexDecl[]` (`{ name, columns, unique? }`); validated (referenced columns
  must be declared) and DDL-executed alongside the table's own `CREATE TABLE`, in the same
  transaction. `COMMENTS_DATA_MODULE` declares the moderation-queue and thread-lookup indexes.
- REQ-02: `CommentRepoPort` gets an in-memory adapter (`repo.memory.ts`) and a SQLite adapter
  (`repo.sqlite.ts`, over the two `p_comments__*` tables via the dataModule-declared schema).
  `applyModeration` is one atomic transaction: OCC-guarded status UPDATE + `moderation_log` INSERT,
  both-or-neither (mirrors the SQLite adapter's own established OCC convention — see
  `store-plugin.ts#checkout`).
- REQ-03: `SpamCheckPort` gets a local heuristic adapter (`spam.heuristic.ts`) — no network:
  keyword list, link-count ratio, body-length signal, combined into a `[0,1]` score.
- REQ-04: `CommentIngressPolicy` (`ingress.ts`) enforces, in order: comments-enabled + entry-open +
  parent-exists + depth-cap; rate-limit by `authorIpHash`; honeypot + body-size cap + link cap;
  sanitization (a comments-scoped sanitizer — no shared core `text` library exists in this
  codebase to reuse, see Non-Goals); spam classification via `comments.beforeSubmit`. Spam is
  stored silently (`status: "spam"`), never rejected at the boundary.
- REQ-05: a hook registry (`hooks.ts`, mirroring `newsletter/hooks.ts`'s factory-not-singleton
  shape) for `comments.beforeSubmit`/`comments.statusChanged`, fail-closed on a throwing handler.
- REQ-06: `comments.*` permissions registered in `identity/permissions.ts`: `read`, `moderate`,
  `reply`, `delete`, `delete.force`, `submit`, `configure`.
- REQ-07: outbox domain events (`comments.submitted`, `.approved`, `.marked_spam`, `.trashed`,
  `.purged`) emitted via the existing `OutboxPort`/`DomainEvent` convention on every relevant
  write.
- REQ-08: HTTP routes — a public `POST /api/site/comments` (ingress-gated, no session), and
  authenticated admin routes for the moderation queue (`GET`) and each moderation action
  (`POST .../approve`, `/spam`, `/trash`, `/restore`, `/purge`), each `authorize()`-gated on its
  matching `comments.*` permission, mirroring this session's established admin-route shape
  (workspace-id 404 check → `authorize()` → 403-on-denial).
- REQ-09: `capability-inventory.ts` gains a `comments` entry (`hasDurableAdapter: true` once wired
  to the SQLite adapter in `server/deps.ts`).

## Acceptance Criteria

- AC-01 (REQ-01) — covered by SPEC-033's `data-module-indexes.test.ts` (already passing before
  this doc; listed here for completeness of the acceptance record).
- AC-02 (REQ-02) [P1]: a shared contract-test suite runs every `CommentRepoPort` method against
  both adapters; `applyModeration`'s conflict path (`expectedVersion` mismatch) returns
  `{ ok: false, reason: "conflict" }` on both, never throws; a successful call's comment-row update
  and moderation_log insert are proven atomic (a forced mid-write failure leaves neither applied).
- AC-03 (REQ-03) [P1]: the heuristic adapter scores an obvious spam submission (many links, spam
  keywords) above a normal one; `report()` is a documented no-op.
- AC-04 (REQ-04) [P1]: each ingress rejection reason is independently triggerable
  (comments-disabled, entry-closed, parent-not-found, max-depth-exceeded, rate-limited,
  body-too-large, too-many-links, honeypot-tripped); a spam-scored submission still returns
  `ok: true` with `autoClassified: "spam"`, never a rejection.
- AC-05 (REQ-02/REQ-08) [P1]: an end-to-end route test proves a public submission reaches
  `pending`, an operator with `comments.moderate` can approve it (queue count moves), and a
  principal without that grant gets 403.
- AC-06 [P2]: the full pre-existing test suite is unaffected (regression gate, same as every prior
  slice this session).

## Non-Goals

See Scope Note. Additionally: no shared core `text`/sanitization library is built here —
`ingress.ts`'s sanitizer is comments-scoped (strips HTML tags, escapes entities, caps link count)
and explicitly NOT presented as the "core `text` library" ADR-031 §2/§4 references, because that
library does not exist anywhere else in this codebase for this spec to extract into. If a future
feature needs the same sanitization, extracting a shared library then is a real refactor with two
real consumers — not a speculative one now.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency; sanitization is a small, bounded regex/string pass, not a hand-rolled HTML parser. |
| II — Test-First | COMPLIES | Contract suite + ingress rejection-reason suite + spam-heuristic suite + end-to-end route test, written and passing before this doc finalized. |
| III — Simplicity Gate | COMPLIES | No generic notification/erasure/external-spam scaffolding for features with zero real consumers this pass — each deferred explicitly rather than stubbed speculatively. |
| IV — Anti-Abstraction Gate | COMPLIES | `CommentRepoPort`/`SpamCheckPort` were already ADR-006 rule-of-two ports from the ACCEPTED ADR; this spec supplies both adapters each port needs, not a third. |
| V — Integration-First Testing | COMPLIES | AC-05 is a real HTTP route test through a real Express app + real SQLite dataModule tables. |
| VI — Security-by-Default | COMPLIES | Spam stored silently (no attacker oracle); rate-limit + honeypot + size/link caps before any DB write; moderation actions authorize()-gated; the notification-email safe-default (OFF) is honored, not worked around. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including its explicit, disclosed scope cuts from ADR-031's full v1 list. |
| VIII — Observability | COMPLIES | The moderation_log is itself a durable audit trail; outbox events give downstream observers a hook. |

## Implementation Record

- `src/features/plugins/data-module.ts`: `TableDecl.indexes` (OQ-1 resolution) — see the
  Correction Addendum below for T2's removal, discovered during this spec's own work.
- `src/comments/sanitize.ts`, `spam.heuristic.ts`: bounded, no-network body sanitizer + heuristic
  spam scorer.
- `src/comments/repo.memory.ts`, `repo.sqlite.ts`: `CommentRepoPort` adapters, both including the
  additively-widened `purge()` method (see Correction Addendum).
- `src/comments/hooks.ts`: `createCommentHookRegistry` (`comments.beforeSubmit`/`.statusChanged`).
- `src/comments/ingress.ts`: `createCommentIngressPolicy`.
- `src/comments/write-service.ts`: `createCommentWriteService` (moderation actions + outbox events
  + statusChanged hook).
- `src/comments/index.ts`: `createCommentsModule` composition factory + `DEFAULT_COMMENTS_SETTINGS`.
- `src/comments/data-module-install.ts`: `installCommentsDataModule` (mirrors Newsletter's own).
- `src/comments/types.ts`: `COMMENTS_DATA_MODULE` gains `pluginTier`/`provenance`/declared indexes.
- `src/comments/ports.ts`: `CommentRepoPort.purge()` added (additive widening).
- `src/identity/permissions.ts`: 7 `comments.*` permissions registered.
- `src/server/routes/site/comments-submit.ts`: public submit route.
- `src/server/routes/admin/comments/moderation-queue.ts`, `moderate.ts`: admin routes.
- `src/server/routes/types.ts`, `app.ts`, `deps.ts`: `RouteDeps` widened with
  `commentRepo`/`commentIngressPolicy`/`commentWriteService`/`commentsReady`; both composition
  roots wired (`entryRepo` hoisted in each to avoid a second instance).
- `src/server/bootstrap.ts`: `comments` optional boot module added.
- `src/server/capability-inventory.ts`: `comments` entry, `hasDurableAdapter: true`.
- `src/features/plugins/store/store-plugin.ts`, `src/infra/sqlite/content-db.ts`: `busy_timeout`
  pragma added (defense-in-depth, see Correction Addendum).
- `.gitignore`: comments/newsletter/store snapshot-litter patterns completed (store/newsletter
  already had partial entries from a prior session).
- Tests: `spam.heuristic.test.ts` (5), `repo.contract.test.ts` (18, both adapters incl. `purge`),
  `ingress.test.ts` (14), `write-service.test.ts` (4), `data-module-indexes.test.ts` (3),
  `comments-e2e.test.ts` (1, real HTTP route test) — 45 new tests total.
- Full suite: 1658/1658 (1654 passing, same 4 pre-existing, disclosed, unrelated failures carried
  since before this slice). Typecheck clean. Live smoke test (5 consecutive real-server boots)
  confirmed the `comments` boot module reaches `ready` every time after the Correction Addendum
  fix; a real HTTP submit→moderate→queue flow verified end-to-end both via the automated test and
  manual `curl` against a running server.

## Correction Addendum (2026-07-16, discovered mid-spec)

Adding Comments as dataModule's SECOND real production consumer (after Newsletter) exposed a
genuine bug in SPEC-032's own T2 (exclusive lock) implementation: a live 5-trial multi-boot smoke
test found the store plugin's separate `content.db` connection deterministically failing with
"database is locked" once two dataModule declares ran during the same boot. Root-caused via live
A/B testing (removing the lock calls made the failure disappear immediately, 5/5 trials). Fixed by
removing the live exclusive lock from `data-module.ts` entirely — see that file's header and
`restore.ts`'s own addendum, and SPEC-032's matching Correction Addendum, for the full account.
`PRAGMA busy_timeout = 5000` was added to `content-db.ts` and `store-plugin.ts` as defense-in-depth
against genuinely transient contention (not the actual root cause here, but good practice now that
multiple connections to one file are a real, exercised scenario).

Also found and fixed during this spec, additively, without re-opening ADR-031's own review:
`CommentRepoPort` (the already-ACCEPTED interface) had no `purge()` method at all, even though
`ModerationAction` includes `"purge"` as a valid value and ADR-031 §9 requires a trash→purge ladder
in v1 — a real gap between the interface and the ADR's own stated requirement, closed the same way
this session closed similar gaps in Phase 1 (`ChangeSetRepoPort.insert()`,
`WebhookDeliveryRepoPort.enqueue()`): additive, both adapters, both directions tested.
