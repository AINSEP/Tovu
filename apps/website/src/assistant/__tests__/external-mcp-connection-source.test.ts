import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import {
  buildExternalMcpFederationDeps,
  createStoredExternalMcpConnectionSource,
} from "../external-mcp-connection-source.js";
import type { ExternalMcpServerRepoPort } from "../external-mcp-store.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";

/**
 * @file RED-first coverage for `external-mcp-connection-source.ts`'s two new pieces (design-byok
 * S2): `createStoredExternalMcpConnectionSource`'s whole-read-failure fallback, and
 * `buildExternalMcpFederationDeps`'s `onAuthFailed` being genuinely absent (not a no-op) when no
 * `oauth` is supplied.
 */

const WORKSPACE = "workspace-1";

function repoWhoseListThrows(error: Error): ExternalMcpServerRepoPort {
  const inner = new InMemoryExternalMcpServerRepo();
  return {
    listByWorkspaceId: () => Promise.reject(error),
    findByServerId: (input) => inner.findByServerId(input),
    upsert: (record) => inner.upsert(record),
    deleteByServerId: (input) => inner.deleteByServerId(input),
    tryClaimOAuthRefreshLease: (input) => inner.tryClaimOAuthRefreshLease(input),
    releaseOAuthRefreshLease: (input) => inner.releaseOAuthRefreshLease(input),
  };
}

async function allow() {
  return { allowed: true as const, reason: "matched" };
}

test("a repo whose listByWorkspaceId throws makes resolve() return [] and failures() return []", async (t) => {
  const warnLines: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    warnLines.push(args.join(" "));
  });

  const sealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const source = createStoredExternalMcpConnectionSource({
    repo: repoWhoseListThrows(new Error("database is locked")),
    sealer,
    workspaceId: WORKSPACE,
    log: "[assistant-byok]",
  });

  const resolved = await source.resolve();

  assert.deepEqual(resolved, []);
  assert.deepEqual(source.failures(), []);
  assert.ok(
    warnLines.some((line) =>
      line.startsWith(
        "[assistant-byok] mcp-federation: the stored external-MCP roster could not be read, continuing without it — ",
      ),
    ),
    `expected a warn line with the roster-unreadable prefix; got: ${JSON.stringify(warnLines)}`,
  );
});

test("buildExternalMcpFederationDeps omits onAuthFailed entirely when oauth is absent", () => {
  const deps = buildExternalMcpFederationDeps({
    authorize: allow,
    workspaceId: WORKSPACE,
    repo: new InMemoryExternalMcpServerRepo(),
  });

  assert.equal(deps.onAuthFailed, undefined);
  assert.equal(deps.authorize, allow);
  assert.equal(deps.workspaceId, WORKSPACE);
  assert.equal(typeof deps.assertConnectionUsable, "function");
});

test("buildExternalMcpFederationDeps wires onAuthFailed to oauth.reportAuthFailure when oauth is present", async () => {
  const calls: { connectionId: string; error: Error }[] = [];
  const oauth = {
    async reportAuthFailure(serverId: string, error: Error): Promise<never> {
      calls.push({ connectionId: serverId, error });
      throw error;
    },
  };

  const deps = buildExternalMcpFederationDeps({
    authorize: allow,
    workspaceId: WORKSPACE,
    repo: new InMemoryExternalMcpServerRepo(),
    oauth,
  });

  assert.equal(typeof deps.onAuthFailed, "function");
  const authError = new Error("401");
  await assert.rejects(() => deps.onAuthFailed?.("server-1", authError as never) ?? Promise.resolve(), authError);
  assert.deepEqual(calls, [{ connectionId: "server-1", error: authError }]);
});
