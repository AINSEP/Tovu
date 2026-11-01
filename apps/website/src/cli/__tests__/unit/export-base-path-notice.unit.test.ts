import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { exportSite } from "#src/features/site-export/site-exporter";
import { runExportCommand, type RunExportCommandOptional } from "../../commands/export.js";

type Boot = Awaited<ReturnType<NonNullable<RunExportCommandOptional["bootSiteDir"]>>>;
const NOTICE = "The base path was ignored because the public URL sets the path.";

for (const [publicUrl, basePath, expectedPath, ignored] of [
  ["https://export.example/docs/", "/requested", "/docs", true],
  ["https://export.example/", "/requested", "", true],
  ["https://export.example/docs/", "", "/docs", true],
  ["https://export.example/docs/", undefined, "/docs", false],
  [undefined, "/requested", "/requested", false],
] as const) {
  test(`export result and CLI explain path precedence (publicUrl=${publicUrl}, basePath=${basePath})`, async t => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "export-path-notice-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));
    // Replace only the socket transport. The actual exporter, origin policy, rewriting, writer
    // and CLI reporting run, so the notice cannot accidentally change the delivered prefix.
    t.mock.method(Server.prototype, "listen", function(this: Server) {
      setImmediate(() => this.emit("listening"));
      return this;
    });
    t.mock.method(Server.prototype, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 43210 }));
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const missing = url.pathname.includes("tovu-export-404-check");
      return new Response('<html><head></head><body><a href="/welcome">Welcome</a></body></html>', {
        status: missing ? 404 : 200, headers: { "content-type": "text/html" },
      });
    });
    const deps = createRouteDeps();
    deps.themes = [];
    deps.resolveActiveThemeId = async () => "none";
    deps.createSiteApp = () => (_req, res) => res.end();
    const warnings: string[] = [];
    t.mock.method(process.stderr, "write", (chunk: unknown) => { warnings.push(String(chunk)); return true; });
    t.mock.method(process.stdout, "write", () => true);
    let report: Awaited<ReturnType<typeof exportSite>> | undefined;
    let closed = false;
    await runExportCommand({ dir: "/tmp/site", out: outputDir, publicUrl, basePath }, {
      registerPluginSdkResolver: () => {},
      bootSiteDir: async () => ({ workspaceId: deps.workspaceId }) as Boot,
      createSiteRouteDeps: async () => deps,
      reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
      closeSiteDirBoot: async () => { closed = true; },
      exportSite: async input => (report = await exportSite({ ...input, includeThemePreviews: false })),
    });
    assert.ok(report);
    assert.equal(closed, true);
    assert.deepEqual(report.routes.failed, []);
    assert.equal(report.basePath ?? "", expectedPath);
    const html = await readFile(path.join(outputDir, "index.html"), "utf8");
    assert.ok(html.includes(`href="${expectedPath}/welcome"`), html);
    assert.equal(report.basePathRewriteWarning?.includes(NOTICE) ?? false, ignored);
    assert.equal(warnings.filter(warning => warning.includes(NOTICE)).length, ignored ? 1 : 0);
    if (expectedPath) assert.ok(report.basePathRewriteWarning?.includes("JavaScript"), "retain the existing rewrite warning");
  });
}
