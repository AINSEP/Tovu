/** SPEC-046 v3: both shipped themes publish reviewed controls without hand-authored agent handles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { publishVisitorPage, readVisitorPagePublication } from '../visitor-publication.js';
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

function publicationFrom(html: string): { revision: string } {
  const match = html.match(/<script type="application\/json" id="tovu-visitor-publication">(.*?)<\/script>/s);
  assert.ok(match, 'publication JSON script must be present');
  return JSON.parse(match[1]);
}

test('Unicode text before the closing tag leaves the publication script inside the original body', () => {
  const html = publishVisitorPage({
    html: '<html><body><p>İstanbul</p><div id="tovu-site-assistant-root"></div></BODY></html>',
  });
  assert.match(html, /<p>İstanbul<\/p><div id="tovu-site-assistant-root"><\/div><script type="application\/json" id="tovu-visitor-publication">[^<]+<\/script><\/BODY><\/html>$/);
});

test('a publication expires at thirty minutes and a newer document is still available', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-27T12:00:00Z') });
  const input = {
    html: '<body><main data-visitor-scope data-toolname="hours" data-tooldescription="Our hours" data-tool-action="read"></main><div id="tovu-site-assistant-root"></div></body>',
    path: '/hours', workspaceId: 'hours-site',
  };
  const old = publicationFrom(publishVisitorPage(input));
  const handle = { handle: 'visitor-hours', action: 'read', label: 'Our hours' };
  assert.deepEqual(readVisitorPagePublication({ ...old, workspaceId: 'hours-site' })?.elements, [handle]);
  t.mock.timers.tick(30 * 60_000 - 1);
  const current = publicationFrom(publishVisitorPage(input));
  assert.deepEqual(readVisitorPagePublication({ ...old, workspaceId: 'hours-site' })?.elements, [handle]);
  t.mock.timers.tick(1);
  assert.equal(readVisitorPagePublication({ ...old, workspaceId: 'hours-site' }), null);
  assert.deepEqual(readVisitorPagePublication({ ...current, workspaceId: 'hours-site' })?.elements, [handle]);
});

test('submit handles identify only enclosed submitters with an eligible effective target', () => {
  const html = publishVisitorPage({
    workspaceId: 'returns-site', path: '/returns',
    html: `<body><main data-visitor-scope>
      <form id="returns" method="POST">
        <div><button type="submit" data-toolname="send" data-tooldescription="Send return" data-tool-action="submit">Send</button></div>
        <button type="submit" formaction="/estimate" formmethod="GET" data-toolname="quote" data-tooldescription="Get estimate" data-tool-action="submit">Estimate</button>
        <button type="submit" formaction="/returns?mode=tracking" data-toolname="query" data-tooldescription="Track" data-tool-action="submit">Track</button>
        <button type="submit" formmethod="dialog" data-toolname="close" data-tooldescription="Close dialog" data-tool-action="submit">Close</button>
        <button type="submit" form="returns" data-toolname="associated" data-tooldescription="Associated" data-tool-action="submit">Associated</button>
      </form>
    </main><div id="tovu-site-assistant-root"></div></body>`,
  });
  const { revision } = publicationFrom(html);
  assert.deepEqual(readVisitorPagePublication({ revision, workspaceId: 'returns-site' })?.elements, [
    { handle: 'visitor-quote', label: 'Get estimate', action: 'submit', target: { action: '/estimate', method: 'get' } },
    { handle: 'visitor-send', label: 'Send return', action: 'submit', target: { action: '/returns', method: 'post' } },
  ]);
  assert.match(html, /data-agent-element="visitor-send" data-agent-label="Send return" data-agent-role="button"/);
  assert.doesNotMatch(html, /data-agent-element="visitor-(query|close|associated)"/);
});

test('the publication cache drops the oldest live document only when its capacity is exceeded', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-27T12:00:00Z') });
  const workspaceId = 'cache-site';
  const publish = (path: string) => publicationFrom(publishVisitorPage({
    workspaceId, path, html: '<body><div id="tovu-site-assistant-root"></div></body>',
  })).revision;
  const first = publish('/cache/0');
  const second = publish('/cache/1');
  for (let index = 2; index < 512; index++) publish(`/cache/${index}`);
  assert.equal(readVisitorPagePublication({ revision: first, workspaceId })?.path, '/cache/0');

  const newest = publish('/cache/512');
  assert.equal(readVisitorPagePublication({ revision: first, workspaceId }), null);
  assert.equal(readVisitorPagePublication({ revision: second, workspaceId })?.path, '/cache/1');
  assert.equal(readVisitorPagePublication({ revision: newest, workspaceId })?.path, '/cache/512');
});
