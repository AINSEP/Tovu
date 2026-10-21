import assert from "node:assert/strict";
import test from "node:test";

import * as platformWeb from "@jini-ai/platform/web";
import * as htmlDocument from "../html-document.js";

/** Public-page facts share Jini's parser and URL policy: the re-exports are Jini's own bindings. */
test("html-document re-exports Jini's parser, projections and caps unchanged", () => {
  assert.deepEqual(Object.keys(htmlDocument).sort(), ["MAX_IMAGES", "MAX_LINKS", "htmlToText", "readHtmlDocument", "stripActiveHtml"]);
  assert.equal(htmlDocument.htmlToText, platformWeb.htmlToText);
  assert.equal(htmlDocument.readHtmlDocument, platformWeb.readHtmlDocument);
  assert.equal(htmlDocument.stripActiveHtml, platformWeb.stripActiveHtml);
  assert.equal(htmlDocument.MAX_LINKS, platformWeb.MAX_LINKS);
  assert.equal(htmlDocument.MAX_IMAGES, platformWeb.MAX_IMAGES);
  assert.equal(htmlDocument.htmlToText({ html: "<p>Hello <b>world</b></p>" }).trim(), "Hello world");
});
