/** Authored for SPEC-046 v3; coordinator runs this after rebuilding Jini and both widget bundles.
 * Real shipped widgets + theme scripts; only provider/HTTP transport is replaced by a local fixture.
 */
import { test, expect, type Page } from '@playwright/test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { publishVisitorPage } from '../../../apps/website/src/features/theme/visitor-publication.js';

const repo = path.resolve(import.meta.dirname, '../../..');
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const chatFrame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function fixture(theme: string, widget: 'react' | 'vanilla') {
  const base = path.join(repo, 'content/themes/static', theme);
  let nav = readFileSync(path.join(base, 'render/partials/nav.html'), 'utf8');
  nav = nav.replace(/(<nav class="main-nav"[^>]*>)[\s\S]*?<\/nav>/,
    '$1<ul><li class="menu-item has-children"><a href="/next" data-toolname="fixture_docs" data-tooldescription="Docs" data-tool-action="navigate">Docs</a><ul><li><a href="/next" data-toolname="fixture_child" data-tooldescription="Child" data-tool-action="navigate">Child</a></li></ul></li></ul></nav>');
  const markup = publishVisitorPage({ path: '/fixture', html: `<!doctype html><html><head><style>${readFileSync(path.join(base, 'css/theme.css'), 'utf8')}</style></head><body>${nav}
    <main data-visitor-scope data-toolname="fixture_content" data-tooldescription="Public content" data-tool-action="read">
      <details><summary data-toolname="fixture_faq" data-tooldescription="Question" data-tool-action="accordion">Question</summary><p>Public answer</p></details>
      <form action="/contact"><label>Message<input name="message" data-toolname="fixture_field" data-tooldescription="Message" data-tool-action="fill"></label>
      <button type="submit" data-toolname="fixture_submit" data-tooldescription="Send" data-tool-action="submit">Send</button></form>
      <span hidden>HIDDEN_SENTINEL</span><span data-agent-private>PRIVATE_SENTINEL</span>
    </main><div id="tovu-site-assistant-root" data-chat-open="true"></div>
    <script>${readFileSync(path.join(base, 'scripts/main.js'), 'utf8')}</script>
    <link rel="stylesheet" href="/site-chat/site-assistant${widget === 'vanilla' ? '-vanilla' : ''}.css">
    <script defer src="/site-chat/site-assistant${widget === 'vanilla' ? '-vanilla' : ''}.js"></script></body></html>` });
  const publication = JSON.parse(markup.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!);
  const handles = Object.fromEntries(publication.elements.filter((entry: { handle: string }) => !/-(?:mobile|submenu)$/.test(entry.handle)).map((entry: { handle: string; label: string }) => [entry.label, entry.handle]));
  let frontend: ServerResponse | undefined;
  let chat: ServerResponse | undefined;
  let sequence = 0;
  let queued: Array<{ capabilityId: string; input: Record<string, unknown> }> = [];
  let outcome: unknown;
  const tabs: string[] = [];
  const next = () => {
    const command = queued.shift();
    if (command) { sequence += 1; frontend!.write(frame({ type: 'invocation', invocationId: `i${sequence}`, ...command,
      input: { ...command.input, __visitorPage: { revision: publication.revision, approved: true, pages: [{ id: 'next', label: 'Next', path: '/next' }], ...(command.capabilityId === 'page.navigate' ? { path: '/next' } : {}) } } })); }
    else { chat!.end(chatFrame('text', { delta: 'Done.' }) + chatFrame('end', { reason: navigation ? 'navigation' : 'stop' })); }
  };
  let navigation = false;
  function startTurn(input: { message: string }, res: ServerResponse) {
    chat = res; res.writeHead(200, { 'content-type': 'text/event-stream' });
    navigation = input.message === 'navigate';
    const call = (capabilityId: string, args: Record<string, unknown>) => ({ capabilityId, input: args });
    const commands: Record<string, typeof queued> = {
      menu: [call('page.click', { handle: handles['Open menu'] }), call('page.click', { handle: `${handles.Docs}-submenu` })],
      faq: [call('page.click', { handle: handles.Question })],
      read: [call('page.find_elements', { withState: true })],
      submit: [call('page.click', { handle: handles.Send })],
      fill: [call('page.fill', { handle: handles.Message, text: 'Approved message' })],
      navigate: [call('page.navigate', { page: 'next' })],
    };
    queued = commands[input.message] ?? [];
    if (['fill', 'submit'].includes(input.message)) res.write(chatFrame('client_directive', { kind: 'tool_confirmation', challengeId: 'a'.repeat(22), title: 'Allow filling?', summary: 'Fill the reviewed field.' }));
    else next();
  }
  async function handlePost(req: IncomingMessage, res: ServerResponse, pathname: string) {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    if (pathname.endsWith('/responses')) {
      outcome = input.output; if (input.output?.terminalSubmission) navigation = true;
      res.setHeader('content-type', 'application/json'); res.end('{"settled":true}'); next(); return;
    }
    if (pathname.endsWith('/confirm')) {
      res.end('{}'); if (!input.allow) queued = []; next(); return;
    }
    if (pathname.endsWith('/chat')) startTurn(input, res);
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    if (url.pathname.startsWith('/site-chat/')) {
      const name = path.basename(url.pathname); res.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'application/javascript');
      res.end(readFileSync(path.join(repo, 'apps/site-chat/dist', name))); return;
    }
    if (url.pathname.endsWith('/credentials')) {
      sequence += 1; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ tabCredential: `tab${sequence}` })); return;
    }
    if (url.pathname.endsWith('/stream')) {
      frontend = res; tabs.push(String(req.headers['x-frontend-tab']));
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(frame({ type: 'attached', sessionId: 'session', bindToken: 'token' })); return;
    }
    if (req.method === 'POST') { await handlePost(req, res, url.pathname); return; }
    res.setHeader('content-type', 'text/html'); res.end(markup);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, handles, tabs, outcome: () => outcome,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function send(page: Page, widget: string, text: string) {
  await page.locator(widget === 'react' ? '.jini-composer-input' : '.jini-chat-vanilla__input').fill(text);
  await page.locator(widget === 'react' ? '.jini-composer-send' : '.jini-chat-vanilla__send').click();
}
for (const theme of ['tovu-starter', 'tovu-theme']) for (const widget of ['react', 'vanilla'] as const) {
  test(`${theme}/${widget}: mobile submenu, FAQ, private text, confirmation, terminal navigation and no tool UI`, async ({ page }) => {
    const site = await fixture(theme, widget);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${site.origin}/fixture`);
      await send(page, widget, 'menu');
      await expect(page.locator('dialog.mnav')).toBeVisible();
      await expect(page.locator('.mnav-disclose')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('[data-mnav-close]').click();
      await send(page, widget, 'faq');
      await expect(page.locator('main details')).toHaveAttribute('open', '');
      await send(page, widget, 'read');
      await expect.poll(() => JSON.stringify(site.outcome())).toContain('Public answer');
      expect(JSON.stringify(site.outcome())).not.toMatch(/HIDDEN_SENTINEL|PRIVATE_SENTINEL/);
      await send(page, widget, 'fill');
      const panel = page.locator(widget === 'react' ? '.tovu-site-assistant__panel' : '.jini-chat-vanilla__panel');
      await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
      await expect(page.locator('input[name=message]')).toHaveValue('');
      await panel.getByRole('button', { name: 'Allow', exact: true }).click();
      await expect(page.locator('input[name=message]')).toHaveValue('Approved message');
      expect(await panel.textContent()).not.toMatch(/page\.(?:click|fill)|__visitorPage|visitor-h-/);
      await send(page, widget, 'submit');
      await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page).toHaveURL(`${site.origin}/fixture`);
      await send(page, widget, 'submit');
      await panel.getByRole('button', { name: 'Allow', exact: true }).click();
      await expect(page).toHaveURL(/\/contact\?message=Approved[+%20]+message/);
      await send(page, widget, 'navigate');
      await expect(page).toHaveURL(`${site.origin}/next`);
      const persisted = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tovu.site-assistant.transcript.v1')!));
      expect(persisted.messages.at(-1).content).toBe('Done.');
      await page.reload();
      await expect(page).toHaveURL(`${site.origin}/next`);
      await send(page, widget, 'read');
      await expect.poll(() => site.tabs.length).toBeGreaterThan(1);
      expect(new Set(site.tabs).size).toBe(site.tabs.length);
    } finally { await site.close(); }
  });
}
