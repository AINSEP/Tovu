/**
 * @file Synthetic distractor tools for the tool-search SCALING-CURVE experiment
 * (`tool-search-scaling-curve.eval.ts`) — padding the real 131-tool catalog up to 250 / 500 / 1000
 * tools to measure how BM25 retrieval quality degrades as the catalog grows.
 *
 * ## Provenance (blind authoring)
 *
 * Authored BEFORE this experiment's author (a dispatched TestRunner subagent) read the scorer
 * (`tool-search-all-approaches-v2.eval.ts`) or the held-out query set
 * (`tool-search-heldout-v2.ts`) — enforced by information architecture per
 * `AI-Dev-Shop/harness-engineering/agent-evals/eval-design-playbook.md`. An author who has seen the
 * queries would, deliberately or not, produce distractors that don't compete with them, understating
 * degradation and producing a flattering, useless curve. This project has already been burned once
 * by exactly that failure mode (a keyword-file author who also wrote the eval queries inflated a
 * baseline ~20pp — see `tool-search-all-approaches-v2.eval.ts`'s own header). The gold answer for
 * every held-out case remains a real tool; distractors are never correct answers, only competitors.
 *
 * ## Style calibration
 *
 * Every real tool's id and description (verbatim, via the actual registration/catalog source files —
 * never the eval files) was read first to extract the house register: `<domain>_<verb>_<object>`
 * snake_case ids; 6-230 word descriptions (median ~25-40); explicit "Read-only." tags; "Call this to
 * find X before calling Y" cross-references to sibling tools; explicit idempotency/reversibility/undo
 * disclosure; concrete field names and status enums rather than abstract description.
 *
 * ## Generation policy — templated, not bespoke, and why that matters
 *
 * At 1000 catalog size this needs 869 distractor tools. Hand-authoring that many with genuinely
 * independent prose was judged not worth the effort this task warrants, so generation is a
 * deterministic template engine: a phrase bank (4-8 variants per rhetorical slot — list/get/create/
 * update/delete/toggle/plan/archive/restore/duplicate/settings openers, cross-ref sentences, caveat
 * clauses) combined with REAL domain-specific vocabulary (id-field names like `chargeId`/`couponId`/
 * `skuId`, status enums, mutable-vs-immutable field lists, reject conditions) via a per-tool-id seeded
 * PRNG (mulberry32), so output is reproducible and non-identical across tools without being hand-typed
 * one at a time. The vocabulary — not the connective prose — is what actually competes with real
 * tools on BM25.
 *
 * **This is an optimistic-but-not-unidirectional bias, not a clean optimistic bound.** Real added
 * tools would carry fully independent prose written by different engineers over time — plausibly MORE
 * lexically varied than these templates, which would make real degradation worse than measured here.
 * But the shared boilerplate phrases used across many distractors ("Read-only.", "Call this to find an
 * id before calling X") also lower BM25's global IDF for those same phrases WHEN THEY APPEAR IN REAL
 * TOOLS TOO — which inflates apparent competition that isn't really about the distractor's own
 * content, and would not appear the same way against independently-written real descriptions. The
 * `tool-search-scaling-curve.eval.ts` miss-decomposition (real-tool-displaces-real-tool vs
 * distractor-displaces-real-tool) is what actually separates these two effects — don't trust this
 * module's docstring to say which direction wins; trust that decomposition.
 *
 * ## Two distractor categories (`category` field), deliberately mixed at a REALISTIC ~75:25 ratio
 *
 * - `"new"` — adjacent business domains a growing CMS/commerce/plugin surface would actually add
 *   (payments, subscriptions, inventory, shipping, plugin marketplace, ...). Matches the owner's
 *   stated growth vector ("plugins, payments, and new features"). Tests raw catalog-size dilution.
 * - `"near"` — domains that deliberately share vocabulary with a SPECIFIC existing real domain (a
 *   `notifications_` domain competing with `newsletter_list_subscriptions`'s "subscription" language;
 *   `dashboards_widgets_` competing with the real `widgets_` domain's own vocabulary). The `nearOf`
 *   field names which real domain(s) each one targets. This is the harder, more honest stress test:
 *   genuine lexical competition rather than mere volume. Kept as a REALISTIC minority (not
 *   over-weighted) per explicit review — a real catalog's growth is mostly new domains with SOME
 *   near-neighbours, and over-weighting the harder category would trade one unmeasurable bias for
 *   another in the opposite direction while looking like a clean worst case, which it would not be.
 *
 * ## Growth ordering
 *
 * `MASTER_DISTRACTORS` is ONE priority-ordered list (commerce/payments first, plugin-ecosystem next,
 * other feature growth after, near-neighbour domains interleaved every 4th domain slot throughout —
 * not segregated to the tail) simulating a single plausible accretion timeline. Catalog sizes 250 /
 * 500 / 1000 are prefixes of this same list via {@link distractorsForSize}, not unrelated random
 * subsets per size — this is what makes the resulting curve interpretable as one growth story rather
 * than four disconnected snapshots.
 *
 * ## doc2query for distractors
 *
 * `MASTER_DISTRACTOR_DOC2QUERY` (below) gives every distractor synthetic operator-voice questions,
 * generated the same templated way, because scoring doc2query fairly requires ALL tools in the padded
 * catalog to have enriched descriptions — a catalog where only the real 131 got doc2query enrichment
 * would rig that comparison in doc2query's favor. Per review, this templated set is knowingly
 * favorable to doc2query (real DOC2QUERY questions were model-generated and lexically richer than
 * these templates), so `tool-search-distractors-doc2query-calibration-250.ts` provides an
 * independently model-generated (blind subagent, same provenance discipline as the real
 * `tool-search-doc2query-blind-questions.ts`) alternative for JUST the 119 distractors needed at
 * catalog size 250, to measure how much the templating inflates doc2query's apparent score. That
 * calibration is deliberately not scaled to 500/1000 — one measured delta at 250 is enough to bound
 * the bias at the larger sizes too.
 */

type DistractorCategory = "new" | "near";

export interface DistractorTool {
  readonly id: string;
  readonly description: string;
  readonly category: DistractorCategory;
  /** Only set for `category: "near"` — which real domain(s) this one deliberately competes with. */
  readonly nearOf?: string;
}

