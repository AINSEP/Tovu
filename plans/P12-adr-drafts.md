ADR DRAFTS COMPLETE

### TOVU ADR ADS-memory/reports/architecture/ADR-071-tovu-host-composition.md

# ADR-071: Tovu owns product wiring

- Status: Accepted owner direction. CI rollout follows the extraction plan.
- Date: 2026-11-22
- Owner decision: 2026-11-20 to 2026-11-22

## Context

Tovu organized features into folders, but their code still reached sideways into shared host modules for routing, storage, admin transport, and live hooks. Moving a folder therefore meant tracing and rewriting its dependency graph. The extraction census found 690 candidate files importing code that stays in Tovu. The route adapter was a prerequisite for 334 files. The Jini audit found 137 value-bearing references between packages outside Core. These are planning measurements from different snapshots. [Extraction plan](https://github.com/AINSEP/Tovu/blob/cd49e46b7a4d413d3619c5ca868aa298903fd6fa/plans/P9-extraction.md), [Tovu dependency audit](https://github.com/AINSEP/Tovu/blob/cd49e46b7a4d413d3619c5ca868aa298903fd6fa/plans/P12-tovu-tangle.md), [Jini gate plan](https://github.com/AINSEP/Tovu/blob/cd49e46b7a4d413d3619c5ca868aa298903fd6fa/plans/P12-tangle-plan-jini-gates.md).

## Decision

1. **Keep product ownership in Tovu.** Tovu owns site policy, product copy, themes, and the composition root that selects and connects implementations. Move generic behavior to product-, vendor-, and server-framework-neutral `@jini-ai/*` packages. Split mixed files at the seam. Carry behavior and why-comments with the code, point callers to the owning export, and delete forwarding shells.
2. **Give each feature its own dependencies.** Pass external dependencies through required arguments or props. Each feature defines the smallest structural port or deps type it needs. Feature code must avoid imports from host infrastructure, live bindings, and sibling implementations. Shared generic types and ports live in `@jini-ai/core`, with new `src/contracts` modules types-only under XP4. Put runtime code in its owning implementation module and Tovu-specific types in `@tovu/contracts`.
3. **Mount routes in the host.** Define each JSON route with the server-neutral `defineJsonRoute` spec. Tovu calls `mountJsonRoute` with the spec and explicit route-local deps. Keep `RouteDeps`, including `Pick<RouteDeps, …>`, out of feature specs. Bind server adaptation, workspace admission, authentication, authorization, and error mapping at the host boundary. Preserve middleware order and response behavior during the cutover.
4. **Bind admin screens at the mount.** Supply the `@jini-ai/admin` kit from Tovu composition. Pass custom React hooks as required props with neutral names and types that expose only what the screen reads or calls. Keep concrete imports and live defaults in composition. Pass sibling UI through slots and product copy through existing args or props fields. [Admin untangle plan](https://github.com/AINSEP/Tovu/blob/cd49e46b7a4d413d3619c5ca868aa298903fd6fa/plans/P9U-untangle-v2.md).
5. **Keep public call shapes and code limits.** Public functions and factories take `(requiredArgs, optionalArgs)` objects. Keep `_optional = {}` pads where the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

## Consequences

The host mount becomes the place to find the live adapter, policy, and copy used by a feature. Tests can supply small fakes through the same seam. Some mounts gain explicit arguments and props. Once a seam is in place, generic code can move with its behavior intact. An extraction that changes behavior starts with a failing test.

## Enforcement

CI compares resolved findings and checked-in allowances against the trusted PR base. Fail on new findings, growing or widened allowances, and stale entries left after a cut.

- **A — Admin feature rank.** Enforce descending rank for legacy sibling edges and freeze their exact occurrences. Include type edges and detours through wrappers or shared modules.
- **B — Tovu extraction boundary.** Check the extraction inventory for direct and indirect imports of host infrastructure or live binders. Composition may import features and supply their ports.
- **C — Jini cross-package boundary.** Block new sibling implementation references and shared types outside Core. Allow only approved Core runtime symbols. Check declarations and manifests as well as source.
- **D1–D4.** Block forwarding shells, concrete or defaulted custom hooks in extractable components, console/Express/vendor implementation dependencies and host identity in Jini, and growth in size exceptions. Existing compatibility debt is tracked by occurrence until removed.

A documentation check requires a **Wiring** section in each feature folder’s `INFO.md` or `README.md`. It lists what the feature needs, what it provides, a host wiring example, and what it must not import. It links to this ADR.

## How to wire a feature

**Tovu composition.** In this target wiring sketch, the host binds request policy and a workspace-scoped menu reader. The admin mount supplies the kit, the required hook, and product copy.

```tsx
mountJsonRoute({
  app,
  spec: { ...menuRoute, ports: adminRoutePorts },
  deps: { readMenu: readAllowedWorkspaceMenu },
});

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

**Jini feature.** The route and screen each declare the dependency they consume. The kit supplies `Notice`. The host supplies the custom hook.

```tsx
type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>;
};

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
});

type MenuScreenProps = {
  id: string;
  heading: string;
  useMenu: (required: { id: string }) => { title: string };
};

