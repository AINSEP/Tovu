import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { ToolInputError } from "@jini-ai/core";

/** An unbuilt `@jini-ai/agentic` (the dependency, not the module under test, is stubbed) must turn
 * the site guide into an actionable tool refusal, never a crash on an undefined function. */
test("a missing site-guide engine export is refused with the rebuild instruction", async () => {
  mock.module("@jini-ai/agentic/core", { namedExports: { parseGuideTopics: () => [] } });
  const { resolveSiteGuideEngine } = await import("../site-guide.js");
  assert.throws(() => resolveSiteGuideEngine({}), (error: unknown) => error instanceof ToolInputError
    && (error as Error).message === "site_guide is unavailable: build @jini-ai/agentic, then reload the assistant to enable the site guide.");
});
