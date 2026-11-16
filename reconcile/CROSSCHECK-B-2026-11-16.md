Software Architect(Direct): **Three designs are partially fixed; two have fixes that hold at the design-text level.**

Read-only review. No files changed and no tests run. Git fetch was blocked by filesystem permissions; GitHub’s read API confirmed the five local design heads and that `refactor/terra` equals `integ/wave-b-r2`: Tovu `80b00f5b`, Jini `02edbb68`.

## Per-design findings

| Design | Reviewed revision | Fixes verdict |
|---|---|---|
| Lost updates | `613db51d` | **Partially** |
| AG-UI | `3ee6c75e` | **Partially** |
| Error system | `40258f7b` | **Fixes hold** |
| Security review | `0a193e25` | **Fixes hold** |
| ACP | `03969e1a` | **Partially** |

I checked every first-judgment blocker and security-related major. Additional major sampling covered lost-updates #2/#3/#6/#8/#10/#11/#12, AG-UI #4/#8/#9/#10/#11, error-system #3–#8/#10–#13, and ACP #4–#10/#12/#13. Security’s five majors were all checked.

### Lost updates — partially

The missing access writer is now included: §4.4 explicitly advances the editing version in `updateAccessIfCurrent`, lists the other writers, and requires revocation-versus-stale-save coverage. That blocker’s proposed correction holds.

These fixes remain incomplete:

1. **First major #3: baseline fencing lacks an observation contract for every baseline-writing path.** Revised §4.7 defines `observed` as the baseline read at `apply-loop.ts:426`. That read occurs inside `checkAgreement`, reached only for an `applied` row with existing content. Created, forced and retiring rows bypass it; non-writing rows take another path. S13 mentions adding row context but never specifies where those paths acquire their observation. The design must distinguish “observed absent” from “not read” and cover every successful baseline-writing outcome. [Revised design, §4.7](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L364), [actual apply flow](https://github.com/AINSEP/Tovu/blob/80b00f5bb823870975b15708d09c4d937a4d4aa8/apps/website/src/features/publish-content/apply-loop.ts#L261).

2. **First majors #9/#11: the plugin race test contradicts the new queue.** §4.6 queues the entire write/effect/compensation transition per plugin. T-effect(a) nevertheless holds enable’s hook while waiting for disable to complete. Through the same runtime queue, disable cannot complete until enable releases it. Separate the tests: same-runtime serialization, and independently constructed runtimes sharing storage for compensation fencing. [Queue contract](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L345), [test schedule](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L488).

3. **First major #11: S1 still has a broken intermediate contract step.** §4.4 replaces `upsert` with three required methods, while S1 says “contract and memory repo first,” followed by separate writer-group commits and the Tovu SQL adapter. Removing `upsert` first breaks the unmigrated callers; adding required methods breaks the unmigrated SQL implementation. Specify an additive transition covering every implementation, migrate callers, then remove `upsert`. [Replacement contract](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L239), [S1 sequence](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L522).

4. **First major #12: size compliance remains an open exception request.** The UI ownership correction holds. The size correction does not yet close: §8 admits that touched files/functions remain over limits, and D11 recommends accepting no growth. That is neither an approved exception nor a prerequisite split. The estimate also excludes those splits. [Size rule and admission](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L566).

### AG-UI — partially

The three original blockers are addressed in the revised contracts: admin confirmation stays with the existing exchange owner; authorization-denied calls have no executable handoff; S1 now lists importer/export migrations. The cancellation, lifetime, quota and correlation revisions also specify mechanisms rather than merely asserting preservation.

One refusal-ordering defect remains:

- **First major #10: capacity refusal happens after the executable handoff.** §7.5 says to emit the frontend-tool triplet and then try to park. Its capacity row says parking failure refuses the tool and continues the response without an interrupt. But the design itself establishes that a client may execute immediately on `TOOL_CALL_END`. Such a client can perform the action before receiving that capacity refusal. Park successfully before emitting any executable handoff; add an immediate-on-END client test for exhausted capacity. This is separate from authorization denial, which FT-1/FT-2 now protect. [Handoff order](https://github.com/AINSEP/Tovu/blob/3ee6c75e7fb4c2175b87658828617bfb2b177e24/designs/ag-ui/DESIGN.md#L597), [capacity outcome](https://github.com/AINSEP/Tovu/blob/3ee6c75e7fb4c2175b87658828617bfb2b177e24/designs/ag-ui/DESIGN.md#L625).

