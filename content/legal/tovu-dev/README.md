# Tovu site legal copy

These HTML fragments are the reviewable copies of the `privacy-policy` and `terms-of-service`
content rows in `sites/tovu-dev/content.seed.db`. The local `content.db` rows were also updated
on 2026-10-04. The CMS serves the database rows; changing a fragment alone does not publish it.

Owner inputs: US$0 liability cap, California law, Los Angeles County, California venue,
`tovu.dev`, the existing `/contact#send-a-message` form, and 90-day deletion of form submission
IP addresses. Each page contains one unresolved identity field, `[[OWNER NAME]]`.
Existing legal clauses and the original effective date were preserved; the last-updated date
is 2026-10-04. Both pages have an `#ai-disclosure` section and a “Report AI content” form link.

The form-IP cleanup worker has a staged nullable-IP migration and Jini release dependency.
The wording records the owner's retention rule; coordinate deployment with that worker's
handoff before treating cleanup as active. No schema or migration was changed by this copy edit.

The active Quartz legal templates in `content/themes/static/` and
`sites/tovu-dev/themes/static/` carry the same owner inputs. Original theme archives and
historical backup snapshots were left intact.

Regression tests are in `development/scripts/__tests__/legal-owner-inputs.unit.test.ts`.
They have not been run. They check owner inputs, the seeded contact form destination,
HTML/seed parity, preserved sections, and active theme copies.
