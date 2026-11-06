# consent-declare — in progress
Branch cloud/consent-declare; base 5358aa594 (origin/cloud/combine).

Step 2 adds active-plugin browser bridge declarations, with a separate browser contribution cache and unchanged ingress-only region trust. Focused region/bridge suite: 7/7 pass. Complexity/cognitive10 checks pass. Root tsc is currently blocked by stale/missing linked Jini exports; no consent diagnostics in the first pass.

Steps 3–5 in progress. Legacy deletion waits for replacement consumers.

Checkpoint: pushed fd2cf6835 and 00261f060 to cloud/consent-declare. Replacement middleware tests4/4 pass: unchanged page bytes, zero off-mode consent reads/runtime, one published-only context read, native withdrawal control. Managed document slot tests2/2 pass. Theme, comments, plugin declaration and export tests pass. Step4 diagnostics and standalone preview in progress. Rebuilt Jini and relinked; rebuilt Tovu contracts to resolve stale generated exports.

Checkpoint: step5 in progress. Replacement consumers passed before removing the CMS HTML engine. Receipt/privacy/origin/rate checks retained; parse5 retained. Shared region subdivision regression fixed with failing test first. Final rebuild/relink/typechecks and report inventory in progress.

Checkpoint: Managed bare HTML fragments now construct asset slots; authored full documents remain unchanged and have explicit admin gaps. Automatic delivery and disabled export asset regressions fixed with failing tests first. Final source/admin/e2e typechecks and report completion in progress.
