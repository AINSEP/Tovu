import { test as base, expect, type Page } from "@playwright/test";
import type { IsolatedJourneySite } from "./support/isolated-journey-site.js";

/**
 * Selected and active accents in the admin resolve to the brand `--primary` in the REAL cascade:
 * the admin's stylesheets plus the @jini-ai/ui stylesheets the Settings route injects at runtime.
 *
 * Why computed styles: the 2026-10-06 regression ("black outline rather than the orange outline it
 * used to have") came from an upstream token remap. Jini's 2026-10-03 extraction moved every
 * `--jini-accent*` token onto `--jini-primary`, which falls back to #363636 unless the host sets
 * `--jini-theme-*-primary`. No admin CSS line changed, so a stylesheet-text test
 * (`apps/admin/src/__tests__/unit/selection-ring-css.unit.test.ts`) could not have caught it.
 * Here every colour is read from the browser and compared with `--primary` resolved on the same
 * element at runtime, never with a hard-coded value.
 *
 * Probes: the selected CLI card and the active provider chip depend on which CLIs this machine
 * has and on the stored execution mode. When the real element is not on screen, the test renders
 * a same-class probe inside the Settings panel. A probe goes through the same cascade (Jini's
 * injected rules, the admin's overrides, the inherited tokens), which is exactly what regressed.
 */
const test = base.extend<{ settingsPage: Page }>({
  settingsPage: async ({ page, baseURL }, use, testInfo) => {
    const site = testInfo.config.metadata.isolatedJourneySite as IsolatedJourneySite | undefined;
    if (!site || baseURL !== site.adminURL) {
      throw new Error("Use playwright.admin-selection-colors.config.ts: these tests require its isolated site");
    }
    await use(page);
  },
});

test.skip(process.env.TOVU_E2E_SELECTION_COLORS !== "1", "Opt in with TOVU_E2E_SELECTION_COLORS=1; never use an external admin site");

interface Swatch { label: string; actual: string; primary: string }

/**
 * Reads `property` from the element matched by `selector` (or a probe of `probeClass` inside
 * `probeParent` when no such element is rendered), next to `--primary` resolved on that element.
 */
async function swatch(
  page: Page,
  { label, selector, property, pseudo }: { label: string; selector: string; property: string; pseudo?: string },
  { probeClass, probeParent, probeTag = "button" }: { probeClass?: string; probeParent?: string; probeTag?: string } = {},
): Promise<Swatch> {
  return page.evaluate(({ label, selector, property, pseudo, probeClass, probeParent, probeTag }) => {
    let element = document.querySelector<HTMLElement>(selector);
    let probe: HTMLElement | null = null;
    if (!element && probeClass && probeParent) {
      const parent = document.querySelector(probeParent);
      if (!parent) throw new Error(`${label}: no ${selector} and no ${probeParent} to probe in`);
      probe = document.createElement(probeTag);
      probe.className = probeClass;
      probe.textContent = "probe";
      parent.appendChild(probe);
      element = probe;
    }
    if (!element) throw new Error(`${label}: ${selector} is not rendered`);
    // `--primary` serialized the way computed colours are (oklch(0.55 ...), not the authored
    // oklch(55% ...)), by painting it on a throwaway child of the same element.
    const reference = document.createElement("span");
    reference.style.color = "var(--primary)";
    element.appendChild(reference);
    const primary = getComputedStyle(reference).color;
    reference.remove();
    const actual = getComputedStyle(element, pseudo ?? null).getPropertyValue(property);
    probe?.remove();
    return { label, actual, primary };
  }, { label, selector, property, pseudo, probeClass, probeParent, probeTag });
}

function expectPrimary(result: Swatch): void {
  expect(result.primary, `${result.label}: --primary did not resolve`).toMatch(/^oklch\(|^rgb/);
  expect(result.actual, result.label).toBe(result.primary);
}

async function openSettings(page: Page, tab: string): Promise<void> {
  await page.goto(`/admin/settings?tab=${tab}`);
  await expect(page.locator(".settings-ui-section .jini-tabbed-dialog-nav-item.active")).toBeVisible();
}

const SETTINGS = ".settings-ui-section";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("Settings: active tab text and underline, selected CLI card border, provider chip fill", async ({ settingsPage: page }) => {
      await openSettings(page, "execution");
      const tab = ".settings-ui-section .jini-tabbed-dialog-nav-item.active";
      expectPrimary(await swatch(page, { label: "active Settings tab text", selector: tab, property: "color" }));
      expectPrimary(await swatch(page, { label: "active Settings tab underline", selector: tab, property: "border-bottom-color" }));
      // The CLI grid renders after detection; wait for it so a real selected card is preferred.
      await expect(page.locator(".jini-agent-card").first()).toBeVisible({ timeout: 60_000 });
      expectPrimary(await swatch(
        page,
        { label: "selected CLI card border", selector: ".jini-agent-card.is-selected", property: "border-top-color" },
        { probeClass: "jini-agent-card is-selected", probeParent: SETTINGS, probeTag: "div" },
      ));
      expectPrimary(await swatch(
        page,
        { label: "active provider chip fill", selector: ".jini-provider-chip.active", property: "background-color" },
        { probeClass: "jini-provider-chip active", probeParent: SETTINGS },
      ));
    });

    test("Settings: primary button and privacy consent button fills", async ({ settingsPage: page }) => {
      await openSettings(page, "privacy");
      // A fresh site has made no consent decision, so the two consent buttons are rendered.
      await expect(page.locator(".jini-privacy-consent-action--primary")).toBeVisible();
      expectPrimary(await swatch(page, {
        label: "privacy consent primary fill", selector: ".jini-privacy-consent-action--primary", property: "background-color",
      }));
      expectPrimary(await swatch(
        page,
        { label: "Jini primary button fill", selector: `${SETTINGS} .jini-button-primary`, property: "background-color" },
        { probeClass: "jini-button jini-button-primary", probeParent: SETTINGS },
      ));
    });

    test("admin tab bar: active tab underline and text", async ({ settingsPage: page }) => {
      await page.goto("/admin/plugins");
      const active = '.tab-bar-item[aria-selected="true"]';
      await expect(page.locator(active).first()).toBeVisible();
      expectPrimary(await swatch(page, { label: "admin tab bar underline", selector: active, property: "border-bottom-color" }));
      expectPrimary(await swatch(page, { label: "admin tab bar text", selector: active, property: "color" }));
    });
  });
}
