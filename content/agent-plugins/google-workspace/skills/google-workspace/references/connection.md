# Connecting Google Workspace

## Signing in

- **Desktop app:** the consent page opens in the system browser (never inside Tovu). Google sends
  the person back to a one-time address on this computer (`127.0.0.1`), which closes right after.
- **Hosted site:** the consent page opens in a new tab and returns to this site.
- The consent screen says **Tovu**. The person should allow every permission listed; if they untick
  one, the connection is not saved and Tovu says which permission is missing.
- If the person cancels on Google's page, nothing is saved. Offer to try again only if they want to.
- `agent_plugin_connect` answers `{ status, connectionRef }`. `connectionRef` is an opaque reference
  to this connection (not a password or token). Every tool takes it as `connectionRef`; it does not
  change on reconnect or account switch. If you lost it, call `agent_plugin_connect` again: when
  already connected it answers at once without a new sign-in.

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

## Where the person does it

The plugin's admin page (Agent Plugins → Google Workspace) has three tabs:

- **Google Workspace** - connect, reconnect, switch account, disconnect, and turn each product on or
  off ("Grant permission" appears when a product is on but Google has not granted it yet).
- **Choose spreadsheet** - Google's file picker. Choosing a spreadsheet there is what lets Tovu open
  it; the chosen spreadsheets are listed with their ids, which you can use in chat.
- **Form destinations** - which form sends its submissions to which spreadsheet tab.

The panels cannot open links themselves: when a sign-in starts, the admin page shows a
**Continue to sign-in** button above the panel (on the desktop app it opens the system browser).

## Account actions

- **Reconnect** - sign in again with the same account. The connection, its spreadsheets and its
  form bindings stay as they are. Use it when Tovu says "Reconnect required".
- **Switch account** - sign in with a different Google account. The panel shows the new account and
  nothing changes until the person confirms it (or keeps the current one). The panel cannot list
  Tovu's form bindings, so after the switch the person reviews each form in the **Form destinations**
  tab: a spreadsheet chosen with the old account is marked, and they choose it again if the new
  account cannot open it. Jobs that were already queued keep the account they were created with.
- **Disconnect** - Tovu stops using the account at once, then asks Google to revoke its access.
  - If Google confirms, the saved sign-in is deleted.
  - If Google does not answer or refuses, Tovu shows **"Disconnected locally; Google revocation
    pending"**. Tovu no longer uses the account, keeps the switched-off sign-in only so it can retry,
    and the person can remove Tovu at https://myaccount.google.com/connections (the panel's **Open
    Google Account page** button opens it). Never tell the person
    revocation succeeded unless Tovu said "confirmed".

## Advanced: your own Google OAuth client

Self-hosted sites outside the known Tovu addresses will be able to use their own Google Cloud OAuth
client, entered through Tovu's secure credential form (never in chat). This is not available in this
build yet; do not ask the person for a client id or secret.
