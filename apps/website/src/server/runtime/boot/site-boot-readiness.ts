/**
 * @file The boot-readiness list both top-level boot paths (`src/index.ts`'s `onListening` and
 * `cli/commands/serve.ts`'s `app.listen()` callback) await before spawning the agent daemon.
 * Hand-copied into each until 2026-10-04; extracted here following `agent-daemon-wanted.ts`'s
 * (`d1eea4b2f`) pattern, so a key added for one boot path can no longer be missing from the other.
 *
 * Why the list exists at all: `runBootLifecycle` does not cover these. `identityReady`/
 * `settingsReady`/etc. are fired directly by `createSiteRouteDeps()` as independent, un-awaited side
 * effects (see each field's own doc in `server/routes/types.ts`), not part of `buildBootModules`'s
 * set. `app.listen()`'s callback firing says nothing about whether they've settled — reproduced
 * directly: spawning the daemon there unconditionally raced this process's own first-boot identity
 * seed and crashed both processes on a `UNIQUE constraint failed` (two concurrent
 * `createSiteRouteDeps()` calls, one per process, both trying to seed the same row). Awaiting them
 * first, then spawning, closes that window.
 *
 * `executionSettingsReady`/`settingsUiTabsReady`/`analyticsSettingsReady` belong in this list for
 * exactly the reason the paragraph above describes, and their absence was not theoretical — it
 * shipped a real defect. `content.db` held TWO `status='active'` rows for `core.execution.mode`,
 * distinct `setting_id`s, both `version=1`, created 12ms apart, which violates the
 * one-active-row-per-slot invariant. Mechanism: the daemon was spawned while this process's
 * `ensureExecutionSettingDefinitions` was still mid-flight, so both processes ran the same
 * check-then-act (`resolveDefinitionRaw` -> absent -> register) against the same slot. Only `mode`
 * duplicated because it is the FIRST entry in `EXECUTION_DEFINITIONS` — by key 2 the loser could
 * already see the winner's rows. Awaiting all three closes the window for every boot-time settings
 * registrar, including the newer `ensureAnalyticsSettingDefinitions`.
 */

/** Every boot-time seeder the agent daemon must not race. Add a new one HERE, once. */
export const SITE_BOOT_READINESS_KEYS = [
  "identityReady",
  "settingsReady",
  "seoReady",
  "commentsReady",
  "commentsSettingsReady",
  "executionSettingsReady",
  "settingsUiTabsReady",
  "analyticsSettingsReady",
  "siteTitleReady",
] as const;

export type SiteBootReadinessDeps = { readonly [K in (typeof SITE_BOOT_READINESS_KEYS)[number]]: Promise<unknown> };

/** Resolves once every listed seeder has settled; rejects with the first rejection (Promise.all). */
export async function awaitSiteBootReadiness(required: { deps: SiteBootReadinessDeps }): Promise<void> {
  await Promise.all(SITE_BOOT_READINESS_KEYS.map((key) => required.deps[key]));
}
