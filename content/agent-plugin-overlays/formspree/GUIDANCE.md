# Tovu host guidance for formspree

These rules specialize the portable plugin guidance for Tovu.


## Host operations for skills/formspree/SKILL.md

Set `provider: { id: "formspree", config: { endpoint: "https://formspree.io/f/<form-id>" } }` using `forms_update_definition`. Switch back with `provider: { id: "builtin", config: {} }`. Never replace the form's fields or HTML to switch providers.
