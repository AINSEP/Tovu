^D## D1 Merge or separate — REVISING

**Position: Merge into a single execution and governance engine parameterized by the 5-axis metadata model.**

ADR-057’s argument—that site-glue is "permanently Tier-3, never distributed, and therefore orthogonal to the ADR-024 ladder"—does **not** survive Correction 1. Site-glue is not a parallel live subsystem; it is an unwired design with zero production callers and zero non-test host implementations. Maintaining two manifest validators (`validateManifest` vs `validateGlueManifest`), two duplicate capability sets, and two quarantine loops for "local" vs "distributed" code is building two engines when we only have half of one working.

The legitimate core of ADR-057 is that *authorship* (agent vs vendor) and *distribution* (local-only vs marketplace) are orthogonal to execution semantics. But that is an argument for **metadata axes on a single extension record**, not for two separate runtimes:
1. **Distribution channel** (`local` | `upload` | `marketplace`) & **Authorship** (`agent` | `operator` | `vendor`) are recorded by the installer/host, never self-declared in the manifest.
2. **Execution Tier** (`tier-1` declarative, `tier-2` sandboxed worker/Wasm, `tier-3` in-process Node) governs runtime sandbox rules.
3. **Capabilities** (`content.read`, `events.subscribe`, etc.) govern granted authority.
4. **Extension Kinds** (`admin.nav`, `render.widget`, `http.route`) govern attachment points.

When an AI agent writes local site-glue, the host registers it with `distribution: "local"`, `authorship: "agent"`, and `tier: "tier-3"`. It uses the exact same loader, capability-gate, timeout wrappers, and quarantine loop as any other extension.

---

## D2 Contribution return shape — REVISING

**Position: Strictly host-owned `WidgetRenderIR` (`{ componentId: string, props: JsonObject, children?: readonly WidgetRenderIR[] }`), reusing the existing seam in [`src/widgets/registry.ts`](file:///Users/la/Programming/Tovu/src/widgets/registry.ts) and [`src/widgets/resolvers/index.ts`](file:///Users/la/Programming/Tovu/src/widgets/resolvers/index.ts).**

Raw HTML is conceded and dead. Allowing arbitrary HTML strings or raw element ASTs breaks SSR streaming contracts, invalidates theme styling/design tokens, and violates Tovu's core invariant that **themes own rendering and receive structured data** (ADR-020 / ADR-029).

The existing widget seam is not only sufficient; it already solves the expressiveness problem:
- **Tier-1 contributions (Declarative):** Pure data registrations in [`registry.ts`](file:///Users/la/Programming/Tovu/src/widgets/registry.ts) mapping validated JSON config to existing theme/core `componentId`s.
- **Tier-2/3 contributions (Dynamic Resolvers):** Handlers that fetch/transform data and return a `WidgetRenderIR` tree.

**The Deciding Failure Case:**
If a plugin needs to output a nested tree (e.g., a multi-tier pricing table or an accordion menu with sub-items), a flat `{ componentId, props }` tuple fails unless the host already created a monolithic component for that exact structure. Conversely, an unrestricted HTML tree allows unescaped layout thrashing and theme breakage. `WidgetRenderIR` hits the exact sweet spot: it supports recursive `children?: readonly WidgetRenderIR[]` while keeping every node constrained to a registered, theme-renderable `componentId` with clamped `maxItems` and timeouts enforced by [`clampResolveResult`](file:///Users/la/Programming/Tovu/src/widgets/resolvers/index.ts#L116-L121).

---

## D3 Kinds vs capabilities — CONCEDING

**Position: Concede to the closed Directus-style `kinds` catalog for attachment points, reserving `capabilities` strictly for security authority.**

The debate between kinds and capability strings was largely a vocabulary collision caused by `site-glue` conflating *where code attaches* with *what permissions it requires* (e.g., declaring both a call-site `"admin.nav"` and a capability `"admin.nav.register"`).

The substantive distinction that eliminates this redundancy:
- **`kinds` (Attachment / Contribution points):** Structural, closed catalog defining *where* an extension hooks and *what shape* its registration data must have (e.g., `kind: "admin.nav"`, `kind: "render.widget"`, `kind: "http.route"`, `kind: "hook.beforeSave"`). Validated against schema at parse time.
- **`capabilities` (Security / Authority grants):** Explicit permissions required by the extension’s runtime behavior to access ambient host resources (e.g., `content.read`, `content.write`, `network.fetch`, `events.subscribe`).

Declaring an attachment of `kind: "admin.nav"` automatically confers the right to register that nav item; it does not require a redundant `"admin.nav.register"` capability string. Capabilities are only requested when an extension needs authority beyond its tier's default baseline.

---

## What I got wrong in round 1

1. **Assumed `site-glue` was a running, partially wired subsystem:** I treated the 3 attachment adapters as active production call sites when they were actually disconnected interface implementations with zero callers and no loader.
2. **Missed `ADR-057-site-glue-tier.md`:** Failed to account for the drafted reasoning separating local agent-authored glue from distributed marketplace packages.
3. **Overlooked the existing `render.contribute` widget seam:** Did not recognize that [`src/widgets/registry.ts`](file:///Users/la/Programming/Tovu/src/widgets/registry.ts) and [`src/widgets/resolvers/index.ts`](file:///Users/la/Programming/Tovu/src/widgets/resolvers/index.ts) already had a TDD-certified `WidgetRenderIR` and `CORE_RESOLVERS` architecture.
4. **Assumed scheduled jobs were greenfield:** Missed the existing `tenancy-and-jobs.spec.md` contract and `JobTrackingResponse` envelope.

---

## The one thing I would still refuse to concede, and why

**I refuse to concede having two separate runtimes or isolation lifecycles for local site-glue vs. distributed plugins.**

Regardless of whether code was generated on the fly by an LLM agent for a single site or downloaded from a marketplace, **untrusted code running in a server process presents the exact same failure modes**: event-loop blocking, memory leaks, unhandled Promise rejections, schema violations, and cascading crashes. 

Bifurcating the codebase into `features/site-glue` and `features/plugin-runtime` creates dual maintenance debt, duplicate bug surfaces, and security loopholes. There must be **one** loader, **one** timeout-bounded dispatcher, **one** auto-quarantine watchdog, and **one** introspection surface across all extensions.
