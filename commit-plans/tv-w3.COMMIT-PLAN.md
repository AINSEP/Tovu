# Commit plan

## T1-perfobs — done

- Base: `b53b3595cc0ea28b967c05e2bbdcfd87c9bc9a21` (coordinator's `codex/tv-w2` base); working branch: `codex/tv-w3`.
- Files touched:
  - `apps/website/src/assistant/tool-recovery-preset.ts`: add the two optional observation fields using the existing daemon factory input type; the existing `...deps` spread forwards them unchanged.
  - `apps/website/src/assistant/byok-tool-surface.ts`: forward the port and live gate through `composeSurfaceExecutor`. Only add `observabilityEnabled` to `ByokToolSurfaceDeps`; `observability` is already inherited through `AssistantToolRegistryDeps` / `SourceControlToolDeps` and `StaticPublishToolDeps`.
  - `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts`: add `a registered BYOK call settles one tool.call and the live gate suppresses the next observation`. It checks one start and completed settlement, then changes the gate to false and checks no additional observation and the preserved return. Every added assertion has a message.
  - Root handoff files: `COMMIT-PLAN.md`, `REFRESH.md`.
- Test first: wrote and read the test before editing production source. Expected red reason: the old BYOK composition does not forward observation dependencies, so the first call produces no recorded operation. Tests were not run, as instructed.
- Jini prerequisite: inspected only git objects at `origin/integ/merge-9-2026-11-21`; `packages/daemon/src/tool-recovery/stack.ts` exposes both optional fields and applies one observation decorator for a non-no-op port. Its `observability.ts` checks the gate on each execute. BYOK adds no second observation layer.
- Importer ruling: `apps/website/src/assistant/agent-daemon-port.ts:65` needs no edit; see `REFRESH.md`. The existing scope-tools caller stays unchanged. Existing test importers need no repoint.
- Combine owes: run the named suite on the published `0.7.3-next.1` lock; mutations omitting the forwarding and snapshotting the gate at construction; `check:test-safety` and applicable gates. No Chrome look or debt-row refresh is specified by this sheet.
- File sizes: `byok-tool-surface.ts` is 852 lines and its test is 1647 lines; both already exceeded 500 lines on the base. No new named functions or branches were added.
- Final diff re-read: no unrelated edits; deletions: none. No tests changed or deleted. No manifest, lockfile, debt baseline, or other sheet edits. No tests, builds, installs, type checks, linters, staging, commits, or pushes were run.
