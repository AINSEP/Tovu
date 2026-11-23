import type { Express } from "express";

import { contentTypeLifecycleRoute } from "@jini-ai/cms/admin-http/routes/content-types/lifecycle";
import { contentTypeListRoute } from "@jini-ai/cms/admin-http/routes/content-types/list";
import { contentTypeRegisterRoute } from "@jini-ai/cms/admin-http/routes/content-types/register";
import { contentTypeUpdateFieldsRoute } from "@jini-ai/cms/admin-http/routes/content-types/update-fields";
import { entryCreateRoute } from "@jini-ai/cms/admin-http/routes/entries/create";
import { entryLifecycleRoute } from "@jini-ai/cms/admin-http/routes/entries/lifecycle";
import { entryListRoute } from "@jini-ai/cms/admin-http/routes/entries/list";
import { entryUpdateRoute } from "@jini-ai/cms/admin-http/routes/entries/update";
import { processOutbox } from "#src/contracts/core/events/index";
import { registerContentType, updateContentTypeFields } from "#src/features/content-types/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `content-types` server module (ADR-043
 * Collections backend: content-types + entries).
 *
 * NAME COLLISION WARNING (disclosed, per SPEC-042 REQ-04): `apps/website/src/server/runtime/composition/modules/content.ts`
 * already exists (SPEC-038's posts/pages/change-sets/presentation module) and is unrelated to
 * this domain. This file is deliberately named `content-types.ts`, not `content.ts`, to avoid
 * silently overwriting that file.
 *
 * Owns all 8 registrations (content-types' list/register/update-fields/lifecycle, entries' list/
 * create/update/lifecycle), same relative order and position. All eight are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/{content-types,entries}/*`) mounted behind the admin ports;
 * each mount builds its route's own small deps from `ContentTypesRouteDeps` and never passes it whole.
 */

/**
 * ADR-046 Phase 3 (SPEC-042, final slice) — narrow `RouteDeps` slice for the
 * `content-types` server module (ADR-043 Collections backend: content-types + entries).
 *
 * Purpose:
 * Read all 8 route specs directly (`@jini-ai/cms/admin-http/routes/content-types/{list,register,update-fields,
 * lifecycle}` and `.../entries/{list,create,update,lifecycle}`). Every one of them
 * only ever reads `workspaceId`/`authorize`/`clock`/`idGen`/`outbox`/`bus` plus `contentTypeRepo`/
 * `contentTypeIndexProvisioner`/`entryRepo` — a genuine narrowing (mirrors `routes/admin/
 * taxonomy/deps.ts`'s identical rationale), not a `RouteDeps`-widening extension.
 *
 * `bus` (2026-09-03 outbox-drain audit fix) joins `outbox` for the same reason
 * `apps/website/src/server/inbound/admin-http/routes/content/deps.ts`'s `ContentRouteDeps` and `apps/website/src/server/inbound/admin-http/routes/workspace/deps.ts`'s
 * `WorkspaceRouteDeps` both carry the identical `EventBusDeps` pair (see that group's own doc in
 * `server/routes/types.ts`): `entries/{create,update,lifecycle}.ts` and `content-types/lifecycle.ts`
 * each enqueue an outbox event on a successful write and drain it with `processOutbox({
 * outbox, bus, clock })` before responding, so `bus.subscribe`d consumers (e.g. SEO's
 * `entry.published`/`entry.updated`/`entry.unpublished` sitemap-cache-invalidation subscribers,
 * wired at `server/runtime/composition/app.ts`) see it before the response. Without that inline
 * drain, the serving process's background drainer (`serving-app.ts`, 2026-09-14) delivers it on its
 * next pass. `content-types/register.ts`/
 * `update-fields.ts` do not need this: `registerContentType`/`updateContentTypeFields` never call
 * `deps.outbox.enqueue` at all (verified against `@jini-ai/cms/content-types`'s `write-service.ts`),
 * so there is nothing there for `bus` to help deliver.
 *
 * One combined type, not two (design choice, disclosed): content-types and entries are one
 * cohesive ADR-043 domain per SPEC-042's own REQ-03 guidance, and the field sets genuinely do
 * NOT diverge enough to warrant a split — every content-types field content-types' own 4 routes
 * need (`contentTypeRepo`, `contentTypeIndexProvisioner`) is also read by entries' routes
 * (`entries/create.ts`/`update.ts`/`lifecycle.ts` all read `contentTypeRepo` too, to validate the
 * entry's parent content type is active before writing), and every remaining field
 * (`workspaceId`/`authorize`/`clock`/`idGen`/`outbox`/`bus`) is shared by both sub-domains outright.
 * Splitting would produce two types with near-total field overlap and one dangling field
 * (`entryRepo`) — a distinction without a real ownership boundary.
 */
export type ContentTypesRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "outbox" | "bus" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "entryRepo"
>;

export type ContentTypesRouteRegistrar = (required: { app: Express; deps: ContentTypesRouteDeps }, optional?: Record<string, never>) => void;

/** The two port fields every mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured — by the route
 *  gate and by the write services' own permission re-check alike. */
function collectionsPortDeps({ deps }: { deps: ContentTypesRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The write-route fields shared by every content-type and entry write. */
function collectionsWriteDeps({ deps }: { deps: ContentTypesRouteDeps }, _options: Record<string, never> = {}) {
  return {
    ...collectionsPortDeps({ deps }),
    clock: deps.clock,
    idGen: deps.idGen,
    outbox: deps.outbox,
    contentTypeRepo: deps.contentTypeRepo,
    contentTypeIndexProvisioner: deps.contentTypeIndexProvisioner,
  };
}

// Why the write routes drain the outbox inline, as written when each drain was added:
//
// 2026-09-03 outbox-drain audit fix — drains the outbox so a successful `deprecate`/
// `tombstone` transition's `content_type.deprecated`/`content_type.tombstoned` event
// reaches `bus.subscribe`d consumers before the response rather than on the background
// drainer's next pass (`serving-app.ts`; mirrors `posts/update.ts`'s identical inline
// `processOutbox` call). `reactivate` enqueues nothing, so this call is a
// harmless no-op drain on that branch — `@jini-ai/cms/content-types`'s `lifecycle.ts` file
// header explains why `reactivateContentType` never accepted an `outbox` dep at all.
//
// 2026-09-03 outbox-drain audit fix — drains the outbox so `createEntry`'s `entry.created`
// event reaches `bus.subscribe`d consumers before the response rather than on the background
// drainer's next pass (`serving-app.ts`; mirrors `posts/update.ts`'s identical inline
// `processOutbox` call).
//
// 2026-09-03 outbox-drain audit fix — drains the outbox so `updateEntry`'s `entry.updated`
// event reaches `bus.subscribe`d consumers before the response rather than on the background
// drainer's next pass (`serving-app.ts`; mirrors `posts/update.ts`'s identical inline
// `processOutbox` call).
//
// 2026-09-03 outbox-drain audit fix — drains the outbox so `publishEntry`/`unpublishEntry`'s
// `entry.published`/`entry.unpublished` event reaches `bus.subscribe`d consumers before the
// response rather than on the background drainer's next pass (`serving-app.ts`; mirrors
// `posts/update.ts`'s identical inline `processOutbox` call).

/** The inline outbox drain the write routes run after a successful write (2026-09-03 audit fix). */
function drainOutboxFor({ deps }: { deps: ContentTypesRouteDeps }, _options: Record<string, never> = {}): () => Promise<unknown> {
  return () => processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });
}

/** These routes never consulted the publishing-credential override (`authorizeDirectOrRespond`). */
const directMountOptions = (operation: string) => ({ authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } });

