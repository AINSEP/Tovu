import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";
import {
  SCAN_ROOTS, countVendors, judgeVendorCounts, listSourceFiles, loadVendorPolicy,
  loadVendorRules, scanVendorSources, validateOutsideScan,
  type VendorException, type VendorPolicy,
} from "./vendor-scan.js";

/**
 * @file Vendor extraction phase 11: PLAN.md as amended by coordinator REVIEW.md (2026-10-22).
 * One scanner, one reasoned pattern policy, no automatic approval. Increased totals fail;
 * reductions demand lowering/removing the exception. No update mode can grant new allowances.
 * Matching blanks comments using the existing TypeScript parser and retains strings/templates.
 */
const policy = loadVendorPolicy({});
const rules = loadVendorRules(policy);
const count = (text: string) => countVendors({ text, rules });
const exception: VendorException = { vendor: "fly", path: "apps/website/src/contracts/core/host-signals.ts", count: 6, reason: "Core owns baseline protections." };

function fixture(t: test.TestContext): { repoRoot: string; write: (file: string, text: string) => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-boundary-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(repoRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, file), text);
  };
  return { repoRoot, write };
}

test("full website/admin roots include contracts; desktop scope remains the existing two files", () => {
  assert.deepEqual(SCAN_ROOTS, ["apps/website/src/", "apps/admin/src/", "apps/desktop/src/desktop-agent.ts", "apps/desktop/src/desktop-host-signals.ts"]);
  const website = listSourceFiles({ entry: SCAN_ROOTS[0]! });
  assert.ok(website.some(file => file.endsWith("/contracts/core/host-signals.ts")));
  for (const entry of SCAN_ROOTS) assert.ok(listSourceFiles({ entry }).length > 0, entry);
});

test("traversal preserves exclusions, supports TS variants and scans overlapping roots once", t => {
  const { repoRoot, write } = fixture(t);
  const base = "apps/website/src/";
  for (const file of ["a.ts", "b.tsx", "c.mts", "d.cts", "sub/e.ts"]) write(base + file, 'const vendor = "fly";');
  for (const file of ["a.test.ts", "b.spec.tsx", "c.test.mts", "d.d.cts", "types.d.ts", "a.json",
    "__tests__/x.ts", "__fixtures__/x.ts", "node_modules/x.ts", "dist/x.ts"]) write(base + file, 'const vendor = "fly";');
  const reads: string[] = [];
  const counts = scanVendorSources({ rules }, { repoRoot, io: fs, roots: [base, base + "sub/", base + "a.ts"], strip: (file, text) => {
    reads.push(file);
    return stripComments(file, text);
  } });
  assert.equal(reads.length, 5);
  assert.equal(new Set(reads).size, 5);
  assert.deepEqual(Object.values(counts), Array.from({ length: 5 }, () => ({ fly: 1 })));
  assert.throws(() => scanVendorSources({ rules }, { repoRoot, roots: [base + "missing/"] }), /missing or empty/);
  write(base + "empty/readme.txt", "empty");
  assert.throws(() => scanVendorSources({ rules }, { repoRoot, roots: [base + "empty/"] }), /missing or empty/);
});

test("comments never count; executable strings, template substitutions and TSX do", () => {
  const source = [
    "// Netlify Vercel", "/** cloudflare-pages owner.github.io */",
    'const id = "github-pages"; /* s3-compatible */',
    'const url = "https://api.vercel.com/v2/user"; // netlify',
    'const host = "demo.pages.dev" + ".s3.amazonaws.com";',
  ].join("\n");
  assert.deepEqual(count(stripComments("probe.ts", source)), { cloudflare: 1, github: 1, "github-pages": 1, "s3-compatible": 1, vercel: 1 });
  assert.deepEqual(count(stripComments("probe.tsx", '<div>{/* netlify */}{`vercel ${"cloudflare"}`}</div>')), { cloudflare: 1, vercel: 1 });
  assert.deepEqual(count(stripComments("probe.ts", 'const url = `https://api.vercel.com`; // cloudflare')), { vercel: 1 });
});

test("the raw pre-filter cannot hide comment-separated provider or environment syntax", t => {
  const { repoRoot, write } = fixture(t);
  write("apps/website/src/probe.ts", 'const provider /* note */ = "render"; const key = process.env /* note */ .RENDER_OTHER;');
  assert.deepEqual(scanVendorSources({ rules }, { repoRoot, roots: ["apps/website/src/"] }), {
    "apps/website/src/probe.ts": { render: 2 },
  });
});

