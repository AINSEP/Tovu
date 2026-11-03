import assert from 'node:assert/strict';
import test from 'node:test';
import { postAgentToolCatalog } from '../agent-tools.js';

test('post creation and editing teach cover-only requests without a second copy in the body', () => {
  for (const name of ['content_post_create', 'content_post_update']) {
    const tool = postAgentToolCatalog.find(entry => entry.name === name)!;
    const schema = tool.inputSchema as { properties: { featuredImage: { description: string } } };
    assert.match(schema.properties.featuredImage.description, /cover/i);
    assert.match(schema.properties.featuredImage.description, /do not also insert.*bodyJson/i);
    assert.match(schema.properties.featuredImage.description, /unless.*explicitly.*body/i);
  }
});
