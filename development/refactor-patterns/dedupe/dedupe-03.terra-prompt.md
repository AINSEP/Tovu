# Terra job dedupe-03: Tovu website: feature-level merges + import swaps to existing Jini exports

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Tovu clone you are given.

Order: X (import swaps) first, then T/TR groups. Groups that name a Jini export use only exports that are already public in the installed `@jini-ai/*` packages; if an import does not resolve, STALE it (never edit Jini from this job).

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`. New functions take `(required: {...}, optional: {...} = {})`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **X01** REPOINT-NOW — risk -; est. −165 lines; divergence: none (snapshot = Jini source + 1 header line; provenance hash test exists only to police the copy)
- **X06** REPOINT-NOW — risk -; est. −95 lines; divergence: 2nd arg is a port object {getPathForFile} in Jini vs bare function in Tovu; logic identical. (Tovu captureFolderDrop joins paths with a space; Jini captureFolderPathDrop quotes whitespace paths - not part of this swap)
- **X10** REPOINT-NOW — risk -; est. −20 lines; divergence: Tovu adds assistant_conversation_tool_approvals table; shared tables identical
- **X11** REPOINT-NOW — risk -; est. −16 lines; divergence: none (field-for-field)
- **X15** moved to job dedupe-11 (waits for X15J + Jini release R1)
- **X17** REPOINT-NOW — risk -; est. −14 lines; divergence: none (Tovu adds unused _optional param)
- **X19** REPOINT-NOW — risk -; est. −30 lines; divergence: none (Tovu adds unused _optional param)
- **X21** REPOINT-NOW — risk -; est. −22 lines; divergence: only mailer field type differs (Tovu MailerPort via toTovuMailer); all other members identical and their types already come from @jini-ai/platform/mail
- **X25** REPOINT-NOW — risk -; est. −12 lines; divergence: none (same name, same method; Tovu doc-only)
- **X27** REPOINT-NOW — risk -; est. −10 lines; divergence: Tovu adds failure?: UserFacingError | null; rest identical
- **X30** REPOINT-NOW — risk -; est. −34 lines; divergence: none (Jini adds unused _optional param)
- **X31** REPOINT-NOW — risk -; est. −22 lines; divergence: Jini optionals are "| undefined" (exactOptionalPropertyTypes) - wider, assignable both ways for readers; PageHeadContext/EntryRef NOT swapped (Jini themeTier is string, ancestors.title string|undefined)
- **T30** MERGE INTO EXISTING — risk L; est. −~260 lines (31 copies, not 20); divergence: shared type adds optional metadata + authorization.orPermission (widening only); 5 files require inputSchema (view-image, seo, web-screenshot, webhooks, plugin-runtime) and publish-content narrows actorClassRuleRule - kept via the intersection
  - tests: npx tsc --noEmit -p apps/website (type-only) + npx tsx --test --test-concurrency=1 apps/website/src/features/<each touched feature>/__tests__/**/agent-tools*.test.ts
- **T32** MERGE INTO EXISTING — risk L; est. −15 lines; divergence: none
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/server/inbound/admin-http/routes/members/__tests__ (members route tests) + apps/website/src/features/members/__tests__
- **T33** MERGE INTO EXISTING (moved from job 10) — risk M; est. −35 lines; divergence: YES, kept explicitly: admin send pipeline hard-wires `isSendingEnabled: false` and supplies `unsubscribe` + `sleep`; the agent-tool pipeline honors `newsletterSendingEnabled` and supplies neither. Both are passed into one builder; characterization test pins them
  - tests: the new deps-builders.characterization.test.ts, then npx tsx --test --test-concurrency=1 apps/website/src/features/newsletter/__tests__ + apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__ (one file at a time)
- **T34** MERGE INTO EXISTING — risk L; est. −25 lines; divergence: none for the two merged projections (delivery detail, change-set header); subscription projections are DIFFERENT contracts and stay separate
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/features/webhooks/__tests__ apps/website/src/features/change-sets/__tests__ + inbound integrations/change-sets tests
- **TR01** EXTRACT SHARED HELPER — risk M; est. −50 lines; divergence: media_import_* result JSON key order changes (createdBy moves from 6th to 2nd, matching media_generate_asset); values identical. Any deep-equal test is unaffected; a string snapshot would need updating
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts apps/website/src/features/media-import/__tests__/tool-registrations.test.ts apps/website/src/features/media/__tests__/content-duplicate.media.test.ts apps/website/src/features/media/__tests__/agent-upload-sniff.test.ts apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload.test.ts apps/website/src/server/inbound/admin-http/routes/media/__tests__/import-url.test.ts
- **TR02** MERGE INTO EXISTING — risk L; est. −8 lines; divergence: stronger only: adds fsync of file and directory and an explicit chmod; same temp name `.<file>.<pid>.<uuid>.tmp`, same 2-space JSON, mode forced 0600 like today
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/server/runtime/composition/__tests__/pending-agent-plugin-tokens.apply.test.ts apps/website/src/server/runtime/composition/__tests__/pending-agent-plugin-tokens.seal.unit.test.ts apps/website/src/server/runtime/composition/__tests__/storage-secret.unit.test.ts apps/website/src/server/runtime/composition/__tests__/storage-secret.l245.unit.test.ts
- **TR03** EXTRACT SHARED HELPER — risk L; est. −12 lines; divergence: none; also drops the redundant `repo.findOne!` (AssistantVaultRepo already types findOne non-null)
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/assistant/__tests__/execution-credential-store.test.ts apps/website/src/assistant/__tests__/site-credential-store.test.ts apps/website/src/assistant/__tests__/assistant-vault.unit.test.ts apps/website/src/assistant/__tests__/byok-credential.test.ts
- **TR07** EXTRACT SHARED HELPER — risk L; est. −10 lines; divergence: none
  - tests: npx tsx --test --test-concurrency=1 apps/website/src/platform/site-dir/__tests__/integration/init-site.integration.test.ts apps/website/src/platform/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts apps/website/src/platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts apps/website/src/platform/site-dir/__tests__/integration/duplicate-site-branches.integration.test.ts

## Recipes (exact before → after)

## X01: published-site WebMCP script snapshot -> `@jini-ai/agentic/core#createAnnotatedActionsScript`
- The snapshot is a deliberate copy. `features/webmcp/README.md` says to replace it with `@jini-ai/agentic/core` at the next release, and the installed 0.7.0 now exports it with the same signature.
- `website/src/features/webmcp/published-html.ts` line 2:
  - before: `import { createAnnotatedActionsScript } from './generated/annotated-actions-script.js';`
  - after:  `import { createAnnotatedActionsScript } from '@jini-ai/agentic/core';`
