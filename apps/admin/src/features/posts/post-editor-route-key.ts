/**
 * @file Keeps the post editor mounted when its own save renames the slug in the URL.
 *
 * Since `0e8ca8ac7` an untitled post's slug follows its title until first publish, so the first save
 * usually moves the post from `/posts/untitled-6` to `/posts/my-title`. The editor replace-navigates
 * to the new slug so a reload, a new tab, or a shared link still finds the post — the old slug 404s.
 * `panels.tsx` keys `<PostEditor>` by the URL segment (a remount per record — see the comment there),
 * so without this the rename would remount the editor right after the save: the "Saved" message,
 * undo history and anything typed while the save was in flight would be thrown away. A rename records
 * `to → key of from`, so the panel keeps the same key for the same record.
 */

const renamedRouteKeys = new Map<string, string>();

/** The `key` `panels.tsx` gives `<PostEditor>` for this URL segment. */
export function postEditorRouteKey(segment: string): string {
  return renamedRouteKeys.get(segment) ?? segment;
}

/** Records that the editor at `from` is now addressed by `to` (its own save renamed the slug). */
export function rememberPostEditorRouteRename({ from, to }: { from: string; to: string }): void {
  if (from !== to) renamedRouteKeys.set(to, postEditorRouteKey(from));
}
