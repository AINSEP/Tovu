id: DL-mail-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/mail
tovu_file: apps/website/src/platform/mail/mail-status.ts | blob dd531e9630859a733fdd24103029e3777086ed51
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "mail-status" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/mail/mail-status.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*mail\-status(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/mail/mail-status.ts
importers (3 prod, 4 test; resolved to this file):
  - apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts:8 | static | "#src/platform/mail/mail-status"
  - apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts:10 | static | "../../../platform/mail/mail-status.js"
  - apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts:9 | static | "../../../platform/mail/mail-status.js"
  - apps/website/src/platform/mail/index.ts:29 | static | "./mail-status.js"
  - apps/website/src/server/__tests__/routes/mail-providers-route.test.ts:15 | static | "#src/platform/mail/mail-status"
  - apps/website/src/server/routes/types.ts:673 | dynamic | "#src/platform/mail/mail-status"
  - apps/website/src/server/routes/types.ts:676 | dynamic | "#src/platform/mail/mail-status"
path_literals (rg -F "mail/mail-status", not already importers):
  - apps/admin/src/features/email/email-api.ts:15:// --- providers (`platform/mail/mail-status.ts`) ---------------------------------------------
baselines (json files naming the path): -
declarations (name | line | kind):
  - MailProviderControl | apps/website/src/platform/mail/mail-status.ts:12 | interface
  - MailStatusReport | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
  - MailProviderError | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
  - MailProviderField | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
  - MailProviderSetup | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
  - MailProviderConfiguration | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
  - MailProviderConfigurationReport | apps/website/src/platform/mail/mail-status.ts:6 | re-export (type) from "@jini-ai/platform/mail"
folds: TODO(judge)
tests:
  - apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts | blob 7a9ae8b39168ab302bbbd6e5e8beaeb3be16aff2 | TODO(judge) delete|repoint
  - apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts | blob 4a9c02ed622520661c45c3bbd6c6859327ef7f57 | TODO(judge) delete|repoint
  - apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts | blob 1ef8299f320a25e0994921e9e3ff42b03b73318e | TODO(judge) delete|repoint
  - apps/website/src/server/__tests__/routes/mail-providers-route.test.ts | blob 7347af41e17ef25610abe277c76363def0f0b5c6 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
