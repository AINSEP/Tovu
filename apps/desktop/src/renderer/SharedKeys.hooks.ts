/** Metadata-only Shared Keys state. Secrets are passed through once and never enter React state. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LegacyImportReport, OwnerStoreBridge, OwnerStoreEntry, OwnerStoreReply } from '../contracts/owner-store.js';
import { ownerStoreBridge } from './runner-api.js';

const FAILED = 'The shared-key operation failed. Refresh and try again.';

/** Fixed copy ignores arbitrary reply/transport messages that might contain submitted secrets.
 * @complexity O(1); no effects.
 */
function failureText({ code }: { code: string }, _options = {}): string {
  const messages: Record<string, string> = {
    'recovery-required': 'The older key store needs its original owner.key. Restore it, or import a backup.',
    'invalid-backup': 'Check the encrypted backup and passphrase.',
    conflict: 'This key changed. Refresh before replacing it.',
    cancelled: 'The import was cancelled.',
    timeout: 'The operation timed out. Refresh before retrying.',
  };
  return messages[code] ?? FAILED;
}

/** Import feedback counts the report; sites never change, so their copies are only mentioned.
 * @complexity O(i) for i report items; no effects or payload reads.
 */
function importText({ report }: { report: LegacyImportReport }, _options = {}): string {
  const imported = report.items.filter(item => item.status === 'imported').length;
  if (!report.applied || imported === 0) return 'Nothing new to import.';
  const keys = `Imported ${imported} key${imported === 1 ? '' : 's'}.`;
  return report.pending.length ? `${keys} Sites that had copies keep them.` : keys;
}

/** Fixed copy per action; a save never claims any site uses or received the key.
 * @complexity O(i) for an import report; O(1) otherwise.
 */
function successText({ reply }: { reply: Extract<OwnerStoreReply, { ok: true }> }, _options = {}): string {
  if (reply.action === 'import') return importText({ report: reply.data as LegacyImportReport });
  return reply.action === 'put' ? 'Saved to your project. Site usage is unavailable in this version.' : 'Done.';
}

/** One inventory read per open/refresh; one in-flight action, including refresh after mutations.
 * @param input Explicit renderer bridge; undefined handles stale preloads without IPC.
 * @returns Metadata, fixed feedback and an action runner. No secret or passphrase is retained.
 * @complexity O(e) inventory memory for e entries; one bounded main-process request at a time.
 * @example useSharedKeys({ bridge: ownerStoreBridge({}) }, {})
 */
export function useSharedKeys({ bridge = ownerStoreBridge({}) }: { bridge?: OwnerStoreBridge } = {}, _options = {}) {
  const [entries, setEntries] = useState<OwnerStoreEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(false);

  /** Metadata refresh errors withdraw the inventory so stale revisions cannot be replaced. */
  const read = useCallback(async () => {
    if (!bridge) return;
    const reply = await bridge.list({ store: 'project' }, {});
    if (!mounted.current) return;
    if (!reply.ok) {
      setEntries([]); setLoaded(false); setError(failureText({ code: reply.error.code })); return;
    }
    setEntries(reply.data.entries); setLoaded(true);
  }, [bridge]);

  /** Ref guard closes the same-render double-click gap; opaque throws never reach UI/logs. */
  const run = useCallback(async ({ action }: { action?: () => Promise<OwnerStoreReply> } = {}, _options = {}) => {
    function applyActionReply({ reply }: { reply: OwnerStoreReply }, _options = {}): boolean {
      if (!mounted.current) return false;
      if (!reply.ok) { setError(failureText({ code: reply.error.code })); return false; }
      setMessage(successText({ reply }));
      return true;
    }
    if (!bridge || pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action) {
        if (!applyActionReply({ reply: await action() })) return;
      }
      await read();
    } catch {
      if (mounted.current) { setEntries([]); setLoaded(false); setError(FAILED); }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [bridge, read]);

  useEffect(() => {
    mounted.current = true;
    void run();
    return () => { mounted.current = false; };
  }, [run]);
  return { entries, loaded, busy, message, error, available: bridge !== undefined, run };
}
