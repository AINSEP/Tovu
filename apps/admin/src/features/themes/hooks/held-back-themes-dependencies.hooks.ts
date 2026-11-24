import { ApiError } from "@/lib/admin-http/request";

import { heldBackThemesApi, type ChosenThemeHeldBack, type HeldBackCheckResult, type HeldBackTheme } from "../api/held-back-themes-api";
import type { HeldBackThemesPort } from "./held-back-themes-port.hooks";

/**
 * @file The only place under `features/themes` that binds {@link HeldBackThemesPort} to the real
 * admin client, plus its in-memory fake — see `held-back-themes-port.hooks.ts`.
 */

/** The live implementation, as a module-level singleton (same shape as `defaultThemesPort`). */
export const defaultHeldBackThemesPort: HeldBackThemesPort = {
  list: () => heldBackThemesApi.list(),
  check: ({ themeId }, _optional = {}) => heldBackThemesApi.check({ themeId }),
  approveRestore: ({ themeId, planId, planHash }, _optional = {}) => heldBackThemesApi.approveRestore({ themeId, planId, planHash }),
  restore: ({ themeId, approvedDigest, confirmationToken }, _optional = {}) => heldBackThemesApi.restore({ themeId, approvedDigest, confirmationToken }),
};

/**
 * An `ApiError` the way the server's refusals arrive: status, canonical `code`, and the raw body
 * (route fields such as `problems`, and the `errorId` an unexpected failure carries).
 * @complexity O(1).
 */
export function heldBackApiError(
  { status, code, message, errorId, body = {} }: { status: number; code: string; message: string; errorId?: string; body?: Record<string, unknown> },
  _optional = {},
): ApiError {
  return new ApiError({ message, status }, { code, body: { code, error: message, ...(errorId ? { errorId } : {}), ...body } });
}

/** Seed state for {@link createFakeHeldBackThemesPort}. */
export interface FakeHeldBackThemesPortOptions {
  themes?: HeldBackTheme[];
  chosenThemeHeldBack?: ChosenThemeHeldBack | null;
  /** Scripted check answers by theme id; any other theme passes with digest `digest-<id>` and plan `plan-<id>`/`hash-<id>`. */
  checkResults?: Record<string, HeldBackCheckResult>;
}

/**
 * An in-memory {@link HeldBackThemesPort} for tests: a restore removes the theme from the list (the
 * server moves the folder), the chosen-theme marker disappears with it, and ids the list does not hold
 * are refused with `HELD_BACK_NOT_FOUND` — the server's own answers, minus its file checks, which a
 * test scripts through `checkResults`.
 */
export function createFakeHeldBackThemesPort(options: FakeHeldBackThemesPortOptions = {}): HeldBackThemesPort {
  const themes = [...(options.themes ?? [])];
  const chosen = options.chosenThemeHeldBack ?? null;
  const requireHeld = (themeId: string) => {
    if (!themes.some((theme) => theme.id === themeId)) throw heldBackApiError({ status: 404, code: "HELD_BACK_NOT_FOUND", message: "That theme is not held back." });
  };

  return {
    async list() {
      const stillHeld = chosen !== null && themes.some((theme) => theme.id === chosen.themeId);
      return { themes: [...themes], chosenThemeHeldBack: stillHeld ? chosen : null };
    },
    async check({ themeId }, _optional = {}) {
      requireHeld(themeId);
      return options.checkResults?.[themeId] ?? { themeId, passes: true, problems: [], digest: `digest-${themeId}`, nameTaken: false, approval: { planId: `plan-${themeId}`, planHash: `hash-${themeId}` } };
    },
    async approveRestore({ themeId }, _optional = {}) {
      requireHeld(themeId);
      return { approved: true, confirmationToken: `token-${themeId}` };
    },
    async restore({ themeId, approvedDigest, confirmationToken }, _optional = {}) {
      // Like the server: the digest is only a version check, so a missing token is no approval.
      if (!approvedDigest || !confirmationToken) throw heldBackApiError({ status: 400, code: "APPROVAL_REQUIRED", message: "Approval is required." });
      requireHeld(themeId);
      const [held] = themes.splice(themes.findIndex((theme) => theme.id === themeId), 1);
      return { theme: { id: themeId.split("/").pop() ?? themeId, name: held!.name, status: "valid" as const }, restoredFrom: themeId };
    },
  };
}
