/**
 * Tests for `scripts/check-bundle-mounts.mjs`, the post-build execute-and-assert smoke check.
 * The runner is driven with small hand-written bundle sources (each is the JS text a real build
 * would emit, evaluated in the same fresh jsdom), and each scenario's `verify` is driven with the
 * passing and failing page states it exists to tell apart. The CLI's ports (file read, check,
 * stderr, exit) are injected fakes; one test reads a real temp file through the default reader.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  ACTION_QUEUE_STORAGE_KEY, BUNDLE_PATH, BundleCheckError, MOUNT_ID, TRANSCRIPT_STORAGE_KEY,
  checkBundleMounts, fail, isEntryPoint, isNavigationError, main, runScenario, scenarios,
  type BundleScenario,
} from '../../scripts/check-bundle-mounts.mjs';

const MOUNT = `document.getElementById(${JSON.stringify(MOUNT_ID)}).appendChild(document.createElement('div'));`;
const quiet = { settleMs: 5, log: () => {} };

/** A Map-backed `Storage`. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as unknown as Storage;
}

/** A page whose `.entry-title` heading has the given class/scroll-call state, or no heading at all. */
function page({ heading = true, highlighted = false, scrolls }: { heading?: boolean; highlighted?: boolean; scrolls?: number } = {}) {
  const document = new JSDOM('<!doctype html><body></body>').window.document;
  if (heading) {
    const h1 = document.body.appendChild(document.createElement('h1'));
    h1.className = highlighted ? 'entry-title tovu-site-assistant__highlight' : 'entry-title';
    if (scrolls !== undefined) Object.assign(h1, { __tovuScrollIntoViewCalls: scrolls });
  }
  return document;
}

const scenario = (prefix: string): BundleScenario => {
  const found = scenarios.find((candidate) => candidate.name.startsWith(prefix));
  assert.ok(found, `no scenario named ${prefix}…`);
  return found;
};
const verify = (prefix: string, storage: Storage, document = page(), navigations: string[] = []) => scenario(prefix).verify!(storage, document, navigations);
const rejects = (fn: () => void, pattern: RegExp) => assert.throws(fn, (error: unknown) => error instanceof BundleCheckError && pattern.test(error.message));

test('fail throws a BundleCheckError carrying the message', () => {
  rejects(() => fail('nope'), /^nope$/);
});

test('isNavigationError recognises only jsdom\'s navigation report', () => {
  assert.equal(isNavigationError(new Error('Not implemented: navigation (except hash changes)')), true);
  assert.equal(isNavigationError(new Error('Not implemented: window.alert')), false);
  assert.equal(isNavigationError({ message: 42 }), false);
  assert.equal(isNavigationError(null), false);
});

test('a bundle that mounts passes, with the page stubs real browsers provide in place', async () => {
  const lines: string[] = [];
  const seen: string[] = [];
  const bundle = `${MOUNT}
    const heading = document.querySelector('.entry-title');
    heading.scrollIntoView({ block: 'center' }); heading.scrollIntoView({ block: 'start' });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', () => {}); media.removeEventListener('change', () => {});
    window.__media = media.matches + ':' + media.media;
    requestAnimationFrame((time) => { window.__frame = typeof time; });
    location.assign('/about');
    alert('not a navigation');`;
  await runScenario({
    scenario: {
      name: 'exerciser',
      seed: (storage) => storage.setItem('seeded', 'yes'),
      verify: (storage, document, navigations) => {
        seen.push(storage.getItem('seeded')!);
        const heading = document.querySelector('.entry-title') as unknown as { __tovuScrollIntoViewCalls: number; __tovuLastScrollIntoViewOptions: unknown };
        seen.push(String(heading.__tovuScrollIntoViewCalls), JSON.stringify(heading.__tovuLastScrollIntoViewOptions));
        const window = document.defaultView as unknown as { __media: string; __frame: string };
        seen.push(window.__media, window.__frame, String(navigations.length));
      },
    },
    bundleSource: bundle,
  }, { settleMs: 20, log: (line) => lines.push(line) });
  assert.deepEqual(seen, ['yes', '2', '{"block":"start"}', 'false:(prefers-reduced-motion: reduce)', 'number', '1']);
  assert.match(lines[0]!, /OK \[exerciser\] — bundle executed cleanly and mounted 1 child element\(s\)/);
});

