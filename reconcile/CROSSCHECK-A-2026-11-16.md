Software Architect(Direct):

Reviewed size designs at `81bbdde7`, daemon designs at `32cd78ed`, run finalizer at `f26a8392`, and import cycles at `bd89a8c2`. Source refs: Tovu `80b00f5b`, Jini `02edbb68`.

Git fetch was blocked by the read-only sandbox. I read the newer designs through GitHub and the source through local Git blobs. No files were edited. Repository tests were not run.

## Per-design verdicts

Finding numbers below refer to each first judgment. All blockers and security-related majors were checked; the table records the additional major coverage.

| Design | Fixes verdict | Findings checked |
|---|---|---|
| Size 01 — composition deps | **Fixes hold** | Blocker 1; majors 2–8 |
| Size 02 — composition app | **Partially** | Blocker 1; majors 2–8 |
| Size 03 — site renderer | **Fixes hold** | Majors 1–6 |
| Size 04 — site pages | **Fixes hold** | Majors 1–5 |
| Size 05 — PostEditor | **Fixes hold** | Majors 1–5 |
| Size 06 — admin API client | **Partially** | Majors 1–5, 8 |
| Size 07 — styles | **Dropped by owner** | Excluded from execution |
| Size 08 — useChatPane | **Fixes hold** | Blockers 1–2; majors 3–5 |
| Size 09 — ChatPane | **Partially** | Blocker 1; both majors, 2–3 |
| Size 10 — launcher | **Partially** | Blocker 1; majors 2–5 |
| Daemon R7 | **Partially** | Blockers 1–2; majors 3–14 |
| Daemon R8 | **Partially** | Blocker 1; majors 2–12 |
| Run finalizer | **Fixes hold** | Blocker 1; majors 2–7 |
| Import cycles | **Partially** | Blocker 1; majors 2–7 |

“Fixes hold” means the revised design addresses the finding. It does not certify an implementation or an unexecuted characterization test.

### Size 02 — the default-argument decision remains stale

The treatment of first-judgment **major 2** does not match the recorded owner decision. §2.4 still treats removing the default as awaiting approval and prescribes rewriting callers to `createApp(createRouteDeps())`.