- Delete `website/src/features/webmcp/generated/annotated-actions-script.ts` and `website/src/features/webmcp/generated/provenance.json`.
- Delete the test `'the deployment snapshot matches its captured Jini source hash without requiring a sibling checkout'` in `website/src/features/webmcp/__tests__/published-site.test.ts` (around lines 60-67), plus its `createHash`/`readFileSync` imports if nothing else uses them.
- In `features/webmcp/README.md`, replace the "generated source snapshot" paragraph with one line: the script comes from `@jini-ai/agentic/core`.
- Importers: `published-html.ts` only, plus the provenance test.

## X06: desktop folder-drop -> `@jini-ai/ui/core#folderPathsFromDataTransfer`
- Behavior is the same. The only change is that the second argument is now a port object.
- `desktop/src/renderer/use-workspace-chat-pane.hooks.ts`:
  - line 33: `import { folderPathsFromDataTransfer } from './folder-drop.js';` -> `import { folderPathsFromDataTransfer } from '@jini-ai/ui/core';`
  - line 89: `folderPathsFromDataTransfer(event.dataTransfer, getPathForFile)` -> `folderPathsFromDataTransfer(event.dataTransfer, { getPathForFile })`
- `desktop/src/renderer/import-drop.ts`:
  - line 5: same import swap.
  - line 27: `folderPathsFromDataTransfer(dataTransfer, getPathForFile)` -> `folderPathsFromDataTransfer(dataTransfer, { getPathForFile })`
- Delete `desktop/src/renderer/folder-drop.ts` and `desktop/src/renderer/folder-drop.test.ts`. Jini covers the same logic in `packages/ui/src/__tests__/features/folder-path-drop/rules.test.ts`.
- Move the folder-drop header's Electron "why" (`webUtils.getPathForFile` returns `''` for synthesized Files) into a short comment at the `captureFolderDrop` call site. Owner rule: refactors move why-comments, never delete them.
- Comment-only references to update: `App.hooks.test.ts:10`, `import-drop.ts:3`, `persistable-messages.ts:12`.
- Not in this swap: Tovu `captureFolderDrop` joins paths with a space, while Jini `captureFolderPathDrop` quotes paths that contain whitespace. Switching to Jini's version is a visible behavior change and needs its own decision.

## X10: chat DB table types -> `@jini-ai/chat/store/runtime#ChatDatabase`
- `website/src/platform/db/chat-kernel.ts` lines 39-60, the `export type ChatDatabase = { ... };` block:
  - after:
    ```ts
    import type { ChatDatabase as JiniChatDatabase } from "@jini-ai/chat/store/runtime";
    export type ChatDatabase = JiniChatDatabase & {
      assistant_conversation_tool_approvals: AssistantConversationToolApprovalsTable;
    };
    ```
- Keep `AssistantAgentSessionsTable` and `AssistantConversationToolApprovalsTable` exported, since their shapes are host-owned migrations.
- Jini already includes `ai_chats`, `ai_chat_messages`, `assistant_agent_sessions` and `assistant_run_attempts` with the same columns.
- Importers: the name is unchanged, so none change (`open-site-db-client.ts`, the migrations tests and `chat-dialect-matrix.ts`).

## X11: database ledger append row -> `@jini-ai/db/recovery#LedgerAppendPort`
- `website/src/platform/db/sqlite/database-journal-repo.ts`:
  - Add the import: `import type { LedgerAppendPort } from "@jini-ai/db/recovery";`
  - Lines 113-130: replace the inline 16-field `append(row: { ... }): Promise<void> {` parameter type with
    `async append(row: Parameters<LedgerAppendPort["append"]>[0]): Promise<void> {`
