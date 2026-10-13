# Tovu Desktop 0.1.15

## New

- One sites home: ~/Documents/Tovu. On launch, sites in ~/Documents/Tovu/sites move back up automatically; running or locked sites stay listed and move on a later launch. The "Move into sites/" buttons are gone.
- Assistant charts render through a reviewed Recharts chart plugin bundled with every site.
- Media page has Upload image and Import from URL buttons.
- The root page opens at a readable /admin/pages/home address.
- The assistant can read a skill's supporting files. Fly.io, Render, Railway, Vercel, Netlify, Cloudflare Pages, GitHub Pages and S3-compatible storage are now separate bundled plugins.

## Improved

- Theme pages render faster and load only rendering code.
- Stopping a site or quitting the app closes its databases and assistant cleanly.
- Phone and tablet admin layouts: editor back arrow, expand controls, forms builder field rows, site-key badges, toolbars, skill-chip tray.
- Long chart bar labels stay readable.
- Updated Jini packages.

## Fixed

- Page HTML renders unmodified again, including inline SVG icons and carousel scripts.
- Keyboard navigation after opening the gear menu with a mouse. A page's URL follows a slug rename.
- Visitor chat suggestion pills have a visible border.
- A site left with an unclean stop can still be moved.
