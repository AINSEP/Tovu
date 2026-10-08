import assert from "node:assert/strict";
import test from "node:test";
import { readRequestCookie } from "../request-cookie.js";
import type { Request } from "express";

for (const raw of ["%", "%E0%A4%A", "%GG"]) {
  test(`malformed cookie ${raw} remains a value for the authentication gate to reject`, () => {
    const request = { headers: { cookie: `other=ok; session=${raw}` } } as Request;
    assert.equal(readRequestCookie({ request, name: "session" }), raw);
    assert.equal(readRequestCookie({ request, name: "other" }), "ok");
  });
}
test("request cookies decode once, preserve embedded equals and use the first duplicate", () => {
  const request = { headers: { cookie: 'session="hello%3Dworld%253D"; session=second' } } as Request;
  assert.equal(readRequestCookie({ request, name: "session" }), "hello=world%3D");
  assert.equal(readRequestCookie({ request, name: "absent" }), undefined);
  assert.equal(readRequestCookie({ request: {} as Request, name: "session" }), undefined);
});
