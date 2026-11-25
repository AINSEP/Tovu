import type { RetentionPassResult, RetentionPolicyKind } from "@jini-ai/platform/retention";
import { request, type AuthenticatedAdminRequestOptions } from "@/lib/admin-http/request";

/**
 * @file The admin's client for the owner-only storage routes the website mounts from
 * `@jini-ai/platform/retention/routes` (`apps/website/src/server/runtime/composition/modules/storage-routes.ts`):
 * `GET /api/admin/storage/report` and `POST /api/admin/storage/cleanup`. Refusals arrive in the admin
 * refusal envelope and surface as the request layer's `ApiError`.
 */

/** The website's three classes; the screen shows `report-only` as "Shown only". */
export type StorageClassName = "automatic" | "yours" | "report-only";
export interface StorageAmount { bytes: number | null; knownBytes: number; files: number }

/** What the report route answers: ST-14 categories and the last pass, never raw paths. */
export interface StorageReport {
  categories: Record<string, StorageAmount & { class: StorageClassName }>;
  lastPass: RetentionPassResult | null;
  unknownLocations?: number;
}

/** A pass as the cleanup route answers it; a dry run carries the grant its confirm must send. */
export type StoragePass = RetentionPassResult & { previewToken?: string };

export interface StorageClient {
  report(required: Record<string, never>, optional?: Record<string, never>): Promise<StorageReport>;
  /**
   * The server defaults to a dry run; only `dryRun: false` cleans, and only the given automatic kinds. A dry
   * run answers a single-use `previewToken` pinned to what it measured; a live run must send that token.
   */
  cleanup(required: { dryRun: boolean; classes?: readonly RetentionPolicyKind[]; previewToken?: string }, optional?: Record<string, never>): Promise<StoragePass>;
}

/** The real `request` signature: `basePath` rides in `optional.options`. A narrower hand-written type once put it
 *  beside `init`, where `request` never reads it, and the cast hid that the page was calling `/api/admin/v1/report`. */
type AdminRequest = <T>(required: { path: string }, optional?: { init?: RequestInit; options?: Pick<AuthenticatedAdminRequestOptions, "basePath"> }) => Promise<T>;

/**
 * Builds the client over a host `request`.
 * @complexity O(1) per call.
 */
export function createStorageClient({ request: send }: { request: AdminRequest }, _optional: Record<string, never> = {}): StorageClient {
  const basePath = "/api/admin/storage" as const;
  return {
    report: () => send<StorageReport>({ path: "/report" }, { options: { basePath } }),
    cleanup: ({ dryRun, classes, previewToken }) => send<StoragePass>({ path: "/cleanup" }, {
      options: { basePath },
      init: { method: "POST", body: JSON.stringify({ dryRun, ...(classes === undefined ? {} : { classes }), ...(previewToken === undefined ? {} : { previewToken }) }) },
    }),
  };
}

/** The live client over this admin's `request`. */
export const storageClient: StorageClient = createStorageClient({ request }, {});
