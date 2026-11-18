import { SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import type { UiKit } from '@jini-ai/ui/react-kit';
import { AgentIcon, RemixIcon, SearchableModelSelect, SecretInput, SecretTextarea, WorkingDirPicker, infoTipBubbleStyle, useAgentHandle, useFileDropTarget, useInfoTip } from '@jini-ai/ui';
import { InfoTip } from '@jini-ai/ui/admin-widgets';
import { useFocusTrap } from '@jini-ai/ui/panel-kit';
import { TabBar } from '@jini-ai/ui/tab-strip';
import { useOverlayContainer as useUiOverlayContainer } from '@jini-ai/ui/react-kit';
import { concreteModelOptions, modelIdentityKind, modelReasoningOptions } from '@jini-ai/agent-runtime/model-selection';
import { assessNativeToolPolicy } from '@jini-ai/agent-runtime/native-tool-policy';
import type { ChatKit } from '@jini-ai/chat/react';

/** The desktop renderer renders ui selects and secret inputs (chat pane, settings); this
 *  binds them to ui-kit's real implementations. Mounted at the root in main.tsx. */
export const uiKit = {
  components: { SecretInput: KitSecretInput },
  hooks: { useOverlayContainer, useSecretReveal },
} satisfies UiKit;

/** Chat's UI and agent-policy contract, bound to ui and the real agent runtime. A ui prop change that breaks
 *  chat fails typecheck HERE, at `satisfies`. Mounted at the root in main.tsx beside the surfaces. */
export const chatKit = {
  components: { TabBar, InfoTip, RemixIcon, AgentIcon, SecretInput, SecretTextarea, SearchableModelSelect, WorkingDirPicker },
  hooks: { useAgentHandle, useOverlayContainer: useUiOverlayContainer, useInfoTip, useFileDropTarget, useFocusTrap },
  styles: { infoTipBubbleStyle },
  agents: { modelIdentityKind: ({ id }) => modelIdentityKind(id), concreteModelOptions, modelReasoningOptions, assessNativeToolPolicy },
} satisfies ChatKit;
