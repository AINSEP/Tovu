/** F9 (Stryker L15 desktop-i18n 73 %: 23 per-locale rows could be emptied): the existing locale test
 * compared nested copy OBJECTS with notEqual, which two fresh objects always pass. This compares
 * every LEAF string, so an emptied row (all leaves undefined) fails. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopCopy } from './desktop-i18n.ts';

const LOCALES = ['es', 'de', 'it', 'zh-CN', 'zh-TW', 'ar', 'fa', 'ru', 'ja', 'id', 'pt-BR', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'hi', 'ur', 'bn'];

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

test('every leaf string is non-empty in English and translated (different) in every other locale', () => {
  const english = new Map(leaves(desktopCopy({ locale: 'en' })));
  assert.equal(english.size, 16);
  for (const [path, text] of english) assert.ok(typeof text === 'string' && text.trim() !== '', `en.${path}`);
  for (const locale of LOCALES) {
    const copy = leaves(desktopCopy({ locale }));
    assert.deepEqual(copy.map(([path]) => path), [...english.keys()], locale);
    for (const [path, text] of copy) {
      assert.ok(typeof text === 'string' && text.trim() !== '', `${locale}.${path} is empty`);
      assert.notEqual(text, english.get(path), `${locale}.${path} is untranslated`);
    }
  }
});

test('locale lookup: case-insensitive exact key, underscore spelling, region fallback, and en for anything unknown', () => {
  const zhTW = desktopCopy({ locale: 'zh-TW' }).siteErrors.invalid;
  for (const locale of ['ZH-tw', 'zh_TW', 'zh-HK', 'zh-Hant-TW']) assert.equal(desktopCopy({ locale }).siteErrors.invalid, zhTW, locale);
  assert.equal(desktopCopy({ locale: 'zh' }).siteErrors.invalid, desktopCopy({ locale: 'zh-CN' }).siteErrors.invalid);
  assert.equal(desktopCopy({ locale: 'pt_br' }).siteErrors.invalid, desktopCopy({ locale: 'pt-BR' }).siteErrors.invalid);
  assert.equal(desktopCopy({ locale: 'fr-CA' }).siteErrors.empty, desktopCopy({ locale: 'fr' }).siteErrors.empty);
  for (const locale of ['', 'xx', 'xx-YY']) assert.deepEqual(desktopCopy({ locale }), desktopCopy({ locale: 'en' }), JSON.stringify(locale));
});
