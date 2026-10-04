import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMarkupFile } from '../markup.js';

const rules = (content: string) => checkMarkupFile({ relativePath: 'render/pages/index.html', content }).map(issue => issue.ruleId);

test('WebMCP annotations on real forms and actions pass; comments and scripts are inert', () => {
  assert.deepEqual(rules('<form toolname="search_site" tooldescription="Search" method="get" action="/search" toolautosubmit><input name="q" toolparamtitle="Query" toolparamdescription="Words"><button type="submit">Find</button></form><a href="/contact" data-toolname="open_contact" data-tooldescription="Contact">Contact</a><button type="button" data-toolname="toggle" data-tooldescription="Toggle">Toggle</button><!-- <div toolname="bad"> --><script>const example = \'<div toolname="bad">\';</script>'), []);
});

test('WebMCP validator rejects misplaced, incomplete, invalid and duplicate action annotations', () => {
  assert.ok(rules('<div toolname="wrong" tooldescription="Wrong"></div>').includes('markup-webmcp-placement'));
  assert.ok(rules('<a href="/" data-toolname="missing">Home</a>').includes('markup-webmcp-description'));
  assert.ok(rules('<button type="button" data-toolname="bad name" data-tooldescription="Action"></button>').includes('markup-webmcp-name'));
  assert.ok(rules('<form toolname="same" tooldescription="One"></form><a href="/" data-toolname="same" data-tooldescription="Two"></a>').includes('markup-webmcp-duplicate-name'));
  assert.ok(rules('<input toolparamdescription="Words">').includes('markup-webmcp-parameter'));
  assert.ok(rules('<button data-toolname="submit" data-tooldescription="Submit"></button>').includes('markup-webmcp-placement'));
});

test('WebMCP validator rejects automatic writes, secrets, cross-origin targets and retired handles', () => {
  assert.ok(rules('<form toolname="write" tooldescription="Write" method="post" toolautosubmit></form>').includes('markup-webmcp-autosubmit'));
  assert.ok(rules('<form toolname="secret" tooldescription="Secret"><input name="password" type="password"></form>').includes('markup-webmcp-secret'));
  assert.ok(rules('<a href="https://other.example" data-toolname="external" data-tooldescription="External"></a>').includes('markup-webmcp-target'));
  assert.ok(rules('<form toolname="search" tooldescription="Search" toolautosubmit><button type="submit" formmethod="post">Write</button></form>').includes('markup-webmcp-autosubmit'));
  assert.ok(rules('<form toolname="contact" tooldescription="Contact"><button type="submit" formaction="https://other.example">Send</button></form>').includes('markup-webmcp-target'));
  assert.ok(rules('<div data-tovu-agent="old"></div>').includes('markup-tovu-agent-retired'));
  assert.ok(rules('<div data-agent-element="admin"></div>').includes('markup-data-agent-element-forbidden'));
});
