Code Inspection(Review): Personas used: code-inspection, security, TDD.

Reviewed product hunks at `review/cov-T1` (`47ed50a4`). Findings are based on source inspection; no files changed or tests/builds run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu:apps/admin/src/lib/merge-locale-overlays.ts:21`; `apps/admin/src/features/forms/index-aligned-translations.ts:14` | Both new translation utilities are product-independent implementations in Tovu, contrary to the binding Jini-first ownership rule. | Implement them in Jini and import them into Tovu; retain feature dictionaries locally. |
| MEDIUM | `tovu:apps/admin/src/lib/server-reconnect.ts:59` | Removing the same-status guard permits recursive notifications. `poll()` notifies synchronously before line 85 assigns `inFlight`; a subscriber calling `waitUntilReachable()` re-enters polling indefinitely. | Restore the status guard and assign the shared promise before polling starts. Add a reentrant-subscriber regression test. |
| MEDIUM | `tovu:apps/admin/src/features/themes/ThemeExplore.tsx:126`; `apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts:63` | Removing the `navigator` guards changes previously supported behavior: hosts without `navigator` now throw. ThemeExplore also replaces the explicit SSR rationale with an unsupported assumption that rendering implies a browser. | Restore the guarded defaults and SSR rationale unless an approved decision retires that support. |
| MEDIUM | `tovu:apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:256`; `apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.adapter.ts:17` | New public APIs violate the required `(requiredObj, optionalObj = {})` contract: the first accepts positional arguments; the factory omits the optional object. Other new exports repeat this. | Apply the two-object signature to new exports and update their callers. |

**Rules check**

- Plugins never import each other: **OK** in changed hunks.
- Generic code belongs in Jini: **violated** — translation helpers cited above.
- Two-object public signatures: **violated** — exports cited above.
- Dependencies injected as ports: **violated, retained during extraction** — direct `Date.now()` in `apps/desktop/src/smoke-packaged-chat-gate.ts:336`.
- React components receive data through props only: **violated, retained** — `apps/desktop/src/renderer/App.tsx:455` obtains settings through a hook inside `SettingsControl`.
- Cyclomatic complexity ≤10: **unverified**; no measurement run under the requested restrictions.
- Existing “why” comments preserved: **violated** — SSR rationale removed at `apps/admin/src/features/themes/ThemeExplore.tsx:121`.
- Schema changes use ADR-066 TypeScript migrations: **OK**; no schema changes.
- No data loss: **OK**; no introduced data-loss path identified.
- No unflagged `TEMP: replaced by shared helper`: **OK**; no matches in scoped product source.

Test hunks were excluded as requested; test-quality and coverage claims remain unverified.

**Verdict: MERGEABLE AFTER FIXES** — resolve the ownership/signature violations, reconnect reentrancy, and removed SSR safeguards.