The [coordinator handoff, line 112](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/handoffs/2026-11-15-tovu-db-coordinator-handoff.md:112) already approves removing the default, adding **`createInMemoryApp()` beside the memory root**, and migrating zero-argument callers to that helper. The revised design contains no such helper. Update its target and migration graph to the approved contract. [Design evidence](https://github.com/AINSEP/Tovu/blob/81bbdde75125d4fd5f0473fbebed381e36130af3/size-designs/02-tovu-composition-app.md#L101-L104)

### Size 06 — signature compliance is still deferred

First-judgment **major 4** is only partly closed. The `request` decomposition is specified, but revision R2 excludes the 62 zero-parameter methods until decision 06-c. Its migration table additionally gates the entire signature phase on that decision, contradicting R2’s statement that the other signatures proceed meanwhile.

The design therefore has neither a complete signature migration nor one consistent dependency graph for it. Making a follow-up “mandatory” does not resolve the omitted methods. [Design evidence](https://github.com/AINSEP/Tovu/blob/81bbdde75125d4fd5f0473fbebed381e36130af3/size-designs/06-tovu-admin-api-client.md#L138-L156)

### Size 09 — the replacement characterization requires behavior absent from the baseline

The JSX placement and wrapper corrections address the original findings. However, R1.1 says to preserve the runtime-picker callback’s “same dependency array,” and R2 requires stable callback identity across a no-op rerender.

The source constructs an **inline arrow on every render**, without `useCallback` or a dependency array. `buildChatPaneSlots` invokes that arrow immediately. The proposed identity assertion cannot characterize the unchanged baseline. Preserve the existing behavior or identify a separate behavior change and its observable contract. [Revised design](https://github.com/AINSEP/Tovu/blob/81bbdde75125d4fd5f0473fbebed381e36130af3/size-designs/09-jini-chat-pane-component.md#L106-L115), [source](https://github.com/AINSEP/Jini/blob/02edbb684c8d9862b94e97ebe858c9bf1e68f132/packages/chat/src/react/features/chat-pane/components/ChatPane.tsx#L834-L857)

### Size 10 — listener installation still has contradictory ordering

First-judgment **major 5** is not consistently resolved. R1 requires cleanup callbacks to transfer at their existing point, but R4 specifies:

`stage → prepare command → spawn + confirm → transfer cleanup`

The source performs synchronous spawn, installs the exit listener, and calls `wireRunInput` **before awaiting spawn confirmation**. Following R4’s sequence can yield before lifecycle listeners receive their callbacks—the race the revised tests are supposed to prevent.

Specify one sequence: **spawn → install exit/lifecycle listeners and transfer callbacks synchronously → await confirmation → dispatch**. [Design R1/R4](https://github.com/AINSEP/Tovu/blob/81bbdde75125d4fd5f0473fbebed381e36130af3/size-designs/10-jini-daemon-agent-executor-launch.md#L107-L121), [source ordering](https://github.com/AINSEP/Jini/blob/02edbb684c8d9862b94e97ebe858c9bf1e68f132/packages/daemon/src/agent-executor/launch.ts#L1666-L1695)

### R7 — body-limit headroom does not preserve accepted requests

First-judgment **major 6** remains incorrect. §11.6 claims that 128 KiB behind the preset’s 100 KiB parser, and 8 MiB behind Tovu’s 6 MiB parser, preserve effective limits despite reserialization.

A local JSON experiment produced:

| Input | Original bytes | After parse/stringify |
|---|---:|---:|
| Array containing 20,000 `1e20` values | 100,001 | 440,001 |
| Array containing 1,200,000 `1e20` values | 6,000,001 | 26,400,001 |

Both original bodies fit their respective host parsers; both reconstructed bodies exceed the proposed bridge limits. Numeric arrays can also occur inside tool inputs. Small fixed headroom therefore introduces new 413 responses.

Carry the host parser’s accepted-body provenance through the bridge, or define a reconstruction policy that actually preserves acceptance. Include expansion fixtures in T4. [Design §11.6](https://github.com/AINSEP/Tovu/blob/32cd78edd99d19db69d8c0fcde47439ff9a322ba/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R7-ROUTES.md#L625-L637)

### R8 — the replacement capability receiver is wrong

First-judgment **major 8** remains broken. §12.8 reads:

`agentRuntime.launch.capabilities({ defId })`

C6’s filled contract places that member under **`defs.capabilities`**. `launch` owns `hostEnvNames`, but not `capabilities`. Following R8 either fails compilation or encourages adding a second capability surface contrary to the named contract. [R8 §12.8](https://github.com/AINSEP/Tovu/blob/32cd78edd99d19db69d8c0fcde47439ff9a322ba/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R8-RUNTIME.md#L421-L430), [C6 contract](https://github.com/AINSEP/Tovu/blob/9152711deb22b04b522ea1d65ff3fdbae18a9e39/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/sheets/C6.md#L178-L188)

The security-related **major 9** also remains deferred: §12.9 leaves launcher-owned filesystem effects open, while size 10 assumes filesystem ports already exist. That gap needs an explicit implementation owner; see conflict 2 below.

### Import cycles — the target-constraint finding remains conditional

First-judgment **major 7** is only partly closed. Reusing the existing notifier fixes the proposed duplicate contract, and the composition splits become prerequisites. But §4.1 explicitly leaves over-limit feature functions and growth in `server/routes/types.ts` to decision 9. Designs 01/02 do not cover those remaining units.

The revised text discloses this remaining work; it does not complete it. Record the applicable exceptions or add the required decomposition tasks before declaring that finding closed. [Design §4.1](https://github.com/AINSEP/Tovu/blob/bd89a8c2d9da3c96708701256618dadbd3acf2a1/designs/import-cycles/DESIGN.md#L388-L407)

## Cross-design conflicts

1. **R8 versus C6 — capability ownership.**  
   **Concept:** `AgentRuntimePort` capability lookup. R8 specifies `launch.capabilities`; C6 specifies `defs.capabilities`. **Change R8**, including its tests and stop condition, to consume C6’s existing member. Do not extend C6 with an alias.

2. **R8 versus size 10 — filesystem-port handoff has no implementing task.**  
   **Files:** `agent-executor/launch.ts` and its extracted execution files. R8 §12.9 leaves private-directory effects open; daemon INDEX O-7 recommends adding a `StagingDirPort` during size 10. Size 10 R5/R7 instead assumes filesystem ports already exist and specifies no port introduction. **Change size 10** to own that boundary explicitly before dependent extraction, or move the task into R8 and make it a prerequisite. [R8 evidence](https://github.com/AINSEP/Tovu/blob/32cd78edd99d19db69d8c0fcde47439ff9a322ba/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R8-RUNTIME.md#L432-L439)

3. **Import-cycle J2 versus lane K/ACP — the shared MCP JSON helper gets the wrong final ownership.**  
   **Concept:** `mcp-json-file.ts`. J2 creates it inside daemon and makes Claude, Codex and OpenCode staging files import it. Lane K moves those consumers into `agent-runtime/defs/<cli>/`; R8 §12.14 requires that destination to depend only on itself, core and protocol. Keeping J2’s owner creates an agent-runtime → daemon dependency; copying the helper creates parallel owners. **Change J2 and lane K’s shared handoff** to settle the helper’s final owner and access contract before moving consumers. J2 currently orders itself after R8 and size 10 but gives no ordering or ownership reconciliation with K. [J2](https://github.com/AINSEP/Tovu/blob/bd89a8c2d9da3c96708701256618dadbd3acf2a1/designs/import-cycles/DESIGN.md#L456-L474), [lane K constraint](https://github.com/AINSEP/Tovu/blob/32cd78edd99d19db69d8c0fcde47439ff9a322ba/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R8-RUNTIME.md#L475-L484)

4. **AG-UI S2 versus R7 P1 — a required host helper is missing from the prerequisite graph.**  
   **File:** Tovu `composition/jini-routes.ts`. AG-UI S2.5 calls `mountJiniRoutes`, but S2 lists only C4, P-NODE-BRIDGE and C-ORIGIN-PORT as prerequisites. R7 creates the host helper later, in **P1**; landing the bridge alone does not provide it. **Change AG-UI S2.5** to depend explicitly on R7 P1. Also serialize its `sse.ts` `drained()` addition with R7’s C4-e changes. [AG-UI S2](https://github.com/AINSEP/Tovu/blob/3ee6c75e7fb4c2175b87658828617bfb2b177e24/designs/ag-ui/DESIGN.md#L759-L769), [R7 prerequisite graph](https://github.com/AINSEP/Tovu/blob/32cd78edd99d19db69d8c0fcde47439ff9a322ba/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R7-ROUTES.md#L762-L764)

## Shared hotspot order

Proposed serialization:

1. **`deps.ts`, `app.ts` and resulting composition slices:** size 02 boot helpers/mounts → size 01 → size 02 memory extraction and approved `createInMemoryApp` migration → import-cycle S3b/S4/S5b → run-finalizer Phase C → error-system E3 and publish-engine composition edits. Reserve this composition window according to size 01’s before-wave-C/after-wave-E constraint.

2. **Daemon `launch.ts`, `contracts.ts`, `events.ts`:** R8a process-contract changes → C6 → R8b → resolve the J2/K shared-helper owner → size 10 and J2 in their declared order → lane K → ACP phases B/C. Any ACP Phase A change touching these same contracts must occupy its own serialized slot and update C6’s restated session types.

3. **`agent-daemon-scope.ts`:** R8 executor bindings → R7 host/mount conversions → AG-UI wiring → ACP catalog changes. Rebase each lane against the preceding result.

4. **`builtin-features.ts`, `kernel-base.ts`, server construction files:** R8 terminal/runtime wiring before R7 pack-mount conversion. Apply associated manifest, export and debt-file edits serially.

5. **Core `contracts/server/sse.ts`:** R7 C4-e → AG-UI `drained()`, with both replay and backpressure tests retained.

6. **Chat files:** finish C6/R4 changes to touched files → size 08 → size 09. Finalizer B1 waits for C6 plus R4’s recovery-port conversion.

7. **Independent size lanes:** renderer 03 → pages 04; PostEditor 05 before its banner-extraction lane. Run admin API 06 separately from error-system client changes touching the transport and error class.
