/**
 * @file Tovu host policy and wiring for Jini comments. The comment lifecycle and the
 * published-entry/close-window gate live in Jini/packages/cms/src/comments/module.ts.
 *
 * `settingsRepo` (SPEC-035, ADR-028 Settings Layered Ledger wiring): when supplied, this module
 * reads `CommentsSettings` LIVE from the ledger (`settings.ts#getCommentsSettings`), per call, via
 * the `getSettings` resolver Jini's ingress and module entry gate share — an
 * operator's settings change takes effect on the next request, not only after a restart.
 * `DEFAULT_COMMENTS_SETTINGS` remains the fallback when `settingsRepo` is omitted (hermetic tests
 * that don't want to wire the ledger) AND the per-key default `getCommentsSettings` itself falls
 * back to before `ensureCommentsSettingDefinitions` has run in a real composition.
 */
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";
import type { CommentsModuleDeps, CommentsSettings } from "@jini-ai/cms/comments";
import type { SettingsRepoPort } from "../settings/index.js";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createMemoryCounterStore } from "@jini-ai/http-kit/rate-limit";
import type { RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import { getCommentsSettings } from "./settings.js";

export const DEFAULT_COMMENTS_SETTINGS: CommentsSettings = {
  enabled: true,
  requireModeration: true,
  maxDepth: 5,
  closeAfterDays: null,
  spamAutoRejectScore: 0.5,
  maxPerIpPerHour: 20,
};

/** api.spec-style profile, mirroring `FORMS_SUBMIT_PROFILE`'s shape/magnitude for a comparable public write endpoint. */
export const COMMENTS_SUBMIT_PROFILE: RateLimitProfile = { windowSeconds: 3600, max: 20, burst: 0 };

/** Builds one limiter and a live settings resolver for the host composition roots.
 * Ledger settings take precedence over the optional fixed fallback; lookup errors propagate.
 * @returns Required Jini getSettings and rateLimiter ports.
 * @complexity O(1) setup; each settings read inherits the ledger's work.
 * @example createCommentsHostPorts({ clock, settingsRepo }, {})
 */
export function createCommentsHostPorts(
  required: { clock: ClockPort; settingsRepo?: SettingsRepoPort },
  optional: { settings?: CommentsSettings } = {},
): Pick<CommentsModuleDeps, "getSettings" | "rateLimiter"> {
  // Disclosed gap (SPEC-035): `maxPerIpPerHour` is readable/writable through the ledger like every
  // other `CommentsSettings` field, but the actual rate-LIMITER below is still constructed ONCE,
  // fixed at `COMMENTS_SUBMIT_PROFILE.max` (= the same value as `DEFAULT_COMMENTS_SETTINGS.
  // maxPerIpPerHour`) — an operator changing it via the admin settings route updates the STORED
  // value but does not yet reconfigure the live limiter. Making the limiter itself dynamically
  // reconfigurable per-workspace is a larger change to `core/rate-limit/rate-limit.ts`'s
  // fixed-window counter store, out of this slice's scope (mirrors the task's own "don't build a
  // large amount of new plumbing beyond what already exists for SEO's pattern" guidance).
  const rateLimiter = createRateLimiter(
    { profile: COMMENTS_SUBMIT_PROFILE, clock: required.clock },
    { store: createMemoryCounterStore({}) },
  );

  // SPEC-035 — the live settings resolver: reads the ADR-028 ledger per call when `settingsRepo`
  // is supplied, else falls back to the fixed `optional.settings ?? DEFAULT_COMMENTS_SETTINGS`
  // snapshot (hermetic tests / a composition root that hasn't wired the ledger).
  const getSettings = async (workspaceId: UUID): Promise<CommentsSettings> =>
    required.settingsRepo
      ? getCommentsSettings({ settingsRepo: required.settingsRepo }, { workspaceId })
      : optional.settings ?? DEFAULT_COMMENTS_SETTINGS;

  return { getSettings, rateLimiter };
}

export { ensureCommentsSettingDefinitions, getCommentsSettings, setCommentsSettings, CommentsSettingsValidationError } from "./settings.js";
export { COMMENTS_IP_SALT_ENV_VAR, DEV_COMMENTS_IP_SALT, resolveCommentsIpHashSalt, type CommentsIpHashSaltSource, type CommentsIpSaltKeyring } from "./ip-hash-salt.js";
