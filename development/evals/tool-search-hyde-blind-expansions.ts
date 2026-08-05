/**
 * @file BLIND HyDE query-expansion output — one hypothetical tool description per held-out query,
 * generated 2026-08-05 by a fresh subagent (Claude Sonnet 5, general-purpose) given ONLY the raw
 * query text plus a one-paragraph generic description of "a CMS admin backend." It never saw the
 * real tool catalog, the correct answer, or any eval file — mirroring how a real runtime HyDE call
 * would work (the model doing the expansion does not get to peek at the index it's about to search).
 * Scored by `tool-search-hyde-canary.eval.ts`.
 */
export const HYDE_EXPANSIONS: Readonly<Record<string, string>> = {
  "someone is spamming us in the replies under a post": "Marks one or more comments as spam, removing them from public view and adding them to the moderation queue for review. Optionally blocks the commenter's email or IP from posting further replies.",
  "the newsletter is about to go out and it's wrong": "Cancels or edits a scheduled newsletter campaign before it is sent to subscribers, allowing content changes or a full send abort. Returns the current send status of the campaign.",
  "people say the contact page does nothing": "Retrieves recent submissions and delivery status for a given form, and can send a test submission to verify the form's notification email and webhook are working end to end.",
  "I need to roll back, everything broke": "Restores the site to a previous backup or restore point, reverting content, settings, and configuration to the state captured at that snapshot. Lists available restore points with their timestamps.",
  "our logo file needs swapping out": "Uploads a new image asset to the media library and sets it as the active site logo in appearance settings, replacing the previous logo across the theme.",
  "a contractor finished, take away their account": "Deactivates or deletes a user account, immediately revoking their login access and all assigned role permissions.",
  "new hire needs to be able to edit posts": "Assigns a role or grants specific permissions to a user account, such as editor access allowing them to create and edit posts.",
  "we moved the pricing page and old bookmarks 404": "Creates a URL redirect from an old path to a new destination path, returning a 301 redirect so visitors and search engines land on the current page instead of a 404.",
  "is the external system actually receiving our events": "Lists recent webhook delivery attempts for an integration, including HTTP response status and payload, so you can confirm whether the receiving system successfully accepted the event.",
  "this draft is ready to go live": "Publishes a draft post or page, changing its status from draft to published and making it publicly visible immediately.",
  "google still shows the old title for this page": "Updates the SEO meta title and description for a page or post, controlling how the page appears in search engine results.",
  "group these articles under a topic": "Assigns one or more posts to a category or tag, grouping related articles together under a shared topic for navigation and archives.",
  "the footer needs a recent posts block": "Adds a widget to a footer widget area, such as a recent-posts list, and saves its configuration and position within that area.",
  "change the colours on the site": "Updates the active theme's color scheme, including primary, background, and accent colors, applying the new palette across the site.",
  "is anything wrong with the data store": "Runs a database health check, reporting connection status, table integrity, and any errors or warnings found in the underlying data store.",
  "customer can't get in, send them a way to log in": "Sends a password reset email to a member or user, providing them with a secure link to set a new password and regain account access.",
  "we rebranded, the title at the top is stale": "Updates the site title and tagline shown in the header and browser tab, replacing the previous branding text sitewide.",
  "that extension is causing trouble, switch it off": "Deactivates an installed plugin, disabling its functionality and hooks across the site without uninstalling it.",
  "how do I put an entry in the header bar": "Adds a new item to a navigation menu, such as the header menu, specifying its label, link target, and position among existing items.",
  "show everyone on our email list": "Lists all subscribers on the newsletter mailing list, including their email address, subscription status, and signup date.",
};
