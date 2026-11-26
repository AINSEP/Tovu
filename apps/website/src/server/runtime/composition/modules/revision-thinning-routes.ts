import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import type { JsonRouteSpec, OriginContext } from "@jini-ai/core/contracts/server";
import { ok } from "@jini-ai/core/contracts/server";
import { RouteRefusalError, rejectRoute } from "@jini-ai/core/errors/route-refusal";

import type { CleanupPreviewStore } from "@jini-ai/core/contracts/storage";

import { postRevisionRefProbes } from "@jini-ai/cms/posts/sql/revision-refs";
import { bindRevisionThinning, type RevisionThinningBinding } from "@jini-ai/cms/posts/sql/revision-thinning";
import { schemaErasedKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { AdminJsonRoutePortDeps, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";

/**
 * @file Owner-only HTTP mounts for revision thinning: an explicit date-only preview of one post or
 * page, then apply with that preview's token and `confirm: true`, both same-origin. DISABLED
 * (STOP 6): no server module calls {@link mountRevisionThinning} yet, and nothing schedules it.
 */

export const REVISION_THINNING_PATHS = {
  preview: "/api/admin/posts/revisions/thinning/preview",
  apply: "/api/admin/posts/revisions/thinning/apply",
} as const;

type Body = Record<string, unknown> | undefined;
type Scope = { postId: unknown; kind: unknown };
type Spec<I> = Omit<JsonRouteSpec<I, unknown, AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports">;

/** Required collaborators of {@link mountRevisionThinning}. */
export interface MountRevisionThinningRequired {
  app: Express;
  binding: RevisionThinningBinding;
  /** The strict installation-owner check; returns the owner principal or refuses. */
  ownerCheck: (required: { context: OperatorPrincipalRecord | undefined }) => Promise<{ principal: string }>;
  adminPorts: { errors: RouteErrorPorts; mount: typeof mountAdminJsonRoute; deps: AdminJsonRoutePortDeps; origin: OriginContext };
}

/**
 * Engine and adapter errors as refusals the panel tells apart: expired (preview again), a bad
 * scope or date, and the owner refusal. Kept (protected) rows are not errors: apply returns them.
 * @complexity O(1).
 */
export function refusalForThinningError({ error }: { error: unknown }, _optional: Record<string, never> = {}): never {
  if (error instanceof RouteRefusalError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("The revision preview expired")) rejectRoute({ status: 410, code: "PREVIEW_EXPIRED", error: message });
  if (message.startsWith("Choose") || message.startsWith("Confirm the revision")) rejectRoute({ status: 400, code: "INVALID_INPUT", error: message });
  if (message.startsWith("Only the site owner")) rejectRoute({ status: 403, code: "OWNER_ONLY", error: message });
  throw error;
}

function previewSpec({ binding, ownerCheck }: Omit<MountRevisionThinningRequired, "app" | "adminPorts">): Spec<Scope & { before: unknown }> {
  return {
    method: "post", path: REVISION_THINNING_PATHS.preview, requireSameOrigin: true,
    parse: (raw) => { const body = raw.body as Body; return ok({ value: { postId: body?.postId, kind: body?.kind, before: body?.before } }); },
    handle: async ({ input, context, deps }) => {
      const { principal } = await ownerCheck({ context });
      const scope = { workspaceId: deps.workspaceId, postId: input.postId as string, kind: input.kind as string };
      return ok({ value: await binding.preview({ principal, scope, before: input.before }, {}).catch((error: unknown) => refusalForThinningError({ error })) });
    },
  };
}

function applySpec({ binding, ownerCheck }: Omit<MountRevisionThinningRequired, "app" | "adminPorts">): Spec<Scope & { previewToken: string }> {
  return {
    method: "post", path: REVISION_THINNING_PATHS.apply, requireSameOrigin: true,
    parse: (raw) => {
      const body = raw.body as Body;
      if (body?.confirm !== true) rejectRoute({ status: 400, code: "INVALID_INPUT", error: "Confirm the revision preview first." });
      const previewToken = typeof body?.previewToken === "string" ? body.previewToken : rejectRoute({ status: 400, code: "INVALID_INPUT", error: "Preview the revisions to delete first." });
      return ok({ value: { postId: body?.postId, kind: body?.kind, previewToken } });
    },
    handle: async ({ input, context, deps }) => {
      const { principal } = await ownerCheck({ context });
      const scope = { workspaceId: deps.workspaceId, postId: input.postId as string, kind: input.kind as string };
      return ok({ value: await binding.apply({ principal, scope, previewToken: input.previewToken, confirm: true }, {}).catch((error: unknown) => refusalForThinningError({ error })) });
    },
  };
}

/**
 * Mounts preview and apply behind the admin ports with `requireSameOrigin: true` and the owner
 * check. Must be registered after `requireAdminSession`, like the other storage cleanups.
 * @complexity O(1) setup; per request as the binding.
 */
export function mountRevisionThinning({ app, binding, ownerCheck, adminPorts }: MountRevisionThinningRequired, _optional: Record<string, never> = {}): void {
  adminPorts.mount({ errors: adminPorts.errors, app, spec: previewSpec({ binding, ownerCheck }), deps: adminPorts.deps, origin: adminPorts.origin });
  adminPorts.mount({ errors: adminPorts.errors, app, spec: applySpec({ binding, ownerCheck }), deps: adminPorts.deps, origin: adminPorts.origin });
}

const OWNER_ONLY = "Only the site owner can thin revisions.";

/**
 * Builds what {@link mountRevisionThinning} needs: the binding over the production reference probes
 * (`features/post/revision-refs.ts`, read inside the apply's fence) and the strict installation-owner
 * check — the session principal must BE `ownerPrincipalId`, as `screenshotOwnerFrom`; an admin
 * session alone or a builtin admin is not the owner.
 *
 * Why nothing calls this yet: revision thinning stays DISABLED until the owner signs off STOP 6.
 * Deleting history is irreversible, so no server module mounts these routes and the
 * `post_thin_revisions` tool is not registered in the agent catalog; turning it on is a deliberate,
 * reviewed change at the composition root, never a side effect of this helper existing.
 * @complexity O(1) setup; per request as the binding plus one owner lookup.
 */
export function composeRevisionThinning(
  required: { kernel: ContentKernel; ownerPrincipalId: () => Promise<string>; previewStore: CleanupPreviewStore; clock: () => number },
  _optional: Record<string, never> = {},
): Pick<MountRevisionThinningRequired, "binding" | "ownerCheck"> {
  const { kernel, ownerPrincipalId, previewStore, clock } = required;
  const isOwner = async (principal: string | undefined) => Boolean(principal) && principal === await ownerPrincipalId();
  const binding = bindRevisionThinning({
    kernel: schemaErasedKernel({ store: kernel }), postRevisionLockKey, ...postRevisionRefProbes({ kernel: schemaErasedKernel({ store: kernel }) }, {}), previewStore, clock,
    authorize: async ({ principal }) => { if (!await isOwner(principal)) throw new Error(OWNER_ONLY); },
  }, {});
  const ownerCheck: MountRevisionThinningRequired["ownerCheck"] = async ({ context }) => {
    if (!context?.id || !await isOwner(context.id)) rejectRoute({ status: 403, code: "OWNER_ONLY", error: OWNER_ONLY });
    return { principal: context.id };
  };
  return { binding, ownerCheck };
}
