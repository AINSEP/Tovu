import assert from "node:assert/strict";
import test from "node:test";

import { buildDestinationForm, buildDestinationOutcome } from "../destination-ui.js";

test("the private destination form masks its required address and correlates both save and cancel", () => {
  // F2.5/F4.1: removing the exchange parameter or changing the cancel tool must fail.
  const resource = buildDestinationForm("exchange-private");
  assert.equal(resource.resource.uri, "ui://tovu/database-transfer-destination/exchange-private");
  const html = resource.resource.text;
  assert.match(html, /<input class="mcpui-input" type="password" id="mcpui-field-address" name="address"/);
  function value(name: string) {
    const match = html.match(new RegExp(`var ${name} = (.+);`));
    assert.ok(match, `${name} must be delivered to the form`);
    return JSON.parse(match[1]);
  }
  assert.equal(value("TOOL"), "database_transfer_set_destination");
  assert.deepEqual(value("BASE_PARAMS"), { __exchangeId: "exchange-private" });
  assert.deepEqual(value("CANCEL"), { toolName: "database_transfer_set_destination", params: { __exchangeId: "exchange-private", __dismissed: true } });
  assert.deepEqual(value("FIELDS"), [{ kind: "string", name: "address", label: "Database address", required: true }]);
});

for (const [state, title, message] of [
  ["success", "Destination saved", "The copy will go to catalog on db.example."],
  ["failure", "Destination not saved", "The destination database could not be reached."],
] as const) {
  test(`destination ${state} outcome replaces the private form under its URI and labels the result correctly`, () => {
    // F6.2: the integration failure case checks the message but not the failure heading.
    const resource = buildDestinationOutcome({ exchangeId: "exchange-b08", state, message });
    assert.equal(resource.resource.uri, "ui://tovu/database-transfer-destination/exchange-b08");
    assert.match(resource.resource.text, new RegExp(`<h1[^>]*>${title}</h1>`));
    assert.ok(resource.resource.text.includes(message));
  });
}
