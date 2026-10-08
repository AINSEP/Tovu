import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtmlForm } from '@jini-ai/cms/forms';
import { renderHtmlMenu } from '#src/features/navigation/html-render';
import { renderWidgetIr } from '#src/server/inbound/public-http/http/site/render';

test('rendered HTML forms advertise native tools and preserve human submission and transport', () => {
  const html = renderHtmlForm({ slug: 'contact', action: '/forms/contact', fields: [{ id: 'email', type: 'email', label: 'Email', required: true }] , hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-tovu-form-success", error: "data-tovu-form-error" } });
  assert.match(html, /<form[^>]*toolname="form_contact"[^>]*tooldescription="contact"/);
  assert.match(html, /method="post" action="\/forms\/contact"/);
  assert.match(html, /name="email"[^>]*toolparamtitle="Email"[^>]*toolparamdescription="Email"[^>]*required/);
  assert.doesNotMatch(html, /toolautosubmit/);
  const custom = renderHtmlForm({ slug: 'custom', action: '/forms/custom', fields: [] , hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-tovu-form-success", error: "data-tovu-form-error" } }, { html: '<textarea name="message"></textarea>' });
  assert.match(custom, /toolname="form_custom"/);
  assert.match(custom, /<textarea name="message"><\/textarea>/);
});

test('builder contact widgets also advertise native forms while keeping the existing handler', () => {
  const html = renderWidgetIr({ componentId: 'contact-form', props: { slug: 'contact', fields: [{ id: 'email', label: 'Email', type: 'email', required: true }] } });
  assert.match(html, /<form[^>]*toolname="form_contact"[^>]*tooldescription="contact"/);
  assert.match(html, /method="post" action="\/forms\/contact\/submit"/);
  assert.match(html, /toolparamtitle="Email" toolparamdescription="Email"/);
  assert.doesNotMatch(html, /toolautosubmit/);
});

test('HTML menu tools have stable unique names; external and unavailable targets are not exposed', () => {
  const items = [
    { label: 'Home', href: '/', available: true, isCurrent: true, children: [] },
    { label: 'Docs', href: '/docs', available: true, isCurrent: false, children: [{ label: 'API', href: '/docs/api', available: true, isCurrent: false, children: [] }] },
    { label: 'External', href: 'https://other.example', available: true, isCurrent: false, children: [] },
    { label: 'Draft', href: '/draft', available: false, isCurrent: false, children: [] },
  ];
  const html = renderHtmlMenu({ id: 'main', items, sanitizeHref: href => href });
  assert.match(html, /data-toolname="menu_main_0" data-tooldescription="Home"/);
  assert.match(html, /data-toolname="menu_main_1_0" data-tooldescription="API"/);
  assert.equal((html.match(/data-toolname=/g) ?? []).length, 3);
  assert.match(html, /href="https:\/\/other.example">External<\/a>/);
  assert.doesNotMatch(html, /Draft/);
});
