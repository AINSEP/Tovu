# kUInetic

Optional, declarative browser animation library. Version **0.2.4** (MIT).
Source: https://github.com/AINSEP/kuinetic, local source repository
`/Users/la/Programming/kUInetic` (`package.json` version 0.2.4).
Copied from the newest existing built `demo/kuinetic.all.min.js` (2026-10-17, 513,276 bytes).
It is newer than `dist/kuinetic.all.min.js` (2026-09-30) and the prior theme copies.
The upstream standalone-build script uses the same self-contained build recipe for both outputs.
No build was run.
SHA-256: `4cc1de33492e8b399e5b790677a3418203a3520ac913f7af6e623a4019872993`.
The all-in-one bundle injects its own animation CSS and starts itself.

To remove or swap the animation library: delete this folder and the two tags marked
`kuinetic` in `render/partials/footer.html` and `render/partials/footer-minimal.html`;
`data-kui` attributes are then inert. Each page uses one footer variant.

Also remove the marked optional cloak stylesheet link from
these exact templates:

- `render/pages/404.html`
- `render/pages/about.html`
- `render/pages/changelog.html`
- `render/pages/docs.html`
- `render/pages/download.html`
- `render/pages/index.html`
- `render/pages/listing-default.html`
- `render/pages/pages-default.html`
- `render/pages/posts-default.html`
- `render/pages/posts-sidebar.html`
- `render/pages/pricing.html`
- `render/pages/signin.html`
- `render/pages/signup.html`

The cloak CSS was extracted from upstream 0.2.0's `kui.cloak` layer; `kui-cloak.js` is the
existing Tovu opt-in helper. Both are kept here with the runtime so deleting the folder
removes all animation-library support code. Stock pages load the stylesheet and the early helper in
`<head>` (it must run before the body paints); the helper releases the cloak after 3 s, and the
CSS releases it after 2 s, so content still appears if the shared footer runtime fails to load.

For a swap, place the replacement and its license in its own folder, update the marked
includes, and migrate `data-kui` attributes if the replacement uses a different API.
The theme-asset route serves this folder directly; no manifest or CSP origin update is needed.
Reset uses the matching folder under `content/themes/__original-themes__/`; update or remove
that copy too if the library should stay removed after Reset.
