# Delete-confirmation build — narrow path

Date: 2026-09-08
Dispatched by: team-lead (Coordinator), executing `ADS-memory/reports/2026-09-08-content-delete-eval.md`'s narrow-path recommendation (§5): extract the shared `resolveDeleteDecision` shape and wire confirmation onto the 8-tool family's EXISTING ids. No `content_delete` parent tool, no rename, no collapse.
Persona: Programmer (`AI-Dev-Shop/agents/programmer/skills.md` v1.7.1, loaded — confirmed in first reply).

## In-scope tool list (confirmed, per eval report §1.2)

1. `content_post_delete` — already has confirmation (reference implementation)
2. `media_trash_asset`
3. `comments_trash_comment`
4. `widgets_trash_instance`
5. `theme_trash_file`
6. `redirects_tombstone`
7. `collections_content_type_tombstone` — flagged for explicit sign-off (irreversible schema teardown, no un-tombstone tool)
8. `webhooks_delete_subscription`

OUT: `identity_role_delete`, `identity_policy_delete` (permanent, per Leona), `workspace_delete` (stays unwired).

## Step 1 — COMPLETE: extract `resolveDeleteDecision` into one shared function

Added to `apps/website/src/contracts/core/tool-surface-exchanges.ts` (the channel-agnostic transport
layer — kept `UIResource`-free on purpose, matching this file's own documented "channel-agnostic"
design):

- `ConfirmationOutcome` — `{confirmed:true} | {confirmed:false; reason:"declined"|"expired"|"abandoned"}`
- `classifyConfirmationAnswer(answer: SurfaceMessage): ConfirmationOutcome` — the pure, synchronous
  fail-closed classification (only `decision === "confirm"` proceeds). This is the actual duplicated
  logic that had drifted-fix risk (§3.5 of the eval report) — a fix here now covers every call site.
- `resolveConfirmationDecision(exchange, emission): Promise<ConfirmationOutcome>` — `askOnce` +
  `classifyConfirmationAnswer`, for callers that don't already hold an `answer`.

Migrated 4 call sites, **preserving each site's own domain-specific result shape byte-for-byte**
(verified by full regression run, not just typecheck):

| file | old local fn | new shape |
|---|---|---|
| `features/post/tool-registrations.ts:426` | `resolveDeleteDecision` | wraps `resolveConfirmationDecision`, same `deleted`/`cancelled`/`post` result |
| `features/custom-credentials/tool-registrations.ts:262` | `resolveMakeRequestDeleteDecision` | wraps `resolveConfirmationDecision`, same `executed`/`cancelled` result |
| `features/source-control/tool-registrations.ts:286` | `resolveCommitDecision` | wraps `resolveConfirmationDecision`, same `committed`/`cancelled`/`owner`/`repo` result |
| `features/deployments/publish-agent-tools.ts:1205` | `handlePublishConfirmationAnswer` | calls `classifyConfirmationAnswer` directly (already holds `answer` from `askThenReport`, no second `askOnce`) |

### Evidence

- `npx tsc -p tsconfig.json --noEmit` from repo root: **clean, 0 errors** (one real hit fixed along the
  way — `outcome` variable name collided with the pre-existing `runPublishAndAwait` result in
  `publish-agent-tools.ts`; renamed to `confirmation`).
- New direct unit tests for the shared function, `contracts/core/__tests__/tool-surface-exchanges.test.ts`:
  9 new tests (confirm/decline/expired/abandoned classification + the `resolveConfirmationDecision`
  ask-then-classify wrapper) — **35/35 pass** (26 pre-existing + 9 new).
- Full regression run across all 4 migrated call sites' own test suites — **all green, 0 failures**:
  - `features/post/__tests__/agent-tools.delete-confirmation.test.ts` — 57/57
  - `features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts` — 19/19
  - `features/source-control/__tests__/tool-registrations.unit.test.ts` — included in combined 113/113 run
  - `features/deployments/__tests__/publish-agent-tools.unit.test.ts` — included in combined 113/113 run

No behavior change intended or observed — this step is pure extraction, proven by the pre-existing
tests staying green unchanged.

## Step 2 — wiring confirmation onto the 7 unconfirmed tools: IN PROGRESS

