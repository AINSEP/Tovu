/**
 * @file Column mapping for the Google Sheets form destination: which header each form field is
 * written under, where those headers sit in the tab's first row, which new columns a delivery adds,
 * and the row of RAW values one submission becomes.
 *
 * Exists so a spreadsheet's columns never silently change meaning. Fields are identified by their
 * stable field id (`name`); the label is only the header text. The binding's frozen config records
 * which header each already-written field uses, so a label edited later does not move its data,
 * and a field added later becomes a NEW column at the end. A header that should be there but is
 * missing, appears twice, or a first row without the `_tovu_submission_id` column (a tab Tovu did
 * not prepare) is a mapping error the person repairs; nothing is appended into a sheet whose
 * columns cannot be matched. The visitor's IP is never a field, and answers that are not fields of
 * the frozen form are never written.
 */
import { DeliveryRefusal } from './delivery-result.mjs';

export const SUBMISSION_ID_HEADER = '_tovu_submission_id';
export const SUBMITTED_AT_HEADER = '_tovu_submitted_at';

const mappingInvalid = () => new DeliveryRefusal({ code: 'mapping-invalid', retryable: false });

/** One answer as a RAW cell: a checkbox group is joined with ", "; scalars keep their type. @complexity O(items). */
export function cellValue(required, _optional = {}) {
  const { value } = required;
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
}

/**
 * The frozen mapping for one job: the two Tovu columns, then one entry per field of the frozen
 * form. `known` marks headers the sheet must already have (recorded in `tab.columns`).
 * @param {{ form: { fields: readonly { name: string, label?: string }[] }, tab: { columns?: readonly { field: string, header: string }[] } }} required
 * @returns {{ header: string, known: boolean, field?: string, source?: 'id' | 'submittedAt' }[]}
 * @throws {DeliveryRefusal} `mapping-invalid` when two entries would share a header.
 * @complexity O(fields + columns).
 */
export function buildMapping(required, _optional = {}) {
  const recorded = new Map((required.tab.columns ?? []).map((column) => [column.field, column.header]));
  const entries = [
    { header: SUBMISSION_ID_HEADER, known: true, source: 'id' },
    { header: SUBMITTED_AT_HEADER, known: true, source: 'submittedAt' },
    ...required.form.fields.map((field) => ({
      // Trimmed like the sheet's cells are, so stray spaces never decide a match; a blank label falls back to the id.
      field: field.name, known: recorded.has(field.name), header: String(recorded.get(field.name) ?? field.label ?? '').trim() || field.name,
    })),
  ];
  if (new Set(entries.map((entry) => entry.header)).size !== entries.length) throw mappingInvalid();
  return entries;
}

const headerText = (cell) => String(cell ?? '').trim();

/** Every index of `header` in the first row. @complexity O(width). */
function positionsOf(headerRow, header) {
  return headerRow.flatMap((cell, index) => (headerText(cell) === header ? [index] : []));
}

/**
 * Where each mapping entry is written. An empty first row is a fresh tab: every header is new.
 * Otherwise a header found once is used, a header found twice is refused, and a missing header is
 * refused when the sheet should have it (a known field or a Tovu column) and appended otherwise.
 * @param {{ mapping: readonly { header: string, known: boolean }[], headerRow: readonly unknown[] }} required
 * @returns {{ columns: number[], newHeaders: { index: number, header: string }[], width: number }}
 * @throws {DeliveryRefusal} `mapping-invalid` for a duplicated, missing or incompatible header.
 * @complexity O(entries * width).
 */
export function planColumns(required, _optional = {}) {
  const fresh = required.headerRow.every((cell) => headerText(cell) === '');
  const width = fresh ? 0 : required.headerRow.length;
  const newHeaders = [];
  const columns = required.mapping.map((entry) => {
    const positions = fresh ? [] : positionsOf(required.headerRow, entry.header);
    if (positions.length > 1 || (positions.length === 0 && entry.known && !fresh)) throw mappingInvalid();
    if (positions.length === 1) return positions[0];
    newHeaders.push({ index: width + newHeaders.length, header: entry.header });
    return width + newHeaders.length - 1;
  });
  return { columns, newHeaders, width: width + newHeaders.length };
}

/**
 * The appended row: each mapped value at its column, blanks elsewhere (columns of removed fields
 * or someone else's columns stay empty for this row).
 * @param {{ mapping: readonly { field?: string, source?: 'id' | 'submittedAt' }[], columns: readonly number[], width: number, submission: { id: string, submittedAt: string, answers: Readonly<Record<string, unknown>> } }} required
 * @complexity O(width + entries).
 */
export function buildRow(required, _optional = {}) {
  const { mapping, columns, submission } = required;
  const row = Array.from({ length: required.width }, () => '');
  const valueFor = (entry) => {
    if (entry.source) return submission[entry.source];
    // Own keys only: a field id such as `constructor` must not read the prototype.
    return cellValue({ value: Object.hasOwn(submission.answers, entry.field) ? submission.answers[entry.field] : undefined });
  };
  mapping.forEach((entry, index) => { row[columns[index]] = valueFor(entry); });
  return row;
}
