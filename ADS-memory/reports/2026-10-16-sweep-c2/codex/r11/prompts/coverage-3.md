# Tovu coverage round: bring each listed source file to 100% line + branch + function coverage

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md (test design) and act as the TDD agent.

RULES: do NOT run tests, typecheck, builds, coverage or any package scripts (another agent verifies under a machine lock).
Do NOT commit or touch git state (no stash/checkout/reset/add). Edit code only, then report
`CHANGED FILES:` (absolute paths), `PER FILE:` (each source file: which uncovered lines/branches your tests now hit, and any you could not),
`UNREACHABLE:` (genuinely unreachable branches: file:line + why; the owner decides delete or keep; never a fake test, never a silent delete) and `NOT DONE:`.
REUSE before you write: search for the file's existing tests and test helpers/fakes first and extend them (same folder `__tests__/`, same runner, same style); a new test file only when no suitable one exists.
Smallest change. Move "why" comments with code, never delete them.
Do NOT edit anything under apps/website/src/assistant/**, apps/website/src/server/runtime/composition/**, apps/admin/src/features/plugins/**, content/agent-plugins/shopify/**, README*, .github/**.
Do NOT edit any file that `git status --porcelain` shows as modified by someone else (other agents are working in the tree), except test files you create.
Tests must never touch the real home: website node tests import `apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts` FIRST (see its header) when they reach site/workspace code; use temp dirs and clean them up in `t.after`.

## Standard (owner, non-negotiable)
1. Target 100% line + branch + function per file.
2. Hard-wired deps (fs/net/db/clock/random/Electron/singletons/process.env/cwd) that block a branch: refactor into injected ports, API style `(requiredObj, optionalObj = {})`, defaults wired where the function is composed today, so existing callers do not change. Test with hand-written fakes.
3. No module-mocking the unit under test or its direct collaborators; module mocks only for true externals.
4. Test real behavior and assert outcomes (returned values, state, errors with their messages), not that a line ran. One focused test per behavior; name it after the behavior.
5. Runners: apps/website and repo node code use node:test (`import test from "node:test"`, `node:assert/strict`), as siblings do. apps/admin uses vitest + jsdom as siblings do.

## Measured gaps
Uncovered line numbers come from a 2026-10-16 coverage sweep. Some suites had failing tests in that run, so a line listed here may already be covered by an existing test: read the existing tests first and only add tests for behavior no existing test exercises. Branch gaps are not listed per line: read each conditional, `??`, `?.`, `||`, ternary and default parameter in the file and cover both sides.

## Files (lines % / branches % / uncovered lines)
- /Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/tool-registrations.ts (99.9% / 89.5%; 1 lines, 22 branches uncovered) lines: 123
- /Users/la/Programming/Tovu/apps/website/src/features/pages/html-document-store.ts (100% / 78.9%; 0 lines, 23 branches uncovered) lines: none
- /Users/la/Programming/Tovu/apps/website/src/features/navigation/import-menu.ts (100% / 68.6%; 0 lines, 22 branches uncovered) lines: none
- /Users/la/Programming/Tovu/apps/website/src/features/navigation/publish-content.ts (98.7% / 78.3%; 4 lines, 18 branches uncovered) lines: 32-35
- /Users/la/Programming/Tovu/apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts (97.5% / 91.8%; 5 lines, 15 branches uncovered) lines: 809-810,831,1144-1145
- /Users/la/Programming/Tovu/apps/website/src/features/pages/html-document-store.memory.ts (99% / 71.9%; 2 lines, 18 branches uncovered) lines: 32,37
- /Users/la/Programming/Tovu/apps/website/src/features/site-backup/push-engine.ts (100% / 77%; 0 lines, 20 branches uncovered) lines: none
- /Users/la/Programming/Tovu/apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts (91.5% / 72.1%; 6 lines, 12 branches uncovered) lines: 223-224,226-227,252,262
