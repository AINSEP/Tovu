import type { Express } from "express";

import type { RedirectHitStats, RedirectRecord } from "#src/redirects/index";
import type { RedirectsWriteDeps } from "#src/redirects/index";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Response DTOs + route-dependency shape for the admin `redirects` HTTP
 * surface (SPEC-009, api.spec.md).
 *
 * Purpose:
 * Serializes `redirects` library read models (`RedirectRecord`,
 * `RedirectHitStats`) into the stable admin JSON envelopes api.spec.md §5
 * defines (`{ data: ... }`, NOT the `{ menu: ... }`-style envelope
 * `server/http/admin/menus.ts` uses — this feature's own api.spec.md is
 * explicit about the `data` envelope key, so it is followed exactly rather
 * than copied from the Menus precedent).
 *
 * `RedirectRouteDeps` mirrors `MenuRouteDeps`'s pattern for documentation/
 * consistency, even though (unlike Menus) this feature's new fields
 * (`redirectRepo`, `redirectHitSink`, `originRegistry`, `redirectsWriteDeps`)
 * are already declared directly on the shared `RouteDeps` (`routes/types.ts`)
 * — TypeScript's excess-property checks on `createRouteDeps()`'s object-
 * literal return make a "local-extension-only, never touch routes/types.ts"
 * approach mechanically impractical (every existing sibling feature that
 * needs new fields on `RouteDeps` already extends it directly, despite some
 * ADR prose aspiring otherwise — a disclosed deviation, not an oversight).
 *
 * Architectural role:
 * HTTP-facing serialization + wiring-seam declarations only — no `redirects`
 * business logic lives here (that stays in `redirects/redirects.ts`).
 */
export interface RedirectRouteDeps extends RouteDeps {}

export type RedirectRouteRegistrar = (app: Express, deps: RedirectRouteDeps) => void;

export interface AdminRedirectDto {
  id: string;
  workspaceId: string;
  matchType: string;
  fromPattern: string;
  toTarget: string;
  statusCode: number;
  status: string;
  override: boolean;
  priority: number;
  source: string;
  sourceEntryId: string | null;
  fromPathAtCapture: string | null;
  toPathAtCapture: string | null;
  createdByPrincipal: string;
  createdByPluginId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AdminRedirectResponse {
  data: AdminRedirectDto;
}

export interface AdminRedirectListResponse {
  data: AdminRedirectDto[];
}

export interface AdminRedirectImportResponse {
  created: AdminRedirectDto[];
  failed: Array<{ index: number; code: string; message: string }>;
}

export interface AdminRedirectHitStatsDto {
  redirectId: string;
  workspaceId: string;
  hitCount: number;
  lastHitAt: string | null;
}

export interface AdminRedirectHitStatsResponse {
  data: AdminRedirectHitStatsDto;
}

export function toAdminRedirectDto(record: RedirectRecord): AdminRedirectDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    matchType: record.matchType,
    fromPattern: record.fromPattern,
    toTarget: record.toTarget,
    statusCode: record.statusCode,
    status: record.status,
    override: record.override,
    priority: record.priority,
    source: record.source,
    sourceEntryId: record.sourceEntryId ?? null,
    fromPathAtCapture: record.fromPathAtCapture ?? null,
    toPathAtCapture: record.toPathAtCapture ?? null,
    createdByPrincipal: record.createdByPrincipal,
    createdByPluginId: record.createdByPluginId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

export function toAdminRedirectResponse(record: RedirectRecord): AdminRedirectResponse {
  return { data: toAdminRedirectDto(record) };
}

export function toAdminRedirectListResponse(records: RedirectRecord[]): AdminRedirectListResponse {
  return { data: records.map(toAdminRedirectDto) };
}

export function toAdminRedirectImportResponse(result: {
  created: RedirectRecord[];
  failed: Array<{ index: number; code: string; message: string }>;
}): AdminRedirectImportResponse {
  return { created: result.created.map(toAdminRedirectDto), failed: result.failed };
}

export function toAdminRedirectHitStatsDto(stats: RedirectHitStats): AdminRedirectHitStatsDto {
  return {
    redirectId: stats.redirectId,
    workspaceId: stats.workspaceId,
    hitCount: stats.hitCount,
    lastHitAt: stats.lastHitAt ?? null,
  };
}

export function toAdminRedirectHitStatsResponse(stats: RedirectHitStats): AdminRedirectHitStatsResponse {
  return { data: toAdminRedirectHitStatsDto(stats) };
}

/** Re-exported for route files that only need the write-chokepoint deps shape. */
export type { RedirectsWriteDeps };
