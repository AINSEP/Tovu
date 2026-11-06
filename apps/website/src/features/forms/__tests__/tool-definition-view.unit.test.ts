import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormAuthoring, type FormDefinitionRecord } from "@jini-ai/cms/forms";
import { executeCommand, InMemoryChangeSetRepo } from "../../../contracts/core/commands/index.js";
import { buildFormsRegistrations, type FormsToolDeps } from "../tool-registrations.js";

test("definition listing omits stored HTML while retaining authoring metadata", async () => {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const base = {
    workspaceId: "ws", fields: [], notify: { enabled: false, recipients: [] }, status: "active" as const,
    createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z", version: 1,
  };
  const records: Array<FormDefinitionRecord & FormAuthoring> = [
    { ...base, id: "html", name: "HTML form", slug: "html", mode: "html", html: '<label>Message <input name="message"></label>' },
    { ...base, id: "builder", name: "Builder form", slug: "builder", mode: "builder", html: "" },
    { ...base, id: "legacy", name: "Legacy form", slug: "legacy" },
  ];
  for (const record of records) await formDefinitionRepo.create(record);
  const deps: FormsToolDeps = {
    workspaceId: "ws", executeCommand, clock: { nowMs: () => 0 }, idGen: { newId: () => "unused" },
    authorize: async () => ({ allowed: true, reason: "owner" }), changeSets: new InMemoryChangeSetRepo(),
    formDefinitionRepo, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
  };
  const tool = buildFormsRegistrations(deps).find(item => item.descriptor.id === "forms_list_definitions");
  assert.ok(tool);
  const context: ToolExecutionContext = { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: {}, signal: new AbortController().signal };
  const result = await tool.handler(context);
  assert.deepEqual(result, { definitions: records.map(({ id, name, slug, status, fields, notify, mode }) => ({
    id, name, slug, status, fields, notify,
    ...(mode === undefined ? {} : { mode }),
  })) });
});
