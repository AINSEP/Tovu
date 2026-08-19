import assert from "node:assert/strict";
import test from "node:test";

import { executionModeFromEnv } from "../execution-mode.js";

/** @file `executionModeFromEnv` — the safe-default contract matters most: anything other than the
 *  exact literal `"hosted-api-only"` must resolve to `"self-hosted-cli"`, never the reverse. */

test("defaults to self-hosted-cli when the env var is unset", () => {
  assert.equal(executionModeFromEnv({} as NodeJS.ProcessEnv), "self-hosted-cli");
});

test("resolves hosted-api-only when set to exactly that value", () => {
  assert.equal(executionModeFromEnv({ TOVU_EXECUTION_MODE: "hosted-api-only" } as NodeJS.ProcessEnv), "hosted-api-only");
});

test("an unrecognized/typo'd value falls back to self-hosted-cli, not hosted-api-only", () => {
  assert.equal(executionModeFromEnv({ TOVU_EXECUTION_MODE: "hosted" } as NodeJS.ProcessEnv), "self-hosted-cli");
});

test("blank string falls back to self-hosted-cli", () => {
  assert.equal(executionModeFromEnv({ TOVU_EXECUTION_MODE: "" } as NodeJS.ProcessEnv), "self-hosted-cli");
});
