/**
 * The three standalone build entries, imported for real into the isolated jsdom page
 * (`react-dom-harness.ts`): each must wire its product bindings into the page the moment it loads.
 * Stylesheet imports are the bundler's job, so a module hook resolves `.css` to an empty module here
 * (Vite emits them as separate assets; nothing in the entries reads them).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import { act, installDom } from './react-dom-harness';

const cssHooks = registerHooks({
  load(url, context, nextLoad) {
    if (/\.css(\?|$)/.test(url)) return { format: 'module', source: '', shortCircuit: true };
    // Node validates each nextLoad result before returning it to this hook. Its CommonJS
    // fast path may omit source, so provide those file bytes before calling that path.
    if (context.format === 'commonjs' && url.startsWith('file:')) {
      return { format: context.format, source: readFileSync(new URL(url)), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
after(() => cssHooks.deregister());

const ROOT = '<div id="tovu-site-assistant-root"></div>';
const settle = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

test('loader-entry binds the lazy loader to the page button; activating it loads the React widget assets', async t => {
  const { dom, restore } = installDom({ html: `<!doctype html><body>${ROOT}<button data-jini-chat-loader>Chat</button></body>` }, { url: 'https://example.test/' });
  t.after(restore);
  await import('../loader-entry');
  assert.equal(dom.window.document.querySelector('link[href="/site-chat/site-assistant.css"]'), null, 'nothing loads before activation');
  dom.window.document.querySelector('button')!.click();
  await settle();
  assert.ok(dom.window.document.querySelector('link[href="/site-chat/site-assistant.css"]'), 'activation inserts the widget stylesheet');
});

test('vanilla-entry mounts the vanilla widget into the page root', async t => {
  const { dom, restore } = installDom({ html: `<!doctype html><body>${ROOT}</body>` }, { url: 'https://example.test/' });
  t.after(restore);
  await import('../vanilla-entry');
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  assert.ok(root.children.length > 0, 'the widget rendered into the root');
});

test('main mounts the React widget and creates its own root without replaying stored actions', async t => {
  const { dom, restore } = installDom({ html: '<!doctype html><html><body></body></html>' }, { url: 'https://example.test/' });
  t.after(restore);
  const main = await import('../main');
  assert.ok(dom.window.document.getElementById('tovu-site-assistant-root'));
  assert.equal('executeDrainedAction' in main, false);
  main.mountedRoot.unmount();
});
