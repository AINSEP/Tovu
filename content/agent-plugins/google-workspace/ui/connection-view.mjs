/**
 * @file What the connection panel says and offers for each connection state: pure functions from
 * the handler's panel view to text and buttons, with no DOM, so the honesty rules are testable.
 *
 * Exists because the wording IS the security property here: a revocation Google has not confirmed
 * must read "Disconnected locally; Google revocation pending" (never "revoked"), turning a product
 * off must not read like removing Google's permission, and a staged account switch must name the
 * new account before anything changes.
 */

export const REVOCATION_PENDING_TEXT = 'Disconnected locally; Google revocation pending';

const REVOCATION_TEXT = Object.freeze({
  confirmed: 'Disconnected. Google confirmed that Tovu\'s access to the account was removed.',
  pending: `${REVOCATION_PENDING_TEXT}. Tovu no longer uses this sign-in, but Google has not confirmed removing its access. Retry below, or remove Tovu's access yourself on your Google Account page.`,
  'not-needed': 'Disconnected. There was no Google access left to remove.',
});

/** Shown while a switch is staged: the plugin cannot read Tovu's form bindings, so it says so. */
export const SWITCH_NOTE = 'This panel cannot see which form bindings use this sign-in. After the switch, the Google Workspace tools and every form destination that uses this sign-in act as the new account, which may not be able to open spreadsheets chosen with the old one. Review the destinations listed here and choose their spreadsheets again if needed.';

const button = (action, label) => ({ action, label });

const STATES = Object.freeze({
  disconnected: () => ({ heading: 'Not connected', detail: 'Connect a Google account to let Tovu work with the spreadsheets you choose or create. Tovu asks only for access to files you pick or it creates.', buttons: [button('connect', 'Connect Google account')] }),
  connected: ({ accountLabel }) => ({ heading: `Connected as ${accountLabel ?? 'a Google account'}`, detail: 'Reconnect keeps this account and its settings. Switch account asks you to confirm the new account before anything changes.', buttons: [button('reconnect', 'Reconnect'), button('switch', 'Switch account'), button('disconnect', 'Disconnect and revoke')] }),
  'reconnect-required': () => ({ heading: 'Reconnect required', detail: 'Google no longer accepts the saved sign-in. Form submissions waiting to be delivered are kept; reconnect the same account to continue.', buttons: [button('reconnect', 'Reconnect'), button('disconnect', 'Disconnect and revoke')] }),
  'revocation-pending': () => ({ heading: REVOCATION_PENDING_TEXT, detail: REVOCATION_TEXT.pending, buttons: [button('retry-revocation', 'Retry Google revocation'), button('connect', 'Connect again')] }),
});

/**
 * Heading, explanation and buttons for the connection; a staged switch takes precedence.
 * @param {{ connection: { status: string, accountLabel?: string, pendingSwitchAccountLabel?: string } }} required
 * @returns {{ heading: string, detail: string, buttons: Array<{ action: string, label: string }> }}
 * @complexity O(1).
 */
export function connectionSummary(required, _optional = {}) {
  const { connection } = required;
  if (connection.pendingSwitchAccountLabel) {
    return {
      heading: `Switch to ${connection.pendingSwitchAccountLabel}?`,
      detail: `Signed in now as ${connection.accountLabel ?? 'the current account'}. Nothing changes until you confirm. ${SWITCH_NOTE}`,
      buttons: [button('confirm-switch', `Use ${connection.pendingSwitchAccountLabel}`), button('cancel-switch', 'Keep the current account')],
    };
  }
  return (STATES[connection.status] ?? STATES.disconnected)(connection);
}

/**
 * The sentence after a disconnect, exactly as the host reported the remote outcome.
 * @param {{ revocation: 'confirmed' | 'pending' | 'not-needed' }} required
 * @returns {string} An unknown value reads as pending: never claim a revocation nobody confirmed.
 * @complexity O(1).
 */
export function revocationMessage(required, _optional = {}) {
  return REVOCATION_TEXT[required.revocation] ?? REVOCATION_TEXT.pending;
}

/** A product's state line: on/off is a setting; Google's permission is a separate fact. @complexity O(1). */
function productNote(product, connected) {
  if (!product.enabled) return 'Off. Its tools and form deliveries are paused; the Google sign-in and its permissions are kept.';
  if (!connected) return 'On. Connect a Google account to use it.';
  return product.granted ? 'On. Google has granted the permission it needs.' : 'On, but Google has not granted its permission yet. Grant it to use this product.';
}

/**
 * One row per product: label, note, the on/off toggle and, when on but not granted, the separate
 * "Grant permission" sign-in.
 * @param {{ products: Array<{ id: string, label: string, enabled: boolean, granted: boolean }>, connection: { status: string } }} required
 * @returns {Array<{ id: string, label: string, note: string, enabled: boolean, toggleLabel: string, grant: boolean }>}
 * @complexity O(p).
 */
export function productRows(required, _optional = {}) {
  const connected = required.connection.status === 'connected';
  return required.products.map((product) => ({
    id: product.id, label: product.label, enabled: product.enabled, note: productNote(product, connected),
    toggleLabel: product.enabled ? `Turn ${product.label} off` : `Turn ${product.label} on`,
    grant: connected && product.enabled && !product.granted,
  }));
}
