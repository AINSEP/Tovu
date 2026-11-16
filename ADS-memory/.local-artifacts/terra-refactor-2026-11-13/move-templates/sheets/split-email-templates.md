# website/features/email-templates — 1 slice, READY after wave B (W1 #20). Written 2026-11-16 (group E) from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py website/features/email-templates --kind all` (move-email-templates = `render.ts`, already moved in W0/E01: Jini `packages/platform/src/mail/email-template.ts` exists and `operations.ts:17` imports `@jini-ai/platform/mail/email-template`, so the precondition holds; split-email-templates = `operations.ts`).
Kind: SPLIT confirmed (MIXED: generic validation/version/list/preview logic over a Tovu storage binding: `posts` row of a product kind, slug format, Pages html store, `PageConcurrentEditError`). Tier: Opus-filled (5-method port, > 3 ports by the T-SPLIT rule); executor Sonnet.
untangle_overlap: `C3.repoint.tsv:461` (`email-templates/tool-registrations.ts` line 6, `AuthorizeFn` import). SP-email-templates-1 edits that file but NOT line 6, and guards it by text, so either order is safe; per the group rule it is still marked **execute after wave B merge**.

| id | files | status |
|---|---|---|
| SP-email-templates-1 | operations.ts (325) -> NEW `@jini-ai/platform/mail/email-template-operations`; Tovu keeps the storage binding `emailTemplateStore` | READY, after wave B |

Design decisions (made here so the executor makes none):
1. New subpath `./mail/email-template-operations` (runtime `node`: it uses the `Buffer` global for the cursor), NOT the `./mail` barrel: the operations import `./email-template.js`, which loads the optional peer `parse5`, and `./mail` must not.
2. One port, `EmailTemplateStore` (find / create / openHtml / rename / listPage). Jini operations take `{ store, … }` instead of `{ deps, … }`; Tovu builds the store per call with `emailTemplateStore({ deps })`. Callers change mechanically (one perl rule, exact counts below). No Tovu forwarders (COMMON 19).
3. Behaviour is unchanged, with two internal differences recorded for the reviewer (no test observes either): (a) the rename binding re-reads the row before its compare-and-set write (one extra read; `ifVersion` still guards the write, so a row changed in between still gives the same "edited elsewhere" conflict); (b) `toDetail` of a new template runs after the create transaction commits instead of inside it — it is pure and cannot throw (`readTemplateDeclarations`/`undeclaredFieldsIn` have no `throw`), so the rollback set is identical.
4. The error message `cursor must be a nextCursor returned by email_template_list.` moves verbatim (no Tovu text; it names the agent tool both surfaces document). Error classes, `EMAIL_TEMPLATE_NAME_MAX`, `requireText`, `readFieldValues` and the three result types move.
5. `_optional: Record<string, never> = {}` on the moved exports becomes `_options = {}` (COMMON 10; type-only, no caller changes). `previewSource(deps, input)` (positional, private) becomes `previewSource({ store, input }, _options = {})`.

---------------------------------------------------------------------------------------------------
## Slice SP-email-templates-1 (template T-SPLIT)
```
id: SP-email-templates-1
feature: website/features/email-templates
precondition: rg -n "export function renderEmailForSend" packages/platform/src/mail/email-template.ts (Jini) -> 1 hit (W0/E01 landed; true at b7666092)
tovu_files:
  - apps/website/src/features/email-templates/operations.ts | blob 6ce4a727742981171ccc813388f0ca0f7343ad41 | keep-reduced (becomes the binding, full text in tovu_reduced)
  - apps/website/src/features/email-templates/index.ts | blob 6941b6de0be924db54da3fa4c844feeda11b339f | rewritten (full text in tovu_reduced)
  - apps/website/src/features/email-templates/tool-registrations.ts | text-guarded (untangle C3:461 edits its line 6)
  - apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts | blob 620fb6bd363bb0ff353076915f9a378a4aa4b1b4
  - apps/admin/src/features/email/email-api.ts | blob 935c88e55a13ece3c4fbddf5bc9b109114f845a5 (one comment line)
tovu_tests:
  - apps/website/src/features/email-templates/__tests__/operations.test.ts | blob fa0ba5e1b30a34f748d522f63cf8fb65622e195e | keep-repointed (+ one test moved to Jini)
  - apps/website/src/features/email-templates/__tests__/operations.sql.test.ts | blob 612e2dd69b0853bc231cb18006ca18ba474d38d2 | keep-repointed
  - apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts | blob c88d5214ba71323cef2f76ab77d4b8277e7128e9 | keep-repointed
  - apps/website/src/features/email-templates/__tests__/tool-registrations.test.ts | blob 32f429d92d6e6e6a0ec673c4a2b98b12f516a82b | no edit (imports only tool-registrations.js / agent-tools.js; EmailTemplatesToolDeps keeps its shape)
split (operations.ts, every top-level declaration):
  - imports lines 1-17 | STAY-WIRING, rewritten (see tovu_reduced); Jini file imports only ./email-template.js
  - @file block lines 19-33 | split: neutral part -> Jini header; Pages/posts storage why STAYS in Tovu header
  - EMAIL_TEMPLATE_NAME_MAX | MOVE -> packages/platform/src/mail/email-template-operations.ts
  - EmailTemplateNotFoundError | MOVE -> same
  - EmailTemplateInputError | MOVE -> same
  - EmailTemplateVersionConflictError | MOVE -> same
  - EmailTemplateDeps | STAY-WIRING (Tovu binding input, unchanged)
  - EmailTemplateSummary | MOVE
  - EmailTemplateDetail | MOVE
  - EmailTemplatePreview | MOVE
  - isTemplateRow | STAY-PRODUCT (post kind + body format + trash rule)
  - loadTemplate | MOVE (re-shaped to the store port)
  - toSummary | MOVE (takes EmailTemplateRecord)
  - toDetail | MOVE (takes EmailTemplateRecord)
  - requireText | MOVE
  - optionalString | MOVE
  - readFieldValues | MOVE
  - readFieldsInput | MOVE
  - formatFieldObject | MOVE
  - readExpectedVersion | MOVE
  - newTemplateRow | STAY-PRODUCT (posts row shape, slug format, status rule)
  - createEmailTemplate | MOVE (row birth -> store.create)
  - editEmailTemplate | MOVE (Pages store -> store.openHtml)
  - renameEmailTemplate | MOVE (saveIfVersion -> store.rename)
  - listEmailTemplates | MOVE (listHtmlByKind -> store.listPage)
  - templatePageLimit | MOVE
  - readTemplateCursor | MOVE
  - getEmailTemplate | MOVE
  - previewSource | MOVE (positional -> object args)
  - readMode | MOVE
  - previewEmailTemplate | MOVE
  - renderEmailTemplateForSend | MOVE
ports:
  - store: EmailTemplateStore (5 methods, declared in the Jini file) | Tovu binds `emailTemplateStore({ deps })` from apps/website/src/features/email-templates/operations.ts at every call site
      why: hides the posts table, the email-template post kind, the `email-template:<id>` slug, the Pages html document store, its compare-and-set error class and the clock/id generator.
shape_changes:
  - createEmailTemplate/editEmailTemplate: { deps, input, actorId } -> { store, input, actorId }
  - renameEmailTemplate/previewEmailTemplate: { deps, input } -> { store, input }
  - listEmailTemplates: { deps, input? } -> { store, input? }
  - getEmailTemplate: { deps, id } -> { store, id };  renderEmailTemplateForSend: { deps, id, values } -> { store, id, values }
  callers (all rewritten by PERL-1 below, exact counts): operations.test.ts 42 + 1 special, operations.sql.test.ts 4, email-template-trash-flow.test.ts 5, tool-registrations.ts 5, routes.ts 7.
```

