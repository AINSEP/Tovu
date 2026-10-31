# kUInetic

Optional, declarative browser animation library. Version **0.2.4** (MIT).
Source: https://github.com/AINSEP/kuinetic, local source repository
`/Users/la/Programming/kUInetic` (`package.json` version 0.2.4).
Copied from its newest existing built `demo/kuinetic.all.min.js` (2026-10-17, 513,276 bytes),
newer than `dist/kuinetic.all.min.js` (2026-09-30) and the prior theme copies.
The upstream standalone-build script uses the same self-contained build recipe for both outputs.
No build was run.
SHA-256: `4cc1de33492e8b399e5b790677a3418203a3520ac913f7af6e623a4019872993`.
The all-in-one bundle injects its own CSS and starts itself; this theme uses no cloak.

To remove or swap the animation library: delete this folder and the script lines marked
`<!-- kuinetic: remove these lines to drop the library -->` at the end of every
`render/pages/*.liquid` template; `data-kui` attributes are then inert.
No separate stylesheet or cloak helper is used.

For a swap, put the replacement and its license in its own folder and update those scripts.
The theme-asset route serves this folder directly; no manifest or CSP origin update is needed.
Reset uses the matching folder and page templates under `content/themes/__original-themes__/`;
update or remove those scripts too to keep the library removed after Reset.
