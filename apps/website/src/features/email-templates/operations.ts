import { nowIso, type Clock } from "@jini-ai/core/primitives";

import { isTrashed, type PostKind, type PostRecord, type PostRepoPort } from "../post/index.js";
// Not from the barrel: it re-exports a fixed list, and this kind is not part of the Post API.
import { EMAIL_TEMPLATE_KIND } from "../post/post.js";
import { PageConcurrentEditError, type PagesHtmlDocumentStoreFactory } from "../pages/index.js";
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
} from "./render.js";

/**
 * @file The ONE set of email-template operations — create, edit, list, get, preview and the send
 * render — that both the admin routes (`server/inbound/admin-http/routes/email-templates/`) and the
 * assistant tools (`tool-registrations.ts`) call. Permission checks stay with those two callers, the
 * way the Pages routes and `pages_*` tools each check before reaching the shared store.
 *
 * Storage is the Pages storage, not a parallel system: a template is a `posts` row of kind
 * {@link EMAIL_TEMPLATE_KIND}, written in `"html"` format by the same `PagesHtmlDocumentStore` a
 * bespoke Page is (compare-and-set writes, revision ledger, trash). It is born like a Page too — a
 * plain row, then `ensureHtmlFormat(seed)` — so that store stays the only writer of html bodies.
 */

/** Bounds a template's name; the body is bounded by the routes' JSON body-size limit. */
export const EMAIL_TEMPLATE_NAME_MAX = 200;

export class EmailTemplateNotFoundError extends Error {}
/** The caller's input is malformed; the message says how to fix it. */
export class EmailTemplateInputError extends Error {}
/** `expectedVersion` no longer matches, or another writer landed mid-write. Re-read and retry. */
export class EmailTemplateVersionConflictError extends Error {}

export interface EmailTemplateDeps {
  workspaceId: string;
  postRepo: PostRepoPort;
  pagesHtmlStore: PagesHtmlDocumentStoreFactory;
  clock: Clock;
  idGen: { newId(): string };
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
  /** `"admin"` keeps scripts (render in the sandboxed Pages preview iframe); `"sent"` is the static email. */
  mode: "admin" | "sent";
  scriptsStripped: boolean;
  /** The plain-text alternative, `"sent"` mode only. */
  text?: string;
}

/** A template row: our kind, html format, not in the Trash. */
function isTemplateRow(row: PostRecord | null): row is PostRecord & { bodyHtml: string } {
  return row !== null && (row.kind as string) === EMAIL_TEMPLATE_KIND && row.bodyFormat === "html" && row.bodyHtml !== null && !isTrashed(row);
}

async function loadTemplate({ deps, id }: { deps: EmailTemplateDeps; id: string }, _options: Record<string, never> = {}): Promise<PostRecord & { bodyHtml: string }> {
  const row = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id });
  if (!isTemplateRow(row)) throw new EmailTemplateNotFoundError(`email template '${id}' was not found`);
  return row;
}

function toSummary(row: PostRecord & { bodyHtml: string }, _options: Record<string, never> = {}): EmailTemplateSummary {
  const declarations = readTemplateDeclarations({ html: row.bodyHtml });
  return { id: row.id, name: row.title, subject: declarations.subject, fields: declarations.fields, version: row.version, updatedAt: row.updatedAt };
}

function toDetail(row: PostRecord & { bodyHtml: string }, _options: Record<string, never> = {}): EmailTemplateDetail {
  const summary = toSummary(row);
  return { ...summary, html: row.bodyHtml, undeclaredFields: undeclaredFieldsIn({ html: row.bodyHtml, declarations: summary }) };
}

/** A required, trimmed, bounded string. */
export function requireText({ value, key, max }: { value: unknown; key: string; max: number }, _optional: Record<string, never> = {}): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new EmailTemplateInputError(`${key} is required and must be a non-empty string.`);
  if (text.length > max) throw new EmailTemplateInputError(`${key} must be at most ${max} characters.`);
  return text;
}

/** An optional string; `undefined` when absent. */
function optionalString({ value, key }: { value: unknown; key: string }, _options: Record<string, never> = {}): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new EmailTemplateInputError(`${key} must be a string.`);
  return value;
}

/** Field values: strings, numbers and booleans (stringified); anything else is refused. */
export function readFieldValues({ value }: { value: unknown }, _optional: Record<string, never> = {}): Record<string, string> {
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
function readFieldsInput({ value }: { value: unknown }, _options: Record<string, never> = {}): EmailTemplateField[] {
  if (value === undefined) return [];
  if (typeof value === "string") return parseFieldDeclarations({ content: value });
  if (!Array.isArray(value)) throw new EmailTemplateInputError("fields must be a list of field names.");
  const entries = value.map((entry) => (typeof entry === "string" ? entry : formatFieldObject({ entry: entry })));
  return parseFieldDeclarations({ content: entries.join(",") });
}

function formatFieldObject({ entry }: { entry: unknown }, _options: Record<string, never> = {}): string {
  const record = (entry ?? {}) as { name?: unknown; sample?: unknown };
  if (typeof record.name !== "string") throw new EmailTemplateInputError("each field must be a name or {name, sample}.");
  if (record.name.includes(",") || record.name.includes("=")) throw new EmailTemplateInputError("field names cannot contain commas or equals signs.");
  if (typeof record.sample === "string" && record.sample.includes(",")) throw new EmailTemplateInputError("field samples cannot contain commas.");
  return typeof record.sample === "string" ? `${record.name}=${record.sample}` : record.name;
}

function readExpectedVersion({ value }: { value: unknown }, _options: Record<string, never> = {}): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) throw new EmailTemplateInputError("expectedVersion must be the positive integer version a read returned.");
  return value as number;
}