test('a bundle that throws while evaluating fails before mounting is even checked', async () => {
  await assert.rejects(runScenario({ scenario: { name: 'sync' }, bundleSource: 'throw new Error("process is not defined");' }, quiet),
    (error: Error) => error instanceof BundleCheckError && /\[sync\] the bundle threw during execution/.test(error.message) && /process is not defined/.test(error.message));
  const reported = `${MOUNT} window.dispatchEvent(new ErrorEvent('error', { error: new Error('render crashed') }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: null }));`;
  await assert.rejects(runScenario({ scenario: { name: 'events' }, bundleSource: reported }, quiet),
    (error: Error) => /render crashed/.test(error.message) && /- null$/m.test(error.message));
});

test('an error raised after evaluation is reported as a post-mount failure', async () => {
  const late = `${MOUNT} setTimeout(() => window.dispatchEvent(new ErrorEvent('error', { message: 'effect failed' })), 0);`;
  await assert.rejects(runScenario({ scenario: { name: 'late' }, bundleSource: late }, quiet),
    (error: Error) => /\[late\] the bundle threw after mounting/.test(error.message) && /effect failed/.test(error.message));
});

test('a bundle that removes the mount point, or never renders into it, fails', async () => {
  await assert.rejects(runScenario({ scenario: { name: 'gone' }, bundleSource: `document.getElementById(${JSON.stringify(MOUNT_ID)}).remove();` }, quiet),
    /\[gone\] #tovu-site-assistant-root is missing/);
  await assert.rejects(runScenario({ scenario: { name: 'empty' }, bundleSource: '' }, quiet), /\[empty\] #tovu-site-assistant-root has no children/);
});

test('the poisoned and wrong-shaped transcript scenarios seed their keys and accept only a cleared or empty entry', () => {
  for (const [prefix, survivor] of [['poisoned transcript', '{not valid json'], ['wrong-shaped transcript', '{"oops":1}']] as const) {
    const seeded = memoryStorage();
    scenario(prefix).seed!(seeded);
    assert.ok(seeded.getItem(TRANSCRIPT_STORAGE_KEY), `${prefix} seeds the transcript key`);
    verify(prefix, memoryStorage());
    verify(prefix, memoryStorage({ [TRANSCRIPT_STORAGE_KEY]: JSON.stringify({ open: false, messages: [] }) }));
    rejects(() => verify(prefix, memoryStorage({ [TRANSCRIPT_STORAGE_KEY]: survivor })), /must not survive verbatim/);
    rejects(() => verify(prefix, memoryStorage({ [TRANSCRIPT_STORAGE_KEY]: 'nope' })), /is not valid JSON: nope/);
    for (const replaced of [{ open: true, messages: [] }, { open: false, messages: 'x' }, { open: false, messages: [{ id: 'm' }] }]) {
      rejects(() => verify(prefix, memoryStorage({ [TRANSCRIPT_STORAGE_KEY]: JSON.stringify(replaced) })), /unexpected, non-empty value/);
    }
  }
});

test('the queue scenarios seed an entry and pass only once it was drained', () => {
  for (const prefix of ['poisoned action-queue', 'a real queued action', 'a queued navigate']) {
    const seeded = memoryStorage();
    scenario(prefix).seed!(seeded);
    assert.ok(seeded.getItem(ACTION_QUEUE_STORAGE_KEY), `${prefix} seeds the queue key`);
    verify(prefix, memoryStorage());
    rejects(() => verify(prefix, memoryStorage({ [ACTION_QUEUE_STORAGE_KEY]: '{}' })), /drain|deleted/);
  }
  verify('a queued navigate', memoryStorage(), page({ heading: false }));
  rejects(() => verify('a queued navigate', memoryStorage(), page({ highlighted: true })), /must never be executed as a highlight/);
});

test('the highlight scenario needs the heading highlighted, scrolled exactly once, and the queue drained', () => {
  const prefix = 'a queued highlight';
  const seeded = memoryStorage();
  scenario(prefix).seed!(seeded);
  assert.equal(JSON.parse(seeded.getItem(ACTION_QUEUE_STORAGE_KEY)!).type, 'highlight');
  verify(prefix, memoryStorage(), page({ highlighted: true, scrolls: 1 }));
  rejects(() => verify(prefix, memoryStorage(), page({ heading: false })), /seeded page heading is missing/);
  rejects(() => verify(prefix, memoryStorage(), page({ scrolls: 1 })), /never received the tovu-site-assistant__highlight class/);
  rejects(() => verify(prefix, memoryStorage(), page({ highlighted: true })), /exactly one scrollIntoView call, got 0/);
  rejects(() => verify(prefix, memoryStorage(), page({ highlighted: true, scrolls: 2 })), /got 2/);
  rejects(() => verify(prefix, memoryStorage({ [ACTION_QUEUE_STORAGE_KEY]: '{}' }), page({ highlighted: true, scrolls: 1 })), /should have been drained/);
});

test('the scroll_to scenario needs one scroll, no highlight, and the queue drained', () => {
  const prefix = 'a queued scroll_to';
  const seeded = memoryStorage();
  scenario(prefix).seed!(seeded);
  assert.equal(JSON.parse(seeded.getItem(ACTION_QUEUE_STORAGE_KEY)!).type, 'scroll_to');
  verify(prefix, memoryStorage(), page({ scrolls: 1 }));
  rejects(() => verify(prefix, memoryStorage(), page({ heading: false })), /got 0/);
  rejects(() => verify(prefix, memoryStorage(), page({ scrolls: 3 })), /got 3/);
  rejects(() => verify(prefix, memoryStorage(), page({ scrolls: 1, highlighted: true })), /must never apply the highlight class/);
  rejects(() => verify(prefix, memoryStorage({ [ACTION_QUEUE_STORAGE_KEY]: '{}' }), page({ scrolls: 1 })), /should have been drained/);
});

test('the rehydrated-directive scenario seeds an already-executed navigate and fails on any navigation attempt', () => {
  const prefix = 'a rehydrated message';
  const seeded = memoryStorage();
  scenario(prefix).seed!(seeded);
  assert.equal(JSON.parse(seeded.getItem(TRANSCRIPT_STORAGE_KEY)!).messages.at(-1).events[0].data.action.auto, true);
  verify(prefix, memoryStorage(), page(), []);
  rejects(() => verify(prefix, memoryStorage(), page(), ['Not implemented: navigation']), /re-fired on mount — 1 navigation attempt/);
});

test('checkBundleMounts runs every scenario in order and stops at the first failure', async () => {
  // A bundle that mounts but never reads sessionStorage passes the clean scenario and is caught by
  // the very next one: the corrupt transcript it should have cleared survives verbatim.
  await assert.rejects(checkBundleMounts({ bundleSource: MOUNT }, quiet), /poisoned transcript entry: the corrupt value must not survive verbatim/);
  // Default options: the real settle wait and console logging.
  await assert.rejects(checkBundleMounts({ bundleSource: '' }), /\[clean sessionStorage\] .* has no children/);
});

test('main reads the bundle, runs the check, and reports success as 0', async () => {
  const read: string[] = [];
  const checked: string[] = [];
  const status = await main({ bundlePath: '/dist/a.js' }, {
    readText: (file) => { read.push(file); return 'bundle text'; },
    check: async ({ bundleSource }) => { checked.push(bundleSource); },
    error: () => assert.fail('no error expected'), exit: () => assert.fail('no exit expected'),
  });
  assert.equal(status, 0);
  assert.deepEqual(read, ['/dist/a.js']);
  assert.deepEqual(checked, ['bundle text']);
});

test('main reports an unreadable bundle or a failed scenario on stderr with exit status 1', async () => {
  const errors: string[] = [];
  const exits: number[] = [];
  const ports = { error: (line: string) => void errors.push(line), exit: (code: number) => void exits.push(code) };
  const missing = await main({}, { ...ports, readText: () => { throw new Error('ENOENT'); }, check: async () => assert.fail('unreached') });
  assert.equal(missing, 1);
  assert.match(errors[0]!, new RegExp(`^\\[check-bundle-mounts\\] FAIL: could not read ${BUNDLE_PATH.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} — did the build run first\\? \\(ENOENT\\)$`));
  const failed = await main({}, { ...ports, readText: () => '', check: async () => fail('[x] broke') });
  assert.equal(failed, 1);
  assert.equal(errors[1], '[check-bundle-mounts] FAIL: [x] broke');
  assert.deepEqual(exits, [1, 1]);
  await assert.rejects(main({}, { ...ports, readText: () => '', check: async () => { throw new TypeError('a bug, not a check failure'); } }), TypeError);
  assert.equal(errors.length, 2, 'a programming error is not reported as a check failure');
});

test('main\'s default reader reads the bundle file from disk', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bundle-mounts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'site-assistant.js');
  writeFileSync(file, 'const built = 1;');
  const seen: string[] = [];
  assert.equal(await main({ bundlePath: file }, { check: async ({ bundleSource }) => { seen.push(bundleSource); } }), 0);
  assert.deepEqual(seen, ['const built = 1;']);
});

