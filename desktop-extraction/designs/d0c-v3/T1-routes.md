# T1 (Tovu, D0c1a): the desktop mounts its daemon routes with Jini's binding; `jini-routes.ts` stays (~50k, T; P owed)

Needs: J1 built and linked (COMMON section 2). Design: `../D0c-REVISION-3.md` section 2 (Q1 option C). This sheet is the whole answer to the combine-3 blocker: the website's `jini-routes.ts` and its request facts are not touched.

**Landing condition (CI uses registry `@jini-ai/*`):** T is proven on a linked Jini. The commit lands on the integration branch only together with (or after) the pin bump to the first published `@jini-ai/server` that has the J1 subpaths, lockfiles regenerated with `npx npm@11.12.1 install --package-lock-only` (root not needed; `apps/desktop`).

## Census (step 0; expected on 2d82735a)
```bash
git grep -n "jini-routes" -- apps/desktop                        # desktop-agent.ts:40 only
git grep -n "mountJiniRoutes\|daemonRouteHost" -- apps/desktop   # desktop-agent.ts:40, :381, :382, :383
git grep -n TOVU_REQUEST_FACTS -- apps/desktop                   # nothing
npm pkg get dependencies.@jini-ai/server --prefix apps/desktop   # {}
```

## One commit: `refactor(desktop): daemon route lists mount through @jini-ai/server, not the website's jini-routes`
- `apps/desktop/src/desktop-agent.ts:40`: replace the import with `import { mountRoutes } from "@jini-ai/server/mount-routes";` and `import { presetRouteHost } from "@jini-ai/server/route-host";`.
- `:381` `daemonRouteHost({ context: adapter, parserLimitBytes: 4 * 1024 * 1024 })` -> `presetRouteHost({ context: adapter, parserLimitBytes: 4 * 1024 * 1024 })` (same argument object).
- `:382-383` `mountJiniRoutes({ app, routes: ... })` -> `mountRoutes({ app, routes: ... })` (same arguments).
- `apps/desktop/package.json` `dependencies`: `"@jini-ai/server": "^0.7.0"` (beside `@jini-ai/sidecar`; the landing commit raises it to the release with J1) + `apps/desktop/package-lock.json`. G-DEP with `NAME=@jini-ai/server`.
- `apps/desktop/src/dist-import-check.test.ts:111-121`: append `"server/runtime/composition/jini-routes"` to `MOVED_WEBSITE_MODULES`.
- Nothing in `apps/website`, `development` or `packages` changes.

Characterization (exists; no new test): `apps/desktop/src/desktop-agent.test.ts` starts the real bridge (`startBridgeServer`, `desktop-agent.ts:364`) and calls it over HTTP: catalog search `:163`, delegated tool calls `:174`, `:177`, a foreign-run call `:179`, and the bearer gate `:45-47`. Green on `B` and after the edit (it runs inside `npm run gates`; run it alone with `(cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/desktop-agent.test.ts)`).

Behaviour notes (no test change needed): the desktop's locals lose the `tovuRequestFacts` key, which nothing on this path reads (census line 3; Jini `delegated-tools.ts`/`tool-catalog.ts` contain no `locals`); `recordRouteRegistrations` is a no-op without an installed route guard (`http-kit/src/route-registration-guard.ts:121-122`).

Mutation proof: delete the edited `mountRoutes({ app, routes: delegatedToolRoutes(...) })` line in a scratch commit -> `desktop-agent.test.ts` fails at the delegated call (`:174`) -> green control first; drop the scratch commit. Import gate mutation per COMMON section 4.

Staging check: `stage-website-shared` bundles the previous list minus `server/runtime/composition/jini-routes.ts`.
Tests (`FILES`): `apps/website/src/server/runtime/composition/__tests__/jini-routes.unit.test.ts` (unchanged, proves the website side untouched). The desktop tests run inside `npm run gates`.
