import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeAddFailure } from './use-add-site.hooks.js';
import { deriveSitesHomeView, performSiteStart, countRunningSites } from './App.hooks.js';
import { chromeVisibility } from './expanded-mode.js';
import { elements, sourceFunction } from './source-test-harness.js';
import type { SiteRecord } from '../contracts/project.js';
import { desktopCopy } from '../desktop-i18n.js';
import { performPowerAction } from './use-site-power.hooks.js';

const TEMP = '/var/folders/7_/scratch/T/sites/junk';
const OCCUPIED = `${TEMP} is a folder of unrelated files, not a Tovu site (no config.json and no .site-meta.json). If your site lives in a subfolder, point at that subfolder instead.`;

test('D-24: Add shows a short recovery message without the error class or temporary path', () => {
  assert.equal(describeAddFailure(new Error(`Error invoking remote method 'runner:sites:add-site': AddSitePointerError: ${OCCUPIED}`)),
    'This folder is not a Tovu website. Choose the folder containing your website.');
});

test('D-24: an empty folder points to Create website', () => {
  assert.equal(describeAddFailure(new Error(`${TEMP} does not exist, or is an empty folder — there is no Tovu site here to add.`)),
    'No Tovu website was found in this folder. Choose an existing website or use Create website.');
});

test('D-24: a damaged folder and an unreadable folder have different recovery instructions', () => {
  assert.equal(describeAddFailure(new Error(`${TEMP} looks like a half-initialized or damaged Tovu site — it is missing config.json.`)),
    'This Tovu website is incomplete. Choose a complete website folder.');
  assert.equal(describeAddFailure(new Error(`${TEMP} cannot be examined — it may be on an unmounted volume.`)),
    'Cannot read this website folder. Check that it is available and that Tovu has permission to read it.');
});

test('D-24: unknown path-bearing Add failures have a short fallback', () => {
  assert.equal(describeAddFailure(new Error(`ENOENT: open '${TEMP}/config.json'`)),
    'Could not add this website. Check the folder and try again.');
});

test('D-24: Add recovery text uses the desktop locale', () => {
  assert.equal(describeAddFailure(new Error(OCCUPIED), { locale: 'es' }),
    'Esta carpeta no es un sitio web de Tovu. Elige la carpeta que contiene tu sitio web.');
});

test('D-24: every supported locale has all six recovery messages', () => {
  const english = desktopCopy({ locale: 'en' }).siteErrors;
  for (const locale of ['es', 'de', 'it', 'zh-CN', 'zh-TW', 'ar', 'fa', 'ru', 'ja', 'id', 'pt-BR', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'hi', 'ur', 'bn']) {
    const copy = desktopCopy({ locale }).siteErrors;
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      assert.ok(copy[key].trim(), `${locale}.${key} is missing`);
      assert.notEqual(copy[key], english[key], `${locale}.${key} fell back to English`);
    }
  }
});

test('D-24: a failed site start hides the internal temp path', async () => {
  assert.deepEqual(await performSiteStart('/sites/a', { startSite: async () => {
    throw new Error(`Error invoking remote method 'runner:sites:start': Error: tovu serve failed for ${TEMP}: exit 1`);
  } }), { error: 'Could not start this website. Try again or check its logs.' });
});

test('D-24: starting from a card uses the same path-free message', async () => {
  assert.deepEqual(await performPowerAction('start', '/sites/a', {
    startSite: async () => { throw new Error(`tovu serve failed for ${TEMP}: exit 1`); },
    stopSite: async () => assert.fail('Start must not stop the site'),
  }), { error: 'Could not start this website. Try again or check its logs.' });
});

test('D-24: Add feedback stays on the websites view when switching to a site tab', () => {
  const noop = () => {};
  const site = { id: '/sites/a', displayName: 'My site', status: 'running', port: 4321 } as SiteRecord;
  const message = 'Could not add this website. Check the folder and try again.';
  let activeTab: string | null = null;
  let areaProps: any;
  const renderApp = sourceFunction(readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), 'App', {
    useTheme: () => ['light', noop], useSiteRescan: () => ({}), useApplySiteRecord: () => noop,
    useAddSite: () => ({ adding: false, addError: message, addSite: noop }),
    deriveSitesHomeView, chromeVisibility, countRunningSites, findSection: () => ({}),
    useFindInPage: () => ({}), useZoom: () => ({}), useRunnerNavigation: noop,
    useProjectMutations: () => ({}), FindBar: () => null, TopNav: () => null, TabStrip: () => null,
    MainArea: (props: any) => { areaProps = props; return null; },
    CreateWebsiteHost: () => null, SiteWorkspaces: () => null,
  });
  const render = () => elements(renderApp({
    useProjects: () => ({ projects: [site], setProjects: noop }),
    useTabs: () => ({ openTabs: [site.id], activeTab, setActiveTab: noop }),
    useNav: () => ({ activeId: 'projects', appearanceOpen: false, isCreating: false }),
    useExpanded: () => ({ expanded: false }),
  }));
  render();
  assert.equal(areaProps.showSitesHome, true);
  assert.equal(areaProps.addError, message);
  activeTab = site.id;
  assert.ok(!render().some(element => element.props.children === message), 'the Add failure must not overlay the site');
  assert.equal(areaProps.showSitesHome, false);
  activeTab = null;
  render();
  assert.equal(areaProps.showSitesHome, true);
});
