import { SiteImportRegistry as JiniSiteImportRegistry } from "@jini-ai/devops/backup/site/import-registry";
import { createDurableJsonFile, createNodeDurableJsonPorts, withFileLock } from "@jini-ai/platform/fs";

/** @file Binds Jini's site import registry to this host's node durable-JSON files and file lock. */

/** The registry with this host's filesystem implementation bound; construct it as `new SiteImportRegistry({ directory }, { log })`. */
export class SiteImportRegistry extends JiniSiteImportRegistry {
  constructor(required: { directory: string }, options: { log?: (line: string, error: unknown) => void } = {}) {
    super({ directory: required.directory, durable: {
      openJsonFile: ({ filePath, notices }) => createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath, notices }),
      withFileLock,
    } }, options);
  }
}
