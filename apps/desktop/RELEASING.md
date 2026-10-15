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
   tab (Desktop Release → Run workflow). A desktop release never deploys the site: pushing
   `main` runs `fly-deploy.yml` and deploys tovu.dev, so push `main` first only when a site
   deploy is also authorized. Otherwise push only the tag; the draft step omits `--target` for
   an existing tag (d69e7eed4). If it still 403s ("Resource not accessible by integration"),
   create the draft locally with `gh release create --draft` from the run's artifacts,
   only after the local packaged-chat gate below passes.
3. Wait for three green builds (one per platform target).
4. Download the draft release's artifacts and smoke-test each one before publishing.
   Run the desktop journeys against the downloaded packaged app from the repo root:
   `TOVU_E2E_DESKTOP_APP="/path/to/Tovu.app" npm run e2e:desktop:app`.
   The harness uses fresh user data and sites and logs the app path/version. Run on each
   target machine; do not substitute the development build (`npm run e2e:desktop`).
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

## mac-x64 built without a stapled ticket (CloudKit warning)

From 2026-10-12 the `macos-15-intel` runners mostly cannot reach `api.apple-cloudkit.com`
(actions/runner-images#14924), where `stapler` fetches the notarization ticket. On the mac-x64 row
only, a staple/validate that failed solely with that network drop (`NSURLErrorDomain Code=-1005`)
is a warning, and the artifact carries `stapler-cloudkit-degraded-x64.txt` naming what was
skipped. Notarization itself is still mandatory: the dmg needs notarytool's `"status": "Accepted"`,
the .app needs electron-builder's `notarization successful`. Stapling only embeds the ticket for
offline first launches, needs no credentials, and is the one change allowed to a CI artifact here.
Before the draft, on any Mac, in the downloaded artifacts folder:

    xcrun stapler staple Tovu-mac-x64.dmg && xcrun stapler validate Tovu-mac-x64.dmg
    spctl -a -vv -t open --context context:primary-signature Tovu-mac-x64.dmg   # source=Notarized Developer ID
    shasum -a 256 Tovu-mac-x64.dmg > Tovu-mac-x64.dmg.sha256
    cat Tovu-mac-arm64.dmg.sha256 Tovu-mac-x64.dmg.sha256 Tovu-windows-x64-setup.exe.sha256 > SHA256SUMS.txt

Only the dmg's bytes change. Leave `Tovu-mac-x64.zip` alone even if its .app is unstapled: it is
notarized, the updater installs it without quarantine (no Gatekeeper ticket check), and
`latest-mac.yml` pins the zip's sha512, so re-zipping would mean regenerating that and the blockmap.

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

## Local release-chain smoke, before the draft

After the local package and notarization steps, run the native/import and bridge handshake
smokes (Layers 1 and 2), then this Layer 3 gate on the owner's Mac with its logged-in Claude CLI:

```sh
cd apps/desktop
npm run smoke:packaged-chat -- --platform-dir release/mac-arm64
```

Choose the unpacked `mac*` directory for this machine's CPU (`release/mac` for the x64 layout).
The script takes `ADS-memory/.local-artifacts/test-lock` itself; do not wrap it in another lock.
It initializes a temporary site with the shipped CLI, launches the packaged server, redeems its
boot token, and sends one real `/api/runs` chat request using Haiku from the live Claude picker.
The server uses the shell's free-port allocator because the shipped CLI rejects `--port 0`.
This costs one model-backed run. It verifies jini connected in the init frame, a successful
delegated `site_guide` overview call, a `succeeded` durable run, the exact `DONE` reply, and
`jini bridge preflight ok` in the site's daemon log. The SQL joins
`assistant_run_attempts.attempt_base_json` (recovery baseline) with `ai_chat_messages.events_json`
and `run_status` (this attempt's live projection); a first attempt's baseline is empty.

The gate stops the server group and detached daemon/CLI descendants, verifies exit, removes the
temporary site, and releases the lock, including on failure or Ctrl-C. It prints no credentials or
transcript. Any nonzero exit blocks draft creation: **fail = no draft**. In the autonomous local
release chain, this is the `smoke` step after package/notarize and before the draft-publish stop.
Keep it local; CI runners have no logged-in Claude. This does not replace the artifact journeys
or either earlier smoke layer.

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
