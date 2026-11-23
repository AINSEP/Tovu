import { formatErrorForLog, formatUserFacingError } from '@jini-ai/core';
import { isNetworkUpdateError, updateErrorMessage } from '@jini-ai/desktop-host/electron/updates';
import type { UpdateCheckCopy, UpdateCheckOutcome, UpdateNotice, UpdateNoticeArgs } from '@jini-ai/desktop-host/electron/updates';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
/**
 * Tovu's words for "Check for updates…" in the sites home Settings menu. The manual check itself
 * (one check per click, join while running, look-only with automatic updates off) is Jini's
 * `createUpdateCheckNow` in `@jini-ai/desktop-host/electron/updates`; main wires it with this copy.
 */

/** Operation guidance for electron-updater errors; diagnostic details are redacted separately. */
export function plainUpdateError({ message }: { message: string }, { operation = 'check' }: { operation?: 'check' | 'download' } = {}): string {
  if (isNetworkUpdateError({ message })) return 'Tovu couldn’t reach the update server. Check your internet connection and try again.';
  return operation === 'download'
    ? 'Tovu couldn’t download the update. Choose Check for updates to try the download again.'
    : 'Tovu couldn’t check for updates. Try Check for updates again in a few minutes.';
}

const AUTO_OFF = 'Automatic updates are off.';

function versionUpdateNotice(
  { outcome, currentVersion, automaticUpdates }: {
    outcome: Extract<UpdateCheckOutcome, { kind: 'up-to-date' | 'downloading' | 'available' }>;
    currentVersion: string; automaticUpdates: boolean;
  },
): UpdateNotice {
  switch (outcome.kind) {
    case 'up-to-date': return {
      type: 'info', message: `You’re up to date (${outcome.version})`,
      detail: automaticUpdates ? 'This is the newest version of Tovu.' : `This is the newest version of Tovu. ${AUTO_OFF}`,
    };
    case 'downloading': return {
      type: 'info', message: `Downloading Tovu ${outcome.version}…`,
      detail: `You have ${currentVersion}. Tovu asks you to restart when the download finishes.`,
    };
    case 'available': return {
      type: 'info', message: `Tovu ${outcome.version} is available`,
      detail: `You have ${currentVersion}. ${AUTO_OFF} Turn on Settings › Automatically update Tovu to download and install it.`,
    };
  }
  // Typed cases are exhaustive; preserve undefined fallthrough for untyped callers.
  return undefined as never;
}

/** What the operator reads for each outcome; `ready` reuses the existing prompt instead. */
export function updateCheckNotice(
  { outcome, currentVersion, isPackaged, automaticUpdates, errorMessage = '', errorDetails = '' }: UpdateNoticeArgs,
  _optionalArgs = {},
): UpdateNotice | null {
  switch (outcome.kind) {
    case 'ready': return null;
    case 'unavailable': return isPackaged
      ? { type: 'info', message: 'Updates are off for this copy of Tovu', detail: `Reason: ${outcome.reason}.` }
      : { type: 'info', message: 'Updates only work in the installed app', detail: `This is a development copy of Tovu (${currentVersion}).` };
    case 'error': return { type: 'error', message: 'Couldn’t check for updates', detail: plainUpdateError({ message: errorMessage }) + errorDetails };
    default: return versionUpdateNotice({ outcome, currentVersion, automaticUpdates });
  }
}

/** Redacted for the main-process log with Tovu's secret patterns. */
export function describeUpdateErrorForLog({ error }: { error: unknown }, _optionalArgs = {}): string {
  return formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS);
}

/** Every notice Jini's manual check can show, in Tovu's words, with redacted copyable details. */
export const updateCheckCopy: UpdateCheckCopy = {
  notice: args => updateCheckNotice(args),
  downloadFailed: ({ version, error }) => {
    const failure = formatUserFacingError({ message: `Couldn’t download Tovu ${version}`, action: plainUpdateError({ message: updateErrorMessage({ error }) }, { operation: 'download' }), step: 'Download update', cause: error }, TOVU_ERROR_REDACTION_OPTIONS);
    return { type: 'error', message: `Couldn’t download Tovu ${version}`, detail: `${failure.action}\n\nCopy details:\n${failure.copyText}` };
  },
  checkFailedDetails: ({ error }) => {
    const failure = formatUserFacingError({ message: 'Couldn’t check for updates', action: plainUpdateError({ message: updateErrorMessage({ error }) }), step: 'Check for updates', cause: error }, TOVU_ERROR_REDACTION_OPTIONS);
    return `\n\nCopy details:\n${failure.copyText}`;
  },
};
