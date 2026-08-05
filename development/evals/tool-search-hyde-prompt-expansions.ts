/**
 * @file Blind caller-simulator output for the PROMPT-CHANGE form of HyDE — the configuration where the
 * expansion costs nothing because the model that already composes the `search_tools` query writes a
 * descriptive phrase instead of a keyword bag.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `tool-search-hyde-blind-expansions.ts`: that one measured HyDE
 * as a DEDICATED expansion step — a subagent prompted in isolation to expand 20 queries, which is what
 * made the canary report label HyDE "1 LLM call PER search, every turn, forever". That cost label is an
 * artifact of the simulation, not of this architecture: `search_tools` has exactly two callers
 * (`byok-tool-surface.ts`'s `META_TOOL_DESCRIPTORS` for the BYOK provider model, and
 * `agent-daemon-server.ts`'s MCP backing for the spawned CLI) and BOTH are already an LLM composing
 * the query string. So the expansion is free — it is a change to the instruction those callers read.
 * Both instructions previously said "keyword"; see the git diff on those two files.
 *
 * PROVENANCE — the blindness that makes these numbers trustworthy:
 * Generated 2026-08-05 by a fresh subagent (`claude-sonnet-5`) given ONLY (a) the new `query` parameter
 * description verbatim, as shipped in `byok-tool-surface.ts`, and (b) the 20 raw operator phrasings
 * inline in its prompt. It was forbidden from using ANY tool and from opening ANY file, and confirmed in
 * its reply that it used none and opened none. It therefore never saw `HELD_OUT_CASES`' expected tool
 * ids, `tool-search-keywords.ts`, `tool-catalog-query.ts`, the tool catalog, or any eval file.
 *
 * This enforces the session's methodology rule the hard way — by information architecture, not by
 * instruction: an agent that has seen a held-out set cannot afterwards author anything scored against
 * it, regardless of care or intent. That rule exists because an earlier canary scored 90%, audited
 * itself, found 12-15 of its 20 "synthetic" questions were near-verbatim lifts of held-out query text,
 * and the honest blind re-run scored 20% — the opposite conclusion.
 *
 * KNOWN LIMITATION, do not lose this when reading the numbers: a focused subagent whose only task is
 * writing queries complies with the new instruction more readily than a real model mid-conversation
 * juggling other objectives. These queries therefore measure the CEILING of prompt compliance, not
 * production compliance. That still makes the result decisive in one direction — if retrieval does not
 * improve even at ceiling compliance, the idea is dead. It does not license claiming the production
 * number.
 */

/** Operator's raw phrasing (verbatim `HELD_OUT_CASES` query) -> the `query` the simulated caller emitted. */
export const HYDE_PROMPT_EXPANSIONS: Readonly<Record<string, string>> = {
  "someone is spamming us in the replies under a post":
    "moderate and delete spam or abusive comments and replies on a post",
  "the newsletter is about to go out and it's wrong":
    "cancel or edit a scheduled email newsletter campaign before it sends",
  "people say the contact page does nothing":
    "test or troubleshoot contact form submission and message delivery",
  "I need to roll back, everything broke":
    "restore or revert site content and database to a previous backup or version",
  "our logo file needs swapping out":
    "replace or upload a new site logo image in the media library",
  "a contractor finished, take away their account":
    "revoke or deactivate a user account's access and permissions, remove member",
  "new hire needs to be able to edit posts":
    "grant or assign a content editor role and permissions to a user for posts",
  "we moved the pricing page and old bookmarks 404":
    "create a URL redirect from an old page path to a new page path",
  "is the external system actually receiving our events":
    "check integration or webhook delivery status and event logs to an external system",
  "this draft is ready to go live": "publish a draft post or page to make it live",
  "google still shows the old title for this page":
    "update page SEO metadata title and description for search engines",
  "group these articles under a topic":
    "assign posts to a category or tag taxonomy for grouping articles",
  "the footer needs a recent posts block":
    "add a recent posts widget to a site area such as the footer",
  "change the colours on the site": "update site theme and appearance color scheme settings",
  "is anything wrong with the data store": "check database health status and diagnostics",
  "customer can't get in, send them a way to log in":
    "send a password reset link to a user account",
  "we rebranded, the title at the top is stale":
    "update site title and branding name shown in header settings",
  "that extension is causing trouble, switch it off":
    "disable or deactivate a plugin or integration extension",
  "how do I put an entry in the header bar": "add a menu item to the site navigation menu",
  "show everyone on our email list": "retrieve or list all subscribers on the mailing list",
};
