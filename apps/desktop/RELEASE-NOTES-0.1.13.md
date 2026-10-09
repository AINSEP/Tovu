# Tovu Desktop 0.1.13

## New

- Send a follow-up while the assistant is working to steer its current task.
- Install site and agent plugins by dropping a ZIP into chat. Use Replace to upgrade an agent plugin.
- Write your own menu HTML, or keep using the menu item editor.
- Recover unsaved page and post text after signing back in when your session expires.
- Save a theme's current files as its original, then reset individual files later. Move unused themes to Trash and restore them with their originals.
- Sites cards show local site previews. Recent errors groups repeated errors, with expandable details and a Copy button.

## Improved

- Faster typing in long assistant conversations and fewer approval prompts for reversible edits. The assistant can handle bulk changes together.
- AI agent settings have their own tab. Local CLI agents show the actual model in use, clearer sign-in warnings and useful failure details.
- Theme previews and desktop site views refresh after a theme save. A reload button lets you refresh previews manually.
- Theme cards show each theme's own appearance, with a switch to turn it on or off. Theme editing warns about navigation links that bypass Menus.
- Simpler website creation. New sites start with Tovu Starter, using the name you entered.
- Navigate desktop site tabs with arrow keys. Overflow arrows keep the active tab in reach.
- Better phone layouts, larger tap targets, clearer labels and support for right-to-left languages. Settings can wrap tabs or hide the floating chat button.
- Clearer dialogs for media, widgets, collections, forms, sitemaps and publishing.
- Owner and administrator accounts have stronger protections against removal, disabling and password resets.
- Pasted secrets are hidden in chat and routed to credential forms. Saved tokens keep their exact text and reveal only their ending and length.
- Smaller self-hosted server packages. Browser-based tools require browser support to be enabled.

## Fixed

- Repeating a static export updates its files and preserves your extra files when Overwrite is unchecked.
- Assistant links open in a new tab. Switching models no longer causes endless redraws, and double-clicking Send no longer stops the task.
- Reconnecting chat no longer reports a false “Not logged in” error when a tool mentions authentication.
- Deployment details and chat attachments belong to the site actually running.
- Themes created, edited or trashed by the assistant appear without a manual rescan. Liquid theme previews render correctly again.
- A page assigned to the home address takes priority over the theme's fallback. Trashed content no longer blocks an address for new content, and replaced items remain restorable.
- Widgets embedded in page content render on the public site. Heading links stay unique, and forms reject invalid email addresses.
- Cancelling a folder picker no longer shows an error. Duplicate site names get a numbered name, closing a tab selects its neighbour, and failed deletions keep the site visible with an error.
- Site previews survive restarts. Long names wrap, menus close with Escape, and site errors are easier to read.
- Corrected the striped macOS app icon, missing theme previews, blue default buttons, repeated sidebar site names and controls hidden behind chat on small screens.
- Double-clicking Upload stores one file. Dates show your local time, and long theme headings wrap on phones.
- Stronger sign-in, cookie and credential handling, safer plugin uploads, and secret masking that preserves ordinary identifiers.
- Comment IP protection is unique to each installation; older IP records no longer match new ones. Self-hosted sites warn about missing production safety settings.
