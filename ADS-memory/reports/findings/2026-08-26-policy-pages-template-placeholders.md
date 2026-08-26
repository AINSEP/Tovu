# Live Privacy Policy and Terms pages still contain template placeholders

**Severity:** High (legal exposure — a published policy that isn't actually filled in)
**Found:** 2026-08-24, via live agent chat testing
**Status:** Open — needs real company info from the owner, not a code fix

## Problem

The live, published Privacy Policy and Terms pages on the test site still contain unfilled
template placeholders — e.g. `[Company Name]`, `[privacy email]` — including at least one
section whose own placeholder text says something like "do not publish this section unedited
if you use any tracking," which is itself still unedited.

## Why this needs real info, not a code fix

This is content, not code. Filling it in correctly requires the actual company name, contact
email, and a real answer to whether the site uses tracking (which determines whether that one
flagged section should even stay in). An AI should not invent plausible-sounding company/legal
details to paper over this — that would just replace one bad placeholder with a different kind
of wrong content in a legal document.

## Suggested next step

Get the real values (company name, privacy contact email, tracking yes/no) from the owner, then
either edit the live pages directly or — better — fix whatever theme/template seed process
produced these pages so a new site doesn't launch with unfilled legal placeholders by default.
