Programmer(Direct): Programmer persona selected for TypeScript chat persistence and visitor-assistant error propagation; loaded `AI-Dev-Shop/agents/programmer/skills.md`.

Inputs: the five dispatched TRIAGE.md rows (s1-07, s1-144, s1-146, s1-147, s1-91), their original todo text, repository bootstrap instructions, architecture sections 13/14, and the current Tovu/Jini sources. Todo line numbers have shifted: the current corresponding text is at 30–34, 239, 241, 242, and 128. No todo file was changed.

ITEM 37: NOT DONE (historical attribution and current Plannie verification unavailable in the permitted scope; protective code is ALREADY DONE).

- `3167afa9b0f982c0ad734a41710d397eb829260f` added the server and render guards. Its parent's `assistant/public-assistant-settings.ts` accepted a boolean enable patch without checking credentials. This establishes a previously available path, not who used it on Plannie.
- Current default is off: `apps/website/src/assistant/public-assistant-settings.ts:75`. The actual settings write owner resolves aliases and requires a host credential policy: `apps/website/src/features/settings/site-title-write.ts:53`. Both composition paths inject that policy (`server/runtime/composition/app.ts:1226`, `deps.ts:2138`).
- Existing `server/__tests__/visitor-assistant-readiness.integration.test.ts:72` covers absent key/model, unreadable key and unsupported provider; :106 covers later key/model removal; :144 covers an imported enabled state; :168 covers aliases. These tests were inspected, not run.
- Plannie's recorded site location is outside the two permitted repositories (TRIAGE.md's s1-13 evidence names `/Users/la/Documents/Tovu/plannie`). No live site, external database or screenshot was inspected. No evidence identifies the actor or rules out an imported/older setting. No redundant patch made.

ITEM 326: NOT DONE (Coordinator contract/size escalation).

- Jini already owns remembered call approvals: `packages/mcp/src/federation/tool-approvals.ts:62` fingerprints connection identity, admitted hints, description and input schema. `approvals/call-confirmation.ts:49` derives that fingerprint and :63 matches remembered grants.
- These are call-time grants, not an enable-time snapshot. Tovu's `server/inbound/admin-http/routes/external-mcp/put.ts:73` saves enabled/config/allowlist fields; its approval repository stores explicit grants in `external_mcp_tool_approvals`, not the requested hints baseline.
- The original todo explicitly requires a new persisted baseline plus a migration. Closing it spans Jini federation policy/port, Tovu schema and dialect adapters, enable/probe lifecycle, daemon reload and a first-call reapproval. This exceeds a bounded M fix without a snapshot/refresh contract. No existing approval record was repurposed into implied enable-time consent.
- Coordinator must settle baseline ownership/schema, how an unavailable tool is enabled, whether re-enabling refreshes the baseline, and how consent is advanced after drift. Then dispatch the shared mechanism before dependent host wiring.

ITEM 328: NOT DONE (Coordinator policy decision required).

- `ADS-memory/.local-artifacts/uninstall-dup-investigate/notes.md` records the exact leaked sentence and conversation. No current reproduction was attempted under the no-runtime restriction.
- `Jini/packages/agent-runtime/src/claude-stream.ts:611` emits ordinary text deltas; :778 processes wrapper blocks before the stop reason. The reported sentence has no inspected semantic narration marker.
- The existing content owner deliberately preserves pre-tool text (`Jini/packages/chat/src/core/assistant-content.ts:4`), with a regression asserting the note remains in `core/run-events/__tests__/activity.test.ts:52`. `react/message-blocks.ts` preserves its event ordering.
- Deciding that every pre-tool text message is narration would also hide useful explanations/questions. Waiting for stop_reason to reclassify it changes streaming latency; text already streamed cannot simply be withdrawn through the current delta-only contract. Coordinator needs to choose the classification/display policy. No phrase heuristic, global text deletion or second content owner added.

ITEM 329: DONE (source changes; validation and package adoption pending).

- Reused `dedupeToolUsesById` in Jini's existing save projection, before text compaction. First use per ID survives; distinct calls, results, usage and their relative order survive.
- Applied the same owner to checkpoint/final-settlement merges, including the shorter-replay path that retains saved events. Different serialized inputs no longer evade ID identity.
- Applied the same rule in the existing content projection so duplicate tool frames between text deltas cannot create a paragraph break that disappears after saving. Saving is idempotent for this case and live/saved content agree.
- Added unit regressions beside the existing Jini projection tests and persistence regressions beside Tovu's existing ledger dialect tests. No archived-history migration or execution-layer change.

