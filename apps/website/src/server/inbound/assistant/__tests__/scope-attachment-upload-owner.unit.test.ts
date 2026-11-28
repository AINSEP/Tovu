import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createDiskAttachmentStore } from "@jini-ai/daemon/http";
import { RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { daemonRouteHost } from "#src/platform/express/jini-routes";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { mountScopeAttachments } from "../agent-daemon-scope-attachments.js";

/** The scope's upload route takes the owner only from the trusted principal header the admin forwarder stamps;
 *  an upload without it is stored ownerless, so no owner's pending-attachment listing can see it. */
test("uploads are owned by the forwarded principal header, and an upload without it stays ownerless", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "scope-attachment-owner-"));
  const store = await createDiskAttachmentStore({ uploadDirectory: directory }, { retainAcrossRestarts: true });
  t.after(async () => { await store.dispose(); await rm(directory, { recursive: true, force: true }); });
  const holds: string[] = [];
  const app = express();
  mountScopeAttachments({ app, attachmentStore: store,
    routeHost: daemonRouteHost({ context: { originPolicy: { isSameOrigin: () => true } }, parserLimitBytes: 6 * 1024 * 1024, errors: createRouteIncidentReporter().errors }),
    authEnv: { TOVU_AGENT_DAEMON_TOKEN: "tok-a" },
    idlePark: { hold: () => { holds.push("hold"); return () => { holds.push("release"); }; } } });
  const base = await startTestServer(app, t);
  const upload = async (batch: string, name: string, headers: Record<string, string>) => {
    const response = await fetch(`${base}/api/attachments?batch=${batch}&name=${name}`, { method: "POST",
      headers: { "content-type": "application/octet-stream", ...headers }, body: "plain words" });
    return { status: response.status, body: await response.json() as { attachment: { path: string; name: string } } };
  };
  const owned = await upload(randomUUID(), "owned.txt", { [RUN_PRINCIPAL_HEADER]: "owner-a" });
  const ownerless = await upload(randomUUID(), "loose.txt", {});
  assert.equal(owned.status, 201);
  assert.equal(ownerless.status, 201);
  assert.deepEqual((await store.listPendingForOwner({ ownerId: "owner-a" })).map(a => a.name), ["owned.txt"]);
  assert.deepEqual((await store.listPendingForOwner({ ownerId: "" })).map(a => a.name), []);
  assert.deepEqual(holds, ["hold", "release", "hold", "release"]);
});
