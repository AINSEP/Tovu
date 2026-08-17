import { spawn } from "node:child_process";
import { createServer } from "node:net";
import * as path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * @file The agent daemon actually boots — integration (process-spawn) tier.
 *
 * REGRESSION COVER for a live outage on 2026-08-15: the daemon died on every boot with
 *
 *     TypeError: Cannot read properties of undefined (reading 'createInMemoryChatStoreFactory')
 *         at createRouteDeps (src/server/app.ts)
 *
 * caused by an import cycle:
 *
 *     server/app.ts -> ... -> export/index.ts -> export/site-exporter.ts -> server/app.ts
 *
 * `site-exporter.ts` imports `createApp` on purpose (exporting drives the real app rather than
 * re-implementing rendering), and `server/app.ts` runs its whole boot graph as a side effect of
 * being loaded — so re-entering it mid-initialisation hands out half-built module exports.
 *
 * WHY NOTHING CAUGHT IT. Every existing suite either imports `createApp` directly or boots through
 * `src/index.ts`, and on those entry points the cycle is benign. It only bites when the entry point
 * is *inside* `src/assistant/`, which is exactly and only the daemon. The API server stayed
 * perfectly healthy throughout, so the sole visible symptom was "the AI assistant no longer works"
 * — with nothing anywhere naming an import cycle.
 *
 * It also reproduced TWICE within an hour from two different callers (the export route, then the
 * publish adapter), each re-closing the same loop through a new path. So this asserts the property
 * that matters — the daemon starts — rather than the absence of any one import edge, which the next
 * caller would route around.
 *
 * Spawns the real daemon entry point the same way `cli/__tests__/integration/*` spawn the real CLI,
 * through `tsx`'s dev-mode transform, so no prior `npm run build` is required.
 */

const DAEMON_ENTRY = path.resolve(__dirname, "../../agent-daemon-server.ts");
const TSX_LOADER = require.resolve("tsx");

/** A port nothing else holds, so a bind failure here can never be mistaken for the cycle crash. */
async function reserveFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, resolve);
  });
  const address = probe.address();
  assert.ok(address !== null && typeof address === "object", "expected an AddressInfo");
  const { port } = address;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test("the agent daemon boots and listens — no import cycle on its entry path", async (t) => {
  const port = await reserveFreePort();

  const child = spawn(process.execPath, ["--import", TSX_LOADER, DAEMON_ENTRY], {
    env: {
      ...process.env,
      JINI_AGENT_DAEMON_PORT: String(port),
      TOVU_WORKSPACE: "workspace-local",
      // Never touch the developer's real content.db.
      TOVU_DB: "memory",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));

  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  const outcome = await new Promise<"listening" | "exited">((resolve) => {
    const deadline = setTimeout(() => resolve(child.exitCode === null ? "listening" : "exited"), 45_000);
    const poll = setInterval(() => {
      if (/listening on/i.test(output)) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve("listening");
      }
    }, 250);
    child.once("exit", () => {
      clearTimeout(deadline);
      clearInterval(poll);
      resolve("exited");
    });
  });

  // The exact failure this exists for. Asserted before the generic check so a regression reports
  // the cycle by name instead of a bare "process exited".
  assert.ok(
    !/Cannot read properties of undefined/.test(output),
    `daemon hit a partially-initialised module — almost certainly a reintroduced import cycle ` +
      `through server/app.ts. See export/site-exporter.ts's note on why createApp is required ` +
      `lazily.\n\n${output}`,
  );

  assert.equal(outcome, "listening", `expected the daemon to start listening, but it exited:\n${output}`);
});
