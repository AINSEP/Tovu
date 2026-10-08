import assert from "node:assert/strict";
import test from "node:test";

import type { HtmlFormDefinitionRecord as FormDefinitionRecord } from "@jini-ai/cms/forms";
import { resolveFormDefinitionByIdOrSlug } from "../resolve-definition.js";

/**
 * @file Direct tests for `resolveFormDefinitionByIdOrSlug`. The forms route suites reach it with a
 * lowercase slug and with a raw id; none checks the slug normalization (a URL carrying
 * `Contact-Form` or a trailing space must still resolve the `contact-form` definition), that slug
 * wins over id when both would match, or that the raw id is looked up UNnormalized.
 */

const WS = "workspace-local";

function definition(id: string, slug: string): FormDefinitionRecord {
  return { id, slug, workspaceId: WS } as unknown as FormDefinitionRecord;
}

function buildDeps(rows: FormDefinitionRecord[]) {
  const slugLookups: string[] = [];
  const idLookups: string[] = [];
  const deps = {
    workspaceId: WS,
    formDefinitionRepo: {
      async findBySlug(input: { workspaceId: string; slug: string }) {
        assert.equal(input.workspaceId, WS);
        slugLookups.push(input.slug);
        return rows.find((r) => r.slug === input.slug) ?? null;
      },
      async findById(input: { workspaceId: string; id: string }) {
        assert.equal(input.workspaceId, WS);
        idLookups.push(input.id);
        return rows.find((r) => r.id === input.id) ?? null;
      },
    },
  } as unknown as Parameters<typeof resolveFormDefinitionByIdOrSlug>[0];
  return { deps, slugLookups, idLookups };
}

test("resolveFormDefinitionByIdOrSlug: a mixed-case, padded slug in the URL resolves the lowercase slug", async () => {
  const { deps, slugLookups, idLookups } = buildDeps([definition("def-1", "contact-form")]);

  const found = await resolveFormDefinitionByIdOrSlug(deps, "  Contact-Form ");

  assert.equal(found?.id, "def-1");
  assert.deepEqual(slugLookups, ["contact-form"]);
  assert.deepEqual(idLookups, [], "a slug hit must not fall through to the id lookup");
});

test("resolveFormDefinitionByIdOrSlug: falls back to the raw, un-normalized id when no slug matches", async () => {
  const { deps, idLookups } = buildDeps([definition("Def-ABC", "newsletter")]);

  const found = await resolveFormDefinitionByIdOrSlug(deps, "Def-ABC");

  assert.equal(found?.slug, "newsletter");
  assert.deepEqual(idLookups, ["Def-ABC"]);
});

test("resolveFormDefinitionByIdOrSlug: when one row's slug equals another row's id, the slug wins", async () => {
  const { deps } = buildDeps([definition("shared", "other-slug"), definition("def-2", "shared")]);

  const found = await resolveFormDefinitionByIdOrSlug(deps, "shared");

  assert.equal(found?.id, "def-2");
});

test("resolveFormDefinitionByIdOrSlug: neither a slug nor an id is null", async () => {
  const { deps } = buildDeps([definition("def-1", "contact-form")]);

  assert.equal(await resolveFormDefinitionByIdOrSlug(deps, "nothing-here"), null);
});