### jini_code — NEW `packages/platform/src/mail/email-template-operations.ts`, exactly
```ts
/**
 * @module email-template-operations
 *
 * The ONE set of email-template operations — create, edit, rename, list, get, preview and the send
 * render — that every surface of a host (its admin routes, its agent tools) calls. Permission checks
 * stay with those callers.
 *
 * Storage is a host port ({@link EmailTemplateStore}): the host decides where a template lives and
 * how its html body is written (compare-and-set writes, revision history, trash). These operations
 * own input validation, version conditioning, paging and the summary/detail/preview shapes.
 *
 * A template's subject and fields live in its one html body, not in extra columns, so an agent edits
 * a template with full-document writes. The pure renders live in `./email-template.js`.
 */
import {
  emailTemplateSkeleton,
  parseFieldDeclarations,
  readTemplateDeclarations,
  renderEmailForSend,
  renderEmailPreview,
  undeclaredFieldsIn,
  type EmailFieldValues,
  type EmailTemplateField,
  type SendableEmail,
} from "./email-template.js";

/** Bounds a template's name; the body is bounded by the host's request body-size limit. */
export const EMAIL_TEMPLATE_NAME_MAX = 200;

export class EmailTemplateNotFoundError extends Error {}
/** The caller's input is malformed; the message says how to fix it. */
export class EmailTemplateInputError extends Error {}
/** `expectedVersion` no longer matches, or another writer landed mid-write. Re-read and retry. */
export class EmailTemplateVersionConflictError extends Error {}

/** A live template as the host's store holds it. */
export interface EmailTemplateRecord {
  id: string;
  name: string;
  html: string;
  version: number;
  updatedAt: string;
}

/** A template's html body opened for one conditioned write. */
export interface EmailTemplateHtmlSession {
  /** The version the write is conditioned on; a stated `expectedVersion` must equal it. */
  version: number;
  /** Compare-and-set write of the whole html; resolves `false` when another writer landed first. */
  write(args: { html: string }): Promise<boolean>;
}

/** The host's template storage. */
export interface EmailTemplateStore {
  /** The live template `id`, or `null` (missing, trashed, another kind, not yet html). */
  find(args: { id: string }): Promise<EmailTemplateRecord | null>;
  /** Atomically creates a template named `name` whose html body is born from `seedHtml`; returns it. */
  create(args: { name: string; seedHtml: string; actorId: string }): Promise<EmailTemplateRecord>;
  /** Opens a live template's html body for one conditioned write. */
  openHtml(args: { id: string; actorId: string }): Promise<EmailTemplateHtmlSession>;
  /** Renames the template if it is still at `ifVersion`; resolves `false` when another writer landed first. */
  rename(args: { id: string; name: string; ifVersion: number }): Promise<boolean>;
  /**
   * Up to `limit` entries, most recently updated first (id breaking ties), strictly after the
   * `before` position. An entry that is not a live template comes back as `null` and still counts.
   */
  listPage(args: { limit: number; before?: { updatedAt: string; id: string } }): Promise<Array<EmailTemplateRecord | null>>;
}

export interface EmailTemplateSummary {
  id: string;
  name: string;
  subject: string;
  fields: EmailTemplateField[];
  version: number;
  updatedAt: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  html: string;
  /** `{{field}}`s the HTML uses that `<meta name="email-fields">` does not declare. */
  undeclaredFields: string[];
}

export interface EmailTemplatePreview {
  subject: string;
  html: string;
  missingFields: string[];
  undeclaredFields: string[];
  /** `"admin"` keeps scripts (render in a sandboxed preview iframe); `"sent"` is the static email. */
  mode: "admin" | "sent";
  scriptsStripped: boolean;
  /** The plain-text alternative, `"sent"` mode only. */
  text?: string;
}

async function loadTemplate({ store, id }: { store: EmailTemplateStore; id: string }, _options = {}): Promise<EmailTemplateRecord> {
  const record = await store.find({ id });
  if (record === null) throw new EmailTemplateNotFoundError(`email template '${id}' was not found`);
  return record;
}

function toSummary(record: EmailTemplateRecord, _options = {}): EmailTemplateSummary {
  const declarations = readTemplateDeclarations({ html: record.html });
  return { id: record.id, name: record.name, subject: declarations.subject, fields: declarations.fields, version: record.version, updatedAt: record.updatedAt };
}

function toDetail(record: EmailTemplateRecord, _options = {}): EmailTemplateDetail {
  const summary = toSummary(record);
  return { ...summary, html: record.html, undeclaredFields: undeclaredFieldsIn({ html: record.html, declarations: summary }) };
}

/** A required, trimmed, bounded string. */
export function requireText({ value, key, max }: { value: unknown; key: string; max: number }, _options = {}): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new EmailTemplateInputError(`${key} is required and must be a non-empty string.`);
  if (text.length > max) throw new EmailTemplateInputError(`${key} must be at most ${max} characters.`);
  return text;
}

/** An optional string; `undefined` when absent. */
function optionalString({ value, key }: { value: unknown; key: string }, _options = {}): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new EmailTemplateInputError(`${key} must be a string.`);
  return value;
}

/** Field values: strings, numbers and booleans (stringified); anything else is refused. */
export function readFieldValues({ value }: { value: unknown }, _options = {}): Record<string, string> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new EmailTemplateInputError("values must be an object of field name to text.");
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!["string", "number", "boolean"].includes(typeof raw)) throw new EmailTemplateInputError(`values.${name} must be text, a number or a boolean.`);
    out[name] = String(raw);
  }
  return out;
}

/** Field declarations from either a list of names / `{name, sample}` objects, or the meta `content` string form. */
function readFieldsInput({ value }: { value: unknown }, _options = {}): EmailTemplateField[] {
  if (value === undefined) return [];
  if (typeof value === "string") return parseFieldDeclarations({ content: value });
  if (!Array.isArray(value)) throw new EmailTemplateInputError("fields must be a list of field names.");
  const entries = value.map((entry) => (typeof entry === "string" ? entry : formatFieldObject({ entry: entry })));
  return parseFieldDeclarations({ content: entries.join(",") });
}

function formatFieldObject({ entry }: { entry: unknown }, _options = {}): string {
  const record = (entry ?? {}) as { name?: unknown; sample?: unknown };
  if (typeof record.name !== "string") throw new EmailTemplateInputError("each field must be a name or {name, sample}.");
  if (record.name.includes(",") || record.name.includes("=")) throw new EmailTemplateInputError("field names cannot contain commas or equals signs.");
  if (typeof record.sample === "string" && record.sample.includes(",")) throw new EmailTemplateInputError("field samples cannot contain commas.");
  return typeof record.sample === "string" ? `${record.name}=${record.sample}` : record.name;
}

function readExpectedVersion({ value }: { value: unknown }, _options = {}): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) throw new EmailTemplateInputError("expectedVersion must be the positive integer version a read returned.");
  return value as number;
}

/**
 * Creates a template; the store births its html body from the seed.
 * @param required.input - `{ name, html?, subject?, fields? }`; with no `html`, a starter email is
 *   built from `subject` (default: the name) and `fields`.
 * @throws {EmailTemplateInputError} For a missing name or malformed fields/html.
 */
export async function createEmailTemplate(
  { store, input, actorId }: { store: EmailTemplateStore; input: Record<string, unknown>; actorId: string },
  _options = {},
): Promise<EmailTemplateDetail> {
  const name = requireText({ value: input.name, key: "name", max: EMAIL_TEMPLATE_NAME_MAX });
  const html = optionalString({ value: input.html, key: "html" });
  const subject = optionalString({ value: input.subject, key: "subject" }) ?? name;
  const seed = html ?? emailTemplateSkeleton({ subject, fields: readFieldsInput({ value: input.fields }) });
  return toDetail(await store.create({ name, seedHtml: seed, actorId }));
}

/**
 * Replaces a template's whole HTML through the store's compare-and-set write.
 * @param required.input - `{ id, html, expectedVersion? }`; a stated `expectedVersion` must be the
 *   version the write is actually conditioned on, or nothing is written.
 * @throws {EmailTemplateNotFoundError} When `id` is not a live template.
 * @throws {EmailTemplateVersionConflictError} On a stale `expectedVersion` or a concurrent write.
 */
export async function editEmailTemplate(
  { store, input, actorId }: { store: EmailTemplateStore; input: Record<string, unknown>; actorId: string },
  _options = {},
): Promise<EmailTemplateDetail> {
  const id = requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX });
  const html = requireText({ value: input.html, key: "html", max: Number.MAX_SAFE_INTEGER });
  const expectedVersion = readExpectedVersion({ value: input.expectedVersion });
  await loadTemplate({ store: store, id: id });
  const session = await store.openHtml({ id, actorId });
  const basis = session.version;
  if (expectedVersion !== undefined && expectedVersion !== basis) {
    throw new EmailTemplateVersionConflictError(`email template '${id}' is at version ${basis}, not ${expectedVersion} — re-read it and retry`);
  }
  if (!(await session.write({ html }))) throw new EmailTemplateVersionConflictError(`email template '${id}' was edited elsewhere — re-read it and retry`);
  return toDetail(await loadTemplate({ store: store, id: id }));
}

/**
 * Renames a template: only its name changes, through the store's compare-and-set rename, so the
 * HTML body and its revision history are untouched.
 * @param required.input - `{ id, name, expectedVersion? }`.
 * @throws {EmailTemplateNotFoundError} When `id` is not a live template.
 * @throws {EmailTemplateVersionConflictError} On a stale `expectedVersion` or a concurrent write.
 */
export async function renameEmailTemplate(
  { store, input }: { store: EmailTemplateStore; input: Record<string, unknown> },
  _options = {},
): Promise<EmailTemplateDetail> {
  const id = requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX });
  const name = requireText({ value: input.name, key: "name", max: EMAIL_TEMPLATE_NAME_MAX });
  const expectedVersion = readExpectedVersion({ value: input.expectedVersion });
  const record = await loadTemplate({ store: store, id: id });
  if (expectedVersion !== undefined && expectedVersion !== record.version) {
    throw new EmailTemplateVersionConflictError(`email template '${id}' is at version ${record.version}, not ${expectedVersion} — re-read it and retry`);
  }
  if (!(await store.rename({ id, name, ifVersion: record.version }))) throw new EmailTemplateVersionConflictError(`email template '${id}' was edited elsewhere — re-read it and retry`);
  return toDetail(await loadTemplate({ store: store, id: id }));
}

/** Every live template, most recently updated first. */
export async function listEmailTemplates({ store, input = {} }: { store: EmailTemplateStore; input?: { limit?: unknown; cursor?: unknown } }, _options = {}): Promise<{ templates: EmailTemplateSummary[]; nextCursor?: string }> {
  const limit = templatePageLimit({ value: input.limit });
  const before = readTemplateCursor({ value: input.cursor });
  const rows = await store.listPage({ limit: limit + 1, ...(before ? { before } : {}) });
  const page = rows.slice(0, limit).filter((row): row is EmailTemplateRecord => row !== null);
  const last = page.at(-1);
  const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString("base64url") : undefined;
  return { templates: page.map(row => toSummary(row)), ...(nextCursor ? { nextCursor } : {}) };
}

/** Bounded list size, shared by the route and tool inputs. */
function templatePageLimit({ value }: { value: unknown }, _options = {}): number {
  const limit = value === undefined ? 25 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new EmailTemplateInputError("limit must be a whole number from 1 to 100.");
  return limit;
}

/** Only a timestamp/id pair from this list is accepted as a continuation. */
function readTemplateCursor({ value }: { value: unknown }, _options = {}): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString()) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt === "string" && typeof parsed.id === "string") return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch { /* The same typed refusal covers malformed and structurally invalid tokens. */ }
  throw new EmailTemplateInputError("cursor must be a nextCursor returned by email_template_list.");
}

/** One template with its HTML; `version` is the basis an edit states back as `expectedVersion`. */
export async function getEmailTemplate({ store, id }: { store: EmailTemplateStore; id: string }, _options = {}): Promise<EmailTemplateDetail> {
  return toDetail(await loadTemplate({ store: store, id: id }));
}

/** The HTML a preview renders: a saved template's, or unsaved HTML straight from the editor. */
async function previewSource({ store, input }: { store: EmailTemplateStore; input: Record<string, unknown> }, _options = {}): Promise<string> {
  if (input.html !== undefined) return requireText({ value: input.html, key: "html", max: Number.MAX_SAFE_INTEGER });
  return (await loadTemplate({ store: store, id: requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX }) })).html;
}

function readMode({ value }: { value: unknown }, _options = {}): "admin" | "sent" {
  if (value === undefined || value === "admin") return "admin";
  if (value === "sent") return "sent";
  throw new EmailTemplateInputError('mode must be "admin" or "sent".');
}

/**
 * Renders a template with `{{field}}` values for the live preview. `"admin"` mode fills declared
 * samples for missing values and keeps scripts (the host's preview iframe sandboxes them);
 * `"sent"` mode is exactly {@link renderEmailTemplateForSend}'s output, samples unused.
 * @param required.input - `{ id } | { html }`, plus `values?` and `mode?`.
 */
export async function previewEmailTemplate(
  { store, input }: { store: EmailTemplateStore; input: Record<string, unknown> },
  _options = {},
): Promise<EmailTemplatePreview> {
  const mode = readMode({ value: input.mode });
  const values = readFieldValues({ value: input.values });
  const html = await previewSource({ store, input });
  const undeclaredFields = undeclaredFieldsIn({ html, declarations: readTemplateDeclarations({ html }) });
  if (mode === "sent") {
    const sent = renderEmailForSend({ html, values });
    return { ...sent, undeclaredFields, mode, scriptsStripped: true };
  }
  // Scripts are kept: the host shows this preview in a preview iframe sandboxed without
  // `allow-same-origin`, so they run in an opaque origin; `scriptsStripped: false` says so.
  return { ...renderEmailPreview({ html, values }), undeclaredFields, mode, scriptsStripped: false };
}

/**
 * The send-path operation: a saved template + values -> the `subject`/`html`/`text` an outbound
 * email carries (static HTML; see `renderEmailForSend`). It sends nothing; a mail send path
 * spreads the result into its message alongside `to`/`from`.
 * @param required.values - Field values; a field with none renders empty and is listed in `missingFields`.
 */
export async function renderEmailTemplateForSend(
  { store, id, values }: { store: EmailTemplateStore; id: string; values: EmailFieldValues },
  _options = {},
): Promise<SendableEmail> {
  return renderEmailForSend({ html: (await loadTemplate({ store: store, id: id })).html, values });
}
```
Complexity check (done by the sheet author): longest function `editEmailTemplate` 17 lines, cyclomatic 5; `readFieldValues` 6; `readTemplateCursor` 5. All under 50 lines / 10.

