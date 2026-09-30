import assert from "node:assert/strict";
import test from "node:test";

import { parseSourceControlCredentialForm } from "../credential-form.js";

/**
 * @file `credential-form.ts` — the saved-credential form a git-host plugin declares for the admin
 * Source Control page. Every malformed block is refused with its exact reason.
 */

const TOKEN = { name: "token", label: "Token", required: true, secret: true };

test("absent is none; a full block parses and tokenField defaults to 'token'", () => {
  assert.equal(parseSourceControlCredentialForm(undefined, "c"), undefined);
  assert.deepEqual(parseSourceControlCredentialForm({ help: "h", tokenPageUrl: "https://x.test/new", fields: [TOKEN, { name: "username", label: "Username", required: true }] }, "c"), {
    help: "h",
    tokenPageUrl: "https://x.test/new",
    tokenField: "token",
    fields: [TOKEN, { name: "username", label: "Username", required: true }],
  });
});

test("malformed blocks are refused with the exact reason", () => {
  const cases: ReadonlyArray<[unknown, string]> = [
    ["x", "c must be an object"],
    [{ fields: [] }, "c.fields must be a list of 1 to 10 fields"],
    [{ fields: [TOKEN], tokenPageUrl: "http://x.test" }, "c.tokenPageUrl must be an https URL"],
    [{ fields: [TOKEN], help: 3 }, "c.help must be a string of at most 500 characters"],
    [{ fields: [{ ...TOKEN, name: "Bad Name" }] }, "c.fields[0].name must be a camelCase identifier"],
    [{ fields: [{ ...TOKEN, name: "providerId" }] }, "c.fields[0].name 'providerId' is reserved"],
    [{ fields: [{ ...TOKEN, label: "" }] }, "c.fields[0].label must be a non-empty string"],
    [{ fields: [TOKEN, TOKEN] }, "c.fields[1].name 'token' is declared twice"],
    [{ fields: [{ ...TOKEN, secret: false }] }, "c.tokenField must name a declared secret field"],
    [{ fields: [TOKEN], tokenField: "missing" }, "c.tokenField must name a declared secret field"],
  ];
  for (const [value, reason] of cases) assert.equal(parseSourceControlCredentialForm(value, "c"), reason);
});
