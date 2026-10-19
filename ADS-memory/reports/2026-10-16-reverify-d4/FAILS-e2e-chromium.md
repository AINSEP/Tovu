## e2e-chromium--5: FAIL (rc=143, 453s)
```
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD npx playwright test --config=development/playwright.journeys.config.ts --workers=1 --project=chromium byok.pins.journey.ts agent-page.pins.journey.ts assistant.journey.ts
```
```
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/e2e-chromium--5.log

## e2e-chromium--7: FAIL (rc=1, 256s)
```
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD npx playwright test --config=development/playwright.journeys.config.ts --workers=1 --project=chromium --grep "provider split|published page at phone width|cannot navigate window.top|phone-width baselines" deployment.pins.journey.ts pages.journey.ts settings-locale.journey.ts
```
```
30:    Error: expect(page).toHaveScreenshot(expected) failed
63:    Expected: development/e2e/journeys/settings-locale.journey.ts-snapshots/phone-post-editor-chromium-darwin.png
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/e2e-chromium--7.log