### Error system — fixes hold

No failed first-judgment correction found in the checked text.

The revised disclosure contract requires operation-specific approval; scoped bindings represent discriminants and aliases; adoption preserves existing model-message modes; lowercase ledger codes stay outside the describer vocabulary. The rollout now preserves existing envelopes, orders readers before producers, threads status resolution, includes chat consumers and persistence, preserves Electron rejection semantics, and contains outbox policy failures.

This verdict concerns the proposed corrections, not executable verification. The cross-design conflicts below still require changes.

### Security review — fixes hold

No failed security correction from the first judgment found.

The review now makes owner presence, budget-window semantics, complete executor binding, hostname admission tests and required reporter configuration explicit acceptance requirements. Its factory-size rebuttal is supported by COMMON rule 11’s exclusion of comments and blank lines.

The broader Jini entry-file prohibition remains an explicit owner question. COMMON rules 5/17/19 alone do not establish the blanket prohibition asserted by that portion of the first judgment. A06/A50/A51 execution remains blocked as stated in the revised review.

### ACP — partially

Both original blockers have substantive corrections: Claude remains native unless its complete policy passes the stated gates, and tool delivery retains native carriers or requires capability-checked HTTP session delivery with explicit failure.

One security-related major remains incomplete:

- **First major #11: crash cleanup cannot rely on descendants recorded at session start.** §3.10 correctly notes that descendants become undiscoverable through the parent tree after adapter exit. Its crash solution then stops descendants “recorded at session start.” An engine or grandchild created later is absent from that snapshot and can survive the adapter crash. Process-group ownership is only an undecided O-12. Require a containment mechanism covering descendants created throughout the run, and test an adapter that starts a descendant after initialization and then crashes before normal teardown. [Teardown contract](https://github.com/AINSEP/Tovu/blob/03969e1a4fc312717fc06c996ff3b951b6eba649/research/acp/DESIGN.md#L265).

## Cross-design conflicts

