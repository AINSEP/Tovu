/**
 * @file The create-website form's pure rules — `buildCreateProjectInput`, `computeCanCreate` and
 * `siteSlug` — run against the real functions. Moved from `App.hooks.test.ts` with the split; the
 * hook itself is rendered in `use-create-website-form.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateProjectInput, computeCanCreate, siteSlug } from './use-create-website-form.hooks.js';

test('creation selects only the chosen database endpoint and credential without trimming secrets', () => {
  const input = {
    displayName: 'New site', database: 'sqlite' as const, customProviderLabel: ' Neon ',
    supabaseUrl: ' https://db.example ', customConnection: ' postgres://db ',
    supabaseKey: ' supabase secret ', customCredential: ' custom secret ',
  };
  assert.deepEqual(buildCreateProjectInput(input), { displayName: 'New site', database: { kind: 'sqlite' } });
  assert.deepEqual(buildCreateProjectInput({ ...input, database: 'supabase' }), {
    displayName: 'New site', database: { kind: 'supabase', endpoint: 'https://db.example', credential: ' supabase secret ' },
  });
  assert.deepEqual(buildCreateProjectInput({ ...input, database: 'custom' }), {
    displayName: 'New site', database: { kind: 'custom', label: 'Neon', endpoint: 'postgres://db', credential: ' custom secret ' },
  });
  for (const database of ['supabase', 'custom'] as const) {
    assert.deepEqual(buildCreateProjectInput({ ...input, database, customProviderLabel: ' ',
      supabaseUrl: ' ', customConnection: ' ', supabaseKey: '', customCredential: '' }), {
      displayName: 'New site', database: { kind: database },
    });
  }
});

/** The form's real gate: `useCreateWebsiteForm` computes `slug` from the typed name and hands it
 *  straight to `computeCanCreate`, so an empty slug is a permanently disabled "Create website". */
function canCreateSqliteSiteNamed(name: string): boolean {
  return computeCanCreate({ slug: siteSlug(name), database: 'sqlite', supabaseReady: false, customReady: false });
}

test('supabase and custom creation each require their own readiness and a nonempty slug', () => {
  for (const database of ['supabase', 'custom'] as const) {
    for (const supabaseReady of [false, true]) for (const customReady of [false, true]) {
      const input = { slug: 'new-site', database, supabaseReady, customReady };
      assert.equal(computeCanCreate(input), database === 'supabase' ? supabaseReady : customReady);
      assert.equal(computeCanCreate({ ...input, slug: '' }), false);
    }
  }
});

test('SQLite needs nothing but a slug, whatever the other providers report', () => {
  assert.equal(computeCanCreate({ slug: 'blog', database: 'sqlite', supabaseReady: false, customReady: false }), true);
  assert.equal(computeCanCreate({ slug: '', database: 'sqlite', supabaseReady: true, customReady: true }), false);
});

test('siteSlug keeps its existing behaviour for plain ASCII names', () => {
  assert.equal(siteSlug('Hello World'), 'hello-world');
  assert.equal(siteSlug('Corner Bakery!!'), 'corner-bakery');
  assert.equal(siteSlug('  Trimmed  '), 'trimmed');
});

test('siteSlug still yields nothing for a name with no letters or digits in it', () => {
  // The empty result is what `computeCanCreate` reads as "no name typed yet", so this must keep
  // meaning exactly that — the fix below must not turn punctuation into a usable name.
  assert.equal(siteSlug('   '), '');
  assert.equal(siteSlug('!!!'), '');
  assert.equal(siteSlug('— …'), '');
});

test('a non-Latin website name is not erased, so its site can actually be created', () => {
  // The defect: `[^a-z0-9]+` deletes every character of a name written in a non-Latin script, the
  // slug comes back empty, and `computeCanCreate` then refuses to enable "Create website" — there
  // is no name the operator can type in Japanese, Hindi or Greek that this form will accept.
  for (const name of ['日本語サイト', 'हिन्दी', 'Ελλάδα', 'Кофейня', 'مقهى']) {
    assert.notEqual(siteSlug(name), '', `${name}: an ASCII-only slug erases this name entirely`);
    assert.equal(canCreateSqliteSiteNamed(name), true, `${name}: "Create website" must be reachable`);
  }
});

test('a Latin name carrying diacritics is not mangled into nonsense', () => {
  // Shown to the operator verbatim as "Workspace folder: caf-m-nster" before the fix — the accented
  // letters were replaced by separators rather than kept.
  assert.equal(siteSlug('Café Münster'), 'café-münster');
  assert.equal(siteSlug('Łódź Studio'), 'łódź-studio');
});

test('combining marks stay attached to the letter they belong to', () => {
  // Devanagari writes its vowels as combining marks (`\p{M}`), not letters. Keeping only `\p{L}`
  // would split हिन्दी into three separator-joined fragments instead of one word.
  assert.equal(siteSlug('हिन्दी'), 'हिन्दी');
});

test('siteSlug trims separators at both ends and collapses runs between words', () => {
  assert.equal(siteSlug('--a  b--'), 'a-b');
  assert.equal(siteSlug('a!!!b'), 'a-b');
});
