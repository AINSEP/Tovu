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
