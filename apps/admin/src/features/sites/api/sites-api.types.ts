/**
 * The runtime list of site-key states — the values `GET .../system/site-key`'s `state` field can
 * carry. The type lives in Core as `AdminSiteKeyState` (`@jini-ai/core/contracts/site/site-key`),
 * which carries no runtime values, so the list stays here. `lib/__tests__/site-key-state-parity.unit.test.ts`
 * checks this tuple against the Core union (type level, both directions) and against the website's
 * own `SiteKeyState` union (`apps/website/src/contracts/core/site-key-state.ts`, read off disk).
 * Keep all three edited together.
 */
export const ADMIN_SITE_KEY_STATES = ["active", "missing", "missing-with-data", "mismatch", "invalid"] as const;