test("manifest canonical IDs and literal aliases do not depend on plugin activation", t => {
  const { repoRoot, write } = fixture(t);
  write("content/agent-plugins/vendor/plugin.json", JSON.stringify({ name: "probe-vendor", extensions: { tovu: { vendorAliases: ["probe.example", "[literal]+", "probe.example/api"] } } }));
  const fixtureRules = loadVendorRules({ vocabulary: {} }, { repoRoot, io: fs });
  assert.deepEqual(countVendors({ text: '"probe-vendor probe.example/api [literal]+ probeXexample"', rules: fixtureRules }), { "probe-vendor": 3 });
  for (const vendorAliases of [null, "regex", [""], [7]]) {
    write("content/agent-plugins/vendor/plugin.json", JSON.stringify({ name: "probe-vendor", extensions: { tovu: { vendorAliases } } }));
    assert.throws(() => loadVendorRules({ vocabulary: {} }, { repoRoot }), /vendorAliases/);
  }
  write("content/agent-plugins/vendor/plugin.json", JSON.stringify({ name: "probe-vendor" }));
  assert.equal(loadVendorRules({ vocabulary: {} }, { repoRoot }).length, 1);
  assert.throws(() => loadVendorRules({ vocabulary: { "probe-vendor": [] } }, { repoRoot }), /duplicates plugin/);
  write("content/agent-plugins/duplicate/plugin.json", JSON.stringify({ name: "probe-vendor" }));
  assert.throws(() => loadVendorRules({ vocabulary: {} }, { repoRoot }), /Duplicate plugin name/);
});

test("deploy hosts, source-control IDs and dormant deployment symbols retain detection everywhere", () => {
  assert.deepEqual(count("env.FLY_APP_NAME || env.FLY_MACHINE_ID || env.FLY_ALLOC_ID"), { fly: 3 });
  for (const text of ["fly.io flyctl fly.toml machines.dev flyv1", "railway netlify vercel", "pages.dev workers.dev", "github_pages github pages githubpages github.io", "s3-compatible amazonaws backblaze wasabi digitaloceanspaces"]) {
    assert.ok(Object.keys(count(text)).length > 0, text);
  }
  assert.deepEqual(count('const providerId = "gitlab"; const peer = "bitbucket";'), { bitbucket: 1, gitlab: 1 });
  assert.deepEqual(count("createGitHubDeploymentProvider()"), { "github-deployment": 1 });
  assert.deepEqual(count("GITHUB_DEPLOYMENT_PROVIDER_ID mapGitHubDeploymentStatus"), { "github-deployment": 2 });
  assert.deepEqual(count("butterfly flying flyout"), {});
});

test("vendor words respect identifier boundaries and ordinary replicate prose without path exceptions", () => {
  assert.deepEqual(count("refusingMailer googleHelper mygithub $gmail gmail$ _gmail gmail_ gmail2 égoogle googleé"), {});
  assert.deepEqual(count("copy duplicate clone replicate reuse"), {});
  assert.deepEqual(count('"gmail" "google" "github"'), { "google-workspace": 1, google: 1, github: 1 });
  assert.deepEqual(count("Replicate replicate.com"), { replicate: 2 });
  assert.deepEqual(count('const provider = "replicate"; process.env.REPLICATE_API_TOKEN'), { replicate: 2 });
  assert.deepEqual(count("Googlebot googlebot googleusercontent.com"), { google: 3 });
  assert.deepEqual(count("github_pat_example github_pat_"), { github: 2 });
  assert.deepEqual(count("prefixgithub_pat_example prefixFLY_APP_NAME"), {});
});

test("Render React/rendering terminology and the ordinary resend verb stay allowed", () => {
  assert.deepEqual(count('render(); const rendering = "Render the page"; const action = "resend"; const label = "Resend sign-in link"; const tool = RENDER_UI_TOOL_ID; const ctx = RENDER_CTX_KEY;'), {});
  for (const text of ['const provider = "render";', 'const provider = "RENDER";', 'const config = { "provider": "render" };', "RENDER_API_KEY", "process.env.RENDER_UNKNOWN_SETTING", "render.com render.yaml onrender.com"]) {
    assert.ok(count(text).render, text);
  }
});

test("unified mail rules preserve branded names, domains, old adapter, selections and secrets", () => {
  for (const text of ['const driver = "resend";', "RESEND_API_KEY", 'const driver = "SENDGRID";', "Resend postmarkapp.com SendGrid mailgun.net", "HttpApiMailerAdapter"]) {
    assert.ok(Object.keys(count(text)).length > 0, text);
  }
  assert.deepEqual(count(stripComments("probe.ts", '// resend RESEND_API_KEY\nconst driver = "smtp";')), {});
  assert.deepEqual(count('const provider = "Resend";'), { resend: 1 });
  assert.deepEqual(count("resend.com"), { resend: 1 });
});

