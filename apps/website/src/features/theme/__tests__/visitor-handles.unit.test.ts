/** SPEC-046 v3: both shipped themes publish reviewed controls without hand-authored agent handles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { publishVisitorPage } from '../visitor-publication.js';
for (const theme of ['tovu-starter', 'tovu-theme']) {
  test(`${theme}: scoped menu open/close and mobile publication use the author convention`, () => {
    const base = new URL(`../../../../../../content/themes/static/${theme}/`, import.meta.url);
    const nav = readFileSync(new URL('render/partials/nav.html', base), 'utf8');
    assert.match(nav, /data-visitor-scope/);
    assert.match(nav, /"variant":"tree"/);
    assert.doesNotMatch(readFileSync(new URL('css/theme.css', base), 'utf8'), /jini-menu-js/);
    assert.match(nav, /data-toolname="[^"]*menu_open"[^>]*data-tool-action="menu"/);
    assert.match(nav, /data-toolname="[^"]*menu_close"[^>]*data-tool-action="menu"/);
    assert.doesNotMatch(nav, /data-agent-element=/);
    const script = readFileSync(new URL('scripts/main.js', base), 'utf8');
    assert.match(script, /data-visitor-mobile-handle/);
    assert.match(script, /data-visitor-submenu-handle/);
    for (const page of readdirSync(new URL('render/pages/', base)).filter(name => !['signin.html', 'signup.html', '404.html'].includes(name))) {
      const html = readFileSync(new URL(`render/pages/${page}`, base), 'utf8');
      assert.match(html, /<main[^>]*data-tool-action="read"/);
    }
  });
}
test('FAQ summary publishes an accordion action; unmarked themes have zero DOM handles', () => {
  const faq = readFileSync(new URL('../../../../../../content/themes/static/tovu-theme/render/pages/pricing.html', import.meta.url), 'utf8');
  assert.match(faq, /<summary[^>]*data-tool-action="accordion"/);
  const html = publishVisitorPage({ html: '<html><body><button data-agent-element="admin-save">Save</button><div id="tovu-site-assistant-root"></div></body></html>' });
  assert.match(html, /"elements":\[\]/);
});
