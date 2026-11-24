import { toolMetadata } from '@jini-ai/core/tool-metadata/content-duplication';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
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
import { buildDomainRegistrations, indexCatalogById, isRecord, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { type AuthorizeFn } from "@jini-ai/core/contracts/events";
import { ToolInputError } from "@jini-ai/core";

import type { DuplicateResourceHandler, DuplicateResourceHandlerContributor } from "@jini-ai/core/contracts/site/assistant-tool-contributions";
import type { ToolContributor } from "@jini-ai/core";

import { type AgentToolDefinition as ContentDuplicationAgentToolDefinition } from "@jini-ai/core";
