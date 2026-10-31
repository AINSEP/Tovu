// Higgsfield v3 take: real admin assistant chat on tovu-dev (:3000), Playwright recordVideo 1440x900.
// Media page -> fresh chat -> prompt 1 (Higgsfield image) -> new card in the grid ->
// Posts page, same chat -> prompt 2 (article with that hero) -> new row -> public article.
// No page.screenshot() while recording. Element boxes + chat-text changes go to events.json / timeline.json for the edit.
//   node take.mjs take1          DRY=1 node take.mjs dry1   (dry: one harmless question, no generation)
import { chromium } from '/Users/la/Programming/tovu-integration-clones/prov2-tovu/node_modules/playwright/index.mjs';
import fs from 'fs';

const DIR = new URL('.', import.meta.url).pathname;
const TAKE = process.argv[2] || 'take1';
const VID = `${DIR}${TAKE}`;
const BASE = 'https://localhost:3000';
const DRY = !!process.env.DRY;
const P1 = DRY ? 'Which Higgsfield tools can you use here? Just list their names. Do not generate anything.'
  : 'Use Higgsfield to generate an image of an AI working at a desk like a human, with a cup of coffee.';
const P2 = 'Write and publish an article about how AI is changing work, using that new image as the hero.';

fs.mkdirSync(VID, { recursive: true });
const events = [];
const timeline = [];
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
const mark = (name, extra = {}) => { events.push({ t: now(), name, ...extra }); console.log(`t=${now().toFixed(1)}`, name, Object.keys(extra).length ? JSON.stringify(extra) : ''); };
const save = () => { fs.writeFileSync(`${VID}/events.json`, JSON.stringify(events, null, 2)); fs.writeFileSync(`${VID}/timeline.json`, JSON.stringify(timeline, null, 1)); };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, storageState: `${DIR}state.json`,
  recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
t0 = Date.now();
const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
const glideScroll = async (to, ms) => page.evaluate(async ({ to, ms }) => {
  const from = window.scrollY, steps = Math.max(1, Math.round(ms / 40));
  for (let i = 1; i <= steps; i++) { const q = i / steps; window.scrollTo(0, from + (to - from) * q * q * (3 - 2 * q)); await new Promise((r) => setTimeout(r, 40)); }
}, { to, ms });
const composer = page.locator('textarea.jini-composer-input');
const pane = page.locator('section.jini-chat-pane');
const firstCardName = () => page.locator('main .media-card').first().innerText().then((s) => s.split('\n').join('')).catch(() => '');
const firstRow = () => page.locator('main table tbody tr').first().innerText().then((s) => s.replace(/\s+/g, ' ')).catch(() => '');
const dismissBanner = async () => {
  const b = page.getByRole('button', { name: /dismiss/i }).first();
  if (await b.isVisible().catch(() => false)) { await b.click(); mark('dismissed-banner'); }
};

// Answer the public cookie banner first (cut).
await page.goto(`${BASE}/`, { waitUntil: 'load' });
const reject = page.getByRole('button', { name: 'Reject non-essential' });
await reject.waitFor({ timeout: 8000 }).then(() => reject.click()).then(() => mark('cookies-rejected')).catch(() => mark('no-cookie-banner'));

