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

- ADR-055 status update (DRAFT → accepted, per Leona, 2026-09-08), add to ADR-INDEX.md, note the
  ADR-053 DRAFT dependency as an open item for Leona (do NOT touch ADR-053 itself).
- **`media_trash_asset` is NOT closeable as-is — see Verification section below.** It is missing one
  line (`MCP_UI_REDEEMABLE_TOOL_IDS`) and has 4 stale pre-existing test failures. Not fixed here per
  the rotation directive ("report it, don't rewrite it") — this is a decision for the coordinator,
  even though the fix mirrors the other 5 domains exactly.

## Verification (rotation replacement, 2026-09-08 13:11–13:35)

Persona: Programmer (`AI-Dev-Shop/agents/programmer/skills.md` v1.7.1, loaded — confirmed in first
reply). Scope: verify the 6-tool build above, not redesign it. System load was 135–310 throughout
(`uptime`) — noted next to every timing-sensitive result below; a few browser-automation stalls were
load artifacts, not product bugs (see the redirects live-run notes).

### 1–2. `media_trash_asset` verification and registered-tool count

**Correction to the outgoing report's own table**: `media_trash_asset`'s confirmation gate lives at
`apps/website/src/features/media/tool-registrations.ts` (a Tovu-side shim wrapping the Jini-provided
handler), **not** in `Jini/packages/cms/src/media/tool-registrations.ts` as the "Remaining work"
table said. Confirmed by reading commit `31fdf17d`'s diff directly — no Jini file is touched, no Jini
rebuild is needed or was done.

Built the real catalog (`resetToolContributorsForTests()` + `installFirstPartyToolContributors()` +
`buildAssistantToolRegistrations(createRouteDeps())`, matching the real composition roots) and
asserted presence directly, not inferred from `tsc`:

```
TOTAL_REGISTERED: 170
media_trash_asset registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: false
comments_trash_comment registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: true
widgets_trash_instance registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: true
theme_trash_file registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: true
redirects_tombstone registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: true
webhooks_delete_subscription registered: true | in MCP_UI_REDEEMABLE_TOOL_IDS: true
```

**All 6 tools register in the catalog** (170 total tool ids — `DERIVED_RISK_BY_TOOL_ID` is fine,
`mediaDerivedRisk` already carries `media_trash_asset → "mutates-durable-state"` from before this
build). But `media_trash_asset` is the *only* one of the six missing from
`MCP_UI_REDEEMABLE_TOOL_IDS` (`apps/website/src/assistant/mcp-ui-tool-calls.ts:36`) — the allowlist
gating `POST /api/admin/v1/mcp-ui/tool-calls`, the endpoint a human's confirm/cancel click in the
rendered dialog actually calls. This is exactly the failure mode the dispatch flagged as
highest-risk, just not the exact mechanism guessed (it doesn't vanish from the catalog — the tool
registers fine and the dialog renders fine; only the confirm/cancel click fails).

**Live-reproduced, not just statically found.** Via the admin assistant (API · BYOK, Google Gemini
gemini-3.8-flash), asked to trash a real seeded asset (`woodnest-cabin-booking`,
`5da45f84-1803-4493-bfd6-ee08bd1dba2c`, tovu-com dev site). The "Trash this media asset?" dialog
rendered correctly with the real title/slug. Clicking **either** "Trash asset" or "Cancel" fails
identically:

> Failed: 'media_trash_asset' is not an MCP-UI-redeemable tool

Read-only DB check before and after (`sites/tovu-com/content.db?mode=ro`) confirms zero writes: the
row stayed `status=active, version=1` both times. So the tool is not just confirm-broken — the whole
confirmation surface is dead for this one tool; a human cannot even decline cleanly.

