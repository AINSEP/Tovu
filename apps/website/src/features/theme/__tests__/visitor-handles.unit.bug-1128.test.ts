import test from 'node:test';
import assert from 'node:assert/strict';
import { publishVisitorPage } from '../visitor-publication.js';

test('BUG T-B10: Unicode before the closing body tag does not shift the manifest insertion', () => {
  const content = '<div id="tovu-site-assistant-root">İ</div>';
  const html = publishVisitorPage({ html: `<html><body>${content}</BODY></html>` });
  const publishedBody = html.slice(html.indexOf('<div')).replace(
    /(<script type="application\/json" id="tovu-visitor-publication">).*?(<\/script>)/,
    '$1$2',
  );

  assert.equal(publishedBody, `${content}<script type="application/json" id="tovu-visitor-publication"></script></BODY></html>`);
});
