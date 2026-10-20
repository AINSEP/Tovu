/**
 * @file Range helpers of the Sheets admin tools: column letters, a person-readable label for a
 * Sheets `GridRange` (what the confirmation card shows), and the strict `A1:B2` parser the CSV
 * export uses to plan bounded reads.
 *
 * Exists so the card says "tab 0, rows 2-10, columns A-D" instead of raw zero-based indices, and so
 * the export can bound its reads before it sends any: only a plain two-corner A1 range is accepted.
 */
import { GoogleWorkspaceError } from './request-policy.mjs';

/** 0 → A, 25 → Z, 26 → AA. @complexity O(log n). */
export function columnLetters(required, _optional = {}) {
  let letters = '';
  for (let n = required.index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/** A → 0, AA → 26. @complexity O(length). */
function columnIndex(letters) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** "rows 2-10", "rows 2 onward" or "all rows" for zero-based [start, end). @complexity O(1). */
function span(name, start, end, show) {
  if (start === undefined && end === undefined) return `all ${name}`;
  const first = show(start ?? 0);
  return end === undefined ? `${name} ${first} onward` : `${name} ${first}-${show(end - 1)}`;
}

/**
 * The card label of a `GridRange`: `tab 0, rows 2-10, columns A-D`.
 * @param {{ range: { sheetId: number, startRowIndex?: number, endRowIndex?: number, startColumnIndex?: number, endColumnIndex?: number } }} required
 * @complexity O(1).
 */
export function gridRangeLabel(required, _optional = {}) {
  const { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } = required.range;
  const rows = span('rows', startRowIndex, endRowIndex, (index) => String(index + 1));
  const columns = span('columns', startColumnIndex, endColumnIndex, (index) => columnLetters({ index }));
  return `tab ${sheetId}, ${rows}, ${columns}`;
}

const A1_RANGE = /^([A-Z]{1,3})([1-9]\d{0,6}):([A-Z]{1,3})([1-9]\d{0,6})$/;

/**
 * Zero-based inclusive bounds of a two-corner A1 range such as `B2:F200`.
 * @returns {{ firstRow: number, lastRow: number, firstColumn: number, lastColumn: number }}
 * @throws {GoogleWorkspaceError} `invalid-input` for anything else, including reversed corners.
 * @complexity O(1).
 */
export function parseA1Range(required, _optional = {}) {
  const match = A1_RANGE.exec(required.range);
  const bounds = match && { firstColumn: columnIndex(match[1]), firstRow: Number(match[2]) - 1, lastColumn: columnIndex(match[3]), lastRow: Number(match[4]) - 1 };
  if (!bounds || bounds.lastRow < bounds.firstRow || bounds.lastColumn < bounds.firstColumn) {
    throw new GoogleWorkspaceError({ code: 'invalid-input' }, { detail: 'range must look like A1:D200, top-left corner first' });
  }
  return bounds;
}
