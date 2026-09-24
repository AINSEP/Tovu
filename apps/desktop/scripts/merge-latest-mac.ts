#!/usr/bin/env node
/**
 * @file The release job's `latest-mac.yml` merge: reads the per-arch manifests the two mac build
 * jobs uploaded, merges them with `src/update-manifest-merge.ts` (which holds every rule and says
 * why this is needed), and writes the one manifest the release carries.
 *
 * Usage: node scripts/merge-latest-mac.ts <out.yml> <in-arm64.yml> <in-x64.yml>
 * Exit codes: 0 = written. 1 = bad arguments, an unreadable input, or a merge the rules refuse.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { mergeMacManifests } from "../src/update-manifest-merge.ts";

/** js-yaml 4 ships no types; this is the slice used. It is the parser electron-updater itself reads
 *  these files with, so what this writes is what the app will parse. */
const yaml = createRequire(import.meta.url)("js-yaml") as {
  load(text: string): unknown;
  dump(value: unknown, options?: { lineWidth?: number }): string;
};

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length < 2) {
  console.error("usage: node scripts/merge-latest-mac.ts <out.yml> <in-arm64.yml> <in-x64.yml>");
  process.exit(1);
}
try {
  const merged = mergeMacManifests(inputs.map((file) => ({ label: file, manifest: yaml.load(readFileSync(file, "utf8")) })));
  writeFileSync(out, yaml.dump(merged, { lineWidth: -1 }));
  console.log(`merge-latest-mac: wrote ${out} (${merged.version}: ${merged.files.map((entry) => entry.url).join(", ")})`);
} catch (error) {
  console.error(`merge-latest-mac: ${(error as Error).message}`);
  process.exit(1);
}
