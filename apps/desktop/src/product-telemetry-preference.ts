/** Install consent shares the existing durable desktop preferences, never site settings. */
import { randomUUID } from 'node:crypto';
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { createProductConsentReader, type ProductConsent } from '../../website/src/server/runtime/composition/product-telemetry.ts';

export { createProductConsentReader };
export interface ProductTelemetryPreference extends ProductConsent { decidedAt: string | null }
interface ConsentMenuItem { type: 'checkbox'; label: string; checked: boolean; toolTip: string; click(item: { checked: boolean }): void }
const OFF: ProductTelemetryPreference = Object.freeze({ crashes: false, usage: false, installationId: null, decidedAt: null });

/** Preserve sibling preferences only when the stored root is an object. O(1), no effects. */
function preferenceSettings({ value }: { value: unknown }, _options = {}): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Missing, unreadable and malformed consent never grants permission. O(1) fields, O(n) file read. */
export function readProductTelemetryPreference({ preferencePath }: { preferencePath: string }, _options = {}): ProductTelemetryPreference {
  const read = readJsonFile(preferencePath);
  if (read.state !== 'ok') return { ...OFF };
  const value = (read.value as { productTelemetry?: Partial<ProductTelemetryPreference> } | null)?.productTelemetry;
  return { crashes: value?.crashes === true, usage: value?.usage === true,
    installationId: typeof value?.installationId === 'string' ? value.installationId : null,
    decidedAt: typeof value?.decidedAt === 'string' ? value.decidedAt : null };
}

/** Locked read/modify/write preserves sibling settings and the other instance's latest switch.
 * Unreadable bytes are preserved; a failed write throws before behavior changes.
 * @returns The persisted record. @complexity O(n) preference bytes plus the existing bounded lock.
 */
export function writeProductTelemetryPreference({ preferencePath, patch }: {
  preferencePath: string; patch: Partial<Pick<ProductConsent, 'crashes' | 'usage'>>;
}, { uuid = randomUUID, now = () => new Date().toISOString() }: { uuid?: () => string; now?: () => string } = {}): ProductTelemetryPreference {
  return withFileLock(preferencePath, () => {
    const read = readJsonFile(preferencePath);
    if (read.state === 'unreadable') throw new Error('DESKTOP_PREFERENCES_UNREADABLE');
    const settings = preferenceSettings({ value: read.state === 'ok' ? read.value : undefined });
    const current = readProductTelemetryPreference({ preferencePath });
    const crashes = patch.crashes ?? current.crashes;
    const usage = patch.usage ?? current.usage;
    const next = { crashes, usage, installationId: crashes || usage ? current.installationId ?? uuid() : null, decidedAt: now() };
    writeJsonFileAtomic(preferencePath, { ...settings, productTelemetry: next });
    return next;
  });
}

/** Native dialog buttons; Escape/window close has its own cancel index and records no decision. */
export const PRODUCT_CONSENT_DIALOG = Object.freeze({
  type: 'question' as const, title: 'Help improve Tovu', message: 'Share diagnostics and usage with Tovu?',
  detail: "Reports go to Tovu's makers, never your sites' content, keys, files or prompts. Error text is redacted. Native crash reports include a snapshot of process memory, which may contain sensitive information. Usage includes screens, actions and memory measurements. You can change either choice in Settings. Turning sharing off does not delete reports already sent.",
  buttons: ['Send crash reports and usage', 'Crash reports only', "Don't send"],
  defaultId: 2, cancelId: 3, noLink: true,
});

/** Ask once after the first window shows; closing writes nothing and asks again next launch.
 * @returns Whether a choice was persisted; dialog/write errors propagate to the host notice.
 * @complexity O(1) beyond the injected native dialog and preference I/O.
 */
export async function offerProductTelemetryConsent({ active, preference, show, save }: {
  active: boolean; preference: ProductTelemetryPreference;
  show: (options: typeof PRODUCT_CONSENT_DIALOG) => Promise<{ response: number }>;
  save: (patch: Pick<ProductConsent, 'crashes' | 'usage'>) => void;
}, _options = {}): Promise<boolean> {
  if (!active || preference.decidedAt !== null) return false;
  const { response } = await show(PRODUCT_CONSENT_DIALOG);
  if (response < 0 || response > 2) return false;
  save({ crashes: response !== 2, usage: response === 0 });
  return true;
}

/** Persist first, then apply. Failed persistence restores the checkbox and leaves effects alone.
 * @returns Two native checkbox descriptors. @complexity O(1), effects supplied by the caller.
 */
export function productTelemetryMenu({ preference, save, changed, onError }: {
  preference: ProductTelemetryPreference;
  save: (patch: Partial<Pick<ProductConsent, 'crashes' | 'usage'>>) => ProductTelemetryPreference;
  changed: (preference: ProductTelemetryPreference) => void;
  onError: () => void;
}, _options = {}): ConsentMenuItem[] {
  return (['crashes', 'usage'] as const).map(key => {
    let checked = preference[key];
    return { type: 'checkbox' as const, label: key === 'crashes' ? 'Send crash reports to Tovu' : 'Send usage statistics to Tovu',
      checked, toolTip: 'Already queued events may send for up to 10 seconds. Native crash collection starts after restart.',
      click(item: { checked: boolean }) {
        let saved: ProductTelemetryPreference;
        try { saved = save({ [key]: item.checked }); }
        catch { item.checked = checked; onError(); return; }
        checked = saved[key];
        item.checked = checked;
        changed(saved);
      } };
  });
}
