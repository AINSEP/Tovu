import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MEMBER_AUTH_SCRIPT, MEMBER_AUTH_STYLE } from "@jini-ai/cms/public-http/http/site/member-auth-script";

/**
 * Byte-exact guard for the member sign-in style and script. Tovu themes and `MEMBER_PAGES`
 * (`routes/site/member-pages.ts`) use these exact class names, so whatever builds them from injected names must reproduce
 * this output character for character.
 */
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

test("MEMBER_AUTH_STYLE is byte-identical to the shipped CSS", () => {
  assert.equal(MEMBER_AUTH_STYLE.length, 4994);
  assert.equal(sha256(MEMBER_AUTH_STYLE), "1c77babc1bb09c5a929a6615a0658258e88a927146fb678a9afc80ed8496880a");
});

test("MEMBER_AUTH_SCRIPT is byte-identical to the shipped script", () => {
  assert.equal(MEMBER_AUTH_SCRIPT.length, 16272);
  assert.equal(sha256(MEMBER_AUTH_SCRIPT), "3d8f3dfeacc438262d7c4e08edeccdc4174dc584ef00e9d143e3ef878b833f80");
});
