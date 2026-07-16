# Feature Spec: Comments (ADR-031) Follow-Up — OQ-3, Settings Ledger, Doc Reconciliation, External SpamCheckPort

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-035 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-035-comments-follow-up |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed)

SPEC-033 (Comments v1 backend) shipped ADR-031's `IN v1` list minus the two pieces explicitly
blocked on missing infrastructure (origin-isolated widget/panel, verified-recipient notification
email). This spec closes 4 of the remaining disclosed follow-ups named at that time:

1. **OQ-3** (anonymous-ingress `system` actor — genuinely open, not just deferred).
2. **`CommentsSettings` → ADR-028 Settings Layered Ledger wiring** (previously a hardcoded
   `DEFAULT_COMMENTS_SETTINGS` constant).
3. **OQ-2 doc reconciliation** (`admin-sitemap.md`/`admin-section-architecture-outline.md`).
4. **External `SpamCheckPort` adapter** (ADR-006 rule-of-two "plausible next" half).

Explicitly NOT in scope (unchanged from SPEC-033's own Non-Goals, still blocked on the same
missing infrastructure): the Comments widget/moderation panel (ADR-025 origin-isolation host does
not exist), the author-notification email (no consent-challenge flow exists), and a GDPR erasure
handler (no `principal.erasure.requested` event/hook exists anywhere in this codebase).

## Problem Statement

**OQ-3:** `ingress.ts#submit()` called `deps.repo.create(record)` directly — no
`p_comments__moderation_log` row was ever written for the initial submission, and no seeded
"system" principal existed for such a row's `actorPrincipalId` to reference, leaving the ADR's own
round-2 fold requirement ("pin the anonymous-ingress `system` actor as a seeded principal ULID")
unresolved.

