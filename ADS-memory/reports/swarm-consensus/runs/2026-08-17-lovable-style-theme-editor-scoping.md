# Scoping: Lovable-style in-browser theme editor (deferred feature)

Research only, via Sonnet subagent querying two already-indexed reference repos (`OSS-Repos/bolt.diy`, `OSS-Repos/open-lovable`) plus a live check of WebContainers' own licensing page. Not started, not committed — this is an effort/feasibility estimate to inform a future prioritization call.

## Tech: the two reference repos use different approaches

- **bolt.diy → StackBlitz WebContainers.** A real Node.js runtime compiled to WebAssembly, running entirely in the browser tab — npm install, dev server, everything client-side, zero server load. `package.json` pins an `-internal` prerelease build of `@webcontainer/api`, suggesting a special StackBlitz Labs arrangement, not the plain public package.
- **open-lovable → server-side ephemeral sandboxes** (E2B or Vercel Sandbox, pluggable). A real remote VM is spun up per session; a script inside it writes the project files, npm-installs, and starts a dev server; the iframe points at that sandbox's URL. Minutes, not milliseconds — no in-browser instant feedback.
- Neither uses Sandpack.

## Licensing

- **WebContainers**: confirmed directly from `webcontainers.io/enterprise` — "Licensing is required for production usage of the API in a commercial, for-profit setting." Prototypes/POCs are exempt. Self-hosted/on-prem only via a sales-contact Enterprise deal, no public pricing. This is a real commercial negotiation, not an `npm install`.
- **E2B**: genuinely open source, self-hostable (Terraform, AWS/GCP/Azure, Firecracker microVMs). Managed cloud is usage-billed, no license wall. Self-hosting is free in license, not free in ops effort — new infrastructure class for Tovu to run.
- **Vercel Sandbox**: moot — Tovu already can't run on Vercel (`child_process.spawn` blocker, per existing deployment-constraints notes).

## Estimate

The editor+live-preview mechanism itself is the main cost: ~1-3 weeks of wiring if WebContainers licensing is accepted, more if building on E2B's self-hosted infra instead. This is a separate feature from, and doesn't conflict with, how Tovu installs an already-built theme from the marketplace — editing your OWN theme live and installing someone ELSE's finished theme are two different paths with no reason to share a rule.

**Rough estimate: at least a few weeks for a first workable version**, mainly gated on the WebContainers licensing conversation (or standing up E2B infra as the free alternative). Owner is now leaning toward directly reusing code from `bolt.diy`/`open-lovable` rather than building this from scratch — see follow-up investigation into whether Jini already has relevant rendering infrastructure to build on.

**Status: paused for further scoping (2026-08-17).** Framework/component-tier themes ship install/view-only for now; live-editing capability is being actively scoped, not ruled out.
