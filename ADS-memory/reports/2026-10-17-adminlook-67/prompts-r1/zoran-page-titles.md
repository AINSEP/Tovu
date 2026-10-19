# Task: zoran theme page titles say "Zoran Creative Strategy", not "Tovu"

Theme dir (outside the Tovu repo, writable for you): /Users/la/Documents/Tovu/zoran/themes/static/zoran-upside-down-city/render/pages/

The owner's site "zoran" was built from a copied theme. Five pages still end their <title> in "— Tovu":
- pricing.html: `<title>Pricing — Tovu</title>`
- signin.html: `<title>Sign in — Tovu</title>`
- signup.html: `<title>Get started — Tovu</title>`
- download.html: `<title>Download — Tovu</title>`
- docs.html: `<title>Documentation — Tovu</title>`

Already fixed the same way (follow this exact pattern): about.html `<title>About — Zoran Creative Strategy</title>`, changelog.html `<title>Changelog — Zoran Creative Strategy</title>`, 404.html `<title>Page not found — Zoran Creative Strategy</title>`.

Do: in each of the five files, replace only the trailing "— Tovu" in the <title> element with "— Zoran Creative Strategy". Keep the page label before the dash unchanged. Touch nothing else (no body copy, no other files, no files in the Tovu repo).

Rules: do NOT run tests, typecheck or builds; do NOT commit (this dir is not a git repo anyway); smallest change; never delete comments.
Report: `CHANGED FILES:` (absolute paths, with the new <title> of each) and `NOT DONE:`.
