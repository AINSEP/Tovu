id: SP-admin-publish-content-1   (template T-SPLIT; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: admin/features/publish-content   (W1 #33, level 3)
status: BLOCKED — no executable slice. Nothing in this feature can go to Jini today.
tovu_files:
  - apps/admin/src/features/publish-content/hooks/publish-content-dependencies.hooks.ts | blob cb77f686f5d30d0ed24f8b10abd527be218ececb | 236 loc
kind: SPLIT as labelled (MIXED, survey target "none"); re-kinded STAY until its contract has a Jini home.
split (every top-level declaration):
  - defaultPublishContentPort (line 22) | STAY-WIRING (lib/api binding)
  - FakePublishContentPortOptions (35), DEFAULT_DESTINATION (67), FakePublishContentPortCalls (78), stageFakeReport (98), fakePublishPlanIdentity (143), createFakePublishContentPort (155) | STAY (test fake for a Tovu-only contract)
why no move: every type here comes from `@tovu/publish-content-ui`, a Tovu path alias (apps/admin/tsconfig.json:18, apps/admin/vite.config.ts:171) onto apps/website/src/features/publish-content/ui/index.ts. The vocabulary (peers, bundles, plan/confirm/execute tokens, PLAN_STALE, RESTORE_POINT_UNAVAILABLE, live overwrite) is Tovu's site-to-live publish protocol. Jini has no publish-content surface (rg "PublishContent" packages/*/src: only unrelated cms write-service names). A Jini fake for a contract Jini does not declare would break COMMON rule 1. The survey gave no target package either.
precondition (to unblock): website/features/publish-content is in the 24-feature cycle-cut SCC (PLAN.md W3). Only after that feature's contract (PublishContentPort + the ui types) is assigned a Jini package does this file split: port + fake to that package's /testing entry, defaultPublishContentPort stays.
owner question Q-PC: is site-to-live "publish content" (plan / confirm / execute against a peer) a generic Jini capability (then which package: deploy? cms?) or Tovu product? Recommendation: Tovu product; drop admin/features/publish-content from the move plan (STAY).
untangle_overlap: none
est. executor tokens: 0 (nothing to execute). Re-fill after Q-PC = generic: ~40k Opus (depends on the website feature's sheet).
