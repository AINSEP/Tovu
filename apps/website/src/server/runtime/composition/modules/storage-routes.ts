import path from "node:path";
import type { Express } from "express";

import type { JsonRouteSpec, RouteHostContext } from "@jini-ai/core/contracts/server";
import { ok } from "@jini-ai/core/contracts/server";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import type { RetentionPassResult, RetentionPolicyOutcome } from "@jini-ai/platform/retention";
import { createStorageRoutes } from "@jini-ai/platform/retention/routes";

import type { SiteStoragePath, SiteStorageReport } from "#src/features/storage/measure";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { AdminJsonRouteMountOptions, AdminJsonRoutePortDeps, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";

/**
 * @file The owner-only storage endpoints over the serving process's retention runner (ST-15b):
 * `GET /api/admin/storage/report` (categories, classes and the last pass) and
 * `POST /api/admin/storage/cleanup` (a dry run unless the body says `dryRun: false`). Both bind the
 * released `@jini-ai/platform/retention/routes` specs; this file supplies the owner check, the
 * content-class refusal and the wire shape, which never carries a raw path.
 */

export const STORAGE_ROUTE_PATHS = { report: "/api/admin/storage/report", cleanup: "/api/admin/storage/cleanup" } as const;

/** The serving process's storage: one measurement walk, the retention runner, its last pass. */
export interface SiteStoragePort {
  measure(required: Record<string, never>, optional: Record<string, never>): Promise<SiteStorageReport>;
  runOnce(required: { dryRun: boolean }): Promise<RetentionPassResult>;
  lastPass(): RetentionPassResult | undefined;
}

type Context = OperatorPrincipalRecord | undefined;
export type StorageOwnerCheck = (required: { context: Context }) => Promise<unknown>;

/** Required collaborators of {@link mountStorageRoutes}. */
export interface MountStorageRoutesRequired {
  app: Express;
  /** Absent outside the process that owns the served site (exporter, attached serve, daemon). */
  storage: SiteStoragePort | undefined;
  authorizeOwner: StorageOwnerCheck;
  adminPorts: { mount: typeof mountAdminJsonRoute; deps: AdminJsonRoutePortDeps; origin: RouteHostContext };
}

/** Everything the owner keeps by hand; no request may name one of these for cleanup. */
const PROTECTED_CLASSES: ReadonlySet<string> = new Set(["chats", "chat", "revisions", "screenshots", "media", "uploads", "content", "yours"]);
export const PROTECTED_CONTENT_MESSAGE = "Tovu never cleans up your chats, revisions, screenshots or media automatically. Remove them yourself from their own screens.";
const INVALID_CLASS_MESSAGE = "Storage cleanup only covers caches, derived files and old copies.";

type Body = Record<string, unknown> | undefined;
const invalid = (error: string): never => rejectRoute({ status: 400, code: "INVALID_INPUT", error });

/**
 * The host seam's reading of a cleanup body. A missing `dryRun` is a dry run; only a literal `false`
 * runs live, so a typo can never delete anything. Content classes are refused here, before the runner.
 * @complexity O(classes).
 */
export function parseCleanupBody({ body }: { body: unknown }, _optional: Record<string, never> = {}): { dryRun: boolean; classes?: string[] } {
  if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body))) invalid("Send the cleanup options as a JSON object.");
  const { dryRun: rawDryRun, classes } = (body ?? {}) as NonNullable<Body>;
  const dryRun = rawDryRun === undefined ? true : typeof rawDryRun === "boolean" ? rawDryRun : invalid("Say dryRun: true to preview or dryRun: false to clean up.");
  if (classes === undefined) return { dryRun };
  if (!Array.isArray(classes) || classes.some(kind => typeof kind !== "string")) invalid("List the kinds of storage to clean up as words.");
  if ((classes as string[]).some(kind => PROTECTED_CLASSES.has(kind))) rejectRoute({ status: 400, code: "PROTECTED_CONTENT", error: PROTECTED_CONTENT_MESSAGE });
  return { dryRun, classes: classes as string[] };
}

/** One policy outcome without anything a policy might have attached beyond its numbers. */
function outcomeView(outcome: RetentionPolicyOutcome) {
  const head = { id: outcome.id, kind: outcome.kind, status: outcome.status };
  if (outcome.status === "measured") return { ...head, bytes: outcome.measurement.bytes, ...(outcome.measurement.items === undefined ? {} : { items: outcome.measurement.items }) };
  if (outcome.status === "swept") return { ...head, freedBytes: outcome.result.freedBytes, removed: outcome.result.removed };
  return { ...head, message: outcome.message };
}

/** A pass as the wire shows it. @complexity O(policies). */
export function passView({ pass }: { pass: RetentionPassResult }, _optional: Record<string, never> = {}) {
  if (pass.status === "stopped") return { status: pass.status, dryRun: pass.dryRun };
  return { status: pass.status, dryRun: pass.dryRun, startedAt: pass.startedAt, finishedAt: pass.finishedAt, policies: pass.policies.map(outcomeView) };
}

