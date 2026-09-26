/**
 * @file The admin "Sites" switcher's capability flag (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`).
 *
 * A GENERAL capability — "this deployment can switch sites" — not a Tovu-Runner-specific hide
 * (the owner's original framing, inverted per that decision):
 *
 * | Deployment           | Flag | Why |
 * |---|---|---|
 * | Tovu-Runner          | OFF  | Already supervises processes and switches sites natively; two UIs would be redundant. |
 * | Local dev             | ON   | The developer case this was built for — no desktop app needed. |
 * | Hosted multi-tenant   | OFF  | Workspaces already exist and are the correct axis there. |
 *
 * Default OFF — the opposite polarity from `admin-assistant-enabled.ts`'s default-ON switch,
 * deliberately: absent the var, List still works (read-only, no boot-state risk) but Create and
 * Activate both refuse — bit-for-bit the behavior before this capability existed, for every
 * deployment that never sets it (Tovu-Runner, a hosted deploy, any `npm start`/container boot).
 * `development/scripts/dev.mjs` sets `TOVU_ENABLE_SITE_SWITCHER=1` for every local `npm run dev`
 * boot (unless a caller's own env already set it — same "explicit always wins" precedence that
 * file's other env overrides already follow), so a developer gets this ON without editing
 * anything; Tovu-Runner and a hosted deploy never set it, so both stay OFF.
 */
export function isSiteSwitcherEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.TOVU_ENABLE_SITE_SWITCHER?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}
