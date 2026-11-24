/**
 * @file Bundled plugin publisher-ID upgrade (r62t-rsy-7 "Installed plugin ID upgrade", owner decision:
 * a Tovu-owned maintenance step with verified bundled replacements).
 *
 * `@jini-ai/agent-plugins` 0.7.3 renamed 25 bundled packages from `tovu/<id>` to `jini/<id>`. The
 * local name (`cloudflare`) did not change, so Jini's install admission sees a different publisher
 * in the same slot and refuses the canonical package (`PLUGIN_ID_CONFLICT`). Without this step every
 * existing site keeps its pre-rename copy forever and logs one seed failure per plugin per boot.
 *
 * The step runs just before seeding. For each renamed local id it moves the installed pre-rename
 * revision out of the live package root, but only when that revision is PROVABLY the one a Tovu
 * build shipped:
 * 1. its manifest declares exactly the pre-rename id (`tovu/<id>`), not some other publisher;
 * 2. its digest is the one the bundled-digest ledger recorded, i.e. a Tovu build's own seed put it
 *    there (an upload or a different build's copy is not in the ledger);
 * 3. re-packing its files reproduces that digest, so nobody edited it after install;
 * 4. this build's bundled source really ships the canonical id, so seeding has a replacement.
 * Anything else is left exactly where it is and reported in plain words; the site keeps using it.
 *
 * Only the package bytes move. Activation is keyed by the short name and the plugin's `data/` and
 * `memory/` folders sit beside `package/`, so the owner's switch, settings, data and memory stay.
 * The moved copy is kept under `<workspace>/.bundled-id-upgrade/<id>/<digest>` (dot-prefixed, so the
 * package index never reads it as a plugin) and is put back when the replacement does not seed.
 */
import { RENAMED_TO_JINI } from "../plugins/renamed-bundled-plugin-ids.js";
import { upgradeRenamedBundledPlugins, type BundledIdUpgradeOutcome, type BundledIdUpgradePort, type BundledPluginRenames } from "@jini-ai/agent-plugins/site/bundled-id-upgrade";

/** Local id -> the pre-rename and canonical publisher-qualified ids. The exact map stays in Tovu. */
export const RENAMED_BUNDLED_PLUGIN_IDS: BundledPluginRenames =
  new Map(RENAMED_TO_JINI.map(id => [id, { from: `tovu/${id}`, to: `jini/${id}` }]));

/** Held-reason wording for a copy the bundled-digest ledger does not name (not one Tovu's own build installed). */
const LEDGER_MISMATCH_REASON = "its installed copy is not the one Tovu installed from its own build";

/** Runs Jini's publisher-ID upgrade with Tovu's rename map and wording. @complexity as `upgradeRenamedBundledPlugins`. */
export function upgradeTovuRenamedBundledPlugins(
  required: { readonly workspaceRoot: string; readonly port: BundledIdUpgradePort },
  _optional: Record<string, never> = {},
): Promise<BundledIdUpgradeOutcome[]> {
  return upgradeRenamedBundledPlugins({ ...required, renamed: RENAMED_BUNDLED_PLUGIN_IDS, ledgerMismatchReason: LEDGER_MISMATCH_REASON });
}
