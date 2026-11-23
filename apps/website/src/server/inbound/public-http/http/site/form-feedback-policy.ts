import { FORM_SUCCESS_CLASS, FORM_ERROR_CLASS } from "./form-presentation-assets.js";
import { formValidationMessages as renderValidationMessages, formDocumentLocale } from "@jini-ai/cms/forms/validation-messages";
import { inspectFormLabels } from "@jini-ai/cms/public-http/http/site/form-label-inspection";
import { FORM_VALIDATION_COPY, formValidationCopy } from "@jini-ai/cms/public-http/http/site/form-validation-i18n";
import { FORM_SUBMISSION_TOO_FAST_MESSAGE } from "@jini-ai/cms/forms/html-render";

export const FORM_RESULT_MARKUP = {
  successClass: FORM_SUCCESS_CLASS,
  errorClass: FORM_ERROR_CLASS,
  fieldErrorClass: "widget-form-field-error",
  hooks: { form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
};

export const FORM_FEEDBACK = {
  validationMessages: ({ html, formHtml, errors }: {
    html: string; formHtml: string; errors: ReadonlyArray<{ field: string; reason: string }>;
  }, _optional = {}) => formValidationMessages({ formHtml, errors, locale: formDocumentLocale({ html }) }),
  validationSummary: "Please fix the highlighted fields below.",
  tooFast: FORM_SUBMISSION_TOO_FAST_MESSAGE,
  rateLimited: ({ retryAfterSeconds }: { retryAfterSeconds: number }, _optional = {}): string => {
    const plural = retryAfterSeconds === 1 ? "" : "s";
    return `Too many submissions — please try again in ${retryAfterSeconds} second${plural}.`;
  },
  error: "Something went wrong — please try again.",
};

function englishPhrase({ label }: { label: string }, _optional = {}): string {
  if (label.toLowerCase() === "email") return "your email";
  if (/^Your\s/.test(label)) return "your" + label.slice(4);
  return label;
}

export function formValidationMessages(
  { formHtml, errors, locale }: { formHtml: string; errors: ReadonlyArray<{ field: string; reason: string }>; locale: string },
  _optional = {},
): Array<{ field: string; message: string }> {
  return renderValidationMessages({ formHtml, errors, locale, inspect: inspectFormLabels,
    resolveCopy: ({ locale }, _optional = {}) => {
      const copy = formValidationCopy({ locale });
      return { copy, ...(copy === FORM_VALIDATION_COPY.en ? { normalizeLabel: englishPhrase } : {}) };
    },
  });
}
