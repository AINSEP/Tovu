import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWebMcpMarkup } from '../webmcp-markup.js';

// Direct tests for the WebMCP validator. markup.test.ts reaches it through checkMarkupFile with
// `includes` checks; these pin the EXACT rule list per input so an extra or missing issue fails.
const PATH = 'render/pages/contact.html';
const rules = (content: string) => checkWebMcpMarkup({ relativePath: PATH, content }).map(issue => issue.ruleId);
const FORM = (inner = '', attrs = '') => `<form toolname="contact" tooldescription="Contact us" action="/contact"${attrs}>${inner}</form>`;

test('issues carry the file path in both the path field and the message prefix', () => {
  assert.deepEqual(checkWebMcpMarkup({ relativePath: PATH, content: '<form toolname="same" tooldescription="One"></form><form toolname="same" tooldescription="Two"></form>' }), [
    { ruleId: 'markup-webmcp-duplicate-name', path: PATH, message: `'${PATH}': tool name 'same' is repeated in this file` },
  ]);
});

test('a well-formed form, anchor action and explicit button action raise nothing', () => {
  assert.deepEqual(rules(FORM('<label>Email <input name="email" toolparamtitle="Email" toolparamdescription="Reply address"></label><select name="topic" toolparamtitle="Topic"></select><textarea name="body" toolparamdescription="Message"></textarea>')), []);
  assert.deepEqual(rules('<a href="/pricing" data-toolname="open.pricing_v2" data-tooldescription="Open pricing">Pricing</a>'), []);
  assert.deepEqual(rules('<button type="BUTTON" data-toolname="toggle-menu" data-tooldescription="Toggle">Menu</button>'), []);
});

test('script, style, template and noscript contents are inert', () => {
  assert.deepEqual(rules('<template><div toolname="bad"></div></template><noscript><div data-toolname="bad"></div></noscript><style>div[toolname]{}</style><script>"<div toolname=x>"</script>'), []);
});

test('placement: form annotations only on forms; actions only on anchors and type=button buttons', () => {
  assert.deepEqual(rules('<div toolname="x" tooldescription="d"></div>'), ['markup-webmcp-placement']);
  assert.deepEqual(rules('<span toolautosubmit></span>'), ['markup-webmcp-placement', 'markup-webmcp-name', 'markup-webmcp-description']);
  assert.deepEqual(rules('<button type="submit" data-toolname="x" data-tooldescription="d"></button>'), ['markup-webmcp-placement']);
  assert.deepEqual(rules('<div data-toolname="x" data-tooldescription="d"></div>'), ['markup-webmcp-placement']);
});

test('names: 1..128 of the allowed characters; template expressions skip the grammar and duplicate checks', () => {
  assert.deepEqual(rules(`<form toolname="${'a'.repeat(128)}" tooldescription="d"></form>`), []);
  assert.deepEqual(rules(`<form toolname="${'a'.repeat(129)}" tooldescription="d"></form>`), ['markup-webmcp-name']);
  assert.deepEqual(rules('<form toolname="" tooldescription="d"></form>'), ['markup-webmcp-name']);
  assert.deepEqual(rules('<form toolname="has space" tooldescription="d"></form>'), ['markup-webmcp-name']);
  assert.deepEqual(rules('<form toolname="{{ tool }}" tooldescription="d"></form><form toolname="{{ tool }}" tooldescription="d"></form><form toolname="{% t %}" tooldescription="d"></form>'), []);
  assert.deepEqual(rules('<a href="/" data-toolname="same" data-tooldescription="d"></a><form toolname="same" tooldescription="d"></form>'), ['markup-webmcp-duplicate-name']);
});

test('descriptions must be non-blank', () => {
  assert.deepEqual(rules('<form toolname="x" tooldescription="   "></form>'), ['markup-webmcp-description']);
  assert.deepEqual(rules('<a href="/" data-toolname="x"></a>'), ['markup-webmcp-description']);
});

test('targets: only site-relative or templated URLs are exposed', () => {
  for (const href of ['/contact', 'contact', '?q=1', '#top', '{{ entry.url }}', '{% url %}']) {
    assert.deepEqual(rules(`<a href="${href}" data-toolname="go" data-tooldescription="Go"></a>`), [], href);
  }
  for (const href of ['', 'https://other.example', 'HTTP://x', 'javascript:alert(1)', 'mailto:a@b.c', '//evil.example/x', '\\\\evil', '/a b', '/a\\b']) {
    assert.deepEqual(rules(`<a href="${href}" data-toolname="go" data-tooldescription="Go"></a>`), ['markup-webmcp-target'], href);
  }
  assert.deepEqual(rules('<a data-toolname="go" data-tooldescription="Go"></a>'), ['markup-webmcp-target']);
  assert.deepEqual(rules('<form toolname="x" tooldescription="d" action="https://other.example"></form>'), ['markup-webmcp-target']);
  // A button action has no href to check.
  assert.deepEqual(rules('<button type="button" data-toolname="x" data-tooldescription="d"></button>'), []);
  assert.deepEqual(checkWebMcpMarkup({ relativePath: PATH, content: '<a href="/f.pdf" download data-toolname="dl" data-tooldescription="Download"></a>' }).map(issue => issue.message), [`'${PATH}': download anchors are not browser tools`]);
});

