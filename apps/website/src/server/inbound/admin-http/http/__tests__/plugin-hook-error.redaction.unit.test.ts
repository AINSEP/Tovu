import assert from "node:assert/strict";
import test from "node:test";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { sendPluginHookFailedError } from "../plugin-hook-error.js";

test("hook failures redact credentials before logging while preserving the public envelope", (t) => {
  const key = "sk-" + "a".repeat(40);
  const error = new PluginHookFailedError("example", `provider refused key=${key}`);
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  let status: number | undefined;
  let body: unknown;
  const res = { status(code: number) { status = code; return { json(value: unknown) { body = value; } }; } };

  assert.equal(sendPluginHookFailedError(res, error), true);

  assert.equal(status, 500);
  assert.deepEqual(body, { error: "a site plugin (example) refused this save; the content was not saved", code: "PLUGIN_HOOK_FAILED", pluginId: "example" });
  assert.equal(warnings.length, 1);
  const logged = String(warnings[0][0]);
  assert.equal(logged.includes(key), false);
  assert.match(logged, /REDACTED/);
  assert.equal(logged, redactSecretShapes({ text: `[plugin-runtime] '${error.pluginId}' hook refused a request: ${error.message}` }).text);
});
