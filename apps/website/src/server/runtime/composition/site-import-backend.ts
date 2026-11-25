import fs from "node:fs";
import type { ImportHistoryPolicy } from "@jini-ai/core/contracts/site/site-import-history";
import type { SqliteSyncClient } from "@jini-ai/core/contracts/storage";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { ImportHistoryUnavailable } from "@jini-ai/devops/backup/site/import-index/errors";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { bindSiteImportBackfill } from "./site-import-backfill.js";
import { bindSiteImportIndexState } from "./site-import-index-state.js";
import { createDurableJsonFile, createNodeDurableJsonPorts, withFileLock } from "@jini-ai/platform/fs";
import { createSiteImportPayloadFs } from "#src/server/runtime/composition/site-import-payload-fs";
import { join } from "node:path";
import * as yauzl from "yauzl";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import type { ObservabilityPort } from "@jini-ai/core/contracts/observability";
import { createSiteImportBackend } from "#src/features/site-backup/import-backend";
import { type SiteImportBackend } from "@jini-ai/devops/backup/site/import-backend";
import { createShareArchiveReader } from "#src/features/site-backup/import-archive-reader";
import { SiteImportRegistry } from "@jini-ai/devops/backup/site/import-registry";
import type { SiteSavedKeysPort } from "@jini-ai/devops/backup/site/saved-keys-port";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { SITE_IMPORT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { SitesWorkspace } from "#src/platform/site-dir/index";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { createSite } from "./site-dir.js";
import { rebuildImportDatabase, restoreStagedImport } from "./site-portability.js";
import { THEME_PLACEMENT_CHECKS } from "./theme-placement-checks.js";

/**
 * The one wiring of the site importer: the same verifier, sanitizer, guarded download and restore
 * whichever host runs it. A running site serves it over its admin routes (`deps.ts`); `tovu
 * import-local` runs it in a one-shot process for the desktop app, which has no site to ask.
 * Import payloads live in app-data, outside every served/source tree, including app-data DBs.
 * @complexity O(1) composition, no I/O beyond the registry's own directory setup.
 */
export function composeSiteImportBackend(
  required: {
    workspaceId: string;
    workspace: SitesWorkspace;
    savedKeys: Pick<SiteSavedKeysPort, "restore">;
    startSite: (required: { name: string }) => Promise<{ adminUrl: string | null; status: string }>;
  },
  optional: {
    tracker?: Tracker;
    observability?: ObservabilityPort;
    setupBase?: string;
    report?: (required: { importId: string; status: string }) => void;
  } = {},
): SiteImportBackend {
  const { workspace, savedKeys, startSite } = required;
  const directory = join(workspace.config({}).appData, "site-imports", required.workspaceId);
  const clock = { nowMs: () => Date.now() };
  const payloadFs = createSiteImportPayloadFs({});
  const policy: ImportHistoryPolicy = { cutoverPolicy: "rollback", historyVisibleMs: 2_592_000_000, replayFenceMs: 31_536_000_000, legacyRetireMs: 2_592_000_000, sweepOnClockRollback: false };
  const open = ({ file, options }: { file: string; options: { readonly?: boolean; fileMustExist?: boolean } }, _optional: Record<string, never> = {}) => openNativeSqlite(file, options);
  const checkIntegrity = ({ db }: { db: SqliteSyncClient; file: string }, _optional: Record<string, never> = {}) => {
    if (db.pragma("quick_check(1)", { simple: true }) !== "ok") throw new ImportHistoryUnavailable({ code: "IMPORT_HISTORY_DAMAGED", status: 503, message: "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID." });
  };
  // One memo per composed backend: the integrity check runs once per file+db_id for this backend's lifetime, not per open.
  const integrityMemo = createImportIndexIntegrityMemo({});
  const backfill = bindSiteImportBackfill({ directory, fs: payloadFs, clock, policy,
    openCandidate: (_required, _optional = {}) => {
      const file = join(directory, "site-imports.db");
      if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, "wx", 0o600));
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new ImportHistoryUnavailable({ code: "IMPORT_HISTORY_DAMAGED", status: 503, message: "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID." });
      return openImportIndex({ file, open: (file, options) => open({ file, options }), clock, policy, integrityMemo,
        checkIntegrity,
      });
    },
    log: ({ message, counts }, _optional = {}) => console.warn("[site-backup]", message, counts),
  });
  // One policy object drives every authority session, the opener and the backfill, so they never disagree.
  // Fresh scoped handles per resolution: no long-lived client joins the content-store shutdown list.
  const authority = bindSiteImportIndexState({ directory, policy, clock, fs, open, backfill, checkIntegrity,
    log: ({ message }, _optional = {}) => console.warn("[site-backup]", message),
  });
  const registry = new SiteImportRegistry({ directory, history: authority.history, payload: {
    fs: payloadFs, clock, lock: { withFileLock },
    readJsonAt: ({ file }, _optional = {}) => createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath: file, notices: { prefix: "Site imports", lockTimeout: () => "Import registry is busy." } }).read({}),
    writeJsonAt: ({ file, value }, _optional = {}) => createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath: file, notices: { prefix: "Site imports", lockTimeout: () => "Import registry is busy." } }).write({ value }),
  } });
  const args: Parameters<typeof createSiteImportBackend>[0] & { backfill: ReturnType<typeof bindSiteImportBackfill> } = {
    registry, backfill, authority,
    workspace, createSite, startSite,
    restoreStagedImport: (input, options) => restoreStagedImport({ ...input, savedKeys }, options),
    reader: createShareArchiveReader({ yauzl }),
    http: createDefaultHttpClient({ policy: SITE_IMPORT_EGRESS_POLICY }, { observability: optional.observability }),
    sanitize: rebuildImportDatabase,
    schema: runtimeSchemaVersion(),
    themeChecks: THEME_PLACEMENT_CHECKS,
    ...(optional.tracker ? { tracker: optional.tracker } : {}),
    ...(optional.setupBase ? { setupBase: optional.setupBase } : {}),
  };
  return createSiteImportBackend(args, optional.report ? { report: optional.report } : {});
}
