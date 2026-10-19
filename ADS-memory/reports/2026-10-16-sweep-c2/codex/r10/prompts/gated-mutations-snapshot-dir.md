# Tovu: one stale expectation in an "unrun" real-composition test (snapshot directory)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset/add). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:` + `VERDICT:`
(stale test since <commit> | real bug). REUSE before you write. Smallest change. Move "why" comments with code, never delete them.
Do NOT edit non-test files under apps/website/src/assistant/** or apps/website/src/server/runtime/composition/**.

## Failure (node --test, --test-concurrency=1, 2026-10-17; the file now has the isolated-catalog-home import and every other test in it passes)
```
test at apps/website/src/server/__tests__/integration/gated-mutations-real-composition.unrun.integration.test.ts:1:6415
✖ [unrun] migrate-forward [sqlite]: plan → confirm → execute captures a real content.db snapshot, lists it as a restore point, and records a core.migration ledger row (1216.056287ms)
  AssertionError [ERR_ASSERTION]: the snapshot is written beside content.db
  + actual - expected
  + '/var/folders/.../T/unrun-site-sqlite-MG4gQ6/site/data.nosync'
  - '/var/folders/.../T/unrun-site-sqlite-MG4gQ6/site'
      at TestContext.<anonymous> (.../gated-mutations-real-composition.unrun.integration.test.ts:167:10)
```

## Do
Find out where content.db actually lives for a booted site today (the `data.nosync/` layout; see
apps/website/src/platform/site-dir and the unrun-site-boot helper in server/__tests__/helpers/) and whether
the snapshot really is written beside content.db. If yes, the test's expected directory is stale: derive it
from the real content.db path the helper/boot exposes (not a hard-coded "data.nosync" string if a helper
already gives the path). If the snapshot is NOT beside content.db, that is a real bug: describe it under
NOT DONE with file:line and do not change the assertion. Name the commit that moved content.db into
data.nosync in VERDICT (git log -S is fine). The file header says "@unrun ... NEVER EXECUTED": leave it.
