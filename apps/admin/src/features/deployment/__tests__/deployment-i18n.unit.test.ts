import { describe, expect, it } from "vitest";

import {
  deploymentOverviewLoadErrorMessage,
  dockerfileLoadErrorMessage,
  dockerfileSaveErrorMessage,
  exportLoadErrorMessage,
  exportTriggerErrorMessage,
  exportPollErrorMessage,
  publishLoadErrorMessage,
  publishPreviewErrorMessage,
  publishTriggerErrorMessage,
  publishPollErrorMessage,
  publishCredentialsLoadErrorMessage,
  publishCredentialSaveErrorMessage,
  publishCredentialVerifyErrorMessage,
} from "../deployment-i18n";

/**
 * @file Coverage for deployment-i18n.tsx's thirteen `{error}`-carrying message functions' own
 * `TEMPLATE[locale] ?? TEMPLATE.en` fallback. Every existing caller across this feature's hooks
 * renders through `useAdminLocale()`, which resolves to a real, dictionary-covered locale in every
 * test fixture here (usually `"en"` itself) — none has ever called one of these with a locale absent
 * from its own template map, so the fallback arm (the one path that matters if a new locale is added
 * to the flat `DEPLOYMENT_DICT` above these but a translator hasn't reached these long-tail
 * templates yet) was unexercised for all thirteen. Table-driven since the shape is identical across
 * all thirteen — this is a mechanical fallback check, not scenario logic worth writing out by hand.
 */

const UNSUPPORTED_LOCALE = "xx";

const CASES: Array<{ name: string; fn: (locale: string, error: string) => string; en: string }> = [
  { name: "deploymentOverviewLoadErrorMessage", fn: deploymentOverviewLoadErrorMessage, en: "Could not load deployment status ({error})." },
  { name: "dockerfileLoadErrorMessage", fn: dockerfileLoadErrorMessage, en: "Could not load the Dockerfile ({error})." },
  { name: "dockerfileSaveErrorMessage", fn: dockerfileSaveErrorMessage, en: "Could not save the Dockerfile ({error})." },
  { name: "exportLoadErrorMessage", fn: exportLoadErrorMessage, en: "Could not load the export status ({error})." },
  { name: "exportTriggerErrorMessage", fn: exportTriggerErrorMessage, en: "Could not start the export ({error})." },
  {
    name: "exportPollErrorMessage",
    fn: exportPollErrorMessage,
    en: "Lost track of this export's status and stopped checking ({error}). It may still be running — try again in a moment.",
  },
  { name: "publishLoadErrorMessage", fn: publishLoadErrorMessage, en: "Could not load the publish status ({error})." },
  { name: "publishPreviewErrorMessage", fn: publishPreviewErrorMessage, en: "Could not check this target ({error})." },
  { name: "publishTriggerErrorMessage", fn: publishTriggerErrorMessage, en: "Could not start the publish ({error})." },
  {
    name: "publishPollErrorMessage",
    fn: publishPollErrorMessage,
    en: "Lost track of this publish's status and stopped checking ({error}). It may still be running — try again in a moment.",
  },
  { name: "publishCredentialsLoadErrorMessage", fn: publishCredentialsLoadErrorMessage, en: "Could not load publish credentials ({error})." },
  { name: "publishCredentialSaveErrorMessage", fn: publishCredentialSaveErrorMessage, en: "Could not save this token ({error})." },
  { name: "publishCredentialVerifyErrorMessage", fn: publishCredentialVerifyErrorMessage, en: "Could not verify this token ({error})." },
];

describe("deployment-i18n error-message templates — unsupported-locale fallback", () => {
  it.each(CASES)("$name falls back to the English template for an unsupported locale", ({ fn, en }) => {
    expect(fn(UNSUPPORTED_LOCALE, "disk full")).toBe(en.replace("{error}", "disk full"));
  });

  it.each(CASES)("$name still renders the requested locale when it IS covered (en itself)", ({ fn, en }) => {
    expect(fn("en", "disk full")).toBe(en.replace("{error}", "disk full"));
  });
});
