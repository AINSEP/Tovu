import type { DerivedRiskByToolId, ToolRegistration } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { AssistantToolRegistryDeps } from "./tool-registrations.js";

/**
 * @file The boot-installed registry a first-party (or, eventually, policy-checked third-party)
 * feature contributes its AI tools into, instead of `assistant/tool-registrations.ts` importing
 * that feature's `build*Registrations`/`*DerivedRisk` by name.
 *
 * Generic registry semantics are owned by `@jini-ai/core/contribution-registry`.
 *
 * NOT "register on import" side-effect magic: nothing in this file, or in any feature's own
 * `contribute<Domain>Tools()` function, runs merely because that feature's module was imported.
 * Every registration is an explicit call, made by a composition root (today:
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors`, and the two real boot
 * paths that call it — `server/inbound/assistant/agent-daemon-server.ts` and
 * `server/runtime/composition/modules/assistant-byok.ts`) — the same posture `mcp-federation/presets.ts`'s registrars
 * established for MCP federation.
 *
 * Why `assistant/` owns this file rather than `server/`: `AssistantToolRegistryDeps` (the deps bag
 * every contributor's `build` reads) is assembled here from every domain's own `*ToolDeps`
 * interface via TYPE-ONLY imports in `tool-registrations.ts` — erased at compile time, so they
 * never register as runtime module edges (`check:architecture`'s "module cycles"/"largest SCC"
 * metrics are computed on the runtime-only graph). Moving that type assembly into `server/` would
 * force `assistant` to depend back on the server composition root. Keeping host contracts
 * inside `assistant/` allows one-way feature contributions without importing features by value.
 *
 * Duplicate-tool-id and risk-classification checks remain owned by
 * `tool-registrations.ts`'s assembly, rather than the contribution registry.
 */

/** One feature's AI-tool contribution: its builder and the risk classification its own wiring file
 * maintains. The static assistant-owned `DomainSlice` uses the same contract.
 *
 *
 * Core register({ contribution }) registers one feature's tool contribution, called once by a composition root during the ordinary
 * boot sequence (see this file's own header for the two real callers).
 *
 * Re-registering the same `domain` REPLACES the earlier entry rather than appending — mirrors
 * `registerFederatedMcpPreset`'s identical reasoning: a double import of the same feature module
 * should not silently double that domain's tools in the final catalog, and replacing-in-place
 * (rather than throwing) keeps this call idempotent per catalog instance, which both real callers
 * and every contract test that calls it more than once rely on. Registration order is otherwise
 * preserved so a replacement does not silently reorder the catalog.
 *
 * Core list({}) returns every contributor registered so far, in registration order — `buildAssistantToolRegistrations`
 * folds this together with the assistant-owned `DOMAIN_SLICES` list.
 *
 * Each test owns or clears its registry instance before selecting contributors; composition
 * state otherwise persists for the lifetime of that instance.
 */
export interface ToolContributor {
  readonly domain: string;
  readonly build: (routeDeps: AssistantToolRegistryDeps, surfaces: AssistantSurfaceDeps) => ToolRegistration[];
  readonly risk: DerivedRiskByToolId;
}

/** A post-processing contribution: tools DERIVED from the registrations every {@link ToolContributor}
 * already built (today: `trash_item`, which reuses the per-domain delete tools' handlers — see
 * `features/trash/trash-item-tool.ts`). Registered by the composition root
 * (`installFirstPartyToolContributors`) for the same reason as {@link ToolContributor}: so
 * `tool-registrations.ts` never imports the feature by value (that edge closed the `assistant ->
 * trash -> comments -> plugins -> assistant` module cycle). `risk` is merged and cross-checked like
 * any other domain's.
 *
 * Core register({ contribution }) registers one derived-tool contribution — same replace-by-`domain` semantics as
 * the normal registry.
 *
 * Core list({}) returns every derived-tool contributor registered so far, in registration order.
 *
 * Clearing derived contributions is separate from clearing normal contributions, so tests
 * can retain the composition's derived passes when selecting domain contributors.
 */
export interface DerivedToolContributor {
  readonly domain: string;
  readonly derive: (input: {
    readonly registrations: readonly ToolRegistration[];
    readonly routeDeps: AssistantToolRegistryDeps;
    readonly surfaces: AssistantSurfaceDeps;
  }) => ToolRegistration[];
  readonly risk: DerivedRiskByToolId;
}

/** The two ordered registries belong to one composition root, never shared across workspaces. */
export interface AssistantToolContributions {
  readonly contributors: import("@jini-ai/core").ContributionRegistry<ToolContributor>;
  readonly derivedContributors: import("@jini-ai/core").ContributionRegistry<DerivedToolContributor>;
}
