import { createBootSessionTokenStore } from "@jini-ai/user-management/identity/boot-session-token";

/**
 * @file The host binding of Jini's boot-session token store: the one store this process mints into
 * and redeems from.
 *
 * Jini's factory keeps no state, so sharing has to happen here: `cli/commands/serve-listen.ts` (the
 * `--emit-boot-token` mint) and `server/inbound/admin-http/dev-auth.ts`'s
 * `POST /api/admin/v1/auth/boot-session` (the redeem) both import from this file. Two stores would
 * refuse every launcher token, which is why the token is not threaded through `RouteDeps` either:
 * neither call site reads it through `deps`, so `RouteDeps`'s shape never has to know it exists.
 * Browser dev's local-boot-session route builds its own request-scoped store instead, so it can
 * never burn this one.
 */
export const { mint: mintBootSessionToken, redeem: redeemBootSessionToken } = createBootSessionTokenStore();
