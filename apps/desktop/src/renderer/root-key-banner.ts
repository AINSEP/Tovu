/**
 * @file Every decision and every word of the shell's "no root key" banner — as plain functions,
 * so they are directly testable. `RootKeyBanner.tsx` holds only `useState`/`useEffect` and JSX
 * (this package has no React renderer at all — see `expanded-mode.test.ts`'s header — so anything
 * asserted must live outside a component).
 *
 * Why a banner exists at all: a Tovu launched without `TOVU_INTEGRATIONS_ROOT_KEY` behaves
 * normally until the first action that needs a stored credential, which may be hours later and
 * will fail a long way from the cause (2026-09-18; see `src/root-key-boot-guard.ts`'s header for
 * the full account). The shell already logs it at boot — but a log line is precisely what existed
 * before and what nobody read. This is the surface a person actually looks at.
 *
 * The copy below never renders key material: `RootKeyStatusDto` has no field that can carry it.
 */
import type { RootKeyStatusDto, RootKeyRejection } from '../contracts/root-key.js';

/** What the renderer knows so far. `null` means the boot status has not arrived yet (or could not
 *  be fetched); the banner stays hidden rather than guessing, because a false alarm here would
 *  teach the operator to ignore the real one. */
export type RootKeyStatusView = RootKeyStatusDto | null;

/**
 * Should the banner be on screen?
 *
 * Shown only for a status that positively says "no usable key". Not shown while the status is
 * unknown, and not shown for a healthy key — including one that came from a key file or was
 * generated, both of which report `present: true` exactly as an env-supplied key does.
 *
 * @complexity O(1).
 */
export function shouldShowRootKeyBanner(status: RootKeyStatusView): boolean {
  if (status === null) return false;
  return status.present === false;
}

/** Plain-language "what is wrong with the material that IS there". A `Record` over the union, so a
 *  new rejection reason without a sentence is a compile error rather than a blank banner. */
const REJECTION_SENTENCE: Record<RootKeyRejection, string> = {
  empty: 'it is empty',
  'not-hex': 'it contains characters that are not hex digits',
  'odd-length': 'it has an odd number of hex digits, so it does not describe whole bytes',
  'too-short': 'it is too short — a root key must be at least 32 bytes (64 hex digits)',
  unreadable: 'it could not be read',
};

/** The banner's rendered content. Split into parts rather than one blob so `RootKeyBanner.tsx` can
 *  mark up the launcher command and the paths without parsing prose back out of a sentence. */
export interface RootKeyBannerCopy {
  readonly headline: string;
  /** What is actually wrong, naming the env var or the key file. */
  readonly cause: string;
  /** Why it matters — the delay between this state and its first symptom. */
  readonly consequence: string;
  /** The launcher that loads the repo's `.env`. Rendered as a command, not prose. */
  readonly launcherCommand: string;
  /** One line explaining the launcher, including where it must be run from. */
  readonly launcherHint: string;
  /** The other two ways out, in order of least surprise. */
  readonly remedies: readonly string[];
  /** The warning that a new key does not recover old credentials. */
  readonly caveat: string;
}

/**
 * The banner's words for a given status. Every path and variable name comes from the STATUS, never
 * from a literal repeated here, so the banner can never point at a different file than the one the
 * boot check looked at.
 *
 * Callers must gate on {@link shouldShowRootKeyBanner} first; this function assumes a bad status
 * and describes "nothing configured" for anything else.
 *
 * @complexity O(1).
 */
export function rootKeyBannerCopy(status: RootKeyStatusDto): RootKeyBannerCopy {
  return {
    headline: 'This Tovu has no usable root key',
    cause: causeSentence(status),
    consequence:
      'Everything looks normal until the first action that needs a stored credential — a deploy, ' +
      'a saved API key, a custom credential request. Those will fail, far from this cause.',
    launcherCommand: 'npm run desktop',
    launcherHint:
      'Most likely this app was started in a way that never reads the repo’s .env. Quit and ' +
      'relaunch from the REPO ROOT with the command above. (npm run dev inside apps/desktop is ' +
      'plain electron . — it does not load .env.)',
    remedies: [
      `Or set ${status.envVarName} in the environment this app is launched from.`,
      `Or generate a key file at ${status.keyFilePath} — the admin Secrets page, Site Token tab, Generate.`,
    ],
    caveat:
      'Credentials already stored are sealed under whatever key was in place when they were saved. ' +
      'Generating a new key does not recover them.',
  };
}

/** "Nothing is configured" and "what you configured is broken" are different problems with
 *  different fixes, so they get different first sentences. */
function causeSentence(status: RootKeyStatusDto): string {
  if (status.invalid === true) {
    const subject =
      status.source === 'env'
        ? `The ${status.envVarName} environment variable`
        : `The root key file at ${status.keyFilePath}`;
    return `${subject} is not usable: ${REJECTION_SENTENCE[status.reason ?? 'unreadable']}.`;
  }
  return `${status.envVarName} is not set, and there is no key file at ${status.keyFilePath}.`;
}

/**
 * Reads the boot status across the preload bridge, returning `null` rather than throwing when the
 * bridge is absent or the call fails.
 *
 * A renderer that cannot reach main has bigger problems than this banner, and a thrown rejection
 * on mount would be a far worse failure than a missing warning — so this degrades to "say
 * nothing". Kept here rather than in the component so the fallback is testable.
 *
 * @param bridge - normally `window.tovuRunner`; injected for tests.
 * @complexity O(1) — one IPC round trip.
 */
export async function fetchRootKeyStatus(
  bridge: { rootKeyStatus?: () => Promise<RootKeyStatusDto> } | undefined
): Promise<RootKeyStatusView> {
  try {
    // One expression, no branch: an undefined bridge, a bridge without the method, and a resolved
    // `undefined` all short-circuit to `null`. An earlier draft had an explicit `typeof … !==
    // 'function'` check in front of this; a mutation sweep (2026-09-18) showed nothing could tell
    // whether it was there, because the `catch` below already produced the identical result for
    // every input — so it came out rather than staying as a guard carried on faith.
    return (await bridge?.rootKeyStatus?.()) ?? null;
  } catch {
    return null;
  }
}
