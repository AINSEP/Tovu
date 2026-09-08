import type { AssistantToolRegistryDeps } from "./tool-registrations.js";

/**
 * @file The boot-installed registry a resource-owning feature (`post`, `pages`, and — later —
 * `media`, `forms`, `redirects`, `widgets`, `collections/entries`, `taxonomy`, `menus`, per the
 * coverage audit's own "no single-row duplicate exists anywhere" finding) contributes ITS OWN
 * "how do I copy myself" implementation into, so `content_duplicate` (`features/content-duplication/`)
 * can stay one generic tool over a growing set of resources instead of one bespoke `*_duplicate` tool
 * per resource — the owner's explicit correction to the original per-domain design
 * (`ADS-memory/reports/2026-09-07-page-duplicate-tool.md`'s own follow-up).
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
 * is typed against {@link AssistantToolRegistryDeps}, assembled in `assistant/tool-registrations.ts`
 * from every domain's own `*ToolDeps` via TYPE-ONLY imports (erased at compile time — no runtime
 * module edge). A resource feature (e.g. `features/post`) reaches INTO this registry with a
 * `import type` for {@link DuplicateResourceHandlerContributor} (zero runtime edge — see
 * `features/post/tool-registrations.ts`'s own `contributePostDuplicateHandlers`) and returns plain
 * data; it never imports `registerDuplicateResourceHandler` itself. **That split is load-bearing, not
 * style**: `features/post/tool-registrations.ts`'s own trailing history records that a real
 * `features/post -> assistant` VALUE edge previously closed a `[assistant, features/post]` module
 * cycle and had to be removed by injecting the dependency instead — the exact edge a naive
 * "each resource calls the register function itself" design would reopen. The actual
 * `registerDuplicateResourceHandler(...)` calls therefore live at the composition root
 * (`server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors`),
 * gluing each resource's own data-returning contributor function to this registry — the identical
 * shape that file already uses for `registerToolContributor(contribute<Domain>Tools())`.
 *
 * NOT "register on import" side-effect magic, for the identical reason `tool-contribution-registry.ts`
 * gives: every registration is an explicit call made by a composition root.
 */

/**
 * One resource's contract for participating in `content_duplicate`.
 *
 * `permission` is the SINGLE permission `content_duplicate`'s own handler checks before invoking
 * `duplicate` — resolved from the resource's OWN existing declared permission (e.g. `content.write`
 * for `post`/`page`, the same permission `content_post_create`/`content_post_update` already
 * declare), never a single flat permission shared by the whole generic tool. This is what makes
 * "a caller permitted for posts but not media cannot copy media through it" true by construction: a
 * caller lacking THIS resource's permission is refused before `duplicate` is ever called, regardless
 * of what any other resource's permission is.
 *
 * `duplicate` still owns whatever FINER-grained authorization/guard logic the resource's real
 * write-service already applies (e.g. `post`'s own upfront `content.read` check before it will even
 * disclose the source row exists) — this registry's `permission` is the generic tool's own outer
 * gate, not a replacement for a resource's existing internal ones.
 */
export interface DuplicateResourceHandler {
  readonly permission: string;
  readonly duplicate: (input: {
    readonly principalId: string;
    readonly id: string;
    readonly overrides: { readonly title?: string; readonly slug?: string; readonly status?: string };
  }) => Promise<Record<string, unknown>>;
}

/**
 * One resource's registry entry: which resource id it answers to, and how to build its real,
 * deps-bound {@link DuplicateResourceHandler} once the composition root's real deps bag exists.
 *
 * `build` is deferred (not a bound handler) for the identical reason `ToolContributor.build` is:
 * `installFirstPartyToolContributors()` (where registration happens) runs once at boot, before any
 * real `routeDeps`/`AssistantToolRegistryDeps` exists; `content_duplicate`'s own `build(routeDeps,
 * surfaces)` (run per real composition, later) is what actually resolves every registered
 * contributor into a real handler.
 */
export interface DuplicateResourceHandlerContributor {
  readonly resource: string;
  readonly build: (routeDeps: AssistantToolRegistryDeps) => DuplicateResourceHandler;
}

let contributors: DuplicateResourceHandlerContributor[] = [];

/**
 * Registers one resource's duplicate contribution, called once by a composition root during the
 * ordinary boot sequence (mirrors `registerToolContributor`'s own doc).
 *
 * Re-registering the same `resource` REPLACES the earlier entry rather than appending — identical
 * reasoning to `registerToolContributor`: idempotent per catalog instance, safe for a test process
 * that legitimately re-registers. Registration order is otherwise preserved.
 */
export function registerDuplicateResourceHandler(contributor: DuplicateResourceHandlerContributor): void {
  const existing = contributors.findIndex((candidate) => candidate.resource === contributor.resource);
  if (existing >= 0) {
    contributors[existing] = contributor;
    return;
  }
  contributors.push(contributor);
}

/** Every resource contributor registered so far, in registration order. */
export function listDuplicateResourceHandlers(): readonly DuplicateResourceHandlerContributor[] {
  return contributors;
}

/** Test-only reset of the module-level registry (mirrors `resetToolContributorsForTests`). */
export function resetDuplicateResourceHandlersForTests(): void {
  contributors = [];
}
