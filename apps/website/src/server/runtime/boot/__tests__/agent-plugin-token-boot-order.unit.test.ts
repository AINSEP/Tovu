import assert from "node:assert/strict";
import test from "node:test";

import { importAgentPluginTokensAtBoot, type AgentPluginTokenBootSteps } from "../bootstrap.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";

/**
 * @file Boot's Agent Plugin token imports: the token typed into create-site onboarding for THIS site
 * is applied before any ambient env token, and a plugin that still has a pending token is never given
 * the env token — otherwise the env import (another account's token) saved first and the pending
 * import then found the row "already connected" and deleted the token the person chose.
 */

const deps = {} as NewsletterRouteDeps;
const options = { useMemory: false, defaultContentDbPath: () => "/sites/new-site/content.db" };

function recordingSteps(pending: readonly string[], applyThrows = false) {
  const calls: string[] = [];
  const steps: AgentPluginTokenBootSteps = {
    pendingPluginIds: (siteDir) => (calls.push(`pending-ids:${siteDir}`), new Set(pending)),
    applyPending: async (siteDir) => {
      calls.push(`apply:${siteDir}`);
      if (applyThrows) throw new Error("disk went away");
    },
    importFromEnv: async (skip) => void calls.push(`env:skip=${[...skip].sort().join(",")}`),
  };
  return { calls, steps };
}

test("pending onboarding tokens are applied first, and the env import skips every plugin that had one", async () => {
  const { calls, steps } = recordingSteps(["supabase"]);
  await importAgentPluginTokensAtBoot(deps, options, steps);
  assert.deepEqual(calls, ["pending-ids:/sites/new-site", "apply:/sites/new-site", "env:skip=supabase"]);
});

test("a failed pending apply still keeps the env import off the pending plugins", async () => {
  const { calls, steps } = recordingSteps(["supabase"], true);
  await importAgentPluginTokensAtBoot(deps, options, steps);
  assert.deepEqual(calls.at(-1), "env:skip=supabase");
});

test("memory mode has no site folder: only the env import runs, skipping nothing", async () => {
  const { calls, steps } = recordingSteps(["supabase"]);
  await importAgentPluginTokensAtBoot(deps, { ...options, useMemory: true }, steps);
  assert.deepEqual(calls, ["env:skip="]);
});