ITEM 191: DONE (bounded slice requested; product-wide coverage remains open).

- A model-list refresh failure after a successful visitor connection test was swallowed in `refreshVisitorDiscoveryAfterTest`. It now uses the existing `describeProbeError` and discovery error state. The successful connection result remains visible separately, and the existing key footer already renders the discovery reason (`AiAssistant.tsx:643`).
- Updated the existing hook regression to assert the real reason, plus the non-Error fallback. No new UI state, error system or TSX logic.
- Remaining: the generic catches in `server/inbound/admin-http/routes/publish-content/destination.ts:118` and `bundle-create.ts:206`, other publish-content route catches, and the broader route inventory in `server/error-mapping/INFO.md`. Known handshake/connect errors already pass their owner-written messages through; unknown exceptions may contain SQL, paths or credentials and need caller-safe classification/correlation rather than an unconditional raw-message passthrough. This was not a product-wide coverage audit.

CHANGED FILES:

- Jini: `packages/chat/src/core/assistant-content.ts`
- Jini: `packages/chat/src/core/__tests__/assistant-content.test.ts`
- Jini: `packages/chat/src/core/run-events/entry.ts`
- Jini: `packages/chat/src/core/run-events/__tests__/activity.test.ts`
- Jini: `packages/chat/src/store/runtime/run-ledger.ts`
- Tovu: `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`
- Tovu: `apps/admin/src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts`
- Tovu: `apps/website/src/assistant/persistence/__tests__/run-ledger.dialects.test.ts`
- Tovu: this handoff.

Reuse: persisted tool identity/content; searched Tovu assistant persistence/composition and Jini chat core/store, daemon bridge and Claude parser for tool_use, deduplication and save projections; inspected `claude-stream.emitToolUse`, `tool-events.dedupeToolUsesById`, `runEventsForSave`, and ledger merge helpers; extended the existing Jini projection/store owners and called the existing deduper. No new behavior owner.

Reuse: visitor model-refresh error; searched Tovu AI Assistant, publish hooks/routes, stored-credential error descriptions and Jini UI contracts; inspected `refreshVisitorDiscoveryAfterTest`, `describeProbeError`, and the existing discovery footer; used existing error description/state/rendering. The hook is a Tovu visitor-credential workflow.

Architecture review: PASS by source inspection. Generic changes stay in Jini, Tovu holds its existing adapter tests and product credential hook. No module/export/DI boundary, schema, permission or dependency was added. Existing callback/private-helper signatures retained for compatibility. Why comments were updated with the changed behavior.

Function review:

| Unit | Disposition | Findings / local action |
| --- | --- | --- |
| assistantContentFromEvents | INCONCLUSIVE runtime evidence | Reused ID owner; linear event allocation; duplicate separator case asserted. |
| runEventsForSave | INCONCLUSIVE runtime evidence | Deduplication precedes compaction; immutability, identity, idempotence and content agreement asserted. |
| keepToolCheckpoints / retainSavedEvents | INCONCLUSIVE runtime evidence | Post-merge ID deduplication; both settlement paths and checkpoint retention asserted. No extra DB calls. |
| refreshVisitorDiscoveryAfterTest | INCONCLUSIVE runtime evidence | Existing error branch/state/formatter; connection success and failure reason asserted independently. |

No known Critical/High finding from static inspection. Second-pass checks covered duplicate IDs with differing input, distinct IDs with equal input, shorter replays, input mutation, text boundaries, variable naming, and the pre-existing no-key refresh guard. No runtime correctness or coverage claim is made.

Verification: only source/diff inspection and scoped `git diff --check`. Tests, typecheck, builds, dev servers, benchmarks, network commands, commits and pushes were not run, as instructed. Existing tests were retained; one characterization test was changed to the newly requested error behavior and expanded with a fallback case.

NOT DONE:

- Items 37, 326, 328 as detailed above; Coordinator owns the next decisions/information.
- Product-wide failure-reason coverage, caller-safe publish error taxonomy/correlation, and any history repair.
- Test/runtime validation and publishing/adopting the changed Jini package. Tovu uses registry packages; source edits alone do not update an installed/released application. Coordinator should validate and release/adopt Jini before expecting the consumer regressions to pass against the new behavior.
