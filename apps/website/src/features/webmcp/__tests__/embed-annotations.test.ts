import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtmlForm } from '@jini-ai/cms/forms';
import { renderHtmlMenu, type HtmlMenuItem } from '#src/features/navigation/html-render';
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

test('HTML menus retain unavailable parents only while a visible descendant exists', () => {
  const child: HtmlMenuItem = { label: 'Child', href: '/child', available: true, isCurrent: false, children: [] };
  const items: HtmlMenuItem[] = [
    { label: 'Unavailable', href: '/draft', available: false, isCurrent: false, children: [child] },
    { label: 'Heading', href: null, available: true, isCurrent: false, isActive: true, attrs: {}, children: [child] },
    { label: 'Hidden', href: null, available: true, isCurrent: false, children: [] },
  ];
  const html = renderHtmlMenu({ id: 'tree', items, sanitizeHref: href => href });
  assert.match(html, /<span data-tovu-menu-label>Unavailable<\/span><ul/);
  assert.match(html, /data-active="true" data-has-children="true"><span data-tovu-menu-label>Heading<\/span>/);
  assert.match(html, /data-toolname="menu_tree_0_0"/);
  assert.match(html, /data-toolname="menu_tree_1_0"/);
  assert.doesNotMatch(html, /Hidden|href="\/draft"/);
  assert.equal(renderHtmlMenu({ id: 'empty', items: [], sanitizeHref: href => href }), '');
});

test('HTML menus escape display attributes and secure new tabs while preserving explicit rel tokens', () => {
  const item: HtmlMenuItem = { label: 'A & B', href: '/a', available: true, isCurrent: true, isActive: true,
    attrs: { icon: 'icon"', description: '<details>', rel: ' author  noopener author ', openInNewTab: true }, children: [] };
  const html = renderHtmlMenu({ id: 'main"', items: [item], sanitizeHref: () => '/safe?q="&x=1' });
  assert.match(html, /data-tovu-menu="main&quot;"/);
  assert.match(html, /href="\/safe\?q=&quot;&amp;x=1" aria-current="page" target="_blank" rel="author noopener noreferrer"/);
  assert.match(html, /<span data-tovu-menu-icon="icon&quot;"><\/span>A &amp; B<span data-tovu-menu-description>&lt;details&gt;<\/span>/);
  assert.match(html, /data-toolname="menu_main__0" data-tooldescription="A &amp; B"/);
  const sameTab = renderHtmlMenu({ id: 'main', items: [{ ...item, attrs: { rel: 'nofollow', openInNewTab: false } }], sanitizeHref: href => href });
  assert.match(sameTab, /rel="nofollow"/);
  assert.doesNotMatch(sameTab, /target=|noopener|data-tovu-menu-icon|data-tovu-menu-description/);
});

test('HTML menu tool exposure follows the sanitized URL and refuses schemes, authorities and unsafe characters', () => {
  for (const href of ['', 'https://elsewhere.test', 'mailto:a@example.test', '//elsewhere.test', '\\\\elsewhere.test', '/bad\\path', '/bad path', '/bad\u0000path']) {
    const html = renderHtmlMenu({ id: 'policy', items: [{ label: 'Link', href: '/authored', available: true, isCurrent: false, children: [] }], sanitizeHref: () => href });
    assert.match(html, /<a href=/);
    assert.doesNotMatch(html, /data-toolname=/, JSON.stringify(href));
  }
});