### Jini entry (new subpath)
```
jini_guards:
  - packages/platform/src/mail/email-template-operations.ts must not exist; packages/platform/src/mail/__tests__/email-template-operations.test.ts must not exist; .changeset/platform-email-template-operations.md must not exist
  - packages/platform/package.json blob f373a0c1bcf731b3e4489bba7474b078e6b57cd9
  - packages/platform/README.md blob c5e74f5ba8e530fa32be81e1d48a3630fc717a1d
  - rg -n "EmailTemplateStore|createEmailTemplate|EmailTemplateNotFoundError|EMAIL_TEMPLATE_NAME_MAX" packages/platform/src -> prints nothing
entry:
  package.json exports: after the block that ends the "./mail/email-template" entry, i.e. after the exact 5 lines
      "./mail/email-template": {
        "types": "./dist/mail/email-template.d.ts",
        "import": "./dist/mail/email-template.js",
        "default": "./dist/mail/email-template.js"
      },
    insert (same indentation):
      "./mail/email-template-operations": {
        "types": "./dist/mail/email-template-operations.d.ts",
        "import": "./dist/mail/email-template-operations.js",
        "default": "./dist/mail/email-template-operations.js"
      },
  jini.entries: after the line `      "./mail/email-template": "node",` insert `      "./mail/email-template-operations": "node",`
  optional_peers_text (exactly once in package.json):
    old: "opt-in: html parsing; import @jini-ai/platform/web or @jini-ai/platform/mail/email-template — HTML
    new: "opt-in: html parsing; import @jini-ai/platform/web, @jini-ai/platform/mail/email-template or @jini-ai/platform/mail/email-template-operations — HTML
  README: after the line beginning "`@jini-ai/platform/mail/email-template` (pure email-template renders" insert a blank line then:
    `@jini-ai/platform/mail/email-template-operations` (create/edit/rename/list/get/preview/send-render over a host `EmailTemplateStore` port) loads `parse5@7.3.0` through `./mail/email-template`.
jini_index: - (new single-file subpath; no index.ts)
```

