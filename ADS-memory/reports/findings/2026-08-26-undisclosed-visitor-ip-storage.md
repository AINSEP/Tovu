# 9 live forms and comments store visitor IPs, undisclosed in the policy

**Severity:** Medium-High (undisclosed data collection — a privacy-policy accuracy gap)
**Found:** 2026-08-24, via live agent chat testing
**Status:** Open — needs a product decision, not a code fix

## Problem

9 live forms and the comments feature store visitor IP addresses, and the site's own Privacy
Policy does not mention this anywhere. Even once the policy's template placeholders (see the
companion finding, `2026-08-26-policy-pages-template-placeholders.md`) are filled in with real
company details, the policy would still be inaccurate unless this is addressed — either the
behavior or the disclosure has to change.

## Why this needs a decision, not just a fix

Two genuinely different fixes, and which one is right is a product call:
1. **Disclose it** — add a line to the privacy policy stating IPs are collected via forms/comments
   and why (spam prevention, abuse detection, etc. — whatever the real reason is).
2. **Stop storing it** — if there's no real need for it, stop collecting/storing visitor IPs
   on forms and comments, which removes the disclosure obligation entirely.

Picking blindly (e.g. auto-adding a disclosure line without knowing if the IP storage is even
needed) risks disclosing a practice that should have just been removed instead.

## Suggested next step

Ask the owner which forms/comments IP storage is actually for, and whether it's still needed —
then either add the disclosure or remove the storage, not both by default.
