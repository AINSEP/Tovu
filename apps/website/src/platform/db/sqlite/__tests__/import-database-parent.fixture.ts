/** A parent with a staged database and a pending helper, so tests can interrupt the parent itself. */
import { EventEmitter } from "node:events";
import { rebuildImportDatabase } from "#src/features/site-backup/import-database";

await rebuildImportDatabase({ snapshot: Buffer.from("staged database"), moduleUrl: import.meta.url }, {
  statfs: async () => ({ bavail: 1024 * 1024, bsize: 4096 }),
  fork: (_helper, args) => {
    process.send?.({ root: args[0] });
    return Object.assign(new EventEmitter(), { kill: () => true });
  },
});