- Optional: add `LedgerAppendPort` to the class `implements` list.
- Importers: none change.

## X15: moved to job dedupe-11
It must import from the framework-neutral `@jini-ai/cms/forms` (Jini job 08, X15J), which exists only after the Jini release (gate R1). Skip it here.

## X17: owner-wildcard check -> `@jini-ai/user-management/server#principalHoldsOwnerWildcard`
- `website/src/features/identity/delete-user-service.ts`:
  - line 3:
    - before: `import { resolveEffectivePermissions, authorizeDepsFrom, type AuthServiceDeps } from "@jini-ai/user-management/server";`
    - after:  `import { principalHoldsOwnerWildcard, type AuthServiceDeps } from "@jini-ai/user-management/server";`
      (`resolveEffectivePermissions` and `authorizeDepsFrom` are used only by the deleted body)
  - Add: `export { principalHoldsOwnerWildcard };`
  - Delete lines 98-113 (the "Private copy" doc and the function).
  - Update the header (lines ~26-27). `principalHoldsOwnerWildcard` is now imported. Only `countActiveOwnerWildcardPrincipals` remains a private copy (see X18).
- Behavior is identical. The only removed difference is an unused `_optional` parameter.
- Importers: unchanged (`server/inbound/admin-http/dev-auth.ts:37`, `routes/users/remove-policy-permission.ts:2`, `identity/__tests__/delete-user-service.test.ts`).

## X19: .env line helpers -> `@jini-ai/platform/fs#upsertEnvLine, readEnvLine`
- `website/src/platform/site-dir/active-site.ts`:
  - Add: `import { readEnvLine, upsertEnvLine } from "@jini-ai/platform/fs";` and `export { readEnvLine, upsertEnvLine };`
  - Delete `upsertEnvLine` (doc ~56-63, body 64-81) and `readEnvLine` (doc ~121-138, body 139-143).
- The bodies are identical. Keep one line of the trailing-newline why-comment at the persist call site.
- Importers: `platform/site-dir/__tests__/unit/active-site.unit.test.ts` (unchanged through the re-export).

## X21: resolved-mailer interface -> `@jini-ai/platform/mail#ResolvedMailer`
- `website/src/server/runtime/boot/resolve-mailer.ts`:
  - Add `type ResolvedMailer as JiniResolvedMailer` to the existing `@jini-ai/platform/mail` import (lines 3-11).
  - Lines 117-142: replace the interface body with
    ```ts
    export interface ResolvedMailer extends Omit<JiniResolvedMailer, "mailer"> {
      /** Tovu's purpose-scoped MailerPort (`toTovuMailer`), not Jini's. */
      mailer: MailerPort;
    }
    ```
- Every other member type already comes from `@jini-ai/platform/mail`, through `#src/platform/mail` re-exports.
- Tovu's longer `domainRequirements` doc moves to the Jini interface, or is kept as one line here.
- Then `MailStatusReport`, `MailProviderConfigurationReport`, `SenderDomainVerificationPort`, `MailDeliveryLane`, `MailProviderCheck` and `DomainRequirement` may become unused imports. Remove whichever lint flags.
- Importers: none change (`composition/site-mailer.ts`, `server/routes/types.ts`, 5 tests).

## X25: entries list-excluding-types port -> `@jini-ai/cms/widgets/resolvers#EntryListExcludingTypesPort`
- `website/src/features/entries/contracts.ts` lines 31-43 (the interface and its doc block above it):
  - after: `export type { EntryListExcludingTypesPort } from "@jini-ai/cms/widgets/resolvers";`
- Drop `EntryStatus` from the line 1 import if nothing else in the file uses it.
- Keep the why-comment ("exclusion is applied before `limit`") as one line above the re-export.
- Importers: unchanged (`entries/public-list.ts`, `entries/repo.ts`, `entries/trash-aware-memory-repo.ts`, `publish-content/type-registry.ts`, `server/routes/types.ts`, `widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts`).

## X27: login controller type -> `@jini-ai/user-management/react#LoginController`
- `admin/src/features/auth/hooks/use-login.hooks.ts`:
  - line 2:
    - before: `import { useLogin as useJiniLogin } from "@jini-ai/user-management/react";`
    - after:  `import { useLogin as useJiniLogin, type LoginController as JiniLoginController } from "@jini-ai/user-management/react";`
  - Lines 33-43:
    - after:  `export interface LoginController extends JiniLoginController { failure?: UserFacingError | null }`
- Importers: `features/auth/__tests__/Login.unit.test.tsx` (unchanged).

## X30: keyset cursor -> `@jini-ai/cms/core#encodeKeysetCursor, decodeKeysetCursor`
- The whole 34-line file is identical, apart from Jini's unused `_optional` parameter.
- `website/src/platform/db/sqlite/database-journal-repo.ts` line 10:
  - before: `import { decodeKeysetCursor, encodeKeysetCursor } from "../keyset-cursor.js";`
  - after:  `import { decodeKeysetCursor, encodeKeysetCursor } from "@jini-ai/cms/core";`
- Delete `website/src/platform/db/keyset-cursor.ts` and `website/src/platform/db/__tests__/keyset-cursor.test.ts`. Check that Jini has a matching test before deleting the Tovu one.
- Importers: `database-journal-repo.ts` and the test, nothing else.

