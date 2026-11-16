id: DD-mail-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/mail
precondition: TODO(judge)   # MOVE-AFTER only (label: DEDUPE)
tovu_files:
  - apps/website/src/platform/mail/ports.ts | blob 4bb5a6cb47d39018c4f66e5aa07350961201c4af | blob-guarded | 20 loc
tovu_tests:
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts | blob c62c73438071c5bef139b8f9065f1545c31a2d74 | TODO(judge)   # move-to-jini | keep-repointed | delete
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts | blob a76d91c589414baea69123e23e8cf8fd2b2cf2cf | TODO(judge)   # move-to-jini | keep-repointed | delete
  - apps/website/src/platform/mail/__tests__/unit/sender-identity.unit.test.ts | blob d8e217e3a1fd7de6ed1d96d80c45acec13d7db7e | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/platform/mail/ports.ts (survey label DEDUPE; note: `MailerPort` → `export type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail"` (exact shape match with `Jini:core/src/contracts/mail.ts:129`). Al)
declarations (name | line | kind):
  - MailerPort | apps/website/src/platform/mail/ports.ts:14 | interface
  - ConsoleMailerAdapter | apps/website/src/platform/mail/ports.ts:19 | type
  - InMemoryMailerAdapter | apps/website/src/platform/mail/ports.ts:20 | type
  - MailerCapabilities | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - MailerSendResult | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - OutboundEmail | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - MailSuppressionRepoPort | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - MailSendDedupRepoPort | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - MailTestApproval | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
  - MailerSendOptions | apps/website/src/platform/mail/ports.ts:7 | re-export (type) from "@jini-ai/platform/mail"
census_cmd: rg -n --no-heading -e '["'][^"']*ports(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/mail/ports.ts
importers (6 prod, 3 test; resolved to this file):
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts:13 | static | "../../ports.js"
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts:5 | static | "../../ports.js"
  - apps/website/src/platform/mail/__tests__/unit/sender-identity.unit.test.ts:10 | static | "../../ports.js"
  - apps/website/src/platform/mail/adapter-module.ts:4 | static | "./ports.js"
  - apps/website/src/platform/mail/adapters/smtp.nodemailer.ts:11 | static | "../ports.js"
  - apps/website/src/platform/mail/delivery-availability.ts:3 | static | "./ports.js"
  - apps/website/src/platform/mail/index.ts:13 | reexport | "./ports.js"
  - apps/website/src/platform/mail/purpose-scoped-mailer.ts:8 | static | "./ports.js"
  - apps/website/src/platform/mail/sender-identity.ts:7 | static | "./ports.js"
path_literals (rg -F "mail/ports", not already importers):
  - development/scripts/write-path-inventory.baseline.json:1907:    "file": "src/platform/mail/ports.ts",
  - development/scripts/write-path-inventory.baseline.json:1915:    "file": "src/platform/mail/ports.ts",
  - development/scripts/write-path-inventory.baseline.json:1923:    "file": "src/platform/mail/ports.ts",
  - development/scripts/write-path-inventory.baseline.json:1931:    "file": "src/platform/mail/ports.ts",
  - apps/website/src/platform/mail/index.ts:2:// Shared contracts: Jini/packages/platform/src/mail/ports.ts (ADR-037).
baselines (json files naming the path): -
jini_target: platform /mail | packages/platform/package.json:25 has exports key ./mail
jini_names (existing declaration in packages/platform/src, excluding tests; none = free to add):
  - MailerPort -> ABSENT
  - ConsoleMailerAdapter -> ABSENT
  - InMemoryMailerAdapter -> ABSENT
  - MailerCapabilities -> ABSENT
  - MailerSendResult -> ABSENT
  - OutboundEmail -> ABSENT
  - MailSuppressionRepoPort -> ABSENT
  - MailSendDedupRepoPort -> ABSENT
  - MailTestApproval -> ABSENT
  - MailerSendOptions -> ABSENT
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/platform/package.json blob f373a0c1bcf731b3e4489bba7474b078e6b57cd9
  - packages/platform/README.md blob c5e74f5ba8e530fa32be81e1d48a3630fc717a1d
  - rg -n "MailerPort|ConsoleMailerAdapter|InMemoryMailerAdapter|MailerCapabilities|MailerSendResult|OutboundEmail|MailSuppressionRepoPort|MailSendDedupRepoPort|MailTestApproval|MailerSendOptions" packages/platform/src -> prints nothing
    (today it prints 94 line(s); names already exist, check twin/SPLIT)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
