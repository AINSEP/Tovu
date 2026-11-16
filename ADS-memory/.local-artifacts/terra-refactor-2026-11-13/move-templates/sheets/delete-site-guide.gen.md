id: DL-site-guide-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/features/site-guide
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (non-exported helpers); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/features/site-guide/contracts.ts | blob 49cc0a452b40e683dfc48fcf0bd2e09a4740ebcd
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "contracts" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/site-guide/contracts.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*contracts(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/site-guide/contracts.ts
importers (14 prod, 1 test; resolved to this file):
  - apps/website/src/assistant/__tests__/tool-guidance.live.test.ts:11 | static | "../../features/site-guide/contracts.js"
  - apps/website/src/assistant/site/capability-card.ts:1 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/deployments/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/forms/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/members/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/plugin-runtime/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/post/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/recovery/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/seo/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/site-guide/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/site-guide/facts.ts:2 | static | "./contracts.js"
  - apps/website/src/features/site-guide/index.ts:1 | reexport | "./contracts.js"
  - apps/website/src/features/site-guide/plugin-contributions.ts:2 | static | "./contracts.js"
  - apps/website/src/features/theme/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
  - apps/website/src/features/widgets/capability-card.ts:2 | static | "#src/features/site-guide/contracts"
path_literals (rg -F "site-guide/contracts", not already importers):
  - development/scripts/check-architecture.baseline.json:80:    "apps/website/src/features/deployments/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:144:    "apps/website/src/features/forms/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:220:    "apps/website/src/features/members/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:243:    "apps/website/src/features/plugin-runtime/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:252:    "apps/website/src/features/post/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:302:    "apps/website/src/features/recovery/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:309:    "apps/website/src/features/seo/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:411:    "apps/website/src/features/theme/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
  - development/scripts/check-architecture.baseline.json:439:    "apps/website/src/features/widgets/capability-card.ts -> apps/website/src/features/site-guide/contracts.ts",
baselines (json files naming the path): development/scripts/check-architecture.baseline.json
declarations (name | line | kind):
  - CapabilityCard | apps/website/src/features/site-guide/contracts.ts:3 | interface
  - SiteFact | apps/website/src/features/site-guide/contracts.ts:12 | type
  - SiteGuideService | apps/website/src/features/site-guide/contracts.ts:13 | interface
  - SiteGuideEngine | apps/website/src/features/site-guide/contracts.ts:16 | interface
folds: TODO(judge)
tests:
  - apps/website/src/assistant/__tests__/tool-guidance.live.test.ts | blob 034887240f990dc4e5154280715489955dcdfa8e | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: development/scripts/check-architecture.baseline.json
