/**
 * @file Tovu's member cookie identity, read by both the sign-in routes and the public site's read-path gate.
 * The public member DTO and its mapper are Jini's (`@jini-ai/user-management/members/public-member-response`);
 * the cookie name stays here because it is Tovu's product identity.
 */

/** Shared read/write cookie identity; page requests must not load sign-in services to read it. */
export const MEMBER_SESSION_COOKIE = "tovu_member_session";
