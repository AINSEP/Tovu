# T3 (Tovu, D0c1c): product events vocabulary -> `@tovu/contracts/product-events` (one repo: Tovu; Codex-ready, no Jini change)

The module is pure tables plus two pure functions. Imports (`2d82735a6:apps/website/src/server/runtime/composition/product-events.ts:2-3`): type-only `@jini-ai/core/contracts/observability`, runtime `TOOL_ATTEMPT_PHASES` from `@jini-ai/daemon/tool-audit` (a `universal` subpath).
Jini for verification: the Jini start SHA. New desktop dependency: none (the desktop declares `@jini-ai/core` and `@jini-ai/daemon`). Manifests changed: `packages/contracts/package.json` only.
Named tests: `apps/website/src/server/runtime/composition/__tests__/product-telemetry.unit.test.ts`, `apps/desktop/src/product-telemetry-ipc.test.ts`.
Expected staging list on `C`: the list before this sheet minus `src/server/runtime/composition/product-events.ts`.

## Files to change (one commit: `refactor(contracts): product events vocabulary moves into @tovu/contracts`)
- `git mv apps/website/src/server/runtime/composition/product-events.ts packages/contracts/src/product-events.ts` (content unchanged; its `_options = {}` signatures already follow the args rule).
- `packages/contracts/package.json` `dependencies`: add `"@jini-ai/core": "^0.7.0"` (the type-only import still needs the package to compile: judge 3 S2) and `"@jini-ai/daemon": "^0.7.0"` (runtime), alphabetical. Then regenerate **every** lockfile that records the contracts package's dependencies, after the manifest edit, each with `npx npm@11.12.1 install --package-lock-only --ignore-scripts`: repo root (`package-lock.json:14310`), `apps/desktop` (`package-lock.json:69`), `apps/admin` (`package-lock.json:85`).
- Repoint the 3 importers to `@tovu/contracts/product-events`: desktop `apps/desktop/src/product-telemetry-ipc.ts:3`; website `server/runtime/composition/product-telemetry.ts:15`; test `server/runtime/composition/__tests__/product-telemetry.unit.test.ts:11` (allowed edit a).
- `apps/desktop/src/dist-import-check.test.ts`: append `"server/runtime/composition/product-events"`.

## Characterization tests to add
None new. The pin is `product-telemetry.unit.test.ts:278-287` (frozen at both levels; three `projectProductEvent` projections), green on `P` and on `C` with only its import line changed.
Red check: drop the inner `Object.freeze` in `packages/contracts/src/product-events.ts` -> that case fails.

## STOP conditions
- `git grep -n -E "product-events(\.js|\.ts)?['\"]" -- apps development packages` lists other lines than the three above.
- `rg -n "#src|website/src" packages/contracts/src/product-events.ts` prints anything after the move.
- `git grep -n '"\.\./\.\./packages/contracts": {\|"packages/contracts": {' -- package-lock.json apps/*/package-lock.json` lists a fourth lockfile (then it is regenerated too; report it).
- Any lockfile command fails: commit nothing more, report.
