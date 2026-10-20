/**
 * @file The "Choose spreadsheet" panel in the browser: one button that runs the Picker flow, and the
 * list of spreadsheets already chosen (metadata the server verified and saved). Their ids are what a
 * person gives chat or the form-destination panel; a pasted link grants nothing.
 */
import { connectToHost, failureText, h, show } from './dom.mjs';
import { chooseSpreadsheet } from './picker-flow.mjs';
import { CANCELLED_TEXT, pickerIntro, selectedText } from './picker-view.mjs';

const client = connectToHost();
const app = document.getElementById('app');
let status = '';
let waiting = false;
let stopRequested = false;
let picked = [];

function render(bootstrap) {
  const ready = bootstrap !== undefined && bootstrap.mode !== 'unavailable';
  show(app,
    h('p', { class: ready ? 'muted' : 'notice' }, [pickerIntro({ bootstrap })]),
    status ? h('p', { class: 'notice', role: 'status' }, [status]) : null,
    ready ? h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'primary', disabled: waiting, onClick: () => choose(bootstrap) }, ['Choose spreadsheet']),
      waiting && bootstrap.mode === 'system-browser' ? h('button', { type: 'button', onClick: () => { stopRequested = true; status = 'Stopping…'; render(bootstrap); } }, ['Stop waiting']) : null,
    ]) : null,
    h('section', { class: 'card', 'aria-labelledby': 'picked-heading' }, [
      h('h2', { id: 'picked-heading' }, ['Chosen spreadsheets']),
      picked.length === 0 ? h('p', { class: 'muted' }, ['None yet.']) : h('ul', { class: 'list' }, picked.map((sheet) => h('li', {}, [
        h('strong', {}, [sheet.title]), ' ', h('code', {}, [sheet.spreadsheetId]),
      ]))),
    ]));
}

async function refresh(bootstrap) {
  picked = (await client.call({ action: 'list-picked', payload: {} })).spreadsheets;
  render(bootstrap);
}

async function choose(bootstrap) {
  waiting = true;
  stopRequested = false;
  status = '';
  render(bootstrap);
  try {
    // The Choose button stays disabled while waiting; "Stop waiting" stays usable.
    const chosen = await chooseSpreadsheet({ client, bootstrap, onStatus: (text) => { status = text; render(bootstrap); }, stopped: () => stopRequested });
    if (chosen) status = selectedText({ spreadsheet: chosen });
    else status ||= CANCELLED_TEXT;
  } catch (error) {
    status = failureText(error);
  }
  waiting = false;
  await refresh(bootstrap);
}

client.ready.then(() => refresh(client.bootstrap())).catch((error) => show(app, h('p', { class: 'notice' }, [failureText(error)])));
