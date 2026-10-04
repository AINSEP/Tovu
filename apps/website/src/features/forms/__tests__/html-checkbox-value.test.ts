import assert from "node:assert/strict";
import test from "node:test";
import { deriveHtmlForm } from "../html-authoring.js";
import { createFormDefinition } from "../write-service.js";
import { submitForm } from "../submit-service.js";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory.js";
import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { FormSubmissionValidationError } from "@jini-ai/cms-forms";

test("HTML save and submission preserve authored checkbox strings, including empty/on; default remains true", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  const submissions = new InMemoryFormSubmissionRepo();
  let id = 0;
  const clock = { nowMs: () => 1_000 };
  const idGen = { newId: () => `checkbox-${++id}` };
  const outbox = new InMemoryOutbox();
  const { definition } = await createFormDefinition({ deps: {
    repo, clock, idGen, executeCommand, changeSets: new InMemoryChangeSetRepo(), authorize: async () => ({ allowed: true, reason: "owner" }),
  }, input: { workspaceId: "ws", actor: { id: "owner", kind: "user" }, name: "Consent", slug: "consent", mode: "html", fields: [],
    html: '<label>Consent<input type="checkbox" name="consent" value="yes" required></label><input type="checkbox" name="native"><input type="checkbox" name="empty" value=""><input type="checkbox" name="onvalue" value="on">',
  } });
  const stored = await repo.findById({ workspaceId: "ws", id: definition.id });
  assert.match((stored as { html?: string })?.html ?? "", /value="yes"/);
  assert.match((stored as { html?: string })?.html ?? "", /value="yes" required>/);
  const deps = { definitionRepo: repo, submissionRepo: submissions, clock, idGen, outbox, bus: new InMemoryEventBus(), rateLimiter: { check: async () => ({ allowed: true as const }) } };
  const input = { workspaceId: "ws", slug: "consent", sourceIp: "127.0.0.1", body: { consent: "yes", native: "on", empty: "", onvalue: "on" } };
  await submitForm({ deps, input });
  assert.deepEqual((await submissions.listByDefinition({ workspaceId: "ws", formDefinitionId: definition.id, limit: 10 })).items[0].data,
    { consent: "yes", native: true, empty: "", onvalue: "on" });
  await assert.rejects(submitForm({ deps, input: { ...input, body: {} } }), FormSubmissionValidationError);
  assert.equal(deriveHtmlForm({ html: '<input type="checkbox" name="consent" value="yes">' }).fields[0].type, "checkbox");
});

test("required syntax remains authored, and control-looking strings inside scripts are untouched", () => {
  const html = '<input name="first" required><input name="second" REQUIRED=required><script>const example = \'<input name="fake" required="">\';</script>';
  const authored = deriveHtmlForm({ html });
  assert.match(authored.html, /name="first" required>/);
  assert.match(authored.html, /name="second" REQUIRED=required>/);
  assert.match(authored.html, /<script>const example = '<input name="fake" required="">';<\/script>/);
  assert.deepEqual(authored.fields.map((field) => field.id), ["first", "second"]);
});