### Jini test — NEW `packages/platform/src/mail/__tests__/email-template-operations.test.ts`, exactly
```ts
import { describe, expect, test } from "vitest";
import {
  createEmailTemplate,
  editEmailTemplate,
  EmailTemplateInputError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionConflictError,
  listEmailTemplates,
  readFieldValues,
  renameEmailTemplate,
  requireText,
  type EmailTemplateRecord,
  type EmailTemplateStore,
} from "../email-template-operations.js";

const HTML = '<html><head><meta name="email-fields" content="name=Ada"><title>Hi {{name}}</title></head><body><p>Hello {{name}} {{code}}</p></body></html>';

/** In-memory store: versions bump on every write; `race` makes the next conditioned write lose. */
function memoryStore(_required = {}, _options = {}) {
  const rows = new Map<string, EmailTemplateRecord>();
  let n = 0;
  let race = false;
  const store: EmailTemplateStore = {
    find: async ({ id }) => rows.get(id) ?? null,
    create: async ({ name, seedHtml }) => {
      const record = { id: `t${++n}`, name, html: seedHtml, version: 1, updatedAt: `2026-01-0${n}T00:00:00.000Z` };
      rows.set(record.id, record);
      return record;
    },
    openHtml: async ({ id }) => {
      const at = rows.get(id)!;
      return { version: at.version, write: async ({ html }) => { if (race) return false; rows.set(id, { ...at, html, version: at.version + 1 }); return true; } };
    },
    rename: async ({ id, name, ifVersion }) => {
      const at = rows.get(id)!;
      if (race || at.version !== ifVersion) return false;
      rows.set(id, { ...at, name, version: at.version + 1 });
      return true;
    },
    listPage: async ({ limit, before }) => [...rows.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .filter((r) => !before || r.updatedAt < before.updatedAt || (r.updatedAt === before.updatedAt && r.id < before.id))
      .slice(0, limit),
  };
  return { store, rows, setRace: (value: boolean) => { race = value; } };
}

describe("email-template operations over a host store", () => {
  test("create reads subject and declarations from the stored html", async () => {
    const { store } = memoryStore();
    const created = await createEmailTemplate({ store, input: { name: "  Welcome  ", html: HTML }, actorId: "u1" });
    expect(created).toMatchObject({ id: "t1", name: "Welcome", subject: "Hi {{name}}", fields: [{ name: "name", sample: "Ada" }], version: 1, undeclaredFields: ["code"] });
  });

  test("edit honours expectedVersion and maps a lost write to a version conflict", async () => {
    const { store, setRace } = memoryStore();
    await createEmailTemplate({ store, input: { name: "T", html: HTML }, actorId: "u1" });
    await expect(editEmailTemplate({ store, input: { id: "t1", html: "<p>x</p>", expectedVersion: 9 }, actorId: "u1" })).rejects.toThrow(EmailTemplateVersionConflictError);
    expect((await editEmailTemplate({ store, input: { id: "t1", html: "<p>x</p>", expectedVersion: 1 }, actorId: "u1" })).version).toBe(2);
    setRace(true);
    await expect(editEmailTemplate({ store, input: { id: "t1", html: "<p>y</p>" }, actorId: "u1" })).rejects.toThrow(/edited elsewhere/);
    await expect(editEmailTemplate({ store, input: { id: "nope", html: "<p>y</p>" }, actorId: "u1" })).rejects.toThrow(EmailTemplateNotFoundError);
  });

  test("rename is version-conditioned", async () => {
    const { store, setRace } = memoryStore();
    await createEmailTemplate({ store, input: { name: "Old", html: HTML }, actorId: "u1" });
    expect((await renameEmailTemplate({ store, input: { id: "t1", name: "New", expectedVersion: 1 } })).name).toBe("New");
    setRace(true);
    await expect(renameEmailTemplate({ store, input: { id: "t1", name: "Newer" } })).rejects.toThrow(EmailTemplateVersionConflictError);
  });

  test("list pages with an opaque cursor and refuses a forged one", async () => {
    const { store } = memoryStore();
    for (const name of ["A", "B", "C"]) await createEmailTemplate({ store, input: { name, html: HTML }, actorId: "u1" });
    const first = await listEmailTemplates({ store, input: { limit: 2 } });
    expect(first.templates.map((t) => t.name)).toEqual(["C", "B"]);
    const second = await listEmailTemplates({ store, input: { limit: 2, cursor: first.nextCursor } });
    expect(second).toEqual({ templates: [expect.objectContaining({ name: "A" })] });
    await expect(listEmailTemplates({ store, input: { cursor: "not-a-cursor" } })).rejects.toThrow(EmailTemplateInputError);
    await expect(listEmailTemplates({ store, input: { limit: 0 } })).rejects.toThrow(/limit must be/);
  });

  // Moved from the host's operations test ("readFieldValues and requireText contracts").
  test("readFieldValues and requireText contracts", () => {
    expect(readFieldValues({ value: undefined })).toEqual({});
    expect(readFieldValues({ value: { a: "x", b: 2, c: false } })).toEqual({ a: "x", b: "2", c: "false" });
    expect(requireText({ value: " a ", key: "k", max: 1 })).toBe("a");
    expect(() => requireText({ value: 3, key: "k", max: 1 })).toThrow(/k is required/);
    expect(() => requireText({ value: "ab", key: "k", max: 1 })).toThrow(/at most 1/);
  });
});
```
Before deleting the Tovu test of that name, diff it against these 5 assertions: Tovu `operations.test.ts` lines 193-199 must be exactly the `test("readFieldValues and requireText contracts", () => {` block with lines 194-198 being the 5 `assert.*` calls translated above (deepEqual->toEqual, equal->toBe, throws->toThrow). Any extra assertion in the Tovu block = STOP.

