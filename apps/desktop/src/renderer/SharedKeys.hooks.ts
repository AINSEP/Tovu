/** Metadata-only Shared Keys state. Secrets are passed through once and never enter React state. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwnerStoreBridge, OwnerStoreEntry, OwnerStoreReply } from '../contracts/owner-store.js';
import { ownerStoreBridge } from './runner-api.js';

const FAILED = 'The shared-key operation failed. Refresh and try again.';

/** Fixed copy ignores arbitrary reply/transport messages that might contain submitted secrets.
 * @complexity O(1); no effects.
 */
function failureText({ code }: { code: string }, _options = {}): string {
  const messages: Record<string, string> = {
    'recovery-required': 'Restore the original owner.key, or restore an encrypted backup into an empty owner store.',
    'invalid-backup': 'Check the encrypted backup and passphrase.',
    'not-empty': 'Restore requires an empty owner store.',
    conflict: 'This key changed. Refresh before replacing it.',
    cancelled: 'The backup dialog was cancelled.',
    timeout: 'The operation timed out. Refresh before retrying.',
  };
  return messages[code] ?? FAILED;
}

/** Preserve committed saves when a legacy site copy fails; never claim propagation succeeded.
 * @complexity O(s+r) for s site replies and r copy results; no effects or payload reads.
 */
function successText({ reply }: { reply: Extract<OwnerStoreReply, { ok: true }> }, _options = {}): string {
  const copyFailed = reply.sync?.some(attempt => !attempt.reply.ok || attempt.reply.data.results.some(row => row.status === 'failed'));
  if (reply.syncError || copyFailed) return 'Saved. Some existing site copies could not be updated. Refresh before retrying.';
  const messages: Partial<Record<OwnerStoreReply['action'], string>> = {
    put: 'Saved to your project. Site usage is unavailable in this version.',
    export: 'Encrypted backup exported.', restore: 'Encrypted backup restored.',
  };
  return messages[reply.action] ?? 'Done.';
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
    if (!bridge || pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action) {
        const reply = await action();
        if (!mounted.current) return;
        if (!reply.ok) { setError(failureText({ code: reply.error.code })); return; }
        setMessage(successText({ reply }));
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
