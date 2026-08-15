import assert from "node:assert/strict";
import test from "node:test";

import { createEnvPublishCredentialSource } from "../credentials";

/**
 * @file `createEnvPublishCredentialSource` — every test injects its own `env` object rather than
 * mutating real `process.env` (which would leak across parallel test files sharing one process).
 */

test("resolves GITHUB_TOKEN for the github-pages target, trimmed", async () => {
  const source = createEnvPublishCredentialSource({ GITHUB_TOKEN: "  ghp_fake_token_value  " } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: "ws-1", target: "github-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "ghp_fake_token_value");
});

test("resolves VERCEL_TOKEN for the vercel target — distinct env var from github-pages", async () => {
  const source = createEnvPublishCredentialSource({ VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: "ws-1", target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "fake_vercel_token");
});

test("a target's own token being unset never falls back to the OTHER target's env var", async () => {
  const source = createEnvPublishCredentialSource({ VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: "ws-1", target: "github-pages" });
  assert.equal(result.ok, false);
});

test("fails cleanly (ok:false with a guidance message) when the env var is unset — never throws, never returns an empty token", async () => {
  const source = createEnvPublishCredentialSource({} as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: "ws-1", target: "vercel" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /VERCEL_TOKEN/);
  assert.doesNotMatch(result.reason, /Bearer|token=|token:/i);
});

test("fails cleanly when the env var is present but blank/whitespace-only — never resolves an empty-string token", async () => {
  const source = createEnvPublishCredentialSource({ GITHUB_TOKEN: "   " } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: "ws-1", target: "github-pages" });
  assert.equal(result.ok, false);
});
