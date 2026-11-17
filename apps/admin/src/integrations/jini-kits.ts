import { Badge, Button, ConfirmDialog, Dialog, IconButton, Menu, Notice, Select, Spinner, Switch, Tabs, TextArea, TextField, useConfirmController, SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import { useNativeDialog } from '@jini-ai/ui-kit/react/native';
import { SecretInput, useAgentHandle, useMediaProvidersTab, sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel,
  isProviderBaseUrlInvalid, invalidBaseUrlProviderIds } from '@jini-ai/ui';
import { ErrorNotice, useAsyncAction, useDirtyGuard, useFocusTrap, useSettlementGeneration } from '@jini-ai/ui/panel-kit';
import { InfoTip, Lightbox, Select as WidgetSelect } from '@jini-ai/ui/admin-widgets';
import { TabBar } from '@jini-ai/ui/tab-strip';
import { InteractiveHtmlEditor } from '@jini-ai/ui/html-editor';
import { applyAdminTheme, defaultAdminTheme, resolveColorScheme } from '@jini-ai/ui/theme';
import { useCachedLoader, useFetchMutation, useFetchQuery, useFetchQueryScope, useInvalidate } from '@jini-ai/ui/fetch-query';
import { ConfirmDialog as AdminConfirmDialog, RowMenu } from '@jini-ai/admin/react';
import type { AdminKit } from '@jini-ai/admin/react/kit';
import type { UserManagementKit } from '@jini-ai/user-management/react/kit';
import type { UiKit } from '@jini-ai/ui/react-kit';

/** Tovu picks the implementations; @jini-ai/admin only states what it renders. ui-kit facades (not
 *  raw native parts) so Tovu's <KitProvider> still supplies agent attrs, overlay container and guards.
 *  A ui/ui-kit prop change that breaks admin fails typecheck HERE, at `satisfies`. */
export const adminKit = {
  components: { Button, IconButton, TextField, TextArea, Select, Switch, Dialog, ConfirmDialog, Tabs, Menu, Notice, Spinner, Badge,
    InfoTip, Lightbox, WidgetSelect, TabBar, HtmlEditor: InteractiveHtmlEditor, ErrorNotice },
  hooks: { useAgentHandle, useFocusTrap, useDirtyGuard, useSettlementGeneration, useConfirmController, useNativeDialog },
  query: { useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader, useFetchQueryScope },
  mediaProviders: { useMediaProvidersTab, rules: { sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel, isProviderBaseUrlInvalid, invalidBaseUrlProviderIds } },
  theme: { applyAdminTheme, resolveColorScheme, defaultAdminTheme },
} satisfies AdminKit;

/** ui's own kit (selects and secret inputs): ui-kit's real implementations. The alias keeps ui-kit's
 *  `SecretInput` apart from ui's own component of the same name. ui-kit's `useOverlayContainer` keeps
 *  the `document.body` fallback, so behaviour inside the provider matches the old direct import. */
export const uiKit = {
  components: { SecretInput: KitSecretInput },
  hooks: { useOverlayContainer, useSecretReveal },
} satisfies UiKit;

/** user-management's own kit. Its screens used to import these straight from `ui` and `admin`; the real
 *  implementations are unchanged. `ConfirmDialog` is admin's (body, confirmLabel, tone), not the ui-kit one in
 *  `adminKit`, and `SecretInput` is `ui`'s i18n-aware wrapper, not the ui-kit one in `uiKit`. A prop change that
 *  breaks user-management fails typecheck HERE, at `satisfies`. */
export const userManagementKit = {
  components: { SecretInput, InfoTip, RowMenu, ConfirmDialog: AdminConfirmDialog },
  hooks: { useFetchQuery, useFetchMutation, useAsyncAction, useCachedLoader, useInvalidate },
} satisfies UserManagementKit;
