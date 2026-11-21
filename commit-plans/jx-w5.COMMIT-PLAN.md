# COMMIT-PLAN

Branch: `codex/jx-w5`. Base supplied by dispatch: Jini merge-10 `de4e555b9`.
Implementation only; no tests, builds, installs, type-checks, linters, mutations, staging or commits executed. Tests were written before each sheet's source edits. Runtime red/green and mutation evidence belongs to combine.

## GATE-ABORT-J — done, execution owed

- Base: `de4e555b9`.
- Files: `packages/core/src/gated-mutations/gateway.ts`; `packages/core/src/gated-mutations/__tests__/gateway.test.ts`; shared root `COMMIT-PLAN.md` and `REFRESH.md`.
- Tests: three added, none removed. Authorization-triggered abort must reject with the identical reason and save zero tokens; original source saves instead. Plan-verification-triggered abort must reject with the identical reason, leave the token minted and apply zero mutations; original source redeems and mutates instead. Abort after successful redemption must leave the token redeemed and complete exactly one mutation; this is an existing-behavior guard, not an expected runtime-red baseline case.
- Mutations owed to combine: remove the confirm check; move the execute check above `computePlan`; insert a signal check between successful redemption and `executeMutation`.
- API-baseline delta: additive `signal?: AbortSignal` in the existing first argument of `confirm` and `execute`; zero API-baseline gate edits. Existing `_optional = {}` pads and token-store/hook arguments preserved.
- Look owed: no standalone browser look.
- Diff re-read deletions: none; no incidental edits required removal.
- File over 500 lines: gateway test file, 617 lines; continue under owner ruling.
- Static boundary review: timestamp computed before execute's abort check; no asynchronous gap between either abort check and its store call; refusal order and post-redemption mutation preserved. Changed functions remain below 50 lines and complexity 10 by inspection; no automated checks run.

## tv-rjk T2-J — done, execution owed

- Base: `de4e555b9`, following GATE-ABORT-J in this working tree.
- Files: `packages/core/plugin-directory.js`, `packages/core/plugin-directory.d.ts`, `packages/core/src/__tests__/plugin-directory.test.ts`; `packages/plugins/src/host/ports.ts`, `packages/plugins/src/host/manifest.ts`, `packages/plugins/src/host/capability-tools.ts`, `packages/plugins/src/host/node/runtime-contracts.ts`, `packages/plugins/src/host/node/discovery.ts`, `packages/plugins/src/host/node/install.ts`; `packages/agent-plugins/src/connect/plugin-host/index.ts`; shared root handoff files.
- Tests: three added, none removed. Explicit legacy selection validates and returns declared ID/provides, while omission retains `unknown/site-rules`; original source returns the fallback identity even with opt-in. Current extension precedence and null-current refusal protect existing behavior against the named mutations; these are not expected runtime-red baseline cases.
- Mutations owed to combine: remove legacy selection; select legacy first; use nullish coalescing for extension selection.
- API-baseline delta: additive `legacyNamespace?: string | undefined` on both existing core identity inputs; additive `legacyIdentityNamespace` on manifest/runtime/capability host bags and `legacySiteIdentityNamespace` on `PluginHostDeps`. The capability bag accepts explicit undefined because its reconstructed host forwards that property. No baseline, package-entry, dependency, manifest or injection-debt edits.
- Look owed: paired Tovu combine checks Plugins list and same-publisher upgrade for a pre-existing site install in Chrome.
- REFRESH: approved catalog importer unchanged; runtime bag spreads retain the field; Agent Plugin lifecycle admission unchanged.
- Diff re-read deletions: none; no incidental edits required removal.
- File over 500 lines: `capability-tools.ts`, 683 lines; continue under owner ruling.
- Static boundary review: primary `undefined` alone permits legacy selection; null remains invalid; manifest/extensions checks keep their order. Only named helper added; existing casts and option pads preserved. Changed functions remain below 50 lines and complexity 10 by inspection; no automated checks run.
