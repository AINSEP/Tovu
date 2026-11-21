## Disposition

Bases verified at Tovu `0973a5fdc8` and Jini `de4e555b9`, both `integ/merge-10-2026-11-21`. The Tovu clone lacked the plan refs. I read `cull-feat2` from the local Tovu Git objects and cross-checked the named drafts and reports. No files changed and no tests ran.

| ID | Disposition | Reason |
|---|---|---|
| TV-AG1 | NEEDS-DECISION | Jini supplies the requested interrupt behavior. The direct adoption requires deleting three duplicate declarations whose signatures contain protected `_optional = {}` pads. See the owner question below. |
| tv-rjk T2 · Jini | READY-FOR-CODEX | The shared identity reader can accept an explicitly configured legacy namespace. The site manifest, discovery, admission and lookup paths already call that reader. |
| tv-rjk T2 · Tovu | PARTIAL | The two `identityNamespace: "tovu"` bindings are verified. The production binding for Jini’s separate site-provider lookup still needs an exact source anchor before the cutover can be dispatched. |
| AG2-T | PARTIAL | The server and browser must switch `/chat` together. The draft also uses the wrong parser subpath and leaves the browser’s idle timeout, safe refusal mapping and no-reply handling unspecified on the replacement path. |
| AG3-T | PARTIAL | Jini’s pause-store, resume and interrupt declarations are present. The draft does not pin how Tovu retains the live provider turn and hands off its abort and response ownership within the sheet limit. |
| AG4-T | PARTIAL | Jini’s `FrontendControl.begin` is present. The draft’s named browser test file is absent, and the exact browser delivery and admin owner bindings remain unverified. |
| `deps/lockfile-1121` | OPUS-CLOUD · prerequisite | The in-flight cloud branch owns the direct `@ag-ui/core` dependency and lockfile for `apps/site-chat`. AG2-T, AG3-T and AG4-T all follow it. |

### TV-AG1 owner question

**May TV-AG1 delete the three superseded local declarations together with their `_optional = {}` signatures?** Recommend yes. Delete the declarations as units and retain every pad on a surviving declaration. This lets Tovu call the existing Jini drain directly.

The prepared edit is confined to `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`. Delete `streamFromReader` at line 170, `AgUiFrameContext` at 181, `writeAllAgUiEvents` at 191, `writeFrameOutcome` at 208 and `drainAgUiStream` at 286. Replace the line 389 call with the existing `@jini-ai/chat/core/ag-ui` export `drainRunFramesToAgUi`, passing `subscribedReader`, the request thread and run IDs, `state`, `RUN_NOTICES` and `write: (event) => writeAgUiEvent(res, event)`. Set `runFinished = true` before `res.end()`, then record the returned tracker outcome. Retain the current close listener and daemon-cancel path. Remove imports used exclusively by the deleted declarations and correct the two surviving references to the old drain name in the comments.

Write the interrupt regression first in `apps/website/src/server/__tests__/assistant-ag-ui-wire.golden.test.ts`, using the existing `SCRIPTS` and matching golden JSON. Send one text delta followed by an `mcp-ui` frame with the valid `pendingApproval` shape pinned by Jini’s `run-frames.test.ts:82–97`. Expect a closed text segment followed by exactly one `RUN_FINISHED` with `outcome.type: "interrupt"`, the marker and the request IDs, then HTTP EOF. Keep the existing unmarked MCP-UI golden and all other wire goldens byte-identical. The old drain must fail the interrupt assertion. Omitting `res.end()` must fail the EOF assertion within the combine test timeout. The existing Stop witness at `assistant-ag-ui-routes.test.ts:768` must still see exactly one authenticated daemon cancel. The mutation that drops the close listener’s reader cancellation must also demonstrate that the retained subscription closes on disconnect. Record the deletions and refresh the existing `catch-reads-error` row in combine. Chrome owes an admin canary, disconnect and Stop.

