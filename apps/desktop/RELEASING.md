# Releasing Tovu Desktop

This doc holds names only. It never holds a secret value or an ID — not a Key ID, not an
Issuer ID, not a password, not a base64 blob. If you're about to paste one in, stop and put
the name of where it lives instead.

## Notarization credentials ALREADY EXIST (since 2026-08-29), do not create new ones

The owner set these up once, for Tovu Runner, and the same credentials cover Tovu. Do not
generate a new App Store Connect API key, a new certificate, or a new app-specific password —
find the existing one first.

- **App Store Connect API key** (preferred): the `.p8` file lives at
  `~/.appstoreconnect/private_keys/AuthKey_<KeyID>.p8`. Its Key ID, Issuer ID, and Team ID are
  recorded in a comment block in `~/.bash_profile` — read them from there, never re-type or
  guess them.
- **App-specific password** (fallback, used with an Apple ID + Team ID instead of the API key):
  the env var `TOVU_NOTARY_APPLE_PASSWORD`.
- **Developer ID Application certificate** ("Leon Aburime"): already installed in the login
  keychain.
- **CI's copies**: the GitHub Actions environment named `desktop-release` holds five secrets —
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` —
  populated from the credentials above. If a build ships signed but NOT notarized, the fix is
  to check which of those five secrets failed to reach the job — electron-builder skips
  notarization silently when a credential is missing (`MacTargetHelper.js:264`). That result
  means a credential problem, **not** that notarization was never set up. Do not "solve" it by
  provisioning fresh credentials.
- The Developer ID Application certificate expires 2027-02-01; renew it and replace
  `CSC_LINK`/`CSC_KEY_PASSWORD` before then.

## How a release is cut

1. Bump the version in `apps/desktop/package.json`.
2. Push a tag shaped `desktop-vX.Y.Z` — or run the release workflow by hand from the Actions
   tab (Desktop Release → Run workflow).
3. Wait for three green builds (one per platform target).
4. Download the draft release's artifacts and smoke-test each one before publishing.
5. Publish the draft. The stable `releases/latest/download/<fixed name>` URLs only resolve to
   real files once a release is published — they 404 against a draft.
6. The fixed asset names, unchanged release to release:
   - `Tovu-mac-arm64.dmg`
   - `Tovu-mac-x64.dmg`
   - `Tovu-windows-x64-setup.exe`
   - `SHA256SUMS.txt` (one `<sha256>  <name>` line per installer above)
   - Auto-update files (the app reads these; nobody downloads them by hand):
     `Tovu-mac-arm64.zip`, `Tovu-mac-x64.zip` (+ `.blockmap` each), `latest-mac.yml`,
     `latest.yml`, `Tovu-windows-x64-setup.exe.blockmap`

## Auto-update

The app updates itself from this repo's GitHub releases (`electron-updater`; see
`src/auto-update-controller.ts` and `src/update-policy.ts`). It only ever sees the **latest
published** release, so:

- **Every release must be published** (step 5) or no installed copy will update to it.
- Publishing is the moment every running copy starts downloading it (within ~4h, or at next
  launch). Smoke-test the draft's installers first.
- Every release must carry all the auto-update files above. The workflow uploads them; a release
  put together by hand without `latest-mac.yml` / `latest.yml` stops every update.
- Only publish Tovu Desktop releases on this repo. The updater follows the repo's "latest" release,
  so a release of anything else marked latest would break the update check until the next desktop
  release.
- The Microsoft Store build never self-updates (the Store does it); dev launches never check.

With several copies of the app open, only the longest-running copy downloads, and the update
installs when the LAST copy quits (installing replaces the app files the others are running from).
"Restart to update" with other copies open says so instead of restarting.
7. Testers report problems as GitHub Issues on this repo. Point them at the exact asset name
   and version they installed.

## Corrupt-build warning

A build made while the working tree kept changing during packaging can produce a `.dmg` that is
signed, reports exit 0, and still contains a corrupt `app.asar`. This happened once — the
incident produced a local `release/DO-NOT-SHIP-CORRUPT.txt` marker and is written up in
`ADS-memory/reports/2026-09-12-packaging-asar-corruption.md`.

Never ship an artifact that `apps/desktop/scripts/verify-package.ts` did not pass. CI runs that
check twice: once against the unpacked build, and once against the contents extracted back out
of the shipped `.dmg`/`.exe`. Never ship an old local `release/*` file by hand, signed or not —
if `verify-package.ts` hasn't just passed against it, it isn't a candidate.

## Releases come from CI only

Nothing is packaged or uploaded by hand from a dev machine, and no vendor CLIs get installed on
the owner's machine to make that possible.
