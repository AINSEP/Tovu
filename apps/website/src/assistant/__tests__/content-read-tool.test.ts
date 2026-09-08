/**
 * @file Contract tests for `assistant/content-read-tool.ts` — the 2026-09-08 `content_read`
 * collapse (Option A / arm D1 of `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`).
 *
 * Two properties are pinned here, both of which shipped with no test of their own:
 *
 * 1. **The collapse itself.** The real production composition publishes 29
 *    `content_read.<resource>` cards and NONE of the 36 Tier-1 read tools they replace. Every
 *    per-domain suite asserts its own one or two ids; nothing asserted the whole set, so a card
 *    silently dropping out of `CONTENT_READ_CARDS` would have shown up only as one domain's
 *    "expected '<id>' to be wired" — or, for a card whose domain suite does not cover it, as
 *    nothing at all.
 *
 * 2. **`buildAssistantToolRegistrations`'s `includeContentReadCollapse` test seam.** That option
 *    has no production caller by design — both composition roots leave it at its default — so it
 *    reads exactly like dead code, and a reviewer removing it would break
 *    `development/evals/tool-search-parent-tool-read.eval.ts`'s ability to reconstruct the
 *    PRE-collapse catalog. Losing it does not fail the eval loudly: the eval's "baseline" arm would
 *    quietly become the already-collapsed catalog and go on reporting a number, comparing the
 *    shipped thing against itself. A doc comment cannot prevent that; the test below can, because
 *    deleting the option makes this file stop compiling and the assertions below go red.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { RETIRED_READ_TOOL_TO_CARD, currentToolIdFor } from "../content-read-tool.js";
import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";

installFirstPartyToolContributors();

/** The 36 Tier-1 read tools the collapse retires, transcribed from the eval's own `TIER1_CLEAN`. */
const RETIRED_TIER1_IDS: readonly string[] = [
  "backup_list_restore_points",
  "collections_content_type_list",
  "collections_entry_list",
  "comments_list_moderation_queue",
  "content_post_get",
  "content_post_list",
  "custom_credential_list",
  "database_list_pending_migrations",
  "database_list_restore_points",
  "deployment_list",
  "external_mcp_list",
  "forms_list_definitions",
  "identity_policy_list",
  "identity_role_list",
  "identity_user_list",
  "media_list_assets",
  "members_get_by_id",
  "members_list",
  "menus_get_menu",
  "menus_list_menus",
  "newsletter_get_campaign",
  "newsletter_list_campaigns",
  "newsletter_list_lists",
  "plugins_list",
  "redirects_get",
  "redirects_list",
  "seo_get_entry_meta",
  "settings_list_definitions",
  "taxonomy_list",
  "theme_list",
  "webhooks_list_subscriptions",
  "widgets_get_instance",
  "widgets_get_region",
  "widgets_list_instances",
  "widgets_list_regions",
  "workspace_get",
];

/** The 29 cards those 36 collapse into, by the eval's mechanical `resourceKeyOf` rule (strip the
 *  `list`/`get`/`by`/`id` verb tokens, singularize, dedupe): 7 of them merge a `_get`/`_list` pair
 *  over one resource, 36 - 7 = 29. */
const EXPECTED_CARD_IDS: readonly string[] = [
  "content_read.backup_restore_point",
  "content_read.collection_content_type",
  "content_read.collection_entry",
  "content_read.comment_moderation_queue",
  "content_read.content_post",
  "content_read.custom_credential",
  "content_read.database_pending_migration",
  "content_read.database_restore_point",
  "content_read.deployment",
  "content_read.external_mcp",
  "content_read.form_definition",
  "content_read.identity_policy",
  "content_read.identity_role",
  "content_read.identity_user",
  "content_read.media_asset",
  "content_read.member",
  "content_read.menu",
  "content_read.newsletter_campaign",
  "content_read.newsletter_list",
  "content_read.plugin",
  "content_read.redirect",
  "content_read.seo_entry_meta",
  "content_read.setting_definition",
  "content_read.taxonomy",
  "content_read.theme",
  "content_read.webhook_subscription",
  "content_read.widget_instance",
  "content_read.widget_region",
  "content_read.workspace",
];

