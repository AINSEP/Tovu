/**
 * @file Dependency contracts for the Tovu `routing` Tier-2 library (ADR-039 v0).
 *
 * ADR-006 accounting (rule-of-two):
 * - `routing` introduces NO new persistence port. Resolving an `entryRef`
 *   target reuses the existing `PostRepoPort` (`src/features/post/post.ts`) —
 *   `post` is the only content type implemented in this repo today. Inventing
 *   a routing-owned repo for data that already has one would fail rule-of-two.
 * - The named-route registry and the resolve-phase/`SlugChangeCapture`
 *   registration slots are core-owned registration mechanisms (ADR-039 §1/§4),
 *   NOT open ADR-009 plugin hooks and NOT ports — they are ordinary in-module
 *   state with a typed register/get surface, same treatment ADR-029/ADR-032
 *   give their single-evaluator resolvers.
 *
 * Architectural role:
 * INTERFACES ONLY — no feature logic lives here.
 */
import type { PostRepoPort } from "../features/post/index.js";

/**
 * Dependencies `urlFor`/`isActive` need to resolve `entryRef` targets. Kept as
 * its own named shape (rather than inlining `PostRepoPort` at each call site)
 * so a future second content type's repo can be added here without changing
 * every call site's required-object shape.
 */
export interface RouteResolverDeps {
  readonly postRepo: PostRepoPort;
}
