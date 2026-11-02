/**
 * @file `CreateWebsiteOnboarding` rendered from its own module into a real React root under jsdom
 * (`app/component-harness.ts`), driven with real DOM events.
 *
 * The component takes its hooks as injectable props (see its own doc comment), so each test puts
 * the layout straight into one state with a plain stub form hook and asserts what is on screen and
 * what reached the stub. One test renders with the REAL default hooks, which proves the defaults
 * are wired. The shared harness publishes `React` as a global first, which the classic JSX
 * transform `npm test` compiles the `.tsx` with needs.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, installBridge, mount, type Mounted, type TestContext } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { CreateWebsiteOnboarding } from './CreateWebsiteOnboarding.js';
import type { CreateWebsiteFormState, useCreateWebsiteForm } from './use-create-website-form.hooks.js';
import type { CreateSitePluginTokens, useCreateSitePluginTokens } from './use-create-site-plugin-tokens.hooks.js';
import type { CreateSiteInput, DatabaseProviderKind } from '../contracts/project.js';
import { SUPABASE_DATABASE_AVAILABLE } from './create-website-onboarding-policy.js';

after(closeHost);

type Calls = Record<string, unknown[][]>;

function recorder(calls: Calls, name: string) {
  return (...args: unknown[]) => { (calls[name] ??= []).push(args); };
}

function setup(t: TestContext, { form = {}, plugins = [], supabaseDatabaseAvailable, destinationHint = 'Checking website destination…' }: {
  form?: Partial<CreateWebsiteFormState>;
  destinationHint?: string;
  plugins?: CreateSitePluginTokens['plugins'];
  supabaseDatabaseAvailable?: boolean;
} = {}) {
  const calls: Calls = {};
  const supabaseKeyRef = { current: null as HTMLInputElement | null };
  const customCredentialRef = { current: null as HTMLInputElement | null };
  const refCallbacks = new Map<string, (element: HTMLInputElement | null) => void>();
  const tokenFields = new Map<string, HTMLInputElement | null>();
  const wrappedCreate = async (_input: CreateSiteInput) => {};
  let formReceived: unknown;
  const onCreate = async (_input: CreateSiteInput) => {};
  let tokensEnabled: boolean | undefined;
  const usePluginTokens: typeof useCreateSitePluginTokens = (_requiredArgs, optionalArgs) => {
    tokensEnabled = optionalArgs?.enabled;
    return {
      plugins,
      inputRef: (pluginId) => {
        // One callback per service, stable across renders like the real hook's, recording the element it gets.
        const callback = refCallbacks.get(pluginId) ?? ((element: HTMLInputElement | null) => { tokenFields.set(pluginId, element); });
        refCallbacks.set(pluginId, callback);
        return callback;
      },
      withTokens: (inner) => { assert.equal(inner, onCreate, 'withTokens must wrap the caller onCreate'); return wrappedCreate; },
    };
  };
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
  const view = mount({ t, element: createElement(CreateWebsiteOnboarding, {
    onBack, onCreate, useForm, usePluginTokens, supabaseDatabaseAvailable,
    useDestination: ({ name }) => { recorder(calls, 'planName')(name); return destinationHint; },
  }) });
  return { view, calls, state, refCallbacks, tokenFields, wrappedCreate, tokensEnabled: () => tokensEnabled, formReceived: () => formReceived };
}

const field = (view: Mounted, placeholder: string) => view.container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
const radio = (view: Mounted, value: string) => view.container.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
const submit = (view: Mounted) => view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const headings = (view: Mounted) => view.all('h3').map((heading) => heading.textContent);
const nameHint = (view: Mounted) => view.container.querySelector('.create-field__hint')?.textContent;
const isInfoTip = (element: Element) => element.classList.contains('info-tip');
const actionButtons = (view: Mounted) => view.all('button').filter((button) => !isInfoTip(button));
const NAME = 'e.g. Corner Bakery';
const SUPABASE_URL = 'https://your-project.supabase.co';
const CUSTOM_PROVIDER = 'e.g. Neon, PlanetScale, Turso';
const TOKEN = 'Paste an access token';
const READINESS = /UI onboarding is ready/;
const supabasePlugin = { pluginId: 'supabase', displayName: 'Supabase', helpUrl: 'https://supabase.com/dashboard/account/tokens' };

test('CreateWebsiteOnboarding: starts on the SQLite default with no slug, a disabled submit and no vendor fields', (t) => {
  const { view } = setup(t);
  const radios = view.all('input[type="radio"]') as HTMLInputElement[];
  assert.deepEqual(radios.map((r) => [r.value, r.checked, r.disabled]), [
    ['sqlite', true, false], ['supabase', false, true], ['custom', false, true],
  ]);
  assert.equal(nameHint(view), 'Checking website destination…');
  assert.deepEqual(view.all('dd'), [], 'the hidden instance summary renders no values');
  assert.equal(submit(view).disabled, true);
  assert.equal(submit(view).textContent, 'Create local instance');
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  assert.equal(headings(view).includes('Connect services'), false);
  assert.equal(field(view, SUPABASE_URL), null);
  assert.equal(field(view, CUSTOM_PROVIDER), null);
  const selected = view.all('label.database-option.is-selected');
  assert.equal(selected.length, 1);
  assert.equal(selected[0]!.querySelector('input')?.value, 'sqlite');
});

test('CreateWebsiteOnboarding: shows the planned sites-home destination and enables submit once the form says it can create', (t) => {
  const { view, calls } = setup(t, { form: { name: 'Corner Bakery', slug: 'corner-bakery', canCreate: true }, destinationHint: 'Creates ~/Documents/Tovu/sites/corner-bakery-2' });
  const name = field(view, NAME)!;
  assert.equal(name.value, 'Corner Bakery');
  assert.equal(name.maxLength, 200);
  assert.deepEqual(calls.planName?.at(-1), ['Corner Bakery'], 'the destination is planned for the typed name');
  assert.equal(nameHint(view), 'Creates ~/Documents/Tovu/sites/corner-bakery-2');
  assert.deepEqual(view.all('dd'), [], 'the workspace preview lives only under the name field');
  assert.equal(submit(view).disabled, false);
});

test('CreateWebsiteOnboarding: keeps submit disabled and relabelled while a create is in flight', (t) => {
  const { view } = setup(t, { form: { slug: 'x', canCreate: true, isSubmitting: true } });
  assert.equal(submit(view).disabled, true);
  assert.equal(submit(view).textContent, 'Creating…');
});

test('CreateWebsiteOnboarding: renders a footer only for the exact submission error', (t) => {
  const { view } = setup(t, { form: { formError: 'Port 4100 is already in use.' } });
  const alerts = view.all('[role="alert"]');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.textContent, 'Port 4100 is already in use.');
  const footers = view.all('footer');
  assert.equal(footers.length, 1);
  assert.equal(footers[0]!.textContent, 'Port 4100 is already in use.');
  assert.equal(alerts[0]!.closest('footer'), footers[0]);
  assert.doesNotMatch(view.text(), READINESS);
});

test('CreateWebsiteOnboarding: every form control reaches its own setter, submit reaches the form hook, both back controls reach onBack', async (t) => {
  // Supabase made selectable, so a click on a radio that is not already checked can change the choice.
  const { view, calls, wrappedCreate, formReceived } = setup(t, { supabaseDatabaseAvailable: true });
  assert.equal(formReceived(), wrappedCreate, 'the form submits through the token wrapper');
  await view.type(field(view, NAME)!, 'Bakery');
  await view.click(radio(view, 'supabase'));
  for (const button of view.all('button[type="button"]').filter((button) => !isInfoTip(button))) await view.click(button);
  await act(async () => { view.container.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(calls.setName, [['Bakery']]);
  assert.deepEqual(calls.setDatabase, [['supabase']]);
  assert.equal(calls.onBack?.length, 2);
  assert.equal(calls.handleSubmit?.length, 1);
});

test('CreateWebsiteOnboarding: the Supabase branch (reachable only through state) wires its URL and uncontrolled key input', async (t) => {
  const { view, calls, state } = setup(t, { form: { database: 'supabase' as DatabaseProviderKind, supabaseUrl: 'https://p.supabase.co' } });
  const url = field(view, SUPABASE_URL)!;
  assert.equal(url.value, 'https://p.supabase.co');
  await view.type(url, 'https://q.supabase.co');
  const key = field(view, 'Paste your API key')!;
  assert.equal(state.supabaseKeyRef.current, key, 'the form reads the key through its own ref');
  assert.equal(key.type, 'password');
  await view.type(key, 'secret');
  assert.equal(key.value, 'secret', 'the key input stays uncontrolled: the typed key lives only in the field');
  await view.type(key, '');
  assert.deepEqual(calls.setSupabaseUrl, [['https://q.supabase.co']]);
  assert.deepEqual(calls.setHasSupabaseKey, [[true], [false]], 'only whether a key was typed reaches state');
  assert.equal(field(view, CUSTOM_PROVIDER), null);
});

test('CreateWebsiteOnboarding: the Custom branch wires provider, connection and an uncontrolled credential', async (t) => {
  const { view, calls, state } = setup(t, { form: { database: 'custom' as DatabaseProviderKind, customProvider: 'Neon', customConnection: 'postgres://h' } });
  const provider = field(view, CUSTOM_PROVIDER)!;
  const connection = field(view, 'https://… or postgres://…')!;
  const credential = field(view, 'Paste a credential if your provider requires one')!;
  assert.equal(provider.value, 'Neon');
  assert.equal(connection.value, 'postgres://h');
  assert.equal(state.customCredentialRef.current, credential);
  await view.type(provider, 'Turso');
  await view.type(connection, 'libsql://x');
  await view.type(credential, 'tok');
  await view.type(credential, '');
  assert.deepEqual(calls.setCustomProvider, [['Turso']]);
  assert.deepEqual(calls.setCustomConnection, [['libsql://x']]);
  assert.deepEqual(calls.setHasCustomCredential, [[true], [false]]);
  assert.equal(field(view, SUPABASE_URL), null);
});

test('CreateWebsiteOnboarding: offers one optional, uncontrolled token field per connectable service when Supabase is available', (t) => {
  const plugins = [
    { pluginId: 'github', displayName: 'GitHub', helpUrl: 'https://github.com/settings/tokens' },
    { pluginId: 'my-crm', displayName: 'My Crm', helpUrl: 'https://crm.example/tokens' },
  ];
  const { view, tokenFields, tokensEnabled } = setup(t, { plugins, supabaseDatabaseAvailable: true });
  assert.equal(tokensEnabled(), true);
  assert.equal(radio(view, 'supabase').disabled, false);
  assert.ok(headings(view).includes('Connect services'));
  const fields = view.all(`input[placeholder="${TOKEN}"]`) as HTMLInputElement[];
  assert.equal(fields.length, 2);
  assert.equal(tokenFields.get('github'), fields[0], 'the GitHub field reaches the token hook through its ref');
  assert.equal(tokenFields.get('my-crm'), fields[1]);
  for (const input of fields) {
    assert.equal(input.type, 'password');
    assert.equal(input.getAttribute('autocomplete'), 'new-password');
    assert.equal(input.value, '');
  }
  const links = view.all('a').map((link) => [link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]);
  assert.deepEqual(links, [
    ['https://github.com/settings/tokens', '_blank', 'noopener noreferrer'],
    ['https://crm.example/tokens', '_blank', 'noopener noreferrer'],
  ]);
  const labels = fields.map((input) => input.closest('label')?.querySelector('.create-field__label')?.textContent);
  assert.deepEqual(labels, ['GitHub access token (optional)', 'My Crm access token (optional)']);
});

test('CreateWebsiteOnboarding: hides Connect services and disables its tokens while the Supabase flag is false, even with offered plugins', (t) => {
  assert.equal(SUPABASE_DATABASE_AVAILABLE, false);
  const { view, tokensEnabled, refCallbacks } = setup(t, { plugins: [supabasePlugin] });
  assert.equal(headings(view).includes('Connect services'), false);
  assert.equal(field(view, TOKEN), null);
  assert.equal(radio(view, 'supabase').disabled, true);
  assert.equal(tokensEnabled(), false);
  assert.equal(refCallbacks.size, 0);
});

test('CreateWebsiteOnboarding: renders Connect services and enables the Supabase card through the injected availability flag', (t) => {
  const { view, tokensEnabled } = setup(t, { supabaseDatabaseAvailable: true, plugins: [supabasePlugin] });
  assert.deepEqual(headings(view), ['Website details', 'Database', 'Connect services']);
  assert.equal(radio(view, 'supabase').disabled, false);
  assert.equal(tokensEnabled(), true);
  assert.ok(field(view, TOKEN));
  assert.equal(radio(view, 'supabase').closest('label')!.querySelector('.database-option__soon'), null);
});

test('CreateWebsiteOnboarding: with the real default hooks, SQLite is selected, submit is disabled and no services show yet', (t) => {
  // Main never answers the destination plan here, so the real `useNewSiteDir` is still checking.
  installBridge({ t, bridge: { planNewDir: () => new Promise(() => {}) } });
  const view = mount({ t, element: createElement(CreateWebsiteOnboarding, { onBack: () => {}, onCreate: async () => {} }) });
  assert.equal(radio(view, 'sqlite').checked, true);
  assert.equal(submit(view).disabled, true);
  assert.equal(submit(view).className, 'button button--primary');
  assert.equal(submit(view).textContent, 'Create local instance');
  assert.equal(headings(view).includes('Connect services'), false);
  assert.match(view.text(), /Checking website destination…/);
});

test('CreateWebsiteOnboarding: the two database options this app cannot provision carry a "Soon" tag; SQLite does not', (t) => {
  const { view } = setup(t);
  const soon = (value: string) => [...radio(view, value).closest('label')!.querySelectorAll('.database-option__soon')].map((tag) => tag.textContent);
  for (const value of ['supabase', 'custom']) {
    assert.deepEqual(soon(value), ['Soon'], `${value} must say Soon`);
  }
  assert.deepEqual(soon('sqlite'), [], 'SQLite is available now, so it carries no tag');
});

test('CreateWebsiteOnboarding: the owner-hidden Instance copy section and its description are absent', (t) => {
  const { view } = setup(t);
  assert.equal(headings(view).includes('Instance copy'), false);
  assert.doesNotMatch(view.text(), /Tovu will create a separate workspace from the selected release\./);
  assert.deepEqual(view.all('dl'), []);
  assert.doesNotMatch(view.text(), /Runner will create/);
});

test('CreateWebsiteOnboarding: no footer or readiness text renders without an error, and both action buttons remain', (t) => {
  for (const formError of [null, '']) {
    const { view } = setup(t, { form: { formError } });
    assert.deepEqual(view.all('footer'), []);
    assert.doesNotMatch(view.text(), READINESS);
    assert.deepEqual(actionButtons(view).map((button) => button.textContent), ['← All websites', 'Cancel', 'Create local instance']);
  }
});

test('CreateWebsiteOnboarding: the credential hints name Tovu, never Runner', (t) => {
  const hints = (database: DatabaseProviderKind) => setup(t, { form: { database } }).view.all('span.create-field__hint')
    .map((hint) => hint.textContent ?? '')
    .filter((line) => /vault/.test(line));
  assert.deepEqual(hints('supabase'), ['Credentials must be saved in the Tovu vault before provisioning; this prototype does not retain the key.']);
  assert.deepEqual(hints('custom'), ['Credentials must be saved in the Tovu vault before provisioning; this prototype does not retain them.']);
});

test('CreateWebsiteOnboarding: D-02 an oversized draft shows the exact inline validation inside the name field', (t) => {
  const message = 'A name must be 1 to 200 characters, not counting spaces at either end.';
  const { view } = setup(t, { form: { name: 'x'.repeat(248), nameError: message, canCreate: false } });
  const name = field(view, NAME)!;
  assert.equal(name.maxLength, 200);
  assert.equal(name.getAttribute('aria-invalid'), 'true');
  const alert = view.container.querySelector('[role="alert"]');
  assert.equal(alert?.textContent, message);
  assert.equal(alert?.closest('label'), name.closest('label'), 'the message sits inside the name field');
  assert.equal(submit(view).disabled, true);
});

test('CreateWebsiteOnboarding: section explanations are ⓘ tooltips beside their headings, not loose sentences (owner 2026-10-11)', (t) => {
  const { view } = setup(t);
  const explanations = [
    'Each website gets an isolated directory, database, port, and Tovu release.',
    'Name the isolated workspace for this Tovu instance.',
    'SQLite is the zero-configuration default. Bring a hosted vendor when you need one.',
  ];
  const tips = view.all('button.info-tip');
  assert.deepEqual(tips.map((tip) => [tip.getAttribute('type'), tip.getAttribute('aria-label'), tip.getAttribute('data-tooltip')]), explanations.map((line) => ['button', line, line]));
  assert.ok(tips.every((tip) => tip.classList.contains('jini-tooltip')), 'the TooltipLayer shows the text');
  const paragraphs = view.all('p').map((paragraph) => paragraph.textContent);
  for (const line of explanations) assert.equal(paragraphs.includes(line), false, line);
});

test('CreateWebsiteOnboarding: with services available but none offered by Tovu, there is no empty Connect services section', (t) => {
  const { view, tokensEnabled } = setup(t, { plugins: [], supabaseDatabaseAvailable: true });
  assert.equal(tokensEnabled(), true, 'the token hook is still asked, so a later offer can appear');
  assert.equal(headings(view).includes('Connect services'), false);
  assert.deepEqual(view.all('input[type="password"]'), []);
});
