import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { runExportCommand, type RunExportCommandOptional } from "../../commands/export.js";
import { createProgram } from "../../program.js";
import { createRouteDeps } from "#src/server/runtime/composition/app";

type Boot = Awaited<ReturnType<NonNullable<RunExportCommandOptional["bootSiteDir"]>>>;
type Deps = Awaited<ReturnType<NonNullable<RunExportCommandOptional["createSiteRouteDeps"]>>>;

test("the export CLI parses --public-url as the optional destination", () => {
  const command = createProgram().commands.find(command => command.name() === "export")!;
  const publicUrl = "https://export.example/docs/";
  assert.deepEqual(command.parseOptions(["--public-url", publicUrl]).unknown, []);
  assert.equal(command.opts().publicUrl, publicUrl);
});

for (const publicUrl of [undefined, "https://export.example/docs/"]) {
  test(`export forwards the optional public destination (${publicUrl ?? "omitted"}) to the export owner`, async t => {
    t.mock.method(process.stdout, "write", () => true);
    let exported = false, closed = false;
    await runExportCommand({ dir: "/tmp/site", publicUrl }, {
      registerPluginSdkResolver: () => {},
      bootSiteDir: async () => ({ workspaceId: "ws" }) as Boot,
      createSiteRouteDeps: async () => ({ workspaceId: "ws", exportOutputRootDir: "/tmp/export" }) as Deps,
      reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
      closeSiteDirBoot: async () => { closed = true; },
      exportSite: async input => {
        assert.equal(input.publicUrl, publicUrl);
        exported = true;
        return { outputDir: input.outputDir, routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] },
          skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
      },
    });
    assert.equal(exported, true);
    assert.equal(closed, true);
  });
}

for (const publicUrl of ["http://export.example", "https://localhost", "https://127.0.0.1", "https://user@export.example", "https://export.example/?x=1", "https://export.example/#fragment"]) {
  test(`export applies the admin export owner's public-origin policy to ${publicUrl}`, async () => {
    const deps = createRouteDeps();
    deps.themes = [];
    deps.resolveActiveThemeId = async () => "none";
    deps.createSiteApp = () => assert.fail("invalid public URLs must be rejected before crawling");
    let closed = false;
    await assert.rejects(runExportCommand({ dir: "/tmp/site", publicUrl }, {
      registerPluginSdkResolver: () => {},
      bootSiteDir: async () => ({ workspaceId: deps.workspaceId }) as Boot,
      createSiteRouteDeps: async () => deps,
      reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
      closeSiteDirBoot: async () => { closed = true; },
    }), { message: "The public URL must be a public HTTPS address." });
    assert.equal(closed, true);
  });
}
