import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { DiscoveredTheme } from "../../theme/theme.js";
import { exportSite, type ExportSiteRouteDeps } from "../site-exporter.js";

/**
 * @file A421 + A400 export/publish pre-flight, through the real `exportSite` (publish runs this same
 * export, so the warning reaches the publish outcome via the report's `consentWarning` field).
 */

async function runExport(t: test.TestContext, { pageHtml, consentAssets }: { pageHtml: string; consentAssets: readonly string[] }) {
  const outputDir = mkdtempSync(path.join(tmpdir(), "preflight-export-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const themeDir = mkdtempSync(path.join(tmpdir(), "preflight-theme-"));
  t.after(() => rmSync(themeDir, { recursive: true, force: true }));
  const theme: DiscoveredTheme = { manifest: { id: "pre", name: "Pre", version: "1.0.0", tier: "declarative", engine: 1 },
    dir: themeDir, source: "site", status: "valid", errors: [], tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {},
    handlebarsTemplates: {}, pages: {}, partials: {}, css: "" };
  const consent = { regionResolvers: async () => [] as const, exportAssets: async () => consentAssets };
  const createSiteApp: ExportSiteRouteDeps["createSiteApp"] = () => (req, res) => {
    res.statusCode = (req.url ?? "/").includes("tovu-export-404-check") ? 404 : 200;
    res.setHeader("Content-Type", "text/html");
    res.end(pageHtml);
  };
  const deps = { workspaceId: "preflight", themes: [theme], cookieConsent: consent, createSiteApp,
    resolveActiveThemeId: async () => theme.manifest.id, listPublishedPosts: async () => ({ posts: [] }),
    resolveStorefrontProducts: async () => [], redirectRepo: { list: async () => [] },
    clock: { nowIso: () => "2026-11-24T00:00:00Z" }, observability: createNoopObservabilityPort({}),
    originRegistry: { canonicalOrigin: async () => { throw new Error("No public identity"); } },
  } as unknown as ExportSiteRouteDeps;
  return exportSite({ routeDeps: deps, outputDir });
}

const page = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;

test("A421: a published page that still shows the contact-email placeholder warns before export is shared", async t => {
  const report = await runExport(t, { pageHtml: page("<p>Questions? Contact <mark>ADD YOUR CONTACT EMAIL</mark>.</p>"), consentAssets: [] });
  assert.match(report.consentWarning ?? "", /ADD YOUR CONTACT EMAIL/);
  assert.match(report.consentWarning ?? "", /\d+ exported pages? still shows?/);
});

test("A421: a clean page produces no placeholder warning", async t => {
  const report = await runExport(t, { pageHtml: page("<p>Contact hello@example.com</p>"), consentAssets: [] });
  assert.equal(report.consentWarning, undefined);
});

test("A400: authored third-party scripts warn only while consent is configured", async t => {
  const html = page('<script src="https://cdn.tracker.example/pixel.js"></script><script src="/theme-assets/x/own.js"></script><p>hi</p>');
  const configured = await runExport(t, { pageHtml: html, consentAssets: ["/_consent/runtime.js"] });
  assert.match(configured.consentWarning ?? "", /cdn\.tracker\.example/);
  assert.doesNotMatch(configured.consentWarning ?? "", /own\.js/);
  const unconfigured = await runExport(t, { pageHtml: html, consentAssets: [] });
  assert.equal(unconfigured.consentWarning, undefined, "no consent configured, no consent warning");
});

test("A400: a declared consent script and a same-site script do not warn", async t => {
  const html = page('<script data-jini-declared-script src="https://cdn.declared.example/a.js"></script><script src="/local.js"></script>');
  const report = await runExport(t, { pageHtml: html, consentAssets: ["/_consent/runtime.js"] });
  assert.equal(report.consentWarning, undefined);
});
