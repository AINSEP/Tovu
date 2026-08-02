# Plugins, Providers, And Links

## 1. Summary of the Subsystem

Medusa expresses extensibility at several layers:

- provider packages for infrastructure-sensitive domains
- plugin packages for feature additions
- link modules for explicit cross-domain relationships
- module SDK and remote-query tooling for cross-module interaction

This is broader than a classic plugin system. It is a layered extensibility model.

## 2. Key Primitives / Contracts

### Providers

Provider packages live under `packages/modules/providers/*`.

Visible examples:

- payment: Stripe
- file: S3, local
- notification: SendGrid, local
- auth: email/password, GitHub, Google
- locking: Redis, Postgres
- analytics: local, PostHog
- caching: Redis
- fulfillment: manual

This shows Medusa expects infrastructure-facing domains to be adapter-swappable.

### Plugins

The example plugins in the repo prove the extension surface is real:

- `draft-order`
- `loyalty`

The plugin packages visibly contribute combinations of:

- `admin/`
- `api/`
- `jobs/`
- `links/`
- `modules/`
- `subscribers/`
- `workflows/`
- `types/`

### Links and remote query

The modules SDK and link packages expose:

- module bootstrap
- link resolution
- remote query
- migration planning for links

The `Link` abstraction tracks module relationships and cascade behavior across modules. That makes link handling an explicit platform capability.

## 3. Boundaries and Constraints

- Provider adapters are split from domain modules.
- Plugins attach through well-known directory names and loader contracts.
- Cross-domain joins are mediated through link definitions and module joiner metadata.
- External or internal module declarations are resolved at bootstrap rather than hidden in application code.

This is a strong dependency-inversion posture:

- domain logic does not need to know one concrete provider forever
- extension packages can ship meaningful platform behavior without patching the host internals

## 4. Operational Implications

- Swapping providers is structurally supported, not just conceptually allowed.
- Plugin capability is broad, so safety depends on loader discipline, policy controls, and version compatibility.
- Link migration and remote query complexity are the cost of keeping module ownership explicit.
- Plugin route precedence can be powerful, but it also increases the need for compatibility and governance.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu needs replaceable adapters and safe extension seams, especially for the user-friction areas in reliability, trust, delivery workflow, and commerce.

### What Tovu should preserve

- providers outside core domain packages
- plugin contribution through explicit, typed entrypoints
- explicit cross-module link infrastructure
- module bootstrap contracts that support internal and external implementations

### What Tovu can simplify

- fewer plugin attachment points at first
- stricter plugin privilege levels than Medusa's broad model if Tovu wants stronger safety
- a simpler cross-module query layer until Tovu actually needs Medusa-level composition power

### Possible Tovu seams

- `ProviderRegistryPort`
- `PluginContributionManifest`
- `CrossModuleJoinRegistry`
- `RemoteQueryPort`
- `ExtensionCapabilityPolicy`

### Suggested priority

- `V1`: providers and explicit plugin manifests
- `V2`: richer link/query infrastructure once Tovu has enough bounded modules to justify it
