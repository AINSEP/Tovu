import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryFormDefinitionRepo } from "#src/forms/repo.memory";
import type { FormDefinitionRecord } from "#src/forms/index";
import { createContactFormResolver } from "../../resolvers/index.js";
import type { WidgetInstanceView, WidgetResolveContext } from "../../types.js";

/**
 * @file `contact-form` widget resolver (SPEC-043 REQ-36..39) — direct unit coverage of
 * `createContactFormResolver`'s own branches. `resolve-html-page-embeds.integration.test.ts`
 * already exercises the happy path and the "disabled definition" degrade through the full
 * `resolveHtmlPageEmbeds` pipeline; this file adds the two branches that pipeline doesn't reach on
 * its own: a missing/invalid `formDefinitionId` in the instance config, a definition that is not
 * FOUND at all (as opposed to found-but-disabled), and the optional `successMessage` passthrough.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(overrides: Partial<WidgetInstanceView> & Pick<WidgetInstanceView, "id">): WidgetInstanceView {
  return { widgetType: "contact-form", config: {}, ...overrides };
}

function definition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "form-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("REQ-38: a config with no formDefinitionId resolves invalid-config, never calls the repo", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  const resolver = createContactFormResolver({ formDefinitionRepo: repo });

  const results = await resolver.resolveMany([instance({ id: "w-1", config: {} })], CTX);

  const result = results.get("w-1");
  assert.deepEqual(result, { ok: false, reason: "invalid-config" });
});

test("REQ-38: a non-string formDefinitionId resolves invalid-config", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  const resolver = createContactFormResolver({ formDefinitionRepo: repo });

  const results = await resolver.resolveMany(
    [instance({ id: "w-1", config: { formDefinitionId: 42 } })],
    CTX,
  );

  const result = results.get("w-1");
  assert.deepEqual(result, { ok: false, reason: "invalid-config" });
});

test("REQ-38/EC-05: a formDefinitionId that resolves to no definition at all degrades to target-disabled, same as a disabled one", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  const resolver = createContactFormResolver({ formDefinitionRepo: repo });

  const results = await resolver.resolveMany(
    [instance({ id: "w-1", config: { formDefinitionId: "does-not-exist" } })],
    CTX,
  );

  const result = results.get("w-1");
  assert.deepEqual(result, { ok: false, reason: "target-disabled" });
});

test("REQ-37: an active definition's successMessage config, when a string, is passed through in the resolved IR props", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  await repo.create(definition());
  const resolver = createContactFormResolver({ formDefinitionRepo: repo });

  const results = await resolver.resolveMany(
    [instance({ id: "w-1", config: { formDefinitionId: "form-1", successMessage: "Thanks!" } })],
    CTX,
  );

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.equal(result.ir.props.successMessage, "Thanks!");
});

test("REQ-37: an active definition with no successMessage config resolves successMessage: null, not undefined", async () => {
  const repo = new InMemoryFormDefinitionRepo();
  await repo.create(definition());
  const resolver = createContactFormResolver({ formDefinitionRepo: repo });

  const results = await resolver.resolveMany(
    [instance({ id: "w-1", config: { formDefinitionId: "form-1" } })],
    CTX,
  );

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.equal(result.ir.props.successMessage, null);
});
