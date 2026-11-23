# skills

Host-side skills install service, tool registrations, layout and the yauzl/js-yaml install adapters.
Live skill registration and the refresh middleware live in `@jini-ai/agentic/skills/site/live-registration`.

## Wiring

- `createLiveSkillRegistration(registry)` is bound to the core tool registry in `./tool-registrations.ts`.
- `createSkillRefreshMiddleware` has no production mount in this host today; only `./__tests__/unit/hot-paths.unit.test.ts` binds it (to a test registry).
- The layout, install service, install tool and skill tool registrations live in
  `@jini-ai/agentic/skills/site/{layout,install-service,install-tool,tool-registrations}`. This host binds
  them once in `./site-host.ts` (`SKILL_SITE_HOST`: `TOVU_SKILLS_DIR`, `SKILL_STATE_FILE` from `./state.ts`,
  `resolveSiteRoot`, the `./install-adapters.ts` adapters, the markdown frontmatter reader, the agent-plugins
  skill file reader, the installer queues and the CMS permission check). Every `resolveSkillLayout` call passes
  it as `host`: `server/runtime/composition/site-deps/agent-plugin-bootstrap.ts`,
  `server/runtime/composition/memory-deps/slices/agent-plugins.ts`, and the test fixture
  `src/__tests__/fixtures/site-layout-context.ts`.
