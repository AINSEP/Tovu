# T3 (Tovu, D0c1c): product events vocabulary -> `@tovu/contracts/product-events` (~50k, T; P owed)

No Jini change. Pure tables + two pure functions; its one runtime import is `TOOL_ATTEMPT_PHASES` from `@jini-ai/daemon/tool-audit` (a `universal` subpath of a package the desktop already declares).

## Census (step 0; expected on 2d82735a)
```bash
git grep -n -E "product-events(\.js|\.ts)?['\"]" -- apps development packages
```
Expected 3: desktop `src/product-telemetry-ipc.ts:3` (`PRODUCT_EVENTS`); website `server/runtime/composition/product-telemetry.ts:15` (`productAdminScreen`, `projectProductEvent`); test `composition/__tests__/product-telemetry.unit.test.ts:11` (`PRODUCT_EVENTS`, `projectProductEvent`).

## One commit: `refactor(contracts): product events vocabulary moves into @tovu/contracts`
- `git mv apps/website/src/server/runtime/composition/product-events.ts packages/contracts/src/product-events.ts` (content unchanged; its `_options = {}` signatures already follow the args rule).
- `packages/contracts/package.json` `dependencies`: add `"@jini-ai/daemon": "^0.7.0"` (root range) + root `package-lock.json` (`npx npm@11.12.1 install --package-lock-only`). Type-only `@jini-ai/core` import needs no entry (as `product-telemetry.ts:1` today).
- Repoint the 3 importers to `@tovu/contracts/product-events`.
- `apps/desktop/src/dist-import-check.test.ts`: append `"server/runtime/composition/product-events"`.
- G-DEP: `NAME=@jini-ai/daemon` (already declared; confirms the runtime import resolves inside `app.asar`).
- No test moves: the only test is `product-telemetry.unit.test.ts`, which also tests the boot (stays).

Characterization: the existing cases at `product-telemetry.unit.test.ts:278-287` (frozen at both levels; three `projectProductEvent` projections) are green on `B` and stay green after the move with only their import line changed: they are the pin. Mutation: drop the inner `Object.freeze` in the moved file -> that test goes RED; restore.
Tests (`FILES`): `apps/website/src/server/runtime/composition/__tests__/product-telemetry.unit.test.ts`.
Staging check: previous list minus `server/runtime/composition/product-events.ts`.
