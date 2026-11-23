import assert from "node:assert/strict";
import test from "node:test";
import { CommanderError } from "commander";
import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { createTovuCliOutcomeMapper } from "../../errors.js";

// P13-C1 review fix: the generic mapper runs host classifiers in the host's order, so Tovu's
// order (plugin install → parser → site-dir) is now data. A site-dir classifier that matches
// everything must still never claim a parser error, and the plugin classifier still pre-empts both.
const claimsEverything = () => ({ exitCode: 99, stderrLine: "tovu: CLAIMED: by site-dir" });

test("Parser classification wins over a matching later classifier", () => {
  const map = createTovuCliOutcomeMapper({}, { siteDirClassifier: claimsEverything });
  assert.deepEqual(map({ err: new CommanderError(1, "commander.unknownOption", "error: unknown option '--x'") }), {
    exitCode: 2, stderrLine: "tovu: VALIDATION: unknown option '--x'", printUsage: false,
  });
  // The injected classifier is really in the chain: a non-parser error reaches it.
  assert.deepEqual(map({ err: new Error("other") }), { exitCode: 99, stderrLine: "tovu: CLAIMED: by site-dir" });
});

test("plugin install classification wins over the parser and site-dir classifiers", () => {
  const map = createTovuCliOutcomeMapper({}, { siteDirClassifier: claimsEverything });
  assert.deepEqual(map({ err: new PluginInstallError("PLUGIN_REFUSED", "detail") }), {
    exitCode: 2, stderrLine: "tovu: PLUGIN_REFUSED: detail",
  });
});
