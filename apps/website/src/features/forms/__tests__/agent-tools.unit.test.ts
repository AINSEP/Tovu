import assert from "node:assert/strict";
import test from "node:test";
import { formsAgentToolCatalog } from "../agent-tools.js";

test("forms_create_definition explains rich-text widget insertion and the HTML form marker alternative", () => {
  const tool = formsAgentToolCatalog.find(({ name }) => name === "forms_create_definition");
  assert.ok(tool);
  assert.match(tool.description, /post or other rich-text body.*widgets_create_instance.*contact-form.*config \{ formDefinitionId: <this form's id> \}.*then widgets_insert_embed/);
  assert.match(tool.description, /HTML-format pages and theme templates.*data-embed-config.*\{type:"form"/);
});