// ---------------------------------------------------------------------------------------------
// Deterministic per-tool PRNG (mulberry32, FNV-1a seed) — reproducible across runs, no model calls.
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFor(id: string, salt = ""): () => number {
  return mulberry32(hashStr(id + salt));
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]!;
}
function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

const VOWEL_SOUND_ACRONYMS = /^(SSO|SSL|API|SKU|SMS|ISO|MFA|IP|SLA|ETA|RMA|UTM)\b/;
function article(word: string): "a" | "an" {
  if (VOWEL_SOUND_ACRONYMS.test(word)) return "an";
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// ---------------------------------------------------------------------------------------------
// Description phrase banks, calibrated against the real 131-tool catalog's register (see header).
// ---------------------------------------------------------------------------------------------

const LIST_OPENERS = (s: string, p: string, filterField?: string) => [
  `Lists the workspace's ${p}${filterField ? `, optionally filtered by ${filterField}` : ""}.`,
  `Lists every ${s} in the workspace${filterField ? `, narrowed by ${filterField} when supplied` : ""}.`,
  `Returns the workspace's ${p}, newest first${filterField ? `, filterable by ${filterField}` : ""}.`,
  `Lists ${p} visible to this workspace, keyset-paginated.`,
];
const GET_OPENERS = (s: string, idField: string) => [
  `Fetches a single ${s} by ${idField}.`,
  `Reads one ${s}'s full details by ${idField}.`,
  `Returns one ${s} by ${idField}, including its current status.`,
];
const CREATE_OPENERS = (s: string, requiredField?: string) => [
  `Creates a new ${s}${requiredField ? ` with a required ${requiredField}` : ""}.`,
  `Creates ${article(s)} ${s} from the supplied fields${requiredField ? `; ${requiredField} must be unique within the workspace` : ""}.`,
  `Registers a new ${s} in the workspace.`,
];
const UPDATE_OPENERS = (s: string, mutableFields: string) => [
  `Updates an existing ${s}'s ${mutableFields}.`,
  `Edits one or more of ${article(s)} ${s}'s ${mutableFields}.`,
  `Applies a partial patch to ${article(s)} ${s}'s ${mutableFields}.`,
];
const DELETE_OPENERS = (s: string) => [
  `Soft-deletes (trashes) ${article(s)} ${s} — reversible, never row-deleted, for audit durability.`,
  `Disables ${article(s)} ${s}, revoking its effect without a hard delete.`,
  `Removes ${article(s)} ${s} from active use by flipping its status; the record itself is retained.`,
];
const TOGGLE_OPENERS = (s: string, states?: string) => [
  states ? `Sets ${article(s)} ${s}'s status to ${states}.` : `Toggles ${article(s)} ${s}'s active state.`,
  `Enables or disables an existing ${s}; one tool, both directions.`,
];
const PLAN_OPENERS = (s: string, actionNoun: string, pastParticiple: string) => [
  `Previews what ${actionNoun} ${article(s)} ${s} would change, without applying anything.`,
  `Computes and returns the effect of ${article(s)} ${s} ${actionNoun} — read-only, nothing is ${pastParticiple}.`,
];
const ARCHIVE_OPENERS = (s: string) => [
  `Archives ${article(s)} ${s}, hiding it from default listings without deleting it.`,
  `Moves ${article(s)} ${s} to the archive. Reversible via its restore counterpart.`,
];
const RESTORE_OPENERS = (s: string) => [
  `Restores a previously archived or trashed ${s} back to active.`,
  `Brings an archived ${s} back into active use.`,
];
const DUPLICATE_OPENERS = (s: string) => [
  `Creates a copy of an existing ${s} with a new id.`,
  `Duplicates ${article(s)} ${s}, including its current field values, under a new id.`,
];
const SETTINGS_GET_OPENERS = (domainLabel: string, settingsList: string) => [
  `Reads the workspace's ${domainLabel} settings (${settingsList}).`,
  `Returns the current ${domainLabel} configuration: ${settingsList}.`,
];
const SETTINGS_SET_OPENERS = (domainLabel: string) => [
  `Updates one or more of the workspace's ${domainLabel} settings.`,
  `Sets the workspace's ${domainLabel} configuration.`,
];
const CROSS_REF = (useId: string) => [
  ` Call this to find an id before calling ${useId}.`,
  ` Use this to look up the id ${useId} expects.`,
  ` Call this first to get the id ${useId} needs.`,
];
const CAVEATS = [
  " Idempotent: calling this again on an already-changed record is a no-op.",
  " A partial patch — omitted fields keep their current value.",
  " Rejected if the record does not exist.",
  " There is no agent-callable undo for this action.",
  " At least one field must be supplied.",
  " Refused if the record is already in that state.",
];
const REJECTED_IF = (cond: string) => ` Rejected if ${cond}.`;
const READONLY = " Read-only.";

function describeList(rng: () => number, s: string, p: string, filterField: string | undefined, findFor: string | undefined, nearNote: string | undefined): string {
  let d = pick(rng, LIST_OPENERS(s, p, filterField)) + READONLY;
  if (findFor) d += pick(rng, CROSS_REF(findFor));
  if (nearNote) d += ` ${nearNote}`;
  return d;
}
function describeGet(rng: () => number, s: string, idField: string): string {
  return pick(rng, GET_OPENERS(s, idField)) + READONLY;
}
function describeCreate(rng: () => number, s: string, requiredField: string | undefined, rejectCond: string | undefined): string {
  let d = pick(rng, CREATE_OPENERS(s, requiredField));
  if (rejectCond && chance(rng, 0.6)) d += REJECTED_IF(rejectCond);
  if (chance(rng, 0.5)) d += pick(rng, CAVEATS);
  return d;
}
function describeUpdate(rng: () => number, s: string, mutableFields: string, immutableNote: string | undefined): string {
  let d = pick(rng, UPDATE_OPENERS(s, mutableFields));
  d += pick(rng, CAVEATS);
  if (immutableNote && chance(rng, 0.5)) d += ` ${immutableNote}`;
  return d;
}
function describeDelete(rng: () => number, s: string): string {
  let d = pick(rng, DELETE_OPENERS(s));
  if (chance(rng, 0.7)) d += pick(rng, CAVEATS);
  return d;
}
function describeToggle(rng: () => number, s: string, states: string | undefined): string {
  let d = pick(rng, TOGGLE_OPENERS(s, states));
  if (chance(rng, 0.5)) d += pick(rng, CAVEATS);
  return d;
}
function describePlan(rng: () => number, s: string, actionNoun: string, pastParticiple: string): string {
  return pick(rng, PLAN_OPENERS(s, actionNoun, pastParticiple));
}
function describeArchive(rng: () => number, s: string): string {
  let d = pick(rng, ARCHIVE_OPENERS(s));
  if (chance(rng, 0.5)) d += pick(rng, CAVEATS);
  return d;
}
function describeRestore(rng: () => number, s: string): string {
  let d = pick(rng, RESTORE_OPENERS(s));
  if (chance(rng, 0.5)) d += pick(rng, CAVEATS);
  return d;
}
function describeDuplicate(rng: () => number, s: string): string {
  return pick(rng, DUPLICATE_OPENERS(s));
}
function describeSettingsGet(rng: () => number, domainLabel: string, settingsList: string): string {
  return pick(rng, SETTINGS_GET_OPENERS(domainLabel, settingsList)) + READONLY;
}
function describeSettingsSet(rng: () => number, domainLabel: string): string {
  return pick(rng, SETTINGS_SET_OPENERS(domainLabel)) + pick(rng, CAVEATS);
}

// ---------------------------------------------------------------------------------------------
// doc2query phrase banks — 5 operator-voice questions per tool, same templated approach, calibrated
// against the real DOC2QUERY file's register (colloquial, varied openers: What/How/Can you/I need/Is
// there). See module header for why the 250-size calibration set exists alongside this.
// ---------------------------------------------------------------------------------------------

const Q_LIST = (s: string, p: string, filterWord?: string) => [
  `What ${p} do we have?`,
  `Can you show me all our ${p}${filterWord ? `, filtered by ${filterWord}` : ""}?`,
  `I need to see the current ${p}.`,
  `List every ${s} in the workspace.`,
  `Show me the ${p} we have set up.`,
];
const Q_GET = (s: string) => [
  `Can you pull up the details for this ${s}?`,
  `I have the id, show me the ${s}.`,
  `What does this ${s} look like right now?`,
  `Can you fetch one ${s} by its id?`,
  `Show me everything about this specific ${s}.`,
];
const Q_CREATE = (s: string) => [
  `How do I set up a new ${s}?`,
  `Can you create a ${s} for me?`,
  `I want to add a brand-new ${s}.`,
  `Can you register a ${s} with these details?`,
  `How do I add a new ${s} to the workspace?`,
];
const Q_UPDATE = (s: string) => [
  `Can you change some fields on this ${s}?`,
  `I need to update this ${s} without touching everything else.`,
  `How do I edit an existing ${s}?`,
  `Can you fix a value on this ${s}?`,
  `I want to patch a few fields on this ${s}.`,
];
const Q_DELETE = (s: string) => [
  `Can you delete this ${s}?`,
  `How do I remove a ${s} we don't need anymore?`,
  `I want to get rid of this ${s} — is it recoverable?`,
  `Can you trash this ${s}?`,
  `How do I soft-delete a ${s}?`,
];
const Q_TOGGLE = (s: string) => [
  `Can you turn this ${s} on?`,
  `How do I disable a ${s}?`,
  `Can you flip the status on this ${s}?`,
  `I want to enable this ${s} again.`,
  `How do I switch this ${s} off without deleting it?`,
];
const Q_PLAN = (s: string) => [
  `What would happen if I changed this ${s}?`,
  `Can you preview the effect before actually doing it?`,
  `I want to see what this ${s} action would do first.`,
  `Can you show me a dry run for this ${s}?`,
  `Before I commit, what would this ${s} change?`,
];
const Q_ARCHIVE = (s: string) => [
  `Can you archive this ${s}?`,
  `How do I hide an old ${s} without deleting it?`,
  `I want to retire this ${s} but keep it around.`,
  `Can you move this ${s} out of the active list?`,
  `How do I get this ${s} out of the default view without losing it?`,
];
const Q_RESTORE = (s: string) => [
  `I archived this ${s} by mistake, can you bring it back?`,
  `How do I restore a ${s} I trashed earlier?`,
  `Can you un-archive this ${s}?`,
  `I want this ${s} active again.`,
  `How do I bring a retired ${s} back into use?`,
];
const Q_DUPLICATE = (s: string) => [
  `Can you make a copy of this ${s}?`,
  `How do I duplicate an existing ${s}?`,
  `I want a new ${s} based on this one.`,
  `Can you clone this ${s} for me?`,
  `How do I start a new ${s} from an existing one instead of from scratch?`,
];
const Q_SETTINGS_GET = (domainLabel: string) => [
  `What are our current ${domainLabel} settings?`,
  `Can you show me the ${domainLabel} configuration?`,
  `What's our ${domainLabel} set up like right now?`,
  `Show me the ${domainLabel} preferences.`,
  `What options are we currently using for ${domainLabel}?`,
];
const Q_SETTINGS_SET = (domainLabel: string) => [
  `Can you change our ${domainLabel} settings?`,
  `How do I update the ${domainLabel} configuration?`,
  `I want to adjust our ${domainLabel} setup.`,
  `Can you turn off part of our ${domainLabel} configuration?`,
  `How do I change how ${domainLabel} is configured for the workspace?`,
];

function questionsFor(kind: string, s: string, p: string, domainLabel: string, rng: () => number): readonly string[] {
  switch (kind) {
    case "list":
      return Q_LIST(s, p);
    case "get":
      return Q_GET(s);
    case "create":
      return Q_CREATE(s);
    case "update":
      return Q_UPDATE(s);
    case "delete":
      return Q_DELETE(s);
    case "toggle":
      return Q_TOGGLE(s);
    case "plan":
      return Q_PLAN(s);
    case "archive":
      return Q_ARCHIVE(s);
    case "restore":
      return Q_RESTORE(s);
    case "duplicate":
      return Q_DUPLICATE(s);
    case "settingsGet":
      return Q_SETTINGS_GET(domainLabel);
    case "settingsSet":
      return Q_SETTINGS_SET(domainLabel);
    default:
      return Q_GET(s);
  }
}

// ---------------------------------------------------------------------------------------------
// Domain catalog
// ---------------------------------------------------------------------------------------------

interface DomainSpec {
  readonly prefix: string;
  readonly s: string; // entity singular
  readonly p: string; // entity plural
  readonly idField: string;
  readonly requiredField?: string;
  readonly mutableFields?: string;
  readonly immutableNote?: string;
  readonly rejectCond?: string;
  readonly states?: string;
  readonly count: number;
  readonly nearOf?: string;
  readonly nearNote?: string;
  readonly extra?: ReadonlyArray<{ id: string; kind: string; desc: (rng: () => number) => string }>;
}

// NEW: adjacent business domains (commerce/payments first — matches the owner's stated growth
// vector — then plugin-ecosystem, then other feature growth). Tests raw catalog-size dilution.
const NEW_DOMAINS: readonly DomainSpec[] = [
  { prefix: "payments", s: "charge", p: "charges", idField: "chargeId", requiredField: "amount", mutableFields: "description and metadata", immutableNote: "The amount and currency are immutable once captured.", rejectCond: "the payment method has already been refunded in full", count: 8, extra: [{ id: "payments_create_refund", kind: "create", desc: (rng) => describeCreate(rng, "refund", undefined, "the charge is not in a refundable state") }] },
  { prefix: "payment_methods", s: "payment method", p: "payment methods", idField: "methodId", mutableFields: "billing address on file", rejectCond: "the method has expired", count: 5 },
  { prefix: "subscriptions_billing", s: "billing subscription", p: "billing subscriptions", idField: "subscriptionId", requiredField: "planId", mutableFields: "plan, quantity, and renewal date", immutableNote: "The customerId cannot be changed after creation.", states: "'active', 'past_due', or 'canceled'", count: 7 },
  { prefix: "subscription_plans", s: "subscription plan", p: "subscription plans", idField: "planId", mutableFields: "price and billing interval", count: 5 },
  { prefix: "trial_periods", s: "trial period", p: "trial periods", idField: "trialId", mutableFields: "length in days", count: 3 },
  { prefix: "invoices", s: "invoice", p: "invoices", idField: "invoiceId", requiredField: "customerId", mutableFields: "due date and line items", rejectCond: "the invoice has already been paid", count: 6 },
  { prefix: "discounts", s: "coupon", p: "coupons", idField: "couponId", requiredField: "code", mutableFields: "expiry date and usage limit", rejectCond: "the code is already in use by another active coupon", states: "'active' or 'archived'", count: 6, extra: [{ id: "discounts_preview_apply", kind: "plan", desc: (rng) => describePlan(rng, "coupon", "applying", "applied") }] },
  { prefix: "price_rules", s: "price rule", p: "price rules", idField: "ruleId", mutableFields: "conditions and adjustment", count: 4 },
  { prefix: "orders", s: "order", p: "orders", idField: "orderId", requiredField: "customerId", mutableFields: "shipping address and line items", rejectCond: "the order has already shipped", states: "'pending', 'fulfilled', or 'cancelled'", count: 8 },
  { prefix: "pre_orders", s: "pre-order", p: "pre-orders", idField: "preOrderId", mutableFields: "expected availability date", count: 4 },
  { prefix: "order_holds", s: "order hold", p: "order holds", idField: "holdId", mutableFields: "reason", count: 3 },
  { prefix: "products", s: "product", p: "products", idField: "productId", requiredField: "title", mutableFields: "title, price, and description", rejectCond: "the SKU is already taken", count: 8 },
  { prefix: "product_variants", s: "product variant", p: "product variants", idField: "variantId", requiredField: "productId", mutableFields: "price and option values", count: 5 },
  { prefix: "product_attributes", s: "product attribute", p: "product attributes", idField: "attributeId", mutableFields: "allowed values", count: 5 },
  { prefix: "bundles", s: "product bundle", p: "product bundles", idField: "bundleId", mutableFields: "included products and bundle price", count: 5 },
  { prefix: "size_charts", s: "size chart", p: "size charts", idField: "chartId", mutableFields: "measurement rows", count: 3 },
  { prefix: "barcode_lookup", s: "barcode mapping", p: "barcode mappings", idField: "barcode", count: 3 },
  { prefix: "serial_numbers", s: "serial number record", p: "serial number records", idField: "serial", mutableFields: "warranty status", count: 4 },
  { prefix: "lot_tracking", s: "inventory lot", p: "inventory lots", idField: "lotId", mutableFields: "expiry date", count: 4 },
  { prefix: "inventory", s: "stock level", p: "stock levels", idField: "skuId", mutableFields: "quantity on hand and reorder threshold", rejectCond: "the adjustment would take quantity below zero", count: 7 },
  { prefix: "backorders", s: "backorder", p: "backorders", idField: "backorderId", mutableFields: "expected restock date", count: 4 },
  { prefix: "stock_alerts", s: "low-stock alert rule", p: "low-stock alert rules", idField: "alertId", mutableFields: "threshold quantity", count: 4 },
  { prefix: "restock_notifications", s: "restock notification signup", p: "restock notification signups", idField: "signupId", count: 4 },
  { prefix: "consignment_stock", s: "consignment stock record", p: "consignment stock records", idField: "recordId", mutableFields: "owed quantity", count: 4 },
  { prefix: "dropship_suppliers", s: "dropship supplier", p: "dropship suppliers", idField: "supplierId", mutableFields: "catalog feed URL", count: 4 },
  { prefix: "shipping", s: "shipping rate", p: "shipping rates", idField: "rateId", requiredField: "zoneId", mutableFields: "carrier and price", count: 6 },
  { prefix: "shipping_zones", s: "shipping zone", p: "shipping zones", idField: "zoneId", mutableFields: "countries and regions covered", count: 4 },
  { prefix: "carrier_accounts", s: "carrier account", p: "carrier accounts", idField: "accountId", mutableFields: "credentials and default service level", count: 4 },
  { prefix: "packing_slips", s: "packing slip", p: "packing slips", idField: "slipId", count: 3 },
  { prefix: "pick_lists", s: "warehouse pick list", p: "warehouse pick lists", idField: "listId", mutableFields: "assigned picker", count: 3 },
  { prefix: "return_shipping_labels", s: "return shipping label", p: "return shipping labels", idField: "labelId", requiredField: "returnId", count: 4 },
  { prefix: "tax_rates", s: "tax rate", p: "tax rates", idField: "taxRateId", mutableFields: "percentage and jurisdiction", count: 4 },
  { prefix: "tax_exemptions", s: "tax exemption certificate", p: "tax exemption certificates", idField: "certificateId", requiredField: "customerId", count: 4 },
  { prefix: "vat_registrations", s: "VAT registration", p: "VAT registrations", idField: "registrationId", mutableFields: "registration number", count: 3 },
  { prefix: "customs_declarations", s: "customs declaration", p: "customs declarations", idField: "declarationId", requiredField: "orderId", count: 4 },
  { prefix: "gift_cards", s: "gift card", p: "gift cards", idField: "giftCardId", requiredField: "initialBalance", mutableFields: "balance and expiry", rejectCond: "the code has already been redeemed", count: 5 },
  { prefix: "store_credit", s: "store credit ledger entry", p: "store credit ledger entries", idField: "customerId", mutableFields: "credit balance", count: 5 },
  { prefix: "gift_wrapping_options", s: "gift wrapping option", p: "gift wrapping options", idField: "optionId", mutableFields: "price and description", count: 3 },
  { prefix: "carts", s: "cart", p: "carts", idField: "cartId", mutableFields: "line items", count: 5 },
  { prefix: "abandoned_carts", s: "abandoned cart", p: "abandoned carts", idField: "cartId", mutableFields: "recovery email status", count: 3 },
  { prefix: "checkout", s: "checkout session", p: "checkout sessions", idField: "sessionId", mutableFields: "shipping method and payment method", count: 4 },
  { prefix: "checkout_fields", s: "custom checkout field", p: "custom checkout fields", idField: "fieldId", mutableFields: "label and required flag", count: 4 },
  { prefix: "returns", s: "return request", p: "return requests", idField: "returnId", requiredField: "orderId", mutableFields: "reason and resolution", rejectCond: "the return window for the order has already closed", count: 5 },
  { prefix: "refund_policies", s: "refund policy", p: "refund policies", idField: "policyId", mutableFields: "window length and eligible categories", count: 3 },
  { prefix: "disputes", s: "payment dispute", p: "payment disputes", idField: "disputeId", requiredField: "chargeId", mutableFields: "evidence submitted", count: 5 },
  { prefix: "fraud_reviews", s: "fraud review", p: "fraud reviews", idField: "reviewId", mutableFields: "risk score and decision", count: 5 },
  { prefix: "vendors", s: "vendor", p: "vendors", idField: "vendorId", requiredField: "name", mutableFields: "payout schedule and contact info", count: 6 },
  { prefix: "seller_payouts", s: "seller payout", p: "seller payouts", idField: "payoutId", requiredField: "vendorId", count: 4 },
  { prefix: "marketplace_commissions", s: "marketplace commission rule", p: "marketplace commission rules", idField: "ruleId", mutableFields: "commission percentage", count: 4 },
  { prefix: "marketplace_categories", s: "marketplace category", p: "marketplace categories", idField: "categoryId", mutableFields: "parent category", count: 4 },
  { prefix: "warehouses", s: "warehouse", p: "warehouses", idField: "warehouseId", mutableFields: "address and capacity", count: 4 },
  { prefix: "fulfillment_centers", s: "fulfillment center", p: "fulfillment centers", idField: "centerId", mutableFields: "coverage region", count: 4 },
  { prefix: "purchase_orders", s: "purchase order", p: "purchase orders", idField: "purchaseOrderId", requiredField: "vendorId", mutableFields: "line items and expected date", count: 5 },
  { prefix: "procurement_requests", s: "procurement request", p: "procurement requests", idField: "requestId", mutableFields: "approval status", count: 4 },
  { prefix: "supplier_contracts", s: "supplier contract", p: "supplier contracts", idField: "contractId", requiredField: "vendorId", mutableFields: "renewal terms", count: 4 },
  { prefix: "print_on_demand_products", s: "print-on-demand product", p: "print-on-demand products", idField: "podProductId", mutableFields: "artwork file and base product", count: 4 },
  { prefix: "wishlists", s: "wishlist", p: "wishlists", idField: "wishlistId", mutableFields: "items", count: 3 },
  { prefix: "loyalty_points", s: "loyalty ledger entry", p: "loyalty ledger entries", idField: "customerId", mutableFields: "point balance", count: 5 },
  { prefix: "loyalty_tiers", s: "loyalty tier", p: "loyalty tiers", idField: "tierId", mutableFields: "qualifying spend threshold", count: 4 },
  { prefix: "points_redemption", s: "points redemption rule", p: "points redemption rules", idField: "ruleId", mutableFields: "point cost and reward", count: 4 },
  { prefix: "referrals", s: "referral", p: "referrals", idField: "referralId", mutableFields: "reward status", count: 4 },
  { prefix: "referral_codes", s: "referral code", p: "referral codes", idField: "codeId", mutableFields: "reward amount", count: 4 },
  { prefix: "affiliates", s: "affiliate", p: "affiliates", idField: "affiliateId", requiredField: "payoutMethod", mutableFields: "commission rate", count: 5 },
  { prefix: "influencer_partnerships", s: "influencer partnership", p: "influencer partnerships", idField: "partnershipId", mutableFields: "deliverables and payout", count: 4 },
  { prefix: "brand_ambassadors", s: "brand ambassador profile", p: "brand ambassador profiles", idField: "ambassadorId", count: 3 },
  { prefix: "ugc_submissions", s: "user-generated content submission", p: "user-generated content submissions", idField: "submissionId", mutableFields: "usage rights status", count: 4 },
  { prefix: "price_lists", s: "price list", p: "price lists", idField: "priceListId", mutableFields: "currency and entries", count: 4 },
  { prefix: "b2b_price_tiers", s: "B2B price tier", p: "B2B price tiers", idField: "tierId", mutableFields: "minimum quantity and discount", count: 4 },
  { prefix: "currencies", s: "supported currency", p: "supported currencies", idField: "currencyCode", mutableFields: "exchange rate", count: 3 },
  { prefix: "multi_currency_settings", s: "currency display rule", p: "currency display rules", idField: "ruleId", mutableFields: "rounding behavior", count: 3 },
  { prefix: "usage_metering", s: "usage meter", p: "usage meters", idField: "meterId", mutableFields: "unit label and aggregation window", count: 5 },
  { prefix: "metered_billing_events", s: "metered billing event", p: "metered billing events", idField: "eventId", requiredField: "meterId", count: 5 },
  { prefix: "dunning_rules", s: "dunning rule", p: "dunning rules", idField: "ruleId", mutableFields: "retry schedule", count: 4 },
  { prefix: "revenue_recognition", s: "revenue recognition schedule", p: "revenue recognition schedules", idField: "scheduleId", mutableFields: "recognition period", count: 4 },
  { prefix: "financial_reports", s: "financial report", p: "financial reports", idField: "reportId", mutableFields: "date range and line items", count: 5 },
  { prefix: "payout_reconciliation", s: "payout reconciliation entry", p: "payout reconciliation entries", idField: "entryId", count: 4 },
  { prefix: "api_usage_logs", s: "API usage log entry", p: "API usage log entries", idField: "entryId", count: 4 },
  { prefix: "rate_card_overrides", s: "rate card override", p: "rate card overrides", idField: "overrideId", requiredField: "customerId", count: 3 },
  { prefix: "partner_program_members", s: "partner program member", p: "partner program members", idField: "memberId", mutableFields: "tier and benefits", count: 4 },
  { prefix: "app_store_listings", s: "listing", p: "listings", idField: "listingId", mutableFields: "screenshots and pricing tier", count: 4 },
  { prefix: "staging_environments", s: "staging environment", p: "staging environments", idField: "environmentId", mutableFields: "source branch", count: 4 },
  { prefix: "custom_domains", s: "custom domain", p: "custom domains", idField: "domainId", requiredField: "hostname", rejectCond: "the hostname is already claimed by another workspace", mutableFields: "verification status", count: 4 },
  { prefix: "dns_records", s: "DNS record", p: "DNS records", idField: "recordId", mutableFields: "value and TTL", count: 4 },
  { prefix: "ssl_certificates", s: "SSL certificate", p: "SSL certificates", idField: "certificateId", mutableFields: "renewal setting", count: 3 },
  { prefix: "cdn_cache", s: "cache rule", p: "cache rules", idField: "ruleId", mutableFields: "TTL and path pattern", count: 4 },
  { prefix: "rate_limits", s: "rate limit rule", p: "rate limit rules", idField: "ruleId", mutableFields: "requests-per-minute threshold", count: 4 },
  { prefix: "ip_allowlist", s: "allowlisted IP range", p: "allowlisted IP ranges", idField: "rangeId", count: 3 },
  { prefix: "api_rate_plans", s: "API rate plan", p: "API rate plans", idField: "planId", mutableFields: "monthly request quota", count: 3 },
  { prefix: "scheduled_jobs", s: "scheduled job", p: "scheduled jobs", idField: "jobId", mutableFields: "cron expression", count: 4 },
  { prefix: "automations", s: "automation rule", p: "automation rules", idField: "ruleId", mutableFields: "trigger and action steps", count: 6 },
  { prefix: "reports_analytics", s: "saved report", p: "saved reports", idField: "reportId", mutableFields: "date range and metrics", count: 6 },
  { prefix: "funnel_reports", s: "funnel report", p: "funnel reports", idField: "reportId", mutableFields: "stage definitions", count: 4 },
  { prefix: "cohort_reports", s: "cohort report", p: "cohort reports", idField: "reportId", mutableFields: "cohort window", count: 4 },
  { prefix: "churn_predictions", s: "churn prediction", p: "churn predictions", idField: "customerId", count: 3 },
  { prefix: "conversion_goals", s: "conversion goal", p: "conversion goals", idField: "goalId", mutableFields: "target event", count: 4 },
  { prefix: "pixel_tracking", s: "tracking pixel", p: "tracking pixels", idField: "pixelId", mutableFields: "destination platform", count: 3 },
  { prefix: "utm_link_builder", s: "UTM-tagged link", p: "UTM-tagged links", idField: "linkId", mutableFields: "campaign parameters", count: 4 },
  { prefix: "ad_campaigns", s: "ad campaign", p: "ad campaigns", idField: "campaignId", mutableFields: "budget and targeting", count: 5 },
  { prefix: "marketing_budgets", s: "marketing budget line", p: "marketing budget lines", idField: "lineId", mutableFields: "allocated amount", count: 4 },
  { prefix: "surveys", s: "survey", p: "surveys", idField: "surveyId", mutableFields: "questions", count: 5 },
  { prefix: "popups", s: "popup", p: "popups", idField: "popupId", mutableFields: "trigger rule and content", count: 4 },
  { prefix: "live_chat", s: "chat conversation", p: "chat conversations", idField: "conversationId", mutableFields: "assigned agent", count: 5 },
  { prefix: "help_desk_tickets", s: "support ticket", p: "support tickets", idField: "ticketId", mutableFields: "priority and assignee", count: 6 },
  { prefix: "knowledge_base_articles", s: "knowledge base article", p: "knowledge base articles", idField: "articleId", mutableFields: "title and body", count: 5 },
  { prefix: "ab_experiments", s: "experiment", p: "experiments", idField: "experimentId", mutableFields: "traffic split and variants", count: 5 },
  { prefix: "feature_flags", s: "feature flag", p: "feature flags", idField: "flagId", mutableFields: "rollout percentage", count: 5 },
];

// NEAR: deliberately share vocabulary with a specific existing real domain (see `nearOf`). Kept a
// realistic minority (~22-25% of total, not over-weighted) per review.
const NEAR_DOMAINS: readonly DomainSpec[] = [
  { prefix: "notifications", s: "notification template", p: "notification templates", idField: "templateId", requiredField: "channel", mutableFields: "subject, body, and channel", rejectCond: "the channel is not one of 'email', 'sms', or 'push'", count: 7, nearOf: "newsletter_ / integrations_", nearNote: "Distinct from the newsletter subscriber list — these are in-app/push subscriptions, not mailing-list ones." },
  { prefix: "push_notifications", s: "push notification", p: "push notifications", idField: "pushId", mutableFields: "title and deep link", count: 5, nearOf: "notifications_ / newsletter_" },
  { prefix: "sms_campaigns", s: "SMS campaign", p: "SMS campaigns", idField: "campaignId", requiredField: "listId", mutableFields: "message body and send time", states: "'draft', 'scheduled', or 'sent'", count: 5, nearOf: "newsletter_ (campaign language)" },
  { prefix: "email_templates", s: "email template", p: "email templates", idField: "templateId", mutableFields: "subject line and body", count: 5, nearOf: "newsletter_ (template/campaign language)" },
  { prefix: "audit_log", s: "audit log entry", p: "audit log entries", idField: "entryId", count: 5, nearOf: "identity_ (role/permission/access language)", nearNote: "Records every role and permission change made through identity_role_assign and identity_policy_attach; does not itself grant or revoke access." },
  { prefix: "api_tokens", s: "API token", p: "API tokens", idField: "tokenId", requiredField: "scope", mutableFields: "scope and expiry", rejectCond: "the requested scope exceeds the caller's own permissions", count: 5, nearOf: "identity_ (access/grant/revoke language)" },
  { prefix: "sso_connections", s: "SSO connection", p: "SSO connections", idField: "connectionId", mutableFields: "identity provider metadata", count: 4, nearOf: "identity_ (login/access language)" },
  { prefix: "events_webhooks", s: "event webhook", p: "event webhooks", idField: "webhookId", requiredField: "eventType", mutableFields: "target URL and event filter", count: 6, nearOf: "integrations_ (webhook/delivery language)", nearNote: "A second, event-filtered webhook surface alongside integrations_list_subscriptions — the two are not interchangeable: this one fires per event type, not per subscription." },
  { prefix: "media_folders", s: "media folder", p: "media folders", idField: "folderId", mutableFields: "name and parent folder", count: 4, nearOf: "media_ (asset/upload language)" },
  { prefix: "media_transformations", s: "image transform preset", p: "image transform presets", idField: "presetId", mutableFields: "crop, resize, and format rules", count: 5, nearOf: "media_ (image/photo language)" },
  { prefix: "dashboards_widgets", s: "dashboard widget", p: "dashboard widgets", idField: "widgetId", mutableFields: "chart type and data source", count: 5, nearOf: "widgets_ (widget/region language)", nearNote: "An admin-dashboard chart widget, unrelated to the site-facing widgets_ sidebar/footer instances — same vocabulary, different surface." },
  { prefix: "page_builder_blocks", s: "page builder block", p: "page builder blocks", idField: "blockId", mutableFields: "layout and content", count: 6, nearOf: "widgets_ / content_post_ (block/embed language)" },
  { prefix: "snippets", s: "code snippet", p: "code snippets", idField: "snippetId", mutableFields: "code body and injection location", count: 4, nearOf: "theme_ (template/file/code language)" },
  { prefix: "search_config", s: "search index rule", p: "search index rules", idField: "ruleId", mutableFields: "boost weight and field mapping", count: 5, nearOf: "content_post_search (search/index language)" },
  { prefix: "localization_locales", s: "locale", p: "locales", idField: "localeCode", mutableFields: "default currency and date format", count: 5, nearOf: "settings_ (config/preference language)" },
  { prefix: "translations", s: "translation", p: "translations", idField: "translationId", requiredField: "locale", mutableFields: "translated body", count: 5, nearOf: "content_post_ (content/body language)" },
  { prefix: "segments", s: "audience segment", p: "audience segments", idField: "segmentId", mutableFields: "membership rule", count: 5, nearOf: "members_ / newsletter_ (audience/subscriber language)" },
  { prefix: "campaigns_social", s: "social post campaign", p: "social post campaigns", idField: "campaignId", mutableFields: "scheduled time and platforms", count: 5, nearOf: "newsletter_ (campaign language)" },
  { prefix: "short_links", s: "short link", p: "short links", idField: "linkId", requiredField: "destinationUrl", mutableFields: "destination URL", rejectCond: "the short code is already taken", count: 5, nearOf: "redirects_ (url/link language)" },
  { prefix: "product_reviews", s: "product review", p: "product reviews", idField: "reviewId", count: 5, nearOf: "comments_ (moderation/approve/spam/trash language)", nearNote: "Moderated the same way as comments_list_moderation_queue — pending/approved/spam/trashed — but for star-rated product feedback, not article comments." },
  { prefix: "customers", s: "customer", p: "customers", idField: "customerId", requiredField: "email", mutableFields: "billing address and marketing consent", count: 6, nearOf: "members_ / identity_user_ (account/disable language)" },
  { prefix: "plugin_marketplace", s: "marketplace listing", p: "marketplace listings", idField: "listingId", mutableFields: "pricing tier and category", count: 5, nearOf: "plugins_ (plugin/extension language)" },
  { prefix: "plugin_licenses", s: "plugin license", p: "plugin licenses", idField: "licenseId", requiredField: "pluginId", mutableFields: "seat count and renewal date", rejectCond: "the plugin is not installed in this workspace", count: 4, nearOf: "plugins_ (plugin/enable/disable language)" },
  { prefix: "extensions", s: "browser extension binding", p: "browser extension bindings", idField: "bindingId", count: 5, nearOf: "plugins_ (extension/installed language)" },
  { prefix: "plugin_settings_overrides", s: "plugin settings override", p: "plugin settings overrides", idField: "overrideId", requiredField: "pluginId", count: 4, nearOf: "plugins_ / settings_ (config language)" },
  { prefix: "webhook_signing_keys", s: "webhook signing key", p: "webhook signing keys", idField: "keyId", count: 3, nearOf: "integrations_ (webhook language)" },
  { prefix: "role_templates", s: "role template", p: "role templates", idField: "templateId", count: 4, nearOf: "identity_ (role language)" },
  { prefix: "session_management", s: "active session", p: "active sessions", idField: "sessionId", count: 4, nearOf: "identity_ / members_ (access/session language)" },
];

// Systematic count boost (not hand-retyped per domain): smaller domains get a bigger relative bump,
// mirroring how real small domains (workspace_: 2, plugins_: 2) stay small while active domains
// (identity_: 15, newsletter_: 14, widgets_: 12) accrete more tools over time. Deterministic.
function boostCount(domain: DomainSpec): DomainSpec {
  const bump = domain.count <= 4 ? 3 : domain.count <= 6 ? 2 : 1;
  return { ...domain, count: Math.min(12, domain.count + bump) };
}

interface GeneratedTool extends DistractorTool {
  readonly kind: string;
}

const VERB_SEQUENCE = ["list", "get", "create", "update", "delete", "toggle", "plan", "archive", "restore", "duplicate", "settingsGet", "settingsSet"] as const;

function idForKind(prefix: string, kind: string): string {
  switch (kind) {
    case "list":
      return `${prefix}_list`;
    case "get":
      return `${prefix}_get`;
    case "create":
      return `${prefix}_create`;
    case "update":
      return `${prefix}_update`;
    case "delete":
      return `${prefix}_delete`;
    case "toggle":
      return `${prefix}_set_status`;
    case "plan":
      return `${prefix}_preview`;
    case "archive":
      return `${prefix}_archive`;
    case "restore":
      return `${prefix}_restore`;
    case "duplicate":
      return `${prefix}_duplicate`;
    case "settingsGet":
      return `${prefix}_get_settings`;
    default:
      return `${prefix}_set_settings`;
  }
}

function toolsForDomain(domain: DomainSpec, category: DistractorCategory): GeneratedTool[] {
  const seq = VERB_SEQUENCE.slice(0, Math.max(0, domain.count - (domain.extra?.length ?? 0)));
  const tools: GeneratedTool[] = [];
  for (const kind of seq) {
    const id = idForKind(domain.prefix, kind);
    const rng = rngFor(id);
    let description: string;
    switch (kind) {
      case "list":
        description = describeList(rng, domain.s, domain.p, "status", `${domain.prefix}_get`, domain.nearNote);
        break;
      case "get":
        description = describeGet(rng, domain.s, domain.idField);
        break;
      case "create":
        description = describeCreate(rng, domain.s, domain.requiredField, domain.rejectCond);
        break;
      case "update":
        description = describeUpdate(rng, domain.s, domain.mutableFields ?? "editable fields", domain.immutableNote);
        break;
      case "delete":
        description = describeDelete(rng, domain.s);
        break;
      case "toggle":
        description = describeToggle(rng, domain.s, domain.states);
        break;
      case "plan":
        description = describePlan(rng, domain.s, "processing", "changed");
        break;
      case "archive":
        description = describeArchive(rng, domain.s);
        break;
      case "restore":
        description = describeRestore(rng, domain.s);
        break;
      case "duplicate":
        description = describeDuplicate(rng, domain.s);
        break;
      case "settingsGet":
        description = describeSettingsGet(rng, domain.prefix.replace(/_/g, " "), domain.mutableFields ?? "workspace preferences");
        break;
      default:
        description = describeSettingsSet(rng, domain.prefix.replace(/_/g, " "));
        break;
    }
    tools.push({ id, description, category, nearOf: domain.nearOf, kind });
  }
  for (const e of domain.extra ?? []) {
    tools.push({ id: e.id, description: e.desc(rngFor(e.id)), category, nearOf: domain.nearOf, kind: e.kind });
  }
  return tools;
}

function interleaveDomains(newDomains: readonly DomainSpec[], nearDomains: readonly DomainSpec[], ratio: number): ReadonlyArray<{ domain: DomainSpec; category: DistractorCategory }> {
  const out: Array<{ domain: DomainSpec; category: DistractorCategory }> = [];
  let ni = 0;
  let ri = 0;
  while (ni < newDomains.length || ri < nearDomains.length) {
    for (let k = 0; k < ratio && ni < newDomains.length; k++) out.push({ domain: newDomains[ni++]!, category: "new" });
    if (ri < nearDomains.length) out.push({ domain: nearDomains[ri++]!, category: "near" });
  }
  return out;
}

const ORDERED_DOMAINS = interleaveDomains(NEW_DOMAINS.map(boostCount), NEAR_DOMAINS.map(boostCount), 3);

const MASTER_GENERATED: readonly GeneratedTool[] = ORDERED_DOMAINS.flatMap(({ domain, category }) => toolsForDomain(domain, category));

/** Priority-ordered distractor list — one accretion timeline; catalog sizes are prefixes of this. */
export const MASTER_DISTRACTORS: readonly DistractorTool[] = MASTER_GENERATED.map(({ id, description, category, nearOf }) => ({ id, description, category, nearOf }));

/** doc2query for every distractor, templated (see module header for the calibration caveat). */
export const MASTER_DISTRACTOR_DOC2QUERY: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  ORDERED_DOMAINS.flatMap(({ domain }) => {
    const seq = VERB_SEQUENCE.slice(0, Math.max(0, domain.count - (domain.extra?.length ?? 0)));
    const entries: Array<[string, readonly string[]]> = seq.map((kind) => {
      const id = idForKind(domain.prefix, kind);
      const rng = rngFor(id, "::q");
      return [id, questionsFor(kind, domain.s, domain.p, domain.prefix.replace(/_/g, " "), rng)];
    });
    for (const e of domain.extra ?? []) {
      entries.push([e.id, questionsFor(e.kind, domain.s, domain.p, domain.prefix.replace(/_/g, " "), rngFor(e.id, "::q"))]);
    }
    return entries;
  }),
);

/** First `size - 131` distractors, in priority order. `size` must be >= 131. */
export function distractorsForSize(size: number): readonly DistractorTool[] {
  const need = Math.max(0, size - 131);
  if (need > MASTER_DISTRACTORS.length) {
    throw new Error(`distractorsForSize(${size}): need ${need} distractors, only ${MASTER_DISTRACTORS.length} generated`);
  }
  return MASTER_DISTRACTORS.slice(0, need);
}
