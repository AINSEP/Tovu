import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import { InMemorySettingsRepo, ForbiddenError } from "../../features/settings/index.js";
import { ensureSeoSettingDefinitions, getSeoSettings, setSeoSettings } from "../settings.js";
import { SeoSettingsValidationError } from "../errors.js";

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

// --- Characterization tests below pin pre-refactor behavior of
// `validateSeoSettingsPatch`/`setSeoSettings` field-by-field. Added before
// restructuring `src/seo/settings.ts` because branch coverage on these paths
// was 0% (every `defaultDescription`/`defaultOgImage`/`defaultRobots`/
// `sitemapEnabled`/`robotsRules` validation-error branch, and the
// `defaultDescription`/`defaultOgImage`/`twitterSite` write-dispatch
// branches, were never exercised by the tests above).

function assertRejectsValidation(promise: Promise<unknown>, message: string) {
  return assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof SeoSettingsValidationError, `expected SeoSettingsValidationError, got ${String(err)}`);
    assert.equal((err as Error).message, message);
    return true;
  });
}

test("setSeoSettings: defaultDescription is validated, written, and round-trips", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { defaultDescription: "A site about testing." },
  });
  assert.equal(result.defaultDescription, "A site about testing.");

  const reread = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(reread.defaultDescription, "A site about testing.");
});

test("setSeoSettings: non-string defaultDescription is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { defaultDescription: 123 } as unknown as { defaultDescription: string },
    }),
    "defaultDescription must be a string"
  );
});

test("setSeoSettings: a 501-char defaultDescription is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { defaultDescription: "a".repeat(501) },
    }),
    "defaultDescription must be at most 500 characters"
  );
});

test("setSeoSettings: a null defaultDescription bypasses validation and reads back as undefined (the '' sentinel)", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { defaultDescription: null },
  });
  assert.equal(result.defaultDescription, undefined);
});

test("setSeoSettings: defaultOgImage is validated, written, and round-trips", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { defaultOgImage: "https://example.com/og.png" },
  });
  assert.equal(result.defaultOgImage, "https://example.com/og.png");

  const reread = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(reread.defaultOgImage, "https://example.com/og.png");
});

test("setSeoSettings: non-string defaultOgImage is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { defaultOgImage: 123 } as unknown as { defaultOgImage: string },
    }),
    "defaultOgImage must be a string"
  );
});

test("setSeoSettings: a 2049-char defaultOgImage is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { defaultOgImage: "a".repeat(2049) },
    }),
    "defaultOgImage must be at most 2048 characters"
  );
});

test("setSeoSettings: a null defaultOgImage bypasses validation and reads back as undefined", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { defaultOgImage: null },
  });
  assert.equal(result.defaultOgImage, undefined);
});

test("setSeoSettings: twitterSite is written and round-trips (no validation rule applies to it)", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { twitterSite: "@example" },
  });
  assert.equal(result.twitterSite, "@example");

  const reread = await getSeoSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(reread.twitterSite, "@example");
});

test("setSeoSettings: a null twitterSite is written as the '' sentinel and reads back as undefined", async () => {
  const deps = await seeded();
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { twitterSite: null },
  });
  assert.equal(result.twitterSite, undefined);
});

test("setSeoSettings: a defaultRobots patch missing the 'nofollow' boolean is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { defaultRobots: { noindex: true } as unknown as { noindex: boolean; nofollow: boolean } },
    }),
    "defaultRobots requires boolean noindex/nofollow"
  );
});

test("setSeoSettings: a non-boolean sitemapEnabled is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { sitemapEnabled: "yes" } as unknown as { sitemapEnabled: boolean },
    }),
    "sitemapEnabled must be a boolean"
  );
});

test("setSeoSettings: a non-array robotsRules is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { robotsRules: "not-an-array" } as unknown as { robotsRules: unknown[] },
    }),
    "robotsRules must be an array"
  );
});

test("setSeoSettings: a robots rule missing userAgent is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { robotsRules: [{}] as unknown as { userAgent: string }[] },
    }),
    "each robots rule requires a non-empty userAgent"
  );
});

test("setSeoSettings: a robots rule with a blank userAgent is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { robotsRules: [{ userAgent: "   " }] },
    }),
    "each robots rule requires a non-empty userAgent"
  );
});

test("setSeoSettings: a robots rule with a non-array 'allow' is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { robotsRules: [{ userAgent: "agent-1", allow: "not-an-array" }] as unknown as { userAgent: string; allow: string[] }[] },
    }),
    "robots rule 'allow' must be an array"
  );
});

test("setSeoSettings: a robots rule with a non-array 'disallow' is rejected", async () => {
  const deps = await seeded();
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: {
        robotsRules: [{ userAgent: "agent-1", disallow: "not-an-array" }] as unknown as {
          userAgent: string;
          disallow: string[];
        }[],
      },
    }),
    "robots rule 'disallow' must be an array"
  );
});

test("setSeoSettings: a robots rule 'allow' with 101 entries is rejected", async () => {
  const deps = await seeded();
  const allow = Array.from({ length: 101 }, (_, i) => `/path-${i}`);
  await assertRejectsValidation(
    setSeoSettings(deps, {
      workspaceId: WORKSPACE,
      callerPrincipalId: CALLER,
      patch: { robotsRules: [{ userAgent: "agent-1", allow }] },
    }),
    "robots rule 'allow' may contain at most 100 entries"
  );
});

test("setSeoSettings: a robots rule 'allow' with exactly 100 entries is accepted", async () => {
  const deps = await seeded();
  const allow = Array.from({ length: 100 }, (_, i) => `/path-${i}`);
  const result = await setSeoSettings(deps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: CALLER,
    patch: { robotsRules: [{ userAgent: "agent-1", allow }] },
  });
  assert.equal(result.robotsRules[0]?.allow?.length, 100);
});
