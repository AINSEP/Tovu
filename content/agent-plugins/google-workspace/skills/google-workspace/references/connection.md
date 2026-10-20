# Connecting Google Workspace

## Signing in

- **Desktop app:** the consent page opens in the system browser (never inside Tovu). Google sends
  the person back to a one-time address on this computer (`127.0.0.1`), which closes right after.
- **Hosted site:** the consent page opens in a new tab and returns to this site.
- The consent screen says **Tovu**. The person should allow every permission listed; if they untick
  one, the connection is not saved and Tovu says which permission is missing.
- If the person cancels on Google's page, nothing is saved. Offer to try again only if they want to.

## Products

Each product (v1: Sheets) is turned on separately, and turning it on is a separate step from
granting its permissions. Sheets needs only `drive.file`, which the first sign-in already grants.

- Every product starts **off**. Until the person turns Sheets on in the Google Workspace panel,
  every Sheets tool answers `product-disabled` ("turn it on in the Google Workspace panel") and
  sends nothing to Google. Tell the person to enable Sheets there; you cannot turn it on from chat.
  Checking which account is connected (`account_info`) works while every product is off.
- Turning a product **off** stops its tools at once (even a call that is part way through stops
  before its next request to Google) and pauses its form deliveries: submissions stay saved in Tovu
  and are delivered after it is turned on again. It does **not** sign the account out or revoke
  anything at Google.
- On the **desktop app**, adding a product that needs a new permission means signing in again and
  approving the full list (installed apps cannot add permissions one at a time).
- On a **hosted site**, Google adds the new permission to the existing ones.

## Account actions

- **Reconnect** - sign in again with the same account. The connection, its spreadsheets and its
  form bindings stay as they are. Use it when Tovu says "Reconnect required".
- **Switch account** - sign in with a different Google account. Nothing changes until the person
  confirms; then they choose which spreadsheets and form bindings move to the new account. Jobs that
  were already queued keep the account they were created with.
- **Disconnect** - Tovu stops using the account at once, then asks Google to revoke its access.
  - If Google confirms, the saved sign-in is deleted.
  - If Google does not answer or refuses, Tovu shows **"Disconnected locally; Google revocation
    pending"**. Tovu no longer uses the account, keeps the switched-off sign-in only so it can retry,
    and the person can remove Tovu at https://myaccount.google.com/connections. Never tell the person
    revocation succeeded unless Tovu said "confirmed".

## Advanced: your own Google OAuth client

Self-hosted sites outside the known Tovu addresses will be able to use their own Google Cloud OAuth
client, entered through Tovu's secure credential form (never in chat). This is not available in this
build yet; do not ask the person for a client id or secret.
