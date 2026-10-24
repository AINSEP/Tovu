# WordPress guidance package

Scope: the Coordinator's 2026-10-23 REVIEW, “Mode A build”, overrides the earlier
plan. This package supplies instructions and references only. Direct HTML upload,
credentials, OAuth, deploy-target contributions and mode B remain on hold.

## Reuse and discovery

- Shape follows the bundled `site-import` and `site-compliance` skills-only plugins.
- Hosting plugins own connection cards, previews, confirmation, export and publish
  history. Domain attachment stays in the chosen host's console. Existing DNS,
  TLS and public-page tools supply verification. No new behavior owner or Jini
  prerequisite is introduced.
- Boot's `bundled-agent-plugins` step in
  `apps/website/src/server/runtime/boot/bootstrap.ts` calls `seedBundledAgentPlugins`
  through Tovu's `features/agent-plugins/lifecycle.ts` binding.
- Installed `@jini-ai/agent-plugins/dist/lifecycle/seed-bundled.js` discovers
  immediate source directories with a root `plugin.json`, packs and installs each,
  and records its bundled digest and activation. WordPress is not in the host's
  seeded-enabled set, so a fresh record is disabled; saved decisions survive.
- Jini's `installed-package-index.js` discovers `skills/<name>/SKILL.md` and all
  packaged references. Tovu's `capability-projection.ts` treats missing `mcp.json`
  as no servers. No empty MCP file or catalog change is needed.
- Graph MCP tools were unavailable; discovery used current source and installed
  Jini files. The lone package test follows the sibling test convention.

## Evidence and handoff

Public documentation rechecked 2026-10-23; citations sit beside claims in the
references. Current price and `.vercel.app` eligibility remain
**confirm in your dashboard**; see the free-site reference for evidence.

No live dashboard, redirect purchase, DNS change or deployment was verified.
Tests and builds were not run, as dispatched. No approved spec hash was supplied;
the task's REVIEW is the scope authority. Next: Coordinator reviews the package
and commits it; owner confirms checkout eligibility, price and live checks.
