# Coordinator decisions for wave 5 (tovu-b9, 2026-11-23 evening)

The w3/w4 lanes stopped on these as "owner decisions". Each one follows from rules the owner has already given, so the coordinator decides them here. Wave-5 lanes implement them without stopping. Only the items marked OWNER-CONFIRM below go back to the owner.

Owner rules this rests on: inject everything (11-22, never ask import-vs-inject); no package above domains (11-07); themes stay in Tovu; K1-K5; generic types go to `@jini-ai/core`, Tovu-specific ones to `@tovu/contracts`; hooks are REQUIRED props in Jini; no re-export shells.

1. **Unowned K4 type files** block ~30 admin files: `integrations-api.types.ts`, `security-api.types.ts`, `source-control-api.types.ts` and `security/access-token-rows.ts`. Move the wire types to `@jini-ai/core` contracts when the server shares them, otherwise to the domain package's react folder. Wave 5 gets a K4 step that does this first.

2. **A screen that needs a domain package that `@jini-ai/admin` does not depend on** (`user-management`, `cms`, `ui-kit`, `integrations`). The screen moves into that DOMAIN package's `react/` folder, precedent `user-management/src/react/users`. Never add domain deps to `@jini-ai/admin`, because no package sits above domains. Admin keeps only the generic kit.

3. **K4-i18n-common**: a `create<X>Dictionary({ commonDictionary, productName? })` factory in Jini, bound by the host in `lib/i18n-common.ts`.

4. **Positional-signature hooks**, e.g. `useSecurityPermissions(port)`: convert to object args `{ port, permission }` with an `_optional = {}` pad. This is an args-rule change, not a decision.

5. **Duplicate file-tree hook.** Point `PackageFilesModal` at Jini `useAgentPluginFileTree`, then delete the Tovu duplicate.

6. **IntegrationsRedirect and other panels-composition render sites.** Making a hook a required prop that touches `panels.tsx`, `App.tsx` and `AdminUi.tsx` is ALLOWED (importer edits that only pass the collaborator). Update `panels-render` element-type assertions to the new element.

7. **Required hook props vs `check:hooks`.** This is a checker false positive (open-bugs, 11-23). Fix the checker in Jini to accept REQUIRED hook props; do not add debt rows.

8. **Host-policy splits** (`site-backup/share-policy.ts`, publish-content `backstop-policy`, `peers.ts`). Neutral refusal types and names go to Jini (`@jini-ai/devops/backup/site/share-refusal` etc.). Limits, tables and copy stay in the host and are injected.

9. **`sdk-resolver`.** Move it with `sdkModulePath` as a REQUIRED field; the three callers pass the host-resolved path.

10. **`cms` isolation shared `apply-errors.ts`.** Keep it.

11. **The 8 core-owner items:**
    - publish-ports bag: one feature-owned `PublishPorts` object in core contracts.
    - content kernel K4-seam-5: types to core, runtime to cms.
    - secret sealer/keyring: owner is `@jini-ai/integrations` secrets (platform/secrets), with the keyring injected by the host.
    - execution-card types: core contracts.
    - cms→agentic edge: invert it with a port that cms exposes and agentic implements; no cms import of agentic.
    - comments provider registries: registry type in core, providers injected.
    - AdminExecutionMode/origin adapter: type in core, adapter stays host.
    - publish-content-ui K5 prerequisite: do the K5 injection first in the same lane.

12. **`app-version-ipc.ts`, `find-in-page-ipc.ts` and other thin host adapters over Jini bridges.** STAYS-HOST; add them to `plan.mjs` KEEP_RULES, which Codex rv1123q will confirm.

13. **Content-lane holds:**
    - tiptap editor files stay in the host until a Jini rich-text package exists (OWNER-CONFIRM, recommended: keep).
    - R5 model-facing copy that names host tools: pass the copy in through K3 args; the schema moves.
    - K4i i18n file over 500 lines: 500-line files never block work (owner 11-20); split by feature.
    - HW3 module state: convert to an injected store.

14. **A425:** user MCP servers count as "can write" (keep the disclosure). OWNER-CONFIRM, recommended as stated.

15. **Add-ons:**
    - webhook sealer: same as item 11.
    - plugins-i18n product dictionary: same as item 3.
    - js-yaml peer for host-plugin-guidance: declare it as a real dependency, never a lazy load.
    - skills state-file rename: read the old name, write the new one.
    - content-analyzer trusted imports: port `plugin.ts` to `@jini-ai/plugin-sdk` and move it with an explicit trusted-imports update (security: Codex reviews).
    - AdminAgentPlugin: core contract.
