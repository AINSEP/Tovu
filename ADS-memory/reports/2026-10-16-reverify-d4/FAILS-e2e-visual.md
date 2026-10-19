## e2e-visual--1: FAIL (rc=1, 3s)
```
cd /Users/la/Programming/Tovu/apps/admin && npm run build && cd /Users/la/Programming/Tovu && npm run e2e:desktop
```
```
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/e2e-visual--1.log

## e2e-visual--2: FAIL (rc=1, 28s)
```
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD npx playwright test --config=development/playwright.desktop-shell.config.ts
```
```
22:    Error: expect(received).toBe(expected) // Object.is equality
24:    Expected: true
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/e2e-visual--2.log

