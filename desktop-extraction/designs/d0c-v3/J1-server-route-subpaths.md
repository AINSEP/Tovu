# J1 (Jini): `@jini-ai/server` exports its existing Node route mount and route host as subpaths (~25k, T)

Why: Tovu's desktop mounts two daemon route lists (`apps/desktop/src/desktop-agent.ts:381-383`) with the website's `jini-routes.ts`, which now carries Tovu request facts. Jini already has the generic pair: `packages/server/src/mount-routes.ts` (`mountRoutes`, 46 lines) and `packages/server/src/route-host.ts` (`presetRouteHost`, `nodeSessionTimer`, `PRESET_JSON_PARSER_LIMIT_BYTES`). The root entry re-exports `mountRoutes`/`nodeSessionTimer` only and loads the whole preset (`compose-jini-kernel`, `kernel-base`, ...); `presetRouteHost` is not exported at all. Design: `../D0c-REVISION-3.md` section 2.

## Census (step 0; expected on d37821a4)
```bash
rg -n "^export" packages/server/src/mount-routes.ts packages/server/src/route-host.ts
rg -n "mount-routes|route-host" packages/server/src/index.ts packages/server/package.json
```
Expected: `mount-routes.ts:32 export function mountRoutes`; `route-host.ts:14 PRESET_JSON_PARSER_LIMIT_BYTES`, `:23 nodeSessionTimer`, `:34 presetRouteHost`; `index.ts:91-92` re-export lines; no `package.json` hit.

## One commit: `feat(server): ./mount-routes and ./route-host subpath exports`
Files:
- `packages/server/package.json`: add to `exports` (same shape as `./owner-store`): `"./mount-routes": { types: ./dist/mount-routes.d.ts, import/default: ./dist/mount-routes.js }`, `"./route-host": { ... ./dist/route-host.* }`; add both to the `jini` entry metadata the guard reads (runtime `node`, same block style as the other subpaths; `pnpm guard` says which key if the shape differs: then follow its message).
- `api-baseline/jini-ai__server.json`: `pnpm api:update`, plus a `.changeset/*.md` (minor, "server: ./mount-routes and ./route-host subpaths") if `pnpm api:check` asks for one.
- No source file changes, no new source file (no shell): the subpaths map to the existing modules.
- Test (new, `packages/server/src/__tests__/route-subpaths.test.ts`, vitest): import `mountRoutes` from `@jini-ai/server/mount-routes` and `presetRouteHost` from `@jini-ai/server/route-host` (self-reference through the package name, as the other subpath tests of this package do; if none does, import via `../../package.json` exports with `import.meta.resolve` and assert the resolved file names). Assert: `presetRouteHost({ context, parserLimitBytes: 102_400 }).jsonBodyMaxBytes === 537_600` (the Tovu `jini-routes.unit.test.ts:112` pin) and `typeof mountRoutes === 'function'`.
Mutation proof: point `./route-host` at `./dist/mount-routes.js` -> the new test fails; restore.

Gate: COMMON G (Jini), `PKGS="server"`.
