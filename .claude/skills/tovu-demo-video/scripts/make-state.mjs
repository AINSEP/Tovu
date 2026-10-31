// Opens fake-test-site admin headless; with TOVU_DEV_OWNER_SIGNIN=1 (repo .env) the loopback owner
// sign-in signs us in. Saves the session cookie as Playwright storage state for take.mjs.
import { chromium } from '/Users/la/Programming/tovu-integration-clones/prov2-tovu/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'https://localhost:3002';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('url', page.url());
console.log((await page.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
await context.storageState({ path: new URL('./state.json', import.meta.url).pathname });
console.log('cookies', (await context.cookies()).map((c) => c.name));
await browser.close();
