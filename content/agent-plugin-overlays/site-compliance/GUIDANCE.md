# Tovu host guidance for site-compliance

These rules specialize the portable plugin guidance for Tovu.


## Host operations for skills/site-compliance/SKILL.md

Call `site_get_profile` for the sections you need — typically `pages`, `settings`, `theme`,
`plugins`, `contentTypes`. Prefer a narrow `sections` list; a full profile is mostly context
you will not cite.

If `site_get_profile` is not available in this deployment at all, say so plainly and continue with
Step 2 alone. Rendered evidence without configuration context is still real evidence; what you lose
is the ability to cross-check a configuration claim against it, and that loss belongs in the "What
was NOT inspected" section.

Call `site_collect_page_evidence` for each in-scope page path. It loads **this site's own**
published pages in a real browser and returns what was actually observed. It refuses
off-origin URLs, caps how many pages and how long it will run, never submits a form, and
never persists what it captured.


## Host operations for skills/site-compliance/references/gdpr-eu-uk.md

**Observe with:** `site_collect_page_evidence`, first with no `consentAcceptSelector` (everything
returns phase `before`), then again with one.
