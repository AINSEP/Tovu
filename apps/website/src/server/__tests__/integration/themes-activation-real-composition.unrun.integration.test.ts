// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — theme activation and
 * revert (`routes/presentation/{get,patch-active-theme}.ts`, `routes/themes/list.ts`) through the
 * REAL site composition on both dialects, ending at the public home render.
 *
 * Every presentation route test mounts the hermetic root with an in-memory presentation repo. What
 * runs nowhere: the PATCH writing `presentation_settings` on SQLite/Postgres, the very next public
 * `GET /` reading it back and rendering the newly active theme, and a revert restoring the original.
 *
 * The public-side check is the static tier's asset marker: a static theme's pages link their assets
 * as `/theme-assets/<themeId>/...` (`features/theme/static-asset-contract.ts`), so the active theme
 * id is visible in the served HTML (same marker `development/e2e/journeys/themes.journey.ts` uses).
 *
 * Themes are seeded into `<site>/themes` by `initSite` and discovered at boot, so the target is read
 * from `GET .../presentation` rather than hard-coded. Every test ends with the original theme active.
 */

interface ThemeSummary {
  id: string;
  name: string;
  tier: string;
}

interface Presentation {
  settings: { workspaceId: string; activeThemeId: string; updatedAt: string };
  availableThemeIds: string[];
  availableThemes: ThemeSummary[];
}

async function readPresentation(site: BootedSite): Promise<Presentation> {
  return expectJson<Presentation>(await send(site, "GET", `${site.ws}/presentation`), 200);
}

async function activate(site: BootedSite, activeThemeId: string): Promise<Presentation> {
  return expectJson<Presentation>(await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId }), 200);
}

async function home(site: BootedSite): Promise<string> {
  const res = await fetch(`${site.baseUrl}/`);
  const html = await res.text();
  assert.equal(res.status, 200, html.slice(0, 400));
  return html;
}

async function activeInList(site: BootedSite): Promise<string[]> {
  const { themes } = await expectJson<{ themes: Array<{ id: string; active: boolean }> }>(await send(site, "GET", `${site.ws}/themes`), 200);
  return themes.filter((theme) => theme.active).map((theme) => theme.id);
}

/** A static theme other than the active one; static themes carry the `/theme-assets/<id>/` marker. */
function pickStaticTarget(presentation: Presentation): ThemeSummary {
  const target = presentation.availableThemes.find((theme) => theme.tier === "static" && theme.id !== presentation.settings.activeThemeId);
  assert.ok(target, `no inactive static theme among ${presentation.availableThemes.map((theme) => theme.id).join(", ")}`);
  return target;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] themes [${dialect}]: activating a theme is persisted and the public home renders it on the next request; reverting restores the original`, async (t) => {
    const site = await bootSite(t, dialect);
    const before = await readPresentation(site);
    const original = before.settings.activeThemeId;
    assert.ok(before.availableThemeIds.includes(original), `the seeded active theme '${original}' is a discovered theme`);
    t.after(async () => {
      // Safety net only: the site folder is deleted at teardown anyway, but the rule is "leave the original active".
      await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId: original }).catch(() => undefined);
    });
    const target = pickStaticTarget(before);
    const marker = `/theme-assets/${target.id}/`;
    assert.ok(!(await home(site)).includes(marker), "the target theme is not what the home renders yet");
    assert.deepEqual(await activeInList(site), [original]);

    const switched = await activate(site, target.id);
    assert.equal(switched.settings.activeThemeId, target.id);
    assert.equal(switched.settings.workspaceId, before.settings.workspaceId);
    assert.ok(!switched.availableThemeIds.includes("none"), "the response's catalogue never carries the NO_THEME_ID sentinel");
    assert.deepEqual((await readPresentation(site)).settings, switched.settings, "a read-back returns the persisted row");
    assert.deepEqual(await activeInList(site), [target.id]);
    assert.ok((await home(site)).includes(marker), "the public home renders the newly active theme");

    const profile = await expectJson<{ sections: { theme: { status: string; data: { activeThemeId: string } } } }>(
      await send(site, "GET", `${site.ws}/site/profile?sections=theme`),
      200
    );
    assert.deepEqual({ status: profile.sections.theme.status, activeThemeId: profile.sections.theme.data.activeThemeId }, { status: "ok", activeThemeId: target.id });

    const reverted = await activate(site, original);
    assert.equal(reverted.settings.activeThemeId, original);
    assert.deepEqual(await activeInList(site), [original]);
    assert.ok(!(await home(site)).includes(marker), "after the revert the home stops rendering the target theme");
    assert.equal((await readPresentation(site)).settings.activeThemeId, original, "the original theme is left active");
  });

  test(`[unrun] themes [${dialect}]: an unknown theme id and a body with no id are 400 and leave the active theme untouched`, async (t) => {
    const site = await bootSite(t, dialect);
    const before = await readPresentation(site);

    assert.deepEqual(await expectJson(await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId: "unrun-nope" }), 400), {
      error: "theme 'unrun-nope' is not supported",
    });
    assert.deepEqual(await expectJson(await send(site, "PATCH", `${site.ws}/presentation`, {}), 400), { error: "theme '' is not supported" });

    const after = await readPresentation(site);
    assert.deepEqual(after.settings, before.settings, "a refused PATCH writes nothing, not even updatedAt");
  });
}
