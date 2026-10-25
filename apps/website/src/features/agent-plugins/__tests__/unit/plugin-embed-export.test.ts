/** OPUS-REVIEW T1: real HTTP static exporter, asset route, base-path rewriting and fallback. */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { embedMarkerSnippetFromConfig } from "@jini-ai/cms/widgets/markers";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { exportSite } from "#src/features/site-export/site-exporter";
import { createPost } from "#src/features/post/index";
import { createPluginExportRuntime } from "../../exports/runtime.js";
import { createPluginExportSource, pluginExportFileUrl } from "../../exports/source.js";
import { config, definition, template } from "../fixtures/plugin-exports.js";

const png = Buffer.from([137, 80, 78, 71, 255]);

test("T1: static snapshot ships fallback + deduplicated CSS/artwork, no marker/start link, with base paths", async t => {
  const deps = createRouteDeps();
  const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-plugin-export-"));
  t.after(() => rmSync(outputDir, { force: true, recursive: true }));
  const packageRoot = mkdtempSync(path.join(tmpdir(), "tovu-plugin-package-"));
  t.after(() => rmSync(packageRoot, { force: true, recursive: true }));
  const plugin = { pluginId: "demo", packageRoot };
  const manifest = { name: "demo", extensions: { tovu: { id: "tovu/demo", provides: ["member-login:demo"],
    exports: { button: { ...definition, staticExport: "fallback-only" } } } } };
  const files = new Map([["plugin.json", JSON.stringify(manifest)], ["components/button.html", template], ["components/button.css", "@layer plugin-exports { .plugin-demo-button { color: var(--plugin-signin-fg); } }"], ["components/mark.png", png.toString("base64")]]);
  // This test exercises the real declared-file route. Its lifecycle seam supplies contained data,
  // preserving the production UTF-8 contract; binary PNG containment/read has a separate route pin.
  deps.agentPluginLifecycle = { ...deps.agentPluginLifecycle,
    findTrustedPluginPackages: async () => [{ trusted: plugin }],
    readTrustedPluginFile: async (_plugin, filename) => { const value = files.get(filename); assert.ok(value); return value; } };
  const source = createPluginExportSource({ lifecycle: deps.agentPluginLifecycle });
  // PNG bytes use the lifecycle containment owner against this real temporary package file.
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(path.join(packageRoot, "components"));
  writeFileSync(path.join(packageRoot, "components/mark.png"), png);
  const runtime = createPluginExportRuntime({ workspaceId: deps.workspaceId, source, listProviders: async () => [] });
  deps.pluginExports = runtime;
  await createPost({ deps: { repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: "plugin-page", slug: "plugin-page", title: "Embed", kind: "page", status: "published" } });
  const snippet = embedMarkerSnippetFromConfig({ config }).replace('></div>', '><p class="fallback">Login unavailable offline</p></div>');
  const store = deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: "plugin-page" });
  await store.ensureHtmlFormat(`<main>${snippet}${snippet}</main>`);
  const report = await exportSite({ routeDeps: deps, outputDir, basePath: "/snapshot" });
  assert.ok(report.routes.succeeded.some(route => route.path === "/plugin-page"));
  const html = readFileSync(path.join(outputDir, "plugin-page/index.html"), "utf8");
  assert.match(html, /Login unavailable offline/);
  assert.doesNotMatch(html, /data-embed-config|\/oidc\/demo\/start/);
  assert.equal((html.match(/components\/button.css/g) ?? []).length, 1);
  assert.match(html, /\/snapshot\/api\/agent-plugin-exports\/v1\/demo\/button\/components\/mark.png/);
  const asset = (filename: string) => pluginExportFileUrl({ pluginId: "demo", component: "button", filename }).slice(1);
  assert.match(readFileSync(path.join(outputDir, asset("components/button.css")), "utf8"), /@layer plugin-exports/);
  assert.deepEqual(readFileSync(path.join(outputDir, asset("components/mark.png"))), png);
});