/** A fresh, `doc`-format template row for `ensureHtmlFormat` to convert, as a new Page is. */
function newTemplateRow({ deps, name }: { deps: EmailTemplateDeps; name: string }, _options: Record<string, never> = {}): PostRecord {
  const id = deps.idGen.newId();
  return {
    id,
    workspaceId: deps.workspaceId,
    title: name,
    // The colon fails `SLUG_FORMAT_PATTERN`, so no Post or Page can ever be given this slug: the row
    // holds a place in the shared unique index without taking a name from the public URL space.
    slug: `email-template:${id}`,
    bodyJson: { type: "doc", content: [] },
    // Forever: `updatePost` refuses this kind, and it is the only path that changes status.
    status: "draft",
    // Not a PostKind on purpose; see EMAIL_TEMPLATE_KIND's own doc.
    kind: EMAIL_TEMPLATE_KIND,
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: nowIso({ clock: deps.clock }),
    version: 1,
  };
}

/**
 * Creates a template: a plain row, then the Pages store's `ensureHtmlFormat` births its HTML body.
 * @param required.input - `{ name, html?, subject?, fields? }`; with no `html`, a starter email is
 *   built from `subject` (default: the name) and `fields`.
 * @throws {EmailTemplateInputError} For a missing name or malformed fields/html.
 */
export async function createEmailTemplate(
  { deps, input, actorId }: { deps: EmailTemplateDeps; input: Record<string, unknown>; actorId: string },
  _optional: Record<string, never> = {},
): Promise<EmailTemplateDetail> {
  const name = requireText({ value: input.name, key: "name", max: EMAIL_TEMPLATE_NAME_MAX });
  const html = optionalString({ value: input.html, key: "html" });
  const subject = optionalString({ value: input.subject, key: "subject" }) ?? name;
  const seed = html ?? emailTemplateSkeleton({ subject, fields: readFieldsInput({ value: input.fields }) });
  const row = newTemplateRow({ deps: deps, name: name });
  // Both adapters join the same kernel transaction, so conversion failure leaves no hidden doc row.
  return deps.postRepo.transaction(async () => {
    await deps.postRepo.save(row);
    await deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: row.id, actorId }, { allowedKinds: new Set([EMAIL_TEMPLATE_KIND]) }).ensureHtmlFormat(seed);
    return toDetail(await loadTemplate({ deps: deps, id: row.id }));
  });
}

/**
 * Replaces a template's whole HTML through the Pages store's compare-and-set write.
 * @param required.input - `{ id, html, expectedVersion? }`; a stated `expectedVersion` must be the
 *   version the write is actually conditioned on, or nothing is written.
 * @throws {EmailTemplateNotFoundError} When `id` is not a live template.
 * @throws {EmailTemplateVersionConflictError} On a stale `expectedVersion` or a concurrent write.
 */
export async function editEmailTemplate(
  { deps, input, actorId }: { deps: EmailTemplateDeps; input: Record<string, unknown>; actorId: string },
  _optional: Record<string, never> = {},
): Promise<EmailTemplateDetail> {
  const id = requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX });
  const html = requireText({ value: input.html, key: "html", max: Number.MAX_SAFE_INTEGER });
  const expectedVersion = readExpectedVersion({ value: input.expectedVersion });
  await loadTemplate({ deps: deps, id: id });
  const store = deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: id, actorId }, { allowedKinds: new Set([EMAIL_TEMPLATE_KIND]) });
  await store.read();
  const basis = store.capturedVersion();
  if (expectedVersion !== undefined && expectedVersion !== basis) {
    throw new EmailTemplateVersionConflictError(`email template '${id}' is at version ${basis}, not ${expectedVersion} — re-read it and retry`);
  }
  try {
    await store.write(html);
  } catch (err) {
    if (err instanceof PageConcurrentEditError) throw new EmailTemplateVersionConflictError(`email template '${id}' was edited elsewhere — re-read it and retry`);
    throw err;
  }
  return toDetail(await loadTemplate({ deps: deps, id: id }));
}

/**
 * Renames a template: only the row's title changes, through the post repo's compare-and-set write,
 * so the HTML body and its revision ledger are untouched. Added for the admin Templates list
 * (2026-10-22); the HTML store has no title of its own, which is why this is not a store write.
 * @param required.input - `{ id, name, expectedVersion? }`.
 * @throws {EmailTemplateNotFoundError} When `id` is not a live template.
 * @throws {EmailTemplateVersionConflictError} On a stale `expectedVersion` or a concurrent write.
 */
