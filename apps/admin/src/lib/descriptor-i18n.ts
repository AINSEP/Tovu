import type {
  AdminDescriptorI18n,
  AdminPublishTargetCredentialSpec,
  AdminPublishTargetDescriptor,
  AdminPublishTargetField,
  AdminSourceControlProviderDescriptor,
} from "./api";

/**
 * @file Renders a plugin descriptor's own text (host labels, help, credential guidance) in the
 * viewer's locale, from the `i18n` block the plugin ships beside it (`{ locale: { English: translation } }`,
 * see the server's `features/agent-plugins/descriptor-i18n.ts`). The admin names no host string: a
 * plugin translates its own copy, and any string without a translation stays in its English.
 *
 * Applied once where a hook receives descriptors ({@link localizePublishTargets},
 * {@link localizeSourceControlProviders}), so every component downstream renders translated text
 * without a lookup of its own. Pure.
 */

/**
 * One descriptor string in `locale`: the exact locale's entry, else its base language's (`pt` for
 * `pt-BR`), else the English it was given.
 *
 * @complexity O(1).
 */
export function descriptorText(i18n: AdminDescriptorI18n | undefined, locale: string, english: string): string {
  if (i18n === undefined) return english;
  const exact = i18n[locale]?.[english];
  if (exact !== undefined) return exact;
  const base = locale.split("-")[0] ?? locale;
  return (base !== locale ? i18n[base]?.[english] : undefined) ?? english;
}

type Text = (english: string) => string;

function localizeField(field: AdminPublishTargetField, text: Text): AdminPublishTargetField {
  return {
    ...field,
    label: text(field.label),
    ...(field.help !== undefined ? { help: text(field.help) } : {}),
    ...(field.userHelp !== undefined ? { userHelp: text(field.userHelp) } : {}),
  };
}

function localizeCredential<C extends { help?: string; userHelp?: string; fields: AdminPublishTargetField[] }>(credential: C, text: Text): C {
  return {
    ...credential,
    ...(credential.help !== undefined ? { help: text(credential.help) } : {}),
    ...(credential.userHelp !== undefined ? { userHelp: text(credential.userHelp) } : {}),
    fields: credential.fields.map((field) => localizeField(field, text)),
  };
}

/**
 * Publish targets with their person-facing text in `locale`. Ids, field names and URLs are untouched.
 * `undefined` (not yet loaded) stays `undefined`.
 *
 * @complexity O(t·f) in targets times declared fields.
 */
export function localizePublishTargets(targets: readonly AdminPublishTargetDescriptor[] | undefined, locale: string): AdminPublishTargetDescriptor[] | undefined {
  return targets?.map((target) => {
    const text: Text = (english) => descriptorText(target.i18n, locale, english);
    const credential: AdminPublishTargetCredentialSpec | undefined =
      target.credential === undefined
        ? undefined
        : {
            ...localizeCredential(target.credential, text),
            ...(target.credential.vendorLabel !== undefined ? { vendorLabel: text(target.credential.vendorLabel) } : {}),
          };
    return {
      ...target,
      label: text(target.label),
      configFields: target.configFields.map((field) => localizeField(field, text)),
      ...(credential !== undefined ? { credential } : {}),
      ...(target.projectName !== undefined
        ? { projectName: { label: text(target.projectName.label), ...(target.projectName.help !== undefined ? { help: text(target.projectName.help) } : {}) } }
        : {}),
    };
  });
}

/**
 * Source-control hosts with their person-facing text in `locale`. Ids, field names and URLs are
 * untouched.
 *
 * @complexity O(p·f) in hosts times declared fields.
 */
export function localizeSourceControlProviders(
  providers: readonly AdminSourceControlProviderDescriptor[],
  locale: string,
): AdminSourceControlProviderDescriptor[] {
  return providers.map((provider) => {
    const text: Text = (english) => descriptorText(provider.i18n, locale, english);
    return {
      ...provider,
      label: text(provider.label),
      ...(provider.credential !== undefined ? { credential: localizeCredential(provider.credential, text) } : {}),
    };
  });
}
