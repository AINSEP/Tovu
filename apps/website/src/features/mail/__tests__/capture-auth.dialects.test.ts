/** Step 1: credentials are redacted before SQL persistence on public/unknown origins. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { OriginNotVerifiedError, type OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createMailPolicyWrapper } from "#src/server/runtime/boot/mail-delivery-policy";
import { createMailSendLedgerRepo } from "../ledger.repo.js";
import { createMailCaptureRepo } from "../capture.repo.js";

const SECRET = "raw-signin-secret-123456";
const AT = "2026-10-24T12:00:00.000Z";
const message = {
  workspaceId: "capture-ws", to: { email: "reader@example.com", name: SECRET },
  from: { email: "sender@example.com", name: SECRET }, replyTo: { email: "reply@example.com", name: SECRET },
  subject: SECRET, text: `https://localhost:3000/auth/magic?token=${SECRET}`,
  html: `<a href="https://site.example/auth/magic?token=${SECRET}">Sign in</a>`,
  headers: { "X-Auth": SECRET }, attachments: [{ filename: SECRET, contentType: "text/plain", contentBase64: Buffer.from(SECRET).toString("base64") }],
};

function registry(host: string): OriginRegistryPort {
  return { canonicalOrigin: async () => ({ scheme: "https", host, port: 3000, source: "dev-capability", verifiedAt: AT }),
    isAllowedRedirectTarget: async () => false, isAllowedEgressTarget: async () => false };
}

describeEachDialect("auth capture persistence", {
  tables: ["mail_capture", "mail_send_ledger", "workspaces"], make: db => db,
}, (make, dialect) => {
  for (const host of ["site.example", "localhost.evil.example", "192.168.1.2", "localhost", "127.0.0.1", "::1", "missing", "unverified"]) {
    test(`step 1: ${host} capture stores only the allowed credential content`, async t => {
      const db = make();
      if (dialect === "sqlite") t.after(() => db.close());
      await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('capture-ws','Capture','capture',${AT})`);
      const local = ["localhost", "127.0.0.1", "::1"].includes(host);
      const origin = host === "missing" ? undefined : registry(host);
      if (host === "unverified") origin!.canonicalOrigin = async () => { throw new OriginNotVerifiedError({ message: "unverified" }); };
      const capture = createMailCaptureRepo({ db, origin });
      await capture.capture({ message, lane: "transactional", idempotencyKey: "members:signin:hashed-identity" });
      const [stored] = await capture.listCaptured({ workspaceId: "capture-ws" });
      const rows = await db.query(sql`SELECT subject,payload_json FROM mail_capture`);
      if (local) {
        assert.deepEqual(stored.message, message, "local owner can click the complete link");
        assert.match(JSON.stringify(rows), new RegExp(SECRET));
      } else {
        assert.doesNotMatch(JSON.stringify(rows), new RegExp(SECRET), "secrets never reached either SQL column");
        assert.doesNotMatch(JSON.stringify(rows), new RegExp(Buffer.from(SECRET).toString("base64")));
        assert.deepEqual(stored.message, { workspaceId: message.workspaceId, to: { email: message.to.email }, from: { email: message.from.email }, subject: "Sign-in email (content redacted)", text: "Authentication content is not stored on public sites." });
      }
      assert.deepEqual(message.headers, { "X-Auth": SECRET }, "caller message was not mutated");
    });
  }

  test("step 1: public non-auth captures retain their content", async t => {
    const db = make();
    if (dialect === "sqlite") t.after(() => db.close());
    await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('capture-ws','Capture','capture',${AT})`);
    const capture = createMailCaptureRepo({ db, origin: registry("site.example") });
    await capture.capture({ message, lane: "transactional", idempotencyKey: "forms:notify:one" });
    assert.deepEqual((await capture.listCaptured({ workspaceId: "capture-ws" }))[0].message, message);
  });

  test("step 1: unexpected origin failure never stores an unredacted fallback", async t => {
    const db = make();
    if (dialect === "sqlite") t.after(() => db.close());
    const origin = registry("site.example");
    const failure = new Error("origin unavailable");
    origin.canonicalOrigin = async () => { throw failure; };
    const capture = createMailCaptureRepo({ db, origin });
    await assert.rejects(capture.capture({ message, lane: "transactional", idempotencyKey: "members:signin:hash" }), error => error === failure);
    assert.deepEqual(await db.query(sql`SELECT * FROM mail_capture`), []);
  });
  for (const mode of ["capture", "redirect"] as const) {
    test(`step 1: public ${mode} policy persists no sign-in secret`, async t => {
      const db = make();
      if (dialect === "sqlite") t.after(() => db.close());
      await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('capture-ws','Capture','capture',${AT})`);
      const capture = createMailCaptureRepo({ db, origin: registry("site.example") });
      const sent: typeof message[] = [];
      const wrap = createMailPolicyWrapper({ ledger: createMailSendLedgerRepo({ db }), suppression: { isSuppressed: async () => false, suppress: async () => {} }, readTestMode: async () => mode === "capture" ? { mode: "capture" } : { mode: "redirect", to: "operator@example.com" } }, { capture });
      const mailer = wrap({ providerId: "fixture", provider: { id: "fixture", label: "Fixture", credentialKeys: [], capabilities: { hosted: true, feedback: false, domainVerification: false }, create: () => assert.fail("unused") }, mailer: {
        capabilities: () => ({ driver: "fixture", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: true }),
        send: async outbound => { sent.push(outbound as typeof message); return { ok: true, providerMessageId: "sent", acceptedAt: AT }; }, sendBatch: async () => assert.fail("unused"),
      } });
      const result = await mailer.send(message, { workspaceId: message.workspaceId, idempotencyKey: "members:signin:hash", sourceContext: { module: "members" }, purpose: "transactional", lane: "interactive" });
      assert.equal(result.ok, true);
      assert.equal(sent.length, mode === "capture" ? 0 : 1);
      if (mode === "redirect") assert.equal(sent[0].to.email, "operator@example.com");
      for (const table of ["mail_capture", "mail_send_ledger"]) {
        const stored = await db.query(sql`SELECT * FROM ${sql.table(table)}`);
        assert.doesNotMatch(JSON.stringify(stored), new RegExp(SECRET));
        assert.doesNotMatch(JSON.stringify(stored), new RegExp(Buffer.from(SECRET).toString("base64")));
      }
    });
  }

});