## X31: page-head element types -> `@jini-ai/cms/seo#HeadElement, JsonLd`
- `website/src/server/inbound/public-http/http/site/page-head.ts`:
  - Add: `import type { HeadElement, JsonLd } from "@jini-ai/cms/seo";` and `export type { HeadElement, JsonLd };`
  - Delete line 25 (`export type JsonLd = JsonObject;`), the private `interface HeadElementBase` (lines 27-~42; move its priority-band why-comment to the Jini type) and `export type HeadElement = ...` (lines 44-~63).
  - Drop `JsonObject` from the line 1 import.
- Do NOT swap `PageHeadEntryRef`, `PageHeadContext`, `PageHeadHook` or `HeadElementKey`. Jini's `themeTier` is `string` (Tovu narrows it to `ThemeTier`), `ancestors[].title` is `string | undefined`, and `HeadElementKey` is `string` (Tovu derives it from `headElementKey`).
- The only difference: Jini optionals carry `| undefined`, which readers can ignore.
- Afterwards, the Jini `packages/cms/src/seo/types.ts` header ("structural DUPLICATE of page-head.ts") should be reworded so that Jini is canonical (Jini-side doc edit).
- Importers: unchanged (`http/site/__tests__/page-head.test.ts`, `features/seo/__tests__/cover-image-head.test.ts`).

---

