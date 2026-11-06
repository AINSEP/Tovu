# Tovu host guidance for google-forms

These rules specialize the portable plugin guidance for Tovu.


## Host operations for skills/google-forms/SKILL.md

Select with `provider: { id: "google_forms", config: { url: "https://docs.google.com/forms/d/e/<form-id>/viewform" } }` through `forms_update_definition`. Switch back with `provider: { id: "builtin", config: {} }`. Preserve the existing local fields, HTML and historical answers when switching.
