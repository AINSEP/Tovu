import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import type { Translate } from '@jini-ai/ui/panel-kit';
import { api, type AdminCredentialCopySource, type AdminCredentialCopyResult } from '@/lib/api';
import { publishContentRefresh } from '@/lib/content-refresh-bus';
import { ACCESS_TOKENS_RESOURCE } from '../rules';

export type CopyKeysPort = Pick<typeof api, 'listCredentialCopySources' | 'copyCredentials'>;
const SHARED_KEYS = 'shared-keys';
const LOAD_FAILED = "Couldn't load Shared Keys. Open Shared Keys and try again. Details: P25_KEY_PICKER_LOAD_FAILED; secret values omitted.";
const GRANT_FAILED = 'Using the saved key failed. Reopen Shared Keys and choose the key again. Details: P25_KEY_GRANT_FAILED; secret values omitted.';

/** Present metadata-only key choices; this never reads or copies credential values. */
function copyKeyRows({ source, credentialId }: { source: AdminCredentialCopySource | undefined; credentialId: string }) {
  return (source?.keys ?? []).map(key => ({ id: key.id, checked: key.id === credentialId,
    text: `${key.label} · ${key.provider ?? key.kind}`, worksFor: (key.worksFor ?? []).join(', ') }));
}

/** One metadata read per open, one reference per approval, no source-site discovery or key copies.
 * @returns The existing dialog controller with secret-free labels and outcomes.
 * @complexity O(k) time/space per open for at most 50 owner metadata rows; no background polling.
 */
export function useCopyKeys({ t }: { t: Translate }, { port = api }: { port?: CopyKeysPort } = {}) {
  const client = useRef(port).current;
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<AdminCredentialCopySource>();
  const [credentialId, setCredentialId] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<AdminCredentialCopyResult[]>([]);
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    client.listCredentialCopySources({}).then(({ sources }) => {
      if (live) setSource(sources.find(row => row.siteId === SHARED_KEYS));
    }).catch(() => { if (live) setError(LOAD_FAILED); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client, open]);
  const selected = source?.keys.find(key => key.id === credentialId);
  const disabled = loading || pending || !selected;
  const show = (event: Pick<MouseEvent<HTMLButtonElement>, 'currentTarget'>) => {
    event.currentTarget.focus({ preventScroll: true });
    setSource(undefined); setCredentialId(''); setResults([]); setError(''); setOpen(true);
  };
  const cancel = () => { if (!busy.current) setOpen(false); };
  const changeKey = (event: ChangeEvent<HTMLInputElement>) => {
    setCredentialId(event.currentTarget.checked ? event.currentTarget.value : '');
  };
  const submit = async (event: Pick<FormEvent<HTMLFormElement>, 'preventDefault'>) => {
    event.preventDefault();
    if (disabled || busy.current) return;
    busy.current = true; setPending(true); setError(''); setResults([]);
    try {
      const response = await client.copyCredentials({ sourceSiteId: SHARED_KEYS, ids: [credentialId], overwrite: false });
      setResults(response.results);
      publishContentRefresh([ACCESS_TOKENS_RESOURCE]);
    } catch { setError(GRANT_FAILED); }
    finally { busy.current = false; setPending(false); }
  };
  return { open, show, cancel, submit, loading, pending, disabled, changeKey,
    empty: !loading && !source?.keys.length,
    error: error ? t(error) : '',
    keys: copyKeyRows({ source, credentialId }),
    results: results.map((result, index) => ({ key: `${result.id}:${index}`,
      text: result.status === 'granted' ? t('Granted to this site') : t(GRANT_FAILED) })),
  };
}

export type CopyKeysController = ReturnType<typeof useCopyKeys>;
/** Browser and desktop use the same owner-authenticated HTTP port. */
export function useWiredCopyKeys(required: { t: Translate }): CopyKeysController {
  return useCopyKeys(required, { port: api });
}
