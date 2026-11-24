import { reactModuleUi, type LazyTabView } from '@jini-ai/admin/core/react';
import type { HostModulePage } from './module-context';
import { createElement, useMemo, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { security } from '@jini-ai/admin/security/react';
import { OnboardingChipField } from '@jini-ai/ui';
import { ErrorNotice } from '@jini-ai/ui/panel-kit';
import { TotpSettings, PasskeySettings, RecoveryCodesCard, useOwnerRecoveryKit, useDesktopOwnerReset, createOwnerRecoveryKitDownload, useRecoveryKit, useOwnerPasswordReset, type OwnerRecoveryHookArgs, type OwnerRecoveryPort, type PasskeySettingsPort, type TotpSettingsPort } from '@jini-ai/user-management/react';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import { ownerMfaPort, ownerPasskeySettingsPort, ownerRecoveryPort, ownerRecoveryFailure } from '../../lib/owner-clients';
import { createSecurityTranslator, describeSecurityError, onSecurityCredentialsChanged, securityRefreshSignal } from './security-ports';
import { t as translateSecurity } from './security-i18n';
import { AccessTokensIcon, SiteKeyIcon } from './security-visuals';
import { useModulePanel } from './modules.hooks';

/** The owner account controls shown above the tabs; the host's real clients by default. */
export interface SecurityOwnerPorts { mfa: TotpSettingsPort; recovery: OwnerRecoveryPort; passkeys: PasskeySettingsPort }
const hostOwnerPorts: SecurityOwnerPorts = { mfa: ownerMfaPort, recovery: ownerRecoveryPort, passkeys: ownerPasskeySettingsPort };
/** The root-key Copy's clipboard (a required Security input). Resolved at copy time, so a missing or denied
 * browser clipboard fails silently inside the copy. */
const browserClipboard = { writeText: (text: string) => globalThis.navigator.clipboard.writeText(text) };

// The card imports no hook: the host binds each recovery controller to its inner owner hook.
const useHostRecoveryKit = (args: OwnerRecoveryHookArgs) => useOwnerRecoveryKit(args, { useJiniRecoveryKitHook: useRecoveryKit });
const useHostDesktopOwnerReset = (args: OwnerRecoveryHookArgs) => useDesktopOwnerReset(args, { useOwnerPasswordResetHook: useOwnerPasswordReset });

type SecurityFeature = ReturnType<typeof security<HostModulePage, LazyTabView>>;
// The host Provider wraps the package Provider, so its element type is host-owned.
type HostSecurityModule = Omit<SecurityFeature, 'react'> & {
  react: Omit<SecurityFeature['react'], 'Provider'> & { Provider: ComponentType<{ admin: Parameters<SecurityFeature['react']['Provider']>[0]['admin']; children: ReactNode }>; loadingContent: ReactElement };
};

/** Today's order (TOTP, recovery codes, passkeys), each translated through the host dictionary. */
function OwnerControls({ locale, ports }: { locale: string; ports: SecurityOwnerPorts }): ReactElement {
  const translate = useMemo(() => (key: string) => translateSecurity({ locale, key }), [locale]);
  return createElement('div', null,
    createElement(TotpSettings, { port: ports.mfa, translate }),
    createElement(RecoveryCodesCard, { port: ports.recovery, describeFailure: ownerRecoveryFailure, FailureNotice: ErrorNotice, filename: 'tovu-owner-recovery-codes.txt', t: translate,
      createDownloadHook: createOwnerRecoveryKitDownload, useRecoveryKitHook: useHostRecoveryKit, useDesktopOwnerResetHook: useHostDesktopOwnerReset }),
    createElement(PasskeySettings, { port: ports.passkeys, translate }));
}

/** Compose live Security localization, owner controls and host slots without rebuilding the module.
 * @returns Stable Provider/page bindings; a locale change keeps the mounted tab and its controllers.
 * @example createHostSecurityModule({});
 */
export function createHostSecurityModule({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }, { ownerPorts = hostOwnerPorts }: { ownerPorts?: SecurityOwnerPorts } = {}): HostSecurityModule {
  const feature = security({ ui: reactModuleUi, ChipField: OnboardingChipField, clipboard: browserClipboard }, {
    t: createSecurityTranslator({ locale: 'en' }),
    // The host never generates a site key in the browser; its env var and confirm flow stay as before.
    rootKeyTab: { generate: 'hidden', defaultEnvVarName: 'TOVU_SITE_KEY', previewRequired: false },
    tabIcons: { 'access-tokens': createElement(AccessTokensIcon, { size: 16 }), 'root-key': createElement(SiteKeyIcon, { size: 16 }) },
    refreshSignal: securityRefreshSignal, onCredentialsChanged: onSecurityCredentialsChanged, describeCredentialError: describeSecurityError,
  });
  const ScopeProvider = feature.react.Provider;
  function Provider({ admin, children }: { admin: Parameters<typeof ScopeProvider>[0]['admin']; children: ReactNode }) {
    const locale = useAdminLocaleHook({}, {});
    const t = useMemo(() => createSecurityTranslator({ locale }), [locale]);
    const ownerControls = useMemo(() => createElement(OwnerControls, { locale, ports: ownerPorts }), [locale]);
    return createElement(ScopeProvider, { admin, t, ownerControls, children });
  }
  return { ...feature, react: { ...feature.react, Provider, loadingContent: createElement(SecurityModuleLoading, { useAdminLocaleHook }) } };
}

/** A translated status line before the host scope or lazy page is available. */
export function SecurityModuleLoading({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }): ReactElement {
  const locale = useAdminLocaleHook({}, {});
  return createElement('p', { role: 'status' }, createSecurityTranslator({ locale })('loading'));
}

/** Mount the `/access-tokens` route through the host's Jini module scope; `tabId` is the route's `?tab=`. */
export function SecurityModulePanel({ tabId }: { tabId?: string | null }, _optional: Record<string, never> = {}): ReactNode {
  const query = new URLSearchParams(tabId ? { tab: tabId } : {});
  return useModulePanel({ moduleId: 'security', pageId: 'secrets', route: { view: null, params: {}, query } },
    { loadingContent: createElement(SecurityModuleLoading) }).content;
}
