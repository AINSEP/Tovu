import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "../../identity/repo.memory";
import { InMemorySettingsRepo } from "../../features/settings/repo.memory";
import { ForbiddenError } from "../../features/settings/errors";
import { ensureSeoSettingDefinitions, getSeoSettings, setSeoSettings } from "../settings";
import { SeoSettingsValidationError } from "../errors";

/**
 * @file T019 — failing-first unit certification of `getSeoSettings`/
 * `setSeoSettings` (ADR-PIPE-008 Decision §3, C-005/C-006): `titleTemplate`
 * must contain `%s`, `robotsRules.length <= 50`, all-or-nothing validation,
 * `defaultRobots` decompose/recompose, no `baseUrl` field anywhere,
 * unauthorized write -> FORBIDDEN with zero writes.
 */

const WORKSPACE = "workspace-1";
const SYSTEM_PRINCIPAL = "system-seo";
const CALLER = "caller-1";

const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `seo-setting-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
const alwaysDeny = async () => ({ allowed: false, reason: "no_grant" });

function makeDeps(authorize = alwaysAllow) {
  return {
    settingsRepo: new InMemorySettingsRepo(),
    clock,
    ids,
    authorize,
    principals: new InMemoryPrincipalRepo([]),
  };
}

async function seeded(authorize = alwaysAllow) {
  const deps = makeDeps(authorize);
  await ensureSeoSettingDefinitions(deps, { workspaceId: WORKSPACE, systemPrincipalId: SYSTEM_PRINCIPAL });
  return deps;
}

test("getSeoSettings: resolves schema defaults with zero writes (behavior.spec.md §3)", async () => {
  const deps = await seeded();
  const settings = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });

  assert.equal(settings.titleTemplate, "%s");
  assert.deepEqual(settings.defaultRobots, { noindex: false, nofollow: false });
  assert.equal(settings.sitemapEnabled, true);
  assert.deepEqual(settings.robotsRules, []);
  assert.equal(settings.defaultDescription, undefined);
  assert.equal((settings as unknown as { baseUrl?: unknown }).baseUrl, undefined);
});

test("setSeoSettings: PUT valid settings, GET round-trips them (AC-24)", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { titleTemplate: "%s — My Site", sitemapEnabled: false },
  });

  assert.equal(result.titleTemplate, "%s — My Site");
  assert.equal(result.sitemapEnabled, false);

  const reread = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(reread.titleTemplate, "%s — My Site");
  assert.equal(reread.sitemapEnabled, false);
});

test("setSeoSettings: titleTemplate without %s is rejected, zero settings changed (AC-25)", async () => {
  const deps = await seeded();

  await assert.rejects(
    () =>
      setSeoSettings(deps, {
        workspaceId: WORKSPACE,
        callerPrincipalId: CALLER,
        patch: { titleTemplate: "no placeholder here", sitemapEnabled: false },
      }),
    SeoSettingsValidationError
  );

  const after = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(after.titleTemplate, "%s");
  assert.equal(after.sitemapEnabled, true, "sitemapEnabled must be untouched — all-or-nothing (INV-06)");
});

test("setSeoSettings: titleTemplate containing %s twice is accepted", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { titleTemplate: "%s | %s" },
  });
  assert.equal(result.titleTemplate, "%s | %s");
});

test("setSeoSettings: a 500-char titleTemplate (containing %s) is accepted", async () => {
  const deps = await seeded();
  const titleTemplate = "%s" + "a".repeat(498);
  assert.equal(titleTemplate.length, 500);

  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { titleTemplate },
  });
  assert.equal(result.titleTemplate, titleTemplate);
});

test("setSeoSettings: a 501-char titleTemplate is rejected", async () => {
  const deps = await seeded();
  const titleTemplate = "%s" + "a".repeat(499);
  assert.equal(titleTemplate.length, 501);

  await assert.rejects(
    () => setSeoSettings(deps, { workspaceId: WORKSPACE, callerPrincipalId: CALLER, patch: { titleTemplate } }),
    SeoSettingsValidationError
  );
});

test("setSeoSettings: robotsRules with exactly 50 entries is accepted", async () => {
  const deps = await seeded();
  const robotsRules = Array.from({ length: 50 }, (_, i) => ({ userAgent: `agent-${i}` }));

  const result = await setSeoSettings(deps, { workspaceId: WORKSPACE, callerPrincipalId: CALLER, patch: { robotsRules } });
  assert.equal(result.robotsRules.length, 50);
});

test("setSeoSettings: robotsRules with 51 entries is rejected, zero settings changed", async () => {
  const deps = await seeded();
  const robotsRules = Array.from({ length: 51 }, (_, i) => ({ userAgent: `agent-${i}` }));

  await assert.rejects(
    () =>
      setSeoSettings(deps, {
        workspaceId: WORKSPACE,
        callerPrincipalId: CALLER,
        patch: { robotsRules, sitemapEnabled: false },
      }),
    SeoSettingsValidationError
  );

  const after = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.deepEqual(after.robotsRules, []);
  assert.equal(after.sitemapEnabled, true);
});

test("setSeoSettings: defaultRobots decomposes into 2 booleans and recomposes on read", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { defaultRobots: { noindex: true, nofollow: true } },
  });

  assert.deepEqual(result.defaultRobots, { noindex: true, nofollow: true });

  const reread = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.deepEqual(reread.defaultRobots, { noindex: true, nofollow: true });
});

test("setSeoSettings: no baseUrl/seo.base_url-shaped field exists anywhere in SeoSettings (INV-07)", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { sitemapEnabled: true },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result, "baseUrl"), false);
});

test("setSeoSettings: unauthorized write is rejected FORBIDDEN with zero writes", async () => {
  const deps = await seeded(alwaysDeny);

  await assert.rejects(
    () =>
      setSeoSettings(deps, {
        workspaceId: WORKSPACE,
        callerPrincipalId: CALLER,
        patch: { sitemapEnabled: false },
      }),
    ForbiddenError
  );

  const after = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(after.sitemapEnabled, true);
});