1. **Lost updates ↔ error system — version-conflict codes.**  
   Lost-updates §4.9 retains `CONCURRENT_EDIT`, `EMAIL_TEMPLATES_VERSION_CONFLICT` and `WIDGETS_VERSION_CONFLICT` until optional S11. Error-system §3.1 instead binds each domain conflict class to core `VERSION_CONFLICT`, while E5 promises unchanged model-facing strings. Both cannot govern the same registration. **Change error-system E5** to preserve existing codes through catalog adoption; coordinate any renaming with lost-updates S11. [Lost-updates contract](https://github.com/AINSEP/Tovu/blob/613db51db5a251d177b2f8f7a258564c01f31168/designs/lost-updates/DESIGN.md#L409), [error-system contract](https://github.com/AINSEP/Tovu/blob/40258f7b7138c11436304dcfc7c28bc5cb43c0f8/designs/error-system/DESIGN.md#L259).

2. **Security A06 ↔ error system — two public-error reporting lifecycles.**  
   A06 S2 creates diagnostics’ `createPublicErrorReporter`, owning ID creation, public copy, diagnostic redaction and incident classification. Error-system E2 introduces core’s `createErrorReporter` for those same responsibilities. Neither defines delegation between them. **Change both contracts:** select one incident lifecycle; preserve visitor vocabulary and classification as policy inputs or a thin adapter. A06 must not introduce another independent ID/log/tracker lifecycle.

3. **AG-UI ↔ error system — admin diagnostic disclosure.**  
   AG-UI §7.6 preserves admin “redacted detail + request id.” Error-system §3.3 explicitly withdraws disclosure of arbitrary redacted text: authorization alone is insufficient without operation-owner approval. **Change AG-UI’s `describeFailure` binding and examples** to use the error-system disclosure contract. [AG-UI error policy](https://github.com/AINSEP/Tovu/blob/3ee6c75e7fb4c2175b87658828617bfb2b177e24/designs/ag-ui/DESIGN.md#L637), [error-system disclosure](https://github.com/AINSEP/Tovu/blob/40258f7b7138c11436304dcfc7c28bc5cb43c0f8/designs/error-system/DESIGN.md#L290).

4. **AG-UI ↔ error system — incompatible error-event fidelity targets.**  
   AG-UI defines `RUN_ERROR { message, code }` and a status round trip containing `label/detail/code`. Error-system E8 adds `rawEvent` incident metadata, `RunFailure`, and saved status `failure` fields, while targeting files AG-UI moves or deletes. No dependency joins these contracts. **Change both migration plans:** agree on the complete error/status field map and migrate projection, reverse reduction, live failure and saved transcript together. [AG-UI mapping](https://github.com/AINSEP/Tovu/blob/3ee6c75e7fb4c2175b87658828617bfb2b177e24/designs/ag-ui/DESIGN.md#L333), [error-system transport contract](https://github.com/AINSEP/Tovu/blob/40258f7b7138c11436304dcfc7c28bc5cb43c0f8/designs/error-system/DESIGN.md#L346).

5. **Lost updates ↔ publish-engine — baseline port and apply-loop ownership.**  
   Lost-updates S13 replaces baseline `upsert` with `advance`. Publish-engine B01 moves the existing baseline contract and memory implementation; B02 moves/splits its apply-loop caller. Neither lists the other as a prerequisite. Lost-updates’ generic overlap check is insufficient to choose which contract gets moved. **Change both plans:** land the corrected fencing behavior in the Tovu slices after preparatory splitting and before their Jini moves; migrate the port, SQL adapter, memory implementation and callers as one logical change.

6. **ACP ↔ R8/C6/size-10 — incompatible dispatch readiness.**  
   ACP §6 says Phase A can start now. Its prerequisite P requires every Phase-A-touched file to meet size limits; A2 touches daemon `launch.ts`, `events.ts` and `contracts.ts`. Size-10 requires R8 first, and R8/C6 change those same contracts and session bindings. Updating a restated type “in the same commit” does not resolve concurrent ownership. **Change ACP’s order:** name R8/C6 and the required daemon splits as prerequisites, or dispatch an explicitly narrower, file-disjoint Phase A. [ACP ordering and prerequisite](https://github.com/AINSEP/Tovu/blob/03969e1a4fc312717fc06c996ff3b951b6eba649/research/acp/DESIGN.md#L386), [size-10 prerequisite](https://github.com/AINSEP/Tovu/blob/81bbdde75125d4fd5f0473fbebed381e36130af3/size-designs/10-jini-daemon-agent-executor-launch.md#L127).

7. **Error system ↔ R7 — different route-status migration targets.**  
   Error-system E5a targets all eleven current `statusForError` sites, especially http-kit’s adapter. R7 converts callers to core `jsonRoute` and eventually deletes those http-kit helpers. Error-system says only “after wave B”; R7 is subsequent work. **Change E5a’s prerequisites and caller map:** choose the post-R7 owners, including any http-kit consumers retained until R9, and carry `RouteHostContext.statusFor` through the final host context.

## Shared hotspot order

Proposed serialization; each arrow requires the preceding contract changes to land.

| Shared files/concept | Proposed order |
|---|---|
| `composition/deps.ts`, `composition/app.ts` | Size-02 steps 1–3 → size-01 → remaining size-02 work. Then one coordinator applies composition additions: runtime bindings → error catalog/reporter → publish/import-cycle ports → finalizer Phase C. Retake guards after each unit. |
| `agent-daemon-scope.ts` | R8a host binding → C6/R8b binding → R7 parser/auth and route conversion → AG-UI frontend relay/canary changes. Keep security D1–D3 assertions throughout. |
| Daemon `launch.ts`, `contracts.ts`, `events.ts` | R8a → C6 → R8b → lane K → size-10 and required events/session splits → ACP A2–A9. Import-cycle J2 follows R8 and size-10 as its design already requires. |
| Server contracts and route status | C-ORIGIN-PORT/P-NODE-BRIDGE and R7 prerequisites → R7 conversion → amended error-system E5a. |
| Chat reducers/transports | Agree on failure metadata first → AG-UI S1 moves → coordinated projection/reduction changes → error-system E8 on final paths. |
| Visitor executor/reporting | Security A03 fixes → amended A06 using the selected reporter owner → AG-UI S5 site cutover. |
| Publish baseline/apply files | Publish preparatory splits → corrected lost-updates S13 → publish B01/B02 moves. |
| Conflict registrations | Lost-updates domain guards/adapters → error-system E5 preserving those codes → optional, separately approved S11 convergence. |
