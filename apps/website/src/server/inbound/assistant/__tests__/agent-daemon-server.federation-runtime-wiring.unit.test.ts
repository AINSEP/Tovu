import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

/**
 * @file Wiring proof for S3 of `ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md`
 * (the daemon adopts the shared federation runtime). Reads the SOURCE of `agent-daemon-server.ts`
 * rather than importing it, same reason as `agent-daemon-server.tool-restriction-wiring.unit.test.ts`
 * next to this file (importing it opens a real SQLite connection and binds a real port).
 *
 * Each assertion guards one fact the runtime's own unit tests cannot see: that the daemon actually
 * reads the runtime for the prompt prefix and the refusal diagnosis, awaits the installed-extension
 * registration before the federation boot pass, and cannot reach `onAdmitted`'s `liveToolCatalog`
 * before that `const` exists (a reload route mounted above it would be a TDZ ReferenceError on the
 * first reload that admits something).
 */

const SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

function indexOfOrFail(needle: string, from = 0): number {
  const index = SOURCE.indexOf(needle, from);
  assert.ok(index > -1, `anchor must still exist verbatim: ${needle}`);
  return index;
}

describe("agent-daemon-server.ts — federation runtime wiring (S3)", () => {
  test("every run's prompt carries the runtime's live refusal prefix", () => {
    assert.match(
      SOURCE,
      /prompt\s*=\s*assemblePromptWithPluginPrefix\(\s*prompt\s*,\s*toolExtensions\?\.federation\.refusalPrefix\(\)\s*\?\?\s*""\s*\)/,
    );
  });

  test("the refusal-diagnosis decorator reads the runtime's live reports", () => {
    const wrap = indexOfOrFail("const toolExecutor = withFederatedRefusalDiagnosis(");
    const body = SOURCE.slice(wrap, indexOfOrFail("\n);", wrap));
    assert.match(body, /\(\)\s*=>\s*toolExtensions\?\.federation\.reports\(\)\s*\?\?\s*\[\]/);
  });

  test("start() assigns toolExtensions, awaits installed extensions, then the federation boot pass", () => {
    const startFn = indexOfOrFail("async function start(): Promise<void> {");
    const assign = indexOfOrFail("toolExtensions = extensions;", startFn);
    const installed = indexOfOrFail("await extensions.installed;", startFn);
    const boot = indexOfOrFail("await extensions.federation.start();", startFn);
    const catalog = indexOfOrFail("const liveToolCatalog = createLiveToolCatalogQuery(", startFn);
    assert.ok(assign < boot, "toolExtensions must be assigned before the boot pass");
    assert.ok(installed < boot, "installed extensions must register before federation (disclosed order)");
    assert.ok(boot < catalog, "the FTS snapshot must be built after federation admitted its tools");
  });

  test("onAdmitted rebinds the live catalog, and no reload can reach it before liveToolCatalog exists", () => {
    const startFn = indexOfOrFail("async function start(): Promise<void> {");
    const onAdmitted = indexOfOrFail("onAdmitted: (result) => {", startFn);
    const rebind = indexOfOrFail("liveToolCatalog.rebind(", onAdmitted);
    assert.ok(rebind < indexOfOrFail("toolExtensions = extensions;", startFn), "the rebind must live inside onAdmitted");

    const catalog = indexOfOrFail("const liveToolCatalog = createLiveToolCatalogQuery(", startFn);
    const reloadRoute = indexOfOrFail("registerFederationReloadRoute(app, { reload: () => extensions.federation.reload() });", startFn);
    assert.ok(catalog < reloadRoute, "the reload route must be mounted after liveToolCatalog is declared (TDZ)");
    assert.equal((SOURCE.match(/\.federation\.reload\(/g) ?? []).length, 1, "the reload route is the only reload caller");
  });

  test("the admissions route reads the runtime's reports and the source's config failures", () => {
    assert.match(
      SOURCE,
      /registerFederationAdmissionsRoute\(app,\s*\{\s*reports:\s*\(\)\s*=>\s*extensions\.federation\.reports\(\),[\s\S]*?configFailures:\s*\(\)\s*=>\s*source\.failures\(\),\s*\}\);/,
    );
  });
});
