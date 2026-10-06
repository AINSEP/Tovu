/**
 * @file Coverage for `CreateWebsiteOnboarding.tsx`, imported for real (not re-transpiled from
 * source text the way `webview-failure-wiring.test.ts` checks the database cards).
 *
 * The component takes its two hooks as injectable props (see its own doc comment), so each test
 * puts the layout straight into one state with a plain stub and walks the returned element tree.
 * Handlers are invoked on the real elements and asserted by what reached the stub. One test renders
 * with the REAL default hooks through `react-dom/server`, which proves the defaults are wired.
 *
 * `npm test` runs renderer tests through tsx WITHOUT the renderer tsconfig, so tsx compiles the
 * imported `.tsx` with the classic JSX transform (`React.createElement`, a free `React`). The
 * component is therefore imported dynamically after `React` is published on `globalThis`; under
 * the renderer's automatic runtime that global is simply unused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { elements } from './source-test-harness.js';
import type { CreateWebsiteFormState, useCreateWebsiteForm } from './App.hooks.js';
import type { CreateSitePluginTokens, useCreateSitePluginTokens } from './use-create-site-plugin-tokens.hooks.js';
import type { CreateSiteInput, DatabaseProviderKind } from '../contracts/project.js';

(globalThis as { React?: typeof React }).React = React;
const { CreateWebsiteOnboarding } = await import('./CreateWebsiteOnboarding.js');

type Calls = Record<string, unknown[][]>;

function recorder(calls: Calls, name: string) {
  return (...args: unknown[]) => { (calls[name] ??= []).push(args); };
}

function setup({ form = {}, plugins = [] }: { form?: Partial<CreateWebsiteFormState>; plugins?: CreateSitePluginTokens['plugins'] } = {}) {
  const calls: Calls = {};
  const supabaseKeyRef = { current: null };
  const customCredentialRef = { current: null };
  const refCallbacks = new Map<string, (element: HTMLInputElement | null) => void>();
  const wrappedCreate = async (_input: CreateSiteInput) => {};
  let formReceived: unknown;
  const onCreate = async (_input: CreateSiteInput) => {};
  const usePluginTokens: typeof useCreateSitePluginTokens = () => ({
    plugins,
    inputRef: (pluginId) => {
      const callback = refCallbacks.get(pluginId) ?? (() => {});
      refCallbacks.set(pluginId, callback);
      return callback;
    },
    withTokens: (inner) => { assert.equal(inner, onCreate, 'withTokens must wrap the caller onCreate'); return wrappedCreate; },
  });
  const state: CreateWebsiteFormState = {
    name: '', setName: recorder(calls, 'setName') as never,
    database: 'sqlite', setDatabase: recorder(calls, 'setDatabase') as never,
    supabaseUrl: '', setSupabaseUrl: recorder(calls, 'setSupabaseUrl') as never,
    setHasSupabaseKey: recorder(calls, 'setHasSupabaseKey') as never,
    customProvider: '', setCustomProvider: recorder(calls, 'setCustomProvider') as never,
    customConnection: '', setCustomConnection: recorder(calls, 'setCustomConnection') as never,
    setHasCustomCredential: recorder(calls, 'setHasCustomCredential') as never,
    supabaseKeyRef, customCredentialRef,
    slug: '', canCreate: false, isSubmitting: false, formError: null,
    handleSubmit: recorder(calls, 'handleSubmit') as never,
    ...form,
  };
  const useForm = ((received: unknown) => { formReceived = received; return state; }) as typeof useCreateWebsiteForm;
  const onBack = recorder(calls, 'onBack') as () => void;
  const tree = elements(CreateWebsiteOnboarding({ onBack, onCreate, useForm, usePluginTokens }));
  return { tree, calls, state, refCallbacks, wrappedCreate, formReceived: () => formReceived };
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement(node)) return text((node.props as { children?: unknown }).children);
  return '';
}

const byType = (tree: any[], type: string) => tree.filter((element) => element.type === type);
const input = (tree: any[], predicate: (props: any) => boolean) => byType(tree, 'input').find((element) => predicate(element.props));
const submit = (tree: any[]) => byType(tree, 'button').find((element) => element.props.type === 'submit');
const change = (value: string) => ({ target: { value } });

test('starts on the SQLite default with no slug, a disabled submit and no vendor fields', () => {
  const { tree } = setup();
  const radios = byType(tree, 'input').filter((element) => element.props.type === 'radio');
  assert.deepEqual(radios.map((r) => [r.props.value, r.props.checked, r.props.disabled]), [
    ['sqlite', true, false], ['supabase', false, true], ['custom', false, true],
  ]);
  const hint = tree.find((element) => element.props?.className === 'create-field__hint');
  assert.equal(hint.props.children, 'This becomes the isolated local workspace folder.');
  const workspace = byType(tree, 'dd').map((element) => text(element.props.children));
  assert.deepEqual(workspace, ['Starter Site', 'v0.1.0', 'Assigned automatically', 'Set a website name']);
  assert.equal(submit(tree).props.disabled, true);
  assert.equal(submit(tree).props.children, 'Create local instance');
  assert.equal(tree.some((element) => element.props?.role === 'alert'), false);
  assert.equal(byType(tree, 'h3').some((element) => element.props.children === 'Connect services'), false);
  assert.equal(input(tree, (props) => props.placeholder === 'https://your-project.supabase.co'), undefined);
  assert.equal(input(tree, (props) => props.placeholder === 'e.g. Neon, PlanetScale, Turso'), undefined);
  assert.equal(tree.find((element) => element.props?.className === 'database-option is-selected ').type, 'label');
});

test('shows the workspace folder and enables submit once the form says it can create', () => {
  const { tree } = setup({ form: { name: 'Corner Bakery', slug: 'corner-bakery', canCreate: true } });
  const name = input(tree, (props) => props.placeholder === 'e.g. Corner Bakery');
  assert.equal(name.props.value, 'Corner Bakery');
  const hint = tree.find((element) => element.props?.className === 'create-field__hint');
  assert.equal(hint.props.children, 'Workspace folder: corner-bakery');
  assert.equal(text(byType(tree, 'dd').at(-1).props.children), 'corner-bakery');
  assert.equal(submit(tree).props.disabled, false);
});

test('keeps submit disabled and relabelled while a create is in flight', () => {
  const { tree } = setup({ form: { slug: 'x', canCreate: true, isSubmitting: true } });
  assert.equal(submit(tree).props.disabled, true);
  assert.equal(submit(tree).props.children, 'Creating…');
});

test('shows a submission error as an alert in place of the readiness note', () => {
  const { tree } = setup({ form: { formError: 'Port 4100 is already in use.' } });
  const alert = tree.find((element) => element.props?.role === 'alert');
  assert.equal(alert.props.children, 'Port 4100 is already in use.');
  assert.equal(tree.some((element) => element.type === 'p' && /UI onboarding is ready/.test(String(element.props.children))), false);
});

test('routes every form control to its own setter, and both back controls to onBack', () => {
  const { tree, calls, state, wrappedCreate, formReceived } = setup();
  assert.equal(formReceived(), wrappedCreate, 'the form submits through the token wrapper');
  input(tree, (props) => props.placeholder === 'e.g. Corner Bakery').props.onChange(change('Bakery'));
  input(tree, (props) => props.value === 'sqlite').props.onChange();
  for (const button of byType(tree, 'button').filter((element) => element.props.type === 'button')) button.props.onClick();
  const form = byType(tree, 'form')[0];
  assert.equal(form.props.onSubmit, state.handleSubmit);
  assert.deepEqual(calls.setName, [['Bakery']]);
  assert.deepEqual(calls.setDatabase, [['sqlite']]);
  assert.equal(calls.onBack?.length, 2);
});

test('the Supabase branch (reachable only through state) wires its URL and uncontrolled key input', () => {
  const { tree, calls, state } = setup({ form: { database: 'supabase' as DatabaseProviderKind, supabaseUrl: 'https://p.supabase.co' } });
  const url = input(tree, (props) => props.placeholder === 'https://your-project.supabase.co');
  assert.equal(url.props.value, 'https://p.supabase.co');
  url.props.onChange(change('https://q.supabase.co'));
  const key = input(tree, (props) => props.placeholder === 'Paste your API key');
  assert.equal(key.props.ref, state.supabaseKeyRef);
  assert.equal(key.props.type, 'password');
  assert.equal('value' in key.props, false, 'the key input stays uncontrolled');
  key.props.onChange(change('secret'));
  key.props.onChange(change(''));
  assert.deepEqual(calls.setSupabaseUrl, [['https://q.supabase.co']]);
  assert.deepEqual(calls.setHasSupabaseKey, [[true], [false]], 'only whether a key was typed reaches state');
  assert.equal(input(tree, (props) => props.placeholder === 'e.g. Neon, PlanetScale, Turso'), undefined);
});

test('the Custom branch wires provider, connection and an uncontrolled credential', () => {
  const { tree, calls, state } = setup({ form: { database: 'custom' as DatabaseProviderKind, customProvider: 'Neon', customConnection: 'postgres://h' } });
  const provider = input(tree, (props) => props.placeholder === 'e.g. Neon, PlanetScale, Turso');
  const connection = input(tree, (props) => props.placeholder === 'https://… or postgres://…');
  const credential = input(tree, (props) => props.placeholder === 'Paste a credential if your provider requires one');
  assert.equal(provider.props.value, 'Neon');
  assert.equal(connection.props.value, 'postgres://h');
  assert.equal(credential.props.ref, state.customCredentialRef);
  provider.props.onChange(change('Turso'));
  connection.props.onChange(change('libsql://x'));
  credential.props.onChange(change('tok'));
  credential.props.onChange(change(''));
  assert.deepEqual(calls.setCustomProvider, [['Turso']]);
  assert.deepEqual(calls.setCustomConnection, [['libsql://x']]);
  assert.deepEqual(calls.setHasCustomCredential, [[true], [false]]);
  assert.equal(input(tree, (props) => props.placeholder === 'https://your-project.supabase.co'), undefined);
});

test('offers one optional, uncontrolled token field per connectable service', () => {
  const plugins = [
    { pluginId: 'github', displayName: 'GitHub', helpUrl: 'https://github.com/settings/tokens' },
    { pluginId: 'my-crm', displayName: 'My Crm', helpUrl: 'https://crm.example/tokens' },
  ];
  const { tree, refCallbacks } = setup({ plugins });
  assert.ok(byType(tree, 'h3').some((element) => element.props.children === 'Connect services'));
  const fields = byType(tree, 'input').filter((element) => element.props.placeholder === 'Paste an access token');
  assert.equal(fields.length, 2);
  assert.deepEqual(fields.map((field) => field.props.ref), [refCallbacks.get('github'), refCallbacks.get('my-crm')]);
  for (const field of fields) {
    assert.equal(field.props.type, 'password');
    assert.equal(field.props.autoComplete, 'new-password');
    assert.equal('value' in field.props, false);
  }
  const links = byType(tree, 'a').map((link) => [link.props.href, link.props.target, link.props.rel]);
  assert.deepEqual(links, [
    ['https://github.com/settings/tokens', '_blank', 'noopener noreferrer'],
    ['https://crm.example/tokens', '_blank', 'noopener noreferrer'],
  ]);
  const labels = byType(tree, 'label').filter((label) => label.key === 'github' || label.key === 'my-crm');
  assert.deepEqual(labels.map((label) => label.key), ['github', 'my-crm']);
});

test('renders with the real default hooks: SQLite selected, submit disabled, no services yet', () => {
  const html = renderToStaticMarkup(React.createElement(CreateWebsiteOnboarding, { onBack: () => {}, onCreate: async () => {} }));
  assert.match(html, /<input type="radio" name="database" checked="" value="sqlite"\/>/);
  assert.match(html, /<button type="submit" class="button button--primary" disabled="">Create local instance<\/button>/);
  assert.doesNotMatch(html, /Connect services/);
  assert.match(html, /This becomes the isolated local workspace folder\./);
});

test('the two database options this app cannot provision carry a "Soon" tag; SQLite does not', () => {
  const { tree } = setup();
  const card = (value: string) => byType(tree, 'label').find((element) => elements(element).some((child) => child.type === 'input' && child.props.value === value));
  const soon = (value: string) => elements(card(value)).filter((element) => element.props?.className === 'database-option__soon');
  for (const value of ['supabase', 'custom']) {
    assert.deepEqual(soon(value).map((element) => element.props.children), ['Soon'], `${value} must say Soon`);
  }
  assert.deepEqual(soon('sqlite'), [], 'SQLite is available now, so it carries no tag');
});

test('the "Soon" tag reuses the admin sidebar badge look (uppercase, bordered, faint)', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const start = css.indexOf('.database-option__soon {');
  assert.notEqual(start, -1, 'the tag needs its own rule');
  const rule = css.slice(start, css.indexOf('}', start));
  assert.match(rule, /text-transform:\s*uppercase/);
  assert.match(rule, /border:\s*1px solid var\(--border\)/);
  assert.match(rule, /color:\s*var\(--faint\)/);
});

test('the Instance copy section says Tovu creates the workspace', () => {
  const { tree } = setup();
  const paragraphs = byType(tree, 'p').map((element) => text(element.props.children));
  assert.ok(paragraphs.includes('Tovu will create a separate workspace from the selected release.'));
  assert.equal(paragraphs.some((line) => /Runner will create/.test(line)), false);
});
