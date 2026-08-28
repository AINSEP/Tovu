import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — narrow `RouteDeps` slice for the
 * `content-types` server module (ADR-043 Collections backend: content-types + entries).
 *
 * Purpose:
 * Read all 8 route files directly (`content-types/list.ts`/`register.ts`/`update-fields.ts`/
 * `lifecycle.ts` and `entries/list.ts`/`create.ts`/`update.ts`/`lifecycle.ts`). Every one of them
 * only ever reads `workspaceId`/`authorize`/`clock`/`idGen`/`outbox` plus `contentTypeRepo`/
 * `contentTypeIndexProvisioner`/`entryRepo` — a genuine narrowing (mirrors `routes/admin/
 * taxonomy/deps.ts`'s identical rationale), not a `RouteDeps`-widening extension.
 *
 * One combined type, not two (design choice, disclosed): content-types and entries are one
 * cohesive ADR-043 domain per SPEC-042's own REQ-03 guidance, and the field sets genuinely do
 * NOT diverge enough to warrant a split — every content-types field content-types' own 4 routes
 * need (`contentTypeRepo`, `contentTypeIndexProvisioner`) is also read by entries' routes
 * (`entries/create.ts`/`update.ts`/`lifecycle.ts` all read `contentTypeRepo` too, to validate the
 * entry's parent content type is active before writing), and every remaining field
 * (`workspaceId`/`authorize`/`clock`/`idGen`/`outbox`) is shared by both sub-domains outright.
 * Splitting would produce two types with near-total field overlap and one dangling field
 * (`entryRepo`) — a distinction without a real ownership boundary.
 */
export type ContentTypesRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "outbox" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "entryRepo"
>;
