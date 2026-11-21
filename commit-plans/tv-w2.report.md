**Three sheets done; two STOPPED.** Paths below are relative to `apps/website/src/`.

- **AG0-T — done:** Deleted `server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts`: two tests, all nine assertions mapped to verified Jini counterparts.
- **TV-AG1 — STOPPED:** Jini’s `packages/chat/src/core/ag-ui/event-projection.ts:262–268` adds interrupt wire behavior absent from the host. It also leaves response ending to the caller; the host has no `res.end()` after its call at `server/runtime/composition/modules/assistant-ag-ui.ts:389`. No edits.
- **T1-perfobs — STOPPED:** The required search found an unlisted production re-export at `assistant/agent-daemon-port.ts:65`, triggering the importer rule. No source or test edits.
- **I2-T — done:** Changed `platform/db/repos/media-repo.ts`, `server/inbound/admin-http/routes/media/byte-size.ts`, its `__tests__/byte-size.test.ts`, and `features/media/__tests__/repo.contract.test.ts`. Three tests changed; one SQL case added for both dialects. Tests were written and read before source changes. Batched lookup retains eight concurrent stats, zero sizes and unknown-size behavior.
- **RD-T2 — done:** Updated three cases across `assistant/__tests__/credential-chat-intake.unit.test.ts` and `credential-noise.unit.test.ts`. DKIM survives; the opaque positive gains `sk-`. No source edits.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-w2/COMMIT-PLAN.md) contains the assertion map, red reason, test names and combine obligations. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-w2/REFRESH.md) records STOPs, the stale debt-file reference and deferred verification.

Final diff review found no unrequired edits to remove. No tests, builds, installs, typechecks, linters, commits or `.git` writes performed.
