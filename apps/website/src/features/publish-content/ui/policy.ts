/**
 * @file The Publish dialog's host policy — everything the neutral `@jini-ai/cms/publish/content/ui`
 * module (K5) refuses to know: this product's reason wording, row copy, entity-type aliases, query
 * limits and the `admin.publish_content` capability. `host-binding.ts` injects it.
 *
 * Moved verbatim from the former `report-rows.ts` / `criteria.ts` in this folder; each block keeps its
 * original why-comment.
 */
import type {
  PublishContentOutcomeRow,
  PublishNamedFileRewrite,
  PublishCriteriaLimits,
  PublishReasonPolicy,
  PublishReasonRewrite,
  PublishReportCopy,
  PublishReportPolicy,
} from "@jini-ai/cms/publish/content/ui";
import { PUBLISH_SECTIONS } from "./sections.js";

/**
 * Stand-in for a `skipped` row whose planner reason is `null`. A skip with a blank cell reads as a
 * rendering bug and leaves the operator with no way to act; a sentence that says the reason is
 * missing is at least honest about which of the two it is.
 */
const MISSING_REASON = "No reason recorded.";

/** The one reason prefix that is already final, operator-facing copy — `file-tree-policy.ts`'s
 *  {@link import("../file-tree-policy.js").wrapTreePolicyReason}. {@link friendlyPublishReason}
 *  must never rewrite it a second time. */
const ALREADY_FINAL_PREFIX = "Can't publish:";

/**
 * The closed set of reason strings `planner.ts` and its registered handlers (`post`, `media`,
 * `redirects`, `navigation`, `theme`, and the `repo-handler.ts` factory types) can currently produce
 * for a `skipped`, `forced` or `blocked` row, each
 * paired with the plain sentence a non-technical owner should read instead. Every raw string here is
 * quoted verbatim (minus the interpolated id/type) from where it is thrown, so this list is the
 * traceable map from "what the code says" to "what the dialog shows" — updating a handler's wording
 * means updating the matching pattern here, not guessing at a new regex blind.
 *
 * publish-content-copy-2026-09-25.md — every entry drops ids, "peer", "baseline" and "entity", and
 * names the available action ("tick Overwrite") only where the row that carries the reason actually
 * offers that control ({@link PublishReportRow.overwritable}).
 */