test("exception validation rejects invalid reasons, vendors, paths, counts and duplicate keys", () => {
  for (const invalid of [{ reason: " " }, { vendor: "unknown" }, { path: "/tmp/x.ts" }, { path: "apps/../x.ts" }, { path: "apps\\x.ts" }, { count: 0 }, { count: -1 }, { count: 1.5 }]) {
    assert.throws(() => judgeVendorCounts({ counts: {}, rules, exceptions: [{ ...exception, ...invalid }] }), TypeError);
  }
  assert.throws(() => judgeVendorCounts({ counts: {}, rules, exceptions: [exception, exception] }), /Duplicate/);
  const missing = { ...exception, path: "apps/website/src/missing.ts" };
  assert.equal(judgeVendorCounts({ counts: {}, rules, exceptions: [missing] }).stale.length, 1);
});

test("pattern totals ratchet across files; increased, reduced, new and overlapping allowances fail", () => {
  const pattern = { ...exception, path: "apps/website/src/contracts/core/*.ts" };
  const first = "apps/website/src/contracts/core/first.ts";
  const second = "apps/website/src/contracts/core/second.ts";
  const counts = { [first]: { fly: 2 }, [second]: { fly: 4 } };
  assert.deepEqual(judgeVendorCounts({ counts, rules, exceptions: [pattern] }), { uncovered: [], stale: [] });
  assert.deepEqual(counts, { [first]: { fly: 2 }, [second]: { fly: 4 } }, "policy evaluation does not mutate scan results");
  assert.equal(judgeVendorCounts({ counts: { [first]: { fly: 7 } }, rules, exceptions: [pattern] }).uncovered.length, 1);
  assert.equal(judgeVendorCounts({ counts: { [first]: { fly: 5 } }, rules, exceptions: [pattern] }).stale.length, 1);
  const lowered = { ...pattern, count: 5 };
  assert.deepEqual(judgeVendorCounts({ counts: { [first]: { fly: 5 } }, rules, exceptions: [lowered] }), { uncovered: [], stale: [] });
  assert.equal(judgeVendorCounts({ counts: { "apps/admin/src/new.ts": { fly: 1 } }, rules, exceptions: [] }).uncovered.length, 1);
  assert.equal(judgeVendorCounts({ counts: { [first]: { vercel: 1 } }, rules, exceptions: [pattern] }).uncovered.length, 1);
  assert.throws(() => judgeVendorCounts({ counts: { [exception.path]: { fly: 6 } }, rules, exceptions: [pattern, exception] }), /Overlapping/);
});

test("malformed policy data and supplemental vendor declarations fail closed", t => {
  const { repoRoot, write } = fixture(t);
  const file = path.join(repoRoot, "policy.json");
  for (const invalid of [{ vocabulary: null, exceptions: [], outsideScan: [] }, { vocabulary: [], exceptions: [], outsideScan: [] }, { vocabulary: {}, exceptions: {}, outsideScan: [] }]) {
    write("policy.json", JSON.stringify(invalid));
    assert.throws(() => loadVendorPolicy({ file }), /Invalid vendor/);
  }
  write("content/agent-plugins/probe/plugin.json", JSON.stringify({ name: "probe" }));
  assert.throws(() => loadVendorRules({ vocabulary: { "*": [] } }, { repoRoot }), /Invalid supplemental vendor/);
  assert.throws(() => loadVendorRules({ vocabulary: { other: [""] } }, { repoRoot }), /vendorAliases/);
});

test("outside-scan release infrastructure is documented and never treated as a source allowance", t => {
  const { repoRoot, write } = fixture(t);
  write("apps/desktop/electron-builder.yml", "publish: github");
  const outside = { vendor: "github", path: "apps/desktop/electron-builder.yml", reason: "Release infrastructure, outside source scope." };
  const fixturePolicy: VendorPolicy = { vocabulary: {}, exceptions: [], outsideScan: [outside] };
  assert.doesNotThrow(() => validateOutsideScan({ policy: fixturePolicy, rules }, { repoRoot }));
  assert.throws(() => validateOutsideScan({ policy: { ...fixturePolicy, outsideScan: [outside, outside] }, rules }, { repoRoot }), /Invalid outside-scan/);
  fs.rmSync(path.join(repoRoot, outside.path));
  assert.throws(() => validateOutsideScan({ policy: fixturePolicy, rules }, { repoRoot }), /Missing release/);
});

test("tool search metadata has no hosting product names; plugin manifests own vendor search words", async () => {
  const { toolMetadata } = await import("#src/contracts/core/tool-metadata/deployments");
  const text = JSON.stringify(Object.values(toolMetadata).map(entry => entry.search ?? {}));
  assert.deepEqual(count(text), {});
  assert.doesNotMatch(text, /\bworkers\b/i);
});

test("real core tree has only reviewed pattern exceptions, each with its exact current total", () => {
  validateOutsideScan({ policy, rules });
  const counts = scanVendorSources({ rules });
  const result = judgeVendorCounts({ counts, rules, exceptions: policy.exceptions });
  assert.deepEqual(result.uncovered, [], "Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs:");
  assert.deepEqual(result.stale, [], "Lower or remove stale pattern counts in vendor-exceptions.json; approval is always manual.");
});
