/** Hard-kill at real lifecycle boundaries: bypass catch/finally to test durable recovery. */
import fs from "node:fs";
import path from "node:path";
import { createSitesWorkspace } from "../../../platform/site-dir/sites-home.js";
import { createSite } from "#src/server/runtime/composition/site-dir";
import { rebuildImportDatabase, restoreStagedImport } from "#src/server/runtime/composition/site-portability";
import { runtimeSchemaVersion } from "../../../platform/site-dir/schema-guard.js";
import { createSiteImportBackend } from "../import-backend.js";
import { SiteImportRegistry } from "../import-registry.js";
import { createShareArchiveReader } from "../import-archive-reader.js";
import * as yauzl from "yauzl";
const [root, importId, boundary] = process.argv.slice(2) as [string, string, string];
const options = { homeDir: root, cwd: root, appDataDir: path.join(root, "profile"), env: { TOVU_SITES_HOME: path.join(root, "sites") } };
const workspace = createSitesWorkspace({}, options);
const registry = new SiteImportRegistry({ directory: path.join(root, "private") });
const die = () => {
  fs.writeFileSync(path.join(root, "interruption.json"), JSON.stringify(registry.get({ importId, principalId: "recipient" })));
  process.kill(process.pid, "SIGKILL");
};
const backend = createSiteImportBackend({ registry, workspace, createSite, restoreStagedImport, reader: createShareArchiveReader({ yauzl }), sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion(), creationOptions: options,
  http: { send: async () => { throw new Error("unexpected download"); } }, startSite: async () => { throw new Error("must stop before supervisor"); },
}, { createSite: async (input, creation) => {
  const result = await createSite(input, { ...creation,
    onAllocated: allocation => { creation?.onAllocated?.(allocation); if (boundary === "allocated") die(); },
    beforeRegister: result => { creation?.beforeRegister?.(result); if (boundary === "before-register") die(); },
    verifiedRestore: { ...creation!.verifiedRestore!, restore: async allocation => {
      await creation!.verifiedRestore!.restore(allocation);
      if (boundary === "restored") die();
    } },
  });
  if (boundary === "registered") die();
  return result;
} });
await backend.completeOwner({ importId, principalId: "recipient", adminPassword: "recipient-only-password" });
throw new Error("interruption boundary was not reached");
