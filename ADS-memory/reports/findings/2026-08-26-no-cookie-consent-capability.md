# Tovu ships analytics with no cookie-consent capability

**Severity:** High (legal exposure)
**Found:** 2026-08-24, via live agent chat testing (agent searched for a cookie-consent capability twice and found nothing)
**Status:** Open — needs product decision, not a code fix

## Problem

Tovu ships built-in analytics but has no cookie-consent banner/mechanism at all — nothing to
show a consent prompt, record a visitor's choice, or gate analytics/tracking scripts behind
that choice. A site built on Tovu and launched in the EU (or California, under CPRA) as-is has
no way to comply with cookie-consent requirements through the product itself.

## Why this needs a decision, not just a fix

This is a real feature gap, not a bug: building it means designing a consent-banner UI, a
storage mechanism for the visitor's choice, and gating points in the analytics/embed pipeline
that respect it. That's a scoped feature, likely connected to the compliance-audit workstream
(see `project_capability_debate_build_plan` memory / the 2026-08-26 swarm-consensus report) —
the compliance-audit *tool* can DETECT this gap, but building the actual consent mechanism
is separate, larger product work.

## Suggested next step

Scope as its own feature spec once the compliance-audit tooling (site-info tool + compliance
plugin) lands — the compliance audit itself will be able to flag "no cookie consent" on any
site that has this gap, which is useful even before the feature to fix it exists.
