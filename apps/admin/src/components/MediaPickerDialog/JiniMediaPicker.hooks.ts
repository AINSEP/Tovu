import { useEffect, useRef, useState } from 'react';
import { useHostMediaPicker } from '../../integrations/jini-admin/modules.hooks';
import { authenticatedAdminRequest, type AdminMedia } from '../../lib/api';
import { mediaBasePath } from '../../integrations/jini-admin/media-ports';
import type { MediaPickerDialogProps } from './MediaPickerDialog';
/** The shared dialog is the compatibility boundary for editor, SEO and widget callers.
 * The service selects an asset; the host resolves its CMS fields (notably readable slug)
 * through the same authenticated route, without leaking those fields into the generic port. */
export function useJiniMediaPicker(props: MediaPickerDialogProps, _optional: Record<string, never> = {}) {
  const picker = useHostMediaPicker();
  const enabled = !!picker && !props.useDialog;
  const callbacks = useRef(props); callbacks.current = props;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !picker) return;
    const abort = new AbortController();
    void picker.pick({ accept: [] }, { signal: abort.signal }).then(async selected => {
      if (abort.signal.aborted) return;
      if (!selected) { callbacks.current.onCancel(); return; }
      const result = await authenticatedAdminRequest<{ media: AdminMedia[] }>({ path: mediaBasePath, method: 'GET' }, { signal: abort.signal });
      const row = result.media.find(item => item.id === selected.id && item.status === 'active');
      if (!row) throw new Error('Selected media is unavailable');
      if (!abort.signal.aborted) callbacks.current.onSelect(row);
    }).catch(() => { if (!abort.signal.aborted) setError('Unable to choose media. Please try again.'); });
    return () => abort.abort();
  }, [picker, enabled]);
  return { enabled, error, onCancel: props.onCancel };
}
