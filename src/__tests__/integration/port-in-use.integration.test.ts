import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import * as path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const require = createRequire(import.meta.url);

/**
 * @file Boot behaviour when the listen port is already taken — integration (process-spawn) tier.
 *
 * REGRESSION COVER for a defect measured live on 2026-08-15. `src/index.ts` called
 * `app.listen(port, cb)` and attached no `'error'` listener, so a failed bind emitted an unhandled
 * `'error'` event on the Server, which Node re-throws. The observable result was a raw
 * `EADDRINUSE` stack trace and a dead process.
 *
 * How it was actually hit: `tsx watch` restarted the server on a source edit, force-killed the
 * previous process after its 5s grace period, and the replacement bound against a port the old one
 * still held. What the operator saw was an admin UI that loaded but could not authenticate — the
 * API had died — with nothing in the failure naming a port.
 *
 * Spawns the real entrypoint the same way `cli/__tests__/integration/*` spawn the real CLI (through
 * `tsx`'s dev-mode transform, so no prior `npm run build` is required).
 *
 * Asserts the OPERATOR-VISIBLE contract, not the implementation: a clean exit code and a message
 * that names the port and how to find the holder. Deliberately does not assert the exact prose —
 * that would make a wording improvement a test failure — only the facts a reader needs.
 */

const ENTRYPOINT = path.resolve(import.meta.dirname, "../../index.ts");
const TSX_LOADER = require.resolve("tsx");

/** Bind an ephemeral port and hand back both the port and a closer, so the test owns the conflict. */
async function occupyAPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    // No host argument, matching what `app.listen(port)` itself does — Express binds every
    // interface (`::`), so a blocker bound to `127.0.0.1` does NOT collide with it and the test
    // would pass vacuously against the unfixed code. Measured: that exact mistake produced a
    // clean exit 0 here.
    blocker.listen(0, resolve);
  });
  const address = blocker.address();
  assert.ok(address !== null && typeof address === "object", "expected an AddressInfo from a bound server");
  return {
    port: address.port,
    release: () =>
      new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      }),
  };
}

test("boot: an already-held port exits cleanly and names the port, instead of throwing an unhandled 'error'", async (t) => {
  const { port, release } = await occupyAPort();
  t.after(release);

  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, ENTRYPOINT], {
    encoding: "utf8",
    timeout: 90_000,
    env: {
      ...process.env,
      PORT: String(port),
      // In-memory store so this never touches the developer's real content.db, and so a boot that
      // gets far enough to listen does not migrate anything on the way.
      TOVU_DB: "memory",
    },
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  // The defect: an unhandled 'error' event is re-thrown, which surfaces as a raw stack trace.
  // Before the fix this assertion failed — the output contained exactly this.
  assert.ok(
    !output.includes("Unhandled 'error' event"),
    `expected a handled failure, got an unhandled 'error' event:\n${output}`,
  );

  assert.equal(result.status, 1, `expected a clean exit code 1, got ${String(result.status)}:\n${output}`);
  assert.ok(output.includes(String(port)), `expected the failure to name port ${port}:\n${output}`);
  assert.ok(
    /already in use/i.test(output),
    `expected the failure to say the port is already in use:\n${output}`,
  );
  assert.ok(
    output.includes("lsof"),
    `expected the failure to tell the operator how to find the holder:\n${output}`,
  );
});
