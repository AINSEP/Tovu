import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopCopy } from './desktop-i18n.ts';

test('new desktop copy is translated in all Tovu locales', () => {
  const english = desktopCopy({ locale: 'en' });
  for (const locale of ['es', 'de', 'it', 'zh-CN', 'zh-TW', 'ar', 'fa', 'ru', 'ja', 'id', 'pt-BR', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'hi', 'ur', 'bn']) {
    const copy = desktopCopy({ locale });
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      assert.ok(copy[key]);
      assert.notEqual(copy[key], english[key], `${locale}.${key}`);
    }
  }
  assert.equal(desktopCopy({ locale: 'es-MX' }).restart, 'Reiniciar');
  assert.equal(desktopCopy({ locale: 'zh-Hant' }).restart, '重新啟動');
  assert.deepEqual(desktopCopy({ locale: 'unknown' }), english);
});
