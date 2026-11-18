import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToolInput } from "@jini-ai/core";
import { webAgentToolCatalog } from "#src/features/web/agent-tools";
import { webScreenshotAgentToolCatalog } from "#src/features/web-screenshot/agent-tools";

/** S13 step 0: two inputs the audit saw refused are still refused, with the declared inputs named. Neither tool declares
 * the name or an alias for it, and the owner has not asked for one: `sitePath` belongs to `web_screenshot_page`, `viewport`
 * (a named size) replaces a pixel `width`. This pins today's exact refusal, which is what the model reads. */
async function refusal({ name, input }: { name: string; input: unknown }): Promise<string> {
  const definition = [...webAgentToolCatalog, ...webScreenshotAgentToolCatalog].find(candidate => candidate.name === name);
  assert.ok(definition, `${name} is in its catalog`);
  try {
    await normalizeToolInput({ input, registration: { descriptor: { id: name, inputSchema: definition.inputSchema } } });
  } catch (error) {
    return (error as Error).message;
  }
  return "accepted";
}

test("web_fetch_page + sitePath is refused with the declared inputs", async () => {
  assert.equal(await refusal({ name: "web_fetch_page", input: { sitePath: "/about" } }),
    "Unknown input 'sitePath'. Declared inputs: url (required), format (optional), render (optional), waitFor (optional), dismissCookieBanners (optional), captureData (optional), captureDataMatch (optional), textMode (optional), screenshot (optional), find (optional), maxChars (optional). Resend with the declared name.");
});

test("web_screenshot_page + width is refused with the declared inputs", async () => {
  assert.equal(await refusal({ name: "web_screenshot_page", input: { sitePath: "/", width: 1280 } }),
    "Unknown input 'width'. Declared inputs: url (optional), sitePath (optional), themeId (optional), viewport (optional), fullPage (optional), dismissCookieBanners (optional), waitMs (optional). Resend with the declared name.");
});
