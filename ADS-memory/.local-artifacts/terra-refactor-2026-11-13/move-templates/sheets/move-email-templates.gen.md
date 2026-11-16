id: MV-email-templates-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/features/email-templates
precondition: TODO(judge)   # MOVE-AFTER only (label: MOVE)
tovu_files:
  - apps/website/src/features/email-templates/render.ts | blob ba0ea4f24a9338d3618267abf7fd302a0651bb22 | TODO(judge) delete|keep-reduced | 324 loc
tovu_tests:
  - apps/website/src/features/email-templates/__tests__/render.test.ts | blob b55add91c57bf0b4931c35f0b1eeb66dab2d2f9a | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/website/src/features/email-templates/render.ts (survey label MOVE; note: `@jini-ai/platform/mail`, new module `email-template.ts`. It already uses `@jini-ai/platform/web` (`htmlToText`, `stripActiveHtml`) and parse5, which platform a)
declarations (name | line | kind):
  - EMAIL_FIELDS_META_NAME | apps/website/src/features/email-templates/render.ts:26 | const
  - EmailTemplateField | apps/website/src/features/email-templates/render.ts:38 | interface
  - EmailTemplateDeclarations | apps/website/src/features/email-templates/render.ts:44 | interface
  - EmailFieldValues | apps/website/src/features/email-templates/render.ts:50 | type
  - FilledText | apps/website/src/features/email-templates/render.ts:52 | interface
  - placeholdersIn | apps/website/src/features/email-templates/render.ts:59 | function
  - escapeHtml | apps/website/src/features/email-templates/render.ts:66 | function
  - fillPlaceholders | apps/website/src/features/email-templates/render.ts:76 | function
  - parseFieldDeclarations | apps/website/src/features/email-templates/render.ts:102 | function
  - formatFieldDeclarations | apps/website/src/features/email-templates/render.ts:112 | function
  - readTemplateDeclarations | apps/website/src/features/email-templates/render.ts:156 | function
  - undeclaredFieldsIn | apps/website/src/features/email-templates/render.ts:172 | function
  - sanitizeEmailHtml | apps/website/src/features/email-templates/render.ts:212 | function
  - emailHtmlToText | apps/website/src/features/email-templates/render.ts:232 | function
  - RenderedEmail | apps/website/src/features/email-templates/render.ts:244 | interface
  - previewValues | apps/website/src/features/email-templates/render.ts:259 | function
  - renderEmailPreview | apps/website/src/features/email-templates/render.ts:272 | function
  - SendableEmail | apps/website/src/features/email-templates/render.ts:277 | interface
  - renderEmailForSend | apps/website/src/features/email-templates/render.ts:288 | function
  - emailTemplateSkeleton | apps/website/src/features/email-templates/render.ts:295 | function
census_cmd: rg -n --no-heading -e '["'][^"']*render(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/features/email-templates/render.ts
importers (2 prod, 1 test; resolved to this file):
  - apps/website/src/features/email-templates/__tests__/render.test.ts:18 | static | "../render.js"
  - apps/website/src/features/email-templates/index.ts:27 | reexport | "./render.js"
  - apps/website/src/features/email-templates/operations.ts:17 | static | "./render.js"
path_literals (rg -F "email-templates/render", not already importers):
  - -
baselines (json files naming the path): -
jini_target: platform /mail | packages/platform/package.json:25 has exports key ./mail
jini_names (existing declaration in packages/platform/src, excluding tests; none = free to add):
  - EMAIL_FIELDS_META_NAME -> packages/platform/src/mail/email-template.ts:27:export const EMAIL_FIELDS_META_NAME = "email-fields";
  - EmailTemplateField -> packages/platform/src/mail/email-template.ts:39:export interface EmailTemplateField {
  - EmailTemplateDeclarations -> packages/platform/src/mail/email-template.ts:45:export interface EmailTemplateDeclarations {
  - EmailFieldValues -> packages/platform/src/mail/email-template.ts:51:export type EmailFieldValues = Readonly<Record<string, string>>;
  - FilledText -> packages/platform/src/mail/email-template.ts:53:export interface FilledText {
  - placeholdersIn -> packages/platform/src/mail/email-template.ts:60:export function placeholdersIn({ text }: { text: string }, _optional: Record<string, never> = {}): string[] {
  - escapeHtml -> packages/platform/src/mail/email-template.ts:67:export function escapeHtml({ value }: { value: string }, _optional: Record<string, never> = {}): string {
  - fillPlaceholders -> packages/platform/src/mail/email-template.ts:77:export function fillPlaceholders(
  - parseFieldDeclarations -> packages/platform/src/mail/email-template.ts:103:export function parseFieldDeclarations({ content }: { content: string }, _optional: Record<string, never> = {}): EmailTemplateField[] {
  - formatFieldDeclarations -> packages/platform/src/mail/email-template.ts:113:export function formatFieldDeclarations({ fields }: { fields: readonly EmailTemplateField[] }, _optional: Record<string, never> = {}): string {
  - readTemplateDeclarations -> packages/platform/src/mail/email-template.ts:157:export function readTemplateDeclarations({ html }: { html: string }, _optional: Record<string, never> = {}): EmailTemplateDeclarations {
  - undeclaredFieldsIn -> packages/platform/src/mail/email-template.ts:173:export function undeclaredFieldsIn({ html, declarations }: { html: string; declarations: EmailTemplateDeclarations }, _optional: Record<string, never> = {}): string[] {
  - sanitizeEmailHtml -> packages/platform/src/mail/email-template.ts:212:export function sanitizeEmailHtml({ html }: { html: string }, _optional: Record<string, never> = {}): string {
  - emailHtmlToText -> packages/platform/src/mail/email-template.ts:232:export function emailHtmlToText({ html }: { html: string }, _optional: Record<string, never> = {}): string {
  - RenderedEmail -> packages/platform/src/mail/email-template.ts:244:export interface RenderedEmail {
  - previewValues -> packages/platform/src/mail/email-template.ts:259:export function previewValues(
  - renderEmailPreview -> packages/platform/src/mail/email-template.ts:272:export function renderEmailPreview({ html, values }: { html: string; values: EmailFieldValues }, _optional: Record<string, never> = {}): RenderedEmail {
  - SendableEmail -> packages/platform/src/mail/email-template.ts:277:export interface SendableEmail extends RenderedEmail {
  - renderEmailForSend -> packages/platform/src/mail/email-template.ts:288:export function renderEmailForSend({ html, values }: { html: string; values: EmailFieldValues }, _optional: Record<string, never> = {}): SendableEmail {
  - emailTemplateSkeleton -> packages/platform/src/mail/email-template.ts:295:export function emailTemplateSkeleton(
jini_guards:
  - TODO(judge) must not exist  # new Jini file path
  - packages/platform/package.json blob f373a0c1bcf731b3e4489bba7474b078e6b57cd9
  - packages/platform/README.md blob c5e74f5ba8e530fa32be81e1d48a3630fc717a1d
  - rg -n "EMAIL_FIELDS_META_NAME|EmailTemplateField|EmailTemplateDeclarations|EmailFieldValues|FilledText|placeholdersIn|escapeHtml|fillPlaceholders|parseFieldDeclarations|formatFieldDeclarations|readTemplateDeclarations|undeclaredFieldsIn" packages/platform/src -> prints nothing
    (today it prints 44 line(s); names already exist, check twin/SPLIT)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
