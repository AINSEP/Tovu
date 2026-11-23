import assert from 'node:assert/strict';
import test from 'node:test';
import { SETTINGS_DIALOG_DICTIONARIES } from '@jini-ai/ui';
import { JSDOM } from 'jsdom';
import { createSiteChatI18n, SITE_CHAT_DICTIONARY } from '../site-chat-i18n';

test('visitor copy covers every admin locale and binds to the page language', () => {
  const dom = new JSDOM('<html lang="en"></html>');
  const english = createSiteChatI18n({ document: dom.window.document });
  const expectedKeys = Object.keys(SITE_CHAT_DICTIONARY.es!);
  for (const locale of Object.keys(SETTINGS_DIALOG_DICTIONARIES).filter(locale => locale !== 'en')) {
    const dictionary = SITE_CHAT_DICTIONARY[locale];
    assert.ok(dictionary, `missing ${locale}`);
    assert.deepEqual(Object.keys(dictionary), expectedKeys);
    assert.ok(Object.values(dictionary).every(value => typeof value === 'string' && value.length > 0));
    dom.window.document.documentElement.lang = locale;
    assert.equal(createSiteChatI18n({ document: dom.window.document }).t('Close chat'), dictionary['Close chat']);
    assert.equal(createSiteChatI18n({ document: dom.window.document }).t('Discard draft'), dictionary['Discard draft']);
    assert.equal(createSiteChatI18n({ document: dom.window.document }).t('Discard chat'), dictionary['Discard chat']);
  }
  dom.window.document.documentElement.lang = 'es-MX';
  assert.equal(createSiteChatI18n({ document: dom.window.document }).t('Chat with this site'), 'Chatea con este sitio');
  assert.equal(english.t('Chat with this site'), 'Chat with this site');
  dom.window.close();
});

test("fills Jini chat's {name} placeholders and keeps unknown ones", () => {
  const dom = new JSDOM('<html lang="en"></html>');
  const { t } = createSiteChatI18n({ document: dom.window.document });
  assert.equal(t('Thinking… {time}', { time: '6 s' }), 'Thinking… 6 s');
  assert.equal(t('Running {tool}… {time}', { tool: 'search', time: 0 }), 'Running search… 0');
  assert.equal(t('{who} — retrying…', {}), '{who} — retrying…');
  assert.equal(t('Thinking… {time}'), 'Thinking… {time}');
  dom.window.close();
});

const tFor = (lang: string) => {
  const dom = new JSDOM(`<html lang="${lang}"></html>`);
  const i18n = createSiteChatI18n({ document: dom.window.document });
  dom.window.close();
  return i18n;
};

test('an unknown key falls back to the English source key', () => {
  assert.equal(tFor('de').t('Not a visitor string'), 'Not a visitor string');
  assert.equal(tFor('de').t('Hello {who}', { who: 'Ada' }), 'Hello Ada');
});

test('an inherited property name is not treated as a translation', () => {
  for (const lang of ['de', 'en']) assert.equal(tFor(lang).t('constructor'), 'constructor');
  assert.equal(tFor('constructor').t('Close chat'), 'Close chat');
});

test('pt resolves to pt-BR', () => {
  const { locale, t } = tFor('pt');
  assert.equal(locale, 'pt-BR');
  assert.equal(t('Close chat'), SITE_CHAT_DICTIONARY['pt-BR']!['Close chat']);
});

test('zh-Hant resolves to zh-TW', () => {
  const { locale, t } = tFor('zh-Hant');
  assert.equal(locale, 'zh-TW');
  assert.equal(t('Close chat'), SITE_CHAT_DICTIONARY['zh-TW']!['Close chat']);
});

test('an unsupported or missing page language keeps English copy under its base tag', () => {
  assert.equal(tFor('en-US').locale, 'en');
  assert.equal(tFor('xx-YY').locale, 'xx');
  assert.equal(tFor('').locale, 'en');
  assert.equal(tFor('en-US').t('Close chat'), 'Close chat');
});
