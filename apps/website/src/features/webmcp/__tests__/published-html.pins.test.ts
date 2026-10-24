import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { injectPublishedWebMcp } from '../published-html.js';

test('first-party WebMCP registers local actions without writing storage, cookies or making requests', () => {
  const html = injectPublishedWebMcp({ html: '<html><body><button type="button" data-toolname="help" data-tooldescription="Show help">Help</button></body></html>', enabled: true });
  const dom = new JSDOM(html, { url: 'https://site.example/', runScripts: 'outside-only' });
  try {
    let registrations = 0;
    Object.defineProperty(dom.window.document, 'modelContext', { value: { registerTool: () => { registrations++; } } });
    dom.window.Storage.prototype.setItem = () => { assert.fail('WebMCP must not write browser storage'); };
    Object.defineProperty(dom.window.document, 'cookie', { set: () => { assert.fail('WebMCP must not write cookies'); } });
    dom.window.fetch = () => { assert.fail('WebMCP must not make network requests'); };
    const script = dom.window.document.querySelector('script[data-tovu-webmcp-script]')!;
    assert.equal(script.hasAttribute('data-consent-category'), false);
    dom.window.eval(script.textContent!);
    assert.equal(registrations, 1);
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  } finally { dom.window.close(); }
});

test('opt-out strips all five tool attributes with original whitespace and unrelated bytes intact', () => {
  const html = '<!doctype html><!--keep--><form TOOLNAME=contact tooldescription="Contact" toolautosubmit><input toolparamtitle=Email toolparamdescription="Address" name=email></form>Text';
  assert.equal(injectPublishedWebMcp({ html, enabled: false }),
    '<!doctype html><!--keep--><form   ><input   name=email></form>Text');
});

test('opt-out traverses nested template contents and removes marked scripts as whole ranges', () => {
  const html = '<template><template><div toolname=x>Text<!--keep--></div><script type="text/javascript" data-tovu-webmcp-script toolname=x>remove()</script></template><script>keep()</script></template>';
  assert.equal(injectPublishedWebMcp({ html, enabled: false }),
    '<template><template><div >Text<!--keep--></div></template><script>keep()</script></template>');
});

test('opt-out keeps text, unmarked scripts and ordinary attributes on implicit or repeated bodies', () => {
  for (const html of ['', 'Text<!--keep-->', 'Text<body class=keep>', '<body>Text<body class=keep>', '<script toolname=x>keep()</script>']) {
    const expected = html.replace('<script toolname=x>', '<script >');
    assert.equal(injectPublishedWebMcp({ html, enabled: false }), expected);
  }
});

test('opt-out removes duplicate tool attributes ignored by the first parse', () => {
  const html = '<form toolname=first toolname=second></form>';
  assert.equal(injectPublishedWebMcp({ html, enabled: false }), '<form  ></form>');
});

test('opt-out removes repeated mixed-case attributes in templates without editing inert text', () => {
  const html = '<!-- toolname=keep --><template><form TOOLNAME="first" toolname=second ToolName=third class="keep" tooldescription="a" TOOLDescription="b"><input toolparamtitle=a ToolParamTitle=b toolparamdescription=a TOOLPARAMDESCRIPTION=b toolautosubmit TOOlAutoSubmit></form></template><script>const value = "toolname=keep";</script>';
  const expected = '<!-- toolname=keep --><template><form    class="keep"  ><input      ></form></template><script>const value = "toolname=keep";</script>';
  const cleaned = injectPublishedWebMcp({ html, enabled: false });
  assert.equal(cleaned, expected);
  assert.equal(injectPublishedWebMcp({ html: cleaned, enabled: false }), expected);
});
