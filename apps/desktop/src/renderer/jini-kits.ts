import { SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import type { UiKit } from '@jini-ai/ui/react-kit';

/** The desktop renderer renders ui selects and secret inputs (chat pane, settings); this
 *  binds them to ui-kit's real implementations. Mounted at the root in main.tsx. */
export const uiKit = {
  components: { SecretInput: KitSecretInput },
  hooks: { useOverlayContainer, useSecretReveal },
} satisfies UiKit;
