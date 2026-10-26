import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { DEFAULT_REPO_ROOT, main, renderDeployWorkflow, renderTovuDeployWorkflow } from "../render-deploy-workflow.mjs";

// Tovu's production `.github/workflows/fly-deploy.yml` is OUTPUT of this plugin's template. These
// tests pin that the committed file is exactly the render, and pin the renderer's region rules.

const readFile = (file) => readFileSync(file, "utf8");
const BRANCH = "<<PLACEHOLDER: default branch, e.g. main>>";

test("the committed Tovu deploy workflow is exactly the render of the plugin template", () => {
  const { output, contents } = renderTovuDeployWorkflow({ readFile });
  assert.equal(output, ".github/workflows/fly-deploy.yml");
  assert.equal(readFile(path.join(DEFAULT_REPO_ROOT, output)), contents,
    "re-render with: node content/agent-plugins/fly/scripts/render-deploy-workflow.mjs");
});

test("the render keeps the production deploy contract and adds no step the workflow never had", () => {
  const { contents } = renderTovuDeployWorkflow({ readFile });
  assert.ok(!contents.includes("<<PLACEHOLDER"), "every placeholder is filled");
  assert.ok(!/^#[|<>]/m.test(contents), "no template marker survives the render");
  assert.match(contents, /^      - run: flyctl deploy --remote-only --config fly.toml --build-arg TOVU_BUILD_SHA=\$\{\{ github\.sha \}\}$/m);
  assert.match(contents, /^    needs: jini-published-typecheck$/m);
  assert.match(contents, /^  group: fly-deploy-tovu-ai-cms$/m);
  assert.ok(contents.includes("  TOVU_SITE_ID: ${{ vars.TOVU_SITE_ID }}\n"));
  assert.ok(contents.includes("              TOVU_SITE_ID: env.TOVU_SITE_ID,\n"));
  assert.doesNotMatch(contents, /volumes snapshots create/, "no volume-snapshot step");
});

test("an enabled block un-comments its `#| ` lines and drops the matching `!` default", () => {
  const template = ["a", "#>> !x", "default", "#<< !x", "#>> x", "#| active: 1", "# note", "#|", "#<< x", "b"].join("\n");
  assert.equal(renderDeployWorkflow({ template, placeholders: {} }, { blocks: ["x"] }), ["a", "active: 1", "# note", "", "b"].join("\n"));
  assert.equal(renderDeployWorkflow({ template, placeholders: {} }), ["a", "default", "b"].join("\n"));
});

test("placeholders are substituted, and a missing value throws instead of shipping the token", () => {
  const template = `branches: [${BRANCH}]`;
  assert.equal(renderDeployWorkflow({ template, placeholders: { [BRANCH]: "main" } }), "branches: [main]");
  assert.throws(() => renderDeployWorkflow({ template, placeholders: {} }), /No value for <<PLACEHOLDER: default branch/);
});

test("malformed regions are template errors", () => {
  const render = (lines) => () => renderDeployWorkflow({ template: lines.join("\n"), placeholders: {} });
  assert.throws(render(["#>> x", "y"]), /Region 'x' is never closed/);
  assert.throws(render(["#<< x"]), /Line 1: '#<< x' does not close an open region/);
  assert.throws(render(["#>> x", "#>> y"]), /Line 2: region 'y' opened inside 'x'/);
  assert.throws(render(["#>> x", "#<< !x"]), /Line 2: '#<< !x' does not close/);
});

test("the CLI writes the render, and --check reports a stale committed file", () => {
  const files = new Map();
  const logs = [];
  const io = {
    readFile: (file) => files.get(file) ?? readFile(file),
    writeFile: (file, text) => files.set(file, text),
    log: (message) => logs.push(message),
  };
  const repoRoot = "/virtual-repo";
  const target = path.join(repoRoot, ".github/workflows/fly-deploy.yml");
  assert.equal(main({ ...io, argv: [] }, { repoRoot }), 0);
  assert.equal(files.get(target), renderTovuDeployWorkflow({ readFile }).contents);
  assert.equal(main({ ...io, argv: ["--check"] }, { repoRoot }), 0);
  files.set(target, "stale");
  assert.equal(main({ ...io, argv: ["--check"] }, { repoRoot }), 1);
  assert.match(logs.at(-1), /differs from its render/);
});
