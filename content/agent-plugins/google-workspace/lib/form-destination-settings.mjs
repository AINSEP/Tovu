/**
 * @file The form-destination choices the destination panel saves in the plugin's settings: per form
 * (by its short name), the spreadsheet and the tab (numeric sheet id) its submissions go to, plus the
 * account the spreadsheet was verified with. Also builds the binding config the Sheets destination
 * reads (`{ spreadsheetId, tabs: { <formSlug>: { sheetId } } }`, see `form-destinations/README.md`).
 *
 * Exists because the plugin cannot write Tovu's form bindings: it keeps the verified choice where the
 * host (and the connection panel's account-switch screen) can read it, and the host copies the
 * binding config into the binding. Values are metadata only, never a token or a cell.
 */
export const FORM_DESTINATIONS_KEY = 'form-destinations';
export const MAX_FORM_DESTINATIONS = 50;

/** A form's short name: also a property name in the stored object, so no `__proto__`-style names. */
export const FORM_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** A stored entry in the shape `saveFormDestination` writes. @complexity O(1). */
function isSaved(entry) {
  return typeof entry?.spreadsheetId === 'string' && Number.isInteger(entry.sheetId) && typeof entry.accountId === 'string';
}

/**
 * The saved destinations, keyed by form slug; malformed entries are dropped.
 * @param {{ state: { get(input: { key: string }): Promise<unknown> } }} required
 * @returns {Promise<Record<string, { spreadsheetId: string, title: string, sheetId: number, tabTitle: string, accountId: string }>>}
 * @complexity O(d), d ≤ 50.
 */
export async function readFormDestinations(required, _optional = {}) {
  const stored = await required.state.get({ key: FORM_DESTINATIONS_KEY });
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([formSlug, entry]) => FORM_SLUG_PATTERN.test(formSlug) && isSaved(entry)));
}

/**
 * Writes the whole destination map (callers add or remove one form's entry on what they just read).
 * @param {{ state: { set: Function }, destinations: Record<string, object> }} required
 * @complexity O(d).
 */
export function writeFormDestinations(required, _optional = {}) {
  return required.state.set({ key: FORM_DESTINATIONS_KEY, value: required.destinations });
}

/**
 * The binding config for one saved destination, as the Sheets destination reads it.
 * @param {{ formSlug: string, destination: { spreadsheetId: string, sheetId: number } }} required
 * @returns {{ spreadsheetId: string, tabs: Record<string, { sheetId: number }> }}
 * @complexity O(1).
 */
export function bindingConfigFor(required, _optional = {}) {
  const { formSlug, destination } = required;
  return { spreadsheetId: destination.spreadsheetId, tabs: { [formSlug]: { sheetId: destination.sheetId } } };
}
