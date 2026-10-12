import assert from "node:assert/strict";
import test from "node:test";
import { deriveConversationTitle } from "@jini-ai/chat/core";
import { deriveContentConversationTitle } from "../content-chat-title.js";

const title = (prompt: string) => deriveContentConversationTitle({ prompt, deriveFallback: deriveConversationTitle });
test("a publishing chat title preserves the complete named post", () => {
  assert.equal(title('Publish a short blog post titled "How Tovu Saves You Time"'), "Blog post: How Tovu Saves You Time");
  assert.equal(title("Publish a short blog post titled How Tovu Saves You Time"), "Blog post: How Tovu Saves You Time");
  assert.equal(title('Create a page called “About Tovu”'), "Page: About Tovu");
});
test("a long named post gets a complete action title within the limit", () => {
  const result = title(`Publish a blog post titled "${"A long complete title ".repeat(10)}"`);
  assert.equal(result, "Publish blog post");
  assert.ok(result.length <= 80);
});
test("other prompts still use Jini and resource slugs stay intact", () => {
  assert.equal(title("how many published posts do I have?"), deriveConversationTitle({ prompt: "how many published posts do I have?" }));
  assert.equal(title("site-compliance"), "site-compliance");
  assert.equal(title(""), "");
});
test("CMS titles strip markdown before extracting a complete named page", () => {
  assert.equal(title('Create a page called **Plannie** at **plannie.com**'), 'Page: Plannie at plannie.com');
  assert.equal(title('Create a page called "**Plannie** _marketplace_ `API`"'), 'Page: Plannie marketplace API');
  assert.equal(title('Create a page called [Plannie](https://plannie.com)'), 'Page: Plannie');
  assert.equal(title('# Create a page called **Plannie**'), 'Page: Plannie');
});

test("unquoted CMS names retain domains and versions but stop at sentence punctuation", () => {
  assert.equal(title("Create a page called Plannie at docs.plannie.com"), "Page: Plannie at docs.plannie.com");
  assert.equal(title("Create a page called Release v1.2"), "Page: Release v1.2");
  for (const end of [".", "!", "?"]) {
    assert.equal(title(`Create a page called Release v1.2${end} Then publish it.`), "Page: Release v1.2");
    assert.equal(title(`Create a page called About Tovu${end}`), "Page: About Tovu");
  }
  assert.equal(title("Create a page called What?Now!Next"), "Page: What?Now!Next");
});
