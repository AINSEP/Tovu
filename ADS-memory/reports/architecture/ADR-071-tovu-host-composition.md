# ADR-071: Tovu owns product wiring

- Status: Accepted owner direction. CI rollout follows the extraction plan.
- Date: 2026-11-22
- Owner decision: 2026-11-20 to 2026-11-22

## Context

Tovu organized features into folders, but their code still reached sideways into shared host modules for routing, storage, admin transport, and live hooks. Moving a folder therefore meant tracing and rewriting its dependency graph. The extraction census found 690 candidate files importing code that stays in Tovu. The route adapter was a prerequisite for 334 files. The Jini audit counted 137 value-bearing references between packages outside Core. These measurements come from different planning snapshots. [Extraction plan](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P9-extraction.md) · [Tovu dependency audit](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P12-tovu-tangle.md) · [Jini gate plan](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P12-tangle-plan-jini-gates.md)

## Decision

1. **Keep product ownership in Tovu.** Tovu owns site policy, product copy, themes, and the composition root that selects and connects implementations. Move generic behavior to product-, vendor-, and server-framework-neutral `@jini-ai/*` packages. Split mixed files at the seam. Carry behavior and why-comments with the code, point callers to the owning export, and delete forwarding shells.
2. **Give each feature its own dependencies.** Pass external dependencies through required arguments or props. Each feature defines the smallest structural port or deps type it needs. Keep host infrastructure, live bindings, and sibling implementations out of feature imports. Shared generic types and ports live in `@jini-ai/core`. New files under Core’s `src/contracts` hold types only. Runtime code goes in its owning implementation module. Tovu-specific types live in `@tovu/contracts`. Code bound for Jini never imports `@tovu/contracts`.
3. **Mount routes in the host.** Define JSON specs with `defineJsonRoute` from `@jini-ai/core/contracts/server`. The spec declares a small route-local deps type and leaves `ports` unset. Tovu mounts it with `mountJsonRoute` from `@jini-ai/http-kit`, passing explicit route-local deps and Express-compatible host ports. The compatibility package also exposes its own Express-bound `defineJsonRoute`. Keep `RouteDeps`, including `Pick<RouteDeps, …>`, out of feature specs. Bind server adaptation, workspace admission, authentication, authorization, and error mapping at the host boundary. Preserve middleware order, body limits, and response behavior during the cutover.
4. **Bind admin screens at the mount.** Supply the `@jini-ai/admin` kit from Tovu composition. Pass custom React hooks as required props with neutral names and types that expose only what the screen reads or calls. Keep concrete imports and live bindings in composition. Pass sibling UI through slots and product copy through existing args or props fields.
5. **Keep public call shapes and code limits.** Public functions and factories take `(requiredArgs, optionalArgs)` objects. Keep `_optional = {}` where the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

## Consequences

The host mount shows which live adapter, policy, and copy a feature uses. Tests can supply small fakes through the same inputs. Some mounts gain explicit arguments and props. Once the seam is in place, generic code can move with its behavior intact. An extraction that changes behavior starts with a failing test.

## Enforcement

CI compares resolved findings and checked-in allowances against the trusted base. New findings, growing or widened allowances, and stale entries left after a cut fail the check.

- **A — Admin feature rank.** Enforce descending rank for legacy sibling edges and freeze their occurrences, including type edges and detours through wrappers or shared modules.
- **B — Tovu extraction boundary.** Check the inventory for direct and indirect imports of host infrastructure or live binders and for bound imports of `@tovu/contracts`. Composition may import features and supply their ports.
- **C — Jini cross-package boundary.** Block new sibling implementation references and shared types outside the base packages. Allow Core types and the approved Core runtime exports listed with the debt file. Protocol keeps base-package status under the same public-entry rules. Check declarations and manifests as well as source.
- **D1–D4.** Block forwarding shells, concrete or defaulted custom hooks in extractable components, console/Express/vendor implementation dependencies and host identity in Jini, and growth in size exceptions. Track existing compatibility debt by occurrence.

Each Jini-bound feature folder’s `INFO.md` or `README.md` has a **Wiring** section. It lists what the feature needs, what it provides, a short host wiring example, and what it must not import, and links to this ADR. CI also checks that the ports it names exist. The agent that untangles or moves the feature writes the section in the same change.

## How to wire a feature

The feature exports the route spec. The host supplies the workspace-scoped reader and Express-compatible ports. Core ports receive Web `Request` and `locals`; the Express authentication port receives `res`, so each is supplied at its own mount.

```ts
import { defineJsonRoute, type Result } from '@jini-ai/core/contracts/server'

type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>
}

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
})
```

```tsx
import { mountJsonRoute } from '@jini-ai/http-kit'
import { AdminKitProvider } from '@jini-ai/admin/react/kit'

mountJsonRoute({
  app,
  spec: { ...menuRoute, ports: adminRoutePorts },
  deps: { readMenu: readAllowedWorkspaceMenu },
})

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

The screen declares `useMenu` as a required prop typed to its narrow result, such as `{ title: string }`. The kit provides shared UI such as `Notice`.

## Alternatives rejected

- **A central dependency module or Tovu Core for everything.** A shared dependency bag gives each feature access to unrelated services and ties portable code to Tovu’s graph.
- **Import implementations and expose defaulted overrides.** The default keeps the dependency edge and makes wiring implicit.