Discovery complete for all 7 domains. Key finding: none of the 7 domains' `build*Registrations`
functions currently accept the `surfaces: AssistantSurfaceDeps` second parameter — but they don't need
any composition-root change to gain it. All 7 are wired via the tool-contribution registry
(`contribute<Domain>Tools()` → `registerToolContributor` → `tool-catalog-manifest.ts`'s
`installFirstPartyToolContributors()`), and `buildAssistantToolRegistrations` already calls
`slice.build(enrichedRouteDeps, surfaces)` — passing `surfaces` to EVERY contributor unconditionally
(`assistant/tool-registrations.ts:687`). A domain's `build` fn simply needs to declare the second
param to receive it; per `ToolContributor.build`'s own doc, "optional to implement, not optional to
pass."

Existing wiring per domain (all confirmed, all already have `DERIVED_RISK_BY_TOOL_ID` entries since
they're already-wired tools — no new risk-classification work needed):

| tool id | file | permission | current handler |
|---|---|---|---|
| `media_trash_asset` | `Jini/packages/cms/src/media/tool-registrations.ts:262` | `media.delete` | Jini package — needs rebuild after edit |
| `comments_trash_comment` | `apps/website/src/features/comments/tool-registrations.ts:229` | `comments.delete` | via `buildCommentsModerationHandler` wrapper |
| `widgets_trash_instance` | `apps/website/src/features/widgets/tool-registrations.ts:256` | `widgets.delete` | |
| `theme_trash_file` | `apps/website/src/features/theme/tool-registrations.ts:551` | `THEME_WRITE_PERMISSION` | |
| `redirects_tombstone` | `apps/website/src/features/redirects/tool-registrations.ts:193` | `admin.redirects.manage` | via `tombstoneRedirect` |
| `webhooks_delete_subscription` | `apps/website/src/features/webhooks/tool-registrations.ts:239` | `admin.integrations.manage` | via `deleteSubscription` |
| `collections_content_type_tombstone` | `Jini/packages/cms/src/content-types/tool-registrations.ts:249` | `admin.collections.manage` | Jini package — needs rebuild after edit |

Plan per domain: add `surfaces` param, build an inline confirmation-resource builder (matching
source-control/deployments' inline convention, not a separate file — post is the only domain with its
own `delete-confirmation-ui.ts`), wire the handler to open an exchange / resolve via
`resolveConfirmationDecision` / call the existing trash-tombstone-delete fn on confirm, add the tool id
to `MCP_UI_REDEEMABLE_TOOL_IDS`, write RED-first tests modeled on
`features/post/__tests__/agent-tools.delete-confirmation.test.ts`.

## Step 2 progress — comments and widgets domains COMPLETE

### `comments_trash_comment`
- `apps/website/src/features/comments/tool-registrations.ts`: pulled trash out of the shared
  `buildCommentsModerationHandler` (still used by approve/mark_spam/restore, unchanged) into its own
  confirmation-gated handler. Pre-dialog: `comments.delete` permission check (matches catalog),
  `commentRepo.findById` for dialog display. On confirm: `commentWriteService.applyModeration` —
  self-protecting against staleness via its own `expectedVersion` check, no separate re-read needed
  (unlike Posts/Pages).
- `buildCommentsRegistrations` gained `surfaces: AssistantSurfaceDeps` (defaulted), added to
  `MCP_UI_REDEEMABLE_TOOL_IDS`.
- RED confirmed first (dialog never raised against the unwired handler — 6 failures), then wired,
  then GREEN.
- New file `comments/__tests__/agent-tools.trash-confirmation.test.ts` — 19/19 pass.
- Updated `assistant/__tests__/tool-registrations.comments.test.ts`: removed `comments_trash_comment`
  from the generic `MODERATION_TOOLS` loop (its shape genuinely changed — needs `emitSurface` and its
  own decision branching), with an explanatory comment pointing at the new dedicated file.
- Full regression: 40/40 pass (new file + updated assistant-level file).

### `widgets_trash_instance`
- `apps/website/src/features/widgets/tool-registrations.ts`: pre-dialog read via `getWidgetInstance`
  (gates `widgets.read`, matching `content_post_delete`'s read/write split). On confirm:
  `trashWidgetInstance` unchanged — it re-derives `expectedVersion` from a FRESH read taken AT CONFIRM
  TIME, inside itself, so (unlike Posts/Pages) no separate staleness re-check was needed in the new
  handler; a row that moved while the dialog was open is simply the version it writes against.
- `buildWidgetsRegistrations` gained `surfaces` (defaulted), added to `MCP_UI_REDEEMABLE_TOOL_IDS`.
- New file `widgets/__tests__/agent-tools.trash-confirmation.test.ts` — 10/10 pass, including a test
  proving `widgets.read` is checked pre-dialog and `widgets.delete` only at confirm time.
- 3 existing test files broke on the behavior change and were updated, not weakened:
  - `widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts` and
    `.region-gaps.test.ts`: added a `trashInstance()` helper (raise dialog, auto-confirm) replacing a
    bare synchronous handler call — these tests only needed a trashed instance to exist, not to
    certify the gate itself.
  - `assistant/__tests__/tool-registrations.widgets-contracts.test.ts`: same helper pattern for its
    one workflow-test call site.
  - `assistant/__tests__/tool-registrations.widgets-authorization.test.ts`: added a `t.skip(...)` for
    `widgets_trash_instance` in the generic "calls authorize() with its declared permission" loop
    (mirrors the existing `content_post_delete` exclusion in `tool-registrations.post.test.ts`) — the
    sibling "denied principal rejected" test in the same loop still passes unmodified, since
    `WidgetForbiddenError` is thrown regardless of which permission failed.
- Full regression: 56 pass, 1 skipped (the documented exclusion above), 0 failures.

### Both domains
- `npx tsc -p tsconfig.json --noEmit` from repo root: clean after each domain.
- `MCP_UI_REDEEMABLE_TOOL_IDS` now carries: `content_post_delete` (pre-existing),
  `comments_trash_comment`, `widgets_trash_instance`.

## Step 2 progress — theme, redirects, webhooks domains COMPLETE

### `theme_trash_file`
- No pre-dialog entity read: the dialog is built directly from the model's own `themeId`/`path`
  input — that IS the whole truth a human needs to consent to (no DB row to look up). All existing
  validation (theme lookup, already-trashed check, identity-lock, generated-readonly check) now runs
  once, after confirmation, in the same place it always ran — nothing to re-validate for staleness
  since it was never validated before the dialog existed in the first place.
- Rewrote `assistant/__tests__/tool-registrations.themes-trash-restore.test.ts`: every setup call site
  goes through a new `trashFile()` helper; added a dedicated confirmation-gate section. Full
  regression (this file + `tool-registrations.themes.test.ts`): 46/46 pass.

### `redirects_tombstone`
- Pre-dialog read via `redirectRepo.findById`. `tombstoneRedirect` is idempotent (disabling twice is
  a no-op), so no staleness re-check needed.
- New file `redirects/__tests__/agent-tools.tombstone-confirmation.test.ts` (11 tests). One workflow
  call site in `tool-registrations.redirects.test.ts` updated via a `tombstoneRule()` helper. Full
  regression: 24/24 pass.

### `webhooks_delete_subscription`
- Pre-dialog read via `webhookSubscriptionRepo.findById`; dialog carries an UNCONDITIONAL warning
  (this tool is classified `deletes-durable-state` precisely because no un-disable path exists
  anywhere in the domain). `deleteSubscription` performs its own fresh existence lookup at write time
  (no `expectedVersion` anywhere in its input — verified by reading it in full), so no separate
  staleness re-check needed.
- New file `webhooks/__tests__/agent-tools.delete-confirmation.test.ts` (11 tests). One workflow call
  site in `tool-registrations.webhooks.test.ts` updated via a `deleteSubscriptionConfirmed()` helper.
  Full regression: 24/24 pass.

### All 6 Tovu-side domains (comments, widgets, theme, redirects, webhooks + pre-existing post)
- `MCP_UI_REDEEMABLE_TOOL_IDS` now carries: `content_post_delete`, `comments_trash_comment`,
  `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone`, `webhooks_delete_subscription`.
- `npx tsc -p tsconfig.json --noEmit` from repo root: clean after every domain.

## Remaining work

- 2 Jini-side domains: `media_trash_asset`, `collections_content_type_tombstone` — live in
  `/Users/la/Programming/Jini/packages/cms/src/{media,content-types}/`. Need a Jini package rebuild
  after editing (per `reference_jini_dist_rebuild_required_for_tovu` — rebuild only the `cms` package,
  never `pnpm -r build`) before Tovu's symlinked `node_modules` picks up the change.
- ADR-055 status update (DRAFT → accepted, per Leona, 2026-09-08), add to ADR-INDEX.md, note the
  ADR-053 DRAFT dependency as an open item for Leona (do NOT touch ADR-053 itself).
- `check:boundaries` baseline re-check (must stay 19).
- Live admin E2E run via the admin assistant (switch dock to API · BYOK (Gemini)) for at least one
  confirmed delete, then verify via a read-only DB read (never trust the chat's own claim).
- Final report to team-lead with the full worklist above.
