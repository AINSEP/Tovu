import path from "node:path";
import type { Express } from "express";

import type { JsonRouteSpec, RouteHostContext } from "@jini-ai/core/contracts/server";
import { ok } from "@jini-ai/core/contracts/server";
import { ToolInputError } from "@jini-ai/core";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import type { CleanupPreviewStore } from "@jini-ai/core/contracts/storage";
import type { RetentionPassResult, RetentionPolicyOutcome } from "@jini-ai/platform/retention";
import { createStorageRoutes } from "@jini-ai/platform/retention/routes";

import { createStorageCleanupGate, type StorageCleanupGate } from "#src/features/storage/cleanup-gate";
import type { SiteStoragePath, SiteStorageReport } from "#src/features/storage/measure";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { AdminJsonRouteMountOptions, AdminJsonRoutePortDeps, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";

/**
 * @file The owner-only storage endpoints over the serving process's retention runner (ST-15b):
 * `GET /api/admin/storage/report` (categories, classes and the last pass) and
 * `POST /api/admin/storage/cleanup` (a dry run unless the body says `dryRun: false`; a dry run answers
 * a `previewToken`, and a live run needs that exact, unspent grant — see `features/storage/cleanup-gate.ts`). Both bind the
 * released `@jini-ai/platform/retention/routes` specs; this file supplies the owner check, the
 * content-class refusal and the wire shape, which never carries a raw path.
 */

export const STORAGE_ROUTE_PATHS = { report: "/api/admin/storage/report", cleanup: "/api/admin/storage/cleanup" } as const;

/** The serving process's storage: one measurement walk, the retention runner, its last pass. */
export interface SiteStoragePort {
  measure(required: Record<string, never>, optional: Record<string, never>): Promise<SiteStorageReport>;
  runOnce(required: { dryRun: boolean }): Promise<RetentionPassResult>;
  lastPass(): RetentionPassResult | undefined;
  /** The one grant store this serving process's HTTP route and assistant tool share. */
  cleanupPreviews: CleanupPreviewStore;
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
export function parseCleanupBody({ body }: { body: unknown }, _optional: Record<string, never> = {}): CleanupInput {
  if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body))) invalid("Send the cleanup options as a JSON object.");
  const { dryRun: rawDryRun, classes, previewToken } = (body ?? {}) as NonNullable<Body>;
  const dryRun = rawDryRun === undefined ? true : typeof rawDryRun === "boolean" ? rawDryRun : invalid("Say dryRun: true to preview or dryRun: false to clean up.");
  if (previewToken !== undefined && typeof previewToken !== "string") invalid("Send the preview's token as it was given.");
  const grant = previewToken === undefined ? {} : { previewToken: previewToken as string };
  if (classes === undefined) return { dryRun, ...grant };
  if (!Array.isArray(classes) || classes.some(kind => typeof kind !== "string")) invalid("List the kinds of storage to clean up as words.");
  if ((classes as string[]).some(kind => PROTECTED_CLASSES.has(kind))) rejectRoute({ status: 400, code: "PROTECTED_CONTENT", error: PROTECTED_CONTENT_MESSAGE });
  return { dryRun, classes: classes as string[], ...grant };
}

type CleanupInput = { dryRun: boolean; classes?: string[]; previewToken?: string };

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

const NOT_SERVING_MESSAGE = "Storage cleanup runs only in the app that is serving this site. Start the site and try again.";
const OWNER_ONLY_MESSAGE = "Only the site owner can see or clean up this site's storage.";
const notServing = (): never => rejectRoute({ status: 503, code: "NOT_SERVING", error: NOT_SERVING_MESSAGE });
const NOT_APPROVED_MESSAGE = "Nothing was removed: this clean-up was not approved for what is on disk now. Review it again and confirm.";

/**
 * Wraps a Jini storage spec so its `authorize` is the strict owner check and the storage port is
 * required. The spec's `storage.manage` permission is not consulted: no role grants this.
 */
function ownerOnly<Input, Deps>(
  { spec, authorizeOwner, bind }: {
    spec: Omit<JsonRouteSpec<Input, object, Deps, undefined>, "ports">; authorizeOwner: StorageOwnerCheck;
    /** Binds the request's verified owner (and input) into the deps the spec runs with. */
    bind: (required: { principalId: string; input: Input; deps: Deps }) => Deps;
  },
): Omit<JsonRouteSpec<Input, object, Deps, OperatorPrincipalRecord>, "ports"> {
  return { ...spec, handle: async ({ context, input, deps, ...args }) => {
    await authorizeOwner({ context });
    return spec.handle({ ...args, input, deps: bind({ principalId: context?.id ?? "", input, deps }), context: undefined, authorize: async () => {} });
  } };
}

