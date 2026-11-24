import {
  createPublishContentTypeRegistry,
  type PublishContentContributor as EnginePublishContentContributor,
  type PublishContentDeps as EnginePublishContentDeps,
} from "@jini-ai/cms/publish/content/type-registry";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";

/**
 * @file Host binding of the publishable-type registry (`@jini-ai/cms/publish/content/type-registry`).
 *
 * The engine registry is generic over the host's port bag with no default; this module binds it to
 * Tovu's bag (`tovu-publish-ports.ts`) and owns the ONE process-wide registry instance every
 * composition root registers into and every publish operation builds its catalog from. The
 * registry's rules (register at a composition root only, never on import; read fresh at publish
 * time; replace by key) are documented on the engine module and still hold here:
 * `__tests__/type-registry.test.ts` pins them against this bound instance, and
 * `__tests__/post-no-direct-registry-import.boundary.test.ts` keeps `features/post` from
 * value-importing this module.
 *
 * Handler/reference/retire contracts that do not mention the port bag are imported straight from
 * the engine module by their users; only the bag-bound types and the instance live here.
 */

/** Tovu's publish-content deps bag: the engine bag instantiated with {@link TovuPublishPorts}. */
export type PublishContentDeps = EnginePublishContentDeps<TovuPublishPorts>;
/** A Tovu content-type contribution, built from {@link PublishContentDeps}. */
export type PublishContentContributor = EnginePublishContentContributor<TovuPublishPorts>;
// `features/theme/**` imports these three bag-independent types from this path; every other user
// imports them from their engine owners directly.
export type { PackedEntity } from "@jini-ai/cms/publish/transfer";
export type { PublishContentHandler, SkippedPackEntity } from "@jini-ai/cms/publish/content/type-registry";

const registry = createPublishContentTypeRegistry<TovuPublishPorts>();

/** Registers one content type's contribution — composition roots only (engine header, rule 1). */
export const registerPublishContentContributor = registry.register;
/** Every contribution registered so far, read fresh on every call. */
export const listPublishContentContributors = registry.list;
/** Test-only reset of the process-wide instance. */
export const resetPublishContentContributorsForTests = registry.reset;
/** Builds the per-operation handler catalog from the current registrations. */
export const buildPublishContentCatalog = registry.buildCatalog;
/** Publish type -> permissions a publishing grant answers for, read fresh. */
export const registeredPublishTypePermissions = registry.permissionsByType;
