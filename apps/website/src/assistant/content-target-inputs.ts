import { DEFAULT_MAX_BATCH_ITEMS, requireInputRecord, requireString, ToolInputError, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import { findMediaByIdOrSlug, type MediaRepoPort } from "@jini-ai/cms/media";
import { PERMANENT_DELETE_TOOLS } from "../contracts/headless/assistant-permanent-deletes-policy.js";

interface ContentTarget { key: string; entityType: "post" | "media"; authorizationEntityType: string; slugAlias: boolean }
export interface ContentTargetDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  mediaRepo: MediaRepoPort;
  resolvePost(input: { selector: string }, options?: Record<string, never>): Promise<string>;
  permissionFor(input: { toolId: string }, options?: Record<string, never>): string;
  beforeLookup?: (input: { toolId: string; principalId: string }) => Promise<void>;
}

/** CMS tool families with record targets; other ids retain their domain-owned meaning. */
function targetEntityType({ id }: { id: string }, _options = {}): ContentTarget["entityType"] | undefined {
  if (id.startsWith("seo_") || id === "content_read.seo_entry_meta") return "post";
  if (["pages_", "content_post_"].some(prefix => id.startsWith(prefix)) || id === "content_read.content_post") return "post";
  if (id.startsWith("media_") || ["content_read.media_asset", "library_read"].includes(id)) return "media";
}

/** Select only record targets, never a new slug being written or an unrelated id.
 * @complexity O(1), inspecting a fixed set of schema fields; no effects.
 */
function contentTarget({ registration }: { registration: ToolRegistration }, _options = {}): ContentTarget | undefined {
  const { id, inputSchema } = registration.descriptor;
  const properties = (inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  const entityType = targetEntityType({ id });
  if (!entityType) return;
  const key = ["id", "mediaId", "postId", "documentId", "entryId"].find(name => Object.hasOwn(properties, name));
  if (!key) return;
  // content_post_update.slug is the NEW slug, not a target selector.
  const slugAlias = !Object.hasOwn(properties, "slug") || id.startsWith("pages_") || id.startsWith("media_view_");
  const authorizationEntityType = id.startsWith("seo_") || id === "content_read.seo_entry_meta" ? "seo-entry" : entityType;
  return { key, entityType, authorizationEntityType, slugAlias };
}

/** Canonicalize selector spelling without reading storage before authorization/site selection.
 * Video keeps its established two-selector consistency contract until the authorized lookup.
 * @throws ToolInputError for conflicting selectors; never includes selector values in notes.
 * @complexity O(k) time/space for k input fields; no effects.
 */
function normalizeTarget({ input, target, toolId }: { input: Readonly<Record<string, unknown>>; target: ContentTarget; toolId: string }, _options = {}) {
  const canonical = toolId === "content_post_preview" ? previewTargetInput({ input }) : input;
  validateTargetSelectors({ input: canonical, toolId });
  return normalizeSlug({ input: canonical, target, toolId });
}

/** Keep preview's legacy postId precedence and nonempty target contract; no storage access. */
function previewTargetInput({ input }: { input: Readonly<Record<string, unknown>> }, _options = {}) {
  const id = input.id === undefined ? input.postId : input.id;
  if (id === undefined) return input;
  if (typeof id !== "string" || !id.trim()) throw new ToolInputError({ message: "content_post_preview: id must be a non-empty id or slug (postId is a legacy alias)." });
  return { ...input, id };
}

/** Preserve source-specific selector guards before domain validation or storage access. */
function validateTargetSelectors({ input, toolId }: { input: Readonly<Record<string, unknown>>; toolId: string }, _options = {}) {
  if (toolId === "pages_read_html" && input.id === undefined && input.slug === undefined) throw new ToolInputError({ message: "pages_read_html: send exactly one of id or slug." });
  if (toolId === "media_view_video" && Object.hasOwn(input, "slug")) validateVideoSlug({ input });
}

/** Rename the target alias once; a second selector is a conflict except for video's checked pair. */
function normalizeSlug({ input, target, toolId }: { input: Readonly<Record<string, unknown>>; target: ContentTarget; toolId: string }, _options = {}) {
  if (!target.slugAlias || !Object.hasOwn(input, "slug")) return { input, notes: [] };
  if (Object.hasOwn(input, target.key)) {
    if (toolId === "media_view_video") return { input, notes: [] };
    throw new ToolInputError({ message: `${toolId}: send exactly one of ${target.key} or slug.` });
  }
  const { slug, ...rest } = input;
  return { input: { ...rest, [target.key]: slug }, notes: [`slug→${target.key}`] };
}

/** Preserve video's path and mutually-exclusive source guards without any repository access. */
function validateVideoSlug({ input }: { input: Readonly<Record<string, unknown>> }, _options = {}) {
  if (typeof input.slug !== "string" || !input.slug || /[/\\\0]/u.test(input.slug)) throw new ToolInputError({ message: "media_view_video: slug must be a nonempty media-library slug; filesystem paths are refused." });
  if (input.attachmentRef !== undefined) throw new ToolInputError({ message: "media_view_video: pass a mediaId or slug, OR attachmentRef." });
}

/** Resolve one owned target. Repositories retain historical slug aliases; post lookup is injected
 * from its existing domain owner, including '/' and its trash/kind policy.
 * @returns Canonical id, or the original media selector so the domain retains its not-found reply.
 * @complexity At most two indexed reads per target; O(1) result space, no list scans.
 */
async function resolveTarget({ deps, target, selector }: { deps: ContentTargetDeps; target: ContentTarget; selector: string }, _options = {}) {
  if (target.entityType === "post") return deps.resolvePost({ selector });
  // Jini owns id-first ordering: a legacy slug collision must not redirect a canonical media id.
  const asset = await findMediaByIdOrSlug({ deps: { mediaRepo: deps.mediaRepo }, input: { workspaceId: deps.workspaceId, idOrSlug: selector } });
  return asset?.workspaceId === deps.workspaceId ? asset.id : selector;
}

/** Prepare a single selector only after admission and the domain permission floor. Domain handlers
 * keep their record-specific gates; no approval or mutation is executed here.
 * @complexity At most four indexed reads for video's consistency pair; O(k) input copy.
 */
async function prepareTargetInput({ input, target, toolId, deps, principalId }: {
  input: Record<string, unknown>; target: ContentTarget; toolId: string; deps: ContentTargetDeps; principalId: string;
}, _options = {}): Promise<Record<string, unknown>> {
  const normalized = normalizeTarget({ input, target, toolId }).input;
  if (normalized[target.key] === undefined) return { ...normalized };
  const selector = requireString({ input: normalized, key: target.key });
  if (PERMANENT_DELETE_TOOLS.some(tool => tool.id === toolId)) await deps.beforeLookup?.({ toolId, principalId });
  // Floor check only: the selector may still be a slug, so it is not an entity id to authorize or audit.
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId,
    principalId, permission: deps.permissionFor({ toolId }) }, { entityType: target.authorizationEntityType });
  const id = await resolveTarget({ deps, target, selector });
  const { slug, ...rest } = normalized;
  if (toolId === "media_view_video" && slug !== undefined) {
    const slugId = await resolveTarget({ deps, target, selector: requireString({ input: normalized, key: "slug" }) });
    if (slugId !== id) throw new ToolInputError({ message: "media_view_video: slug and mediaId disagree; send selectors for the same media asset." });
  }
  return { ...(target.slugAlias ? rest : normalized), [target.key]: id };
}

