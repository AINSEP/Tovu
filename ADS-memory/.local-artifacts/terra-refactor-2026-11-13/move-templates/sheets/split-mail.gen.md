id: SP-mail-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/mail
precondition: TODO(judge)   # MOVE-AFTER only (label: MIXED)
tovu_files:
  - apps/website/src/platform/mail/adapters/smtp.nodemailer.ts | blob be223fdc0996c57e7d0075bd70e55245ad85a1b5 | blob-guarded | 69 loc
  - apps/website/src/platform/mail/purpose-scoped-mailer.ts | blob bd0a1341a229242d2f9949e12a74d95a0cab1551 | blob-guarded | 31 loc
tovu_tests:
  - apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts | blob d28ec49f94b2550ff46ca15818e99d6f65664019 | TODO(judge)   # move-to-jini | keep-repointed | delete
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts | blob c62c73438071c5bef139b8f9065f1545c31a2d74 | TODO(judge)   # move-to-jini | keep-repointed | delete
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts | blob a76d91c589414baea69123e23e8cf8fd2b2cf2cf | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/platform/mail/adapters/smtp.nodemailer.ts (survey label MIXED; note: DELETE: `SmtpMailerAdapter`, `SmtpMailerAdapterDeps`, positional `SmtpTransport`. The class has 0 prod callers and 2 tests; tests can use the Jini `SmtpMailerAd)
declarations (name | line | kind):
  - SmtpTransport | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:16 | interface
  - SmtpMailerAdapterDeps | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:19 | interface
  - SmtpMailerAdapter | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:25 | class
  - CreateNodemailerSmtpTransportConfig | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:51 | interface
  - createNodemailerSmtpTransport | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:62 | function
  - SmtpMailPayload | apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:13 | re-export (type) from "@jini-ai/platform/mail/smtp"
split:   # one row per declaration above, none omitted
  - SmtpTransport | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - SmtpMailerAdapterDeps | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - SmtpMailerAdapter | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - CreateNodemailerSmtpTransportConfig | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - createNodemailerSmtpTransport | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports: TODO(judge)
shape_changes: TODO(judge)
census_cmd: rg -n --no-heading -e '["'][^"']*smtp\.nodemailer(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/mail/adapters/smtp.nodemailer.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts:6 | static | "../smtp.nodemailer.js"
  - apps/website/src/platform/mail/index.ts:24 | static | "./adapters/smtp.nodemailer.js"
path_literals (rg -F "adapters/smtp.nodemailer", not already importers):
  - -
baselines (json files naming the path): -
jini_target: TODO(judge) (survey names no package)
--- file: apps/website/src/platform/mail/purpose-scoped-mailer.ts (survey label MIXED; note: DELETE: `toJiniMailer`/`toTovuMailer` re-export aliases (lines 18-19). Repoint `index.ts`, `delivery-availability.ts` and `smtp.nodemailer.ts` to `fromPositiona)
declarations (name | line | kind):
  - WrapMailerWithPurposeGateOptions | apps/website/src/platform/mail/purpose-scoped-mailer.ts:12 | interface
  - wrapMailerWithPurposeGate | apps/website/src/platform/mail/purpose-scoped-mailer.ts:24 | function
  - toJiniMailer | apps/website/src/platform/mail/purpose-scoped-mailer.ts:18 | re-export from "@jini-ai/platform/mail"
  - toTovuMailer | apps/website/src/platform/mail/purpose-scoped-mailer.ts:18 | re-export from "@jini-ai/platform/mail"
split:   # one row per declaration above, none omitted
  - WrapMailerWithPurposeGateOptions | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
  - wrapMailerWithPurposeGate | TODO(judge) MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE
ports: TODO(judge)
shape_changes: TODO(judge)
census_cmd: rg -n --no-heading -e '["'][^"']*purpose\-scoped\-mailer(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/mail/purpose-scoped-mailer.ts
importers (5 prod, 2 test; resolved to this file):
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts:12 | static | "../../purpose-scoped-mailer.js"
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts:4 | static | "../../purpose-scoped-mailer.js"
  - apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:12 | static | "../purpose-scoped-mailer.js"
  - apps/website/src/platform/mail/delivery-availability.ts:4 | static | "./purpose-scoped-mailer.js"
  - apps/website/src/platform/mail/index.ts:31 | reexport | "./purpose-scoped-mailer.js"
  - apps/website/src/server/runtime/composition/app.ts:281 | static | "#src/platform/mail/purpose-scoped-mailer"
  - apps/website/src/server/runtime/composition/deps.ts:385 | static | "#src/platform/mail/purpose-scoped-mailer"
path_literals (rg -F "mail/purpose-scoped-mailer", not already importers):
  - apps/website/src/contracts/core/__tests__/extract-s3-host-source.unit.test.ts:16:  assert.doesNotMatch(read('platform/mail/purpose-scoped-mailer.ts'), /JiniMailerPort/);
  - apps/website/src/server/runtime/boot/mail-delivery-policy.ts:22: * to the next message. The purpose gate (`platform/mail/purpose-scoped-mailer.ts`) still wraps the
baselines (json files naming the path): -
jini_target: TODO(judge) (survey names no package)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
jini_code: TODO(judge)
jini_index: TODO(judge)
tovu_reduced: TODO(judge)
binding_edits: TODO(judge)
tests_split: TODO(judge)
