/**
 * @file Resource-owned duplication handlers for content_duplicate. A generic tool dispatches
 * to each resource's own copy implementation instead of requiring a bespoke duplicate tool per resource.
 *
 * Modeled directly on `tool-contribution-registry.ts` — same module-level ordered list, same
 * `register*`/`list*`/`reset*ForTests` trio, same "last registration wins, replacing by key rather
 * than appending" semantics for accidental double-registration, same reasoning (ADR-006/ADR-009 §3:
 * hooks and registries are exempt from the rule-of-two) for why this is a plain module rather than a
 * class or DI container. Deliberately a SEPARATE registry rather than a second field bolted onto
 * `ToolContributor`: a resource's "how do I copy myself" contribution and its "what tools do I
 * expose" contribution are different concerns with different consumers (`content_duplicate` alone
 * reads this one; `buildAssistantToolRegistrations` reads `ToolContributor`s) — conflating them would
 * make a resource that wants only one of the two carry a meaningless field for the other.
 *
 * Why `assistant/` owns this file rather than a `features/` package, mirroring
 * `tool-contribution-registry.ts`'s own identical reasoning: {@link DuplicateResourceHandlerContributor}
 * is generic in its consumed deps, bound to `AssistantToolRegistryDeps` in `assistant/tool-registrations.ts`
 * from every domain's own `*ToolDeps` via TYPE-ONLY imports (erased at compile time — no runtime
 * module edge). A resource feature (e.g. `features/post`) reaches INTO this registry with a
 * `import type` for {@link DuplicateResourceHandlerContributor} (zero runtime edge — see
 * `features/post/tool-registrations.ts`'s own `contributePostDuplicateHandlers`) and returns plain
 * data; it never imports `registerDuplicateResourceHandler` itself. **That split is load-bearing, not
 * style**: feature-to-assistant value imports would close a module cycle. Resource features
 * contribute plain data through type-only contracts; only the composition root registers it.
 * The actual
 * `registerDuplicateResourceHandler(...)` calls therefore live at the composition root
 * (`server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors`),
 * gluing each resource's own data-returning contributor function to this registry — the identical
 * shape that file already uses for `registerToolContributor(contribute<Domain>Tools())`.
 *
 * NOT "register on import" side-effect magic, for the identical reason `tool-contribution-registry.ts`
 * gives: every registration is an explicit call made by a composition root.
 */

import type { AssistantToolRegistryDeps } from "./tool-registrations.js";

import type { DuplicateResourceHandlerContributor } from "./tool-contributions.js";
export type { DuplicateResourceHandler, DuplicateResourceHandlerContributor } from "./tool-contributions.js";

// The host binds registration, storage and listing to the same deps; no dependency erasure.
let contributors: DuplicateResourceHandlerContributor<AssistantToolRegistryDeps>[] = [];

/**
 * Registers one resource's duplicate contribution, called once by a composition root during the
 * ordinary boot sequence (mirrors `registerToolContributor`'s own doc).
 *
 * Re-registering the same `resource` REPLACES the earlier entry rather than appending — identical
 * reasoning to `registerToolContributor`: idempotent per catalog instance, safe for a test process
 * that legitimately re-registers. Registration order is otherwise preserved.
 */
export function registerDuplicateResourceHandler(contributor: DuplicateResourceHandlerContributor<AssistantToolRegistryDeps>, _optional = {}): void {
  const existing = contributors.findIndex((candidate) => candidate.resource === contributor.resource);
  if (existing >= 0) {
    contributors[existing] = contributor;
    return;
  }
  contributors.push(contributor);
}

/** Every resource contributor registered so far, in registration order. */
export function listDuplicateResourceHandlers(_required = {}, _optional = {}): readonly DuplicateResourceHandlerContributor<AssistantToolRegistryDeps>[] {
  return contributors;
}

/** Test-only reset of the module-level registry (mirrors `resetToolContributorsForTests`). */
export function resetDuplicateResourceHandlersForTests(): void {
  contributors = [];
}