**BREAKS:** A valid `pendingApproval` frame now terminates the admin AG-UI response with an interrupt outcome. Keep the production marker emitter behind the working admin resume path in AG3-T.

## READY-FOR-CODEX

### tv-rjk T2-J · Jini · merge-10 `de4e555b9` · ~2.3k executor tokens

**Executor rules for this Codex brief.** Do exactly the named edits. Preserve behavior except for the specified opt-in legacy read. Preserve existing `_optional = {}` pads and the args rule. New APIs use `(required, optional = {})`. Add no unused pads, re-export shells, dependencies, suppressions, casts, flags, abstractions or unnamed helpers. Do not add `eslint-disable`, `@ts-ignore`, `as any` or `as never`. Hooks are injected as props. Jini domain packages take no vendor code or framework-specific server types. Use the smallest diff, move code and existing why-comments verbatim, and add no comments except any one-line note named by the sheet. Functions must be at most 50 lines with complexity at most 10. Record a file over 500 lines in root `COMMIT-PLAN.md` and continue. Re-read the diff, delete incidental edits and list deletions in that file.

STOP this sheet and continue the others for a missing declaration, an unlisted production importer, a needed cast or a function limit breach. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` for the named symbols. Record unlisted test importers requiring only the same repoint in `REFRESH.md`. No other repo-wide scans, codebase-memory MCP, tests, builds, installs, type-checks or linters. `.git` is read-only. Write the named tests before source edits and leave red, green and mutation execution to combine. Dependency, lockfile and new-package work goes to OPUS-CLOUD.

**Tests first.** Extend `packages/core/src/__tests__/plugin-directory.test.ts`, using its existing line 2 import.

- A manifest with only `extensions.previous` declares `publisher/site-rules` and `provides: ['content-analysis']`. With `namespace: 'current'` and `legacyNamespace: 'previous'`, assert that validation succeeds and the returned ID and provides match the declaration. Without `legacyNamespace`, assert the existing `unknown/site-rules` result. Mutation removes legacy selection.
- With both extensions present and distinct IDs and provides, assert that `current` owns both fields. Mutation selects `previous` first.
- With `extensions.current: null` and a valid `previous`, assert that validation returns the existing extension-shape error and reading throws it. Mutation uses nullish coalescing to choose the extension.

**Core edit.** In `packages/core/plugin-directory.js`, add `legacyNamespace` to the existing first argument of `validatePluginIdentity` at line 45 and `readPluginIdentity` at 61. Update their existing argument annotations and the paired declarations in `packages/core/plugin-directory.d.ts:30–31`. Define only the private `readIdentityExtension` in the JS file, using the existing object-argument pattern. It reads `manifest?.extensions?.[namespace]` and selects `manifest?.extensions?.[legacyNamespace]` only when the primary value is `undefined` and a legacy namespace was supplied. Use it at the three existing extension reads in `structuralError` at line 20, `validatePluginIdentity` at 48 and `readPluginIdentity` at 64. Pass `legacyNamespace` through the existing validation calls. Keep the manifest and extensions shape checks in their current order. Apply the existing ID and provides validation to the selected extension. The existing `@jini-ai/core/plugin-directory` package entry supplies both declarations. No export-map edit.

**Host edit.** Add `legacyIdentityNamespace?: string` to the existing bags below. Pass it as `legacyNamespace` to the existing core calls. The receiving core declaration must accept an explicitly passed `undefined`. Use the existing bags and spreads.

| File on Jini merge-10 | Exact touch |
|---|---|
| `packages/plugins/src/host/ports.ts:35–37` | Add the field to `ManifestHostPorts`. `ValidateManifestRequired`, `DiscoverPluginsRequired`, `PluginInstallDeps` and `PluginSourceDeps` already extend this bag. |
| `packages/plugins/src/host/node/runtime-contracts.ts:111–115` | Add the same field to `PluginRuntimeHostBinding`. |
| `packages/plugins/src/host/manifest.ts:480,495` | Forward it in both the validation call and the warning read. |
| `packages/plugins/src/host/node/discovery.ts:344` | Forward it in the read used to detect duplicate qualified IDs. |
| `packages/plugins/src/host/node/install.ts:217,266` | Forward it for both the incoming candidate and the raw installed manifest. This preserves the publisher check in both directions. |
| `packages/plugins/src/host/capability-tools.ts:281,392–393,437–438` | Carry the field through the existing options and `host` object and forward it from the discovery-terms reader. |
| `packages/agent-plugins/src/connect/plugin-host/index.ts:96,187` | Add `legacySiteIdentityNamespace?: string` to `PluginHostDeps`. Forward it only from `listSiteProviders`. The host-supplied Agent Plugin lifecycle identity reader keeps its own contract. |

**Importers and exports.** This sheet changes no import lines. The affected existing imports are the core test at line 2, `manifest.ts:37`, `node/discovery.ts:1`, `node/install.ts:2`, `capability-tools.ts:2` and `connect/plugin-host/index.ts:10`. The Agent Plugin lifecycle callers in `lifecycle/exports.ts:63`, `lifecycle/host-tools/identity.ts:58`, `lifecycle/install.ts:197`, `lifecycle/manifest.ts:219,240` and `src/manifest.ts:87` continue to supply their existing namespace. No Jini source names the Tovu legacy key.

**Bookkeeping and STOP.** Record the additive API deltas for the existing `plugin-directory`, plugin host and Agent Plugin host surfaces in `COMMIT-PLAN.md` for combine. No injection-debt or manifest row. STOP if a runtime path reconstructs the existing host bag and drops the new field, or if supporting it would require a new cast or a change to Agent Plugin admission. The paired Tovu combine owes a Chrome check of the Plugins list and same-publisher upgrade for a pre-existing site install.

## Batch order

There is **one READY sheet**, at roughly 2.3k executor tokens. Hold it for a Jini-only batch with three to seven independently READY sheets. There is no qualifying Tovu batch in this dispatch.

| Order | Repo and base | Dependencies |
|---|---|---|
| 1 | Jini · merge-10 `de4e555b9` | Stage T2-J first. The pushed Jini result must precede T2’s Tovu half. |
| 2 | Tovu · merge-10 `0973a5fdc8` plus the pushed Jini T2 result | Stage the T2 host half after its lookup binding is pinned. It is independent of the AG-UI sequence. |
| 3 | Tovu · merge-10 `0973a5fdc8` | TV-AG1 after the pad decision. The Jini drain is already in the pinned base. |
| 4 | Tovu · after `deps/lockfile-1121`, AP-T and TV-AG1 | AG2-T → AG3-T → AG4-T. Jini’s fetch client, pause/interrupt support and frontend `begin` are already in `de4e555b9`. Apply the cull’s order for E8, after AG4-T. |

## PARTIAL handoff

### tv-rjk T2 · Tovu binding

The cutover edit belongs at `apps/website/src/features/plugin-runtime/host-binding.ts:77` and `capability-tool-registrations.ts:76`. Bind `identityNamespace: "jini"` and `legacyIdentityNamespace: "tovu"` in both. The unresolved anchor is the production `PluginHostDeps` construction that supplies the site-provider lookup. It must bind `legacySiteIdentityNamespace: "tovu"` for `listSiteProviders`, alongside the canonical namespace. Pin that construction and its importers before dispatch.

Use `__tests__/integration/source-runtime.integration.test.ts:71–94` as the existing end-to-end witness. It seals a package bearing only `extensions.tovu`, asserts `publisher/site-rules` in the public result, and checks the installed manifest still carries its original key. Extend that case to verify a subsequent canonical declaration for the same publisher stays in the same short-name slot with its enablement intact. Removing the host’s legacy binding must fail the legacy publisher assertion. The collision witness must reject a different declared publisher in that slot, including when the installed predecessor carries only the legacy key. Confirm the current fixture for that witness before naming an executor edit.

`r62t-breaks` O1/O2 separates installed artifact integrity and filename/SDK compatibility from identity selection. Preserve installed bytes, digests, short-name activation records and `@tovu/sdk`. The two built-in manifests still declare `tovu/word-count` and `tovu/content-analyzer`. Their metadata keys may move to `extensions.jini` under T2, with their qualified IDs intact. Verify the sample manifest on the cutover base before including it. The B1 saved-embed ID migration remains independent.

### AG2-T · visitor transport

**After `deps/lockfile-1121`, AP-T and TV-AG1.** Apply the cull’s exact writer change in the eventual cutover. Export the existing `writeAgUiEvent` at `assistant-ag-ui.ts:134`, body verbatim, and import it in `site-assistant.ts` with `import { writeAgUiEvent } from "./assistant-ag-ui.js";`. Stop if that import creates a cycle.

The correct parser entry is `@jini-ai/chat/server/ag-ui/run-input`, already used in the admin route. Event projection comes from `@jini-ai/chat/core/ag-ui`. The browser fetch agent and run client come from `@jini-ai/chat/transports/ag-ui`. Pin how the parsed `messages` reach `guardMessageAndRateLimit` at `site-assistant.ts:284–332` with the same history limits, public validation errors and rate-limit ordering. On the browser side, pin exactly where `site-assistant-transport.ts:186–220,257–316` retains the idle timer, HTTP refusal mapping, no-reply handling and abort contract when the local framing and pump are removed. Combine-10 records a file-level failure in `site-assistant-transport.test.ts` on the base. Diagnose it before treating that suite as a red/green witness.

Keep the eight existing `site-chat-stream.golden.test.ts:189–330` scenarios together at cutover: plain reply, allow, deny, expiry, capacity refusal, published navigation, provider error and visitor abort. They also need named checks for sanitized CUSTOM directives and transport refusal on React and vanilla. The inseparable source and test changes exceed the limit in the current draft. A READY revision needs exact declarations and a split that keeps the sole `/chat` contract usable at every pushed boundary.

### AG3-T · visitor and admin approval

**After `deps/lockfile-1121` and AG2-T.** AG3-J and AG3A-J’s named APIs are in Jini merge-10. E8 follows AG4-T. Pin the transfer between `site-assistant.ts:689–727,799–823,845+` and the existing confirmation owner before sheet dispatch. The original provider turn must park once, retain its frontend release handle, and resume on a fresh response after the same owner checks. Verify how the browser interrupt callback retains the pending prompt and AP-T’s failed-send behavior when Jini invokes the live callback and then finishes that response. Pin the `/confirm` route and client importer deletions only after the replacement answer path is specified.

The admin producer belongs at the live `askOnce` in `contracts/core/human-confirm.ts:108–141`. Its response must reach the existing `deliverSurfaceCallback` owner. The regular MCP-UI result card remains a wire witness. Pin the resume receiver and its authenticated binding before enabling the marker. The combine cases are same-turn allow and deny, expiry, quota, wrong owner, replay, second settlement, Stop and disconnect on either side of park. Chrome owes React, vanilla and admin approval. The draft combines two stateful cutovers and cannot run literally as one small sheet.

### AG4-T · page tools

**After `deps/lockfile-1121` and AG3-T.** Jini merge-10 exposes `FrontendControl.begin` at `packages/daemon/src/http/frontend-control.ts:99,225`. Tovu already creates visitor control at `apps/website/src/assistant/site/visitor-frontend-control.ts:109–117`; the browser attaches through `apps/site-chat/src/visitor-page-control.ts:107–124`.

Pin where the existing shared browser bridge exposes the delivered invocation ID, where it receives a successful begin acknowledgment, and which authenticated admin owner supplies the sibling route. The cull removed the proposed `agentic` wire-projection move. The exact tests still needed are rejection before a page effect, a repeated invocation producing one effect, published navigation with save-before-leave, and the reviewed submit path. Locate the current browser suite before naming a file edit. Chrome owes a real attached-tab invocation and Stop in both chat surfaces.
