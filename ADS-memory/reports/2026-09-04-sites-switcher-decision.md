# Decision record — admin "Sites" switcher, capability-flag framing

**Date:** 2026-09-04
**Branch:** `restructure/apps-website-phased`
**Status:** DECIDED (framing + mechanism) — backend slice in flight

## Question put to the owner

The 2026-09-04 site-overhaul handoff (`continuity/2026-09-04-tovu-dev-site-overhaul-handoff.md`,
item 2) raised two things about the requested admin left-nav "Sites" item:

1. It cannot be a nav link as described.
2. The owner had asked whether a flag should hide it on Tovu-Runner; the prior session argued for
   inverting that into a general capability flag, and flagged the recommendation as NOT yet agreed.

## Decision

**Owner chose the general capability flag.** One flag meaning "this deployment can switch sites":

| Deployment | Flag | Why |
|---|---|---|
| Tovu-Runner | OFF | Already supervises processes and switches sites natively; two UIs would be redundant. |
| Local dev | ON | The developer case this was asked for — avoids needing the desktop app. |
| Hosted multi-tenant | OFF | **Workspaces** already exist and are the correct axis there. |

Rejected: a Runner-specific hide flag. It encodes one deployment's name into the admin UI, where a
capability statement is both more general and more reversible. Consistent with the owner's standing
"modular + reversible, data over code" constraint.

## Mechanism — DECIDED 2026-09-04 (superseding the open question below)

Owner placed **Sites under "Overview"** in the admin left nav, to create new sites and activate one
to switch themes, pages, posts and databases.

Owner was told again that this cannot be an in-process swap and chose the design anyway:

- **Activate = persist the choice + instruct a manual restart.** No process is killed, signalled, or
  re-exec'd by the admin API. (Auto-restart via the `dev.mjs` supervisor was offered and declined for
  the first slice; it remains available later behind the capability flag.)
- **First slice = List + Create + Activate.** List and Create touch no boot binding at all — they are
  filesystem + seed work — so the risky seam stays confined to Activate alone.
- **Create seeds through the same path `tovu init` uses, and that shared path now also seeds a `/`
  page.** This merges the separately-queued "tovu init should seed a `/` page" item. Rationale: a site
  created in the admin and one created by the CLI must be identical, and neither should land on the
  stock theme's fictional "Basic" marketing demo — the exact trap that started this overhaul.

Open risk carried into implementation: `reference_daemon_inherits_cwd_not_site_dir` — the daemon
resolves the site from cwd, so a persisted active-site choice it ignores would let a user activate
site B while the daemon keeps writing to site A. The backend dispatch was told to investigate this
explicitly and report rather than ship a silent footgun.

---

## Superseded — the fork as it stood before the owner ruled

## What this decision does NOT settle

The mechanism is still open, and is the harder half. `siteDir()`
(`apps/website/src/server/runtime/composition/deps.ts:199`) resolves from `TOVU_SITE_DIR`/`TOVU_SITE`
**at boot**, and content.db, uploads, and themes all bind off it at the composition root. A running
server cannot swap its own database out from under itself. Two honest options remain unchosen:

- **Activate writes the choice and triggers a restart.** A supervisor UI, not a router. Adequate for
  a developer running locally.
- **Make site a per-request dimension.** Correct long-term; touches every port. A project, not a screen.

Read `reference_daemon_inherits_cwd_not_site_dir` before designing either — the daemon resolves the
site from cwd and can open the WRONG site's DB.

## Sequencing

No longer parked — backend slice dispatched 2026-09-04. Item 1 (robots.txt absolute `Sitemap:`) is in flight;
item 4 (`.post-detail-header` baked into the marker type) must precede any landing copy.