**Settings:** every workspace got byte-identical `CommentsSettings` from a hardcoded constant —
ADR-031 §2 itself documents the intent ("Stored via the Settings Layered Ledger... under a
`comments.*` namespace once that wiring exists — NOT as a comment table"), never built.

**Doc reconciliation:** `admin-sitemap.md` predates ADR-031's Tier-3-bundled-plugin placement
decision and still lists Comments as `features/comment` core with `admin.comments.*` permissions.

**External spam adapter:** ADR-006's rule-of-two for `SpamCheckPort` names an external-service
adapter (Akismet-style) as the "plausible next" half; only the local heuristic adapter existed.

## Requirements

### OQ-3 (anonymous actor identity)

- REQ-01: `src/comments/types.ts` shall export `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID` — a fixed,
  well-known id (`"system-comments-ingress"`), mirroring `server/seed.ts`'s
  `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID` / `src/seo/settings.ts`'s `"system-seo"` convention
  (a stable attribution id, not required to resolve to a real `identity` principal row — verified
  against `features/settings/migration.ts`'s own explicit doc on this exact pattern).
- REQ-02: `CommentRepoPort.create()` shall gain an optional second argument, `submitLog?:
  ModerationLogEntry`, mirroring `ChangeSetRepoPort.insert()`'s optional-third-argument
  co-persistence pattern (ADR-046 BR-04). Both `InMemoryCommentRepo`/`SqliteCommentRepo` persist
  `record` and `submitLog` atomically (both-or-neither) when `submitLog` is supplied.
- REQ-03: `CommentRepoPort` shall gain `listModerationLog(required: { workspaceId; commentId })` —
  the append-only audit-trail read (also how this spec's own tests verify the submit-time row).
- REQ-04: `ingress.ts#submit()` shall build a `ModerationLogEntry` (`action: "submit"`,
  `fromStatus: null`, `toStatus: <auto-classified status>`, `actorPrincipalId:
  COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID`) and pass it to `repo.create()` at the same call site.

### Settings (ADR-028 wiring)

- REQ-05: `src/comments/settings.ts` shall export `ensureCommentsSettingDefinitions`/
  `getCommentsSettings`/`setCommentsSettings`, mirroring `src/seo/settings.ts`'s exact
  idempotent-definitions / `getEffective`-read / validate-then-`set`-write structure, for
  `CommentsSettings`'s 6 fields under namespace `site.comments` (the ledger's namespace owner
  fence requires `ownerKind: "site"` definitions to start with `site.` — verified directly against
  `features/settings/settings.ts`'s `NAMESPACE_FENCE`, not assumed).
- REQ-06: `closeAfterDays: number | null` shall use a documented sentinel (`-1`, "never closes")
  for ledger storage — every non-secret definition requires a non-null `default_json` (ledger
  totality, `validateDefinitionInput`'s INV-02, verified directly), mirroring `seo/settings.ts`'s
  own `""`-means-absent sentinel for its nullable string fields.
- REQ-07: `ingress.ts`'s `CommentIngressDeps.settings: CommentsSettings` (a boot-captured snapshot)
  shall become `getSettings: (workspaceId) => Promise<CommentsSettings>` (a per-call resolver) —
  an operator's settings change takes effect on the next request, not only after a restart.
  `index.ts#createCommentsModule`'s `entryLookup` reads the same live resolver.
- REQ-08: `CommentsModuleDeps` shall gain optional `settingsRepo?: SettingsRepoPort`; when
  supplied, settings are read live from the ledger, else fall back to `deps.settings ??
  DEFAULT_COMMENTS_SETTINGS` (hermetic tests that don't wire the ledger).
- REQ-09: `server/app.ts`/`server/deps.ts` shall call `ensureCommentsSettingDefinitions` at boot,
  chained AFTER `seoReady` resolves (not in parallel) — the settings write chokepoint's `BEGIN
  IMMEDIATE` transaction cannot tolerate two independent definition-registration chains racing on
  the same SQLite connection (the identical hazard `seoReady`'s own chaining-after-`settingsReady`
  comment documents), exposed as a new `commentsSettingsReady: Promise<void>` on `RouteDeps`.
  `createCommentsModule(...)` receives `settingsRepo` in both composition roots.
- REQ-10: admin `GET`/`PUT /api/admin/v1/workspaces/:workspaceId/comments/settings` routes,
  `comments.configure`-gated (the permission already existed in `identity/permissions.ts`),
  mirroring `routes/admin/seo/{get,put}-settings.ts`'s exact shape.

### OQ-2 (doc reconciliation)

- REQ-11: `admin-sitemap.md`'s Comments row (line 86 pre-edit) shall be annotated stale, with a
  reconciliation note pointing at ADR-031, recording that Comments lives at `src/comments/` as a
  bundled plugin with flat `comments.*` permissions, not `features/comment`/`admin.comments.*`.
- REQ-12: `admin-section-architecture-outline.md` — investigated; contains **zero** mentions of
  "comment" anywhere in the file (verified via full-file case-insensitive search). ADR-031's OQ-2
  claim that this file also "places comments as `features/comment` core" does not hold for the
  file's current content. No edit made — there is nothing in it to reconcile. Disclosed here
  rather than fabricating a correction to content that isn't present.

### External SpamCheckPort adapter

- REQ-13: `src/comments/spam.external.ts` shall export `AkismetSpamCheck implements
  SpamCheckPort`, matching `spam.heuristic.ts`'s shape. Its constructor takes an `HttpClientPort`
  (`../http`, ADR-038's single guarded egress seam — confirmed to exist in this codebase, already
  consumed the same way by `integrations/delivery.ts`'s webhook dispatch) and calls `.send()`
  exclusively — no raw `fetch` anywhere in the file.
- REQ-14: `check()` maps Akismet's real, documented `comment-check` API shape (form-urlencoded
  POST, plain-text `"true"`/`"false"` response body, `X-akismet-pro-tip: discard` header) to a
  `SpamVerdict`; fails OPEN (`isSpam: false, score: 0, provider: "akismet-unavailable"`) on any
  non-2xx response or thrown transport error. `user_ip`/`user_agent` are deliberately omitted —
  this codebase's ingress boundary never surfaces a raw visitor IP past the HTTP route layer
  (verified against `ingress.ts`/`comments-submit.ts`'s own file headers), and a salted hash is
  not a valid value to send Akismet's API.
- REQ-15: `report()` POSTs to Akismet's `submit-spam`/`submit-ham` feedback endpoints and
  swallows transport failures (best-effort; a failed feedback POST must never surface as a
  moderation-action failure to the operator).

## Acceptance Criteria

- AC-01 (REQ-01–04) [P1]: `src/comments/__tests__/ingress.test.ts` proves a pending, an
  auto-approved, and a spam-auto-classified submission each get exactly one `submit`
  `moderation_log` row via `repo.listModerationLog()`, `actorPrincipalId ===
  COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID`, `fromStatus: null`, `toStatus` matching the
  auto-classification.
- AC-02 (REQ-02) [P1]: `repo.contract.test.ts` (both adapters) proves `create()` with a
  `submitLog` persists both rows; `create()` without one leaves the moderation log empty.
- AC-03 (REQ-05/06) [P1]: `settings.test.ts` proves `ensureCommentsSettingDefinitions` is
  idempotent (6 definitions, not 12, on a rerun); `getCommentsSettings` matches the pre-ledger
  defaults byte-for-byte before AND after definitions are registered; `setCommentsSettings`
  writes a partial patch atomically-validated (all-or-nothing on an invalid patch).
- AC-04 (REQ-07) [P1]: `ingress.test.ts`'s "getSettings is read fresh on every submit() call"
  test proves the SAME policy instance observes a settings mutation between two calls without
  reconstruction.
- AC-05 (REQ-09/10) [P1]: `src/server/__tests__/routes/comments-settings-routes.test.ts` proves
  GET returns ledger-backed defaults, PUT persists and is reflected by a subsequent GET, an
  invalid PUT 400s and writes nothing, and a principal without `comments.configure` gets 403 on
  both routes — through the real `createApp()`/`createRouteDeps()` composition, real HTTP.
- AC-06 (REQ-13–15) [P1]: `spam.external.test.ts` (8 cases) proves the request shape (endpoint,
  form-encoding, no `user_ip`), both verdict-mapping paths (with/without the pro-tip header),
  fail-open on non-2xx and on a thrown error, and `report()`'s endpoint selection + failure
  swallowing — all against a fake, local `HttpClientPort`, never a real network call.
- AC-07 [P2]: the full pre-existing test suite is unaffected (regression gate).

## Non-Goals

See Scope Note. Additionally:
- Wiring `AkismetSpamCheck` into a live composition root (`server/deps.ts`) — no real Akismet API
  key/blog URL exists in this environment to configure it with; `comments/index.ts` still
  hardcodes `HeuristicSpamCheck`, unchanged by this spec.
- Making the comments rate-limiter (`COMMENTS_SUBMIT_PROFILE`) dynamically reconfigurable from
  `maxPerIpPerHour`'s ledger value — disclosed gap in `index.ts`'s own comment; the limiter stays
  fixed at construction time, a larger change to `server/middleware/rate-limit.ts`'s fixed-window
  counter store than this slice's scope covers.
- Seeding an actual `identity` principal ROW for `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID` — verified
  directly that this codebase's established pattern for this exact problem shape
  (`SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID`, `"system-seo"`) is a fixed attribution constant with
  no corresponding seeded row, and `features/settings/migration.ts`'s own doc comment explicitly
  states this is intentional ("not required to resolve to a real identity principal row"). A real
  seeded row would require either `identity/seed.ts` importing from `comments` (backwards
  dependency) or new composition-root wiring not otherwise motivated.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency; the external spam adapter is a thin HTTP-shape mapper over the existing guarded `HttpClientPort`. |
| II — Test-First | COMPLIES | 24 new/changed tests across 5 files, all passing before this doc finalized; full suite re-run as the regression gate. |
| III — Simplicity Gate | COMPLIES | No speculative erasure-handler/notification-email scaffolding; the settings resolver is the minimum shape (a function, not a caching layer/pub-sub) that makes ledger reads live. |
| IV — Anti-Abstraction Gate | COMPLIES | `CommentRepoPort`/`SpamCheckPort` were already ADR-006 rule-of-two ports; this spec supplies the second port's second adapter and additively widens the first, not a new port. |
| V — Integration-First Testing | COMPLIES | AC-05 exercises the real `createApp()`/`createRouteDeps()` HTTP composition; AC-02/03 exercise the real SQLite adapter, not just in-memory. |
| VI — Security-by-Default | COMPLIES | The external spam adapter fails open (never silently spam-files legitimate comments on an outage) while the ingress itself keeps ADR-031's "spam stored silently, never rejected at the boundary" invariant; `comments.configure` gates both settings routes. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including the one item (doc REQ-12) investigated and found to have nothing to change. |
| VIII — Observability | COMPLIES | The `submit` moderation_log row makes ingress-time auto-classification an observable, queryable audit event, not just an outbox side effect. |

## Implementation Record

- `src/comments/types.ts`: `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID`.
- `src/comments/ports.ts`: `CommentRepoPort.create()` widened (optional `submitLog`);
  `listModerationLog()` added.
- `src/comments/repo.memory.ts`, `repo.sqlite.ts`: both implement the widened `create()` +
  `listModerationLog()`; the SQLite adapter wraps both inserts in one transaction when `submitLog`
  is present.
- `src/comments/ingress.ts`: builds + passes the `submit` log entry; `settings: CommentsSettings`
  → `getSettings: (workspaceId) => Promise<CommentsSettings>`.
- `src/comments/index.ts`: `CommentsModuleDeps` gains `settingsRepo?`; builds the live `getSettings`
  resolver; re-exports `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID`/settings functions/error class.
- `src/comments/settings.ts` (new): `ensureCommentsSettingDefinitions`/`getCommentsSettings`/
  `setCommentsSettings`.
- `src/comments/errors.ts` (new): `CommentsSettingsValidationError`.
- `src/comments/spam.external.ts` (new): `AkismetSpamCheck`.
- `src/server/routes/types.ts`: `RouteDeps.commentsSettingsReady`.
- `src/server/routes/admin/comments/get-settings.ts`, `put-settings.ts` (new).
- `src/server/app.ts`, `deps.ts`: `commentsSettingsReady` construction (chained after `seoReady`);
  `settingsRepo` passed to `createCommentsModule`; new settings routes wired.
- `ADS-project-knowledge/reports/architecture/admin-sitemap.md`: Comments row annotated stale +
  reconciliation note added.
- Tests: `src/comments/__tests__/settings.test.ts` (6, new), `spam.external.test.ts` (8, new),
  `ingress.test.ts` (+4: 3 submit-log cases + 1 live-settings case, `makePolicy` updated to the
  new resolver shape), `repo.contract.test.ts` (+2 per adapter = 4, new), `src/server/__tests__/
  routes/comments-settings-routes.test.ts` (4, new) — 26 new/changed test cases total.
- Full suite: 1678 tests, 1674 passing, same 4 pre-existing, disclosed, unrelated failures, zero
  new ones. Typecheck clean (`tsc -p tsconfig.json --noEmit`, zero errors).

## Handoff Contract

- **Inputs used:** direct inspection of `ChangeSetRepoPort.insert()`'s optional-argument
  co-persistence precedent (`core/commands/change-set.ts`) for OQ-3's `create()` widening; direct
  inspection of `seo/settings.ts`/`seo/__tests__/settings.definitions.test.ts` for the settings-
  ledger wiring shape; direct inspection of `features/settings/settings.ts`'s `NAMESPACE_FENCE`
  and `validateDefinitionInput`'s INV-02 (both caught live by this spec's own test failures before
  being fixed, not assumed correct); direct inspection of `integrations/delivery.ts`'s
  `HttpClientPort` consumption shape and `http/ports.ts`/`http/types.ts` for the external spam
  adapter; a full-file grep of `admin-section-architecture-outline.md` before writing REQ-12
  (rather than trusting ADR-031's OQ-2 text at face value).
- **Output summary:** all 4 Part-B items closed to the extent responsibly buildable in this
  environment. OQ-3 has a real, tested, atomic audit trail. Comments settings are ledger-backed
  and live (not boot-frozen), with both a read and a natural write route. The one doc ADR-031
  named that actually needed a correction (`admin-sitemap.md`) has one; the other doesn't, and
  that's now recorded rather than silently assumed. The external spam adapter is real and
  correctly structured against the guarded egress seam, disclosed-unwired pending a real
  credential.
- **Risks:** none beyond the disclosed scope limits. The settings-ledger chaining order
  (`commentsSettingsReady` after `seoReady`) is verified against the SAME transaction-collision
  hazard class this session already hit and fixed twice before (Correction Addendum precedents in
  SPEC-032/SPEC-033) — not a new, unverified risk.
- **Suggested next assignee:** whoever eventually builds ADR-025's origin-isolation host gets the
  widget/panel unblocked; whoever designs a consent-challenge flow unblocks the notification
  email; a `principal.erasure.requested` event/hook, if ever added generally, should route
  Comments' PII-bearing fields (`authorEmail`, member-attributed `authorPrincipalId` rows) through
  it. `maxPerIpPerHour`'s live-limiter reconfiguration is a real, small, named follow-up if an
  operator ever actually changes that setting and expects it to take effect without a restart.
