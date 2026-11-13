### jini:packages/cms/src/routing/routing.ts
- **Over:** `createRouting` 188
- **Phase:** now · **Batch:** size-19
- **Package entry:** `./routing` → `src/routing/index.ts` re-exports `createRouting`, `RouteResolutionError` + types; none move.
- **Tests:** `src/routing/__tests__/routing.test.ts`, `routing.phase-lifecycle.test.ts`, `routing.phase-runners.test.ts`, `routing.ports.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `createRouting` | job |
|---|---|---|
| A url | `ABSOLUTE_URL_PATTERN`, `isAbsoluteUrl`, `normalizePath`, `postPublicPath`, `composeCanonicalUrl`, `UNSAFE_URL_SCHEMES`, `resolveUrlTarget`, `resolveTermRefTarget` | pure path/URL shaping (read no factory locals — confirm with outline `uses:`) |
| B phases | `phaseRegistry`, `ALL_PHASES`, `registerResolvePhase`, `unregisterResolvePhaseOwner`, `runPhase`, `resolve`, `runPreContentPhase`, `runPostContentPhase` | forward-resolution phase registry + runners |
| C (stays) | named routes, `isPublished`, `entryPublicPath`, `resolveEntryRefTarget`, `resolveRouteRefTarget`, `urlFor`, `isActive`, slug-change capture, test reset, return | URL generation + registrations |

- **Splits:**
  1. Unit A → module level above `createRouting`, verbatim (their `// ----` section banners move). `postPublicPath` keeps its `(required, _optional)` signature.
  2. HELPER `createResolvePhases({ required }: CreateResolvePhasesInput): ResolvePhases` → `{ registerResolvePhase; unregisterResolvePhaseOwner; resolve; runPreContentPhase; runPostContentPhase; resetPhases(): void }` ← unit B verbatim. `resetRoutingRegistrationsForTests` needs to clear `phaseRegistry`: if its body touches `phaseRegistry`, move that statement into `resetPhases` and call it at the same point.
- **Importers to update:** none.
- **After:** `createRouting` ~80; `createResolvePhases` ~65; file ~260.
- **Risks / notes:** `resolve` / `runPhase` read `required` (ports) — passed in. `ALL_PHASES` comment block moves with it.