const REASON_REWRITES: readonly PublishReasonRewrite[] = [
  {
    pattern: /^no registered publish-content handler for entity type/,
    friendly: "This kind of content can't be published from here yet.",
  },
  {
    // Owner decision 2026-09-25: a push plans ON the live site, so "this instance"/"this destination"
    // in the raw text is LIVE — and the push driver uploads every required file before planning, so
    // a file still absent there is one this site could not send. The old "hasn't finished syncing
    // here yet" named the wrong side.
    pattern: /^required blob '.+' is not available/,
    friendly: "A file this item needs is missing on the live site, and couldn't be sent from here.",
  },
  // planner.ts's two conflict wordings (baseline recorded vs. none) — same cause to the operator
  // ("this destination row doesn't match what we agreed on last"), same action either way.
  {
    pattern: /has been edited on the destination since the last sync with this peer/,
    friendly: "Different version already on the live site. Tick Overwrite to replace it.",
  },
  {
    pattern: /no prior sync baseline for .+ with this peer — the destination already holds different content/,
    friendly: "Different version already on the live site. Tick Overwrite to replace it.",
  },
  {
    // `menu slug '...'` (navigation), bare `slug '...'` (post/media), and the factory's other
    // addresses (`name '...'` for taxonomy/term).
    pattern: /^(?:menu )?(?:slug|name|key) '.+' is already held by a different [\w-]+/,
    friendly: "Another item on the live site already uses this name.",
  },
  {
    // post.ts words it `<type> '<id>' is in the trash ...` — the type prefix is part of the real text,
    // and hyphenated for factory types (`collection-entry`, `content-type`).
    pattern: /^(?:[\w-]+ )?'.+' is in the trash at this destination/,
    friendly: "This item is in the trash on the live site. Restore it there before publishing.",
  },
  // Collections, entries, forms, taxonomies, terms, widgets (repo-handler.ts's factory types): the
  // `precheck-reasons.ts` builders, then each type's domain refusals that `errors.blocked` passes
  // through verbatim — quoted from `@jini-ai/cms` (content-types, entries, taxonomy) and
  // `features/{forms,widgets}` write paths.
  {
    // `tombstonedAtDestination("content-type", …)` — for a collection row AND for an entry whose
    // collection it is (`entries/publish-content.ts`'s validate), so the sentence fits both.
    pattern: /^(?:content-type '.+' is permanently removed at this destination|content type '.+' (?:is tombstoned|was permanently deleted)|ENTITY_TOMBSTONED: content type )/,
    friendly: "The collection was permanently deleted on the live site, so this can't be published.",
  },
  {
    pattern: /(?:is permanently removed at this destination|^ENTITY_TOMBSTONED: )/,
    friendly: "This item was permanently deleted on the live site, so it can't be published again.",
  },
  {
    pattern: /^ENTITY_IN_TRASH: /,
    friendly: "This item is in the trash on the live site. Restore it there before publishing.",
  },
  {
    pattern: /^[\w-]+ '.+' depends on [\w-]+ '.+', which is missing at this destination/,
    friendly: "This item uses something that isn't on the live site yet. Publish that too.",
  },
  {
    pattern: /^[\w-]+ '.+' changed on the destination during apply: /,
    friendly: "This item changed on the live site while publishing. Try again.",
  },
  {
    // Every authorize() refusal: entries/content types (`cannot …`), taxonomy (`is not authorized
    // for …`), widgets (`lacks permission …`).
    pattern: /^principal '.+' (?:cannot |is not authorized for |lacks permission )/,
    friendly: "The live site doesn't allow publishing this kind of content yet.",
  },
  {
    pattern: /^content type '.+' was not found in workspace/,
    friendly: "This entry's collection isn't on the live site yet. Publish the collection too.",
  },
  {
    pattern: /^content type '.+' is not active/,
    friendly: "This entry's collection is retired on the live site, so new entries can't be added to it.",
  },
  {
    pattern: /^content type '.+' already exists/,
    friendly: "This collection was just added on the live site. Try again.",
  },
  {
    pattern: /^fieldsJson failed schema validation: /,
    friendly: "This entry's fields don't match its collection on the live site. Publish the collection too.",
  },
  ...[
    /^(?:content-type key '.+' fails the identifier grammar gate|key '.+' is permanently reserved)/,
    /^field name '.+' (?:fails the identifier grammar gate|appears more than once)/,
    /^field '.+' has (?:kind '.+', not one of the closed field-kind enum|storage-only kind '.+' and cannot be queryable)/,
    /^content type '.+' (?:submits more than \d+ queryable fields|update submitted an empty fields array)/,
  ].map((pattern) => ({ pattern, friendly: "The live site can't accept this collection's fields. Update the live site, then try again." })),
  {
    // entries (`repo.sqlite.ts`, `trash-aware-memory-repo.ts`) and forms word a trashed slug holder alike.
    // (`trash-aware-memory-repo.ts` is now Jini's `TrashAwareInMemoryEntryRepo`, `@jini-ai/cms/entries`.)
    pattern: /^an? [\w-]+ with slug '.+' is in the Trash/,
    friendly: "An item in the live site's trash still uses this name. Restore or permanently delete it there first.",
  },
  {
    pattern: /^an? [\w-]+ with slug '.+' already exists/,
    friendly: "Another item on the live site already uses this name.",
  },
  {
    pattern: /^patch omits existing field id\(s\): /,
    friendly: "A field was removed from this form. The live site never removes form fields, so it can't be published over.",
  },
  {
    pattern: /^'.+' is not a valid email address$/,
    friendly: "A notification email on this form isn't a valid address.",
  },
  {
    pattern: /^slug '.+' is reserved$/,
    friendly: "This name is reserved on the live site. Rename it here first.",
  },
  {
    pattern: /^(?:notify\.\w+ must |name must be \d+-\d+ characters|slug must match |one or more field descriptors are invalid)/,
    friendly: "This form's settings aren't valid on the live site.",
  },
  {
    pattern: /^(?:widget '.+': widget type '.+' is not installed on the destination|widget type '.+' is not registered)/,
    friendly: "The live site doesn't have this kind of widget yet. Update the live site, then try again.",
  },
  {
    pattern: /^(?:widget '.+': its settings do not fit the destination's|config for widget type '.+' failed schema validation)/,
    friendly: "This widget's settings don't fit the live site's version of it. Update the live site, then try again.",
  },
  {
    pattern: /references widget '.+', which does not exist in workspace/,
    friendly: "This region uses a widget that isn't on the live site yet. Publish that widget too.",
  },
  {
    pattern: /references widget '.+', which is trashed/,
    friendly: "This region uses a widget that's in the trash on the live site. Restore it there first.",
  },
  {
    pattern: /^(?:widget instance '.+' was not found|widget_area '.+' was not found|region '.+' is not bound)/,
    friendly: "This item changed on the live site while publishing. Try again.",
  },
  {
    pattern: /^taxonomy '.+' is not hierarchical/,
    friendly: "This term has a parent, but its taxonomy on the live site doesn't allow nesting.",
  },
  {
    pattern: /^taxonomy '.+' was not found/,
    friendly: "This term's taxonomy isn't on the live site yet. Publish the taxonomy too.",
  },
  {
    pattern: /^parent term '.+' was not found/,
    friendly: "This term's parent isn't on the live site yet. Publish the parent too.",
  },
  {
    pattern: /^parent term '.+' belongs to taxonomy '.+', not /,
    friendly: "This term's parent belongs to a different taxonomy on the live site.",
  },
  {
    pattern: /would create a hierarchy cycle$/,
    friendly: "This term's parent would put it inside itself on the live site.",
  },
  {
    pattern: /^'.+' is a '.+' at this destination but a '.+' at the source/,
    friendly: "This item's type doesn't match the live site's version, so it can't be published over it.",
  },
  {
    pattern: /has no usable slug to check for a collision/,
    friendly: "This item has no name set, so it can't be checked against the live site.",
  },
  {
    // `\w+` (media/navigation's port name) and the factory's `notWired` (`<type> ports`).
    pattern: /cannot be prechecked — no .+ wired for this deps bag/,
    friendly: "Publishing isn't available for this item right now.",
  },
  {
    pattern: /has a malformed natural key/,
    friendly: "This item's data is incomplete and can't be published.",
  },
  {
    pattern: /is not a valid theme tree address/,
    friendly: "This theme's files aren't in a valid location.",
  },
  {
    pattern: /this site has no themes folder/,
    friendly: "This site doesn't have a themes folder set up.",
  },
  {
    pattern: /themes folder spans two disks/,
    friendly: "The site's themes folder isn't set up correctly.",
  },
  // Site settings and the active theme (`features/settings/publish-content.ts`,
  // `features/theme/active-theme-publish-content.ts`), then Jini's settings/presentation refusals.
  {
    pattern: /^site-setting '.+' is not one this site publishes/,
    friendly: "Only the site title and SEO basics can be published.",
  },
  {
    pattern: /^site-setting '.+' points at this computer/,
    friendly: "This image link only works on this computer. Pick an image from Media instead.",
  },
  {
    pattern: /^(?:active theme '.+' is not installed at this destination|theme '.+' is not supported)/,
    friendly: "This theme isn't on the live site yet. Publish the theme too.",
  },
  {
    pattern: /^presentation settings for workspace '.+' were not found/,
    friendly: "The live site isn't set up for themes yet. Update the live site, then try again.",
  },
  {
    pattern: /^(?:setting '.+' (?:was not found|has been tombstoned|does not allow scope)|secret:true definitions are not supported)/,
    friendly: "The live site doesn't have this setting yet. Update the live site, then try again.",
  },
  {
    pattern: /^value for '.+' (?:does not match the definition schema|must be \d+\.\.\d+ characters)/,
    friendly: "This setting's value isn't valid on the live site.",
  },
];

/** Matches `file-tree-policy.ts`'s generic `"<title> was not published: <detail>"` wrapping — every
 *  `checkTreeFiles` reason this module has no specific rewrite for yet (a path-shape or deny-list
 *  detail, all of which name a raw relative path). Kept last and generic on purpose: the title is
 *  real information ("Theme: static/basic") worth keeping, the raw path/segment detail after the
 *  colon is not. */
const GENERIC_TREE_WRAP_PATTERN = /^(.+) was not published: .+$/;

const TOO_LARGE = ({ name }: { name: string }, _optional = {}): string => `Can't publish: a file is too large (${name})`;
const LOOKS_SECRET = ({ name }: { name: string }, _optional = {}): string => `Can't publish: a file looks like it contains a key or password (${name})`;

const NAMED_FILE_REWRITES: readonly PublishNamedFileRewrite[] = [
  { pattern: /^.+ was not published: "(.+)" is \d+ bytes, larger than the \d+-byte per-file limit$/, friendly: TOO_LARGE },
  {
    pattern:
      /^.+ was not published: "(.+)" (?:looks like it holds a key \(.+\)|looks like an environment file|is a package-manager credential file|is an MCP server configuration file, which can hold secrets|looks like a private SSH key|has a '\.(?:pem|key|p12|pfx)' extension, which is never published)$/,
    friendly: LOOKS_SECRET,
  },
];

/** How much of an id to show when an entity has no human identifier at all. Eight hex characters is
 *  the git-short-sha convention and stays unique enough to tell two rows apart on one screen, which
 *  is the only job left for an id once the label column is doing the naming. */
const SHORT_ID_LENGTH = 8;

/** Terse, operator-facing, and specific about *why* — "Skipped" alone sends someone hunting. */
const LABEL_BY_OUTCOME: Readonly<Record<PublishContentOutcomeRow["outcome"], string>> = {
  created: "Will publish — new",
  applied: "Will publish — update",
  forced: "Will publish — overwrite",
  unchanged: "Already up to date",
  conflict: "Skipped",
  blocked: "Skipped",
};

const COMPLETED_LABEL_BY_OUTCOME: Readonly<Record<PublishContentOutcomeRow["outcome"], string>> = {
  created: "Published — new",
  applied: "Published — update",
  forced: "Published — overwrite",
  unchanged: "Already up to date",
  conflict: "Skipped",
  blocked: "Skipped",
};

/** The label for a row whose update trashes the item on live. */
const TRASH_ON_LIVE_LABEL = "Will trash on live";

/** The host's disposition copy, handed to the neutral row builder (K3). */
const REPORT_COPY: PublishReportCopy = {
  missingReason: MISSING_REASON,
  plannedLabelByOutcome: LABEL_BY_OUTCOME,
  completedLabelByOutcome: COMPLETED_LABEL_BY_OUTCOME,
  trashPlannedLabel: TRASH_ON_LIVE_LABEL,
  trashCompletedLabel: "Trashed on live",
  shortIdLength: SHORT_ID_LENGTH,
};

const REASON_POLICY: PublishReasonPolicy = {
  alreadyFinalPrefix: ALREADY_FINAL_PREFIX,
  rewrites: REASON_REWRITES,
  namedFileRewrites: NAMED_FILE_REWRITES,
  genericWrapPattern: GENERIC_TREE_WRAP_PATTERN,
  genericWrapFriendly: ({ title }: { title: string }, _optional: Record<string, never> = {}): string => `${title} can't be published — one of its files isn't allowed.`,
};

/**
 * The note a carried-along row shows, named by the types of the rows that use it: pages and/or
 * posts by name, any other mix (a widget region, an entry, ...) generically.
 *
 * @complexity O(k) in the referrer count.
 */
function usedByNote({ types }: { types: ReadonlySet<string> }, _optional: Record<string, never> = {}): string {
  if ([...types].some((type) => type !== "page" && type !== "post")) return "Used by items you're publishing";
  if (types.has("page") && types.has("post")) return "Used by these pages and posts";
  return types.has("post") ? "Used by these posts" : "Used by these pages";
}

/** Everything the neutral row builder reads from this product (K5). */
export const PUBLISH_REPORT_POLICY: PublishReportPolicy = {
  sections: PUBLISH_SECTIONS,
  reasons: REASON_POLICY,
  copy: REPORT_COPY,
  usedByNote,
};

/** The wording of `PublishPlanDriftError` — product copy the neutral re-plan code does not own. */
export const PUBLISH_PLAN_DRIFT_MESSAGE = "The live site changed while publishing was being planned. Check the list again.";

/**
 * The `types` aliases plan §2 documents: plurals for the two kinds that take one, and the two
 * spellings of "menu" nobody actually calls a menu. Anything else passes through unchanged and, if no
 * row has it, ends up in {@link CriteriaSelection.unknownTypes} rather than silently matching nothing.
 */
export const TYPE_ALIASES: Readonly<Record<string, string>> = {
  pages: "page",
  posts: "post",
  nav: "menu",
  navigation: "menu",
};

/**
 * The admin URL query param a `PublishCriteria` deep link travels under (`/admin/?publish=<encoded>`)
 * — owner decision, plan §5 D2's own follow-up: a chat with no admin tab open can't open the Publish
 * dialog itself, so it hands back a link that opens the admin with the dialog pre-filled instead. The
 * link only pre-fills a criteria-driven `requestPublish` call; nothing here can confirm or execute —
 * see this file's own header and plan §3.
 */
export const PUBLISH_CRITERIA_QUERY_PARAM = "publish";

/** {@link decodePublishCriteriaFromQuery}'s cap on the raw (still-encoded) query value's own length —
 *  comfortably under every browser's address-bar limit, and short-circuits a value built to make the
 *  decoder do a lot of work for nothing. */
const MAX_QUERY_LENGTH = 4000;
/** Cap on `types`/`items` array length once decoded — plan §2 never needs more than a handful of
 *  named things in one request. */
const MAX_LIST_LENGTH = 50;
/** Cap on one `types`/`items` entry's own length — a type name or a title, never a paragraph. */
const MAX_ENTRY_LENGTH = 200;


/** The caps handed to the neutral decoder. */
export const PUBLISH_CRITERIA_LIMITS: PublishCriteriaLimits = {
  maxQueryLength: MAX_QUERY_LENGTH,
  maxListLength: MAX_LIST_LENGTH,
  maxEntryLength: MAX_ENTRY_LENGTH,
};

/**
 * `PUBLISH_CONTENT_CAPABILITY` is shaped to match Jini's `CapabilityDef` (`@jini-ai/agentic`), but
 * this file deliberately does not import that type: `ui-stays-client-safe.boundary.test.ts`'s
 * reachability walk treats ANY bare package specifier reached from `index.ts` as an escape — type-only
 * or not, unlike its separate value-import check, it never looks at `edge.typeOnly`. Leaving this
 * constant untyped here costs nothing: every real caller (`frontend-control-capabilities.ts`, and
 * later `apps/admin/src/App.hooks.ts`'s WebMCP registration) assigns it into a `CapabilityDef`-typed slot **by
 * reference**, where TypeScript's ordinary structural assignability applies rather than the
 * excess-property checking a fresh object literal would get.
 *
 * The capability every caller shares: chat (plan §4 S3, relayed through the `admin.*` executors) and
 * Chrome's WebMCP agent (plan §4 S5, the same executor projected by Jini's `toWebMcpTool`). Its
 * executor may only call `requestPublish` — see plan §3 for why that is the entire gate that keeps
 * either caller from publishing anything itself: this capability has no `requiresConfirmation`
 * because the dialog IS the confirmation, and nothing reachable from it can call `confirmPublish` or
 * `executePublish`.
 */
export const PUBLISH_CONTENT_CAPABILITY = {
  id: "admin.publish_content",
  description:
    "Opens this site's Publish dialog with the things you name already chosen and tells you what it " +
    "would publish or overwrite. Use `types` for kinds of things (pages, posts, media, menus, redirects), " +
    "`items` for specific ones by title, and `overwrite: true` only when the person asked to replace " +
    "what's on the live site. It publishes nothing itself: the person confirms in the dialog. So it is " +
    "also how to see what is waiting to be published; call it with no arguments for everything.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      types: { type: "array", items: { type: "string" } },
      items: { type: "array", items: { type: "string" } },
      overwrite: { type: "boolean" },
    },
  },
  risk: "write",
  surface: "session",
} as const;

