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

import {
  listDuplicateResourceHandlers,
  type DuplicateResourceHandler,
  type ToolContributor,
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
 * Builds `content_duplicate`'s single registration, resolving every currently-registered
 * `DuplicateResourceHandlerContributor` (`assistant/duplicate-resource-registry.ts`) into a real,
 * deps-bound `DuplicateResourceHandler` ONCE here (registry contents are fixed for the lifetime of
 * one `routeDeps`/build) rather than re-resolving on every call.
 */
export function buildContentDuplicationRegistrations(routeDeps: AssistantToolRegistryDeps): ToolRegistration[] {
  const handlersByResource = new Map<string, DuplicateResourceHandler>(
    listDuplicateResourceHandlers().map((contributor) => [contributor.resource, contributor.build(routeDeps)]),
  );

  const handlers: Record<string, ToolHandler> = {
    content_duplicate: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const resource = requireString(input, "resource");
      const id = requireString(input, "id");
      const overrides = readOverrides(input);

      const handler = handlersByResource.get(resource);
      if (!handler) {
        const supported = [...handlersByResource.keys()].sort();
        throw new ToolInputError(
          `cannot duplicate '${resource}'; supported: ${supported.length > 0 ? supported.join(", ") : "(none registered)"}`,
        );
      }

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
export function contributeContentDuplicationTools(): ToolContributor {
  return {
    domain: "content-duplication",
    build: buildContentDuplicationRegistrations,
    risk: contentDuplicationDerivedRisk,
  };
}