export function MenuScreen({ id, heading, useMenu }: MenuScreenProps) {
  const { title } = useMenu({ id });
  return <Notice>{heading} {title}</Notice>;
}
```

## Alternatives rejected

- **A central dependency module or Tovu Core for everything.** A shared bag gives every feature access to unrelated services and ties portable code to Tovu’s graph.
- **Import implementations and expose overrides with defaults.** The default keeps the import edge and lets callers bypass explicit wiring.

### JINI ADR docs/decisions/DR-006-host-injected-package-dependencies.md

# DR-006: Packages receive implementations from the host

Status: Accepted owner direction, 2026-11-20 to 2026-11-22. This record defines the target for CI enforcement.

## Context

A feature can have its own folder and still depend on a host’s route types, transport, or live hooks. The extraction census found 690 candidate files importing host code and 334 waiting on the route adapter. The Jini audit counted 137 value-bearing cross-package references outside Core. A package graph can be acyclic and still lock consumers into another package’s implementation. This decision extends the composition rule in [DR-005](DR-005-portable-package-boundaries.md).

## Decision

1. **Jini owns reusable behavior.** Keep packages product-, vendor-, and server-framework-neutral. Tovu is a host product. It owns product policy, themes, copy, and concrete wiring. Split mixed files at the seam and move the reusable behavior with its why-comments. Consumers use the owning public export. Forwarding-only compatibility files are prohibited.
2. **The consuming feature owns its port.** Each feature declares only the operations and data it uses. It receives implementations as arguments or props and keeps host infrastructure and sibling implementation imports out of its source. Put shared generic types and ports in `@jini-ai/core`. Under XP4, new `src/contracts` modules contain types only. Place new runtime code at its owning implementation path. Tovu-specific types live in `@tovu/contracts`.
3. **Routes publish specs.** Use Core’s approved `defineJsonRoute` constructor for server-neutral JSON specs. Each spec uses a small route-local deps type. The host calls `mountJsonRoute` with the spec and explicit deps, and binds its request policy and failure mapping. A central `RouteDeps` type, including a `Pick` from it, ties the spec to the host.
4. **Screens receive UI and behavior through declared inputs.** Use the host-injected `@jini-ai/admin` kit for shared admin UI. Custom React hooks arrive as required props typed to the fields and calls the component uses. Use neutral prop names and keep live defaults in host composition. Take product copy through existing args or props fields.
5. **Keep effects and call shapes explicit.** Inject logging and provider operations. Keep console calls, Express types and code, vendor implementations, and host identity out of Jini feature code. Existing Express compatibility subpaths are tracked debt. Public functions and factories take `(requiredArgs, optionalArgs)` objects, retaining `_optional = {}` when the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

## Consequences and current limits

Hosts can choose different providers and server adapters while keeping the same feature. Tests can supply small fakes. The host has more wiring to write, and package authors must maintain narrow contracts. Existing compatibility entries and import debt are removed as their consumers migrate.

## Defect prevented

A reusable package silently selects another package’s implementation, or a screen’s default hook reaches into a host transport even when the screen has an injection prop.

## Source and enforcement

CI tracks exact resolved occurrences against the trusted PR base. New violations, expanded allowances, and stale debt entries fail the check.

- **C — Jini cross-package boundary.** Reject new sibling executable imports and shared type imports outside Core. Allow Core types and explicitly approved runtime symbols, including `defineJsonRoute`. Check resolved source, declarations, and manifests.
- **D1–D4.** Reject forwarding shells, concrete or defaulted custom hooks, console/Express/vendor dependencies and host identity, and growth in size exceptions. Canonical same-package public entry points remain valid.
- **A and B — Host-side checks.** Tovu ratchets admin sibling edges and their ranks, including type edges and wrapper detours. Its extraction boundary blocks portable features from reaching host infrastructure and live binders.

A documentation check requires a **Wiring** section in every feature folder’s `INFO.md` or `README.md`. List what the feature needs, what it provides, a host wiring example, and what it must not import. Link to this record.

Local evidence. [Core route spec](../../packages/core/src/contracts/server/json-route.ts), [Admin kit](../../packages/admin/src/react/kit.tsx), [Cross-package check](../../scripts/check-no-cross-package.ts), [Hardwiring check](../../scripts/check-hardwiring.ts).

## How to wire a feature

**Jini package.** This sketch shows a local route port and a screen that consumes a narrow hook result. `Notice` is supplied through the admin kit.

```tsx
type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>;
};

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
});

type MenuScreenProps = {
  id: string;
  heading: string;
  useMenu: (required: { id: string }) => { title: string };
};

export function MenuScreen({ id, heading, useMenu }: MenuScreenProps) {
  const { title } = useMenu({ id });
  return <Notice>{heading} {title}</Notice>;
}
```

**Tovu host.** In this target wiring sketch, Tovu binds the route to its server and request policy. It mounts the screen with its selected kit, hook, and copy.

```tsx
mountJsonRoute({
  app,
  spec: { ...menuRoute, ports: adminRoutePorts },
  deps: { readMenu: readAllowedWorkspaceMenu },
});

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

## Alternatives rejected

- **A central dependency module or Tovu Core for everything.** A shared implementation hub couples every consumer to the same graph. Core supplies shared vocabulary and approved neutral primitives.
- **Import implementations and expose overrides with defaults.** The import still fixes a production dependency and hides a choice the host should make.
