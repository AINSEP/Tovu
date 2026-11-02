/**
 * @file `useCreateWebsiteForm` rendered from its real module under jsdom, with the two credential
 * inputs rendered from the hook's own refs so the read-then-wipe of each secret is observed on real
 * DOM nodes. Moved from `App.hooks.render.test.ts` with the split; the pure rules are tested in
 * `use-create-website-form.hooks.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import type { CreateSiteInput } from '../contracts/project.js';
import { SITE_NAME_ERROR } from '../contracts/site-name.js';
import { deferred, renderHookWithView as renderHook, settle, type TestContext } from './app-hooks.test-support.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useCreateWebsiteForm } from './use-create-website-form.hooks.js';
import { canSubmitRename, renameSubmission } from './use-site-rename.hooks.js';

function formHarness(t: TestContext, onCreate: (input: CreateSiteInput) => Promise<void>, { withInputs = true } = {}) {
  const hook = renderHook(t, () => useCreateWebsiteForm(onCreate), (form) => (withInputs ? createElement('div', null,
    createElement('input', { id: 'supabase-key', ref: form.supabaseKeyRef }),
    createElement('input', { id: 'custom-credential', ref: form.customCredentialRef })) : null));
  const submit = () => {
    let prevented = 0;
    act(() => { void hook.current().handleSubmit({ preventDefault: () => { prevented++; } } as never); });
    return prevented;
  };
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  return { hook, submit, field };
}

test('useCreateWebsiteForm: an invalid name explains itself on submit and an empty one never enables Create', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); });
  assert.deepEqual([hook.current().canCreate, hook.current().nameError], [false, null]);
  assert.equal(submit(), 1);
  assert.equal(hook.current().formError, SITE_NAME_ERROR);
  act(() => hook.current().setName('   '));
  assert.equal(hook.current().nameError, SITE_NAME_ERROR);
  act(() => hook.current().setName('!!!'));
  assert.deepEqual([hook.current().slug, hook.current().canCreate], ['', false]);
  submit();
  await settle();
  assert.deepEqual(created, [], 'a name with no letters or digits cannot be created');
});

test('useCreateWebsiteForm: Supabase needs a URL and a typed key; the key is read once and wiped before the call', async (t) => {
  const created: CreateSiteInput[] = [];
  const pending = deferred<void>();
  const { hook, submit, field } = formHarness(t, async (input) => { created.push(input); await pending.promise; });
  act(() => { hook.current().setName('Café Münster'); hook.current().setDatabase('supabase'); });
  assert.equal(hook.current().canCreate, false);
  act(() => hook.current().setSupabaseUrl(' https://db.example '));
  assert.equal(hook.current().canCreate, false, 'a URL without a key is not ready');
  field('supabase-key').value = 'secret-from-dom';
  act(() => hook.current().setHasSupabaseKey(true));
  assert.equal(hook.current().canCreate, true);
  submit();
  assert.equal(hook.current().isSubmitting, true);
  assert.equal(field('supabase-key').value, '', 'the DOM gives the secret up before the request starts');
  submit();
  pending.resolve();
  await settle();
  assert.equal(created.length, 1, 'a second submit while one is running is ignored');
  assert.deepEqual(created[0]!.database, { kind: 'supabase', endpoint: 'https://db.example', credential: 'secret-from-dom' });
  assert.equal(hook.current().isSubmitting, false);
});

test('useCreateWebsiteForm: a custom provider needs a label and a connection; a failed create shows the reason', async (t) => {
  const { hook, submit, field } = formHarness(t, async () => { throw new Error("Error invoking remote method 'site:create': Error: folder exists"); });
  act(() => { hook.current().setName('Shop'); hook.current().setDatabase('custom'); hook.current().setCustomProvider('Neon'); });
  assert.equal(hook.current().canCreate, false);
  act(() => { hook.current().setCustomConnection('postgres://db'); hook.current().setHasCustomCredential(true); });
  assert.equal(hook.current().canCreate, true);
  field('custom-credential').value = 'custom-from-dom';
  submit();
  await settle();
  assert.equal(field('custom-credential').value, '');
  assert.equal(hook.current().formError, 'folder exists');
  assert.equal(hook.current().isSubmitting, false);
});

test('useCreateWebsiteForm: with the credential inputs unmounted a SQLite site still submits with no credential', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); }, { withInputs: false });
  act(() => hook.current().setName('Blog'));
  submit();
  await settle();
  assert.deepEqual(created, [{ displayName: 'Blog', database: { kind: 'sqlite' } }]);
  assert.equal(hook.current().formError, null);
});

test('useCreateWebsiteForm: a valid name shows no error, and Create stays off until the chosen database is ready', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); });
  act(() => { hook.current().setName('Shop'); hook.current().setDatabase('supabase'); });
  assert.deepEqual([hook.current().nameError, hook.current().slug, hook.current().canCreate], [null, 'shop', false]);
  assert.equal(submit(), 1);
  await settle();
  assert.deepEqual([created, hook.current().formError, hook.current().isSubmitting], [[], null, false],
    'a submit before the form is ready does nothing and explains nothing');
});

test('useCreateWebsiteForm: a name over the length limit is refused even though it has a usable slug', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); });
  act(() => hook.current().setName('a'.repeat(201)));
  assert.equal(hook.current().slug.length, 201);
  assert.deepEqual([hook.current().nameError, hook.current().canCreate], [SITE_NAME_ERROR, false]);
  submit();
  await settle();
  assert.deepEqual([created, hook.current().formError], [[], SITE_NAME_ERROR]);
  act(() => hook.current().setName('a'.repeat(200)));
  assert.deepEqual([hook.current().nameError, hook.current().canCreate], [null, true], 'exactly at the limit is accepted');
});

test('useCreateWebsiteForm: a custom provider label or connection that is only spaces is not ready', (t) => {
  const { hook } = formHarness(t, async () => {});
  act(() => { hook.current().setName('Shop'); hook.current().setDatabase('custom'); hook.current().setCustomProvider('  '); hook.current().setCustomConnection('postgres://db'); });
  assert.equal(hook.current().canCreate, false);
  act(() => { hook.current().setCustomProvider('Neon'); hook.current().setCustomConnection('   '); });
  assert.equal(hook.current().canCreate, false);
});

test('useCreateWebsiteForm: a Supabase key without a URL is not ready', (t) => {
  const { hook } = formHarness(t, async () => {});
  act(() => { hook.current().setName('Shop'); hook.current().setDatabase('supabase'); hook.current().setHasSupabaseKey(true); hook.current().setSupabaseUrl('   '); });
  assert.equal(hook.current().canCreate, false);
});

// D-02/D-17: Create and Rename are two ways of naming the same site, so they refuse the same drafts
// locally with the same exact inline sentence, and accept the same ones.
test('useCreateWebsiteForm: Create refuses the drafts Rename refuses, with the same message, and accepts the ones it accepts', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); });
  for (const name of ['   ', 'x'.repeat(201)]) {
    act(() => hook.current().setName(name));
    assert.deepEqual([hook.current().canCreate, hook.current().nameError], [false, SITE_NAME_ERROR], `${name.length} characters`);
    submit();
    await settle();
    assert.equal(hook.current().formError, SITE_NAME_ERROR);
    assert.deepEqual(renameSubmission({} as RunnerInventoryBridge, '/site', name), { kind: 'refused', message: SITE_NAME_ERROR });
    assert.equal(canSubmitRename(name, false), false);
  }
  assert.deepEqual(created, [], 'no picker call for an invalid name');
  for (const name of ['a', 'x'.repeat(200), '  Café ☕ 日本語  ']) {
    act(() => hook.current().setName(name));
    assert.deepEqual([hook.current().canCreate, hook.current().nameError], [true, null], name);
    assert.equal(canSubmitRename(name, false), true, name);
  }
});
