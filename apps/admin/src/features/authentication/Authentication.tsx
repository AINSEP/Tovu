import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import type { ReactElement } from "react";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import type { Translate } from "../../lib/dictionary-translator";
import { providerBackendNote, t as translateAuthentication } from "./authentication-i18n";
import {
  AUTHENTICATION_PROVIDER_SCHEMAS,
  type AuthenticationCredentialFieldSchema,
  type AuthenticationProviderId,
  type AuthenticationProviderSchema,
} from "./model/provider-schemas";

/**
 * @file Provider-specific credential requirements for `/admin/authentication`.
 *
 * Tovu has no provider-authentication API or credential repository contract today (OAuth/OIDC is
 * explicitly out of the current v1 identity surface). This screen therefore renders the exact
 * fields each already-listed provider will need, but keeps the whole credential group disabled and
 * offers no Save/Enable action. That is a security boundary: accepting a secret into browser state
 * before a write-only SecretStore-backed backend exists would create an input path with nowhere
 * safe to send it and would falsely suggest working sign-in.
 */

/**
 * Renders one required credential slot without ever accepting or retaining a value.
 *
 * @param props - Provider identity plus its declarative credential-field metadata.
 * @returns A labelled, described input inherited by the disabled provider fieldset.
 * @throws Never.
 * @complexity Time: O(1). Space: O(1).
 */
function AuthenticationCredentialField(props: {
  providerId: AuthenticationProviderId;
  field: AuthenticationCredentialFieldSchema;
  t: Translate;
}): ReactElement {
  const inputId = `authentication-${props.providerId}-${props.field.key}`;
  const hintId = `${inputId}-hint`;

  return (
    <label className="source-config-field" htmlFor={inputId}>
      <span className="source-config-field-label">
        {props.field.label}
        <span className="source-config-field-required" aria-label={props.t("required")}>
          *
        </span>
      </span>
      <input
        id={inputId}
        type={props.field.kind}
        defaultValue=""
        placeholder={props.field.placeholder}
        required={props.field.required}
        autoComplete={props.field.kind === "password" ? "new-password" : "off"}
        spellCheck={false}
        aria-describedby={hintId}
      />
      <span id={hintId} className="jini-field-hint">
        {props.field.hint}
      </span>
    </label>
  );
}

/**
 * Renders an honest, disabled preview of one provider's required credential bundle.
 *
 * @param props - The provider metadata whose fields should be presented.
 * @returns A provider panel with no persistence or enable action.
 * @throws Never.
 * @complexity Time and space: O(f), where f is the provider's bounded field count.
 */
function AuthenticationProviderPanel(props: { provider: AuthenticationProviderSchema; locale: string; t: Translate }): ReactElement {
  const noteId = `authentication-${props.provider.id}-backend-note`;

  return (
    <section className="jini-settings-section" aria-label={`${props.provider.label} authentication setup`}>
      <p id={noteId} className="settings-ui-inert-note" role="note">
        {providerBackendNote(props.locale, props.provider.label)}
      </p>
      <fieldset
        className="source-config-add-form settings-ui-inert-control"
        disabled
        aria-describedby={noteId}
      >
        <legend className="jini-byok-card-title">{props.t("Required credentials")}</legend>
        {props.provider.fields.map((field) => (
          <AuthenticationCredentialField key={field.key} providerId={props.provider.id} field={field} t={props.t} />
        ))}
      </fieldset>
    </section>
  );
}

/**
 * Explains the current authentication boundary without implying that the provider tabs are live.
 *
 * @returns The static overview panel.
 * @throws Never.
 * @complexity Time: O(1). Space: O(1).
 */
function AuthenticationHomePanel({ t }: { t: Translate }): ReactElement {
  return (
    <section className="jini-settings-section" aria-label={t("Authentication overview")}>
      <p className="settings-ui-inert-note" role="note">
        {t("Tovu currently signs administrators in with a local username and password. A provider authentication backend, secure provider-credential storage contract, callback handling, and token lifecycle are not implemented yet.")}
      </p>
      <div className="jini-settings-section-card">
        <h3 className="jini-byok-card-title">{t("Provider setup preview")}</h3>
        <p className="jini-field-hint">
          {t("Open a provider tab to see the credentials an operator will need once the backend capability exists.")}
        </p>
      </div>
    </section>
  );
}

/**
 * Renders the Authentication page in the same inline settings-shell pattern as the former
 * placeholder, replacing generic coming-soon copy with provider-specific, disabled controls.
 *
 * @returns The tabbed Authentication page.
 * @throws Never.
 * @complexity Time and space: O(p + f), over the bounded provider and credential-field catalogs.
 * @example
 * <Authentication />
 */
export function Authentication(): ReactElement {
  const locale = useAdminLocale();
  const t: Translate = (key) => translateAuthentication(locale, key);
  const tabs: SettingsDialogTab[] = [
    {
      id: "home",
      label: "Home",
      title: t("Authentication"),
      subtitle: t("Review current sign-in support and future provider requirements."),
      panel: <AuthenticationHomePanel t={t} />,
    },
    ...AUTHENTICATION_PROVIDER_SCHEMAS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      title: provider.label,
      subtitle: `${provider.subtitle} Saving and sign-in are not wired yet.`,
      panel: <AuthenticationProviderPanel provider={provider} locale={locale} t={t} />,
    })),
  ];

  return (
    <div className="page">
      {/* Same `.page`/`.page-header` primitive ~39 other admin screens use (see `styles.css`'s own
          comment above `.page-header .page-kicker`). Matches `AiAssistant.tsx`'s pattern exactly:
          this page owns its own header instead of the shell's kicker/title/subtitle strip, so the
          shell's own copy of that header can be hidden rather than stacked as a second, near-
          duplicate heading above the tab strip. */}
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("People")}</p>
          <h1 className="page-title">{t("Authentication")}</h1>
          <p className="page-description">
            {t("Review current sign-in support and future provider requirements.")}
          </p>
        </div>
      </div>

      <I18nProvider
        initialLocale="en"
        dictionaries={SETTINGS_DIALOG_DICTIONARIES}
        fallbackLocale="en"
        syncDocumentAttributes={false}
      >
        {/* `settings-ui-section--page-flow`: the owner's "take Authentication out of the UI card"
            request. `SettingsDialogShell` styles `.jini-tabbed-dialog` as a modal (elevated
            background, border, radius, shadow) — right for Settings, where the shell owns the whole
            viewport, but wrong here, where the page already supplies its own header and background
            above. `--page-flow` is the existing modifier `AiAssistant.tsx` already uses for exactly
            this: it flattens the shell's card chrome and hides its own kicker/title/subtitle strip
            (see that modifier's own comment in `styles.css`), restoring the horizontal measure and
            spacing the card used to supply incidentally. `tabs[].title`/`.subtitle` are left
            unchanged below — the shell still uses them for its accessible naming, this only hides
            the visual duplicate. */}
        <div className="settings-ui-section settings-ui-section--page-flow" data-theme="light">
          <SettingsDialogShell
            tabs={tabs}
            presentation="inline"
            className="jini-tabbed-dialog--inline"
            fullscreenEnabled={false}
            labels={{ kicker: t("People") }}
          />
        </div>
      </I18nProvider>
    </div>
  );
}
