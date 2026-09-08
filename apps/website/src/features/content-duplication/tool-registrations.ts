/**
 * @file Maps `agent-tools.ts`'s single `content_duplicate` catalog entry onto every resource
 * currently registered in `assistant/duplicate-resource-registry.ts`, as a `ToolRegistration`.
 *
 * Authorization shape — the part the owner's redesign specifically called out to get right: THIS
 * tool spans multiple resources (`post`/`page` today), and each one carries its OWN existing
 * declared permission (`content.write` for post/page, the same permission `content_post_create`/
 * `content_post_update` already declare). There is no single flat permission for `content_duplicate`
 * itself — `assertToolIsWirable` never evaluates `authorization.permission` as a real gate for any
 * tool in this codebase (it is documentation only; see `pages_write_html`'s own catalog-entry
 * comment for the identical "declaration only" contract), so declaring one static string there would
 * be actively misleading for a cross-resource tool. The REAL gate is this handler's own
 * `requireToolPermission` call below, using the resource's OWN `permission` field
 * (`DuplicateResourceHandler.permission`) — resolved and enforced per call, per resource. A caller
 * permitted for `post` but not some other resource is refused before that OTHER resource's own
 * `duplicate()` is ever invoked, regardless of what `post`'s permission is.
 *
 * An unrecognized `resource` fails loudly and enumerates what IS supported — see the handler's own
 * `ToolInputError` — never a generic "not found" or a silent no-op.
 *
 * **Why the per-resource handler list is INJECTED rather than read from
 * `assistant/duplicate-resource-registry.ts` directly:** `.dependency-cruiser.mjs`'s
 * `domain-no-direct-assistant-tool-registration` rule bans ANY non-type-only import from
 * `features/**` into `assistant/**` — not merely a `registerToolContributor` call. Calling
 * `listDuplicateResourceHandlers()` from this file is exactly such a VALUE edge, and it was a real
 * `check:boundaries` error (20 errors, baseline 19) until this seam replaced it. The composition
 * root (`server/runtime/composition/tool-catalog-manifest.ts`) — which is already allowed to import
 * assistant values — passes the registry's own reader in as {@link ContentDuplicationResourceSource}.
 * Everything this module needs from `assistant/` is now a TYPE, erased at compile time.
 *
 * The reader is a FUNCTION, not a pre-read array, deliberately: the manifest registers this
 * `ToolContributor` before it registers the per-resource handlers, so an array snapshotted at
 * `contributeContentDuplicationTools()` time would always be empty. Reading through the function at
 * `build(...)` time — once per real composition, after boot registration has finished — is what makes
 * the registry's contents visible here at all.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

import type {
  DuplicateResourceHandler,
  DuplicateResourceHandlerContributor,
  ToolContributor,
} from "#src/assistant/index";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";

import { contentDuplicationAgentToolCatalog, type AgentToolDefinition as ContentDuplicationAgentToolDefinition } from "./agent-tools.js";

const CATALOG_BY_ID = indexCatalogById(contentDuplicationAgentToolCatalog);

const contentDuplicationDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> whichever resource's own DuplicateResourceHandler.duplicate() the resource named — for
  // post/page that is executeCommand -> createPost (see features/post/tool-registrations.ts's own
  // duplicatePostOrPage). Classified at the WORST case across every currently-registered resource
  // (a create), since a future resource could not plausibly register a duplicate handler that is
  // read-only — "creating a copy" is definitionally a durable-state mutation.
  ["content_duplicate", "mutates-durable-state"],
]);

/** Reads and loosely validates `input.overrides` — an absent/omitted `overrides` is simply "no
 *  overrides" (`{}`); a present-but-non-object value is a caller shape error, not silently ignored. */
function readOverrides(input: Record<string, unknown>): { title?: string; slug?: string; status?: string } {
  const raw = input.overrides;
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new ToolInputError("'overrides' must be an object");

  const title = typeof raw.title === "string" ? raw.title : undefined;
  const slug = typeof raw.slug === "string" ? raw.slug : undefined;
  const status = typeof raw.status === "string" ? raw.status : undefined;
  return { title, slug, status };
}