### T30: `AgentToolDefinition` from `@jini-ai/core`
31 local copies (as of tovu-terra-d3 3a791f5ce; every local `AgentToolActorClassRule` union equals Jini's). Paths are under `apps/website/src/`. Do exactly the form named for each file's group; no discovery command is needed.

**G0, 11 non-exported copies whose `sideEffects` already uses core's `AgentToolSideEffect`** (imported from `@jini-ai/core` in the same file): delete the local `interface AgentToolDefinition {…}` and add `type AgentToolDefinition` to that file's existing `@jini-ai/core` type import. Exception: `features/media/view-image-tool.ts` has a REQUIRED `inputSchema`, so it gets `type AgentToolDefinition = SharedAgentToolDefinition & { inputSchema: Readonly<Record<string, unknown>> };` (import `AgentToolDefinition as SharedAgentToolDefinition`).
- `assistant/admin-screen-link-tool.ts`, `assistant/ask-choice-tool.ts`, `assistant/component-catalog-tool.ts`, `assistant/demo-a2ui-tool.ts`, `assistant/demo-choices-tool.ts`, `assistant/demo-image-tool.ts`, `assistant/external-mcp-reauth-tool.ts`, `assistant/render-ui-tool.ts`
- `features/site-backup/tool-registrations.ts`, `features/source-control/tool-registrations.ts`
- `features/media/view-image-tool.ts` (required `inputSchema`, see above)

**The 20 exported copies** (`features/<x>/agent-tools.ts`). In each: add `import type { AgentToolDefinition as SharedAgentToolDefinition } from "@jini-ai/core";`; keep the file's local `AgentToolSideEffect` union (domain tightening, allowed by `packages/core/src/agent-tools.ts:12-13` in Jini); replace `export interface AgentToolDefinition {…}` with the form for its group:
- **G1 default** (`export type AgentToolDefinition = SharedAgentToolDefinition & { sideEffects: AgentToolSideEffect };`), 11 files: `media-generation`, `media-import`, `pages`, `post`, `redirects`, `site-evidence`, `site-inspection`, `sites`, `theme`, `trash`, `web`.
- **G2 required inputSchema** (`… & { sideEffects: AgentToolSideEffect; inputSchema: Readonly<Record<string, unknown>> }`), 3 files: `seo`, `web-screenshot`, `webhooks`.
- **G3 default + actor-class rule re-export**, 4 files: `members`, `newsletter`, `recovery`, `widgets`. G1 form, and replace the local `AgentToolActorClassRule = …` with `export type { AgentToolActorClassRule } from "@jini-ai/core";` (keep the export: other files import it from here).
- **G4 required inputSchema + rule re-export**, 1 file: `plugin-runtime`. G2 form plus the G3 re-export.
- **G5 narrowed rule**, 1 file: `publish-content`: `export type AgentToolDefinition = SharedAgentToolDefinition & { sideEffects: AgentToolSideEffect; actorClassRule?: "confirmer-must-equal-own-delegatedBy" };`.

Count check: G0 11 + G1 11 + G2 3 + G3 4 + G4 1 + G5 1 = 31.
Move the `inputSchema` JSDoc ("JSON Schema for this tool's `input`… refuses to wire any tool lacking one", plus any file-specific line such as recovery's "Optional, matching…") onto the alias or the import line's neighbour comment; this follows the comments/forms precedent. Do not edit `features/sites/index.ts` (it re-exports the alias by name and keeps working).
Run `npx tsc --noEmit -p apps/website` once at the end to type-check (this job's only full tsc).

### T32, T33, T34: feature-owned builders and mappers (run after dedupe-01/02 have landed; in `server/inbound/*` change only the lines named here)
- T32:
  - Export `toMembersWriteServiceDeps` from `features/members/tool-registrations.ts`.
  - Its parameter becomes `Pick<MembersToolDeps, "clock" | "idGen" | "memberRepo" | "memberTierRepo" | "memberSubscriptionRepo" | "memberSessionRepo" | "magicLinkRepo" | "mailer" | "mailStatus" | "originRegistry" | "principalRepo" | "mailSenderIdentity">`.
  - `server/inbound/admin-http/routes/members/deps.ts` deletes its copy and re-exports it with `export { toMembersWriteServiceDeps } from "../../../../../features/members/tool-registrations.js";`. Check the relative depth first.
- T33 (moved here from job 10; it no longer waits on O4 because both launch-gate behaviors are passed in explicitly, so the merge changes nothing; O4 stays an open owner question):
  1. FIRST write the characterization test `apps/website/src/features/newsletter/__tests__/deps-builders.characterization.test.ts` (reuse the deps fixture of an existing newsletter route test: `rg -l "toSendPipelineDeps|NewsletterRouteDeps" apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__`; no `as any`). It must PASS on the code before the change and after it:
     - admin `toSendPipelineDeps(routeDeps)`: `unsubscribe` is defined (equal to `toUnsubscribeDeps(routeDeps)` field by field), `typeof sleep === "function"`, and `await launchGateDeps.isSendingEnabled("ws")` is `false` even when the fixture carries a `newsletterSendingEnabled` that returns `true`;
     - tool `toNewsletterSendPipelineDeps(toolDeps)`: `"unsubscribe" in result` and `"sleep" in result` are both `false`, and `isSendingEnabled` returns what `toolDeps.newsletterSendingEnabled` returns (and `false` when it is absent).
  2. New `apps/website/src/features/newsletter/deps-builders.ts` (features may not import inbound; inbound may import features). Bodies are the current admin `deps.ts` bodies, key order unchanged:
```ts
export type ConfirmationSourceDeps = Pick<NewsletterToolDeps, "newsletterConfirmationTokenRepo" | "newsletterSubscriptionRepo" | "mailer" | "membersConsentCapability" | "originRegistry" | "clock" | "idGen" | "mailSenderIdentity">;
export type SubscriptionsSourceDeps = ConfirmationSourceDeps & Pick<NewsletterToolDeps, "newsletterListRepo" | "newsletterSubscriberDirectory">;
export type SendPipelineSourceDeps = Pick<NewsletterToolDeps, "newsletterCampaignRepo" | "newsletterSubscriptionRepo" | "newsletterAudienceSnapshotRepo" | "newsletterSendRepo" | "newsletterSubscriberDirectory" | "newsletterHooks" | "mailer" | "membersConsentCapability" | "originRegistry" | "outbox" | "bus" | "clock" | "idGen">;
export function buildConfirmationDeps({ deps }: { deps: ConfirmationSourceDeps }, _optional: Record<string, never> = {}): ConfirmationDeps
export function buildSubscriptionsDeps({ deps }: { deps: SubscriptionsSourceDeps }, _optional: Record<string, never> = {}): SubscriptionsDeps   // confirmationDeps: buildConfirmationDeps({ deps })
export function buildSendPipelineDeps(
  { deps, isSendingEnabled }: { deps: SendPipelineSourceDeps; isSendingEnabled: (workspaceId: string) => Promise<boolean> },
  { unsubscribe, sleep }: { unsubscribe?: UnsubscribeDeps; sleep?: (ms: number) => Promise<void> } = {},
): SendPipelineDeps
```
     `buildSendPipelineDeps` returns the admin object with `isSendingEnabled` from the argument, `...(unsubscribe === undefined ? {} : { unsubscribe })` where admin has `unsubscribe:`, and `...(sleep === undefined ? {} : { sleep })` where admin has `sleep:`. Move the two inline comments ("Campaign mail is bulk…", "Short provider quota hints…") onto those spreads. If a `Pick` key does not exist on `NewsletterToolDeps`, STALE T33.
  3. Keep every existing exported name and its positional signature as a one-line adapter (no caller changes):
     - `features/newsletter/tool-registrations.ts`: delete the local `toConfirmationDeps`/`toSubscriptionsDeps` bodies and replace their calls in this file with `buildConfirmationDeps({ deps })` / `buildSubscriptionsDeps({ deps })`. `toNewsletterSendPipelineDeps(deps)` stays exported with its doc; body: `return buildSendPipelineDeps({ deps, isSendingEnabled: deps.newsletterSendingEnabled ?? (async () => false) });` (no `unsubscribe`, no `sleep`: today's agent-tool behavior, see PLAN.md bug list).
     - admin `routes/newsletter/deps.ts`: `toConfirmationDeps` / `toSubscriptionsDeps` bodies become `return buildConfirmationDeps({ deps });` / `return buildSubscriptionsDeps({ deps });`. `toSendPipelineDeps` keeps its whole doc block verbatim; body: `return buildSendPipelineDeps({ deps, isSendingEnabled: async () => false }, { unsubscribe: toUnsubscribeDeps(deps), sleep: (ms) => delay(ms) });`.
     - public `routes/site/newsletter-deps.ts`: `toPublicConfirmationDeps` body becomes `return buildConfirmationDeps({ deps });` (this was RG5).
  4. Run the characterization test, then the newsletter tests listed for T33. Commit "refactor(website): one newsletter deps builder, both launch-gate bindings kept (dedupe T33/RG5)".
- T34 (only the identical projections; the two SUBSCRIPTION projections stay separate on purpose):
  - Do NOT merge `features/webhooks/tool-registrations.ts#toSubscriptionToolView` with `admin-http/http/integrations.ts#toAdminSubscriptionResponse`: the tool view nests the FULL delivery view, the admin response nests `toAdminDeliverySummary` (7 fields). Merging would add `eventId`, `topic`, `nextAttemptAt`, `signedWithVersion`, `subscriptionId`, `deadAt` to the admin HTTP list response. `toAdminDeliverySummary` also stays.
  - Delivery: in `features/webhooks/tool-registrations.ts` rename `toDeliveryToolView` to `toWebhookDeliveryView`, change it to `export function toWebhookDeliveryView({ delivery }: { delivery: WebhookDeliveryRecord }, _optional: Record<string, never> = {})` (body unchanged, doc unchanged) and update every in-file reference (`rg -n toDeliveryToolView` in that file): a call `toDeliveryToolView(x)` becomes `toWebhookDeliveryView({ delivery: x })`, a bare reference such as `.map(toDeliveryToolView)` becomes `.map((delivery) => toWebhookDeliveryView({ delivery }))`. In `admin-http/http/integrations.ts` keep `export function toAdminDeliveryResponse(delivery: WebhookDeliveryRecord): AdminWebhookDeliveryResponse` with its doc; body becomes `return toWebhookDeliveryView({ delivery });` (both return the same 13 fields in the same order; checked at 60f52fea1). If the compiler rejects the return type, STALE this half.
  - Change sets: in `features/change-sets/tool-registrations.ts` rename `toChangeSetToolView` to `toChangeSetView`, export it as `({ changeSet }: { changeSet: ChangeSetRecord }, _optional: Record<string, never> = {})`, update every in-file reference the same way (calls and bare `.map(...)` references). Its doc ("deliberately separate from the admin HTTP response-serializer module…") is now wrong: replace that clause with "shared with `admin-http/http/change-sets.ts#toChangeSetHeaderResponse`, which delegates here"; keep the `inversePayload` sentence. In `admin-http/http/change-sets.ts` keep `export function toChangeSetHeaderResponse(changeSet: ChangeSetRecord)`; body becomes `return toChangeSetView({ changeSet });`. Keep that file's `@file` header (the `inversePayload` rule).
  - Imports in inbound use the `#src/features/...` alias form already used in that file, or the relative form if the file has no alias imports.

## TR01 assistant media persistence (EXTRACT, new apps/website/src/features/media/persist-assistant-media.ts)
```ts
import { sniffContentType, uploadMedia, type SniffedContentType, type UploadMediaInput } from "@jini-ai/cms/media";
import { TOVU_MAX_UPLOAD_BYTES } from "../../contracts/core/upload-limits.js";
import { captureMediaUploaded } from "./analytics.js";
import type { MediaContentTypeStorePort } from "./content-type-store.js";
import { resolveMediaPublicUrls } from "./tool-registrations.js";

type UploadMediaDeps = Parameters<typeof uploadMedia>[0]["deps"];

/** The six stores `uploadMedia` writes through, under the names Tovu's route and tool deps use. */
export interface MediaUploadRouteDeps {
  clock: UploadMediaDeps["clock"];
  idGen: UploadMediaDeps["idGen"];
  mediaRepo: UploadMediaDeps["mediaRepo"];
  assetBlobRepo: UploadMediaDeps["blobRepo"];
  assetRenditionRepo: UploadMediaDeps["renditionRepo"];
  blobStore: UploadMediaDeps["blobStore"];
}

/** Maps Tovu's deps names onto `uploadMedia`'s. @complexity O(1). */
export function mediaUploadDeps({ routeDeps }: { routeDeps: MediaUploadRouteDeps }, _optional: Record<string, never> = {}): UploadMediaDeps {
  return {
    clock: routeDeps.clock, idGen: routeDeps.idGen, mediaRepo: routeDeps.mediaRepo,
    blobRepo: routeDeps.assetBlobRepo, renditionRepo: routeDeps.assetRenditionRepo, blobStore: routeDeps.blobStore,
  };
}

/** What every assistant media-producing tool returns: the SAME shape `media_upload_asset`/
 *  `media_list_assets` return, so the model can chain straight into `media_update_metadata`/
 *  `media_trash_asset` off `id` with no separate lookup, and use `publicUrl` to embed the image.
 *  Declared here rather than imported: `@jini-ai/cms/media`'s equivalent view type is an internal
 *  projection, not public surface. */
export interface AssistantMediaView {
  id: string;
  createdBy: string | null;
  /** The asset's short lookup name (2026-09-16) — a page marker can reference this instead of the
   *  long `id`; mirrors `@jini-ai/cms/media`'s own `MediaToolView.slug` addition. */
  slug: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: string;
  version: number;
  publicUrl: string | null;
}

export type PersistAssistantMediaDeps = MediaUploadRouteDeps & Parameters<typeof resolveMediaPublicUrls>[0] & {
  mediaContentTypeStore: MediaContentTypeStorePort;
  tracker?: Parameters<typeof captureMediaUploaded>[0]["tracker"];
};

/**
 * Persists already-validated bytes through the upload/dedupe service, records their sniffed type
 * and returns the shared projection. The sniff is the same "record what the bytes actually are"
 * write `server/inbound/admin-http/routes/media/upload.ts` performs after every human upload:
 * sniffed, never trusted from the declared `contentType`. Storage failures propagate.
 * @complexity O(n) in the bytes for hashing/storage; fixed-count repository operations.
 */
export async function persistAssistantMedia(
  { routeDeps, input, actorId }: { routeDeps: PersistAssistantMediaDeps; input: UploadMediaInput; actorId: string },
  _optional: Record<string, never> = {},
): Promise<{ media: AssistantMediaView; sniffed: SniffedContentType }> {
  const { media } = await uploadMedia({ deps: mediaUploadDeps({ routeDeps }), input }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
  const sniffed = sniffContentType({ bytes: input.bytes });
  await routeDeps.mediaContentTypeStore.set({ workspaceId: routeDeps.workspaceId, sha256: media.source.sha256, contentType: sniffed });
  captureMediaUploaded({ tracker: routeDeps.tracker, actorId, byteLength: input.bytes.byteLength, kind: "image", source: "assistant" });
  const urls = await resolveMediaPublicUrls(routeDeps, [media]);
  return {
    media: {
      id: media.id, createdBy: media.createdBy ?? null, slug: media.slug, title: media.title, alt: media.alt,
      caption: media.caption, credit: media.credit, sha256: media.source.sha256, status: media.status,
      version: media.version, publicUrl: urls.get(media.id) ?? null,
    },
    sniffed,
  };
}
```
(If `SniffedContentType`/`UploadMediaInput` come from a different module than `@jini-ai/cms/media`, take them from where `features/media/index.ts` re-exports them.) Export the three names from `features/media/index.ts`.
1. media-generation/tool-registrations.ts: `interface GeneratedMediaView extends AssistantMediaView { /** placeholder doc, unchanged */ placeholder: boolean }` (its own doc keeps the media_generate_asset sentence; the shared-shape sentences moved above). Replace from `const { media } = await uploadMedia({` through the closing `};` of `const result` with:
```ts
const { media, sniffed } = await persistAssistantMedia({ routeDeps, actorId: ctx.principal.id, input: {
  workspaceId: routeDeps.workspaceId,
  bytes: generated.bytes,
  filename: buildGeneratedFilename(prompt),
  contentType,
  alt: optionalString({ input: input, key: "alt" }),
  caption: optionalString({ input: input, key: "caption" }),
  credit: optionalString({ input: input, key: "credit" }),
  createdByPrincipal: ctx.principal.id,
  provenance: { kind: 'generated' },
} });
const result: { media: GeneratedMediaView } = { media: { ...media, placeholder: generated.usedStubFallback } };
```
Keep `ctx.signal.throwIfAborted();` and the "best-effort initial guess" comment before it; `return withChatPreview({ routeDeps, bytes: generated.bytes, contentType: sniffed, result });` is unchanged. Drop now-unused imports (uploadMedia, sniffContentType, TOVU_MAX_UPLOAD_BYTES, captureMediaUploaded, resolveMediaPublicUrls) only if unused.
2. media-import/tool-registrations.ts: `export interface ImportedMediaView extends AssistantMediaView { /** sourceUrl doc unchanged */ sourceUrl: string }` (keep the first doc sentence naming media_import_from_url). `persistImportedMedia` body becomes:
```ts
const { routeDeps, input, sourceUrl, actorId } = required;
// Identical recording discipline to the URL, generated-media and admin upload paths.
const { media } = await persistAssistantMedia({ routeDeps, input, actorId });
return { media: { ...media, sourceUrl } };
```
3. `deps:` blocks -> `mediaUploadDeps({ routeDeps })`: features/media/duplicate-asset.ts (the uploadMedia call, keep its dedupe comment); server/inbound/admin-http/routes/media/import-url.ts (`mediaUploadDeps({ routeDeps: deps })`); routes/media/upload.ts (`{ ...mediaUploadDeps({ routeDeps: deps }), documentArchiveReader: createDocumentArchiveReader({}) }`); features/media/library-save-attachment.ts (`{ ...mediaUploadDeps({ routeDeps: deps }), documentArchiveReader: archiveReader }`). Leave `rollbackUploadedMedia` and the form-file-storage blocks in composition/app.ts (different consumers).
Divergence: media_import_* JSON key order (createdBy moves up). Values identical.

## TR02 sealed-file writes -> Jini atomic writer (MERGE)
In both files add `import { createNodeAtomicFilesystem, writeJsonFileAtomic } from "@jini-ai/platform/fs";`.
- pending-agent-plugin-tokens.ts `writePendingTokensFile` body: `writeJsonFileAtomic({ filePath: path.join(siteDir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME), data: file, fs: createNodeAtomicFilesystem({}, {}) }, { mode: 0o600 });` Keep its doc ("0600 … never inherits a wider mode"): `mode` is the explicit override that guarantees it.
- storage-secret.ts `writeSealedConnectionString`: replace the `target`/`temp`/writeFileSync/renameSync lines with the same call (`filePath: path.join(required.siteDir, STORAGE_SECRET_FILENAME)`). Doc unchanged.
- Drop `randomUUID` and any `fs` import only if now unused.

## TR03 assistant credential write (EXTRACT, assistant/assistant-vault.ts)
Add `import { credentialWriteFields } from './credential-store-fields.js';` and:
```ts
/** Prepares and CAS-writes one assistant credential singleton. Omitted keys preserve the envelope.
 *  Crypto failures alone become the feature's own "unconfigured" error; persistence/CAS errors keep
 *  their contract. The hint comes from the new key, or from one open of the saved snapshot.
 * @complexity One singleton read, one CAS write, O(payload size) sealing. */
export async function writeAssistantVault(
  { deps, context, apiKey, unconfigured, settings }: {
    deps: { repo: object; sealer: SecretSealerPort; keyring: KeyringPort; clock: Clock };
    context: VaultContext;
    apiKey: string | undefined;
    unconfigured: (required: { detail: string }) => Error;
    settings: (required: { existing: VaultRecord | null }) => Pick<Parameters<SecretsVaultService["prepare"]>[0], "provider" | "meta">;
  },
  _optional: Record<string, never> = {},
): Promise<{ record: VaultRecord; tokenHint: CredentialTokenHint | null }> {
  const repo = assistantVaultRepo({ repo: deps.repo });
  const existing = await repo.findOne(context);
  const vault = createAssistantVault({ ...deps, repo, context }, { onSealFailure: error => {
    throw unconfigured({ detail: error instanceof Error ? error.message : String(error) });
  } });
  const prepared = await vault.prepare({ ...context, ...credentialWriteFields({ existing, apiKey }), ...settings({ existing }) });
  const record = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });
  const tokenHint = apiKey !== undefined
    ? credentialTokenHint({ token: apiKey })
    : (await readAssistantVault({ repo, context, sealer: deps.sealer }, { record })).tokenHint;
  return { record, tokenHint };
}
```
execution-credential-store.ts `setExecutionCredential` after `assertValid…(input);`:
```ts
const { record, tokenHint } = await writeAssistantVault({
  deps, context: assistantVaultContext({ ...input, kind: "personal-execution" }), apiKey: input.apiKey,
  unconfigured: ({ detail }) => new ExecutionCredentialSecretStoreUnconfiguredError(`admin execution credential secret store is unconfigured: ${detail}`),
  settings: ({ existing }) => ({
    provider: input.providerId !== undefined ? input.providerId : existing?.provider ?? null,
    meta: { ...existing?.meta, ...executionMetadata({ input, meta: existing?.meta ?? {} }) },
  }),
});
return toView({ record, tokenHint });
```
site-credential-store.ts `setSiteAssistantCredential`: same with `assistantVaultContext({ workspaceId: input.workspaceId, kind: "site-assistant" })`, `new SiteAssistantSecretStoreUnconfiguredError(\`site assistant secret store is unconfigured: ${detail}\`)`, `provider: input.provider ?? existing?.provider ?? "google"`, `meta: siteMetadata({ input, existing })`. Drop now-unused imports in both stores (createAssistantVault, credentialWriteFields, credentialTokenHint, CredentialTokenHint if unused). Keep every existing doc.

## TR07 site creation cleanup (EXTRACT, platform/site-dir/init-site.ts)
Rename `interface InitProgress` to `export interface SiteCreateProgress` (update its 4 uses) with doc "CIC U-003 cleanup facts shared by `initSite` and `duplicateSite`." and add:
```ts
/** The directory of a SQLite content DB placed outside the new site folder, which cleanup must
 *  remove separately; `undefined` when the DB lives inside the folder or storage is not SQLite. */
export function externalContentDbDir({ target, storage, contentDbPath }: { target: string; storage: { kind: string }; contentDbPath: string }, _optional: Record<string, never> = {}): string | undefined {
  return storage.kind === "sqlite" && !contentDbPath.startsWith(target + path.sep) ? path.dirname(contentDbPath) : undefined;
}

/** Undoes a partly created site (the external DB dir only if this run created it), then rethrows. */
export function cleanupFailedSite({ err, target, externalDbDir, progress }: { err: unknown; target: string; externalDbDir: string | undefined; progress: SiteCreateProgress }, _optional: Record<string, never> = {}): never {
  if (externalDbDir && progress.createdExternalDbDir) fs.rmSync(externalDbDir, { recursive: true, force: true });
  return cleanupAndRethrow({ err, target, wroteAnything: progress.wroteAnything });
}
```
initSite: `const externalDbDir = externalContentDbDir({ target, storage, contentDbPath: dbPaths.contentDbPath });` and the catch body becomes `return cleanupFailedSite({ err, target, externalDbDir, progress });`. duplicateSite: same two lines (with `paths.contentDbPath`); delete `interface DuplicateProgress` (its "CIC U-003 cleanup facts…(see initSite's own cleanup design)" doc merges into SiteCreateProgress's) and type `progress` as `SiteCreateProgress`; import the three names from `./init-site.js`.
