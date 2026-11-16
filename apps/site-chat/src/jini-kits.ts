import { SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import type { UiKit } from '@jini-ai/ui/react-kit';

/** The site chat renders ui selects and secret inputs (chat QuestionForm, runtime picker); this
 *  binds them to ui-kit's real implementations. Mounted at the root in main.tsx. */
export const uiKit = {
  components: { SecretInput: KitSecretInput },
  hooks: { useOverlayContainer, useSecretReveal },
} satisfies UiKit;
