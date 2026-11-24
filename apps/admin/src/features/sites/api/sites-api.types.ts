/**
 * The runtime list of site-key states — the values `GET .../system/site-key`'s `state` field can
 * carry. The type lives in Core as `AdminSiteKeyState` (`@jini-ai/core/contracts/site/site-key`),
 * which the server route types its `state` with and which carries no runtime values, so the list
 * stays here. `lib/__tests__/site-key-state-parity.unit.test.ts` checks this tuple against the Core
 * union (type level, both directions, plus a runtime record keyed by the union), so the two can
 * never silently drift apart. Keep both edited together.
 */
export const ADMIN_SITE_KEY_STATES = ["active", "missing", "missing-with-data", "mismatch", "invalid"] as const;
