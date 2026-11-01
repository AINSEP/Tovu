import { fork } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildImportDatabase } from "#src/features/site-backup/import-database";
import { IMPORT_REFUSAL_EXIT_CODE } from "#src/features/site-backup/share-policy";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

if (process.argv[2] === "worker") {
  const secret = "sk-proj-" + "a".repeat(64);
  if (process.argv[4] === "crash") throw new Error(`Archive failure ${secret}`);
  if (process.argv[4] === "warning") {
    // Exercise a secret split across writes, controls (also past the truncation point), a long name, and the final unterminated line.
    process.stderr.write(`Warning: ${secret.slice(0, 15)}`);
    await new Promise(resolve => setTimeout(resolve, 10));
    process.stderr.write(`${secret.slice(15)}\u202e\u0000\nObscured: ${secret.slice(0, 20)}\u202e${secret.slice(20)}\nClipped ${"x".repeat(90)} ${secret.slice(0, 20)}\u202e${secret.slice(20)}\nArchive ${"!".repeat(200)}`);
    process.exit(1);
  }
  // Model the trusted worker's already-redacted diagnostic and public refusal separately.
  console.error("Portable schema diagnostic [REDACTED]");
  createConsoleLogger({ prefix: "[site-share]" }).error({ message: "Cannot build portable plugin schema" }, {
    meta: { diagnostic: redactSecretShapes({ text: `SQLITE_ERROR /private/site/content.db token=${secret}` }).text },
  });
  await writeFile(path.join(process.argv[3]!, "refusal.txt"), "Cannot build portable plugin schema.");
  process.exit(IMPORT_REFUSAL_EXIT_CODE);
} else {
  try {
    await rebuildImportDatabase({ snapshot: Buffer.from("input"), moduleUrl: import.meta.url }, {
      statfs: async () => ({ bavail: 1024 * 1024, bsize: 4096 }),
      fork: (_module, args, options) => fork(fileURLToPath(import.meta.url), ["worker", args[0]!, process.argv[2] ?? "diagnostic"], options),
    });
  } catch (error) {
    console.log((error as Error).message);
  }
}
