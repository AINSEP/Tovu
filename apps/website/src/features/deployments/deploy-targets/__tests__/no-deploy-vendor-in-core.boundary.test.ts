import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";

import { BASELINE_PATH, type Counts, countDeployVendors, scanDeployVendors, sortedCounts } from "./deploy-vendor-scan.js";

/**
 * @file Ratchet: no NEW static-hosting vendor names in core (deploy plan T7, the boundary that
 * proves the `deploy` Agent Plugin absorbed every vendor branch).
 *
 * The files that still name Netlify, Vercel, Cloudflare, GitHub Pages or an S3-compatible host
 * today are listed in `deploy-vendor-baseline.json` with a count per vendor. T7 (open the ids) and
 * T8 (delete the legacy branches) shrink it to `{}`. The baseline may only SHRINK:
 *
 * - a file or vendor not in the baseline, or a count above it → fails (put the knowledge in the
 *   plugin's module or descriptor, and read it through `deploy-targets/registry.ts`);
 * - a count below it → fails until the baseline is lowered, so the gain is locked in. Lower it with
 *   `UPDATE_DEPLOY_VENDOR_BASELINE=1` on this test; that run writes only lowered counts and still
 *   fails on anything that grew.
 *
 * Matching runs with every comment blanked out, so prose naming a vendor as an example cannot count.
 */

test("comment stripping: vendor names in prose never count; ids, hosts and origins in code do", () => {
  const source = [
    "// deploys to Netlify or Vercel",
    "/** e.g. `cloudflare-pages`, owner.github.io */",
    'const id = "github-pages"; /* s3-compatible */',
    'const url = "https://api.vercel.com/v2/user"; // netlify',
    'const host = "demo.pages.dev" + ".s3.amazonaws.com";',
  ].join("\n");
  assert.deepEqual(countDeployVendors(stripComments("probe.ts", source)), { "github-pages": 1, vercel: 1, cloudflare: 1, "s3-compatible": 1 });
});

test("no new deploy-vendor names in core (ratchet: the baseline only shrinks)", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Counts;
  const current = scanDeployVendors();
  const grew: string[] = [];
  const shrank: string[] = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(counts)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      if (count > allowed) grew.push(`${file}: ${rule} ${allowed} -> ${count}`);
    }
  }
  for (const [file, counts] of Object.entries(baseline)) {
    for (const [rule, count] of Object.entries(counts)) {
      const now = current[file]?.[rule] ?? 0;
      if (now < count) shrank.push(`${file}: ${rule} ${count} -> ${now}`);
    }
  }
  if (process.env.UPDATE_DEPLOY_VENDOR_BASELINE === "1" && grew.length === 0 && shrank.length > 0) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(sortedCounts(current), null, 2)}\n`);
    shrank.length = 0;
  }
  assert.deepEqual(grew, [], "New hosting-vendor names in core. Put them in the deploy Agent Plugin and read them through the deploy-target registry.");
  assert.deepEqual(shrank, [], "Vendor names went down — lock it in: rerun this test with UPDATE_DEPLOY_VENDOR_BASELINE=1 and commit the baseline.");
});
