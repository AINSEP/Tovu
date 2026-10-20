/**
 * @file An in-memory Google Sheets grid served by the local Google fake (`fake-google-http.mjs`),
 * for the form-delivery tests: spreadsheet metadata, values get/update/append and the
 * `appendDimension` batch request, over 1-based rows of cells per tab.
 *
 * Exists so the Sheets form destination is exercised against the real request shapes it sends
 * (encoded A1 ranges, RAW input, INSERT_ROWS appends) without any network beyond 127.0.0.1. Like
 * Google, a write past the grid's columns is refused, an append lands after the last non-empty
 * row, and value reads omit trailing blanks. Requests without the expected access token get 401.
 */

/** `'Tab ''x'''!A2:B9` → `{ title, c1, r1, c2, r2 }` (0-based columns, 1-based rows; open ends undefined). */
function parseRange(raw) {
  const match = /^'((?:[^']|'')*)'!(.*)$/.exec(raw);
  const title = match[1].replaceAll("''", "'");
  const [start, end = start] = match[2].split(':');
  const cell = (text) => {
    const parts = /^([A-Z]*)(\d*)$/.exec(text);
    const column = parts[1] ? [...parts[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1 : undefined;
    return { column, row: parts[2] ? Number(parts[2]) : undefined };
  };
  const a = cell(start);
  const b = cell(end);
  return { title, c1: a.column ?? 0, r1: a.row ?? 1, c2: b.column, r2: b.row };
}

const columnLetters = (index) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const trimRow = (row) => {
  const copy = [...row];
  while (copy.length > 0 && (copy.at(-1) === '' || copy.at(-1) === undefined)) copy.pop();
  return copy;
};

/**
 * Installs one spreadsheet on the fake.
 * @param {{ fake: { routePrefix: Function }, spreadsheetId: string, token: string, tabs: { sheetId: number, title: string, rowCount?: number, columnCount?: number, rows?: Record<number, unknown[]> }[] }} required
 * @returns {{ tab(sheetId: number): { title: string, rowCount: number, columnCount: number, rows: Map<number, unknown[]> }, rowsOf(sheetId: number): unknown[][], failNext: { status: number, headers?: Record<string, string>, body?: unknown } | undefined }}
 */
export function installSheetsGrid(required) {
  const { fake, spreadsheetId, token } = required;
  const tabs = required.tabs.map((tab) => ({
    sheetId: tab.sheetId, title: tab.title, rowCount: tab.rowCount ?? 1000, columnCount: tab.columnCount ?? 26,
    rows: new Map(Object.entries(tab.rows ?? {}).map(([row, cells]) => [Number(row), [...cells]])),
  }));
  const grid = {
    failNext: undefined,
    tab: (sheetId) => tabs.find((tab) => tab.sheetId === sheetId),
    /** Non-empty rows in order, trailing blanks trimmed. */
    rowsOf: (sheetId) => [...grid.tab(sheetId).rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => trimRow(row)).filter((row) => row.length > 0),
  };
  const prefix = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const byTitle = (title) => tabs.find((tab) => tab.title === title);

  function readValues(tab, range) {
    const last = Math.min(range.r2 ?? tab.rowCount, tab.rowCount);
    const values = [];
    for (let row = range.r1; row <= last; row += 1) {
      const cells = tab.rows.get(row) ?? [];
      values.push(trimRow(cells.slice(range.c1, range.c2 === undefined ? undefined : range.c2 + 1)));
    }
    while (values.length > 0 && values.at(-1).length === 0) values.pop();
    return values;
  }

  function writeRow(tab, rowNumber, column, cells) {
    const row = tab.rows.get(rowNumber) ?? [];
    cells.forEach((value, offset) => { row[column + offset] = value; });
    tab.rows.set(rowNumber, row);
  }

  function append(tab, values) {
    const lastRow = Math.max(0, ...[...tab.rows.entries()].filter(([, row]) => trimRow(row).length > 0).map(([n]) => n));
    const target = lastRow + 1;
    // INSERT_ROWS: the grid grows by the inserted rows.
    tab.rowCount += values.length;
    values.forEach((cells, offset) => writeRow(tab, target + offset, 0, cells));
    const width = Math.max(...values.map((cells) => cells.length));
    return { updates: { updatedRange: `'${tab.title}'!A${target}:${columnLetters(width - 1)}${target + values.length - 1}`, updatedRows: values.length } };
  }

  function batchUpdate(body) {
    for (const request of body.requests) {
      const tab = grid.tab(request.appendDimension.sheetId);
      tab.columnCount += request.appendDimension.length;
    }
    return {};
  }

  function values(req, body, url) {
    const [encoded, method] = url.pathname.slice(`${prefix}/values/`.length).split(':');
    const range = parseRange(decodeURIComponent(encoded));
    const tab = byTitle(range.title);
    if (!tab) return [400, { error: { code: 400, status: 'INVALID_ARGUMENT' } }];
    if (req.method === 'GET') return [200, { range: decodeURIComponent(encoded), majorDimension: 'ROWS', values: readValues(tab, range) }];
    const payload = JSON.parse(body);
    if (method === 'append') return [200, append(tab, payload.values)];
    if (range.c1 + payload.values[0].length > tab.columnCount) return [400, { error: { code: 400, status: 'INVALID_ARGUMENT' } }];
    writeRow(tab, range.r1, range.c1, payload.values[0]);
    return [200, { updatedRange: decodeURIComponent(encoded) }];
  }

  function handle(req, body, url) {
    if (req.headers.authorization !== `Bearer ${token}`) return [401, { error: { code: 401, status: 'UNAUTHENTICATED' } }];
    if (grid.failNext) {
      const failure = grid.failNext;
      grid.failNext = undefined;
      return [failure.status, failure.body ?? { error: { code: failure.status } }, failure.headers];
    }
    if (url.pathname === prefix && req.method === 'GET') {
      return [200, { sheets: tabs.map((tab) => ({ properties: { sheetId: tab.sheetId, title: tab.title, gridProperties: { rowCount: tab.rowCount, columnCount: tab.columnCount } } })) }];
    }
    if (url.pathname === `${prefix}:batchUpdate`) return [200, batchUpdate(JSON.parse(body))];
    return values(req, body, url);
  }

  for (const method of ['GET', 'PUT', 'POST']) fake.routePrefix({ method, prefix }, handle);
  return grid;
}