```
changeset: .changeset/platform-email-template-operations.md, exactly:
  ---
  "@jini-ai/platform": minor
  ---

  Add `@jini-ai/platform/mail/email-template-operations`: create, edit, rename, list, get, preview and send-render of html email templates over a host `EmailTemplateStore` port.
jini_msg: "feat(platform): email-template operations over an injected EmailTemplateStore" | body "New node subpath mail/email-template-operations; storage is a host port (find, create, openHtml, rename, listPage)."
```

### tovu_reduced
`apps/website/src/features/email-templates/operations.ts` becomes exactly:
```ts
import { nowIso, type Clock } from "@jini-ai/core/primitives";
import {
  EmailTemplateNotFoundError,
  type EmailTemplateHtmlSession,
  type EmailTemplateRecord,
  type EmailTemplateStore,
} from "@jini-ai/platform/mail/email-template-operations";

import { isTrashed, type PostKind, type PostRecord, type PostRepoPort } from "../post/index.js";
// Not from the barrel: it re-exports a fixed list, and this kind is not part of the Post API.
import { EMAIL_TEMPLATE_KIND } from "../post/index.js";
import { PageConcurrentEditError, type PagesHtmlDocumentStoreFactory } from "../pages/index.js";

/**
 * @file Tovu's storage binding for the email-template operations in
 * `@jini-ai/platform/mail/email-template-operations` (create, edit, rename, list, get, preview and the
 * send render). Both the admin routes (`server/inbound/admin-http/routes/email-templates/`) and the
 * assistant tools (`tool-registrations.ts`) call those operations with `emailTemplateStore({ deps })`.
 * Permission checks stay with those two callers, the way the Pages routes and `pages_*` tools each
 * check before reaching the shared store.
 *
 * Storage is the Pages storage, not a parallel system: a template is a `posts` row of kind
 * {@link EMAIL_TEMPLATE_KIND}, written in `"html"` format by the same `PagesHtmlDocumentStore` a
 * bespoke Page is (compare-and-set writes, revision ledger, trash). It is born like a Page too — a
 * plain row, then `ensureHtmlFormat(seed)` — so that store stays the only writer of html bodies.
 */

export interface EmailTemplateDeps {
  workspaceId: string;
  postRepo: PostRepoPort;
  pagesHtmlStore: PagesHtmlDocumentStoreFactory;
  clock: Clock;
  idGen: { newId(): string };
}

/** A template row: our kind, html format, not in the Trash. */
function isTemplateRow(row: PostRecord | null): row is PostRecord & { bodyHtml: string } {
  if (row === null) return false;
  return (row.kind as string) === EMAIL_TEMPLATE_KIND && row.bodyFormat === "html" && row.bodyHtml !== null && !isTrashed(row);
}

function toRecord(row: PostRecord & { bodyHtml: string }, _options = {}): EmailTemplateRecord {
  return { id: row.id, name: row.title, html: row.bodyHtml, version: row.version, updatedAt: row.updatedAt };
}

async function findTemplateRow({ deps, id }: { deps: EmailTemplateDeps; id: string }, _options = {}): Promise<(PostRecord & { bodyHtml: string }) | null> {
  const row = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id });
  return isTemplateRow(row) ? row : null;
}

<operations.ts lines 151-171 VERBATIM (the doc comment "/** A fresh, `doc`-format template row…" and function newTemplateRow, unchanged)>

/** A Pages html store scoped to one template; only the email-template kind may pass through it. */
function templateHtmlStore({ deps, id, actorId }: { deps: EmailTemplateDeps; id: string; actorId: string }, _options = {}) {
  return deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: id, actorId }, { allowedKinds: new Set([EMAIL_TEMPLATE_KIND]) });
}

/** A plain row, then the Pages store's `ensureHtmlFormat` births its HTML body, as a new Page is. */
async function createTemplateRow({ deps, name, seedHtml, actorId }: { deps: EmailTemplateDeps; name: string; seedHtml: string; actorId: string }, _options = {}): Promise<EmailTemplateRecord> {
  const row = newTemplateRow({ deps: deps, name: name });
  // Both adapters join the same kernel transaction, so conversion failure leaves no hidden doc row.
  return deps.postRepo.transaction({ fn: async () => {
    await deps.postRepo.save(row);
    await templateHtmlStore({ deps, id: row.id, actorId }).ensureHtmlFormat({ seedHtml });
    const created = await findTemplateRow({ deps, id: row.id });
    if (created === null) throw new EmailTemplateNotFoundError(`email template '${row.id}' was not found`);
    return toRecord(created);
  } });
}

/** Reads through the Pages store so its captured version conditions the one write; a concurrent edit is `false`. */
async function openTemplateHtml({ deps, id, actorId }: { deps: EmailTemplateDeps; id: string; actorId: string }, _options = {}): Promise<EmailTemplateHtmlSession> {
  const store = templateHtmlStore({ deps, id, actorId });
  await store.read();
  return {
    version: store.capturedVersion(),
    write: async ({ html }) => {
      try {
        await store.write({ html });
        return true;
      } catch (err) {
        if (err instanceof PageConcurrentEditError) return false;
        throw err;
      }
    },
  };
}

/**
 * Only the row's title changes, through the post repo's compare-and-set write, so the HTML body and
 * its revision ledger are untouched. Added for the admin Templates list (2026-10-22); the HTML store
 * has no title of its own, which is why this is not a store write.
 */
async function renameTemplateRow({ deps, id, name, ifVersion }: { deps: EmailTemplateDeps; id: string; name: string; ifVersion: number }, _options = {}): Promise<boolean> {
  const row = await findTemplateRow({ deps, id });
  if (row === null) return false;
  const record = { ...row, title: name, version: row.version + 1, updatedAt: nowIso({ clock: deps.clock }) };
  const { applied } = await deps.postRepo.saveIfVersion({ record, ifVersion });
  return applied;
}

async function listTemplatePage({ deps, limit, before }: { deps: EmailTemplateDeps; limit: number; before?: { updatedAt: string; id: string } }, _options = {}): Promise<Array<EmailTemplateRecord | null>> {
  if (!deps.postRepo.listHtmlByKind) throw new Error("Template listing is unavailable.");
  const rows = await deps.postRepo.listHtmlByKind({ workspaceId: deps.workspaceId, kind: EMAIL_TEMPLATE_KIND, limit, ...(before ? { before } : {}) });
  return rows.map((row) => (isTemplateRow(row) ? toRecord(row) : null));
}

/** The `EmailTemplateStore` the shared operations run on: Pages storage in this workspace. */
export function emailTemplateStore({ deps }: { deps: EmailTemplateDeps }, _options = {}): EmailTemplateStore {
  return {
    find: async ({ id }) => {
      const row = await findTemplateRow({ deps, id });
      return row === null ? null : toRecord(row);
    },
    create: (args) => createTemplateRow({ deps, ...args }),
    openHtml: (args) => openTemplateHtml({ deps, ...args }),
    rename: (args) => renameTemplateRow({ deps, ...args }),
    listPage: (args) => listTemplatePage({ deps, ...args }),
  };
}
```
(`PostKind` on the post import is unused today as well; it stays verbatim — pre-existing, do not fix.)

