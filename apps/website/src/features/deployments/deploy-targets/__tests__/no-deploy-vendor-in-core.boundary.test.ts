import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";

import { BASELINE_PATH, type Counts, countDeployVendors, DEPLOY_VENDOR_ALLOWLIST, VENDOR_OWNER_ALLOWLIST, SCAN_ROOTS, listSourceFiles, scanDeployVendors, scanDeployVendorsRaw, sortedCounts } from "./deploy-vendor-scan.js";

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
  assert.deepEqual(countDeployVendors(stripComments("probe.ts", source)), { "source-control": 1, "github-pages": 1, vercel: 1, cloudflare: 1, "s3-compatible": 1 });
});

test("no new deploy-vendor names in core (ratchet: the baseline only shrinks)", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Counts;
  let scanned = 0;
  for (const root of SCAN_ROOTS) {
    const files = listSourceFiles(root);
    assert.ok(files.length > 0, `scan root missing or empty: ${root}`);
    scanned += files.length;
  }
  assert.ok(scanned > 0);
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

test("every allowlist entry still matches its file exactly and gives a reason", () => {
  const raw = scanDeployVendorsRaw();
  const stale = DEPLOY_VENDOR_ALLOWLIST.filter((entry) => entry.reason.trim() === "" || (raw[entry.file]?.[entry.rule] ?? 0) < entry.count).map(
    (entry) => `${entry.file}: ${entry.rule} allowlists ${entry.count}, file has ${raw[entry.file]?.[entry.rule] ?? 0}`,
  );
  assert.deepEqual(stale, [], "An allowlist entry outlived its hits. Lower or remove it in deploy-vendor-scan.ts.");
});

test('owner-approved content and model exceptions name existing paths and their retained behavior', () => {
  for (const entry of VENDOR_OWNER_ALLOWLIST) {
    assert.ok(entry.reason.startsWith('Owner decision, 2026-10-22:'));
    assert.ok(entry.vendors.length > 0);
    for (const file of entry.paths) assert.equal(listSourceFiles(file).length, 1, file);
  }
});

test("tool search metadata scan covers the deployments tools, which carry no hosting product names at all", async () => {
  assert.ok(SCAN_ROOTS.includes("apps/website/src/contracts/core/tool-metadata/"));
  const { toolMetadata } = await import("#src/contracts/core/tool-metadata/deployments");
  const text = JSON.stringify(Object.values(toolMetadata).map((entry) => entry.search ?? {}));
  assert.deepEqual(countDeployVendors(text), {}, "Vendor words belong in the hosting plugin's manifest keywords, which plugin discovery indexes.");
  // "Workers" is a hosting product here, unlike "pages", which CMS pages legitimately use.
  assert.doesNotMatch(text, /\bworkers\b/i);
});

test("the extracted declaration consumers remain inside the vendor boundary", () => {
  for (const file of [
    "apps/website/src/contracts/core/host-signals.ts",
    "apps/website/src/contracts/core/assistant-native-fallbacks.ts",
    "apps/website/src/contracts/core/agent-permission-mode.ts",
    "apps/website/src/features/agent-plugins/host-signals.ts",
    "apps/website/src/features/plugin-runtime/install.ts",
    "apps/website/src/server/inbound/shared/trust-proxy.ts",
    "apps/website/src/server/runtime/boot/boot-readiness-warnings.ts",
    "apps/website/src/server/inbound/assistant/agent-daemon-server.ts",
    "apps/website/src/server/inbound/admin-http/routes/system/assistant-subagents.ts",
    "apps/desktop/src/desktop-agent.ts",
    "apps/desktop/src/desktop-host-signals.ts",
  ]) assert.ok(SCAN_ROOTS.includes(file), file);
  assert.deepEqual(countDeployVendors('env.FLY_APP_NAME || env.FLY_MACHINE_ID || env.FLY_ALLOC_ID'), { fly: 3 });
  assert.ok(SCAN_ROOTS.includes("apps/website/src/features/publish-trust/"));
  assert.ok(SCAN_ROOTS.includes("apps/website/src/features/object-storage/"));
  assert.ok(SCAN_ROOTS.includes("apps/website/src/features/site-backup/share-hosting.ts"));
  assert.ok(SCAN_ROOTS.includes("apps/website/src/server/runtime/composition/domain-dns-adapters.ts"));
  assert.deepEqual(countDeployVendors('const provider = createGitHubDeploymentProvider();'), { "source-control": 1, "github-deployment": 1 });
});

// This extends the deployed boundary; source-control does not get a parallel scanner.
test('source-control declarations, core consumers and admin forms remain vendor-free', () => {
  for (const root of ['apps/website/src/features/source-control/', 'apps/admin/src/features/source-control/',
    'apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts']) assert.ok(SCAN_ROOTS.includes(root));
  assert.deepEqual(countDeployVendors('const providerId = "gitlab"; const peer = "bitbucket";', { file: 'apps/website/src/features/source-control/store.ts' }), { 'source-control': 2 });
  assert.deepEqual(countDeployVendors('const providerId = "github";', { file: 'apps/website/src/other-phase.ts' }), {});
  const current = scanDeployVendors();
  assert.deepEqual(Object.entries(current).filter(([file]) => file.includes('/source-control/')), []);
});
