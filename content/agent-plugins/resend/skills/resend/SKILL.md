---
name: resend
description: Send the site's email through Resend. Covers getting an API key, verifying the sending domain, saving the key where Tovu finds it, and what each send failure means in plain words.
---

# Send the site's email through Resend

## Scope

This plugin owns **sending the site's outbound email through Resend's hosted API**: sign-in links,
form notifications and newsletters. The adapter code ships inside this plugin; Tovu runs it only
because Tovu shipped it. When no Resend key is saved, Tovu falls back to an SMTP server if one is
saved, and otherwise sends nothing (mail is only logged).

## Set it up

1. **Get a key.** The person signs in at resend.com, opens **API Keys**, and creates a key with
   "Sending access". Never ask them to paste the key into chat.
2. **Verify the sending domain.** In Resend, **Domains**, add the domain the site sends from and add
   the DNS records Resend shows. Until the domain is verified, Resend only sends to the account's own
   address.
3. **Save the key in Tovu.** Admin, **Access Tokens**, "Add custom provider":
   - Label: exactly `Tovu Mail — Resend API`
   - Category: `ops`
   - Base URL: `https://api.resend.com`
   - Token: the Resend API key
4. **No restart needed** when no mail was going out yet: Tovu picks the key up on the next email it
   sends. If mail was already going out through a saved SMTP server, restart Tovu to switch to Resend.

## What a failure means

- `validation_error`: a bad address or an unverified sending domain. Fix the address or verify the domain.
- `missing_api_key`, `invalid_api_key`, `restricted_api_key`: the saved key is wrong or lacks sending
  access. Create a new key and replace the saved one.
- `rate_limit_exceeded`, HTTP 5xx, `TRANSPORT_ERROR`: temporary. Tovu retries these.
