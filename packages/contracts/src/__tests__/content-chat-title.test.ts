import assert from "node:assert/strict";
import test from "node:test";

import { deriveContentConversationTitle } from "../content-chat-title.js";

test("CMS titles preserve names, punctuation, quoted sentences and the subject's content kind", () => {
  const cases = [
    ["publish a blog post titled: “How v2.0 Works”", "Blog post: How v2.0 Works"],
    ["Edit the page called 'Help & Support'", "Page: Help & Support"],
    ['Update the article "Why now? Start here."', "Article: Why now? Start here."],
    ["Edit the theme named Studio 2.1. Polish the colors.", "Theme: Studio 2.1"],
    ['Update the page “” “Keep this title”', "Page: Keep this title"],
    ['Edit the post "unfinished “Correct Title”', "Blog post: Correct Title"],
    ['Edit the post titled **Planning**\nExample page "Not the subject"', "Blog post: Planning"],
    ['Edit the theme called "Night Sky"', "Theme: Night Sky"],
    ["editor-diagnostics", "editor-diagnostics"],
  ];
  for (const [prompt, expected] of cases) {
    assert.equal(deriveContentConversationTitle({ prompt, deriveFallback: () => assert.fail("a named action must not fall back") }), expected, prompt);
  }
});

test("long names collapse to a complete action, not a partial or mid-word title", () => {
  const title = "A".repeat(76);
  for (const [prompt, expected] of [
    [`publish page "${title}"`, "Publish page"],
    [`write post "${title}"`, "Write blog post"],
    [`create article "${title}"`, "Write article"],
    [`update theme "${title}"`, "Edit theme"],
  ]) {
    assert.equal(deriveContentConversationTitle({ prompt, deriveFallback: () => assert.fail("a long title is still a title") }), expected);
  }
});

test("generic requests delegate the normalized prompt and dangling CMS introducers are removed only from the final line", () => {
  const calls: Array<{ prompt: string }> = [];
  const fallback = (input: { prompt: string }) => { calls.push(input); return "Review release notes"; };
  assert.equal(deriveContentConversationTitle({ prompt: "**Review release notes**", deriveFallback: fallback }), "Review release notes");
  assert.deepEqual(calls, [{ prompt: "Review release notes" }]);

  assert.equal(deriveContentConversationTitle({ prompt: "write a blog post titled", deriveFallback: () => "Write a blog post titled" }), "Write a blog post");
  assert.equal(deriveContentConversationTitle({ prompt: "edit the page", deriveFallback: () => "Page titled earlier\nEdit the page" }), "Page titled earlier\nEdit the page");
  assert.equal(deriveContentConversationTitle({ prompt: "edit the page named", deriveFallback: () => "Page titled earlier\nEdit the page named" }), "Page titled earlier\nEdit the page");
});
