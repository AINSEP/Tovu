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

**Remaining work**: all 7 domains' handler wiring + tests, `MCP_UI_REDEEMABLE_TOOL_IDS` additions,
ADR-055 status update, `check:boundaries` baseline re-check (must stay 19), live admin E2E run + DB
read-only verification, final report.
