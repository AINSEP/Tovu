import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { readConnectionStringFromUser } from "../../commands/init.js";

/**
 * @file The connection-string reader shared by `tovu init --storage postgres` and `tovu storage move`:
 * piped stdin yields its first line; a terminal is asked once without echo.
 */

function sink() {
  let text = "";
  return { stream: { write: (chunk: string) => { text += chunk; return true; } }, text: () => text };
}

test("piped input: only the first line is the connection string and nothing is printed", async () => {
  const input = new PassThrough();
  const out = sink();
  const url = ["postgres://", "owner", "@db.example/site"].join("");
  const reading = readConnectionStringFromUser({}, { input, output: out.stream });
  input.end(`${url}\r\nsecond line ignored\n`);
  assert.equal(await reading, url);
  assert.equal(out.text(), "");
});

test("piped input with no newline and empty input both resolve to the whole (possibly empty) text", async () => {
  const one = new PassThrough();
  const reading = readConnectionStringFromUser({}, { input: one, output: sink().stream });
  one.end("postgres://h/db");
  assert.equal(await reading, "postgres://h/db");
  const empty = new PassThrough();
  const none = readConnectionStringFromUser({}, { input: empty, output: sink().stream });
  empty.end();
  assert.equal(await none, "");
});

test("a terminal is prompted once, the typed value is not echoed, and the prompt line is closed", async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const out = sink();
  const reading = readConnectionStringFromUser({}, { input, output: out.stream });
  input.write("postgres://typed/db\n");
  assert.equal(await reading, "postgres://typed/db");
  assert.equal(out.text(), "Postgres connection string (not shown): \n");
});
