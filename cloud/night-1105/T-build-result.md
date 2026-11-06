Programmer(Direct): Implemented steps 1–5 in source. **Integration remains pending a Jini package update.**

Root cause: [A2 guidance](/Users/la/Programming/tovu-integration-clones/prov2-tovu/content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:356) prescribed restyling a full copy, and [duplication](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/features/theme/duplicate-theme.ts:267) retained Starter’s appearance.

Changed:

- Jini: added the 58-line `strip-html-presentation.ts`, its export and regression tests.
- Tovu: updated `duplicate-theme.ts`, `duplicate-theme-tool.ts`, `active-theme.ts`, `set-active-theme-tool.ts`, theme `index.ts`, and admin `patch-active-theme.ts`; added `structure-only-theme.ts`.
- Guidance: updated UI/UX and site-import overlays, theme `SKILL.md`, motion reference, and local plugin version.
- Tests: covered stripping, functional assets, neutral tokens, rollback, mode validation and activation readiness. Added only the requested tool-call and inspiration-order text pins.

Lightbox and complete kUInetic assets remain. Readiness uses one shared allowlist and message.

Jini typecheck and focused complexity lint passed. Tovu lint passed with one repeated-literal advisory. No tests ran; concurrent edits were preserved; no commits were made.

Added cost: per structure copy, one read/write × each template/token file, one small stylesheet write and stat. Activation scans in-memory CSS. Inspiration guidance budgets three fetches × 12,000 content characters and two screenshots × variable image bytes. Background polling: zero.

**Open:** Tovu’s installed `@jini-ai/platform` lacks the new export. Release/update that dependency before loading this change. Runtime behavior remains unverified.

Run from the Tovu clone after updating the dependency:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --test-timeout=60000 --test-concurrency=2 --experimental-test-module-mocks \
  apps/website/src/features/theme/__tests__/duplicate-theme.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.theme-duplicate.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.theme-set-active.test.ts \
  apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts \
  content/agent-plugins/tovu-theme/__tests__/bundled-package.test.mjs \
  content/agent-plugin-overlays/ui-ux-design/__tests__/ui-ux-design-overlay.test.mjs \
  content/agent-plugin-overlays/site-import/__tests__/site-import-overlay.test.mjs
```

From the Jini clone’s `packages/platform` directory:

```bash
npx vitest run --maxWorkers=2 --minWorkers=1 src/web/__tests__/strip-html-presentation.test.ts
```