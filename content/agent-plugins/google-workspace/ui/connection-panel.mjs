/**
 * @file The connection panel in the browser: renders the handler's panel view (account, products,
 * revocation state) and sends the person's choices as declared actions. All wording comes from
 * `connection-view.mjs`; this file only wires buttons to actions.
 *
 * Sign-ins: the panel is a sandboxed frame that cannot open links or popups, so `sign-in` only asks
 * the server to start one; the admin page above the panel then offers "Continue to sign-in" (in the
 * desktop app it opens the system browser). The panel polls the status until the sign-in finishes or
 * its link expires. The Google Account page (to remove access by hand while a revocation is
 * pending) is opened the same way, through the surface client's `openLink`.
 */
import { connectionSummary, productRows, revocationMessage } from './connection-view.mjs';
import { busy, connectToHost, failureText, h, show, wait } from './dom.mjs';

const client = connectToHost();
const app = document.getElementById('app');
const POLL_MS = 4000;
let notice = null;

const call = (action, payload = {}) => client.call({ action, payload });

/** Polls the status after a sign-in started, until the connection changes or the link expires. */
async function followSignIn(before, expiresAt) {
  while (Date.now() < Date.parse(expiresAt)) {
    await wait(POLL_MS);
    const view = await call('status');
    if (JSON.stringify(view.connection) !== JSON.stringify(before.connection)) return render(view);
  }
  notice = { text: 'The sign-in link expired. Start it again if you still want to change the connection.' };
  return render(await call('status'));
}

/** Runs one action from a button; failures become the notice, never a thrown page error. */
async function run(work) {
  try {
    await busy(app, work);
  } catch (error) {
    notice = { text: failureText(error) };
    render(lastView);
  }
}

const SIGN_IN_ACTIONS = { connect: 'connect', reconnect: 'reconnect', switch: 'switch', grant: 'add-scopes' };

/** What each summary button does. */
function onAction(action, view) {
  if (action in SIGN_IN_ACTIONS) return run(async () => {
    const started = await call('sign-in', { action: SIGN_IN_ACTIONS[action] });
    notice = { text: 'Continue with the "Continue to sign-in" button the admin page shows above this panel. This panel updates when you are done.' };
    render(view);
    await followSignIn(view, started.expiresAt);
  });
  if (action === 'disconnect' || action === 'retry-revocation') return run(async () => {
    const result = await call('disconnect');
    notice = { text: revocationMessage({ revocation: result.revocation }), ok: result.revocation === 'confirmed' };
    render(result);
  });
  return run(async () => { notice = null; render(await call(action)); });
}

/**
 * The Google Account page, opened by the admin page (the frame cannot open links): only this
 * surface's declared `linkOrigins` open. The address stays visible in case the host refuses.
 */
function accountAccessLink(url) {
  const open = () => client.openLink({ url }).catch((error) => { notice = { text: failureText(error) }; render(lastView); });
  return h('p', {}, [
    h('button', { type: 'button', onClick: open }, ['Open Google Account page']),
    ' ', h('span', { class: 'url' }, [url]),
  ]);
}

function connectionCard(view) {
  const summary = connectionSummary({ connection: view.connection });
  const switching = Boolean(view.connection.pendingSwitchAccountLabel);
  return h('section', { class: 'card', 'aria-labelledby': 'account-heading' }, [
    h('h2', { id: 'account-heading' }, [summary.heading]),
    h('p', { class: 'muted' }, [summary.detail]),
    switching && view.destinations.length > 0 ? h('ul', { class: 'list' }, view.destinations.map((entry) => h('li', {}, [`${entry.formSlug}: ${entry.title} / ${entry.tabTitle}`]))) : null,
    h('div', { class: 'actions' }, summary.buttons.map((entry, index) => h('button', { type: 'button', class: index === 0 ? 'primary' : undefined, onClick: () => onAction(entry.action, view) }, [entry.label]))),
    view.connection.status === 'revocation-pending' ? accountAccessLink(view.accountAccessUrl) : null,
  ]);
}

function productsCard(view) {
  const rows = productRows({ products: view.products, connection: view.connection });
  return h('section', { class: 'card', 'aria-labelledby': 'products-heading' }, [
    h('h2', { id: 'products-heading' }, ['Products']),
    h('p', { class: 'muted' }, ['Turning a product on or off changes only what Tovu does; it never changes what Google granted.']),
    h('ul', { class: 'list' }, rows.map((row) => h('li', {}, [
      h('p', {}, [h('strong', {}, [row.label]), ' ', row.note]),
      h('div', { class: 'actions' }, [
        h('button', { type: 'button', 'aria-pressed': String(row.enabled), onClick: () => run(async () => { notice = null; render(await call('set-product', { productId: row.id, enabled: !row.enabled })); }) }, [row.toggleLabel]),
        row.grant ? h('button', { type: 'button', class: 'primary', onClick: () => onAction('grant', view) }, ['Grant permission']) : null,
      ]),
    ]))),
  ]);
}

let lastView = null;

function render(view) {
  lastView = view;
  if (view === null) return show(app, h('p', { class: 'notice' }, [notice?.text ?? 'The panel could not load. Close it and open it again.']));
  return show(app,
    notice ? h('p', { class: notice.ok ? 'notice ok' : 'notice', role: 'status' }, [notice.text]) : null,
    connectionCard(view),
    productsCard(view));
}

client.ready.then(() => call('status')).then(render, (error) => { notice = { text: failureText(error) }; render(null); });
