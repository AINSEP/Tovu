// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md (gap #4, forms half) — form
 * definition CRUD (`routes/forms/{create,update,get-by-id,list,list-submissions,get-submission,
 * delete-submission}.ts`) and the PUBLIC no-login submission (`public-http/routes/site/
 * forms-submit.ts`) through the REAL site composition on both dialects.
 *
 * Existing route tests use the hermetic root's in-memory form repos; `forms.journey.ts` (round 3)
 * drives the browser. Unproven over a real store until here: `fields` JSON round-tripping the
 * dialect, the `form_definitions` slug check (`repo.ts`), an anonymous submission landing in
 * `form_submissions` and listing for the admin, the per-window duplicate collapse
 * (`createOnce`), a disabled definition refusing submissions, and submission delete.
 *
 * Public submissions are intentionally unauthenticated; these requests carry no cookie.
 */

const FIELDS = [
  { id: "name", label: "Name", type: "text", required: true, maxLength: 80 },
  { id: "email", label: "Email", type: "email", required: false },
  { id: "subscribe", label: "Subscribe", type: "checkbox", required: false },
];

interface FormDto {
  id: string;
  name: string;
  slug: string;
  fields: Array<Record<string, unknown>>;
  status: string;
  notify: { enabled: boolean; recipients: string[] };
}

interface SubmissionDto {
  id: string;
  formDefinitionId: string;
  data: Record<string, unknown>;
}

async function createForm(site: BootedSite, slug: string): Promise<FormDto> {
  return (await expectJson<{ data: FormDto }>(await send(site, "POST", `${site.ws}/forms`, { name: "Unrun Contact", slug, fields: FIELDS }), 201)).data;
}