test('isEntryPoint is true only when the module is the script node was started with', () => {
  const file = path.resolve('scripts/check-bundle-mounts.mjs');
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: file }), true);
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: '/somewhere/else.mjs' }), false);
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: undefined }), false);
});

test('a bundle honouring every contract passes every scenario', async () => {
  // A positive control: the smallest bundle that keeps each promise the scenarios check — clear a
  // bad transcript, drain the queue before parsing it, scroll (and for highlight, mark) the target.
  const honest = `
    const T = ${JSON.stringify(TRANSCRIPT_STORAGE_KEY)}, Q = ${JSON.stringify(ACTION_QUEUE_STORAGE_KEY)};
    const raw = sessionStorage.getItem(T);
    if (raw !== null) {
      let ok = false;
      try { const value = JSON.parse(raw); ok = Array.isArray(value.messages) && value.messages.every((m) => m.id && m.role); } catch {}
      if (!ok) sessionStorage.removeItem(T);
    }
    const queued = sessionStorage.getItem(Q);
    sessionStorage.removeItem(Q);
    let action = null;
    try { action = JSON.parse(queued); } catch {}
    const heading = document.querySelector('.entry-title');
    if (action && (action.type === 'highlight' || action.type === 'scroll_to')) requestAnimationFrame(() => {
      heading.scrollIntoView({ block: 'center' });
      if (action.type === 'highlight') heading.classList.add('tovu-site-assistant__highlight');
    });
    ${MOUNT}`;
  const lines: string[] = [];
  await checkBundleMounts({ bundleSource: honest }, { settleMs: 20, log: (line) => lines.push(line) });
  assert.equal(lines.length, scenarios.length);
});

test('run as a script against a missing bundle, it fails loudly with exit status 1', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = path.resolve(import.meta.dirname, '../../scripts/check-bundle-mounts.mjs');
  const missing = path.join(os.tmpdir(), `no-such-bundle-${process.pid}.js`);
  const result = spawnSync(process.execPath, [script, missing], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`[check-bundle-mounts] FAIL: could not read ${missing} — did the build run first?`), result.stderr);
});
