# tag-b — in progress

Branch: `cloud/tag-b`. Base: `origin/cloud/combine` at `abead52498c80fd86b8f7b37a2caed31d98a7307`.

Owner-approved scope: TAG plan steps 2, 3, 4 and remaining step 6, with TRIM TAG constraints. Default handles at existing shared owners, forwarding, Composer/picker, Tovu adoption; preserve secret/human approval exclusions and host driving boundaries.

Loaded Software Architect, Programmer, TDD personas from `/workspace/cloud/ai-dev-shop`. Baseline rebuild and targeted test setup in progress. Final commands, results, pushed SHAs and open findings will be recorded here.

No deploy, publish, main push, force-push, new schema, polling or registry.

## Checkpoint — implementation and verification in progress

Current commits on `cloud/tag-b` (periodic pushes confirmed through Jini `82b94c528` and Tovu `37d724980`):

```text
0f8b7229f76c4fb732b66ac87c05caae5fc358c1 docs: record tag-b scope and combined base
7c95d6af1358c88c5b102a69e4585e7f728f1bd3 fix(admin): give backup fields and menu embed direct handles
a38a9bd7e8982945f914e09016a35ce603d1ba8c feat(admin): keep tagged kit overlays within the page driver root
37d7249808239c8b3027e40ac2413753e2b8af80 test(admin): enforce human-only password fields after tagging adoption
```

Setup: frozen pnpm install refreshed stale links using a workspace-local store; original home-backed cache was read-only. Contracts, Jini dependencies and touched packages rebuilt; local Tovu link refreshed. PostgreSQL not needed. Initial recursive build failed before refresh because provider-plugins could not resolve declared jsdom/cms dependencies; direct refreshed provider typecheck passes. Initial Tovu test resolution failure disappeared after contracts rebuild. No source changes were used to hide setup failures.

Verified so far: Jini driver baseline 117 and updated 118 tests green; ui-kit React matrix 196 tests green before final confirmation additions; chat nine new primary regressions plus seven attachment tests green. Tovu untouched targeted baseline 48 tests green, direct backup/menu controls 36 green, corrected password/privacy and scoped overlay 19 green, App/WebMCP/secrets boundary 84 green. Admin tsc passes. Remaining final rebuilding and affected test evidence will replace this checkpoint.

BUG — Pre-existing chat history-remount regression: affected run 174/175, interrupted accepted message recalls first instead of accepted text; reproduced from unchanged origin/cloud/combine source archive. No source fix or test weakening.

BUG — Pre-existing Tovu AdminShell complexity 11 exceeds 10; baseline source stdin lint and current lint report the identical function/count. Other touched Tovu production paths pass strict complexity.

Open limitation — inherited very long explicit base handles can overflow agentHandleProps after suffixing; automatic generated bases are bounded. Listed only.