async function submitPublic(site: BootedSite, slug: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${site.baseUrl}/forms/${slug}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

async function submissions(site: BootedSite, formId: string): Promise<{ data: SubmissionDto[]; nextCursor: string | null }> {
  return expectJson(await send(site, "GET", `${site.ws}/forms/${formId}/submissions`), 200);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] forms [${dialect}]: a definition's fields round-trip the dialect through create, get, list and PUT; a duplicate slug is 409 FORMS_SLUG_CONFLICT`, async (t) => {
    const site = await bootSite(t, dialect);
    const form = await createForm(site, "unrun-contact");
    assert.deepEqual({ slug: form.slug, status: form.status, fields: form.fields }, { slug: "unrun-contact", status: "active", fields: FIELDS });

    const one = await expectJson<{ data: FormDto }>(await send(site, "GET", `${site.ws}/forms/${form.id}`), 200);
    assert.deepEqual(one.data, form, "a read-back returns exactly what create answered");
    const listed = await expectJson<{ data: FormDto[] }>(await send(site, "GET", `${site.ws}/forms`), 200);
    assert.ok(listed.data.some((row) => row.id === form.id));

    const renamed = await expectJson<{ data: FormDto }>(
      await send(site, "PUT", `${site.ws}/forms/${form.id}`, { name: "Unrun Contact v2", fields: [...FIELDS, { id: "message", label: "Message", type: "textarea", required: true }] }),
      200
    );
    assert.equal(renamed.data.name, "Unrun Contact v2");
    assert.deepEqual(renamed.data.fields.map((field) => field.id), ["name", "email", "subscribe", "message"]);

    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/forms`, { name: "Clash", slug: "unrun-contact", fields: FIELDS }), 409), {
      error: "a form with slug 'unrun-contact' already exists",
      code: "FORMS_SLUG_CONFLICT",
      details: { slug: "unrun-contact" },
    });
    assert.deepEqual(await expectJson(await send(site, "GET", `${site.ws}/forms/no-such-form`), 404), {
      error: "form definition 'no-such-form' was not found",
      code: "FORMS_DEFINITION_NOT_FOUND",
    });
  });

  test(`[unrun] forms [${dialect}]: an anonymous submission is accepted, stored with only declared keys, and listed for the admin; an identical resubmit collapses into one row`, async (t) => {
    const site = await bootSite(t, dialect);
    const form = await createForm(site, "unrun-signup");
    const answers = { name: "Zoë Ünrun <b>bold</b>", email: "zoe@example.test", subscribe: true };

    assert.deepEqual(await expectJson(await submitPublic(site, form.slug, answers), 201), { status: "accepted" });
    assert.deepEqual(await expectJson(await submitPublic(site, form.slug, answers), 201), { status: "accepted" }, "a double submit still answers accepted");

    const page = await submissions(site, form.id);
    assert.equal(page.data.length, 1, "the duplicate collapsed into the first row");
    assert.deepEqual(page.data[0].data, answers, "markup is stored as text, booleans stay booleans");
    assert.equal(page.data[0].formDefinitionId, form.id);

    const one = await expectJson<{ data: SubmissionDto }>(await send(site, "GET", `${site.ws}/forms/${form.id}/submissions/${page.data[0].id}`), 200);
    assert.deepEqual(one.data, page.data[0]);
  });

  test(`[unrun] forms [${dialect}]: validation failures are 400 with field errors and store nothing; the honeypot is accepted silently and stores nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const form = await createForm(site, "unrun-validate");

    const missing = await expectJson(await submitPublic(site, form.slug, { email: "a@example.test" }), 400);
    assert.deepEqual(missing, {
      error: "submission failed field validation",
      code: "FORMS_SUBMISSION_VALIDATION_ERROR",
      details: { fieldErrors: [{ field: "name", reason: "required" }] },
    });
    const unknownKey = await expectJson<{ code: string; details: { fieldErrors: Array<{ field: string; reason: string }> } }>(
      await submitPublic(site, form.slug, { name: "Ok", __proto_trick: "x" }),
      400
    );
    assert.equal(unknownKey.code, "FORMS_SUBMISSION_VALIDATION_ERROR");
    assert.deepEqual(unknownKey.details.fieldErrors, [{ field: "__proto_trick", reason: "unregistered_key" }]);
    const tooLong = await expectJson<{ details: { fieldErrors: Array<{ field: string; reason: string }> } }>(await submitPublic(site, form.slug, { name: "x".repeat(81) }), 400);
    assert.deepEqual(tooLong.details.fieldErrors, [{ field: "name", reason: "too_long" }]);

    assert.deepEqual(await expectJson(await submitPublic(site, form.slug, { name: "Bot", _hp: "filled" }), 201), { status: "accepted" });
    assert.deepEqual((await submissions(site, form.id)).data, [], "neither refused nor honeypot submissions were stored");
    assert.deepEqual(await expectJson(await submitPublic(site, "no-such-form", { name: "x" }), 404), {
      error: "form 'no-such-form' was not found",
      code: "FORMS_DEFINITION_NOT_FOUND",
    });
  });

  test(`[unrun] forms [${dialect}]: a disabled form refuses public submissions as not found; re-enabling accepts again; deleting a submission removes it from the list`, async (t) => {
    const site = await bootSite(t, dialect);
    const form = await createForm(site, "unrun-toggle");

    const disabled = await expectJson<{ data: FormDto }>(await send(site, "PUT", `${site.ws}/forms/${form.id}`, { status: "disabled" }), 200);
    assert.equal(disabled.data.status, "disabled");
    assert.deepEqual(await expectJson(await submitPublic(site, form.slug, { name: "Late" }), 404), {
      error: "form 'unrun-toggle' was not found",
      code: "FORMS_DEFINITION_NOT_FOUND",
    });

    await expectJson(await send(site, "PUT", `${site.ws}/forms/${form.id}`, { status: "active" }), 200);
    await expectJson(await submitPublic(site, form.slug, { name: "Back" }), 201);
    const [row] = (await submissions(site, form.id)).data;
    assert.deepEqual(row.data, { name: "Back" });

    const deleted = await send(site, "DELETE", `${site.ws}/forms/${form.id}/submissions/${row.id}`);
    assert.equal(deleted.status, 204);
    assert.deepEqual((await submissions(site, form.id)).data, []);
    assert.deepEqual(await expectJson(await send(site, "GET", `${site.ws}/forms/${form.id}/submissions/${row.id}`), 404), {
      error: `submission '${row.id}' was not found`,
      code: "FORMS_SUBMISSION_NOT_FOUND",
    });
  });
}
