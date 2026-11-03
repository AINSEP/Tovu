import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveConversationTitle } from '@jini-ai/chat/core';
import { deriveContentConversationTitle } from '../../../assistant/content-chat-title.js';

test('a new theme chat is named for Lucky Goat rather than a page in its brief', () => {
  const result = deriveContentConversationTitle({
    prompt: 'Create a NEW theme called "Lucky Goat".\n\nInclude a page called "Roast type" and a shop page.',
    deriveFallback: deriveConversationTitle,
  });
  assert.equal(result, 'Theme: Lucky Goat');
});

test('a theme title stops before the next paragraph of page requirements', () => {
  const result = deriveContentConversationTitle({
    prompt: 'Create a NEW theme called Lucky Goat\n\nPage: Roast type. Include a shop page.',
    deriveFallback: deriveConversationTitle,
  });
  assert.equal(result, 'Theme: Lucky Goat');
});

test('a theme title stops before page requirements on the next line', () => {
  const result = deriveContentConversationTitle({
    prompt: 'Create a NEW theme called Lucky Goat\nPage: Roast type. Include a shop page.',
    deriveFallback: deriveConversationTitle,
  });
  assert.equal(result, 'Theme: Lucky Goat');
});

test('the first named CMS subject wins over later page and article examples', () => {
  for (const subject of ['theme', 'page', 'article']) {
    const result = deriveContentConversationTitle({
      prompt: `Create a ${subject} called "Lucky Goat". Add a page called "Roast type".`,
      deriveFallback: deriveConversationTitle,
    });
    assert.equal(result, `${subject[0]!.toUpperCase()}${subject.slice(1)}: Lucky Goat`);
  }
});
