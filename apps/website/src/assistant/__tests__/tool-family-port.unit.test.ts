import assert from "node:assert/strict";
import test from "node:test";
import { createContentReadFamilyPort } from "../tool-family-port.js";

const registryOf = (...ids: string[]) => ({ list: () => ids.map(id => ({ id })) });

test("content_read is a group of its content_read.<name> cards, with each name selecting its card", () => {
  const port = createContentReadFamilyPort({ registry: registryOf("content_read.menu", "content_read.page", "content_post_list", "content_readable") });
  assert.deepEqual(port.describeFamily({ familyId: "content_read" }), {
    members: ["content_read.menu", "content_read.page"],
    selector: { keys: ["resource", "type", "entity", "kind"], byValue: { menu: "content_read.menu", page: "content_read.page" } },
  });
});

test("a selector value exists only for a card that is registered", () => {
  const port = createContentReadFamilyPort({ registry: registryOf("content_read.menu") });
  const selector = port.describeFamily({ familyId: "content_read" })?.selector;
  assert.deepEqual(Object.keys(selector?.byValue ?? {}), ["menu"]);
  assert.equal(selector?.byValue.theme, undefined);
});

test("no other id is a group, and a group with no registered card is not one either", () => {
  const port = createContentReadFamilyPort({ registry: registryOf("content_read.menu") });
  assert.equal(port.describeFamily({ familyId: "content_post_list" }), undefined);
  assert.equal(port.describeFamily({ familyId: "content_read.menu" }), undefined);
  assert.equal(createContentReadFamilyPort({ registry: registryOf("content_post_list") }).describeFamily({ familyId: "content_read" }), undefined);
});

test("the registry is read on every ask, so a card retired since startup disappears", () => {
  let ids = ["content_read.menu", "content_read.page"];
  const port = createContentReadFamilyPort({ registry: { list: () => ids.map(id => ({ id })) } });
  assert.deepEqual(port.describeFamily({ familyId: "content_read" })?.members, ["content_read.menu", "content_read.page"]);
  ids = ["content_read.page"];
  assert.deepEqual(port.describeFamily({ familyId: "content_read" })?.members, ["content_read.page"]);
});
