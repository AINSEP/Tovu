import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { adminFailureChannel } from "./lib/admin-failure-channel";
import { setAdminDraftIdentity, getAdminDraftIdentity } from "./lib/admin-draft-identity";
import { api, onUnauthenticated, type AdminUser } from "./lib/api";
import { takeBootToken } from "./lib/boot-token-fragment";
import { readInitialAdminSession } from "./lib/local-owner-signin";
import {
  readPublishToLiveAvailability,
  setPublishToLiveAvailable,
} from "./features/publish-content/hooks/publish-availability.store";
import { subscribeToSettingsChanges } from "./lib/settings-events";
import { publishSettingsRefresh } from "./lib/settings-refresh-bus";

/** @file The pure (non-hook) pieces of `useAdminSession` in `App.hooks.ts`: session reads, sign-in and sign-out. */

export type SessionApi = Pick<typeof api, "me" | "redeemBootSession" | "signInLocalOwner" | "logout">;
export type AdminSessionOptions = {
  sessionApi?: SessionApi;
  location?: Pick<Location, "hostname" | "hash" | "pathname" | "search">;
  history?: Pick<History, "replaceState">;
  subscribeUnauthenticated?: typeof onUnauthenticated;
  subscribeSettingsChanges?: typeof subscribeToSettingsChanges;
};
export type MeResponse = Awaited<ReturnType<typeof api.me>>;
export type SessionSetters = {
  setUser: (user: AdminUser | null) => void;
  setEffectivePermissions: (permissions: readonly string[] | undefined) => void;
  setChecking: (checking: boolean) => void;
};

export function acceptSession({ r, setUser, setEffectivePermissions }: { r: MeResponse } & Pick<SessionSetters, "setUser" | "setEffectivePermissions">, _options = {}) {
  setPublishToLiveAvailable({ next: readPublishToLiveAvailability(r) });
  if (getAdminDraftIdentity() !== r.user.id) adminFailureChannel.reset();
  setAdminDraftIdentity({ id: r.user.id });
  setUser(r.user);
  // No `?? []`: an absent field stays "not known", so the nav filter shows everything instead
  // of hiding every gated section (see `UseAdminSession.effectivePermissions`).
  setEffectivePermissions(r.effectivePermissions);
}

/** Returns the one initial session read (kept across Strict Mode's effect replay), starting it if needed. */
export function ensureInitialSession(
  { initialSession, sessionApi, location, history }: { initialSession: { current: Promise<MeResponse> | null }; sessionApi: SessionApi; location: Required<AdminSessionOptions>["location"]; history: Required<AdminSessionOptions>["history"] },
  _options = {},
): Promise<MeResponse> {
  if (initialSession.current !== null) return initialSession.current;
  const bootToken = takeBootToken(location, history);
  if (bootToken) {
    initialSession.current = sessionApi.redeemBootSession({ token: bootToken }).catch((error: unknown) => { console.error("[admin] Could not redeem the boot session", describeErrorForLog({ err: error })); }).then(() => sessionApi.me());
  } else {
    initialSession.current = readInitialAdminSession({ hostname: location.hostname, port: sessionApi }, { onLocalSignIn: publishSettingsRefresh });
  }
  return initialSession.current;
}

/** A fresh sign-in skipped the boot effect's `/auth/me`, which is what says whether this is the
 * live site (`publish-availability.store.ts`); a failed read leaves the default in place. */
export function refreshSignedInSession(
  { sessionApi, sessionEpoch, readEpoch, setEffectivePermissions }: { sessionApi: SessionApi; sessionEpoch: { current: number }; readEpoch: number } & Pick<SessionSetters, "setEffectivePermissions">,
  _options = {},
) {
  sessionApi
    .me()
    .then((r) => {
      if (sessionEpoch.current !== readEpoch) return;
      setPublishToLiveAvailable({ next: readPublishToLiveAvailability(r) });
      setEffectivePermissions(r.effectivePermissions);
    })
    .catch((error: unknown) => console.error("[admin] Could not refresh the signed-in session", describeErrorForLog({ err: error })));
}

export type SessionRefs = { sessionEpoch: { current: number }; initialReadPending: { current: boolean } };

export function handleSessionUnauthenticated({ refs, setters }: { refs: SessionRefs; setters: SessionSetters }, _options = {}) {
  // The initial reader handles its own 401. Later 401s must never retry local bootstrap:
  // login's settings readers also run unauthenticated when that endpoint is disabled.
  if (refs.initialReadPending.current) return;
  adminFailureChannel.reset();
  refs.sessionEpoch.current++;
  setAdminDraftIdentity({ id: null });
  setters.setUser(null);
  setters.setEffectivePermissions([]);
  setters.setChecking(false);
}

export function signInSession(
  { next, sessionApi, refs, setters }: { next: AdminUser; sessionApi: SessionApi; refs: SessionRefs; setters: SessionSetters },
  _options = {},
) {
  adminFailureChannel.reset();
  refs.initialReadPending.current = false;
  refs.sessionEpoch.current += 1;
  const readEpoch = refs.sessionEpoch.current;
  setAdminDraftIdentity({ id: next.id });
  setters.setUser(next);
  // "Not known yet" rather than `[]` until the `/auth/me` below answers, so a fresh sign-in does
  // not flash an emptied nav or a no-access screen at an operator who has access.
  setters.setEffectivePermissions(undefined);
  publishSettingsRefresh();
  refreshSignedInSession({ sessionApi, sessionEpoch: refs.sessionEpoch, readEpoch, setEffectivePermissions: setters.setEffectivePermissions });
}

export async function signOutSession(
  { sessionApi, refs, setters }: { sessionApi: SessionApi; refs: SessionRefs; setters: SessionSetters },
  _options = {},
) {
  adminFailureChannel.reset();
  // Late 401s from unmounting screens must not undo an explicit sign-out in this tab.
  refs.initialReadPending.current = false;
  refs.sessionEpoch.current++;
  setters.setChecking(false);
  setters.setEffectivePermissions([]);
  await sessionApi.logout().catch((error: unknown) => console.error("[admin] Could not end the server session", describeErrorForLog({ err: error })));
  setAdminDraftIdentity({ id: null });
  adminFailureChannel.reset();
  setters.setUser(null);
  setters.setEffectivePermissions([]);
}
