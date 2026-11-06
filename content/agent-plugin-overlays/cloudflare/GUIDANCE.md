# Tovu host guidance for cloudflare

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/cloudflare/SKILL.md

Open the plugin’s own card for the selected destination: `credential_save {kind:"plugin-provider",target:"cloudflare-workers"}` or `credential_save {kind:"plugin-provider",target:"cloudflare-pages"}`. Each card explains its permissions and collects the Account ID and optional Zone ID along with the masked token. Read `references/permissions.md` before requesting custom-domain access.

Keep one saved vendor connection: kind `vendor`, vendor `cloudflare`, encrypted
`{token, accountId, zoneId?}`. Open `credential_save` with kind `plugin-provider` and the selected target;
people enter secrets in its secure form, never chat. Keep existing Pages-only `worksFor` compatibility.
To add Workers/DNS capabilities, the person must explicitly update permissions/compatibility on that
same credential. Token active status alone proves no capability's permissions.
If the person asks to replace a token, list the exact permissions needed for the requested
operation from the permissions table and limit it to the selected account/zones. For a
Workers-only static publish, request Workers Scripts: Edit; add D1: Edit only for active forms.
For Pages-only publishing, request Cloudflare Pages: Edit. Add domain permissions only when needed.
Offer to help enable workers.dev when the chosen deployment needs it. If the account has no
subdomain, guide the person through Workers & Pages setup; never invent one or enable it silently.


## Host details for skills/cloudflare/references/workers.md

When the site has at least one active form, the same Worker also receives `POST /forms/:slug/submit`
(the path the host's forms already post to, so exported HTML is unchanged and there is no CORS). Publishing
finds or creates D1 database `tovu-forms-<script name>`, applies the plugin's forward-only migrations
(`schema_migrations`), binds it as `TOVU_FORMS`, installs the per-site receiver key as secret
`TOVU_FORMS_SECRET`, and routes `/forms/*` and `/_tovu/*` to the Worker before static assets. The
database is never dropped or recreated. The receiver checks only the compact manifest the host supplies
(slugs, field names, required, max length), honours the host's `_hp` honeypot and rate-limits to 5 valid
submissions per IP per form per 60 seconds; the host re-validates on pull. No file uploads. The host pulls
pending rows through `GET /_tovu/forms/pending` and `POST /_tovu/forms/ack` with the receiver key.
After a submission the visitor returns to the page with `?form=<slug>&form_status=success`. Pages
that contain a form are also routed to the Worker first (exact paths only; assets and other pages stay
on the free static path), which hides the form and shows the host's own success message, or one plain
"Thanks, your submission was received." line when the page has none.
Needs **Account → D1 → Edit** on the saved token; preview names it when missing. Pages sites with
forms are not supported yet; preview says so.
The receiver is form destination `cloudflare-d1` (co-hosted on Workers); the site's `core.forms`
`receiver` setting keeps it on with `auto` (the default) and turns it off with `none`.


## Host operations for skills/cloudflare/SKILL.md

Use `deployment_get_static_publish_capabilities` → `deployment_preview_static_publish` →
`deployment_execute_static_publish`. Prefer **Workers** (`cloudflare-workers`) for a **new** destination.
Keep **Pages** (`cloudflare-pages`) for existing Pages history/bindings or an explicit Pages choice.
A plugin upgrade never moves an existing site between products. Use `lastPublish` and the exact
`resourceName` from its config. Never guess a workers.dev account subdomain.
