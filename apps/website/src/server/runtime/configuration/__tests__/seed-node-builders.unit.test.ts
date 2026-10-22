import assert from "node:assert/strict";
import test from "node:test";

import { link, ol } from "../seed.js";

test("link keeps formatting marks ahead of the link mark, in call order", () => {
  assert.deepEqual(link("API", "/plugin-api", "bold", "code"), {
    type: "text",
    text: "API",
    marks: [{ type: "bold" }, { type: "code" }, { type: "link", attrs: { href: "/plugin-api" } }],
  });
  assert.deepEqual(link("Docs", "/docs"), { type: "text", text: "Docs", marks: [{ type: "link", attrs: { href: "/docs" } }] });
});

test("ol wraps plain strings as list-item paragraphs and passes pre-built nodes through unchanged", () => {
  const prebuilt = { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }] };
  assert.deepEqual(ol("first", prebuilt), {
    type: "orderedList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
      prebuilt,
    ],
  });
});
