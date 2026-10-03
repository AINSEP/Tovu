import type { DerivedRiskByToolId, ToolRegistration } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "../contracts/core/tool-surface-exchanges.js";
import type { AssistantToolRegistryDeps } from "./tool-registrations.js";

/**
 * @file The boot-installed registry a first-party (or, eventually, policy-checked third-party)
 * feature contributes its AI tools into, instead of `assistant/tool-registrations.ts` importing
 * that feature's `build*Registrations`/`*DerivedRisk` by name.
 *
 * Modeled directly on `mcp-federation/presets.ts` — same composition-owned ordered registry, historically a
 * `register*`/`list*`/`reset*ForTests` trio, now explicit core registry methods, same "last registration wins, replacing by key rather
 * than appending" semantics for accidental double-registration. That file's own doc explains why
 * this shape (not a class, not a DI container): it is the shape this codebase already uses for
 * "a plugin announces itself to a core-owned seam" (see also `page-head.ts`'s
 * `registerPageHeadContributor` and `routing.ts`'s `registerResolvePhase`). Per ADR-006/ADR-009 §3,
 * hooks and registries are exempt from the rule-of-two.
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
 * force `assistant` to import it back at runtime to type `buildAssistantToolRegistrations`'s own
 * parameter, reopening the `assistant <-> server` edge Candidate 1 of the 2026-08-17 back-edges plan
 * deliberately closed. Keeping the host contracts (and the wide deps type) inside
 * `assistant/` while feature modules reach INTO it one-directionally (`comments -> assistant`,
 * never the reverse) is what actually breaks the `assistant <-> {comments,newsletter}` cycle: this
 * module never imports a feature by name, so nothing here closes a cycle no matter how many
 * features register into it.
 *
 * Architectural role: host contract for composition-owned registries. The implementation and generic rationale live in @jini-ai/core contribution-registry; no runtime aliases remain here. No I/O; assembly is delegated to whatever a contributor
 * registered, and duplicate-tool-id / risk-classification invariants stay owned by
 * `tool-registrations.ts`'s `buildAssistantToolRegistrations`/`assertRiskMetadataIsWirable`, same as
 * before — only the "reach into every feature by name" import shape moved, not the quality gates.
 */

/** One feature's AI-tool contribution: its builder and the risk classification its own wiring file
 * maintains — structurally identical to `tool-registrations.ts`'s (legacy, still-in-use for
 * not-yet-converted domains) `DomainSlice`, so a domain's `build`/`risk` pair means the same thing
 * whichever seam registered it.
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
 * folds this together with the not-yet-converted `DOMAIN_SLICES` list.
 *
 * Historical test-only reset of the composition-owned registry (mirrors `resetFederatedMcpPresetsForTests`). A
 * test now clears its own registry instance before registering just the
 * contributors it wants present — otherwise contributors registered by an earlier test in the same
 * process persist, since this is ordinary composition-owned state.
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
 * Historical test-only reset of the derived-tool registry. Separate from clearing normal contributions
 * so a test that clears the domain contributors keeps whatever derived pass the composition root
 * already installed.
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
