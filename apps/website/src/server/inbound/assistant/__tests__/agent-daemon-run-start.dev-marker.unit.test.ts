import assert from "node:assert/strict";
import test from "node:test";
import { siteCarriesDevPipeline } from "../agent-daemon-run-start.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file C095: `<<SUBAGENT_DISPATCH>>` is this repo's own AI-Dev-Shop marker. It only means
 * something to an agent whose instruction discovery reaches an `AI-Dev-Shop/AGENTS.md` (the dev
 * site inside this checkout). A client site's run must not carry a foreign dev-tooling token.
 */

const DEV_REPO = "/fixture/dev-repo";
const DEV_SITE = `${DEV_REPO}/sites/tovu-dev`;
const devPipelineOnly = (file: string) => file === `${DEV_REPO}/AI-Dev-Shop/AGENTS.md`;
const siteBindingAt = (dir: string) => ({ workspaceId: "ws-daemon-test", siteBinding: { dir }, chatRunLedger: {} });

test("a client site run without an AI-Dev-Shop pipeline gets no dispatch marker", async () => {
  const input = await captureDaemonRun({ prompt: "Write my about page." }, {
    bindings: { routeDeps: siteBindingAt("/srv/client-site"), existsSync: devPipelineOnly },
  });
  assert.equal(input.prompt, "Write my about page.");
});

test("a site inside a checkout that carries AI-Dev-Shop/AGENTS.md keeps the dispatch marker", async () => {
  const input = await captureDaemonRun({ prompt: "Fix the header." }, {
    bindings: { routeDeps: siteBindingAt(DEV_SITE), existsSync: devPipelineOnly },
  });
  assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\nFix the header.");
});

test("siteCarriesDevPipeline probes the site dir and each ancestor, and only those", () => {
  const probed: string[] = [];
  const existsSync = (file: string) => { probed.push(file); return false; };
  assert.equal(siteCarriesDevPipeline({ siteDir: "/a/b" }, { existsSync }), false);
  assert.deepEqual(probed, ["/a/b/AI-Dev-Shop/AGENTS.md", "/a/AI-Dev-Shop/AGENTS.md", "/AI-Dev-Shop/AGENTS.md"]);
  assert.equal(siteCarriesDevPipeline({ siteDir: DEV_SITE }, { existsSync: devPipelineOnly }), true);
  assert.equal(siteCarriesDevPipeline({ siteDir: "/srv/client-site" }, { existsSync: devPipelineOnly }), false);
});
