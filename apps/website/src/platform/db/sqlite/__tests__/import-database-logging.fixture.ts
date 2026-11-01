import { fork } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildImportDatabase } from "#src/features/site-backup/import-database";
import { IMPORT_REFUSAL_EXIT_CODE } from "#src/features/site-backup/share-policy";

if (process.argv[2] === "worker") {
  // Model the trusted worker's already-redacted diagnostic and public refusal separately.
  console.error("Portable schema diagnostic [REDACTED]");
  await writeFile(path.join(process.argv[3]!, "refusal.txt"), "Cannot build portable plugin schema.");
  process.exit(IMPORT_REFUSAL_EXIT_CODE);
} else {
  try {
    await rebuildImportDatabase({ snapshot: Buffer.from("input"), moduleUrl: import.meta.url }, {
      statfs: async () => ({ bavail: 1024 * 1024, bsize: 4096 }),
      fork: (_module, args, options) => fork(fileURLToPath(import.meta.url), ["worker", args[0]!], options),
    });
  } catch (error) {
    console.log((error as Error).message);
  }
}
