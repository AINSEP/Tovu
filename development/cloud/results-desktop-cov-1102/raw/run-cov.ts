// Runs the REAL desktop coverage gate, but copies each pass's lcov out before the gate deletes its tmp dir.
import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import path from "node:path";
const { runCoverageGate } = await import("/home/user/Tovu/apps/desktop/scripts/check-coverage.ts");
const OUT = "/home/user/Tovu/development/cloud/results-desktop-cov-1102/raw";
process.exitCode = runCoverageGate({
  root: "/home/user/Tovu/apps/desktop",
  spawn: (cmd: string, args: string[], opts: any) => {
    const r = spawnSync(cmd, args, opts);
    const dest = args.find((a) => a.startsWith("--test-reporter-destination=") && a.endsWith(".lcov"));
    if (dest) { const f = dest.split("=")[1]!; try { copyFileSync(f, path.join(OUT, path.basename(f))); } catch (e) { console.error("copy failed", e); } }
    return r;
  },
  out: process.stdout.write.bind(process.stdout),
  err: process.stderr.write.bind(process.stderr),
});
