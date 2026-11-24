import { randomUUID } from "node:crypto";
import type { WidgetEntriesClasses, WidgetPostContentClasses, WidgetRenderHost } from "@jini-ai/cms/public-http/http/site/render/widgets/widget-render-contract";
import { renderImageTag, renderVideoTag } from "@jini-ai/cms/widgets/media-tags";
import { NO_MARKER_ATTRIBUTES } from "@jini-ai/cms/widgets/media-attributes";
import { plausibleMediaRefId } from "@jini-ai/cms/widgets/markers";
import { mediaPublicPath, mediaUrlKey } from "@jini-ai/cms/media/site/public-path";
import { renderGallery } from "@jini-ai/cms/widgets/html/gallery-render";
import { renderMediaRawHtml } from "@jini-ai/cms/widgets/html/media-html";
import { formatDateLabel } from "@jini-ai/cms/widgets/date-label";
import { renderEntryList, renderEntryListStructuredData } from "@jini-ai/cms/listing";
import { COLLECTION_LIST_FAQ_PAGE, isCollectionListLayout } from "@jini-ai/cms/entries/site/contracts";
import { stampFormFieldMaxLengths, renderFormSuccessSlot, renderFormErrorSlot } from "@jini-ai/cms/forms/form-controls";
import { fieldMaxChars } from "@jini-ai/cms/forms/field-length-caps";
import { renderFormCollection, renderHtmlForm, renderHtmlFormBody, renderFormSchemaHash } from "@jini-ai/cms/forms/html-render";
import { logMediaHtmlEvent } from "#src/features/widgets/media-html-log";
import { ENTRY_LIST_ATTRIBUTE } from "#src/features/theme/entry-list-markup";
import { postDisplayDateIso } from "#src/contracts/core/scheduled-publish";
import { FORM_ERROR_CLASS, FORM_CLASS, FORM_RANGE_READOUT_SCRIPT, FORM_BASELINE_STYLE, FORM_PRESENTATION_NAMES } from "#src/server/inbound/public-http/http/site/form-wire-policy";

/** The legacy class names the entries widgets always emitted; the site's theme CSS targets them. */
const LEGACY_ENTRIES_CLASSES: WidgetEntriesClasses = {
  socialList: "widget widget-social-links",
  socialLink: "widget-social-link",
  recentList: "widget widget-recent-entries",
  entrySummary: "widget-entry-summary",
  empty: "widget-empty",
};

/** The legacy class names the `post-content` widget always emitted. */
const LEGACY_POST_CONTENT_CLASSES: WidgetPostContentClasses = { header: "post-detail-header", meta: "post-meta", body: "post-detail-body" };

/** The widget renderers' host collaborators, bound once: Tovu's media tag/URL policy, its Raw HTML
 *  log sink, its entry-list marker attribute, its date policy, and the legacy form class and
 *  `data-tovu-*` hook names its form stylesheet and scripts target. */
export const TOVU_WIDGET_RENDER_HOST: WidgetRenderHost = {
  media: {
    media: { renderImageTag, renderVideoTag, mediaPublicPath, mediaUrlKey, plausibleMediaRefId },
    noMarkerAttributes: NO_MARKER_ATTRIBUTES,
    renderGallery,
    renderMediaRawHtml,
    report: logMediaHtmlEvent,
  },
  entries: { renderEntryList, renderEntryListStructuredData, isCollectionListLayout, collectionListFaqPage: COLLECTION_LIST_FAQ_PAGE, entryListAttribute: ENTRY_LIST_ATTRIBUTE, classes: LEGACY_ENTRIES_CLASSES },
  postContent: { formatDateLabel, postDisplayDateIso, classes: LEGACY_POST_CONTENT_CLASSES },
  contactForm: {
    forms: { stampFormFieldMaxLengths, renderFormSuccessSlot, renderFormErrorSlot, fieldMaxChars, renderFormCollection, renderHtmlForm, renderHtmlFormBody, renderFormSchemaHash },
    presentation: {
      formClass: FORM_CLASS,
      errorClass: FORM_ERROR_CLASS,
      widgetClass: "widget",
      contactFormClass: "widget-contact-form",
      successExtraClass: "widget-contact-form-success",
      errorExtraClass: "widget-contact-form-error",
      submitLabel: "Send",
      successMessageFallback: "Thanks — your message has been sent.",
      baselineStyle: FORM_BASELINE_STYLE,
      rangeReadoutScript: FORM_RANGE_READOUT_SCRIPT,
      fieldClasses: {
        fieldClass: FORM_PRESENTATION_NAMES.fieldClass,
        fieldHelpClass: FORM_PRESENTATION_NAMES.fieldHelpClass,
        errorClass: FORM_PRESENTATION_NAMES.fieldErrorClass,
        fieldCheckboxClass: FORM_PRESENTATION_NAMES.fieldCheckboxClass,
      },
      hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
    },
    newOccurrenceId: randomUUID,
  },
};
