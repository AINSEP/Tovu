---
name: google-workspace
description: Connect one Google account to Tovu with Google's own sign-in, then work with the Google Sheets the person picks or Tovu creates (the drive.file permission, never the whole Drive), and send form submissions to a spreadsheet. Explains connecting, products, the account actions (reconnect, switch, disconnect) and what each error means.
---

# Google Workspace

One sign-in covers every Google product this plugin ships. Version 1 ships **Google Sheets**.
Docs, Slides, Drive, Gmail and Calendar come later on the same sign-in.

Say it simply: "Connect Google Workspace, then choose or create a spreadsheet."

## What Tovu can and cannot see

- Tovu asks only for **`drive.file`**: the files the person picks with Google's file picker or that
  Tovu creates. It cannot browse or read the rest of their Drive.
- **A pasted spreadsheet link grants nothing.** If the person pastes a link, explain that they need
  to choose the file with the picker (or let Tovu create a new spreadsheet).
- Never ask for a password, a token, a client secret or an API key in chat, and never accept one.
  Sign-in always happens on Google's own page.

## Before working on a spreadsheet

1. The plugin ships **switched off**. Offer to turn it on (`plugins_set_enabled`, family
   `agent-plugin`, `pluginId: "google-workspace"`), or the person uses the Agent Plugins screen.
2. Connect: `agent_plugin_connect { pluginId: "google-workspace" }`. It shows a sign-in card; Google's
   consent page opens in the system browser. See [connection](references/connection.md).
3. Check who is signed in with `p_google_workspace__account_info { connectionRef }` and name that
   account before you change anything.

Load [connection](references/connection.md) for sign-in, products and account actions,
[sheets](references/sheets.md) before any spreadsheet work, [form delivery](references/form-delivery.md)
when the person wants form submissions in a sheet, and [troubleshooting](references/troubleshooting.md)
when a call fails.

## Errors

Every failure has a `code`, a plain `message`, `retryable`, `outcome` and a `nextAction`. Follow the
next action; do not retry on your own when `retryable` is false. When `outcome` is `"unknown"` (for
example `uncertain-outcome`), the change may already be in the spreadsheet: ask the person to look
before trying again. Never repeat an append, create or copy just because the answer was lost.

## Tabs, filters, formatting and raw batch updates

The Sheets reference also covers tab changes, sorting, filters and filter views, formatting, named
and protected ranges, developer metadata, raw batch updates (and which request kinds are allowed),
CSV export and opening a picked spreadsheet (`sheets_open_existing`). Errors `limit-exceeded`
(narrow the request), `unsupported-request` (use a listed request kind), `invalid-input` (fix the id,
range or option) and `wrong-file-type` (pick a spreadsheet) are raised by Tovu before anything is
sent to Google.
