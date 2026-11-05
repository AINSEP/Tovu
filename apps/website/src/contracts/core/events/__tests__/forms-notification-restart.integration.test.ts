import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { sql } from "kysely";
import { registerFormNotifySubscriber } from "@jini-ai/cms/forms";
import type { MailProviderModule, MailSendLedgerPort } from "@jini-ai/platform/mail";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "#src/features/forms/repo.sqlite";
import { createMailSendLedgerRepo } from "#src/features/mail/ledger.repo";
import { createMailSuppressionRepo } from "#src/features/mail/suppression.repo";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { dropDatabase, freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import { closeSqliteConnection, openPostgresKernel, openSqliteFileKernel } from "#src/platform/db/kernel/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlOutboxAdapter } from "#src/platform/db/repos/outbox-repo";
import type { MailerPort, MailerSendOptions, OutboundEmail } from "#src/platform/mail/index";
import { createMailPolicyWrapper } from "#src/server/runtime/boot/mail-delivery-policy";
import { InMemoryEventBus, processOutbox } from "../index.js";

const T0 = "2026-11-05T00:00:00.000Z";
const WS = "mail-restart-fixture";
const source = { id: "source", name: "form.submission.received", workspaceId: WS, occurredAt: T0,
  payload: { workspaceId: WS, formDefinitionId: "form", submissionId: "submission" } };
const sender = { email: "configured@example.test", name: "Configured sender" };
const jobId = (recipient: string) => `forms:notify:submission:${recipient}`;

/** New connections and runtime objects on each boot; only the on-disk/server state survives. */
async function store(t: TestContext, dialect: "sqlite" | "postgres", suffix: string) {
  const dir = mkdtempSync(join(tmpdir(), "tovu-form-mail-"));
  const filePath = join(dir, "content.db");
  const database = `tovu_mail_restart_${suffix}`;
  let open: () => ContentKernel;
  if (dialect === "sqlite") {
    closeSqliteConnection(openContentDb(filePath));
    open = () => openSqliteFileKernel(filePath);
  } else {
    const connectionString = freshPostgresContentDatabase(database);
    open = () => openPostgresKernel({ connectionString });
  }
  let db = open();
  t.after(async () => {
    await db.close();
    if (dialect === "postgres") dropDatabase({ database });
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, restart: async () => { await db.close(); db = open(); return db; } };
}

async function seed(db: ContentKernel, recipients: string[]) {
  await db.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES (${WS}, 'Mail fixture', ${WS}, ${T0})`);
  await new SqliteFormDefinitionRepo(db).create({ id: "form", workspaceId: WS, slug: "contact", name: "Contact", fields: [],
    notify: { enabled: true, recipients }, version: 1, status: "active", createdAt: T0, updatedAt: T0 });
  await new SqliteFormSubmissionRepo(db).create({ id: "submission", workspaceId: WS, formDefinitionId: "form",
    data: { message: "fixture answer" }, sourceIp: null, submittedAt: T0 });
}

async function boot(db: ContentKernel, send: MailerPort["send"], ledger = createMailSendLedgerRepo({ db })) {
  const bus = new InMemoryEventBus(), outbox = new SqlOutboxAdapter(db);
  const capabilities = () => ({ driver: "fixture", supportsIdempotencyKey: false, supportsWebhookFeedback: false,
    supportsAttachments: false, maxBatchSize: 1 });
  const provider: MailProviderModule = { id: "fixture", label: "Fixture", credentialKeys: [],
    capabilities: { hosted: true, feedback: false, domainVerification: false }, create: () => { throw new Error("unused"); } };
  const mailer = createMailPolicyWrapper({ ledger, suppression: createMailSuppressionRepo({ db }), readTestMode: async () => ({ mode: "off" }) })({
    providerId: "fixture", provider, mailer: { capabilities, send, sendBatch: async () => { throw new Error("unused"); } },
  });
  const stop = await registerFormNotifySubscriber({ bus, outbox, sender, logger: { warn() {} },
    formDefinitionRepo: new SqliteFormDefinitionRepo(db), formSubmissionRepo: new SqliteFormSubmissionRepo(db),
    mailer: { send: ({ message, options }) => mailer.send(message, options) } });
  return { bus, outbox, mailer, stop, drain: (at: number) => processOutbox({ bus, outbox, clock: { nowMs: () => at } }, { random: () => 0 }) };
}

async function rows(db: ContentKernel) {
  return db.run(query => query.selectFrom("outbox_events").select(["id", "status", "attempts", "next_attempt_at", "last_error", "event_json"]).execute());
}

for (const dialect of ["sqlite", "postgres"] as const) {
  test(`${dialect}: persisted notifications survive restart, honour 429 delay and stop uncertain resend`, async t => {
    const storage = await store(t, dialect, "outcomes");
    const recipients = ["sent@example.test", "limited@example.test", "unknown@example.test"];
    await seed(storage.db, recipients);
    await new SqlOutboxAdapter(storage.db).enqueue(source);
    const calls: { message: OutboundEmail; options: MailerSendOptions }[] = [];
    const send: MailerPort["send"] = async (message, options) => {
      calls.push({ message, options });
      const recipient = message.to.email;
      if (recipient === "unknown@example.test") return { ok: false, unknown: true, retryable: true, errorCode: "MAIL_OUTCOME_UNKNOWN", message: "provider secret" };
      if (recipient === "limited@example.test" && calls.filter(call => call.message.to.email === recipient).length === 1)
        return { ok: false, retryable: true, retryAfterMs: 900_000, errorCode: "MAIL_RATE_LIMITED", message: "provider secret" };
      return { ok: true, providerMessageId: `receipt:${recipient}`, acceptedAt: T0 };
    };
    let db = await storage.restart();
    let runtime = await boot(db, send);
    assert.equal(await runtime.drain(Date.parse(T0)), 1, "the source survives the first restart");
    assert.equal(calls.length, 0, "source planning never sends mail inline");
    await runtime.bus.publish(source); // Source replay must not duplicate recipient jobs.
    const planned = (await rows(db)).filter(row => row.id !== "source");
    assert.deepEqual(planned.map(row => row.id).sort(), recipients.map(jobId).sort());
    assert.ok(planned.every(row => !row.event_json.includes("fixture answer")));
    await runtime.stop();
    db = await storage.restart();
    runtime = await boot(db, send);
    assert.equal(await runtime.drain(Date.parse(T0)), 3, "recipient jobs survive a second restart");
    const delivered = new Map((await rows(db)).map(row => [row.id, row]));
    assert.equal(delivered.get(jobId(recipients[0]!))?.status, "delivered");
    assert.equal(delivered.get(jobId(recipients[1]!))?.status, "pending");
    assert.equal(delivered.get(jobId(recipients[1]!))?.next_attempt_at, "2026-11-05T00:15:00.000Z");
    assert.equal(delivered.get(jobId(recipients[2]!))?.status, "failed");
    assert.match(delivered.get(jobId(recipients[2]!))?.last_error ?? "", /outcome is unknown/);
    assert.ok([...delivered.values()].every(row => !row.last_error?.includes("provider secret")));
    assert.ok(calls.every(call => JSON.stringify(call.message.from) === JSON.stringify(sender) && call.options.lane === "notification"));
    await runtime.stop();
    db = await storage.restart();
    runtime = await boot(db, send);
    assert.equal(await runtime.drain(Date.parse(T0) + 899_999), 0);
    assert.equal(await runtime.drain(Date.parse(T0) + 900_000), 1, "only the definitive failure retries");
    const uncertain = calls.find(call => call.message.to.email === "unknown@example.test")!;
    const replay = await runtime.mailer.send(uncertain.message, uncertain.options);
    assert.equal(replay.ok, false);
    assert.ok(!replay.ok && replay.unknown);
    assert.deepEqual(calls.map(call => call.message.to.email).sort(), [...recipients, "limited@example.test"].sort());
    const evidence = await db.query<{ recipient: string; outcome: string }>(sql`SELECT recipient, outcome FROM mail_send_ledger ORDER BY recipient`);
    assert.deepEqual(evidence, [{ recipient: "limited@example.test", outcome: "sent" }, { recipient: "sent@example.test", outcome: "sent" }, { recipient: "unknown@example.test", outcome: "unknown" }]);
    assert.equal(await runtime.drain(Date.parse("2099-01-01")), 0);
    await runtime.stop();
  });

  test(`${dialect}: restart after acceptance before ledger mark does not send twice`, async t => {
    const storage = await store(t, dialect, "acceptance");
    await seed(storage.db, ["accepted@example.test"]);
    const ledger = createMailSendLedgerRepo({ db: storage.db });
    const interrupted: MailSendLedgerPort = { reserve: ledger.reserve, mark: async () => { throw new Error("process interrupted before mark"); } };
    let calls = 0;
    const send: MailerPort["send"] = async () => { calls++; return { ok: true, providerMessageId: "accepted", acceptedAt: T0 }; };
    const first = await boot(storage.db, send, interrupted);
    await first.outbox.enqueue(source);
    await first.drain(Date.parse(T0));
    await first.drain(Date.parse(T0));
    assert.equal(calls, 1);
    assert.equal((await rows(storage.db)).find(row => row.id === jobId("accepted@example.test"))?.status, "pending");
    await first.stop();
    const db = await storage.restart();
    const next = await boot(db, send);
    assert.equal(await next.drain(Date.parse("2026-11-06T00:00:00Z")), 1);
    assert.equal(calls, 1, "a reserved ledger identity is uncertain after restart");
    const job = (await rows(db)).find(row => row.id === jobId("accepted@example.test"));
    assert.equal(job?.status, "failed");
    assert.match(job?.last_error ?? "", /outcome is unknown/);
    assert.deepEqual(await db.query(sql`SELECT outcome FROM mail_send_ledger`), [{ outcome: "reserved" }]);
    await next.stop();
  });
}
