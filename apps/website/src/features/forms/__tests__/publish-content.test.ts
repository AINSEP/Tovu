import assert from "node:assert/strict";
import test from "node:test";

import { makeSite, registerOnly, roundTrip, packAll, plan, applyReport, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { contributeFormPublish } from "../publish-content.js";
import { InMemoryFormDefinitionRepo } from "@jini-ai/cms/forms";
import type { FormDefinitionRecord, HtmlFormDefinitionRecord } from "@jini-ai/cms/forms";

function form(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "src-form-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
    notify: { enabled: true, recipients: ["owner@example.com"] },
    status: "disabled",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

async function sites(sourceRows: FormDefinitionRecord[]) {
  registerOnly([contributeFormPublish()]);
  const sourceRepo = new InMemoryFormDefinitionRepo();
  for (const row of sourceRows) await sourceRepo.create(row);
  const destRepo = new InMemoryFormDefinitionRepo();
  return { source: makeSite({ form: { repo: sourceRepo } }, "src"), dest: makeSite({ form: { repo: destRepo } }, "dst"), sourceRepo, destRepo };
}

test("form round trip: created on an empty destination, then unchanged, keyed by slug", async () => {
  const { source, dest, destRepo } = await sites([form(), form({ id: "src-form-2", slug: "signup", name: "Signup", status: "active" })]);
  const { first, second, entities, destinationPack } = await roundTrip(source, dest);

  assert.deepEqual(first.rows.map((r) => [r.entityId, r.outcome]), [["contact", "created"], ["signup", "created"]]);
  assert.deepEqual(second.rows.map((r) => r.outcome), ["unchanged", "unchanged"]);
  assert.deepEqual(destinationPack.map((e) => e.contentHash), entities.map((e) => e.contentHash));
  const landed = await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  assert.equal(landed?.status, "disabled");
  assert.deepEqual(landed?.notify, { enabled: false, recipients: [] });
  assert.notEqual(landed?.id, "src-form-1", "the destination mints its own id; slug is the address");
});

test("form: a destination edit after the plan is a conflict, not an overwrite", async () => {
  const { source, dest, destRepo } = await sites([form()]);
  const entities = await packAll(source);
  const report = await plan(entities, dest);
  await destRepo.create(form({ id: "dst-form-9", name: "Someone else's" }));
  await assert.rejects(applyReport(report, entities, dest), (err: Error & { rowOutcome?: string }) => {
    assert.equal(err.rowOutcome, "conflict");
    assert.match(err.message, /expected no existing row/);
    return true;
  });
});

test("form: a slug held only by a trashed destination form is refused at precheck", async () => {
  const { source, dest, destRepo } = await sites([form()]);
  await destRepo.save({ ...form({ id: "dst-trashed" }), deletedAt: "2026-09-20T00:00:00.000Z", version: 2 });
  const report = await plan(await packAll(source), dest);
  assert.equal(report.rows[0]?.outcome, "blocked");
  assert.match(report.rows[0]?.reason ?? "", /trash/i);
});

test("form: submissions never pack, and packed state carries no instance-local fields", async () => {
  const { source } = await sites([form()]);
  const [entity] = await packAll(source);
  assert.deepEqual(Object.keys(entity!.state).sort(), ["fields", "html", "mode", "name", "provider", "slug", "status"]);
});

test("form: a changed source form updates the destination row in place (forced past the no-baseline conflict)", async () => {
  const { source, dest, sourceRepo, destRepo } = await sites([form()]);
  await roundTrip(source, dest);
  const before = await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  await sourceRepo.update(form({ name: "Contact us", status: "active", fields: [...form().fields, { id: "msg", label: "Message", type: "textarea", required: false }] }));

  const entities = await packAll(source);
  const report = await plan(entities, dest, ["form:contact"]);
  assert.equal(report.rows[0]?.outcome, "forced");
  await applyReport(report, entities, dest);

  const after = await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  assert.equal(after?.id, before?.id);
  assert.equal(after?.name, "Contact us");
  assert.equal(after?.status, "active");
  assert.equal(after?.fields.length, 2);
  assert.deepEqual((await plan(await packAll(source), dest)).rows.map((r) => r.outcome), ["unchanged"]);
});

test('HTML form transfers markup and hashes HTML-only changes while recipients stay local', async () => {
  const html = '<label>Email<input name="email" type="email" required></label><p>I agree to the stated consent.</p>';
  const authored = { ...form(), mode: 'html' as const, html };
  const { source, dest, sourceRepo, destRepo } = await sites([authored]);
  const [packed] = await packAll(source);
  assert.equal(packed!.state.mode, 'html');
  assert.equal(packed!.state.html, html);
  assert.equal('notify' in packed!.state, false);
  await roundTrip(source, dest);
  const landed = await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: 'contact' });
  assert.equal((landed as typeof authored).html, html);
  assert.deepEqual(landed!.notify.recipients, []);
  const updated: HtmlFormDefinitionRecord = { ...authored, html: html + '<p>New consent wording.</p>' };
  await sourceRepo.update(updated);
  const [changed] = await packAll(source);
  assert.notEqual(changed!.contentHash, packed!.contentHash);
});

test('a form update keeps destination notification recipients and recipients do not affect transfer hashes', async () => {
  const { source, dest, sourceRepo, destRepo } = await sites([form()]);
  await destRepo.create(form({ id: 'dest', notify: { enabled: true, recipients: ['destination@example.com'] } }));
  const [before] = await packAll(source);
  await sourceRepo.update(form({ notify: { enabled: true, recipients: ['other-source@example.com'] } }));
  const entities = await packAll(source);
  assert.equal(entities[0]!.contentHash, before!.contentHash);
  await sourceRepo.update(form({ name: 'Updated source' }));
  const changed = await packAll(source);
  await applyReport(await plan(changed, dest, ['form:contact']), changed, dest);
  assert.deepEqual((await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: 'contact' }))!.notify.recipients, ['destination@example.com']);
});

test('a legacy Builder source replaces HTML and external collection at the destination', async () => {
  const { source, dest, destRepo } = await sites([form({ name: 'Legacy Builder' })]);
  const destination = { ...form({ id: 'destination' }), mode: 'html' as const,
    html: '<input type="email" name="email" required>', provider: { id: 'formspree', config: { endpoint: 'https://formspree.io/f/abcd' } } };
  await destRepo.create(destination);
  const entities = await packAll(source);
  await applyReport(await plan(entities, dest, ['form:contact']), entities, dest);
  const landed = await destRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: 'contact' }) as typeof destination;
  assert.equal(landed.mode, 'builder');
  assert.equal(landed.html ?? '', '');
  assert.deepEqual(landed.provider, { id: 'builtin', config: {} });
  const [after] = await packAll(dest);
  assert.equal(after!.contentHash, entities[0]!.contentHash);
});