`apps/website/src/features/email-templates/index.ts` becomes exactly:
```ts
/**
 * @file HTML email templates — raw-HTML documents on Pages storage with `{{field}}` fill-ins, an
 * admin preview (scripts kept, sandboxed) and a static send render. The operations live in
 * `@jini-ai/platform/mail/email-template-operations`; `operations.ts` binds them to Pages storage
 * (`emailTemplateStore`), and the admin routes and the `email_template_*` tools both call them with it.
 *
 * Send-path seam: `renderEmailTemplateForSend({ store: emailTemplateStore({ deps }), id, values })`
 * returns `{ subject, html, text, missingFields }`; spread `subject`/`html`/`text` into an
 * `OutboundEmail` next to `to`/`from` and hand it to the mailer. It sends nothing itself.
 */
export { emailTemplateStore, type EmailTemplateDeps } from "./operations.js";
```

### Call-site rewrite PERL-1 (exact; run per file, then compare the printed count)
```
perl -0pi -e '$n += s/\b(createEmailTemplate|editEmailTemplate|renameEmailTemplate|listEmailTemplates|getEmailTemplate|previewEmailTemplate|renderEmailTemplateForSend)\(\{ deps(: h\.deps|: ops)?([,}])/$1({ store: emailTemplateStore({ deps$2 })$3/g; END { print STDERR "count=$n\n" }' <file>
```
Expected counts (anything else: restore the file and STOP):
- apps/website/src/features/email-templates/__tests__/operations.test.ts: 42
- apps/website/src/features/email-templates/__tests__/operations.sql.test.ts: 4
- apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts: 5
- apps/website/src/features/email-templates/tool-registrations.ts: 5
- apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts: 7
Then in operations.test.ts, the one special form (exactly once):
  "listEmailTemplates({ deps: { ...deps, postRepo: missing } })" -> "listEmailTemplates({ store: emailTemplateStore({ deps: { ...deps, postRepo: missing } }) })"