test('automatic submission is limited to GET forms and GET submitters', () => {
  assert.deepEqual(rules(FORM('', ' toolautosubmit')), []);
  assert.deepEqual(rules(FORM('', ' toolautosubmit method="GET"')), []);
  assert.deepEqual(rules(FORM('', ' toolautosubmit method="Post"')), ['markup-webmcp-autosubmit']);
  assert.deepEqual(rules(FORM('<button formmethod="post">Send</button>', ' toolautosubmit')), ['markup-webmcp-autosubmit']);
  assert.deepEqual(rules(FORM('<input type="submit" formmethod="GET">', ' toolautosubmit')), []);
  // Without toolautosubmit a human submits, so a write submitter is allowed.
  assert.deepEqual(rules(FORM('<button formmethod="post">Send</button>')), []);
});

test('submitter formaction overrides must stay site-relative', () => {
  assert.deepEqual(rules(FORM('<button formaction="/other">Send</button><input type="submit" formaction="{{ u }}">')), []);
  assert.deepEqual(rules(FORM('<input type="submit" formaction="https://other.example">')), ['markup-webmcp-target']);
  // Unannotated forms are not tools, so their submitters are not checked.
  assert.deepEqual(rules('<form><button formaction="https://other.example">Send</button></form>'), []);
});

test('parameters need a named public control owned by an annotated form', () => {
  assert.deepEqual(rules(FORM('<div><p><input name="deep" toolparamtitle="Deep"></p></div>')), []);
  assert.deepEqual(rules(`<form id="f" toolname="x" tooldescription="d"></form><input form="f" name="q" toolparamtitle="Query">`), []);
  for (const content of [
    FORM('<input toolparamtitle="No name">'),
    FORM('<input name="  " toolparamtitle="Blank name">'),
    FORM('<input type="HIDDEN" name="h" toolparamtitle="Hidden">'),
    FORM('<div name="d" toolparamtitle="Not a control"></div>'),
    '<form><input name="q" toolparamtitle="Unannotated form"></form>',
    '<input name="q" toolparamtitle="No form">',
    '<input form="missing" name="q" toolparamtitle="Missing form">',
  ]) assert.deepEqual(rules(content), ['markup-webmcp-parameter'], content);
  assert.deepEqual(checkWebMcpMarkup({ relativePath: PATH, content: FORM('<input name="q" toolparamtitle=" " toolparamdescription="ok">') }).map(issue => issue.message), [`'${PATH}': parameter titles/descriptions must be nonempty`]);
});

test('password and file inputs block advertising their form, including form= association', () => {
  assert.deepEqual(rules(FORM('<input type="password" name="p">')), ['markup-webmcp-secret']);
  assert.deepEqual(rules(`<form id="up" toolname="x" tooldescription="d"></form><input type="File" form="up" name="f">`), ['markup-webmcp-secret']);
  assert.deepEqual(rules('<form><input type="password" name="p"></form><input type="password" name="loose">'), []);
  // A password parameter is both a bad parameter and a secret.
  assert.deepEqual(rules(FORM('<input type="password" name="p" toolparamtitle="Secret">')), ['markup-webmcp-parameter', 'markup-webmcp-secret']);
});

test('misspelled or misplaced WebMCP annotations and the retired data-tovu-agent are reported', () => {
  assert.deepEqual(checkWebMcpMarkup({ relativePath: PATH, content: FORM('', ' tooldesc="x"') }).map(issue => issue.message), [`'${PATH}': unsupported WebMCP annotation 'tooldesc'`]);
  for (const name of ['toolnames', 'toolautosubmitted', 'toolparam-title', 'data-toolparamtitle', 'data-toolautosubmit', 'data-tooldesc']) {
    assert.deepEqual(rules(`<a href="/" data-toolname="x" data-tooldescription="d" ${name}="v"></a>`), ['markup-webmcp-attribute'], name);
  }
  assert.deepEqual(rules('<section data-tovu-agent></section>'), ['markup-tovu-agent-retired']);
});

test('ordinary theme attributes that start with "tool" are not WebMCP annotations', () => {
  // BUG (fixed): any tool*/data-tool* prefix was refused, so a theme with a data-tooltip failed to install.
  assert.deepEqual(rules('<button data-tooltip="Copy" data-tooltip-placement="top" data-toolbar="main" data-toolkit="x" tooltip="t" class="toolbar">Copy</button>'), []);
});