/** The report minus its folder, database paths, symlinks and unreadable paths (counted, not named). */
function reportView({ report, last }: { report: SiteStorageReport; last: RetentionPassResult | undefined }) {
  return {
    totalBytes: report.totalBytes, knownBytes: report.knownBytes, categories: report.categories, classes: report.classes,
    unknownLocations: report.unknownPaths.length, skippedLinks: report.skippedSymlinks.length,
    lastPass: last === undefined ? null : passView({ pass: last }),
  };
}

const notServing = (): never => rejectRoute({ status: 503, code: "NOT_SERVING", error: "Storage cleanup runs only in the app that is serving this site. Start the site and try again." });

/**
 * Wraps a Jini storage spec so its `authorize` is the strict owner check and the storage port is
 * required. The spec's `storage.manage` permission is not consulted: no role grants this.
 */
function ownerOnly<Input, Deps>(
  { spec, authorizeOwner }: { spec: Omit<JsonRouteSpec<Input, object, Deps, undefined>, "ports">; authorizeOwner: StorageOwnerCheck },
): Omit<JsonRouteSpec<Input, object, Deps, OperatorPrincipalRecord>, "ports"> {
  return { ...spec, handle: async ({ context, ...args }) => {
    await authorizeOwner({ context });
    return spec.handle({ ...args, context: undefined, authorize: async () => {} });
  } };
}

function storageDeps({ storage }: { storage: SiteStoragePort | undefined }) {
  return {
    measure: async () => {
      const port = storage ?? notServing();
      return reportView({ report: await port.measure({}, {}), last: port.lastPass() });
    },
    runOnce: async ({ dryRun }: { dryRun: boolean; classes?: string[] }) => passView({ pass: await (storage ?? notServing()).runOnce({ dryRun }) }),
    copy: { invalidClass: INVALID_CLASS_MESSAGE },
  };
}

/**
 * Mounts the two storage endpoints behind the admin ports: session credential only, then the
 * strict owner check, then the serving-process check. Cleanup is same-origin.
 * @complexity O(1) setup; per request one measurement walk or one retention pass.
 */
export function mountStorageRoutes({ app, storage, authorizeOwner, adminPorts }: MountStorageRoutesRequired, _optional: Record<string, never> = {}): void {
  const specs = createStorageRoutes({ paths: STORAGE_ROUTE_PATHS }, {});
  const deps = { ...adminPorts.deps, ...storageDeps({ storage }) };
  const options: AdminJsonRouteMountOptions = { sessionCredentialOnly: { message: "Use the site owner's own sign-in to manage storage.", permission: "storage.manage" } };
  adminPorts.mount({ app, spec: ownerOnly({ spec: specs.report, authorizeOwner }), deps, origin: adminPorts.origin }, options);
  const cleanup = { ...specs.cleanup, parse: (raw: Parameters<typeof specs.cleanup.parse>[0]) => specs.cleanup.parse({ ...raw, body: parseCleanupBody({ body: raw.body }) }) };
  adminPorts.mount({ app, spec: ownerOnly({ spec: cleanup, authorizeOwner }), deps, origin: adminPorts.origin }, options);
}

/**
 * Owner-only: a session principal whose id is the installation owner's.
 * Why site ownership is not the same as an admin session: an admin session proves only that someone
 * signed in with a role, and the built-in admin or a teammate with every permission is still not the
 * person whose disk this is. Deleting old copies is the owner's call, so the id must match exactly,
 * and peer-publish credentials are refused before this by the session-credential gate.
 */
export function storageOwnerFrom({ ownerPrincipalId }: { ownerPrincipalId: () => Promise<string> }, _optional: Record<string, never> = {}): StorageOwnerCheck {
  return async ({ context }) => {
    if (!context?.id || context.id !== await ownerPrincipalId()) rejectRoute({ status: 403, code: "OWNER_ONLY", error: "Only the site owner can see or clean up this site's storage." });
    return { principal: context.id };
  };
}

/**
 * The locations the serving process measures, kept to those inside `siteDir` (the measure refuses
 * any other). Mirrors the CLI report's list for what the serving deps know.
 * @complexity O(paths).
 */
export function servingStoragePaths(
  { siteDir, contentDbPath, mediaUploadsDir, themesDir }: { siteDir: string; contentDbPath: string; mediaUploadsDir: string; themesDir: string },
  _optional: Record<string, never> = {},
): SiteStoragePath[] {
  const opsDir = path.join(path.dirname(contentDbPath), "ops");
  const declared: SiteStoragePath[] = [
    { category: "content-database", path: contentDbPath }, { category: "uploads", path: mediaUploadsDir }, { category: "themes", path: themesDir },
    { category: "screenshots", path: path.join(siteDir, ".captures") }, { category: "shares", path: path.join(opsDir, "shares") },
    { category: "logs", path: path.join(siteDir, "ops", "logs") },
  ];
  const inside = (target: string) => { const relative = path.relative(siteDir, target); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };
  return declared.map(entry => ({ ...entry, path: path.resolve(entry.path) })).filter(entry => inside(entry.path));
}