function idsOf(options?: { readonly includeContentReadCollapse?: boolean }): Set<string> {
  return new Set(buildAssistantToolRegistrations(createRouteDeps(), undefined, options).map((r) => r.descriptor.id));
}

test("the real composition publishes exactly the 29 content_read cards", () => {
  const cards = [...idsOf()].filter((id) => id.startsWith("content_read.")).sort();
  assert.deepEqual(cards, [...EXPECTED_CARD_IDS].sort());
});

test("not one of the 36 retired Tier-1 read ids survives into the collapsed catalog", () => {
  const ids = idsOf();
  const survivors = RETIRED_TIER1_IDS.filter((id) => ids.has(id));
  assert.deepEqual(survivors, [], "a retired id still resolving means some card failed to replace its member");
});

test("the collapse is a net -7: 36 member tools become 29 cards, and nothing else changes count", () => {
  const collapsed = idsOf();
  const raw = idsOf({ includeContentReadCollapse: false });
  assert.equal(raw.size - collapsed.size, RETIRED_TIER1_IDS.length - EXPECTED_CARD_IDS.length);
  assert.equal(raw.size - collapsed.size, 7);
});

test("includeContentReadCollapse:false reconstructs the true PRE-collapse catalog — the eval's baseline depends on it", () => {
  const raw = idsOf({ includeContentReadCollapse: false });

  // Every retired member is back...
  const missing = RETIRED_TIER1_IDS.filter((id) => !raw.has(id));
  assert.deepEqual(missing, [], "the pre-collapse arm must contain every one of the 36 original read tools");

  // ...and no card is present, which is the half that actually matters: if this option were removed
  // (or silently ignored), the eval's "baseline" would be the collapsed catalog and would compare
  // the shipped design against itself while still printing a plausible number.
  const leakedCards = [...raw].filter((id) => id.startsWith("content_read."));
  assert.deepEqual(leakedCards, [], "the pre-collapse arm must contain NO content_read card");
});

test("RETIRED_READ_TOOL_TO_CARD is the single authority, and covers every retired id exactly once", () => {
  assert.deepEqual([...RETIRED_READ_TOOL_TO_CARD.keys()].sort(), [...RETIRED_TIER1_IDS].sort());
  assert.deepEqual([...new Set(RETIRED_READ_TOOL_TO_CARD.values())].sort(), [...EXPECTED_CARD_IDS].sort());
  assert.equal(currentToolIdFor("members_get_by_id"), "content_read.member");
  assert.equal(currentToolIdFor("members_list"), "content_read.member", "both members of a merged pair resolve to the one card");
  assert.equal(currentToolIdFor("content_post_search"), "content_post_search", "a tool the collapse never touched passes through unchanged");
});

test("every retired member's SEARCH VOCABULARY survives into its card's indexed description", () => {
  // The property the measured retrieval parity actually rests on, and the one most likely to be
  // destroyed by a well-meant cleanup. `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY` are keyed by the MEMBER id
  // (`workspace_get`, not `content_read.workspace`) BY DESIGN: `cardDescription` folds each member's
  // own vocabulary into the card's indexed text through that key. Those keys look like stranded
  // references to a retired id — they are the opposite, and re-keying them onto the card ids would
  // silently drop every one of these words from the FTS index with no error anywhere.
  const byId = new Map(buildAssistantToolRegistrations(createRouteDeps()).map((r) => [r.descriptor.id, r]));

  const checked: string[] = [];
  for (const [memberId, cardId] of RETIRED_READ_TOOL_TO_CARD) {
    const keywords = TOOL_SEARCH_KEYWORDS[memberId];
    if (!keywords) continue;
    const description = byId.get(cardId)?.descriptor.description ?? "";
    for (const term of keywords.split(/\s+/).filter(Boolean)) {
      assert.ok(
        description.includes(term),
        `'${memberId}' contributes the search term '${term}', but '${cardId}' does not carry it — its vocabulary was dropped from the index`,
      );
    }
    checked.push(memberId);
  }
  assert.ok(checked.length >= 30, `expected nearly every retired id to contribute keywords, got ${checked.length}`);
});