/**
 * The Jini cleanup spec's `runOnce` for one owner request, routed through the gate: a dry run mints
 * the preview's grant and answers it; a live run spends exactly that grant or is refused (409).
 */
function gatedRunOnce({ gate, principalId, previewToken }: { gate: StorageCleanupGate; principalId: string; previewToken: string | undefined }) {
  return async ({ dryRun }: { dryRun: boolean }): Promise<object> => {
    if (dryRun) {
      const { pass, previewToken: minted } = await gate.preview({ principalId }, {});
      return { ...pass, previewToken: minted };
    }
    const outcome = await gate.apply({ principalId, previewToken }, {});
    return outcome.status === "applied" ? outcome.pass : rejectRoute({ status: 409, code: "CLEANUP_NOT_APPROVED", error: NOT_APPROVED_MESSAGE });
  };
}

/** The cleanup gate over the port as the wire shows its passes; built per call so an absent port refuses. */
function gateOver({ storage, missing }: { storage: SiteStoragePort | undefined; missing: () => never }): StorageCleanupGate {
  const gate = () => {
    const port = storage ?? missing();
    return createStorageCleanupGate({ runOnce: async ({ dryRun }) => passView({ pass: await port.runOnce({ dryRun }) }), previewStore: port.cleanupPreviews }, {});
  };
  return { dryRun: (r, o) => gate().dryRun(r, o), preview: (r, o) => gate().preview(r, o), apply: (r, o) => gate().apply(r, o) };
}

/** The port's report and its cleanup gate as the wire shows them; `missing` refuses when this process serves no site. */
function storageViews({ storage, missing }: { storage: SiteStoragePort | undefined; missing: () => never }) {
  return {
    measure: async () => {
      const port = storage ?? missing();
      return reportView({ report: await port.measure({}, {}), last: port.lastPass() });
    },
    cleanup: gateOver({ storage, missing }),
  };
}

const unboundRunOnce = async (_required: { dryRun: boolean }): Promise<object> => { throw new Error("storage cleanup ran without its owner binding"); };

function storageDeps({ storage }: { storage: SiteStoragePort | undefined }) {
  return { ...storageViews({ storage, missing: notServing }), runOnce: unboundRunOnce, copy: { invalidClass: INVALID_CLASS_MESSAGE } };
}

/**
 * The assistant tools' view of the SAME port the routes mount: identical report and pass shapes (no
 * raw path), the same strict owner-id check, and plain-word refusals instead of HTTP ones. Outside
 * the serving process `storage` is absent and every call says so rather than failing.
 * @complexity O(1); per call one measurement walk or one retention pass.
 */
export function storageToolPorts(
  { storage, ownerPrincipalId }: { storage: SiteStoragePort | undefined; ownerPrincipalId: () => Promise<string> },
  _optional: Record<string, never> = {},
) {
  const refuse = (message: string): never => { throw new ToolInputError({ message }); };
  return {
    ...storageViews({ storage, missing: () => refuse(NOT_SERVING_MESSAGE) }),
    authorizeOwner: async ({ principalId }: { principalId: string }, _options: Record<string, never> = {}) => {
      if (!principalId || principalId !== await ownerPrincipalId()) refuse(OWNER_ONLY_MESSAGE);
    },
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
  adminPorts.mount({ app, spec: ownerOnly({ spec: specs.report, authorizeOwner, bind: ({ deps: bound }) => bound }), deps, origin: adminPorts.origin }, options);
  const cleanup = { ...specs.cleanup, parse: (raw: Parameters<typeof specs.cleanup.parse>[0]) => specs.cleanup.parse({ ...raw, body: parseCleanupBody({ body: raw.body }) }) };
  // Every live pass goes through the gate with this request's owner and grant; the spec's own runOnce is never the unbound one.
  const bind = ({ principalId, input, deps: bound }: { principalId: string; input: CleanupInput | { dryRun?: boolean }; deps: typeof deps }) =>
    ({ ...bound, runOnce: gatedRunOnce({ gate: bound.cleanup, principalId, previewToken: (input as CleanupInput).previewToken }) });
  adminPorts.mount({ app, spec: ownerOnly({ spec: cleanup, authorizeOwner, bind }), deps, origin: adminPorts.origin }, options);
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
    if (!context?.id || context.id !== await ownerPrincipalId()) rejectRoute({ status: 403, code: "OWNER_ONLY", error: OWNER_ONLY_MESSAGE });
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