**Not fixed** (rotation directive: verify, don't rewrite). The fix is one line — add
`"media_trash_asset"` to the `MCP_UI_REDEEMABLE_TOOL_IDS` set in
`apps/website/src/assistant/mcp-ui-tool-calls.ts`, mirroring the other 5 entries exactly — but that is
a call for the coordinator, not made unilaterally here.

**4 stale pre-existing test failures**, also not fixed, same reason. Unlike the other 5 domains,
`apps/website/src/assistant/__tests__/tool-registrations.media.test.ts` was never updated for the new
`emitSurface`-gated handler shape (no `trashFile()`/`tombstoneRule()`-style helper was added). Ran it
scoped from repo root:

```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks \
  apps/website/src/assistant/__tests__/tool-registrations.media.test.ts \
  apps/website/src/features/media/__tests__/tool-registrations.test.ts \
  apps/website/src/features/media/__tests__/promote-chat-attachment.test.ts
→ tests 40, pass 36, fail 4
```

All 4 failures are in `tool-registrations.media.test.ts`, all the same root cause (handler now throws
"no interactive confirmation channel (no emitSurface)" when called directly with no dialog):
- `a trashed asset's publicUrl is null, never a link a visitor would 404 on`
- `media_trash_asset is a status flip, and is the ONLY delete-adjacent tool`
- `workflow: upload, update its metadata, then trash it — ...`
- `media_trash_asset: calls authorize() with the catalog's declared permission and the run's principal`

No dedicated `media/__tests__/agent-tools.trash-confirmation.test.ts` was ever written either (every
other domain got one). `media_trash_asset` needs the same treatment `widgets`/`comments` got: an
`emitSurface`-auto-confirm helper threading through these call sites, plus a new dedicated
confirmation test file.

### 3. Extraction behaviour check (`9dab26bc`)

Read the pre-extraction diffs for all 3 non-post call sites directly (`git show 9dab26bc -- <path>`)
and traced the mapping by hand against `classifyConfirmationAnswer`'s actual implementation
(`contracts/core/tool-surface-exchanges.ts:320`): `SurfaceMessage.status` has exactly 3 values
(`received`/`expired`/`abandoned`), and `ConfirmationOutcome.reason` mirrors the non-`received` two
one-for-one, with `"declined"` covering the received-but-not-`confirm` case. Every branch in
`custom-credentials`, `source-control`, and `deployments/publish-agent-tools.ts` maps old→new with
identical resulting values (reason strings, `note` text derived from `=== "expired"`, result shapes)
— **confirmed no behaviour change**, not just trusted from the commit message.

### 4. Scoped regression runs (repo root, `node --import tsx --test`)

| suite | result |
|---|---|
| post + custom-credentials + source-control + deployments + shared `tool-surface-exchanges` fn | **170/170 pass** |
| comments + widgets (incl. shape-rejection/region-gaps/contracts/authorization) | **106 pass, 1 skip** (107 total) |
| theme + redirects + webhooks (incl. trash-restore/tombstone/delete-confirmation) | **94/94 pass** |
| media (assistant + feature level) | **36 pass, 4 fail** — see above |

Total: 411 tests run, 4 failures, all attributable to the one unfinished domain.

### 5. `check:boundaries`

`npm run check:boundaries` → **19 errors** (matches the required baseline exactly), 193 warnings,
2250 modules cruised. None of the 19 errors touch any file this build changed.

### 6–7. Live end-to-end run + DB verification

`npx tsc -p tsconfig.json --noEmit` from repo root: **clean, 0 errors** (confirms the outgoing
report's claim held for the `media_trash_asset` commit too).

Dev servers were already up (`:5173` admin, `:3000` site). Switched the dock to **API · BYOK
(Gemini)** via "Choose AI runtime". **Correction to the dispatch's own instruction**: pressing
`Escape` to close the runtime popover instead collapses the *entire* chat dock, not just the
popover — click elsewhere in the page instead.

First attempt (media, in the same chat thread) reproduced the failure above. Second attempt, still in
that thread, asked for `redirects_tombstone` on a real seeded redirect (`/old-promo`, id
`9b5bae37-…`) — under load spikes up to 310, the browser/renderer stalled for several minutes between
the dialog rendering and my click reaching it, and the exchange had expired by the time the click
landed (`Failed: that dialog is no longer waiting for an answer`; DB confirmed zero writes,
`status=active, version=1` unchanged) — a load artifact, not a code defect: the same exchange had
rendered correctly with the right live data (`/old-promo → /new-promo`, `active`) moments before.

Also observed: Gemini (gemini-3.8-flash) compulsively re-invoked `media_trash_asset` on every
subsequent turn in that same thread after its first failure, alongside whatever new tool I'd asked
for — an artifact of a weak model re-reading its own conversation history, not a Tovu bug. Starting a
**fresh conversation** (the "+ New" button next to the conversation-history icon) fixed it.

**Working, DB-verified confirmed delete** — fresh conversation, single message:

> Tombstone the redirect from "/documentation".

The `redirects_tombstone` dialog rendered immediately with the real row's data (`/documentation` →
`/docs`, `active`). Clicking **"Disable redirect"** returned `Done.` in the same call, and the
assistant then reported the redirect id back correctly. Read-only DB check
(`sites/tovu-com/content.db?mode=ro`) confirms it:

```
id                                    from_pattern    to_target  status    version
23415dd8-d948-4616-bffb-dc5dfd24cf09  /documentation  /docs      disabled  2
```

`status: active → disabled`, `version: 1 → 2`. This is the acceptance-criterion live run — reversible
via `redirects_update` per the dialog's own copy, left in this state as the verification artifact.

Switched the runtime dock back to **Local CLI** afterward, as instructed. Closed my own browser tab
(other tabs in the shared session belong to other concurrently-running agents — left untouched).

### What I could not verify

- A clean, load-free live run of `media_trash_asset` after the missing-allowlist fix — not applicable
  since the fix wasn't applied (rotation directive).
- Whether the `/old-promo` redirect's failed-due-to-load exchange attempt left any dangling
  server-side exchange state; DB confirms no *content* write happened, but I did not inspect
  in-memory exchange-store state (not persisted, not inspectable read-only).

### Context used

Approximately 40–45% of budget at handoff (well under the 250k self-report trigger). Full worklist
above is what remains: fix `media_trash_asset`'s one-line allowlist gap, update its stale test file
and add its dedicated confirmation test file (mirroring `widgets`/`comments`), then re-run this same
verification pass on it.

## Closeout — media_trash_asset fixed (2026-09-08 13:35–14:10, same rotation)

Authorized by team-lead to fix rather than only report, given full context and 45% budget used.

**The lesson, stated plainly, since it is the actual point of this catch:** "it registers" and "it
works" are different claims, and this build only ever checked the first one for `media_trash_asset`.
The tool registered in the catalog with no compile error. Its dialog rendered with correct, real
asset data. Every direct-handler test passed. None of that touches
`MCP_UI_REDEEMABLE_TOOL_IDS` — only the actual HTTP route a browser's click posts to does — so a
human clicking either button in a fully-correct-looking dialog got `403 TOOL_NOT_ALLOWLISTED` and
nothing else in the suite ever knew. The only thing that caught it was a live click through the
admin assistant. That is now fixed structurally, not just patched: a new test reaches the real route
and would fail again if this ever regressed (see item 3 below), which no test in this build did
before today.

### 1. The one-line fix

`apps/website/src/assistant/mcp-ui-tool-calls.ts` — added `"media_trash_asset"` to
`MCP_UI_REDEEMABLE_TOOL_IDS`, mirroring the other five entries' comment style exactly, with a note
pointing at the new integration test (item 3) as the proof.

### 2. Stale test file fixed

`apps/website/src/assistant/__tests__/tool-registrations.media.test.ts`: added a `trashAsset()`
helper (raise the dialog, auto-confirm via a real `SurfaceExchangeStore`), mirroring
`widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts`'s identical `trashInstance`
helper. The 4 previously-failing tests (`a trashed asset's publicUrl is null...`, `media_trash_asset
is a status flip...`, the upload/update/trash workflow test, and the media_trash_asset arm of the
generic authorize-call loop) now use it. The authorize-call loop test itself is `t.skip`'d for
`media_trash_asset` specifically (same reasoning `tool-registrations.post.test.ts`/
`tool-registrations.widgets-authorization.test.ts` already carry for `content_post_delete`/
`widgets_trash_instance`: the loop calls the handler with no `emitSurface` at all, which is a
different failure than what it's pinning). File result: 26 pass, 1 skip, 0 fail.

### 3. Dedicated confirmation test file — AND the test that actually catches the allowlist gap

Two new files, because one alone would have repeated the exact mistake:

- `apps/website/src/features/media/__tests__/agent-tools.trash-confirmation.test.ts` (10 tests) —
  handler-level certification mirroring `widgets/__tests__/agent-tools.trash-confirmation.test.ts`:
  dialog naming, confirm/cancel/fail-closed/expired, no-emitSurface refusal, `media.delete` checked
  pre-dialog with a denied principal never seeing one, nonexistent-id refusal, and one media-specific
  addition — confirming an already-trashed asset is a no-op (`trashMedia`'s own idempotency),
  reachable now through the confirmation wrapper for the first time. Required exporting
  `buildMediaRegistrationsForTovu` from `features/media/tool-registrations.ts` (was private) so this
  file could call it directly with a fake `MediaToolDeps & MediaPublicUrlDeps`, the same
  `build<Domain>Registrations` pattern every sibling domain already exports.
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`
  (2 tests) — the one that matters. Mirrors
  `mcp-ui-tool-calls-route.static-publish.integration.test.ts`'s own module doc precisely: builds a
  real `ToolRegistry`/`ToolExecutor`, opens the dialog for real, then POSTs to the actual
  `MCP_UI_TOOL_CALLS_PATH` route (`registerMcpUiToolCallsRoute`, the same one
  `server/modules/assistant.ts` proxies a browser click to) and asserts `res.status === 202`, not
  just that the handler resolved. **Verified this is load-bearing, not just plausible**: reverted the
  one-line fix, re-ran this file, got the exact live failure back —
  `403 {"error":"'media_trash_asset' is not an MCP-UI-redeemable tool","code":"TOOL_NOT_ALLOWLISTED"}`
  on both tests — then restored the fix and re-ran to confirm green again. This RED/GREEN cycle is
  the concrete answer to "make at least one test fail if the tool is absent from the allowlist."

Needed one boundaries fix to land cleanly: this new integration test deep-imports
`features/media/tool-registrations.ts` from `assistant/__tests__/`, which `check:boundaries`
(promoted to `error` for `features/media`) correctly flags unless exempted. Added the file's path to
`.dependency-cruiser.mjs`'s `TOOL_REGISTRATION_TEST_FROM_EXTRA` list — the exact mechanism
`mcp-ui-tool-calls-route.content-search.integration.test.ts` already uses for the identical shape
("a route integration test that needs a domain's real registrations wired for real"), not a new
carve-out.

### 4. Re-verification pass on media (repeating the original 6-item pass)

- **Registration + allowlist, rebuilt for real** (not inferred from `tsc`): all 6 tools present in
  the 170-tool catalog; all 6 now `true` in `MCP_UI_REDEEMABLE_TOOL_IDS` (previously `media_trash_asset`
  was the one `false`).
- **Scoped tests, full 6-domain regression from repo root**: **423 tests, 421 pass, 2 skip
  (both intentional/documented), 0 fail** — up from the prior pass's 419/4-fail (media's 4 failures
  now fixed, plus this closeout's 12 new tests: 10 handler-level + 2 route-level).
- **`check:boundaries`: 19 errors — exact baseline**, re-confirmed after the dependency-cruiser
  exemption above (was briefly 20 with the new integration test unexempted).
- **`tsc -p tsconfig.json --noEmit`: clean, 0 errors.**
- **Live click, DB-verified** (the acceptance criterion): fresh conversation, API · BYOK (Gemini),
  asset `woodnest-cabin-booking` (`5da45f84-1803-4493-bfd6-ee08bd1dba2c`, still `active`/`v1` from the
  earlier failed attempt in the same dev DB). Sent "Trash the media asset titled
  \"woodnest-cabin-booking\".", dialog rendered, clicked **Trash asset** — this is the exact click
  that returned `Failed: 'media_trash_asset' is not an MCP-UI-redeemable tool` before the fix.
  This time: `Done.` / "The media asset **woodnest-cabin-booking** (`5da45f84-…`) has been moved to
  the trash." Read-only DB confirms it:
  ```
  id                                    title                   status   version
  5da45f84-1803-4493-bfd6-ee08bd1dba2c  woodnest-cabin-booking  trashed  2
  ```
  `status: active → trashed`, `version: 1 → 2`. Switched runtime back to Local CLI afterward, closed
  my own browser tab.

### ADR-055 status update

`ADS-memory/reports/architecture/ADR-055-mcp-ui-return-path.md`: Status line changed from
`DRAFT — not accepted` to `Accepted 2026-09-08 (owner sign-off — Leona)`. Added a row to
`ADS-memory/reports/architecture/ADR-INDEX.md`'s table (near ADR-054/064, its nearest thematic
neighbors) and updated the file's "Deliberately absent" note to drop 055 from the withheld list
(053/056/057 remain withheld, unaffected). Per instruction, did **not** touch ADR-053 — left an
explicit "Open item" note on ADR-055 itself stating that 053 (whose Decisions 1–4 this ADR assumes,
and whose Decision 3 this ADR supersedes) remains DRAFT, and that resolving that gap is Leona's call.

### What remains (unchanged from before, none of it touched here)

- ADR-053/056/057 stay DRAFT, deliberately absent from the index — untouched, as instructed.
- The five other domains' route-level allowlist coverage: `comments_trash_comment`,
  `widgets_trash_instance`, `theme_trash_file`, `redirects_tombstone`, `webhooks_delete_subscription`
  each still only have handler-level confirmation tests, not a
  `mcp-ui-tool-calls-route.<domain>.integration.test.ts` proving their own `MCP_UI_REDEEMABLE_TOOL_IDS`
  entry actually works through the real route. I independently confirmed (via the same catalog-build
  script used above) all five are correctly present in the allowlist today, so there is no live bug —
  but the *class* of defect this closeout fixed for media (registers + renders + every test green, yet
  the confirm click 403s) is structurally possible for any of them and would be caught the same way.
  Flagging as a gap, not fixing — out of the scope authorized here. **CLOSED below**, same-day
  rotation.

## Route-level allowlist coverage for the 5 remaining tools — CLOSED (2026-09-08, rotation replacement)

Dispatched by team-lead to close the gap the prior closeout flagged and left open. Persona: Programmer
(`AI-Dev-Shop/agents/programmer/skills.md` v1.7.1, loaded — confirmed in first reply). Scope: add
route-level allowlist coverage for `comments_trash_comment`, `widgets_trash_instance`,
`theme_trash_file`, `redirects_tombstone`, `webhooks_delete_subscription` — no live bug, all five
verified already correctly allowlisted; the point is making a future regression in any one of them
fail loudly the same way `media_trash_asset`'s did not.

### What was built

One new file:
`apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts`
— a single parameterized file rather than five near-copies (per the dispatch's own "prefer if
cleaner" option), but built so **each of the 10 generated `test()` cases (2 per domain: confirm +
Cancel) names its own tool id in the test name and asserts only that domain's own real
`ToolRegistry`/`ToolExecutor`/`registerMcpUiToolCallsRoute` round trip** — never a shared
alternation-style assertion across ids, per the dispatch's explicit constraint. A `Scenario` config
per domain (`setup(surfaceExchanges)` returning `{toolExecutor, trashParams, assertConfirmed,
assertCancelled}`) builds a fresh, isolated tool registry against that domain's own real
`build<Domain>Registrations` (`buildCommentsRegistrations`, `buildWidgetsRegistrations`,
`buildThemesRegistrations`, `buildRedirectsRegistrations`, `buildWebhooksRegistrations`) and seeds one
real entity through the domain's own write path (`commentRepo.create`, `createWidgetInstance`, a temp
on-disk theme directory via `discoverAllBuiltInThemes`, `createRedirect`, `createSubscription`) —
mirroring `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`'s own shape, generalized
across domains rather than copy-pasted five times. The one subtlety that needed fixing mid-build: the
`surfaceExchanges` store must be the SAME instance the registrations are built against and the one
handed to `registerMcpUiToolCallsRoute` — an early draft built registrations against a throwaway store
per scenario before the real one existed, which would have broken at runtime; fixed by threading
`surfaceExchanges` into `setup()` as a parameter, built once per test and shared end-to-end.

### RED/GREEN proof (redirects_tombstone deliberately broken)

Removed `"redirects_tombstone"` from `MCP_UI_REDEEMABLE_TOOL_IDS`
(`apps/website/src/assistant/mcp-ui-tool-calls.ts`), ran only that domain's two generated tests via
`--test-name-pattern "redirects_tombstone"`:

```
✖ real round trip: a browser confirmation click for redirects_tombstone is accepted by the allowlist
✖ SECURITY: a Cancel click for redirects_tombstone also reaches the allowlist and reports the cancellation, not a 403
  403 !== 202
  {"error":"'redirects_tombstone' is not an MCP-UI-redeemable tool","code":"TOOL_NOT_ALLOWLISTED"}
tests 2, pass 0, fail 2
```

Restored the entry, re-ran the full file:

```
tests 10, pass 10, fail 0
```

`git diff apps/website/src/assistant/mcp-ui-tool-calls.ts` after restore: empty — the toggle
round-tripped byte-identical to HEAD, confirmed before committing.

### Verification

- `npx tsc -p tsconfig.json --noEmit` from repo root: **clean, 0 errors** (both before and after the
  RED/GREEN toggle).
- `npm run check:boundaries`: **19 errors — exact baseline**, 193 warnings, 2253 modules cruised; none
  of the 19 touch the new file. Reused the existing `TOOL_REGISTRATION_TEST_FROM_EXTRA` exemption in
  `.dependency-cruiser.mjs` (added the new file's path to the same list `ba002973` and the
  content-search integration test already use) — no new carve-out.
- Full new file alone: **10/10 pass**.
- Scoped regression (new file + the 3 pre-existing `mcp-ui-tool-calls-route.*` integration tests + all
  6 domains' own handler-level confirmation/trash-restore test files): **81/81 pass, 0 fail**
  (load average 36–107 across the run per `uptime`, no flakiness observed).

### Context used

Approximately 30% of budget at handoff.

### What remains

Nothing outstanding from this dispatch — the gap the prior closeout flagged is now closed for all 6
tools in the family.
