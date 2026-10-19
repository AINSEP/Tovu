## desktop--1: FAIL (rc=1, 1773s)
```
cd /Users/la/Programming/Tovu/apps/admin && npx vite build && cd /Users/la/Programming/Tovu && npm run e2e:desktop
```
```
136:    Error: expect(received).toBe(expected) // Object.is equality
138:    Expected: 0.5
142:    - Timeout 15000ms exceeded while waiting on the predicate
167:    Error: expect(locator).toHaveText(expected) failed
170:    Expected: "Running"
172:    Timeout:  150000ms
177:        124 × locator resolved to <span class="state" title="Starting.">…</span>
178:            - unexpected value "Starting"
179:        175 × locator resolved to <span class="state" title="Stopped.">…</span>
180:            - unexpected value "Stopped"
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--1.log

## desktop--2: FAIL (rc=1, 539s)
```
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD npx playwright test --config=development/playwright.desktop-shell.config.ts
```
```
30:    TimeoutError: page.waitForLoadState: Timeout 30000ms exceeded.
41:    Error: ENOTEMPTY, Directory not empty: /var/folders/7_/7kj6s9m95qg_fg8klr38hg_w0000gn/T/tovu-desktop-e2e-sites-OFyXPk '/var/folders/7_/7kj6s9m95qg_fg8klr38hg_w0000gn/T/tovu-desktop-e2e-sites-OFyXPk'
58:    TimeoutError: locator.click: Timeout 30000ms exceeded.
78:    TimeoutError: locator.click: Timeout 30000ms exceeded.
104:      113 |     test.setTimeout(150_000);
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--2.log

## desktop--3: FAIL (rc=1, 27s)
```
cd /Users/la/Programming/Tovu && npm run e2e:desktop -- site-lifecycle.desktop.ts settings.desktop.ts
```
```
49:Error: desktop journeys: /Users/la/Programming/Tovu/apps/admin/dist/index.html is older than the newest file in /Users/la/Programming/Tovu/apps/admin/src. Run `npm run build` in apps/admin first; the site tab's guest admin is served from that build.
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--3.log

## desktop--4: FAIL (rc=1, 35s)
```
cd /Users/la/Programming/Tovu && npm run e2e:desktop -- site-lifecycle.desktop.ts settings.desktop.ts
```
```
49:Error: desktop journeys: /Users/la/Programming/Tovu/apps/admin/dist/index.html is older than the newest file in /Users/la/Programming/Tovu/apps/admin/src. Run `npm run build` in apps/admin first; the site tab's guest admin is served from that build.
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--4.log

## desktop--5: FAIL (rc=1, 1627s)
```
cd /Users/la/Programming/Tovu/apps/admin && npx vite build && cd /Users/la/Programming/Tovu && npm run e2e:desktop -- site-lifecycle.desktop.ts settings.desktop.ts
```
```
112:    Error: a Start that comes back running opens the site
114:    expect(locator).toHaveAttribute(expected) failed
117:    Expected: "true"
118:    Timeout: 150000ms
119:    Error: element(s) not found
152:    Error: a Start that comes back running opens the site
154:    expect(locator).toHaveAttribute(expected) failed
157:    Expected: "true"
158:    Timeout: 150000ms
159:    Error: element(s) not found
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--5.log

## desktop--6: FAIL (rc=1, 1272s)
```
cd /Users/la/Programming/Tovu/apps/admin && npx vite build && cd /Users/la/Programming/Tovu && npm run e2e:desktop -- site-lifecycle.desktop.ts settings.desktop.ts
```
```
112:    Error: a Start that comes back running opens the site
114:    expect(locator).toHaveAttribute(expected) failed
117:    Expected: "true"
118:    Timeout: 150000ms
119:    Error: element(s) not found
152:    Error: a Start that comes back running opens the site
154:    expect(locator).toHaveAttribute(expected) failed
157:    Expected: "true"
158:    Timeout: 150000ms
159:    Error: element(s) not found
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/desktop--6.log

