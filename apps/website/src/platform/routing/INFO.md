# Routing host adapter

Generic routing and its unit suites belong to `@jini-ai/cms/routing` (owner approved 2026-10-09, superseding ADR-039's Tovu file placement).

`adapter.ts` binds one process-wide Jini instance to the existing scheduled-publishing owner and operator fault channel.
Reuse this binding across composition roots to preserve owner replacement and stale-disposer behavior.
Site-specific reserved paths remain here. Content lookup between routing phases stays in the site's HTTP routes.
The historic rationale comments moved verbatim with routing; taxonomy resolution and the origin TODO remain unchanged.
