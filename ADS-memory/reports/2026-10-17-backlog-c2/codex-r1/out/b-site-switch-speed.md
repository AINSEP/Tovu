Programmer(Execution): Used the Programmer persona for minimal timing changes and regression coverage.

Implemented:

- Admin Activate/local switch defaults to **0 ms** restart delay; chat keeps **3000 ms**.
- Supervisor polling changes from **500 ms to 100 ms**.
- Sites refreshes every **300 ms** after restart acceptance until `snapshot.currentSite.name` matches, with a 60-second bound and unmount cleanup.

Reused the existing restart option, visibility/timer ports, and Jini cache invalidation. Added regression tests for prompt restart writing, switch capability, rapid refresh, completion, deadline, visibility, and cleanup.

Static review and `git diff --check` passed. Protected files were untouched.

CHANGED FILES:

- [sites.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/system/sites.ts)
- [dev.mjs](/Users/la/Programming/Tovu/development/scripts/dev.mjs)
- [use-local-sites.hooks.ts](/Users/la/Programming/Tovu/apps/admin/src/features/sites/hooks/use-local-sites.hooks.ts)
- [sites-route-restart.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/sites-route-restart.test.ts)
- [use-local-sites.unit.test.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/use-local-sites.unit.test.tsx)

NOT DONE:

Tests, typecheck, builds, and runtime validation were not run as instructed; RED/GREEN remains unverified. No commits or index changes. Watcher interval test omitted because no existing seam was available.
