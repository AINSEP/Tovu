# Admin ports: the remaining 11, `@jini-ai/admin/core`

2026-08-01. Follow-on to `identity.ts` (already landed, 17 methods, the pattern-setter). This pass
wrote the other 11 generic ports extracted from Tovu's `apps/admin/src/lib/api.ts`
(1,548 lines / 134 methods, ~67 generic / ~67 Tovu-CMS-specific). All files live under
`/Users/la/Programming/Jini/packages/admin/src/core/ports/`.

Verification: `pnpm --filter @jini-ai/admin run typecheck` clean, `run test` 73/73 passing
(72 pre-existing + 1 new compile-time type test), `run build` clean. Types only — no `fetch` calls,
no route-group factories (that is a later slice). Nothing committed, per instruction.

## Ports written

| File | Port | Tovu `api.ts` methods covered |
|---|---|---|
| `auth.ts` | `AdminAuthPort` | `login`, `logout`, `me` |
| `members.ts` | `AdminMembersPort` | `listMembers`, `getMember`, `disableMember`, `requestMemberMagicLink` |
| `media.ts` | `AdminMediaPort` | `listMedia`, `mediaOriginalUrl`, `uploadMedia`, `updateMedia`, `trashMedia`, `deleteMedia` |
| `settings.ts` | `AdminSettingsPort` | `getSettingsEffective`, `setSetting`, `clearSetting`, `resetSettingsNamespace` |
| `database.ts` | `AdminDatabasePort` | `getDatabaseTimeline`, `listDatabaseRestorePoints`, `createDatabaseRestorePoint`, `planMigrateForward`, `confirmMigrateForward`, `executeMigrateForward` |
| `recovery.ts` | `AdminRecoveryPort` | `listRecoveryRestorePoints`, `computeRecoveryDisclosure`, `resolveRecoveryDeepLink`, `getRecoveryStatus`, `planRestore`, `confirmRestore`, `executeRestore` |
| `integrations.ts` | `AdminIntegrationsPort` | `listIntegrationSubscriptions`, `createIntegrationSubscription`, `pauseIntegrationSubscription`, `deleteIntegrationSubscription`, `listIntegrationDeliveries` |
| `comments.ts` | `AdminCommentsPort` | `listCommentsQueue`, `moderateComment`, `purgeComment`, `getCommentsSettings`, `putCommentsSettings` |
| `plugins.ts` | `AdminExtensionsPort` | `listPlugins`, `setPluginEnabled` |
| `analytics.ts` | `AdminAnalyticsPort` | `listRecentAnalyticsHits` |
| `workspace.ts` | `AdminWorkspacePort` | `getWorkspace`, `updateWorkspace`, `deleteWorkspace` |

Plus `ports/index.ts` (new barrel), `ports/README.md` (new, execution-absence note), and
`core/index.ts` updated to re-export everything from the new barrel alongside `identity.ts`'s
existing exports.

## Design decisions carried across every port

- **Dropped `workspaceId` from every entity DTO** (`AdminMember`, `AdminMedia`, `AdminComment`,
  `AdminPlugin`/`AdminExtension...`, restore points, ...), matching `identity.ts`'s own
  `AdminIdentityUser`, which already omits it. Tenancy scoping is a transport/route-factory
  concern, not a per-entity field on the DTO.
- **No error-code enums anywhere.** Every method documents expected failure *classes* in prose
  (conflict, not-found, authentication) rather than a `code` union, per `transport/errors.ts`'s
  header on why a shared code→message table is a regression.
- Optional properties use plain `?: T` (not `?: T | undefined`), matching `identity.ts`'s own
  style. These are pure interface declarations with no implementation assigning into them, so
  `exactOptionalPropertyTypes` does not force the explicit union the way it does in
  `transport/errors.ts` (which has a real constructor assignment site).

## DTOs reshaped, and why

- **`settings.ts`**: Tovu's `setSetting` input field is `valueJson: unknown`; the response DTO
  (`SettingValueResponse`) already just calls it `value`. Renamed the input field to `value` for
  get/set symmetry — a caller reading `SettingResolvedValue.value` and writing
  `setSetting({ value })` now uses one name throughout instead of two.
