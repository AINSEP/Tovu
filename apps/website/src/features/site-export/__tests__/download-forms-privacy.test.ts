import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { downloadForms } from '@jini-ai/devops/backup/site/static-download-html';
import { downloadHtmlSourceEdits as sourceEdits } from "#src/features/site-backup/download-html-source-edits";

test('download forms cannot submit answers through native GET, implicit submit or external controls', () => {
  const html = '<form id="contact" action="/forms/contact/submit" method="post"><input name="secret"><button formaction="/leak">Send</button></form><input form="contact" name="outside"><button form="contact">Send</button>';
  const result = downloadForms({ html, page: '/contact/', sourceEdits });
  const document = new JSDOM(result.html).window.document;
  assert.equal(document.forms.length, 1);
  assert.equal(document.forms[0]!.method, 'dialog');
  assert.equal(document.forms[0]!.hasAttribute('action'), false);
  assert.equal(document.forms[0]!.id, 'contact');
  assert.match(document.body.textContent!, /needs a server/);
  assert.deepEqual(result.removed, [{ page: '/contact/', url: '/forms/contact/submit', attribute: 'action', reason: 'needs-server' }]);
});

test('explicit empty actions require a server; external receivers remain usable', () => {
  const result = downloadForms({ html: '<form action=""><input name="secret"></form><form action="https://receiver.example/send"><button>Send</button></form>', page: '/', sourceEdits });
  const document = new JSDOM(result.html).window.document;
  assert.equal(document.forms.length, 2);
  assert.equal(document.forms[0]!.method, 'dialog');
  assert.equal(document.forms[1]!.action, 'https://receiver.example/send');
});

test('dialog forms and JS-only forms keep their authored markup in downloaded pages', () => {
  const html = '<form method="dialog"><button>Close</button></form><form id="search" onsubmit="return false"><input></form>';
  assert.equal(downloadForms({ html, page: '/', sourceEdits }).html, html);
});
test('downloaded backend forms retain form selectors and cannot override dialog submission', () => {
  const result = downloadForms({ html: '<form id="f" action="/forms/contact/submit" method="post"><button formmethod="post" formaction="/leak">Send</button></form><button form="f" formmethod="get">Outside</button>', page: '/', sourceEdits });
  const document = new JSDOM(result.html).window.document;
  assert.equal(document.querySelectorAll('form').length, 1);
  assert.equal(document.querySelector('form#f > button')?.getAttribute('formmethod'), 'dialog');
  assert.equal(document.querySelector('button[form="f"]')?.getAttribute('formmethod'), 'dialog');
});