export async function renameEmailTemplate(
  { deps, input }: { deps: EmailTemplateDeps; input: Record<string, unknown> },
  _optional: Record<string, never> = {},
): Promise<EmailTemplateDetail> {
  const id = requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX });
  const name = requireText({ value: input.name, key: "name", max: EMAIL_TEMPLATE_NAME_MAX });
  const expectedVersion = readExpectedVersion({ value: input.expectedVersion });
  const row = await loadTemplate({ deps: deps, id: id });
  if (expectedVersion !== undefined && expectedVersion !== row.version) {
    throw new EmailTemplateVersionConflictError(`email template '${id}' is at version ${row.version}, not ${expectedVersion} — re-read it and retry`);
  }
  const record = { ...row, title: name, version: row.version + 1, updatedAt: nowIso({ clock: deps.clock }) };
  const { applied } = await deps.postRepo.saveIfVersion({ record, ifVersion: row.version });
  if (!applied) throw new EmailTemplateVersionConflictError(`email template '${id}' was edited elsewhere — re-read it and retry`);
  return toDetail(await loadTemplate({ deps: deps, id: id }));
}

/** Every live template in the workspace, most recently updated first. */
export async function listEmailTemplates({ deps, input = {} }: { deps: EmailTemplateDeps; input?: { limit?: unknown; cursor?: unknown } }, _optional: Record<string, never> = {}): Promise<{ templates: EmailTemplateSummary[]; nextCursor?: string }> {
  const limit = templatePageLimit({ value: input.limit });
  const before = readTemplateCursor({ value: input.cursor });
  if (!deps.postRepo.listHtmlByKind) throw new Error("Template listing is unavailable.");
  const rows = await deps.postRepo.listHtmlByKind({ workspaceId: deps.workspaceId, kind: EMAIL_TEMPLATE_KIND, limit: limit + 1, ...(before ? { before } : {}) });
  const page = rows.slice(0, limit).filter(isTemplateRow);
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
export async function getEmailTemplate({ deps, id }: { deps: EmailTemplateDeps; id: string }, _optional: Record<string, never> = {}): Promise<EmailTemplateDetail> {
  return toDetail(await loadTemplate({ deps: deps, id: id }));
}

/** The HTML a preview renders: a saved template's, or unsaved HTML straight from the editor. */
async function previewSource(deps: EmailTemplateDeps, input: Record<string, unknown>): Promise<string> {
  if (input.html !== undefined) return requireText({ value: input.html, key: "html", max: Number.MAX_SAFE_INTEGER });
  return (await loadTemplate({ deps: deps, id: requireText({ value: input.id, key: "id", max: EMAIL_TEMPLATE_NAME_MAX }) })).bodyHtml;
}

function readMode({ value }: { value: unknown }, _options: Record<string, never> = {}): "admin" | "sent" {
  if (value === undefined || value === "admin") return "admin";
  if (value === "sent") return "sent";
  throw new EmailTemplateInputError('mode must be "admin" or "sent".');
}

/**
 * Renders a template with `{{field}}` values for the live preview. `"admin"` mode fills declared
 * samples for missing values and keeps scripts (the Pages preview iframe sandboxes them);
 * `"sent"` mode is exactly {@link renderEmailTemplateForSend}'s output, samples unused.
 * @param required.input - `{ id } | { html }`, plus `values?` and `mode?`.
 */
export async function previewEmailTemplate(
  { deps, input }: { deps: EmailTemplateDeps; input: Record<string, unknown> },
  _optional: Record<string, never> = {},
): Promise<EmailTemplatePreview> {
  const mode = readMode({ value: input.mode });
  const values = readFieldValues({ value: input.values });
  const html = await previewSource(deps, input);
  const undeclaredFields = undeclaredFieldsIn({ html, declarations: readTemplateDeclarations({ html }) });
  if (mode === "sent") {
    const sent = renderEmailForSend({ html, values });
    return { ...sent, undeclaredFields, mode, scriptsStripped: true };
  }
  return { ...renderEmailPreview({ html, values }), undeclaredFields, mode, scriptsStripped: false };
}

/**
 * The send-path operation: a saved template + values -> the `subject`/`html`/`text` an
 * `OutboundEmail` carries (static HTML; see `render.ts`'s `renderEmailForSend`). It sends nothing;
 * a mail send path spreads the result into its message alongside `to`/`from`.
 * @param required.values - Field values; a field with none renders empty and is listed in `missingFields`.
 */
export async function renderEmailTemplateForSend(
  { deps, id, values }: { deps: EmailTemplateDeps; id: string; values: EmailFieldValues },
  _optional: Record<string, never> = {},
): Promise<SendableEmail> {
  return renderEmailForSend({ html: (await loadTemplate({ deps: deps, id: id })).bodyHtml, values });
}