- **`auth.ts`**: gave it its own `AdminAuthUser` (`{ id, username }`) instead of reusing
  `AdminIdentityUser` from `identity.ts`. Tovu's `login`/`me` return a genuinely thinner shape than
  the identity-CRUD routes (no `principalId`, `status`, `roleIds`, ...) — this is not a naming
  accident in Tovu's own code, auth and identity-administration are different concerns with
  different lifecycles (see `identity.ts`'s own header on why members and identity are separate
  ports; the same argument applies one level up between auth and identity).
- **`plugins.ts`**: port interface named `AdminExtensionsPort` (generic — not every host calls
  this "plugins"), but the DTO (`AdminPlugin`) and method names (`listPlugins`/
  `setPluginEnabled`) keep Tovu's own vocabulary. "Plugin" is treated as already-generic
  industry terminology (like "role"/"policy" in `identity.ts`), not Tovu-specific jargon —
  renaming both the port and its members would have been a bigger diff for no behavioral gain.
  `setPluginEnabled`'s response `changeSetId` field is kept as an opaque audit-handle string
  (documented as such), not a claim that every host has Tovu's change-set/revert subsystem.
- **`integrations.ts`**: renamed `AdminWebhookSubscription`/`AdminWebhookDelivery` →
  `AdminIntegrationSubscription`/`AdminIntegrationDelivery` to match the port name, and documented
  in the header that "integrations" here specifically means outbound webhooks, not a broader
  per-provider connector concept Tovu doesn't actually have.

## The gated (plan/confirm/execute) triads: one fits `GatedOperation`, one doesn't

`gated/types.ts` (already in the package) defines `GatedOperation<TPlanInput, TDetails, TResult>`
with `confirm(token: string)` and `execute(confirmToken: string)` — single opaque strings, no
operation-specific extra fields.

