DG2-02–06 edits are applied. DG2-01 is **STOPPED**. Tests and mutations remain unexecuted under the machine rule.

- **DG2-01 — STOPPED:** unlisted production importers at `cli/commands/init.ts:4` and `server/runtime/composition/move-site-storage.ts:11`. No files changed.
- **DG2-02 — done:** changed the architecture script and its test. Added the inline named-type fixture first; the old filter discards its emitted `import {}` edge, contradicting the expected runtime back-edge and two-module SCC.
- **DG2-03 — done:** deleted only the named unused import from `credential-ports.ts`. Existing forwarding and verify/probe tests retained; restoring the import owes rank-error and cross-feature-edge rejection.
- **DG2-04 — done:** repointed `plan-content.ts` and `provider-module.ts` to Jini’s existing type and deleted the duplicate interface. Existing round-trip test retained; the graph mutation supplies red evidence.
- **DG2-05 — done:** moved the cache verbatim and repointed all ten listed importers. Existing invalidation tests retained; the three callback/invalidation mutations remain owed.
- **DG2-06 — done:** applied the seven named public-render import repoints. Existing worker/public-read cases retained; barrel-restoration mutations remain owed. DG2-01 declarations are still pending.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dg-boundaries/COMMIT-PLAN.md) records every file, mutation, API delta, look owed, and required deletion. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dg-boundaries/REFRESH.md) records inventory gaps, corrected anchors, and combine prerequisites.

Diff re-read found no extras to delete. Existing pads are preserved; no baseline, manifest, lockfile, or `.git` writes.