After PERL-1 + special: `rg -n "EmailTemplate(ForSend)?\(\{ deps" <the 5 files>` prints nothing.

### Import edits (exact old -> new, each must occur once)
```
binding_edits / importer_edits:
  - apps/website/src/features/email-templates/tool-registrations.ts:
      OLD: lines 9-20, the block from 'import {' + '  createEmailTemplate,' through '  requireText,\n  type EmailTemplateDeps,\n} from "./operations.js";'
      NEW:
        import {
          createEmailTemplate,
          editEmailTemplate,
          EmailTemplateInputError,
          EmailTemplateNotFoundError,
          EmailTemplateVersionConflictError,
          getEmailTemplate,
          listEmailTemplates,
          previewEmailTemplate,
          requireText,
        } from "@jini-ai/platform/mail/email-template-operations";
        import { emailTemplateStore, type EmailTemplateDeps } from "./operations.js";
      (also, comment lines 27-35 of emailTemplatesDerivedRisk name postRepo/PagesHtmlDocumentStore: they stay — they describe the Tovu binding's side effects, which are unchanged.)
  - apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts:
      OLD: the block 'import {\n  createEmailTemplate,' ... '  renderEmailTemplateForSend,\n  type EmailTemplateDeps,\n} from "#src/features/email-templates/index";' (lines 5-18)
      NEW:
        import {
          createEmailTemplate,
          editEmailTemplate,
          EmailTemplateInputError,
          EmailTemplateNotFoundError,
          EmailTemplateVersionConflictError,
          getEmailTemplate,
          listEmailTemplates,
          previewEmailTemplate,
          readFieldValues,
          renameEmailTemplate,
          renderEmailTemplateForSend,
        } from "@jini-ai/platform/mail/email-template-operations";
        import { emailTemplateStore, type EmailTemplateDeps } from "#src/features/email-templates/index";
      and comment: " * shared operation from `features/email-templates/operations.ts` — the same call the" -> " * shared operation from `@jini-ai/platform/mail/email-template-operations` — the same call the"
  - apps/website/src/features/email-templates/__tests__/operations.test.ts:
      OLD: lines 8-21, 'import {\n  createEmailTemplate,' ... '  requireText,\n  type EmailTemplateDeps,\n} from "../operations.js";'
      NEW:
        import {
          createEmailTemplate,
          editEmailTemplate,
          EmailTemplateInputError,
          EmailTemplateNotFoundError,
          EmailTemplateVersionConflictError,
          getEmailTemplate,
          listEmailTemplates,
          previewEmailTemplate,
          renderEmailTemplateForSend,
        } from "@jini-ai/platform/mail/email-template-operations";
        import { emailTemplateStore, type EmailTemplateDeps } from "../operations.js";
      and delete the whole test block "readFieldValues and requireText contracts" (lines 193-199 at blob fa0ba5e1, from 'test("readFieldValues and requireText contracts", () => {' through its closing '});' and the following blank line) — it moved to the Jini test.
      Then: if `rg -n "EmailTemplateInputError|EmailTemplateNotFoundError|EmailTemplateVersionConflictError|getEmailTemplate|renderEmailTemplateForSend|previewEmailTemplate|editEmailTemplate" <file>` shows a name only on the import line, drop that name from the import (unused-import literal consequence); same rule for every rewritten import block.
  - apps/website/src/features/email-templates/__tests__/operations.sql.test.ts:
      OLD: 'import { createEmailTemplate, editEmailTemplate, getEmailTemplate, listEmailTemplates, type EmailTemplateDeps } from "../operations.js";'
      NEW: 'import { createEmailTemplate, editEmailTemplate, getEmailTemplate, listEmailTemplates } from "@jini-ai/platform/mail/email-template-operations";' + newline + 'import { emailTemplateStore, type EmailTemplateDeps } from "../operations.js";'
  - apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts:
      OLD: 'import { createEmailTemplate, getEmailTemplate, listEmailTemplates, EmailTemplateNotFoundError, type EmailTemplateDeps } from "#src/features/email-templates/operations";'
      NEW: 'import { createEmailTemplate, getEmailTemplate, listEmailTemplates, EmailTemplateNotFoundError } from "@jini-ai/platform/mail/email-template-operations";' + newline + 'import { emailTemplateStore, type EmailTemplateDeps } from "#src/features/email-templates/operations";'
  - apps/admin/src/features/email/email-api.ts:
      OLD: "// --- templates (`features/email-templates/operations.ts`) -----------------------------------"
      NEW: "// --- templates (`@jini-ai/platform/mail/email-template-operations`) ------------------------"
baselines: development/scripts/check-architecture.baseline.json:124-126 name operations.ts -> pages/index.ts, post/index.ts, post/post.ts. The reduced operations.ts still imports pages/index.js and post/index.js: NO edit. (If the cloud run's architecture gate reports 126 as stale, that is a follow-up, not this slice.)
census:
  cmd: rg -n --no-heading -e "email-templates/operations" -e "email-templates/index" -e "from \"\./operations\.js\"" -e "from \"\.\./operations\.js\"" apps development --glob '!**/node_modules/**'
  allowed before: [apps/website/src/features/email-templates/__tests__/operations.sql.test.ts:9, apps/website/src/features/email-templates/__tests__/operations.test.ts:21, apps/website/src/features/email-templates/index.ts:26, apps/website/src/features/email-templates/tool-registrations.ts:20, apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts:10, apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts:18, apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts:28, apps/admin/src/features/email/email-api.ts:183, development/scripts/check-architecture.baseline.json:124-126, apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts (if it prints "email-templates/agent-tools", that is not this pattern)]
  Any other `from "./operations.js"`/`"../operations.js"` hit OUTSIDE apps/website/src/features/email-templates is a different feature's file and is ignored; inside email-templates, only the lines above.
tests_split:
  - operations.test.ts "readFieldValues and requireText contracts" -> Jini email-template-operations.test.ts (last test)
  - every other operations.test.ts case -> stays in Tovu (they exercise the Pages binding: kind, slug, trash, rollback, PageConcurrentEditError mapping), edits = PERL-1 + import block
  - operations.sql.test.ts, email-template-trash-flow.test.ts -> stay, edits = PERL-1 + import line
changeset: platform: minor (see above)
tovu_msg: "refactor(email-templates): operations from @jini-ai/platform/mail/email-template-operations" | body "Tovu keeps the Pages-storage binding (emailTemplateStore): posts row of the template kind, slug, Pages html store, revision ledger."
extra_stops:
  - tool-registrations.ts or routes.ts: an OLD text above occurs 0 or 2+ times -> SKIP (do not re-derive).
  - Jini rule-5 check: `rg -n "from ['\"]@jini-ai/" packages/platform/src/mail/email-template-operations.ts` must print nothing.
  - If `apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts` handlers' `ops` parameter type is not `EmailTemplateDeps` (line 43 `type Handler = (req: Request, res: Response, deps: EmailTemplateDeps) => Promise<unknown>;`), STOP.
```
RED/GREEN: none (no behaviour change); the cloud run owes: Jini vitest for the new test, platform typecheck + subpath isolation; Tovu typecheck + the three Tovu test files.
