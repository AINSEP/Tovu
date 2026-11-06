import { join } from "node:path";
import * as yauzl from "yauzl";
import type { ObservabilityPort, Tracker } from "@jini-ai/diagnostics/observability";
import { createSiteImportBackend, type SiteImportBackend } from "#src/features/site-backup/import-backend";
import { createShareArchiveReader } from "#src/features/site-backup/import-archive-reader";
import { SiteImportRegistry } from "#src/features/site-backup/import-registry";
import type { SiteSavedKeysPort } from "#src/features/site-backup/saved-keys-port";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { SITE_IMPORT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { SitesWorkspace } from "#src/platform/site-dir/index";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { createSite } from "./site-dir.js";
import { rebuildImportDatabase, restoreStagedImport } from "./site-portability.js";

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
  return createSiteImportBackend({
    registry: new SiteImportRegistry({ directory: join(workspace.config({}).appData, "site-imports", required.workspaceId) }),
    workspace, createSite, startSite,
    restoreStagedImport: (input, options) => restoreStagedImport({ ...input, savedKeys }, options),
    reader: createShareArchiveReader({ yauzl }),
    http: createDefaultHttpClient(SITE_IMPORT_EGRESS_POLICY, { observability: optional.observability }),
    sanitize: rebuildImportDatabase,
    schema: runtimeSchemaVersion(),
    ...(optional.tracker ? { tracker: optional.tracker } : {}),
    ...(optional.setupBase ? { setupBase: optional.setupBase } : {}),
  }, optional.report ? { report: optional.report } : {});
}
