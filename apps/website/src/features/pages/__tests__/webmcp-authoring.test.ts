import assert from "node:assert/strict";
import test from "node:test";
import { pagesAgentToolCatalog } from "../agent-tools.js";

test("both page writers teach the owner-approved WebMCP form and non-form conventions", () => {
  for (const name of ["pages_write_html", "pages_write_region"]) {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === name);
    assert.ok(tool, name);
    for (const attribute of ["toolname", "tooldescription", "toolparamdescription", "toolparamtitle", "data-toolname", "data-tooldescription"]) {
      assert.ok(tool.description.includes(attribute), `${name} must teach ${attribute}`);
    }
    assert.match(tool.description, /toolautosubmit.*read-only/);
    assert.match(tool.description, /do not invent.*endpoint/i);
    assert.match(tool.description, /data-agent-element/); // Preserve editable region addresses.
    assert.match(tool.description, /data-tovu-agent.*retired/);
  }
});
