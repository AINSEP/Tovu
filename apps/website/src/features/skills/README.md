# skills

Host-side skills install service, tool registrations, layout and the yauzl/js-yaml install adapters.
Live skill registration and the refresh middleware live in `@jini-ai/agentic/skills/site/live-registration`.

## Wiring

- `createLiveSkillRegistration(registry)` is bound to the core tool registry in `./tool-registrations.ts`.
- `createSkillRefreshMiddleware` has no production mount in this host today; only `./__tests__/unit/hot-paths.unit.test.ts` binds it (to a test registry).
