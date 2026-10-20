/**
 * @file The form-destination panel in the browser: lists each form's saved spreadsheet and tab, and
 * lets a person choose a spreadsheet (a picked one, or the Picker flow), a tab, and save. The server
 * re-verifies the spreadsheet and tab on every save; this file only collects the choice.
 *
 * Saving needs the "rows stay in the spreadsheet" confirmation, because removing a destination here
 * (or deleting a form or submission in Tovu) never deletes rows Google already holds.
 */
import { connectToHost, failureText, h, show } from './dom.mjs';
import { chooseSpreadsheet } from './picker-flow.mjs';
import { CANCELLED_TEXT, EXTERNAL_ROWS_NOTE, pickerIntro } from './picker-view.mjs';

let client;
let app;
let draft;
let view;
let status;
let bootstrap;

const call = (action, payload = {}) => client.call({ action, payload });

/** Runs one server step; its failure becomes the status line. */
async function step(work) {
  try { await work(); } catch (error) { status = failureText(error); }
  render();
}

/** A spreadsheet became the draft's: load its tabs (the server verifies access first). */
async function useSpreadsheet(spreadsheetId) {
  const { spreadsheet, tabs } = await call('list-tabs', { spreadsheetId });
  Object.assign(draft, { spreadsheet, tabs, sheetId: tabs[0]?.sheetId ?? null });
}

function savedList() {
  if (view.destinations.length === 0) return h('p', { class: 'muted' }, ['No form sends to Google Sheets yet.']);
  return h('ul', { class: 'list' }, view.destinations.map((entry) => h('li', { class: 'card' }, [
    h('p', {}, [h('strong', {}, [entry.formSlug]), ` → ${entry.title} / ${entry.tabTitle}`]),
    entry.sameAccount === false ? h('p', { class: 'notice' }, ['Chosen with a different Google account than the one connected now. Choose its spreadsheet again.']) : null,
    h('p', { class: 'muted' }, ['Binding config: ', h('code', {}, [entry.bindingConfigJson])]),
    h('div', { class: 'actions' }, [h('button', { type: 'button', onClick: () => step(async () => { view = await call('remove-destination', { formSlug: entry.formSlug }); status = `Removed ${entry.formSlug}. ${EXTERNAL_ROWS_NOTE}`; }) }, ['Remove'])]),
  ])));
}

function spreadsheetChooser() {
  const options = view.picked.map((sheet) => h('option', { value: sheet.spreadsheetId, ...(draft.spreadsheet?.spreadsheetId === sheet.spreadsheetId ? { selected: true } : {}) }, [sheet.title]));
  return h('div', { class: 'actions' }, [
    view.picked.length > 0 ? h('label', {}, ['Spreadsheet', h('select', { onChange: (event) => step(() => useSpreadsheet(event.target.value)) }, [h('option', { value: '' }, ['Choose…']), ...options])]) : null,
    bootstrap?.mode !== 'unavailable' ? h('button', { type: 'button', onClick: () => step(async () => {
      const chosen = await chooseSpreadsheet({ client, bootstrap, onStatus: (text) => { status = text; render(); } });
      if (chosen === null) { status = CANCELLED_TEXT; return; }
      status = '';
      await useSpreadsheet(chosen.spreadsheetId);
      view = await call('list-destinations');
    }) }, ['Choose another spreadsheet']) : null,
  ]);
}

function tabChooser() {
  if (draft.spreadsheet === null) return null;
  return h('label', {}, ['Tab', h('select', { onChange: (event) => { draft.sheetId = Number(event.target.value); } },
    draft.tabs.map((tab) => h('option', { value: String(tab.sheetId), ...(tab.sheetId === draft.sheetId ? { selected: true } : {}) }, [tab.title])))]);
}

function editor() {
  return h('section', { class: 'card', 'aria-labelledby': 'add-heading' }, [
    h('h2', { id: 'add-heading' }, ['Send a form to a spreadsheet']),
    h('label', {}, ['Form short name', h('input', { type: 'text', value: draft.formSlug, maxlength: '64', autocomplete: 'off', onInput: (event) => { draft.formSlug = event.target.value.trim(); } })]),
    spreadsheetChooser(),
    tabChooser(),
    h('label', { class: 'check' }, [h('input', { type: 'checkbox', ...(draft.confirmed ? { checked: true } : {}), onChange: (event) => { draft.confirmed = event.target.checked; } }), EXTERNAL_ROWS_NOTE]),
    h('div', { class: 'actions' }, [h('button', { type: 'button', class: 'primary', onClick: () => step(async () => {
      view = await call('save-destination', { formSlug: draft.formSlug, spreadsheetId: draft.spreadsheet?.spreadsheetId ?? '', sheetId: draft.sheetId ?? 0, confirmExternalRows: draft.confirmed });
      status = `Saved: ${draft.formSlug} sends to ${draft.spreadsheet?.title ?? 'the spreadsheet'}.`;
    }) }, ['Save destination'])]),
  ]);
}

function render() {
  show(app,
    h('p', { class: 'muted' }, [pickerIntro({ bootstrap })]),
    status ? h('p', { class: 'notice', role: 'status' }, [status]) : null,
    h('section', { class: 'card', 'aria-labelledby': 'saved-heading' }, [h('h2', { id: 'saved-heading' }, ['Saved destinations']), savedList()]),
    editor());
}

/**
 * Starts the panel in a frame: connects to the host and loads the saved destinations once the host's
 * init arrives. Exported so a test can start a fresh panel (fresh draft) in its own jsdom window; the
 * last line starts the real one.
 * @param {{ window: Window, document: Document }} required
 */
export function initDestinationPanel(required) {
  client = connectToHost({ window: required.window });
  app = required.document.getElementById('app');
  draft = { formSlug: '', spreadsheet: null, tabs: [], sheetId: null, confirmed: false };
  view = { destinations: [], picked: [] };
  status = '';
  bootstrap = undefined;
  client.ready.then(() => { bootstrap = client.bootstrap(); return step(async () => { view = await call('list-destinations'); }); });
}

initDestinationPanel({ window, document });
