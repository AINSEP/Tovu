# Shared admin components (host side)

## Wiring

- `MediaPickerDialog/MediaPickerDialog.tsx` calls the Jini `useJiniMediaPicker` with
  `jiniMediaPickerHostArgs` (`port: defaultMediaPickerPort`, `errorRedaction:
  TOVU_ERROR_REDACTION_OPTIONS`, `errorIdOf` reading `ApiError.body.errorId`) plus
  `picker: useHostMediaPicker()`.
- `MediaEditDialog/MediaEditDialog.hooks.tsx` keeps `useWiredMediaEditDialog`, which passes the
  media dictionary `translate`, `describeHtmlAttributeError` and the embed policy to the Jini
  `useMediaEditDialog`.
- `WidgetConfigFields/HtmlAttributeRows.tsx` passes the `media-content-rules` parser, serializer and
  allowlist check to the Jini `useHtmlAttributeRows`. `lib/widget-embed-extension.tsx` mounts the Jini
  `PlacementContentFields` with `ContentEditor={MediaContentEditor}` and imports
  `styles/media-content-editor.css`; `styles.css` styles `jini-widget-embed-content-choice > .jini-field-label`.
- `TemplateSource`: the editors mount the Jini `ViewTemplateButton`; `styles.css` styles
  `jini-view-template-btn` as an alias of `.view-template-btn`.
