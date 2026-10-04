import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { checkMarkupFile } from '../markup.js';

test('shipped starter navigation and templated storefront teach valid browser actions', () => {
  for (const file of ['content/themes/static/tovu-starter/render/partials/nav.html', 'content/themes/templated/storefront/render/pages/home.liquid', 'development/docs/themes/scaffolds/webmcp-contact.html']) {
    const content = readFileSync(new URL('../../../../../../../' + file, import.meta.url), 'utf8');
    assert.match(content, /data-toolname=/, file);
    assert.deepEqual(checkMarkupFile({ relativePath: file, content }), [], file);
    if (file.endsWith('webmcp-contact.html')) {
      assert.match(content, /toolname="contact_message"/);
      assert.doesNotMatch(content, /<form[^>]*\btoolautosubmit/);
      assert.match(content, /action="\/forms\/contact\/submit"/);
    }
  }
});
