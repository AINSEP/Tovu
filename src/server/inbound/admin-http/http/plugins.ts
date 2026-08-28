/**
 * @file Re-export shim for `toAdminPluginResponse()`/`AdminPluginEnvelope` (SPEC-005 REQ-10,
 * api.spec.md §5; C-017).
 *
 * The real implementation now lives in `features/plugin-runtime/admin-response.ts` — this domain's
 * own DTO, not the HTTP layer's — since `features/plugin-runtime/tool-registrations.ts` (the same
 * module) needed it too and a feature reaching into `server/http/admin` for its own projection was
 * a back-edge into the composition root (2026-08-02 module-graph analysis, Phase 3-adjacent; same
 * treatment `widgets/where-used.ts` already received). Re-exported here purely so this file's own
 * consumers (`routes/admin/plugins/list.ts`/`set-enabled.ts`) keep their existing import site.
 */
export { toAdminPluginResponse, type AdminPluginEnvelope } from "#src/features/plugin-runtime/admin-response";
