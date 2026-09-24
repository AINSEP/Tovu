import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file LAN-bind plan (2026-09-23), Slice 2: `index.ts` — the container/server entry point
 * (`npm run dev`/`dev:server`, `npm start`, Docker/Fly/Render's own CMD) — keeps its existing
 * default (Node's own all-interfaces bind) but must now honour an operator's `TOVU_HOST`, same as
 * `tovu serve` already does (Slice 1's `serve.ts`/`bind-host.ts`).
 *
 * `index.ts` is the one real top-level boot path — it is never imported by a test (its own file
 * header says so), and it runs a real `app.listen()` the moment it is imported, so there is no
 * lighter seam than reading its own source for this. Same shape and same reasoning as
 * `serve-command-wiring.unit.test.ts`'s coverage of `pinServedSiteDirIntoEnv`/`app.listen(port,
 * host)` in `serve.ts`.
 */

const INDEX_TS_PATH = path.resolve(import.meta.dirname, "../../../../index.ts");

function readSource(): string {
  return fs.readFileSync(INDEX_TS_PATH, "utf8");
}

test("index.ts resolves TOVU_HOST via resolveBindHost(process.env, undefined) -- undefined is its OWN existing all-interfaces default, unchanged", () => {
  const source = readSource();
  assert.ok(
    source.includes("resolveBindHost(process.env, undefined)"),
    "index.ts no longer resolves TOVU_HOST with resolveBindHost(process.env, undefined) -- deleting or " +
      "rewording that call silently reverts every container/server boot to ignoring TOVU_HOST entirely " +
      "(see ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md)."
  );
});

test("index.ts's HTTPS listen path passes the resolved bind host through", () => {
  const source = readSource();
  assert.ok(
    source.includes("createHttpsServer(devTls.credentials, app).listen(port, bindHost, onListening)"),
    "index.ts's dev-TLS branch no longer passes bindHost to .listen() -- a TOVU_HOST override would " +
      "silently stop applying whenever the dev cert pair is active."
  );
});

test("index.ts's plain HTTP listen path passes the resolved bind host through", () => {
  const source = readSource();
  assert.ok(
    source.includes("app.listen(port, bindHost, onListening)"),
    "index.ts's non-TLS branch no longer passes bindHost to .listen() -- a TOVU_HOST override would " +
      "silently stop applying whenever the dev cert pair is absent (the common case)."
  );
});