await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/media`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('main .media-card').first().waitFor({ timeout: 90000 });
await dismissBanner();
const opener = page.getByRole('button', { name: /Open assistant|Open AI chat/i }).first();
if (await opener.count()) await opener.click();
await composer.waitFor();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Chats' }).click();
await page.getByRole('button', { name: /^\+?\s*New$/ }).click();
await page.waitForTimeout(800);
// Runtime + model for this take (restored by hand afterwards).
await page.getByRole('button', { name: 'Choose AI runtime' }).click();
await page.getByText('Claude Code', { exact: true }).first().click();
await page.waitForTimeout(1500);
const modelBtn = page.getByRole('button', { name: /^Model:/ });
await modelBtn.click();
await page.getByRole('menuitemradio', { name: /Sonnet 5\.5/ }).first().click();
await page.waitForTimeout(800);
mark('runtime', { model: await modelBtn.getAttribute('aria-label').catch(() => '') });
// Tool calls: Show (owner setting, restored afterwards).
const settingsBtn = page.locator('aside.admin-chat-dock').getByRole('button', { name: 'Settings', exact: true });
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await settingsBtn.click(); await page.waitForTimeout(1200);
const toolCalls = (want) => page.evaluate((want) => {
  const ins = [...document.querySelectorAll('aside.admin-chat-dock input[type=radio]')].filter((i) => /tool-calls$/.test(i.name));
  const before = ins.find((i) => i.checked)?.parentElement.innerText.trim();
  const vis = ins.map((i) => { const r = i.parentElement.getBoundingClientRect(); return `${i.parentElement.innerText.trim()}:${Math.round(r.width)}x${Math.round(r.height)}`; });
  const t = want && ins.find((i) => i.parentElement.innerText.trim() === want);
  if (t) t.parentElement.click();
  return { before, vis, n: ins.length };
}, want);
mark('tool-calls-before', await toolCalls('Show'));
await page.waitForTimeout(800);
mark('tool-calls-after', await toolCalls(null));
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.mouse.move(700, 450);
await page.waitForTimeout(1500);
const card0 = await firstCardName();
mark('clean', { card0, composer: await box(composer), pane: await box(pane), card: await box(page.locator('main .media-card').first()) });

async function ask(prompt, tag, changed) {
  await page.mouse.move(1180, 800, { steps: 20 });
  await composer.click();
  await page.waitForTimeout(400);
  mark(`${tag}-typing-start`, { composer: await box(composer) });
  await composer.pressSequentially(prompt, { delay: 35 });
  mark(`${tag}-typing-end`, { composer: await box(composer) });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Send' }).click();
  mark(`${tag}-sent`);
  await page.mouse.move(700, 450, { steps: 15 });
  let last = '', stable = 0, live = false;
  const start = Date.now();
  for (;;) {
    await page.waitForTimeout(1000);
    const text = await pane.innerText().catch(() => '');
    const i = text.lastIndexOf(prompt.slice(0, 30));
    const tail = i >= 0 ? text.slice(i) : text.slice(-1500);
    if (text !== last) {
      const rows = await page.locator('section.jini-chat-pane [class*=tool]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().slice(0, 40), y: Math.round(r.y), h: Math.round(r.height), t: e.innerText.slice(0, 60) }; }).filter((r) => r.h > 0 && r.h < 80).slice(-12)).catch(() => []);
      timeline.push({ t: now(), tag, tail: tail.slice(-400), rows });
    }
    if (!live && changed && (await changed())) { live = true; mark(`${tag}-live-update`); }
    stable = text === last ? stable + 1 : 0;
    last = text;
    const secs = (Date.now() - start) / 1000;
    if (/Waiting for your answer/.test(tail) && stable >= 2) {
      const ok = page.getByRole('button', { name: 'Confirm', exact: true }).last();
      if (await ok.count()) { mark(`${tag}-confirm`); await ok.click(); stable = 0; continue; }
    }
    if (secs > 10 && /Done ·/.test(tail) && stable >= 2) break;
    if (secs > 600) { mark(`${tag}-TIMEOUT`); break; }
    if (Math.round(secs) % 30 === 0) save();
  }
  mark(`${tag}-done`, { pane: await box(pane) });
  fs.writeFileSync(`${VID}/${tag}-chat.txt`, last);
  // Give a live refresh a moment after Done.
  for (let k = 0; k < 4 && !live && changed; k++) { await page.waitForTimeout(1000); if (await changed()) { live = true; mark(`${tag}-live-update`); } }
  return live;
}

// Prompt 1 on Media.
const live1 = await ask(P1, 'p1', async () => (await firstCardName()) !== card0);
await page.waitForTimeout(1500);
if (!DRY) {
  if (!live1) {
    mark('p1-reload');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('main .media-card').first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => { const i = document.querySelector('main .media-card img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 }).catch(() => mark('card-img-not-loaded'));
  mark('p1-card', { name: await firstCardName(), card: await box(page.locator('main .media-card').first()), pane: await box(pane) });
  await page.waitForTimeout(4000);
  mark('p1-card-hold-end');
}
save();

// Sidebar -> Posts (same chat stays open).
await page.mouse.move(60, 280, { steps: 25 });
await page.getByRole('link', { name: 'Posts', exact: true }).first().click();
await page.locator('main table tbody tr').first().waitFor({ timeout: 90000 });
await page.waitForTimeout(1500);
const row0 = await firstRow();
mark('posts-loaded', { row0, row: await box(page.locator('main table tbody tr').first()), composer: await box(composer) });
if (DRY) { save(); await context.close(); await browser.close(); process.exit(0); }

const live2 = await ask(P2, 'p2', async () => (await firstRow()) !== row0);
await page.waitForTimeout(1500);
if (!live2) {
  mark('p2-reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('main table tbody tr').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
}
const row = await firstRow();
mark('p2-row', { rowText: row, row: await box(page.locator('main table tbody tr').first()), pane: await box(pane) });
await page.waitForTimeout(4000);
mark('p2-row-hold-end');
save();

const rows = await page.locator('main table tbody tr').allInnerTexts();
const pub = rows.find((r) => /published/.test(r)) || row;
const slug = (pub.match(/\/[a-z0-9-]+/) || [])[0];
mark('slug', { slug });
await page.goto(`${BASE}${slug}`, { waitUntil: 'load' });
await page.mouse.move(1420, 880);
await page.waitForFunction(() => { const i = document.querySelector('.post-featured img, article img, main img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 }).catch(() => mark('no-hero-img'));
mark('article-loaded', { hero: await box(page.locator('.post-featured img, article img, main img').first()), h1: await box(page.locator('h1').first()) });
await page.waitForTimeout(4000);
mark('scroll');
await glideScroll(560, 4000);
mark('scrolled');
await page.waitForTimeout(3500);
mark('end');
save();
await context.close();
await browser.close();
for (const f of fs.readdirSync(VID)) if (f.endsWith('.webm') && !f.endsWith('-raw.webm')) fs.renameSync(`${VID}/${f}`, `${VID}/${TAKE}-raw.webm`);
console.log('video files', fs.readdirSync(VID).filter((f) => f.endsWith('.webm')));
