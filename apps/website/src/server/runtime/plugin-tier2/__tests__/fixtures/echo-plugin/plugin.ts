/**
 * Tier-2 test fixture plugin. Its behaviour is chosen by the draft title so one plugin covers every
 * worker outcome: "throw" -> the filter throws, "loop" -> the filter never returns (timeout),
 * "env" -> `{ seenSlug }` set to the worker's `TIER2_ENV_PROBE` env var (or "absent"),
 * anything else -> `{ titleLength, seenSlug }` (via content.extend + return value).
 *
 * Module evaluation marks `globalThis`, so a test can prove this file was never imported into the
 * server's own thread.
 */
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import { titleLength } from "./measure.js";

(globalThis as { __tier2EchoFixtureEvaluated?: boolean }).__tier2EchoFixtureEvaluated = true;

export default definePlugin({
  setup(sdk) {
    sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, (entry) => {
      if (entry.title === "throw") throw new Error("echo fixture refused this draft");
      if (entry.title === "loop") for (;;) { /* runaway plugin */ }
      if (entry.title === "env") return { seenSlug: process.env.TIER2_ENV_PROBE ?? "absent" };
      sdk.content.extend("seenSlug", sdk.content.read().slug);
      return { titleLength: titleLength(entry.title) };
    });
  },
});