export const registerAdminContentTypeListRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: contentTypeListRoute, deps: { ...collectionsPortDeps({ deps }), contentTypeRepo: deps.contentTypeRepo } }, directMountOptions("routes/content-types/list"));
};

/** `registerContentType` is the host's registrar (it pins the site's reserved route segments). */
export const registerAdminContentTypeRegisterRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: contentTypeRegisterRoute, deps: { ...collectionsWriteDeps({ deps }), registerContentType } }, directMountOptions("routes/content-types/register"));
};

export const registerAdminContentTypeUpdateFieldsRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: contentTypeUpdateFieldsRoute, deps: { ...collectionsWriteDeps({ deps }), updateContentTypeFields } }, directMountOptions("routes/content-types/update-fields"));
};

export const registerAdminContentTypeLifecycleRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: contentTypeLifecycleRoute, deps: { ...collectionsWriteDeps({ deps }), drainOutbox: drainOutboxFor({ deps }) } }, directMountOptions("routes/content-types/lifecycle"));
};

export const registerAdminEntryListRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: entryListRoute, deps: { ...collectionsPortDeps({ deps }), entryRepo: deps.entryRepo } }, directMountOptions("routes/entries/list"));
};

/** The write-route deps every entry write reads (`entriesDeps` plus the outbox drain). */
function entryWriteDeps({ deps }: { deps: ContentTypesRouteDeps }, _options: Record<string, never> = {}) {
  return { ...collectionsWriteDeps({ deps }), entryRepo: deps.entryRepo, drainOutbox: drainOutboxFor({ deps }) };
}

/** Create alone consulted the publishing-credential override (`authorizeOrRespond`), so it stays guarded. */
export const registerAdminEntryCreateRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: entryCreateRoute, deps: entryWriteDeps({ deps }) }, { failure: { operation: "routes/entries/create", code: "INTERNAL_ERROR" } });
};

export const registerAdminEntryUpdateRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: entryUpdateRoute, deps: entryWriteDeps({ deps }) }, directMountOptions("routes/entries/update"));
};

export const registerAdminEntryLifecycleRoute: ContentTypesRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: entryLifecycleRoute, deps: entryWriteDeps({ deps }) }, directMountOptions("routes/entries/lifecycle"));
};

export function createContentTypesModule(deps: ContentTypesRouteDeps): ServerModuleHandle {
  return {
    name: "content-types",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminContentTypeListRoute({ app, deps });
      registerAdminContentTypeRegisterRoute({ app, deps });
      registerAdminContentTypeUpdateFieldsRoute({ app, deps });
      registerAdminContentTypeLifecycleRoute({ app, deps });
      registerAdminEntryListRoute({ app, deps });
      registerAdminEntryCreateRoute({ app, deps });
      registerAdminEntryUpdateRoute({ app, deps });
      registerAdminEntryLifecycleRoute({ app, deps });
    },
  };
}
