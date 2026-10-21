import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { CURRENT_SRC, GOLDEN_PATH, boundaryTranscript, loadParityModules, migratedParityFixture, type ParityModules } from "./parity-harness.js";

/** Query parity, boundaries (DBMERGE-PLAN §2d `vault-boundary-parity`): ordinary database transfer
 * copies exactly what it copied before minus the nine tables 0012 folded, never the vault itself;
 * the transfer exclusion lists and the key-dependent-data probe answer as before. The `_vault_backup_*`
 * skip and the export no-leak canaries are already pinned (`secrets-vault-step.test.ts`,
 * `publish-content-export-no-leak.integration.test.ts`), so they are not repeated here.
 */
type Boundary = { copied: string[]; leftOut: string[]; excluded: string[]; partiallyExcluded: string[]; keyDependent: boolean };
const golden = (JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { boundary: Boundary }).boundary;
const FOLDED = ["site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials", "custom_credential_sets",
  "publish_content_peers", "database_transfer_destinations", "vendor_credential_sets", "source_control_credential_sets", "publish_credential_sets"];
/** Retired with the folded tables: redirect OAuth state is stateless now (P0 audit, VP:21). */
const RETIRED = [...FOLDED, "oauth_pending_authorizations"];
/** Dropped by step 0011 when empty, as they are here (owner 2026-10-11: no commerce in core). */
const COMMERCE = ["commerce_order_items", "commerce_orders", "commerce_prices", "commerce_product_images", "commerce_products", "commerce_webhook_events"];
/** Later migrations' tables, pinned by name (a8bce53c8 0018, 6bee1800b 0019): three are copied; the receiver
 * pull lease is left out and joins the exclusion list (`database-transfer/exclusions.ts` says why). */
const LATER_COPIED = ["form_delivery_jobs", "form_delivery_plans", "form_submission_remote_receipts",
  // why: d2126748 0021 adds raw-SQL consent policy tables (no visitor data); a transfer copies them by introspection.
  "site_consent_heads", "site_consent_revisions",
  // why: 0023 adds raw-SQL mail ledgers; suppression must follow the site, so a transfer copies them by introspection.
  "mail_feedback_inbox", "mail_send_ledger", "mail_suppression",
  // why: 0024 adds the raw-SQL domain_binding table (hostnames and DNS requirements, no secrets); copied by introspection.
  "domain_binding",
  // why: 0027 adds derived site-search bookkeeping; copied by introspection like any other core table.
  "search_index_state", "search_index_targets", "search_index_watermarks",
  // why: 0028 adds replaced search generations awaiting their index drop; derived, copied the same way.
  "search_index_retired"];
// why: 0023's capture-mode sink holds whole messages (raw sign-in links), so it joins the exclusion list.
const LATER_EXCLUDED = ["form_receiver_pulls", "mail_capture"];
const without = (names: string[], removed: string[]) => names.filter(name => !removed.includes(name));
const plus = (names: string[], added: string[]) => [...names, ...added].sort();

let mods: ParityModules;
before(async () => { mods = await loadParityModules(CURRENT_SRC); });

describe("vault boundary parity [sqlite]", () => {
  let fixture: Awaited<ReturnType<typeof migratedParityFixture>>;
  let actual: Boundary;
  before(async () => {
    fixture = await migratedParityFixture("sqlite");
    actual = await boundaryTranscript(mods, fixture) as Boundary;
  });
  after(async () => { await fixture?.kernel.close(); });

  test("a transfer copies the same tables as before minus the retired ones", () => {
    assert.deepEqual(actual.copied, plus(without(golden.copied, [...RETIRED, ...COMMERCE]), LATER_COPIED));
  });
  test("the vault is never copied; it is left out next to what was left out before", () => {
    assert.equal(actual.copied.includes("secrets_vault"), false);
    assert.deepEqual(without(actual.leftOut, ["secrets_vault"]), plus(without(golden.leftOut, RETIRED), LATER_EXCLUDED));
    assert.ok(actual.leftOut.includes("secrets_vault"));
  });
  test("whole-table transfer exclusions: the vault joins the list; the retired names stay on it", () => {
    // A source that has not run 0012 yet (or an old backup) still holds the folded tables.
    assert.deepEqual(without(actual.excluded, ["secrets_vault"]), plus(golden.excluded, LATER_EXCLUDED));
    assert.ok(actual.excluded.includes("secrets_vault"));
  });
  test("partially excluded (secret-column) tables are unchanged", () => {
    assert.deepEqual(actual.partiallyExcluded, without(golden.partiallyExcluded, RETIRED));
  });
  test("the key-dependent-data probe gives the same answer on the upgraded rows", () => {
    assert.equal(actual.keyDependent, golden.keyDependent);
  });
});

describe("vault boundary parity [pglite]", () => {
  test("the key-dependent-data probe gives the same answer on the upgraded rows", async () => {
    const fixture = await migratedParityFixture("pglite");
    try { assert.equal(await mods.keyDependent.hasKeyDependentData(fixture.kernel), golden.keyDependent); }
    finally { await fixture.kernel.close(); }
  });
});

test("seed-site's credential prune list covers the vault", () => {
  const script = readFileSync(join(CURRENT_SRC, "../../../development/scripts/seed-site.mjs"), "utf8");
  assert.match(script, /"secrets_vault"/);
});
