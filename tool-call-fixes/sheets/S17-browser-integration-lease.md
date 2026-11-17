# S17. One browser integration at a time; the default follows the owner (C8, mechanism M10)

Repos: Jini (`daemon`), Tovu. Estimate: 150k Sonnet. Prerequisites: OD-4 answered. Order after R8b / size-10 on
`agent-executor/launch.ts` (reconcile SEQUENCE H2); if those are still running, do the Tovu-only part (steps 3 and 4).

## Read first
`../DESIGN.md` §2.10, M10. Jini `daemon/src/agent-executor/contracts.ts` (`chromeIntegration`), `launch.ts`
(`buildAgentBuildArgsOptions`), `agent-runtime/src/defs/claude.ts` (`claudeChromeArgs`).
Tovu `apps/website/src/assistant/runtime-preferences.ts` (default), `server/inbound/assistant/assistant-runtime-guidance.ts`
(`resolveClaudeInChromeEffective`, `buildClaudeInChromeRunOptions`, the guidance sentence), the launch site in `agent-daemon-scope.ts`.

## Characterization (passes today)
Two owner runs started back to back with the preference on → both get `chromeIntegration: true` and the allow-list
entries; a non-owner run gets `false`; an unsupported runtime gets no flag.

## Red-first
`browser-integration-lease.unit.test.ts` (pure lease with a fake clock):
1. first `acquire({ runId: "a" })` → granted; second for `"b"` → refused with holder `"a"`.
2. `release({ runId: "a" })` → `"b"` can acquire. Release is idempotent; releasing a non-holder is a no-op.
3. Tovu: second concurrent owner run launches with `chromeIntegration: false`, no allow-list entries, and its guidance contains exactly `Another chat is using the browser integration. Use web_screenshot_page and page tools.`
4. the lease is released on each run ending: completed, failed, cancelled, and process exit without a terminal event (drive the run lifecycle fake through each; lesson 21).
5. OD-4 = off by default: a fresh preferences record has `useClaudeInChrome: false`; a stored `true` stays `true` (no migration of existing choices).

## Change
1. Jini: `daemon/src/browser-integration-lease.ts` (pure, in-memory, per host process): `createBrowserIntegrationLease()` → `{ acquire, release, holder }`. No vendor name.
2. Tovu: take the lease where `buildClaudeInChromeRunOptions` is called; `effective` becomes `effective && granted`; release from the run's terminal hook that already cleans up attachments.
3. Guidance: keep "prefer it for checking pages the owner is logged into"; add that screenshots and page tools come first (tools-first rule). The guide lint must pass.
4. Default per OD-4.

## Acceptance
Cases green with exact text; argv for unsupported runtimes byte-identical; no second run can hold the integration; `check:tool-guides -- --strict` green.

## Out of reach (say so in the report, do not attempt)
Collisions with the owner's other, non-Tovu sessions and the browser extension's tab-group handling.