/**
 * The rejection for a `resource` no registered handler answers to.
 *
 * ENUMERATES the live supported set rather than failing generically, because `resource` cannot be a
 * static JSON-Schema enum (see `agent-tools.ts`'s own header — the set is populated at boot, after
 * the schema is authored), so this message is the ONLY place a caller can learn what it may pass. A
 * bare "unknown resource" would leave a model guessing across the whole content model, one wasted
 * turn per guess. The closing sentence is deliberate too: without it a model reads "not supported"
 * as "not supported *yet, try a synonym*" and retries `pages`/`Post`/`blog_post` in turn.
 *
 * Sorted, so the message is stable across registration order and a test can assert it verbatim.
 *
 * @complexity O(r log r) in the number of registered resources — only on the rejection path.
 */
function unsupportedResourceError(resource: string, supportedResources: Iterable<string>): ToolInputError {
  const supported = [...supportedResources].sort();
  return new ToolInputError(
    `content_duplicate: cannot duplicate resource '${resource}'. Supported resources: ` +
      `${supported.length > 0 ? supported.join(", ") : "(none registered)"}. ` +
      "No other resource can be duplicated by this tool — retrying with a different spelling will not help.",
  );
}

/**
 * Where this tool's per-resource handler contributions come from — see this file's own header for
 * why they are injected rather than read from `assistant/duplicate-resource-registry.ts` here.
 *
 * In production this is that registry's own `listDuplicateResourceHandlers`, supplied by the
 * composition root. A test supplies a resource's `contribute*DuplicateHandlers()` directly, which
 * also keeps it off the module-level registry other tests share.
 */
export interface ContentDuplicationResourceSource {
  readonly listResourceHandlers: () => readonly DuplicateResourceHandlerContributor[];
}

/**
 * Builds `content_duplicate`'s single registration, resolving every contributed
 * `DuplicateResourceHandlerContributor` (`assistant/duplicate-resource-registry.ts`) into a real,
 * deps-bound `DuplicateResourceHandler` ONCE here (the contributor set is fixed for the lifetime of
 * one `routeDeps`/build) rather than re-resolving on every call.
 *
 * @complexity O(r) in the number of registered resources, once per build; O(1) per tool call.
 */
export function buildContentDuplicationRegistrations(
  routeDeps: AssistantToolRegistryDeps,
  resources: ContentDuplicationResourceSource,
): ToolRegistration[] {
  const handlersByResource = new Map<string, DuplicateResourceHandler>(
    resources.listResourceHandlers().map((contributor) => [contributor.resource, contributor.build(routeDeps)]),
  );

  const handlers: Record<string, ToolHandler> = {
    content_duplicate: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const resource = requireString(input, "resource");
      const id = requireString(input, "id");
      const overrides = readOverrides(input);

      const handler = handlersByResource.get(resource);
      if (!handler) throw unsupportedResourceError(resource, handlersByResource.keys());

      // The resource's OWN declared permission — see this file's own header for why this is
      // deliberately per-resource rather than one flat check for the whole tool.
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: handler.permission,
        entityType: resource,
        entityId: id,
      });

      return handler.duplicate({ principalId: ctx.principal.id, id, overrides });
    },
  };

  // No `unwiredToolIds`: this domain has exactly one catalog entry and wires it unconditionally —
  // same tripwire discipline as Post/Forms/Entries/Widgets.
  return buildDomainRegistrations({
    domain: "content-duplication",
    catalogModule: "features/content-duplication/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, ContentDuplicationAgentToolDefinition>,
    handlers,
    derivedRisk: contentDuplicationDerivedRisk,
  });
}

/**
 * Contributes `content_duplicate` to the assistant's catalog — the ordinary `ToolContributor` shape
 * every other domain uses, installed by `server/runtime/composition/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors()`. Distinct from (and unrelated to the wiring mechanics of)
 * `assistant/duplicate-resource-registry.ts`'s OWN registration, which is what makes THIS tool have
 * anything to resolve `resource` against in the first place — the manifest calls both.
 */
export function contributeContentDuplicationTools(resources: ContentDuplicationResourceSource): ToolContributor {
  return {
    domain: "content-duplication",
    build: (routeDeps) => buildContentDuplicationRegistrations(routeDeps, resources),
    risk: contentDuplicationDerivedRisk,
  };
}
