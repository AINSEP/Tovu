import { useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHostMediaPicker } from '../../integrations/jini-admin/modules.hooks';
import { defaultMediaPickerPort } from './media-picker-dependencies.hooks';
import type { MediaPickerPort } from './media-picker-port.hooks';
import type { MediaPickerDialogProps } from './MediaPickerDialog';
/** The shared dialog is the compatibility boundary for editor, SEO and widget callers.
 * The service selects an asset; the host resolves its CMS fields (notably readable slug)
 * through the same authenticated route, without leaking those fields into the generic port. */
export function useJiniMediaPicker(props: MediaPickerDialogProps, { port = defaultMediaPickerPort }: { port?: MediaPickerPort } = {}) {
  const picker = useHostMediaPicker();
  const key = useMemo(() => ["media"] as const, []);
  const fetchMedia = useCallback(() => port.listMedia(), [port]);
  const media = useCachedLoader({ key, fetch: fetchMedia }, { staleTime: 0 });
  const enabled = !!picker && !props.useDialog;
  const callbacks = useRef(props); callbacks.current = props;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !picker) return undefined;
    const abort = new AbortController();
    void picker.pick({ accept: callbacks.current.accept ?? [] }, { signal: abort.signal }).then(async selected => {
      if (abort.signal.aborted) return;
      if (!selected) { callbacks.current.onCancel(); return; }
      const rows = await media.load();
      const row = rows.media.find(item => item.id === selected.id && item.status === 'active');
      if (!row) throw new Error('Selected media is unavailable');
      if (!abort.signal.aborted) callbacks.current.onSelect(row);
    }).catch(() => { if (!abort.signal.aborted) setError('Unable to choose media. Please try again.'); });
    return () => abort.abort();
  }, [picker, enabled, media]);
  return { enabled, error, onCancel: props.onCancel };
}
