import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — narrow `RouteDeps` slice for the
 * `content-types` server module (ADR-043 Collections backend: content-types + entries).
 *
 * Purpose:
 * Read all 8 route files directly (`content-types/list.ts`/`register.ts`/`update-fields.ts`/
 * `lifecycle.ts` and `entries/list.ts`/`create.ts`/`update.ts`/`lifecycle.ts`). Every one of them
 * only ever reads `workspaceId`/`authorize`/`clock`/`idGen`/`outbox`/`bus` plus `contentTypeRepo`/
 * `contentTypeIndexProvisioner`/`entryRepo` — a genuine narrowing (mirrors `routes/admin/
 * taxonomy/deps.ts`'s identical rationale), not a `RouteDeps`-widening extension.
 *
 * `bus` (2026-09-03 outbox-drain audit fix) joins `outbox` for the same reason
 * `routes/admin/content/deps.ts`'s `ContentRouteDeps` and `routes/admin/workspace/deps.ts`'s
 * `WorkspaceRouteDeps` both carry the identical `EventBusDeps` pair (see that group's own doc in
 * `server/routes/types.ts`): `entries/{create,update,lifecycle}.ts` and `content-types/lifecycle.ts`
 * each enqueue an outbox event on a successful write and must drain it with `processOutbox({
 * outbox, bus, clock })` before responding — this composition root has no background outbox
 * poller, so an undrained event sits pending forever and no `bus.subscribe`d consumer (e.g. SEO's
 * `entry.published`/`entry.updated`/`entry.unpublished` sitemap-cache-invalidation subscribers,
 * wired at `server/runtime/composition/app.ts`) ever sees it. `content-types/register.ts`/
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
