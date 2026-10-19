/** Simulate interruption while the sanitizer owns nested temporary snapshots. Never exits itself. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const projection = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-share-projection-"));
fs.mkdirSync(path.join(projection, "nested"));
fs.writeFileSync(path.join(projection, "nested", "private.db"), "private source snapshot");
process.send!({ projection, env: { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP } });
setInterval(() => {}, 1000);
