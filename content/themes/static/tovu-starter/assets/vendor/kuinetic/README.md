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

For a swap, place the replacement and its license in its own folder, update the marked
includes, and migrate `data-kui` attributes if the replacement uses a different API.
The theme-asset route serves this folder directly; no manifest or CSP origin update is needed.
Reset uses the matching folder under `content/themes/__original-themes__/`; update or remove
that copy too if the library should stay removed after Reset.