- **`database.ts`'s `migrateForward`** is a direct, clean instance of `GatedOperation<void,
  unknown, MigrateForwardResult>`. Tovu's `planMigrateForward()` takes no input,
  `executeMigrateForward(confirmationToken)` takes only the token — nothing forced a reshape.
  Added a compile-time assertion of this at
  `src/core/__tests__/database-gated.test.ts` (`expectTypeOf`, checked by both `vitest run` and
  `tsc`/`typecheck`, since Vite/esbuild strips types at test-run time and would not itself catch a
  regression).
- **`recovery.ts`'s restore triad does NOT fit `GatedOperation`.** Tovu's `confirmRestore` needs
  `{ planId, planHash, disclosureAcknowledged }` (the token plus a mandatory disclosure
  acknowledgement) and `executeRestore` needs `{ confirmationToken, restorePointId }` (the token
  plus the target id, belt-and-suspenders against a replayed token). Both need an extra field
  `GatedOperation`'s fixed single-string signatures have no room for. Rather than force a fit or
  unilaterally widen the shared `GatedOperation` interface (a `gated/types.ts` change, outside this
  task's scope, and one that would loosen the guarantee for `migrateForward`'s consumers too),
  `AdminRecoveryPort` declares `planRestore`/`confirmRestore`/`executeRestore` as three plain
  methods that reuse `GatedPlanResult`/`GatedConfirmResult` for their return shapes without
  claiming the full structural contract. Flagged mid-task to the dispatcher; no redirect came back
  before this was written, so it shipped as designed. If a future gated ceremony also needs extra
  confirm/execute input, that's the signal `GatedOperation` itself may want a
  `TConfirmInput`/`TExecuteInput` parameter.
- `AdminRestorePoint`/`RestorePointCostClass`/`AdminRestorePointSummary` live in `database.ts`
  (where `createDatabaseRestorePoint` brings a restore point into being) and are imported into
  `recovery.ts` rather than redeclared — Database and Recovery are two views onto one persisted
  set, per both files' headers.

## Things confirmed against the actual server routes, not just `api.ts`'s client-side comments

Grepped `src/server/routes/admin/**` in Tovu to verify semantics before writing port docs, since a
few of these matter for how a panel should render the action:

- **`members/` has no enable route** — only `list`, `get-by-id`, `disable`,
  `request-magic-link`. Confirmed no `enableMember` exists to satisfy a hypothetical contract
  method, same reasoning as `identity.ts`'s documented absence of `deleteUser`.
- **`media/delete.ts` is a genuine hard purge** — gated by a narrower `media.delete.force`
  permission than `trash`'s `media.delete`, 409s with a `referencing` list if the asset hasn't been
  trashed first, irreversible once it succeeds. Documented as such; do not render "undo" for it.
- **`integrations/delete.ts` is a soft delete** — sets `status: "disabled"` + stamps
  `disabledAt`, never row-deletes, echoes the (now-disabled) subscription in the response. This is
  the opposite of media's delete despite both being called "delete" in `api.ts`'s method names —
  worth knowing before a panel author assumes symmetry across ports.
- **`comments/moderate.ts` and `purge.ts` both answer `204 No Content`** — confirmed
  `moderateComment`/`purgeComment` genuinely have nothing to return, and that a version-conflict
  rejection's body carries `currentVersion` (used in the port's doc comment about relying on
  `AdminApiError`/`AdminApiError`-equivalent `.body`).
- **`workspace/delete.ts` always rejects with `LAST_WORKSPACE`** in Tovu's v1 — the route is
  real and reachable, the guard is a deliberate, documented product policy
  (`WorkspaceLastRemainingError`), not a stub. `deleteWorkspace` stays on `AdminWorkspacePort`
  because a genuinely multi-workspace host needs it to work; the port doc says explicitly not to
  assume a well-formed, authorized call succeeds.

## Constraint 5 (no Tovu vocabulary leaks) — `AdminWorkspacePort`

Per the dispatch: `workspace.ts`'s header records that Tovu hard-codes
`WORKSPACE_ID = "workspace-local"` at `api.ts:1` and bakes it into every route path, and that this
port deliberately does not carry a `workspaceId` parameter on any method — each method operates on
"whatever workspace the current client/transport is scoped to," with multi-workspace resolution
left to a later, per-host transport/route-factory slice.

## Methods left off every contract, and why

- `AdminMembersPort`: no `enableMember` (route doesn't exist — see above).
- `AdminCommentsPort`: `purge` is not folded into `CommentModerationAction`'s four-member union
  (`approve`/`spam`/`trash`/`restore`) — it's a separate, ungated, differently-permissioned hard
  delete, not a fifth moderation action.
- `plugins.ts`/`AdminExtensionsPort`: no `execution` port anywhere in this package — see below.

## `execution`: confirmed absent, documented in `ports/README.md`

Per the dispatch's constraint 6: `@jini-ai/ui-core`'s `src/features/execution/ports.ts` already
defines an `ExecutionPort` (`detectLocalAgents`/`testConnection`/`listModels`/`testAgent`) covering
the same shape as Tovu's `detectExecutionAgents`/`testExecutionConnection`/`listExecutionModels`/
`testExecutionAgent`. Did not create a third definition. Added
`packages/admin/src/core/ports/README.md` recording the absence and pointing at `ui-core`'s port
by feature path and shape (not a hard import — `ui-core` may be moving to `@jini-ai/ui/core`
concurrently, and `/core` here must stay dependency-free regardless). Did not touch anything under
`packages/ui-core` or `packages/ui`.

## Pushback sent mid-task (no table changes needed)

Sent one message to the dispatcher after 4 ports (`auth`, `members`, `media`, `settings`) were done
and the pattern felt settled, flagging the `GatedOperation` fit question above before writing
`database.ts`/`recovery.ts`. The table's 11 groupings otherwise all held up once the actual DTOs and
server routes were read — no method turned out to be miscategorized, and no method turned out to be
Tovu-CMS-specific after all (all 41 methods across these 10 ports, plus `identity.ts`'s prior 17,
check out as genuinely generic admin capabilities).

---

## Coordinator correction, applied after this report was written

The section above titled "**The gated triads: one fits `GatedOperation`, one doesn't**" is
**superseded**. Restore *does* fit, and now is one.

What happened: the agent flagged the `GatedOperation` mismatch mid-task and asked whether to widen
the shared interface. The Coordinator agreed and widened it — but **two `SendMessage` redirects
failed to reach the agent** (both returned `success`; the agent's final report states "no redirect
came back"). So `recovery.ts` was written, correctly and coherently, against the pre-widening
signature.

`src/core/gated/types.ts` now carries two extra type parameters defaulting to `string`:

```ts
GatedOperation<TPlanInput, TDetails, TResult, TConfirmInput = string, TExecuteInput = string>
```

Applied to `recovery.ts`:

- `AdminRecoveryPort.restore` is a real `GatedOperation<string, unknown, RestoreExecuteResult,
  RestoreConfirmInput, RestoreExecuteInput>` — replacing the three loose
  `planRestore`/`confirmRestore`/`executeRestore` methods, and mirroring how `database.ts` exposes
  `migrateForward`.
- New exported `RestoreConfirmInput` / `RestoreExecuteInput`, wired through both barrels.
- The file header's "Why the restore triad is NOT typed as `GatedOperation`" section was rewritten
  rather than deleted — the agent's own inference ("if a fourth ceremony needs extra confirm/execute
  input, that is a signal `GatedOperation` itself may need a `TConfirmInput`/`TExecuteInput`
  parameter") was correct and is preserved as a note.
- The `restorePointId` re-verification warning is retained unchanged; it is independent of typing.
- New `src/core/__tests__/recovery-gated.test.ts` (3 compile-time assertions) pins the parameterized
  case alongside `database-gated.test.ts`'s defaulted one.

**Why this was worth correcting rather than documenting around:** `disclosureAcknowledged` shows the
protocol is *recorded informed consent*, not a two-step token handshake. Restore is the most
destructive operation a host exposes. An abstraction covering migrate-forward while excluding
restore describes the easy case and abandons the one that needs the ceremony.

Verified after the change: typecheck clean, **76/76 tests** passing (73 + 3 new), build clean, and
all six spot-checked types present in the emitted `dist/core/index.d.ts`.

**Everything else in this report stands as written** — including the server-route verifications
(`integrations/delete.ts` is a soft delete despite its name; `media/delete.ts` is a genuine hard
purge; `workspace/delete.ts` always rejects with `LAST_WORKSPACE` in Tovu v1), which were checked
against `src/server/routes/admin/**` rather than inferred from client comments.

---

## Agent's own follow-up, after receiving message #2

Message #2 (the explicit "do not start other work" redirect) arrived and was paraphrased back
before acting, per instruction. By the time this agent re-read `recovery.ts` to apply the fix, the
Coordinator's edit above was already on disk (confirmed by an `Edit` conflict: "file has been
modified since read" on a first attempt using the stale pre-widening content) — so this agent did
not re-do the fix, only verified and closed one gap the addendum didn't mention:

- **`database-gated.test.ts`'s own docstring was stale** — it still said `migrateForward` was a
  direct instance of `GatedOperation` "unlike `recovery.ts`'s restore triad ... which does not
  fit". Restore fits now, so that clause was wrong. Reworded to describe `database-gated.test.ts`
  and `recovery-gated.test.ts` as the defaulted and parameterized cases of one shared assertion
  pair, cross-referencing each other, rather than one file claiming the other's case is impossible.
- Independently reran all three gates rather than trusting the addendum's numbers: `typecheck`
  clean, **76/76 tests** (matches), `build` clean.
- One open naming question, not acted on: the Coordinator's message #2 described the new
  `TConfirmInput`/`TExecuteInput` fields with Tovu's literal wire names (`planId`, `planHash`,
  `confirmationToken`). The on-disk `RestoreConfirmInput`/`RestoreExecuteInput` instead use
  `token`/`confirmToken`, matching `GatedPlanResult.token`/`GatedConfirmResult.confirmToken`'s
  existing "opaque, panels must not parse or construct these" convention. Left as-is since it is
  the more internally consistent choice and the addendum's own description ("written, correctly and
  coherently") reads as satisfied with it — flagged here only so the naming choice is a visible,
  deliberate record rather than a silent divergence from the literal instruction.