/** Combined deletion plans arrive with already-merged items. Resolve their selectors without
 * executing an item, leaving the existing plan/confirmation owner in charge of the whole action.
 * @complexity O(n) sequential preparations, n capped by Jini at 25; no mutation effects.
 */
async function prepareTargetInputs(required: Parameters<typeof prepareTargetInput>[0], _options = {}) {
  if (!Array.isArray(required.input.items)) return prepareTargetInput(required);
  if (required.input.items.length > DEFAULT_MAX_BATCH_ITEMS) throw new ToolInputError({ message: `At most ${DEFAULT_MAX_BATCH_ITEMS} targets can be prepared in one call.` });
  const items = [];
  for (const input of required.input.items) items.push(await prepareTargetInput({ ...required, input: requireInputRecord({ input }) }));
  return { ...required.input, items };
}

/** One CMS input adapter for all post/page/media selectors. Apply inside site scoping, outside
 * approval, before batching: lookup follows the domain permission floor on the selected site's
 * dependencies, and the original handler still enforces record-specific permissions.
 * @param required.deps - Site-bound ports; the composition root injects the existing post lookup.
 * @returns New registrations; unrelated tools and caller input are unchanged.
 * @throws Permission, lookup or selector errors before approval/handler effects.
 * @complexity O(t) registration for t tools; per invocation at most four indexed reads for video's
 * two selectors. Jini owns batch caps, per-item gates and normalization notes.
 */
export function applyContentTargetInputs({ registrations, deps }: { registrations: readonly ToolRegistration[]; deps: ContentTargetDeps }, _options = {}): ToolRegistration[] {
  return registrations.map(registration => {
    const target = contentTarget({ registration });
    if (!target) return registration;
    const toolId = registration.descriptor.id;
    return { ...registration,
      normalizeInput: async ({ input }, options) => {
        const normalized = normalizeTarget({ input, target, toolId });
        const next = registration.normalizeInput ? await registration.normalizeInput({ input: normalized.input }, options) : { input: normalized.input, notes: [] };
        return { input: next.input, notes: [...normalized.notes, ...next.notes] };
      },
      handler: withModelFacingErrors({ handlers: { target: async (ctx, options) => {
        const input = await prepareTargetInputs({ input: requireInputRecord({ input: ctx.input }), target, toolId, deps, principalId: ctx.principal.id });
        return registration.handler({ ...ctx, input }, options);
      } }, rules: toolId.startsWith("pages_") ? [forbiddenRule({ domainPrefix: "PAGES", error: ForbiddenError })] : [] }).target!,
    };
  });
}
