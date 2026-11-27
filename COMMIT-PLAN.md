# Tovu r62t-rev-p2 handoff

Baseline: `codex/tv-b-p2`, HEAD `7c87b3c3f95301d59f55041bf163b723bbab5d79`. Initial working tree was clean. No git mutations were performed; the coordinator owns commits.

## Completed design commit, in order

1. **P2-T1.T0 — Forward the inactive-read option and pin the selected package**
   - First edited `apps/website/src/features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts`: added `shipped kuinetic 0.1.1 declares ui-ux-design as a companion`. Reads `PACKAGE_ROOT/plugin.json` from the selected package, requires successful manifest parsing, pins version `0.1.1`, and deep-equals companions to `["ui-ux-design"]`.
   - Then edited `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts`: replaced only the resolver binding. Defaults omitted `allowInactiveGuidance` to `false` and forwards explicit values with the existing injected resolver and workspace layout.
   - Handoff file: `COMMIT-PLAN.md`.

## Mutation and verification

- `drop-packaged-companion`: delete `extensions.jini.companions` from the staged selected-package copy supplying `PACKAGE_ROOT`, never Jini source. The new deep-equality assertion must fail. No duplicate fixture was added.
- `force-inactive-read-true` and its reliable runtime witness belong to OPUS P2-T1.T; this sheet adds no substitute runtime test.
- Tests were written before the production edit. Tests, mutations, builds, installs, type-checks, linters, and runtime self-validation were not run, as explicitly required by dispatch. No green baseline or passing runtime claim is made; cloud verification remains open.
- Tovu anchors match the supplied baseline. Read-only `codex/b-p2j` confirms `AutomaticAgentPluginPorts['resolve']` already accepts the second options object. The Jini handoff reports P2-T3.J implemented. P2-T1.T0 needs no unfinished Jini sheet; no SOL sheet was stopped or skipped.

## Review

- Static architecture review: PASS for this diff. Existing Jini ownership, Tovu wiring, resolver injection, and workspace selection are preserved. No dependency, API, manifest, permission, ranking, maturity, or companion-projection change.
- Function assessment: resolver binding has O(1) adapter bookkeeping and retains the existing resolver effects and return contract. Runtime and coverage assessment remain INCONCLUSIVE until cloud runs the OPUS witnesses.
- Final diff review: only the named test, resolver replacement, and this required handoff file. Deletions of unrequired additions: none. Existing comments and tests remain intact.

## Left to OPUS

- Tovu: P2-T1.T, P2-T2.T, P2-T3.T, P2-T4.T.
- Both repositories: P2-T5.0; its journal follow-on remains a dependent stub, not a separate runnable sheet.
- Jini, outside this Tovu job: P2-J2.J and P2-T4.J. P2-T3.J is the Jini SOL job; P2-J1 is DONE-ALREADY.

Cloud/coordinator next: run the package witness and named staged-package mutation, then route the runtime witnesses to OPUS; commit this logical unit after reviewing the working tree.
