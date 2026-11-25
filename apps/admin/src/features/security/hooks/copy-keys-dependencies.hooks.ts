import { useCopyKeys, type CopyKeysController } from '@jini-ai/admin/security/host/hooks/use-copy-keys.hooks';
import { securityApi } from '@/features/security/security-host-ports';
import { publishContentRefresh } from '@jini-ai/admin/shell/lib/content-refresh-bus';
import { ACCESS_TOKENS_RESOURCE } from '../rules';

import { type Translate } from '@jini-ai/core/text';

/** Tovu's saved-key source and its redacted picker failures; the picker itself is host-neutral. */
export const copyKeysHostPolicy = {
  sourceSiteId: 'shared-keys',
  loadFailed: "Couldn't load Shared Keys. Open Shared Keys and try again. Details: P25_KEY_PICKER_LOAD_FAILED; secret values omitted.",
  grantFailed: 'Using the saved key failed. Reopen Shared Keys and choose the key again. Details: P25_KEY_GRANT_FAILED; secret values omitted.',
};

/** A granted key changes the Access Tokens list, so refresh that resource once per success. */
export function notifyCopyKeysGranted(_required: Record<string, never>, _optional: Record<string, never> = {}): void {
  publishContentRefresh({ resources: [ACCESS_TOKENS_RESOURCE] });
}

/** Browser and desktop use the same owner-authenticated HTTP port. */
export function useWiredCopyKeys({ t }: { t: Translate }, _optional: Record<string, never> = {}): CopyKeysController {
  return useCopyKeys({ t, port: securityApi, onGranted: notifyCopyKeysGranted, sharedKeys: copyKeysHostPolicy });
}
