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

// Key presence alone does not prove the rendered label is nonblank: resolve through the translator.
test('Hindi, Urdu and Bangla launcher and panel keys resolve without an empty or English fallback', () => {
  const dom = new JSDOM('<html lang="en"></html>');
  const publicKeys = Object.keys(SITE_CHAT_DICTIONARY.es!);
  for (const language of ['hi', 'ur', 'bn']) {
    dom.window.document.documentElement.lang = language;
    const { t } = createSiteChatI18n({ document: dom.window.document }, {});
    const launcher = t('Chat with this site');
    assert.ok(launcher.trim().length > 0 && launcher !== 'Chat with this site', `${language} launcher label`);
    for (const key of publicKeys) {
      const value = t(key);
      assert.ok(value.trim().length > 0, `${language} ${key} is blank`);
      assert.notEqual(value, key, `${language} ${key} falls back to English`);
    }
  }
  dom.window.close();
});

test('an unset page language uses English and region-specific translations match case-insensitively', t => {
  const dom = new JSDOM('<html></html>');
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const defaults = createSiteChatI18n({ document });
  assert.equal(defaults.locale, 'en');
  assert.equal(defaults.t('Close chat'), 'Close chat');

  for (const [lang, locale, close] of [['ZH-tw', 'zh-TW', '關閉聊天'], ['ZH-cn', 'zh-CN', '关闭聊天']] as const) {
    document.documentElement.lang = lang;
    const translator = createSiteChatI18n({ document });
    assert.equal(translator.locale, locale);
    assert.equal(translator.t('Close chat'), close);
  }
});
