# Tovu Desktop 0.1.14

## New

- One encrypted secrets vault per site. Copy keys from another project in Security settings.
- Cookie consent banner for every site (CCPA, GDPR).
- Themes support nested menu dropdowns. Post listings can load more with "See more".
- Edit post and Edit page share one layout with a cover image slot, an in-app URL dialog and a slug that follows the title.
- Forms support every field type end to end, with public styling.
- Media and Raw HTML widgets get their own editor, per-placement content and a preview.
- Locked script blocks in the Interactive page editor, with a jump to Edit HTML.
- The assistant can read past chats, fill more create, read, list and update gaps, spawn subagents and, if you opt in, delete permanently.
- Sites live in ~/Documents/Tovu. Create a website without a folder picker; sites created elsewhere appear. The app version shows in the nav.
- Change a user's username in the admin.

## Improved

- Site plugins ask the owner to confirm their first enable and any widened permissions. Every site has its own plugin store.
- Chat display settings sit in the dock gear menu. The AI assistant settings are redesigned, with cached CLI detection and Rescan.
- The visitor chat widget loads on first click, meets contrast guidelines and has accessibility and layout fixes.
- Saving unchanged content writes no revision, and asks first.
- Theme renders no longer time out. The side nav folds to a rail when the chat dock opens.
- Post authors, social images and cover images that fall back to the first body image.
- Switching between local sites needs no new sign-in.

## Fixed

- Opening sites migrated by newer development builds (0.1.13 refused them).
- Saving source-control credentials from chat; stored GitHub and GitLab usernames are kept.
- Custom credential lists are in label order again. Database transfer finds its destination on upgraded sites.
- Double-clicking Analyze sends one analysis. The post editor URL follows a changed slug.
- Chart axis labels, Secrets page entries and phone layouts for visitor AI steps.
- Vercel deploys upload each file once and target production.
- /admin and /api are refused as page or post addresses.
