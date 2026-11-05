import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopCopy, runtimeLocale } from './desktop-i18n.ts';

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
  assert.equal(desktopCopy({ locale: 'zh_HK' }).restart, '重新啟動');
  assert.equal(desktopCopy({ locale: 'zh' }).restart, '重启');
  assert.equal(desktopCopy({ locale: 'PT_br' }).restart, 'Reiniciar');
  assert.deepEqual(desktopCopy({ locale: 'unknown' }), english);
});

test('the external-Stop confirm is translated in every locale and keeps `npm run dev` literal', () => {
  const english = desktopCopy({ locale: 'en' }).stopConfirm;
  assert.equal(english.devBody, 'This stops `npm run dev`, including the admin dev server.');
  for (const locale of ['es', 'de', 'it', 'zh-CN', 'zh-TW', 'ar', 'fa', 'ru', 'ja', 'id', 'pt-BR', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'hi', 'ur', 'bn']) {
    const copy = desktopCopy({ locale }).stopConfirm;
    for (const key of Object.keys(english) as (keyof typeof english)[]) assert.notEqual(copy[key], english[key], `${locale}.stopConfirm.${key}`);
    assert.ok(copy.title.includes('{name}'), `${locale} title names the site`);
    assert.ok(copy.devBody.includes('`npm run dev`'), `${locale} dev body keeps the command`);
    assert.ok(copy.otherBody.includes('{app}'), `${locale} other body names the app`);
  }
});

test('the last-window quit ask is translated in every locale and keeps its count', () => {
  const english = desktopCopy({ locale: 'en' }).lastWindowQuit;
  assert.equal(english.quitMany, 'Quit Tovu and stop {count} running sites?');
  for (const locale of ['es', 'de', 'it', 'zh-CN', 'zh-TW', 'ar', 'fa', 'ru', 'ja', 'id', 'pt-BR', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'hi', 'ur', 'bn']) {
    const copy = desktopCopy({ locale }).lastWindowQuit;
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      assert.ok(copy[key], `${locale}.lastWindowQuit.${key}`);
      assert.notEqual(copy[key], english[key], `${locale}.lastWindowQuit.${key}`);
    }
    assert.ok(copy.quitMany.includes('{count}'), `${locale} says how many sites stop`);
    assert.ok(copy.keepsMany.includes('{count}'), `${locale} says how many sites keep running`);
    assert.ok(copy.quitOne.includes('Tovu'), `${locale} names the app`);
  }
});

test('runtimeLocale reads the navigator language and falls back to en without a navigator', () => {
  assert.equal(runtimeLocale({}, { navigator: { language: 'de-DE' } }), 'de-DE');
  assert.equal(runtimeLocale({}, { navigator: null }), 'en');
  assert.equal(runtimeLocale(), globalThis.navigator.language, 'the default port is the runtime navigator');
});
